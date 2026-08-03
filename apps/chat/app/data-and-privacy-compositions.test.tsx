import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runApi = vi.hoisted(() => vi.fn());

vi.mock("./api-client", () => ({
  runApi: (...args: unknown[]) => runApi(...args),
}));

import { DataExport } from "./data-export";
import { DataImport } from "./data-import";
import { PrivacyControls } from "./privacy-controls";

describe("data and privacy compositions", () => {
  beforeEach(() => {
    runApi.mockReset();
    vi.unstubAllGlobals();
  });

  it("loads an export summary and downloads a successful response", async () => {
    runApi.mockImplementation(async (useClient: (client: unknown) => unknown) =>
      useClient({
        data: {
          exportSummary: () => ({
            summary: {
              totalRecords: 12,
              healthRange: { first: "2026-01-01T00:00:00.000Z", last: "2026-01-02T00:00:00.000Z" },
              hevyRange: { first: null, last: null },
            },
          }),
        },
      }),
    );
    const response = new Response("{}", { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(<DataExport />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Export Health/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Export Health/ })).not.toBeDisabled(),
    );
    expect(fetch).toHaveBeenCalledWith("/api/export/ingested-data");
  });

  it("reports an export HTTP failure instead of treating it as a blob", async () => {
    runApi.mockResolvedValue({
      summary: {
        totalRecords: 0,
        healthRange: { first: null, last: null },
        hevyRange: { first: null, last: null },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("failed", { status: 503 })),
    );

    render(<DataExport />);
    fireEvent.click(await screen.findByRole("button", { name: /Export Health/ }));

    expect(await screen.findByText("Export failed (503)")).toBeInTheDocument();
  });

  it("previews and applies a selected import", async () => {
    const preview = {
      preview: {
        groups: { dailyActivity: { received: 2, existing: 1, new: 1 } },
        totals: { received: 2, existing: 1, new: 1 },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...preview, applied: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([JSON.stringify({ dailyActivity: [] })], "export.json", {
      type: "application/json",
    });

    render(<DataImport />);
    fireEvent.change(screen.getByLabelText("Choose JSON export"), { target: { files: [file] } });
    expect(await screen.findByText(/1 new/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Import 2 records/ }));
    expect(await screen.findByText("Imported 2 records.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads, saves, and deletes privacy settings through the API boundary", async () => {
    const removeSource = vi.fn(async () => undefined);
    runApi.mockImplementation(async (useClient: (client: unknown) => unknown) =>
      useClient({
        privacy: {
          read: async () => ({ rawUploadRetentionDays: 90 }),
          update: async ({ payload }: { payload: { rawUploadRetentionDays: number } }) => ({
            deletedRawUploads: payload.rawUploadRetentionDays === 0 ? 4 : 0,
          }),
          removeSource,
        },
      }),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );

    render(<PrivacyControls />);
    const select = await screen.findByLabelText("Raw upload retention");
    expect(select).toHaveValue("90");
    fireEvent.change(select, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Retention saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Apple Health" }));
    await waitFor(() =>
      expect(removeSource).toHaveBeenCalledWith({ params: { source: "health" } }),
    );
    expect(screen.getByText(/Apple Health records/)).toBeInTheDocument();
  });
});
