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

type HevyStatus = {
  connected: boolean;
  status: string;
  providerUserId: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastDataChangeAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  fresh: boolean;
};

const disconnectedStatus: HevyStatus = {
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

const connectedStatus: HevyStatus = {
  ...disconnectedStatus,
  connected: true,
  status: "connected",
  providerUserId: "u1",
  lastCheckedAt: "2026-07-20T10:00:00.000Z",
  lastSuccessAt: "2026-07-20T10:00:00.000Z",
  fresh: true,
};

const mockHevyClient = (hevy: Record<string, () => unknown>) => {
  runApi.mockImplementation(async (useClient: (client: unknown) => unknown) => useClient({ hevy }));
};

describe("HevyIntegration", () => {
  beforeEach(() => {
    runApi.mockReset();
    notifyHevyWorkoutDataChanged.mockReset();
    vi.unstubAllGlobals();
  });

  it("connects, syncs, and invalidates workout caches", async () => {
    let currentStatus = disconnectedStatus;
    mockHevyClient({
      status: () => currentStatus,
      connect: () => {
        currentStatus = connectedStatus;
        return {
          status: connectedStatus,
          providerUserName: "Ada",
          sync: { imported: 2, mode: "initial" },
        };
      },
      sync: () => ({
        mode: "incremental",
        updated: 1,
        deleted: 0,
        imported: 0,
      }),
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

  it("shows last sync error for a connected account", async () => {
    mockHevyClient({
      status: () => ({
        ...connectedStatus,
        fresh: false,
        lastErrorCode: "hevy_auth",
        lastErrorAt: "2026-07-20T11:00:00.000Z",
      }),
    });

    render(<HevyIntegration />);

    expect(await screen.findByText(/Last error: hevy_auth/)).toBeInTheDocument();
    expect(screen.getByText(/May be stale/)).toBeInTheDocument();
  });

  it("disconnects after confirmation and keeps history messaging", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);

    let currentStatus = connectedStatus;
    mockHevyClient({
      status: () => currentStatus,
      disconnect: () => {
        currentStatus = disconnectedStatus;
        return { success: true };
      },
    });

    render(<HevyIntegration />);
    await screen.findByRole("button", { name: "Disconnect" });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(screen.getByText(/Hevy disconnected. Local history kept./)).toBeInTheDocument();
    });
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Hevy API key")).toBeInTheDocument();
  });

  it("removes cached data after confirmation and invalidates caches", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);

    let currentStatus = connectedStatus;
    mockHevyClient({
      status: () => currentStatus,
      removeData: () => {
        currentStatus = disconnectedStatus;
        return { deletedRawUploads: 2 };
      },
    });

    render(<HevyIntegration />);
    await screen.findByRole("button", { name: "Remove cached data…" });
    fireEvent.click(screen.getByRole("button", { name: "Remove cached data…" }));

    await waitFor(() => {
      expect(screen.getByText(/Hevy data removed \(2 raw upload\(s\)\)\./)).toBeInTheDocument();
    });
    expect(confirm).toHaveBeenCalled();
    expect(notifyHevyWorkoutDataChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Hevy API key")).toBeInTheDocument();
  });

  it("does not disconnect when confirmation is cancelled", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    mockHevyClient({
      status: () => connectedStatus,
      disconnect: () => {
        throw new Error("should not disconnect");
      },
    });

    render(<HevyIntegration />);
    await screen.findByRole("button", { name: "Disconnect" });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(screen.getByText(/Up to date/)).toBeInTheDocument();
    expect(runApi.mock.calls.length).toBe(1);
  });
});
