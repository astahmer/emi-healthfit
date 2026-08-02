import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app.tsx";

describe("App", () => {
  it("requires an explicit guest or OAuth choice before opening chat", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Welcome to Core Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });
});
