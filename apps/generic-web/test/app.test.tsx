import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app.tsx";

describe("App", () => {
  it("renders the generic core chat shell smoke page", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Generic Core Chat" })).toBeInTheDocument();
    expect(screen.getByTestId("smoke-note")).toHaveTextContent(
      "Generic core chat shell is running.",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });
});
