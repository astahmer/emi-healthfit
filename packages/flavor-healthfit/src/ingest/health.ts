import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type {
  BodyMetricRow,
  DailyActivityRow,
  HealthWorkoutRow,
  SleepSessionRow,
} from "../db/schema.ts";
import { decodeJson } from "../lib/json-codec.ts";

export class HealthExportParseError extends Schema.TaggedErrorClass<HealthExportParseError>()(
  "HealthExportParseError",
  { phase: Schema.Literals(["json", "schema"]), message: Schema.String },
) {}

const HealthDailyActivity = Schema.Struct({
  date: Schema.String,
  activeEnergyKcal: Schema.OptionFromOptional(Schema.Number),
  steps: Schema.OptionFromOptional(Schema.Number),
  distanceKm: Schema.OptionFromOptional(Schema.Number),
  exerciseMinutes: Schema.OptionFromOptional(Schema.Number),
  flightsClimbed: Schema.OptionFromOptional(Schema.Number),
});

const HealthWorkout = Schema.Struct({
  type: Schema.String,
  durationSec: Schema.OptionFromOptional(Schema.Number),
  activeEnergyKcal: Schema.OptionFromOptional(Schema.Number),
  averageHeartRateBpm: Schema.OptionFromOptional(Schema.Number),
  maxHeartRateBpm: Schema.OptionFromOptional(Schema.Number),
  minHeartRateBpm: Schema.OptionFromOptional(Schema.Number),
  distanceKm: Schema.OptionFromOptional(Schema.Number),
  source: Schema.OptionFromOptional(Schema.String),
  start: Schema.String,
});

const SleepStage = Schema.Struct({
  stage: Schema.String,
  start: Schema.String,
  end: Schema.String,
  durationSec: Schema.OptionFromOptional(Schema.Number),
});

const SleepSession = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
  durationSec: Schema.OptionFromOptional(Schema.Number),
  inBedSec: Schema.OptionFromOptional(Schema.Number),
  asleepSec: Schema.OptionFromOptional(Schema.Number),
  awakeSec: Schema.OptionFromOptional(Schema.Number),
  source: Schema.OptionFromOptional(Schema.String),
  stages: Schema.OptionFromOptional(Schema.Array(SleepStage)),
});

const HealthExport = Schema.Struct({
  activity: Schema.Struct({
    daily: Schema.Array(HealthDailyActivity),
    workouts: Schema.Array(HealthWorkout),
  }),
  sleep: Schema.OptionFromOptional(
    Schema.Struct({
      sessions: Schema.Array(SleepSession),
    }),
  ),
  additional: Schema.OptionFromOptional(
    Schema.Struct({
      body: Schema.Struct({
        daily: Schema.Array(
          Schema.Struct({
            date: Schema.String,
            values: Schema.Struct({
              bodyMass: Schema.OptionFromOptional(Schema.Number),
              bodyFat: Schema.OptionFromOptional(Schema.Number),
              leanMass: Schema.OptionFromOptional(Schema.Number),
            }),
          }),
        ),
      }),
    }),
  ),
});

type HealthExport = typeof HealthExport.Type;

const pad = (value: number): string => String(value).padStart(2, "0");

