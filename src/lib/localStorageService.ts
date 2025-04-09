// src/lib/localStorageService.ts

// Size limit for localStorage items in bytes (approximate)
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

// Keys for localStorage
export const STORAGE_KEYS = {
  CAD_LIBRARY: 'cadcam_local_cad_library',
  CAM_LIBRARY: 'cadcam_local_cam_library',
  COMPONENTS_LIBRARY: 'cadcam_local_components_library',
  MATERIALS_LIBRARY: 'cadcam_local_materials_library',
  TOOLS_LIBRARY: 'cadcam_local_tools_library',
  RECENT_PROJECTS: 'cadcam_recent_projects',
  USER_SETTINGS: 'cadcam_user_settings',
};

/**
 * Check if localStorage is available
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    const testKey = '__test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    console.error('localStorage is not available:', e);
    return false;
  }
};

/**
 * Get total localStorage usage in bytes
 */
export const getLocalStorageUsage = (): number => {
  if (!isLocalStorageAvailable()) return 0;
  
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    const value = localStorage.getItem(key) || '';
    total += key.length + value.length;
  }
  
  // Convert to bytes (approximate - JavaScript uses UTF-16)
  return total * 2;
};

/**
 * Get remaining localStorage space in bytes
 */
export const getRemainingStorageSpace = (): number => {
  return LOCAL_STORAGE_LIMIT - getLocalStorageUsage();
};

/**
 * Store data in localStorage
 */
export const storeData = <T>(key: string, data: T): boolean => {
  if (!isLocalStorageAvailable()) return false;
  
  try {
    const serializedData = JSON.stringify(data);
    const dataSize = serializedData.length * 2; // Approximate size in bytes
    
    if (dataSize > LOCAL_STORAGE_LIMIT) {
      console.error(`Data size (${dataSize} bytes) exceeds localStorage limit (${LOCAL_STORAGE_LIMIT} bytes)`);
      return false;
    }
    
    localStorage.setItem(key, serializedData);
    return true;
  } catch (e) {
    console.error(`Error storing data in localStorage for key ${key}:`, e);
    return false;
  }
};

/**
 * Retrieve data from localStorage
 */
export const retrieveData = <T>(key: string): T | null => {
  if (!isLocalStorageAvailable()) return null;
  
  try {
    const serializedData = localStorage.getItem(key);
    if (!serializedData) return null;
    
    return JSON.parse(serializedData) as T;
  } catch (e) {
    console.error(`Error retrieving data from localStorage for key ${key}:`, e);
    return null;
  }
};

/**
 * Remove data from localStorage
 */
export const removeData = (key: string): boolean => {
  if (!isLocalStorageAvailable()) return false;
  
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error(`Error removing data from localStorage for key ${key}:`, e);
    return false;
  }
};

/**
 * Clear all data in localStorage (related to this app)
 */
export const clearAllData = (): boolean => {
  if (!isLocalStorageAvailable()) return false;
  
  try {
    // Only clear app-specific data
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (e) {
    console.error('Error clearing all data from localStorage:', e);
    return false;
  }
};

/**
 * Update existing localStorage data with partial updates
 */
export const updateData = <T>(key: string, updates: Partial<T>): boolean => {
  if (!isLocalStorageAvailable()) return false;
  
  try {
    const existingData = retrieveData<T>(key);
    if (!existingData) return false;
    
    const updatedData = { ...existingData, ...updates };
    return storeData(key, updatedData);
  } catch (e) {
    console.error(`Error updating data in localStorage for key ${key}:`, e);
    return false;
  }
};

/**
 * Storage statistics for the app
 */
export interface StorageStats {
  totalUsage: number; // in bytes
  remainingSpace: number; // in bytes
  usagePercentage: number; // 0-100
  libraryStats: {
    cad: number; // in bytes
    cam: number; // in bytes
    components: number; // in bytes
    materials: number; // in bytes
    tools: number; // in bytes
  };
}

/**
 * Get storage statistics
 */
export const getStorageStats = (): StorageStats => {
  const totalUsage = getLocalStorageUsage();
  const remainingSpace = getRemainingStorageSpace();
  
  // Calculate size of each library
  const cadLibraryData = localStorage.getItem(STORAGE_KEYS.CAD_LIBRARY) || '';
  const camLibraryData = localStorage.getItem(STORAGE_KEYS.CAM_LIBRARY) || '';
  const componentsLibraryData = localStorage.getItem(STORAGE_KEYS.COMPONENTS_LIBRARY) || '';
  const materialsLibraryData = localStorage.getItem(STORAGE_KEYS.MATERIALS_LIBRARY) || '';
  const toolsLibraryData = localStorage.getItem(STORAGE_KEYS.TOOLS_LIBRARY) || '';
  
  return {
    totalUsage,
    remainingSpace,
    usagePercentage: (totalUsage / LOCAL_STORAGE_LIMIT) * 100,
    libraryStats: {
      cad: cadLibraryData.length * 2, // Approximate size in bytes
      cam: camLibraryData.length * 2, // Approximate size in bytes
      components: componentsLibraryData.length * 2, // Approximate size in bytes
      materials: materialsLibraryData.length * 2, // Approximate size in bytes
      tools: toolsLibraryData.length * 2, // Approximate size in bytes
    }
  };
};