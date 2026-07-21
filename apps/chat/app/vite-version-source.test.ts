import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("chat package version source", () => {
  it("exposes a semver package version used for build injection", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
