import { useEffect } from "react";
import {
  createServiceWorkerUpdater,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
} from "./service-worker-updates";

const updater = createServiceWorkerUpdater();

export const ServiceWorkerReload = () => {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

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
  }, []);

  return null;
};
