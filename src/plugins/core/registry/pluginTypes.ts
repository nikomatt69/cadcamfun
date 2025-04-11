/**
 * Core plugin state enumeration.
 * Moved here to avoid circular dependencies.
 */
export enum PluginState {
  NONE = 'none',
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  LOADED = 'loaded',
  ACTIVATED = 'activated',
  DEACTIVATED = 'deactivated',
  ERROR = 'error',
}

// Add other shared core types here if needed in the future 