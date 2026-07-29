import { describe, expect, it } from "vitest";
import { formatUploadResult } from "../../src/web/upload-format.ts";

describe("formatUploadResult", () => {
  it("renders zeros when counts are missing", () => {
    expect(formatUploadResult({ health: undefined, hevy: undefined })).toContain("0 daily");
    expect(formatUploadResult(null)).toBe("");
  });

  it("renders provided health and hevy counts", () => {
    const text = formatUploadResult({
      health: { daily: 1, workouts: 2, sleep: 3, body: 4 },
      hevy: { sessions: 5, sets: 6 },
    });
    expect(text).toContain("1 daily, 2 workouts, 3 sleep, 4 body");
    expect(text).toContain("5 sessions, 6 sets");
  });
});
