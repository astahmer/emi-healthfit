import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerReload } from "./service-worker-reload";
import type { ServiceWorkerUpdater } from "./service-worker-updates";

const createUpdater = (): ServiceWorkerUpdater => ({
  ensureRegistered: vi.fn(async () => undefined),
  checkForUpdate: vi.fn(async () => ({ status: "up-to-date" as const })),
  maybeCheckForUpdate: vi.fn(async () => ({ status: "up-to-date" as const })),
  reloadOnce: vi.fn(),
});

describe("ServiceWorkerReload", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: {},
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it("registers and responds to app lifecycle events", async () => {
    const updater = createUpdater();
    render(<ServiceWorkerReload enabled updater={updater} />);

    await waitFor(() => {
      expect(updater.ensureRegistered).toHaveBeenCalledOnce();
      expect(updater.maybeCheckForUpdate).toHaveBeenCalledOnce();
    });
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    expect(updater.maybeCheckForUpdate).toHaveBeenCalledTimes(3);
  });

  it("does not touch the updater when disabled", () => {
    const updater = createUpdater();
    render(<ServiceWorkerReload enabled={false} updater={updater} />);
    expect(updater.ensureRegistered).not.toHaveBeenCalled();
    expect(updater.maybeCheckForUpdate).not.toHaveBeenCalled();
  });
});
