import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app.tsx";

describe("App", () => {
  it("renders a usable generic chat composer and local provider settings", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Core Chat" })).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.getByLabelText("Default model")).toHaveValue("gpt-4o-mini");
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
