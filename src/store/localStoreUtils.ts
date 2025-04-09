import { StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { storeData, retrieveData } from '@/src/lib/localStorageService';

// Type for local store state that includes common fields
export interface LocalStoreState {
  isLoading: boolean;
  error: string | null;
}

// Type for local store options
export interface LocalStoreOptions {
  name: string;
  storageKey: string;
  version?: number;
  enableDevtools?: boolean;
}

// Create middleware for local storage persistence
export const withLocalStorage = <T extends LocalStoreState>(
  storageKey: string,
  initializer: StateCreator<T>
): StateCreator<T> => {
  return (set, get, store) => {
    const wrappedInitializer = initializer(
      (partial, replace) => {
        // Apply the state update
        set(partial, replace);
        
        // Save to localStorage if not loading
        if (!get().isLoading) {
          try {
            const state = get();
            const { isLoading, error, ...persistedState } = state;
            storeData(storageKey, persistedState);
          } catch (error) {
            console.error('Failed to save to localStorage:', error);
          }
        }
      },
      get,
      store
    );
    
    return wrappedInitializer;
  };
};

// Create middleware for error handling
export const withErrorHandling = <T extends LocalStoreState>(
  initializer: StateCreator<T>
): StateCreator<T> => {
  return (set, get, store) => {
    const wrappedInitializer = initializer(
      (partial, replace) => {
        if (partial instanceof Function) {
          set(partial, replace);
          return;
        }
        
        // Clear error when setting new state unless explicitly setting error
        if (!('error' in partial)) {
          set({ ...partial, error: null } as T, replace);
          return;
        }
        
        set(partial, replace);
      },
      get,
      store
    );
    
    return wrappedInitializer;
  };
};

// Create middleware for loading state
export const withLoadingState = <T extends LocalStoreState>(
  initializer: StateCreator<T>
): StateCreator<T> => {
  return (set, get, store) => {
    const wrappedInitializer = initializer(
      (partial, replace) => {
        if (partial instanceof Function) {
          set(partial, replace);
          return;
        }
        
        // Automatically set isLoading to false when state is updated
        if ('isLoading' in partial) {
          set(partial, replace);
        } else {
          set({ ...partial, isLoading: false } as T, replace);
        }
      },
      get,
      store
    );
    
    return wrappedInitializer;
  };
};

// Create a local store with all middleware
export const createLocalStore = <T extends LocalStoreState>(
  initializer: StateCreator<T>,
  options: LocalStoreOptions
) => {
  let pipeline = initializer;
  
  // Add error handling
  pipeline = withErrorHandling(pipeline);
  
  // Add loading state management
  pipeline = withLoadingState(pipeline);
  
  // Add local storage persistence
  pipeline = withLocalStorage(options.storageKey, pipeline);
  
  // Add devtools in development (fixed type error with explicit casting)
  if (options.enableDevtools || process.env.NODE_ENV === 'development') {
    pipeline = devtools(pipeline, {
      name: options.name,
      enabled: true
    }) as StateCreator<T>;
  }
  
  return pipeline;
};

// Helper for loading data from localStorage
export const loadFromStorage = <T>(
  storageKey: string,
  onError?: (error: Error) => void
): T | null => {
  try {
    return retrieveData<T>(storageKey);
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return null;
  }
};

// Helper for saving data to localStorage
export const saveToStorage = <T>(
  storageKey: string,
  data: T,
  onError?: (error: Error) => void
): boolean => {
  try {
    return storeData(storageKey, data);
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return false;
  }
}; 