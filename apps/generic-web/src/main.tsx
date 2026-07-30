import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const container = document.getElementById("root");
if (container === null) throw new Error("Missing #root element");

if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register("/service-worker.js");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
