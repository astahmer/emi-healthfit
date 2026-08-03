import { useEffect } from "react";
import {
  createServiceWorkerUpdater,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
} from "./service-worker-updates";

const defaultUpdater = createServiceWorkerUpdater();

export const ServiceWorkerReload = ({
  enabled = import.meta.env.PROD,
  updater = defaultUpdater,
}: {
  readonly enabled?: boolean;
  readonly updater?: ReturnType<typeof createServiceWorkerUpdater>;
} = {}) => {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);

    void updater.ensureRegistered();
    void updater.maybeCheckForUpdate();

    const onControllerChange = () => {
      if (!hadController) return;
      updater.reloadOnce();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void updater.maybeCheckForUpdate();
    };
    const onFocus = () => {
      void updater.maybeCheckForUpdate();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    const intervalId = window.setInterval(() => {
      void updater.maybeCheckForUpdate();
    }, SERVICE_WORKER_UPDATE_INTERVAL_MS);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(intervalId);
    };
  }, [enabled, updater]);

  return null;
};
