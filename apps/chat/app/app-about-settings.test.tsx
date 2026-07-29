import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppAboutSettings } from "./app-about-settings";
import type { ServiceWorkerUpdater } from "./service-worker-updates";

describe("AppAboutSettings", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_VERSION", "0.1.0");
    vi.stubEnv("VITE_APP_BUILD_ID", "deadbeef");
  });

  it("shows the running app version", () => {
    render(
      <AppAboutSettings
        updater={
          {
            ensureRegistered: vi.fn(),
            checkForUpdate: vi.fn(),
            maybeCheckForUpdate: vi.fn(),
            reloadOnce: vi.fn(),
          } satisfies ServiceWorkerUpdater
        }
      />,
    );

    expect(screen.getByTestId("app-version-label")).toHaveTextContent("v0.1.0 (deadbeef)");
  });

  it("checks for updates on demand", async () => {
    const user = userEvent.setup();
    const checkForUpdate = vi.fn(async () => ({ status: "up-to-date" as const }));
    render(
      <AppAboutSettings
        updater={{
          ensureRegistered: vi.fn(),
          checkForUpdate,
          maybeCheckForUpdate: vi.fn(),
          reloadOnce: vi.fn(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => {
      expect(screen.getByTestId("app-update-status")).toHaveTextContent(
        "You are on the latest version.",
      );
    });
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });
});
