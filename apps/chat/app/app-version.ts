export type AppVersionInfo = {
  version: string;
  buildId: string;
};

export const readAppVersionInfo = (): AppVersionInfo => ({
  version: import.meta.env.VITE_APP_VERSION || "0.0.0",
  buildId: import.meta.env.VITE_APP_BUILD_ID || "dev",
});

export const formatAppVersionLabel = (info: AppVersionInfo = readAppVersionInfo()): string => {
  if (info.buildId === "dev" || info.buildId === info.version) {
    return `v${info.version}`;
  }
  return `v${info.version} (${info.buildId})`;
};

export const isSameAppVersion = ({
  current,
  remote,
}: {
  current: AppVersionInfo;
  remote: AppVersionInfo;
}): boolean => current.version === remote.version && current.buildId === remote.buildId;

export const parseAppVersionInfo = (value: unknown): AppVersionInfo | null => {
  if (value === null || typeof value !== "object") return null;
  if (!("version" in value) || !("buildId" in value)) return null;
  if (typeof value.version !== "string" || typeof value.buildId !== "string") return null;
  if (value.version.trim() === "" || value.buildId.trim() === "") return null;
  return { version: value.version, buildId: value.buildId };
};
