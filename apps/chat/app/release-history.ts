export type Release = {
  version: string;
  releasedAt: string;
  commitId: string;
  changeId: string;
  changes: string[];
};

export type ReleaseHistory = {
  releases: Release[];
};

const isRelease = (value: unknown): value is Release => {
  if (value === null || typeof value !== "object") return false;
  if (!("version" in value) || typeof value.version !== "string") return false;
  if (!("releasedAt" in value) || typeof value.releasedAt !== "string") return false;
  if (!("commitId" in value) || typeof value.commitId !== "string") return false;
  if (!("changeId" in value) || typeof value.changeId !== "string") return false;
  if (!("changes" in value) || !Array.isArray(value.changes)) return false;
  return value.changes.every((change) => typeof change === "string");
};

export const parseReleaseHistory = (value: unknown): ReleaseHistory | null => {
  if (value === null || typeof value !== "object") return null;
  if (!("releases" in value) || !Array.isArray(value.releases)) return null;
  if (!value.releases.every(isRelease)) return null;
  return { releases: value.releases };
};
