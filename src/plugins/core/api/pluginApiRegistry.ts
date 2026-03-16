// src/plugins/core/api/pluginApiRegistry.ts

import type { ModelAPI } from './model-api';
import type { UIAPI } from './ui-api';
import type { FileAPI } from './file-api';
import type { NetworkAPI } from './network-api';

export interface CADAppAPI {
  model: ModelAPI;
  ui: UIAPI;
  file: FileAPI;
  network: NetworkAPI;
}

class PluginApiRegistry {
  private static instance: PluginApiRegistry;
  private api: CADAppAPI | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): PluginApiRegistry {
    if (!PluginApiRegistry.instance) {
      PluginApiRegistry.instance = new PluginApiRegistry();
    }
    return PluginApiRegistry.instance;
  }

  initialize(api: CADAppAPI): void {
    if (this.initialized) {
      console.warn('PluginApiRegistry already initialized');
      return;
    }
    this.api = api;
    this.initialized = true;
    
    if (typeof window !== 'undefined') {
      (window as any).__CAD_APP__ = api;
    }
  }

  getAPI(): CADAppAPI {
    if (!this.api) {
      if (typeof window !== 'undefined') {
        const globalApi = (window as any).__CAD_APP__;
        if (globalApi) {
          this.api = globalApi;
          this.initialized = true;
          return globalApi;
        }
      }
      throw new Error('PluginApiRegistry not initialized. Call initialize() first.');
    }
    return this.api;
  }

  isInitialized(): boolean {
    return this.initialized && this.api !== null;
  }

  reset(): void {
    this.api = null;
    this.initialized = false;
    if (typeof window !== 'undefined') {
      delete (window as any).__CAD_APP__;
    }
  }
}

export const pluginApiRegistry = PluginApiRegistry.getInstance();

export function getPluginAPI(): CADAppAPI {
  return pluginApiRegistry.getAPI();
}
