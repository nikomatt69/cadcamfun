// src/components/ui/ThemeToggle.tsx
import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'react-feather';

const ThemeToggle: React.FC = () => {
  // Initialize with system preference or stored preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Initialize theme on component mount
  useEffect(() => {
    // Check if user has a stored preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Set initial state based on saved preference or system preference
    if (savedTheme === 'light' || (!savedTheme && systemPrefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('light');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('light');
    }
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    if (isDarkMode) {
      // Switch to light mode
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(false);
    } else {
      // Switch to dark mode
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(true);
    }
  };

  return (
    <button
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      onClick={toggleTheme}
    >
      {isDarkMode ? (
        <Sun size={20} className="text-yellow-400" />
      ) : (
        <Moon size={20} />
      )}
    </button>
  );
};

export default ThemeToggle;