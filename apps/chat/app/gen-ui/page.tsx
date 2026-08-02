import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GenUIRenderer } from "@emi/flavor-healthfit/web";
import { Button } from "@/components/ui/button";

const samples = [
  {
    label: "Workout table",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "WorkoutTable",
          props: {
            workouts: [
              {
                session_id: "1",
                title: "Upper A",
                start_time: "2024-12-30T08:00:00.000Z",
                total_volume_kg: 3200,
                exercise_count: 4,
                set_count: 14,
              },
              {
                session_id: "2",
                title: "Lower A",
                start_time: "2024-12-28T08:00:00.000Z",
                total_volume_kg: 4100,
                exercise_count: 5,
                set_count: 16,
              },
              {
                session_id: "3",
                title: "Upper B",
                start_time: "2024-12-26T08:00:00.000Z",
                total_volume_kg: 2950,
                exercise_count: 4,
                set_count: 12,
              },
            ],
          },
        },
      },
    },
  },
  {
    label: "Exercise progress",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "ExerciseProgress",
          props: {
            exercise_title: "Bench Press (Barbell)",
            weeks: 6,
            workouts: [
              {
                session_id: "a",
                title: "Upper A",
                start_time: "2024-12-30T08:00:00.000Z",
                max_weight_kg: 82.5,
                max_volume_kg: 2475,
                total_volume_kg: 2475,
                total_reps: 30,
                sets: 5,
              },
              {
                session_id: "b",
                title: "Upper B",
                start_time: "2024-12-23T08:00:00.000Z",
                max_weight_kg: 80,
                max_volume_kg: 2400,
                total_volume_kg: 2400,
                total_reps: 30,
                sets: 5,
              },
              {
                session_id: "c",
                title: "Upper A",
                start_time: "2024-12-16T08:00:00.000Z",
                max_weight_kg: 77.5,
                max_volume_kg: 2325,
                total_volume_kg: 2325,
                total_reps: 30,
                sets: 5,
              },
            ],
            personalRecord: { weight_kg: 82.5, reps: 6, volume_kg: 2475 },
          },
        },
      },
    },
  },
  {
    label: "Recovery card",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "RecoveryCard",
          props: {
            today: "2025-01-02",
            label: "Good",
            explanation:
              "Sleep average is solid and your last workout was two days ago. You're ready to push.",
            lastWorkout: "Lower A — 2 days ago",
            sleepAverageHours: 7.4,
            recentWorkoutCount: 4,
            recentVolume: 12400,
          },
        },
      },
    },
  },
  {
    label: "Metric cards",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "MetricCard",
          props: { label: "7-day volume", value: 12400, unit: "kg", trend: "up" },
        },
      },
    },
  },
  {
    label: "Set list",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "SetList",
          props: {
            sets: [
              {
                id: "bench-warmup-1",
                exercise: "Bench Press (Barbell)",
                weightKg: 80,
                reps: 8,
                rpe: 8,
                setType: "Warm-up",
              },
              {
                id: "bench-top-1",
                exercise: "Bench Press (Barbell)",
                weightKg: 82.5,
                reps: 6,
                rpe: 9,
                setType: "Top",
              },
              {
                id: "bench-backoff-1",
                exercise: "Bench Press (Barbell)",
                weightKg: 75,
                reps: 10,
                rpe: 8,
                setType: "Back-off",
              },
              {
                id: "lat-pulldown-1",
                exercise: "Lat Pulldown",
                weightKg: 60,
                reps: 12,
                rpe: 8,
                setType: null,
              },
            ],
          },
        },
      },
    },
  },
];

export default function GenUISandboxPage() {
  const [selected, setSelected] = useState(0);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-auto p-4 md:p-6">
      <div>
        <h2 className="text-xl font-semibold">Generative UI sandbox</h2>
        <p className="text-sm text-muted-foreground">
          Click a sample to render the component spec with fake data.
        </p>
      </div>
      <Button asChild variant="outline" className="w-fit">
        <Link to="/gen-ui/thread-layouts">Open six thread layout prototypes</Link>
      </Button>
      <div className="flex flex-wrap gap-2">
        {samples.map((sample, index) => (
          <Button
            key={sample.label}
            variant={selected === index ? "default" : "outline"}
            size="sm"
            onClick={() => setSelected(index)}
          >
            {sample.label}
          </Button>
        ))}
      </div>
      <div className="rounded-lg border p-4">
        <GenUIRenderer spec={samples[selected].spec} />
      </div>
    </div>
  );
}