const parseDateParts = (
  value: string,
): { month: number; day: number; hour: number; minute: number; second: number } => {
  const [datePart, timePart = "00:00:00"] = value.split(" ");
  const [month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  return { month, day, hour, minute, second };
};

export const assignYears = (starts: string[], startYear: number): Date[] => {
  if (starts.length === 0) return [];

  let currentYear = startYear;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const results: Date[] = [];

  for (const start of starts) {
    const { month, day, hour, minute, second } = parseDateParts(start);
    const ts = new Date(currentYear, month - 1, day, hour, minute, second).getTime();

    if (ts < previousTimestamp) {
      currentYear += 1;
    }

    const resolved = new Date(currentYear, month - 1, day, hour, minute, second);
    results.push(resolved);
    previousTimestamp = resolved.getTime();
  }

  return results;
};

const toIsoLocal = (date: Date): string => date.toISOString().slice(0, 10);

const toDateTimeLocal = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const parseSessionEnd = (session: typeof SleepSession.Type, startDate: Date): Date => {
  const duration = Option.getOrNull(session.durationSec);
  if (duration !== null) {
    return new Date(startDate.getTime() + duration * 1000);
  }

  const { month, day, hour, minute, second } = parseDateParts(session.end);
  let endDate = new Date(startDate.getFullYear(), month - 1, day, hour, minute, second);
  if (endDate.getTime() < startDate.getTime()) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return endDate;
};

export const parseHealthExport = (
  text: string,
  startYear: number,
): Effect.Effect<
  {
    daily: DailyActivityRow[];
    workouts: HealthWorkoutRow[];
    sleep: SleepSessionRow[];
    body: BodyMetricRow[];
  },
  HealthExportParseError
> =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => decodeJson(text),
      catch: (error) =>
        new HealthExportParseError({
          phase: "json",
          message: `Failed to parse health JSON: ${error}`,
        }),
    });

    const parsed = yield* Schema.decodeUnknownEffect(HealthExport)(raw).pipe(
      Effect.mapError(
        (error) =>
          new HealthExportParseError({
            phase: "schema",
            message: `Health export schema error: ${JSON.stringify(error)}`,
          }),
      ),
    );

    const daily: DailyActivityRow[] = parsed.activity.daily.map((day) => ({
      date: day.date,
      active_kcal: Option.getOrNull(day.activeEnergyKcal),
      steps: Option.getOrNull(day.steps),
      distance_km: Option.getOrNull(day.distanceKm),
      exercise_min: Option.getOrNull(day.exerciseMinutes),
      flights_climbed: Option.getOrNull(day.flightsClimbed),
    }));

    const workoutDates = assignYears(
      parsed.activity.workouts.map((w) => w.start),
      startYear,
    );

    const workouts: HealthWorkoutRow[] = parsed.activity.workouts.map((workout, index) => ({
      date: toIsoLocal(workoutDates[index]),
      type: workout.type,
      start_raw: workout.start,
      duration_sec: Option.getOrNull(workout.durationSec),
      active_kcal: Option.getOrNull(workout.activeEnergyKcal),
      avg_hr: Option.getOrNull(workout.averageHeartRateBpm),
      max_hr: Option.getOrNull(workout.maxHeartRateBpm),
      min_hr: Option.getOrNull(workout.minHeartRateBpm),
      distance_km: Option.getOrNull(workout.distanceKm),
      source: Option.getOrNull(workout.source),
      raw_json: JSON.stringify(workout),
    }));

    const sleep: SleepSessionRow[] = Option.match(parsed.sleep, {
      onNone: () => [],
      onSome: (sleepExport) => {
        const sleepDates = assignYears(
          sleepExport.sessions.map((session) => session.start),
          startYear,
        );

        return sleepExport.sessions.map((session, index) => {
          const startDate = sleepDates[index];
          const endDate = parseSessionEnd(session, startDate);
          const inBed = Option.getOrNull(session.inBedSec);
          const asleep = Option.getOrNull(session.asleepSec);
          const awake = Option.getOrNull(session.awakeSec);
          const duration = Option.getOrNull(session.durationSec);

          return {
            date: toIsoLocal(startDate),
            start: toDateTimeLocal(startDate),
            end: toDateTimeLocal(endDate),
            in_bed_min: inBed ?? duration ?? null,
            asleep_min: asleep,
            awake_min: awake,
            source: Option.getOrNull(session.source),
          };
        });
      },
    });

    const body: BodyMetricRow[] = Option.match(parsed.additional, {
      onNone: () => [],
      onSome: (additional) =>
        additional.body.daily.map((entry) => ({
          date: entry.date,
          weight_kg: Option.getOrNull(entry.values.bodyMass),
          body_fat_pct: Option.getOrNull(entry.values.bodyFat),
          lean_mass_kg: Option.getOrNull(entry.values.leanMass),
          source: null,
        })),
    });

    return { daily, workouts, sleep, body };
  });
