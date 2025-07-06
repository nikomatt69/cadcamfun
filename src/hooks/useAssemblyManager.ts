import { assemblyManager } from "../store/assemblyStore";
import { AssemblyManager } from "../lib/assembly/AssemblyManager";

/**
 * Custom hook to access the singleton AssemblyManager instance.
 *
 * This provides direct access to the manager's methods for complex operations
 * or scenarios where Zustand store actions are insufficient.
 *
 * Note: Components using this hook will *not* automatically re-render on
 * assembly state changes managed internally by AssemblyManager unless
 * they also subscribe to the Zustand store (`useAssemblyStore`).
 */
export const useAssemblyManager = (): AssemblyManager => {
  // Return the singleton instance imported from the store setup
  return assemblyManager;
};
