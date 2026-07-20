import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    runApi.mockImplementation(async (useClient: (client: unknown) => unknown) => {
      const client = {
        hevy: {
          status: () =>
            notifyHevyWorkoutDataChanged.mock.calls.length > 0
              ? statusConnected
              : statusDisconnected,
          connect: () => ({
            status: statusConnected,
            providerUserName: "Ada",
            sync: { imported: 2, mode: "initial" },
          }),
          sync: () => ({
            mode: "incremental",
            updated: 1,
            deleted: 0,
            imported: 0,
          }),
        },
      };
      return useClient(client);
    });

    render(<HevyIntegration />);

    const apiKeyInput = await screen.findByPlaceholderText("Hevy API key");
    fireEvent.change(apiKeyInput, { target: { value: "hevy-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect and sync" }));

    await waitFor(() => {
      expect(screen.getByText(/Connected as Ada/)).toBeInTheDocument();
    });
    expect(notifyHevyWorkoutDataChanged).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => {
      expect(screen.getByText(/Sync incremental/)).toBeInTheDocument();
    });
    expect(notifyHevyWorkoutDataChanged).toHaveBeenCalledTimes(2);
  }, 15_000);
});
