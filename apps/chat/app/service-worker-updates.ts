import {
  isSameAppVersion,
  parseAppVersionInfo,
  readAppVersionInfo,
  type AppVersionInfo,
} from "./app-version";

export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60_000;

export type ServiceWorkerUpdateStatus =
  | "unsupported"
  | "checking"
  | "up-to-date"
  | "updating"
  | "error";

export type ServiceWorkerUpdateResult = {
  status: Exclude<ServiceWorkerUpdateStatus, "checking">;
  message?: string;
  remote?: AppVersionInfo;
};

type ServiceWorkerBridge = {
  supported: boolean;
  register: (scriptUrl: string) => Promise<ServiceWorkerRegistration>;
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  fetchVersion: () => Promise<AppVersionInfo | null>;
  now: () => number;
};

const defaultBridge = (): ServiceWorkerBridge => ({
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  register: (scriptUrl) => navigator.serviceWorker.register(scriptUrl),
  getRegistration: async () => (await navigator.serviceWorker.getRegistration()) ?? undefined,
  reload: () => {
    window.location.reload();
  },
  fetchVersion: async () => {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseAppVersionInfo(await response.json());
  },
  now: () => Date.now(),
});

export const createServiceWorkerUpdater = (bridge: ServiceWorkerBridge = defaultBridge()) => {
  let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | null = null;
  let refreshing = false;
  let lastAutomaticCheckAt: number | null = null;

  const reloadOnce = () => {
    if (refreshing) return;
    refreshing = true;
    bridge.reload();
  };

  const ensureRegistered = async () => {
    if (!bridge.supported) return undefined;
    if (registrationPromise === null) {
      registrationPromise = bridge
        .register("/sw.js")
        .then(async (registration) => registration)
        .catch(async () => bridge.getRegistration());
    }
    return registrationPromise;
  };

  const applyWaitingWorker = (registration: ServiceWorkerRegistration) => {
    const waiting = registration.waiting;
    if (waiting === null) return false;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  };

  const checkForUpdate = async ({
    reloadWhenRemoteDiffers = true,
  }: {
    reloadWhenRemoteDiffers?: boolean;
  } = {}): Promise<ServiceWorkerUpdateResult> => {
    if (!bridge.supported) return { status: "unsupported" };

    try {
      const registration = await ensureRegistered();
      if (registration === undefined) {
        return { status: "error", message: "Service worker is not available." };
      }

      await registration.update();
      if (applyWaitingWorker(registration) || registration.installing !== null) {
        return { status: "updating" };
      }

      const remote = await bridge.fetchVersion();
      if (remote === null) return { status: "up-to-date" };

      if (!isSameAppVersion({ current: readAppVersionInfo(), remote })) {
        if (!applyWaitingWorker(registration) && registration.installing === null) {
          await registration.unregister().catch(() => undefined);
        }
        if (reloadWhenRemoteDiffers) reloadOnce();
        return { status: "updating", remote };
      }

      return { status: "up-to-date", remote };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const maybeCheckForUpdate = async () => {
    const now = bridge.now();
    if (
      lastAutomaticCheckAt !== null &&
      now - lastAutomaticCheckAt < SERVICE_WORKER_UPDATE_INTERVAL_MS
    ) {
      return { status: "up-to-date" as const };
    }
    lastAutomaticCheckAt = now;
    return checkForUpdate();
  };

  return {
    ensureRegistered,
    checkForUpdate,
    maybeCheckForUpdate,
    reloadOnce,
  };
};

export type ServiceWorkerUpdater = ReturnType<typeof createServiceWorkerUpdater>;
