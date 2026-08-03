import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

const ThemeProbe = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
};

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("hydrates a stored theme, applies it, and persists toggles", async () => {
    localStorage.setItem("emi-theme", "light");
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));
    expect(document.documentElement).not.toHaveClass("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(localStorage.getItem("emi-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("follows system changes until the user chooses a theme", async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
      })),
    });
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));
    act(() => {
      listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    });
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("dark"));
    expect(localStorage.getItem("emi-theme")).toBeNull();
  });
});
