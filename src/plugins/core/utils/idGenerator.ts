// src/plugins/core/utils/id-generator.ts

/**
 * Generates a unique ID for use in messaging and other contexts
 * Format: prefix_timestamp_random
 * 
 * @param prefix Optional prefix for the ID
 * @returns A unique string ID
 */
export function generateId(prefix = 'id'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  }
  
  /**
   * Generates a deterministic ID based on input values
   * Useful for creating consistent IDs for the same entities
   * 
   * @param namespace Namespace for the ID
   * @param values Array of values to hash
   * @returns A deterministic string ID
   */
  export function generateDeterministicId(namespace: string, ...values: any[]): string {
    // Simple string-based hash function
    const hash = (str: string): number => {
      let hashValue = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hashValue = ((hashValue << 5) - hashValue) + char;
        hashValue = hashValue & hashValue; // Convert to 32bit integer
      }
      return Math.abs(hashValue);
    };
    
    // Convert all values to strings and join
    const valueString = values.map(v => 
      typeof v === 'object' ? JSON.stringify(v) : String(v)
    ).join('|');
    
    // Generate hash
    const hashValue = hash(`${namespace}:${valueString}`);
    
    // Convert to base36 for shorter strings
    return `${namespace}_${hashValue.toString(36)}`;
  }
  
  /**
   * Validates that a string is a valid ID
   * 
   * @param id The ID to validate
   * @param prefix Optional prefix to check for
   * @returns True if the ID is valid
   */
  export function validateId(id: string, prefix?: string): boolean {
    // Check if the ID format is valid
    const parts = id.split('_');
    
    // Basic format check
    if (parts.length < 3) {
      return false;
    }
    
    // Check prefix if provided
    if (prefix && parts[0] !== prefix) {
      return false;
    }
    
    // Check that the timestamp part is a valid number
    const timestamp = parseInt(parts[1], 10);
    if (isNaN(timestamp)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Extracts timestamp from an ID
   * 
   * @param id The ID to extract timestamp from
   * @returns Timestamp as a number, or null if invalid
   */
  export function getTimestampFromId(id: string): number | null {
    const parts = id.split('_');
    if (parts.length < 2) return null;
    
    const timestamp = parseInt(parts[1], 10);
    return isNaN(timestamp) ? null : timestamp;
  }