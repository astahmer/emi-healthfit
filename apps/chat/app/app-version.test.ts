import { describe, expect, it } from "vitest";
import {
  formatAppVersionLabel,
  isSameAppVersion,
  parseAppVersionInfo,
  type AppVersionInfo,
} from "./app-version";

describe("app version helpers", () => {
  it("formats a release label with build id", () => {
    expect(formatAppVersionLabel({ version: "0.1.0", buildId: "abc1234" })).toBe(
      "v0.1.0 (abc1234)",
    );
  });

  it("keeps the deployment metadata from a release manifest", () => {
    expect(
      parseAppVersionInfo({
        version: "0.1.0-2026-07-29",
        buildId: "a1c0fb3c6480",
        releasedAt: "2026-07-29T12:34:56.000Z",
        commitId: "a1c0fb3c6480",
        changeId: "qunyuxxxzxlz",
      }),
    ).toEqual({
      version: "0.1.0-2026-07-29",
      buildId: "a1c0fb3c6480",
      releasedAt: "2026-07-29T12:34:56.000Z",
      commitId: "a1c0fb3c6480",
      changeId: "qunyuxxxzxlz",
    });
  });

  it("omits redundant build id for local and version-only builds", () => {
    expect(formatAppVersionLabel({ version: "0.1.0", buildId: "dev" })).toBe("v0.1.0");
    expect(formatAppVersionLabel({ version: "0.1.0", buildId: "0.1.0" })).toBe("v0.1.0");
  });

  it("compares version payloads by version and build id", () => {
    const current: AppVersionInfo = { version: "0.1.0", buildId: "aaa" };
    expect(isSameAppVersion({ current, remote: { version: "0.1.0", buildId: "aaa" } })).toBe(true);
    expect(isSameAppVersion({ current, remote: { version: "0.1.0", buildId: "bbb" } })).toBe(false);
    expect(isSameAppVersion({ current, remote: { version: "0.2.0", buildId: "aaa" } })).toBe(false);
  });

  it("parses only well-formed version payloads", () => {
    expect(parseAppVersionInfo({ version: "0.1.0", buildId: "abc" })).toEqual({
      version: "0.1.0",
      buildId: "abc",
    });
    expect(parseAppVersionInfo({ version: "", buildId: "abc" })).toBeNull();
    expect(parseAppVersionInfo({ version: "0.1.0" })).toBeNull();
    expect(parseAppVersionInfo(null)).toBeNull();
    expect(parseAppVersionInfo("0.1.0")).toBeNull();
  });
});
