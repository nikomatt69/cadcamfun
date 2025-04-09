import { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Type for middleware chain
type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
type Cast<T, U> = T extends U ? T : U;
type Write<T, U> = Omit<T, keyof U> & U;
type WithDevtools<S> = Write<S, { state: ExtractState<S> }>;

// Middleware Types
export type StoreWithPersist<T> = T & {
  _hasHydrated: boolean;
  _persist: {
    getOptions: () => unknown;
    setOptions: (options: unknown) => void;
    clearStorage: () => void;
  };
};

// Performance monitoring middleware
export const withPerformanceTracking = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>
): StateCreator<T, Mps, Mcs> => {
  return (set, get, store) => {
    const measured = f(
      ((partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => {
        const start = performance.now();
        set(partial, replace);
        const end = performance.now();
        console.log(`State update took: ${end - start}ms`);
      }) as typeof set,
      get,
      store
    );
    return measured;
  };
};

// Action validation middleware
export const withValidation = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  validationFn: (state: T) => boolean,
  errorMsg: string = 'Invalid state'
) => {
  return (f: StateCreator<T, Mps, Mcs>): StateCreator<T, Mps, Mcs> => {
    return (set, get, store) => {
      const validated = f(
        ((partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => {
          const newState = typeof partial === 'function' 
            ? partial(get())
            : partial;
          
          if (!validationFn(newState as T)) {
            console.error(errorMsg);
            return;
          }
          set(partial, replace);
        }) as typeof set,
        get,
        store
      );
      return validated;
    };
  };
};

// Selector creator with memoization
export const createSelector = <T extends object, U>(
  selector: (state: T) => U,
  equalityFn: (a: U, b: U) => boolean = (a, b) => a === b
) => {
  let lastResult: U;
  let lastState: T | undefined;

  return (state: T): U => {
    if (!lastState || !equalityFn(selector(lastState), selector(state))) {
      lastResult = selector(state);
      lastState = state;
    }
    return lastResult;
  };
};

// Create store with middleware
export const createStoreWithMiddleware = <T extends object>(
  initializer: StateCreator<T>,
  options: {
    name: string;
    persist?: boolean;
    version?: number;
    validation?: (state: T) => boolean;
    performanceTracking?: boolean;
  }
) => {
  let pipeline: StateCreator<T, any, any> = initializer;

  // Add validation if requested
  if (options.validation) {
    pipeline = withValidation(options.validation)(pipeline);
  }

  // Add performance tracking if requested
  if (options.performanceTracking) {
    pipeline = withPerformanceTracking(pipeline);
  }

  // Always add devtools
  pipeline = devtools(pipeline, { name: options.name });

  // Add persistence if requested
  if (options.persist) {
    pipeline = persist(pipeline, {
      name: `${options.name}-storage`,
      version: options.version || 1,
    });
  }

  return pipeline;
};

// Helper for combining selectors
export const combineSelectors = <T extends object, U extends { [key: string]: (state: T) => any }>(
  selectors: U
): ((state: T) => { [K in keyof U]: ReturnType<U[K]> }) => {
  return (state: T) => {
    const result: any = {};
    for (const key in selectors) {
      result[key] = selectors[key](state);
    }
    return result;
  };
}; 