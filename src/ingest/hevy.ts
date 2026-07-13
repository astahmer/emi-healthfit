import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { HevySessionRow, HevySetRow } from "../db/schema.ts";

const HevyRow = Schema.Struct({
  title: Schema.String,
  start_time: Schema.String,
  end_time: Schema.optionalWith(Schema.String, { as: "Option" }),
  exercise_title: Schema.String,
  exercise_notes: Schema.optionalWith(Schema.String, { as: "Option" }),
  set_index: Schema.String,
  set_type: Schema.optionalWith(Schema.String, { as: "Option" }),
  weight_kg: Schema.optionalWith(Schema.String, { as: "Option" }),
  reps: Schema.optionalWith(Schema.String, { as: "Option" }),
  distance_km: Schema.optionalWith(Schema.String, { as: "Option" }),
  duration_seconds: Schema.optionalWith(Schema.String, { as: "Option" }),
  rpe: Schema.optionalWith(Schema.String, { as: "Option" }),
});

type HevyRow = typeof HevyRow.Type;

const HEVY_DATE_FORMAT = /^\d{1,2} [A-Za-z]{3} \d{4}, \d{2}:\d{2}$/;

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const parseHevyDate = (value: string): Effect.Effect<Date, Error> =>
  Effect.gen(function* () {
    if (!HEVY_DATE_FORMAT.test(value)) {
      return yield* Effect.fail(new Error(`Unexpected Hevy date format: ${value}`));
    }

    const [day, month, year, time] = value.replace(",", "").split(/\s+/);
    const [hour, minute] = time.split(":").map(Number);
    const monthIndex = monthNames.indexOf(month);

    if (monthIndex === -1) {
      return yield* Effect.fail(new Error(`Unknown Hevy month: ${month}`));
    }

    return new Date(Number(year), monthIndex, Number(day), hour, minute);
  });

const parseNumber = (value: string | null | undefined): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

export const parseHevyCsv = (text: string): Effect.Effect<{
  sessions: HevySessionRow[];
  sets: HevySetRow[];
}, Error> =>
  Effect.gen(function* () {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) {
      return { sessions: [], sets: [] };
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
    const rows: HevyRow[] = [];

    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line).map((v) => v.replace(/^"|"$/g, ""));
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });

      const decoded = yield* Schema.decodeUnknown(HevyRow)(record).pipe(
        Effect.mapError((error) => new Error(`Hevy CSV schema error: ${JSON.stringify(error)}`)),
      );
      rows.push(decoded);
    }

    const sessionsById = new Map<string, HevySessionRow>();
    const sets: HevySetRow[] = [];

    for (const row of rows) {
      const startDate = yield* parseHevyDate(row.start_time);
      const sessionId = `${row.title}_${row.start_time}`;

      if (!sessionsById.has(sessionId)) {
        const endDate = yield* Option.match(row.end_time, {
          onNone: () => Effect.succeed(null),
          onSome: (end) => parseHevyDate(end).pipe(Effect.map((d) => d)),
        });

        const durationSec = endDate !== null
          ? Math.round((endDate.getTime() - startDate.getTime()) / 1000)
          : null;

        sessionsById.set(sessionId, {
          session_id: sessionId,
          title: row.title,
          start_time: toDateTimeLocal(startDate),
          end_time: endDate !== null ? toDateTimeLocal(endDate) : null,
          duration_sec: durationSec,
          total_volume_kg: null,
        });
      }

      sets.push({
        session_id: sessionId,
        exercise_title: row.exercise_title,
        set_index: Number(row.set_index),
        set_type: Option.getOrNull(row.set_type),
        weight_kg: parseNumber(Option.getOrNull(row.weight_kg)),
        reps: parseNumber(Option.getOrNull(row.reps)),
        rpe: parseNumber(Option.getOrNull(row.rpe)),
        distance_km: parseNumber(Option.getOrNull(row.distance_km)),
        duration_seconds: parseNumber(Option.getOrNull(row.duration_seconds)),
        exercise_notes: Option.getOrNull(row.exercise_notes),
      });
    }

    for (const session of sessionsById.values()) {
      const sessionSets = sets.filter((s) => s.session_id === session.session_id);
      session.total_volume_kg = sessionSets.reduce((sum, set) => {
        if (set.weight_kg !== null && set.reps !== null) {
          return sum + set.weight_kg * set.reps;
        }
        return sum;
      }, 0);
    }

    return { sessions: Array.from(sessionsById.values()), sets };
  });

const toDateTimeLocal = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
