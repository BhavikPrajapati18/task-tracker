
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("workboard-theme");

    const preferred: Theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(preferred);
    document.documentElement.setAttribute(
      "data-theme",
      preferred
    );
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";

    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("workboard-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
