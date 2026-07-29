import { describe, expect, it, vi } from "vitest";
import { createServiceWorkerUpdater } from "./service-worker-updates";

const createRegistration = ({
  waiting = null,
  installing = null,
}: {
  waiting?: ServiceWorker | null;
  installing?: ServiceWorker | null;
} = {}) => {
  const update = vi.fn(async () => undefined);
  const unregister = vi.fn(async () => true);
  return {
    update,
    unregister,
    waiting,
    installing,
    active: null,
  } as unknown as ServiceWorkerRegistration;
};

describe("createServiceWorkerUpdater", () => {
  it("reports unsupported when service workers are unavailable", async () => {
    const updater = createServiceWorkerUpdater({
      supported: false,
      register: vi.fn(),
      getRegistration: vi.fn(),
      reload: vi.fn(),
      fetchVersion: vi.fn(),
      now: () => 0,
    });

    await expect(updater.checkForUpdate()).resolves.toEqual({ status: "unsupported" });
  });

  it("returns updating when a waiting worker is found", async () => {
    const postMessage = vi.fn();
    const registration = createRegistration({
      waiting: { postMessage } as unknown as ServiceWorker,
    });
    const updater = createServiceWorkerUpdater({
      supported: true,
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      reload: vi.fn(),
      fetchVersion: vi.fn(),
      now: () => 0,
    });

    await expect(updater.checkForUpdate()).resolves.toEqual({ status: "updating" });
    expect(registration.update).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reloads when the remote version differs from the running build", async () => {
    const registration = createRegistration();
    const reload = vi.fn();
    const updater = createServiceWorkerUpdater({
      supported: true,
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      reload,
      fetchVersion: vi.fn(async () => ({ version: "9.9.9", buildId: "remote" })),
      now: () => 0,
    });

    await expect(updater.checkForUpdate()).resolves.toEqual({
      status: "updating",
      remote: { version: "9.9.9", buildId: "remote" },
    });
    expect(registration.unregister).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports up-to-date when remote version matches", async () => {
    const registration = createRegistration();
    const reload = vi.fn();
    vi.stubEnv("VITE_APP_VERSION", "0.1.0");
    vi.stubEnv("VITE_APP_BUILD_ID", "local");
    const updater = createServiceWorkerUpdater({
      supported: true,
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      reload,
      fetchVersion: vi.fn(async () => ({ version: "0.1.0", buildId: "local" })),
      now: () => 0,
    });

    await expect(updater.checkForUpdate()).resolves.toEqual({
      status: "up-to-date",
      remote: { version: "0.1.0", buildId: "local" },
    });
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("throttles automatic update checks", async () => {
    const registration = createRegistration();
    const update = registration.update as unknown as ReturnType<typeof vi.fn>;
    let now = 1_000;
    const updater = createServiceWorkerUpdater({
      supported: true,
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      reload: vi.fn(),
      fetchVersion: vi.fn(async () => null),
      now: () => now,
    });

    await updater.maybeCheckForUpdate();
    now = 30_000;
    await updater.maybeCheckForUpdate();
    expect(update).toHaveBeenCalledOnce();

    now = 70_000;
    await updater.maybeCheckForUpdate();
    expect(update).toHaveBeenCalledTimes(2);
  });
});
