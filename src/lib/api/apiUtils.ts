// src/lib/utils/apiUtils.ts

/**
 * Fetch wrapper with error handling for API requests
 */
export async function fetchWithErrorHandling(url: string, options?: RequestInit): Promise<any> {
    try {
      const response = await fetch(url, options);
      
      // Parse response JSON
      const data = await response.json();
      
      // Check if response is not OK (status outside of 200-299 range)
      if (!response.ok) {
        // Try to extract error message from response
        const errorMessage = data?.message || data?.error || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }
      
      // Return data or data.data if present (for standardized API responses)
      return data.data !== undefined ? data.data : data;
    } catch (error) {
      // Re-throw error for the caller to handle
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('An unknown error occurred');
      }
    }
  }
  
  /**
   * Helper function to build query parameters
   */
  export function buildQueryString(params: Record<string, any>): string {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(item => queryParams.append(key, String(item)));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });
    
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }