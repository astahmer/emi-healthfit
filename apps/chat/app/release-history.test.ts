import { describe, expect, it } from "vitest";
import { parseReleaseHistory } from "./release-history";

describe("parseReleaseHistory", () => {
  it("accepts a release with JJ source metadata", () => {
    expect(
      parseReleaseHistory({
        releases: [
          {
            version: "0.1.0-2026-07-29",
            releasedAt: "2026-07-29T12:34:56.000Z",
            commitId: "a1c0fb3c6480",
            changeId: "qunyuxxxzxlz",
            changes: ["feat(chat): show release history"],
          },
        ],
      }),
    ).toEqual({
      releases: [
        {
          version: "0.1.0-2026-07-29",
          releasedAt: "2026-07-29T12:34:56.000Z",
          commitId: "a1c0fb3c6480",
          changeId: "qunyuxxxzxlz",
          changes: ["feat(chat): show release history"],
        },
      ],
    });
  });

  it("rejects malformed history", () => {
    expect(parseReleaseHistory({ releases: [{ version: "0.1.0" }] })).toBeNull();
  });
});
