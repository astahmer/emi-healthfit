import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Releases } from "./releases";

describe("Releases", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("renders validated release history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              releases: [
                {
                  version: "1.2.3",
                  releasedAt: "2026-01-01T12:00:00.000Z",
                  commitId: "commit-1",
                  changeId: "change-1",
                  changes: ["Actor lifecycle"],
                },
              ],
            }),
          ),
      ),
    );

    render(<Releases />);

    expect(await screen.findByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("Actor lifecycle")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/release-history.json", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("shows a failure state for invalid release data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ releases: "bad" }))),
    );

    render(<Releases />);

    expect(await screen.findByText("Could not load release history.")).toBeInTheDocument();
  });
});
