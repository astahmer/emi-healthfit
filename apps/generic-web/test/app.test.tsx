import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/app.tsx";

describe("App", () => {
  it("requires an explicit guest or OAuth choice before opening chat", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Welcome to Core Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });

  it("opens the core chat after the anonymous session actor succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    render(<App />);

    screen.getByRole("button", { name: "Continue as guest" }).click();

    await waitFor(() => expect(screen.getByLabelText("Message")).toBeInTheDocument());
  });
});
