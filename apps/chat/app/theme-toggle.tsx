"use client";

import { SunIcon, MoonIcon } from "lucide-react";
import { useTheme } from "./theme-provider";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
  );
};
