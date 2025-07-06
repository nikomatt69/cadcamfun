import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type ThemeMode = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      mode: "dark", // Default theme
      setMode: mode => set({ mode }),
      toggleMode: () => set(state => ({ mode: state.mode === "dark" ? "light" : "dark" }))
    }),
    {
      name: "theme-storage", // Name for the persisted state in localStorage
      storage: createJSONStorage(() => localStorage) // Use localStorage for persistence
    }
  )
);

/**
 * Hook to access the current theme mode directly.
 * @returns The current theme mode ('light' or 'dark').
 */
export const useCurrentTheme = () => useThemeStore(state => state.mode);

/**
 * Hook to access the theme toggle function.
 * @returns A function to toggle the theme between light and dark.
 */
export const useToggleTheme = () => useThemeStore(state => state.toggleMode);

/**
 * Hook to access the function to set a specific theme mode.
 * @returns A function to set the theme mode ('light' or 'dark').
 */
export const useSetThemeMode = () => useThemeStore(state => state.setMode);
