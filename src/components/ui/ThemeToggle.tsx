// src/components/ui/ThemeToggle.tsx
import React, { useEffect, useState } from "react";
import { Moon, Sun } from "react-feather";

const ThemeToggle: React.FC = () => {
  // Initialize state, default to false (light mode)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Initialize theme on component mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Determine initial theme
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      // Set to dark mode
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    } else {
      // Set to light mode
      document.documentElement.classList.remove("dark");
      setIsDarkMode(false);
    }
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    if (isDarkMode) {
      // Switch to light mode
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDarkMode(false);
    } else {
      // Switch to dark mode
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDarkMode(true);
    }
  };

  return (
    <button
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      onClick={toggleTheme}
    >
      {isDarkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} />}
    </button>
  );
};

export default ThemeToggle;
