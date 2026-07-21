import type { UploadResult } from "./upload-machine.ts";

export const formatUploadResult = (result: UploadResult | null) => {
  if (result === null) return "";
  const health = result.health;
  const hevy = result.hevy;
  const daily = health === undefined ? 0 : (health.daily ?? 0);
  const workouts = health === undefined ? 0 : (health.workouts ?? 0);
  const sleep = health === undefined ? 0 : (health.sleep ?? 0);
  const body = health === undefined ? 0 : (health.body ?? 0);
  const sessions = hevy === undefined ? 0 : (hevy.sessions ?? 0);
  const sets = hevy === undefined ? 0 : (hevy.sets ?? 0);
  return [
    "Uploaded!",
    `Health: ${daily} daily, ${workouts} workouts, ${sleep} sleep, ${body} body`,
    `Hevy: ${sessions} sessions, ${sets} sets`,
  ].join("\n");
};
