// src/hooks/useDebounce.ts

import { useState, useEffect } from "react";

/**
 * A hook that returns a debounced value that only updates after the specified delay.
 * Useful for reducing the frequency of expensive operations.
 *
 * @param value The value to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set a timeout to update the debounced value after the delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clear the timeout if the value changes before the delay expires
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * A hook that returns a debounced function that only executes after the specified delay.
 * Useful for expensive operations that can be triggered multiple times quickly.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced function
 */
export function useDebouncedFunction<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  return (...args: Parameters<T>) => {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set a new timeout to execute the function after the delay
    const newTimeoutId = setTimeout(() => {
      fn(...args);
    }, delay);

    setTimeoutId(newTimeoutId);
  };
}
