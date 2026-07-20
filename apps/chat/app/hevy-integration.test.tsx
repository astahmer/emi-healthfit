import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HevyIntegration } from "./hevy-integration";

const runApi = vi.hoisted(() => vi.fn());
const notifyHevyWorkoutDataChanged = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  runApi: (...args: unknown[]) => runApi(...args),
}));

vi.mock("./query-cache", () => ({
  notifyHevyWorkoutDataChanged: () => notifyHevyWorkoutDataChanged(),
}));

describe("HevyIntegration", () => {
  beforeEach(() => {
    runApi.mockReset();
    notifyHevyWorkoutDataChanged.mockReset();
  });

  it("connects, syncs, and invalidates workout caches", async () => {
    const user = userEvent.setup();
    const statusDisconnected = {
      connected: false,
      status: "disconnected",
      providerUserId: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastDataChangeAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      fresh: false,
    };
    const statusConnected = {
      ...statusDisconnected,
      connected: true,
      status: "connected",
      providerUserId: "u1",
      lastCheckedAt: "2026-07-20T10:00:00.000Z",
      lastSuccessAt: "2026-07-20T10:00:00.000Z",
      fresh: true,
    };

    runApi
      .mockImplementationOnce(async (fn: (client: { hevy: { status: () => unknown } }) => unknown) =>
        fn({ hevy: { status: () => statusDisconnected } }),
      )
      .mockImplementationOnce(
        async (fn: (client: {
          hevy: { connect: (args: unknown) => unknown };
        }) => unknown) =>
          fn({
            hevy: {
              connect: () => ({
                status: statusConnected,
                providerUserName: "Ada",
                sync: { imported: 2, mode: "initial" },
              }),
            },
          }),
      )
      .mockImplementationOnce(async (fn: (client: { hevy: { sync: () => unknown } }) => unknown) =>
        fn({
          hevy: {
            sync: () => ({
              mode: "incremental",
              updated: 1,
              deleted: 0,
              imported: 0,
            }),
          },
        }),
      )
      .mockImplementationOnce(async (fn: (client: { hevy: { status: () => unknown } }) => unknown) =>
        fn({ hevy: { status: () => statusConnected } }),
      );

    render(<HevyIntegration />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Hevy API key")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Hevy API key"), "hevy-secret");
    await user.click(screen.getByRole("button", { name: "Connect and sync" }));

    await waitFor(() => {
      expect(screen.getByText(/Connected as Ada/)).toBeInTheDocument();
    });
    expect(notifyHevyWorkoutDataChanged).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => {
      expect(screen.getByText(/Sync incremental/)).toBeInTheDocument();
    });
    expect(notifyHevyWorkoutDataChanged).toHaveBeenCalledTimes(2);
  });
});
