import { expect, test } from "@playwright/test";
import { connectedHevyStatus, sampleHevyWorkout } from "./mock/app.ts";
import { createChatMock } from "./mock/install.ts";

test("shows flavor summary overview metrics from analytics", async ({ page }) => {
  const mock = createChatMock({
    state: {
      analytics: {
        days: 90,
        activity: [{ date: "2026-07-01", steps: 8_000, active_kcal: 400, exercise_min: 45 }],
        sleep: [{ date: "2026-07-01", asleep_min: 420, in_bed_min: 480 }],
        training: [{ date: "2026-07-01", workouts: 1, volume_kg: 1_200, duration_sec: 3600 }],
        body: [{ date: "2026-07-01", weight_kg: 80, body_fat_pct: null, lean_mass_kg: null }],
        exercises: [{ exercise_title: "Bench press", sets: 12, volume_kg: 900 }],
        highlights: {
          averageSteps: 8_000,
          averageSleepMinutes: 420,
          workouts: 3,
          trainingVolumeKg: 1_200,
          weightChangeKg: -0.5,
        },
      },
    },
  });

  await mock.open(page, "/summary");
  await expect(page.getByRole("heading", { name: "Health overview" })).toBeVisible();
  await expect(page.getByText("Average steps")).toBeVisible();
  await expect(page.getByText("8,000")).toBeVisible();
  await expect(page.getByText("Bench press")).toBeVisible();
  await expect(page.getByText(/12 sets/)).toBeVisible();
});

test("uploads health and hevy files through the flavor upload panel", async ({ page }) => {
  const mock = createChatMock();
  await mock.open(page, "/upload");

  await expect(page.getByRole("heading", { name: "Upload data" })).toBeVisible();
  await page.locator("#health").setInputFiles({
    name: "health.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page.locator("#hevy").setInputFiles({
    name: "hevy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2\n"),
  });
  await page.getByRole("button", { name: "Import data" }).click();

  await expect(page.getByText(/Uploaded!/)).toBeVisible();
  await expect(page.getByText(/Health: 1 daily/)).toBeVisible();
  await expect(page.getByText(/Hevy: 1 sessions, 2 sets/)).toBeVisible();
  expect(mock.state.ingest.calls).toBe(1);
  expect(mock.state.ingest.lastHealthName).toBe("health.json");
  expect(mock.state.ingest.lastHevyName).toBe("hevy.csv");
});

test("lists flavor workouts panel sessions from mock hevy data", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "key",
        syncCalls: 0,
      },
    },
  });

  await mock.open(page, "/workouts");
  await expect(page.getByRole("heading", { name: "Workouts" })).toBeVisible();
  await expect(page.getByText("E2E Push Day")).toBeVisible();
  await page.getByRole("button", { name: "Expand E2E Push Day" }).click();
  await expect(page.getByText("Bench press")).toBeVisible();
});
