// src/lib/api/validation.ts
export function validateNumber(value: any, defaultValue: number = 0): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  }
  
  export function validateBoolean(value: any, defaultValue: boolean = false): boolean {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return defaultValue;
  }