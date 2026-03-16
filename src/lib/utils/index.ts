// src/lib/utils/index.ts
// Common utility functions

import { v4 as uuidv4 } from 'uuid';

// ============================================
// ID Generation
// ============================================

/** Generate unique ID */
export const generateId = (): string => uuidv4();

/** Generate short ID */
export const generateShortId = (): string => 
  Math.random().toString(36).substring(2, 11);

// ============================================
// Array Utilities
// ============================================

/** Group array by key */
export const groupBy = <T, K extends keyof T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> => {
  return array.reduce((result, item) => {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<string, T[]>);
};

/** Sort array by key */
export const sortBy = <T>(
  array: T[],
  keyFn: (item: T) => number | string,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  const sorted = [...array].sort((a, b) => {
    const aVal = keyFn(a);
    const bVal = keyFn(b);
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
};

/** Remove duplicates from array */
export const unique = <T>(array: T[], keyFn?: (item: T) => unknown): T[] => {
  if (!keyFn) return [...new Set(array)];
  const seen = new Set();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ============================================
// Object Utilities
// ============================================

/** Deep clone object */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/** Pick specific keys from object */
export const pick = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};

/** Omit keys from object */
export const omit = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

/** Merge objects deeply */
export const deepMerge = <T extends object>(...objects: Partial<T>[]): T => {
  return objects.reduce((result, obj) => {
    Object.keys(obj).forEach((key) => {
      const k = key as keyof T;
      if (
        typeof result[k] === 'object' &&
        typeof obj[k] === 'object' &&
        result[k] !== null &&
        obj[k] !== null
      ) {
        (result[k] as any) = deepMerge(result[k] as any, obj[k] as any);
      } else {
        result[k] = obj[k] as T[keyof T];
      }
    });
    return result;
  }, {} as T);
};

// ============================================
// String Utilities
// ============================================

/** Capitalize first letter */
export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/** Truncate string */
export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
};

/** Slugify string */
export const slugify = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/** Format file size */
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// ============================================
// Number Utilities
// ============================================

/** Clamp number between min and max */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/** Round to decimal places */
export const round = (value: number, decimals = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/** Generate random number in range */
export const randomInRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

// ============================================
// Date/Time Utilities
// ============================================

/** Format date */
export const formatDate = (
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
};

/** Format time */
export const formatTime = (
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
};

/** Format relative time */
export const formatRelativeTime = (date: Date | string | number): string => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
};

// ============================================
// Function Utilities
// ============================================

/** Debounce function */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/** Throttle function */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/** Memoize function */
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

// ============================================
// Validation Utilities
// ============================================

/** Check if value is valid email */
export const isEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

/** Check if value is valid URL */
export const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/** Check if value is valid JSON */
export const isJson = (value: string): boolean => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/** Check if value is empty */
export const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

// ============================================
// Type Guards
// ============================================

/** Check if value is defined */
export const isDefined = <T>(value: T | undefined | null): value is T => {
  return value !== undefined && value !== null;
};

/** Check if value is string */
export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

/** Check if value is number */
export const isNumber = (value: unknown): value is number => {
  return typeof value === 'object' && value !== null 
    ? Object.prototype.toString.call(value) === '[object Number]'
    : false;
};

/** Check if value is object */
export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

// ============================================
// Class Utilities
// ============================================

/** Conditional class names */
export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/** Convert object to class names */
export const objectToClass = (
  obj: Record<string, boolean>
): string => {
  return Object.entries(obj)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ');
};
