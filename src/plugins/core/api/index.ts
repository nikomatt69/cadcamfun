// src/plugins/core/api/index.ts
import { ModelAPI } from './model-api';
import { UIAPI } from './ui-api';
import { FileAPI } from './file-api';
import { NetworkAPI } from './network-api';
import { permissionManager, PermissionManager } from './capabilities';

/**
 * Complete Plugin API
 */
export interface PluginAPI {
  model: ModelAPI;
  ui: UIAPI;
  file: FileAPI;
  network: NetworkAPI;
}

/**
 * Create the complete API for a plugin
 */
export function createPluginAPI(pluginId: string, pluginName: string): PluginAPI {
  return {
    model: new ModelAPI(pluginId, pluginName),
    ui: new UIAPI(pluginId, pluginName),
    file: new FileAPI(pluginId, pluginName),
    network: new NetworkAPI(pluginId, pluginName)
  };
}

// Export all APIs and utilities
export {
  ModelAPI,
  UIAPI,
  FileAPI,
  NetworkAPI,
  permissionManager,
  PermissionManager
};

// Export types from each API
export * from './model-api';
export * from './ui-api';
export * from './file-api';
export * from './network-api';
export * from './capabilities';