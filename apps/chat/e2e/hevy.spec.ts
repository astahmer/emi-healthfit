import { expect, test, type Page } from "@playwright/test";
import { connectedHevyStatus, createChatMock, sampleHevyWorkout } from "./mock/install.ts";

const acceptNextDialog = (page: Page) => {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
};

const dismissNextDialog = (page: Page) => {
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
};

test("connects Hevy from Settings and shows synced workouts", async ({ page }) => {
  const mock = createChatMock();
  await mock.open(page, "/settings");

  await expect(page.getByRole("heading", { name: "Hevy" })).toBeVisible();
  await page.getByPlaceholder("Hevy API key").fill("hevy-e2e-key");
  await page.getByRole("button", { name: "Connect and sync" }).click();

  await expect(page.getByText(/Connected as Ada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
  expect(mock.state.hevy.lastConnectApiKey).toBe("hevy-e2e-key");
  expect(mock.state.hevy.status.connected).toBe(true);
  expect(mock.state.hevy.workouts).toHaveLength(1);

  await page.getByRole("link", { name: "Workouts" }).click();
  await expect(page.getByText("E2E Push Day")).toBeVisible();
  await page.getByText("E2E Push Day").click();
  await expect(page.getByText("Bench press")).toBeVisible();
});

test("syncs Hevy from Settings and shows stale/error status", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus({
          fresh: false,
          lastErrorCode: "hevy_auth",
          lastErrorAt: "2026-07-20T11:00:00.000Z",
        }),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  await mock.open(page, "/settings");

  await expect(page.getByText(/May be stale/)).toBeVisible();
  await expect(page.getByText(/Last error: hevy_auth/)).toBeVisible();

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/Sync incremental/)).toBeVisible();
  expect(mock.state.hevy.syncCalls).toBe(1);
  await expect(page.getByText(/Up to date/)).toBeVisible();
});

test("disconnects Hevy after confirmation and keeps workouts available", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  await mock.open(page, "/settings");

  acceptNextDialog(page);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText(/Hevy disconnected. Local history kept./)).toBeVisible();
  await expect(page.getByPlaceholder("Hevy API key")).toBeVisible();
  expect(mock.state.hevy.status.connected).toBe(false);
  expect(mock.state.hevy.workouts).toHaveLength(1);

  await page.getByRole("link", { name: "Workouts" }).click();
  await expect(page.getByText("E2E Push Day")).toBeVisible();
});

test("cancels Hevy disconnect when confirmation is dismissed", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  await mock.open(page, "/settings");

  dismissNextDialog(page);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
  expect(mock.state.hevy.status.connected).toBe(true);
});

test("removes Hevy cached data after confirmation", async ({ page }) => {
  const mock = createChatMock({
    state: {
      hevy: {
        status: connectedHevyStatus(),
        workouts: [sampleHevyWorkout()],
        lastConnectApiKey: "already-connected",
        syncCalls: 0,
      },
    },
  });
  await mock.open(page, "/settings");

  acceptNextDialog(page);
  await page.getByRole("button", { name: "Remove cached data…" }).click();
  await expect(page.getByText(/Hevy data removed \(2 raw upload\(s\)\)\./)).toBeVisible();
  expect(mock.state.hevy.status.connected).toBe(false);
  expect(mock.state.hevy.workouts).toHaveLength(0);

  await page.getByRole("link", { name: "Workouts" }).click();
  await expect(
    page.getByText("No workouts found. Upload a Hevy export to get started."),
  ).toBeVisible();
});
