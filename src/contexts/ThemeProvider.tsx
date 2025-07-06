"use client";

import { useEffect } from "react";
import { useThemeStore } from "src/store/themeStore"; // Adjust path if needed

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const mode = useThemeStore(state => state.mode);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark"); // Remove previous theme classes
    root.classList.add(mode); // Add the current theme class
  }, [mode]); // Re-run effect when mode changes

  return <>{children}</>;
}
