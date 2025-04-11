/**
 * Plugin storage management
 * Provides persistent storage for plugin registry data, configurations, and state
 */

import { PluginRegistryEntry } from './pluginRegistry';
import { DatabasePluginStorage } from '@/src/server/storage/DatabasePluginStorage';

/**
 * Plugin storage provider interface
 */
export interface PluginStorageProvider {
  /**
   * Get all plugin registry entries
   */
  getPlugins(): Promise<PluginRegistryEntry[]>;
  
  /**
   * Save a plugin registry entry
   */
  savePlugin(plugin: PluginRegistryEntry): Promise<void>;
  
  /**
   * Remove a plugin registry entry
   */
  removePlugin(id: string): Promise<void>;
  
  /**
   * Get plugin configuration data
   */
  getPluginConfig(pluginId: string): Promise<Record<string, any> | null>;
  
  /**
   * Save plugin configuration data
   */
  savePluginConfig(pluginId: string, config: Record<string, any>): Promise<void>;
  
  /**
   * Get plugin state data
   */
  getPluginState(pluginId: string): Promise<Record<string, any> | null>;
  
  /**
   * Save plugin state data
   */
  savePluginState(pluginId: string, state: Record<string, any>): Promise<void>;
  
  /**
   * Remove plugin configuration data
   */
  removePluginConfig(pluginId: string): Promise<void>;
}

/**
 * Plugin Storage class - main export
 * Default implementation that can be configured to use different providers
 */
export class PluginStorage implements PluginStorageProvider {
  private provider: PluginStorageProvider;
  
  constructor(provider: PluginStorageProvider) {
    // Assign the provided provider
    console.log(`[PluginStorage] Initializing with provider: ${provider.constructor.name}`);
    this.provider = provider;
  }
  
  /**
   * Get all plugin registry entries
   */
  public async getPlugins(): Promise<PluginRegistryEntry[]> {
    return this.provider.getPlugins();
  }
  
  /**
   * Save a plugin registry entry
   */
  public async savePlugin(plugin: PluginRegistryEntry): Promise<void> {
    await this.provider.savePlugin(plugin);
    // Config is saved separately now
    if (plugin.config) {
      await this.provider.savePluginConfig(plugin.id, plugin.config);
    } else {
      // Ensure config is removed if it becomes undefined/null for the plugin
      await this.provider.removePluginConfig(plugin.id).catch(() => {}); // Ignore remove errors if not found
    }
  }
  
  /**
   * Remove a plugin registry entry
   */
  public async removePlugin(id: string): Promise<void> {
    await this.provider.removePlugin(id);
    // Config removal is handled by onDelete: Cascade in Prisma schema
  }
  
  /**
   * Get plugin configuration data
   */
  public async getPluginConfig(pluginId: string): Promise<Record<string, any> | null> {
    return this.provider.getPluginConfig(pluginId);
  }
  
  /**
   * Save plugin configuration data
   */
  public async savePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
    await this.provider.savePluginConfig(pluginId, config);
  }
  
  /**
   * Get plugin state data
   */
  public async getPluginState(pluginId: string): Promise<Record<string, any> | null> {
    return this.provider.getPluginState(pluginId);
  }
  
  /**
   * Save plugin state data
   */
  public async savePluginState(pluginId: string, state: Record<string, any>): Promise<void> {
    return this.provider.savePluginState(pluginId, state);
  }
  
  /**
   * Remove plugin configuration data
   */
  public async removePluginConfig(pluginId: string): Promise<void> {
    await this.provider.removePluginConfig(pluginId);
  }
}

// --- Re-add InMemoryPluginStorage --- 
export class InMemoryPluginStorage implements PluginStorageProvider {
    private plugins: Map<string, PluginRegistryEntry> = new Map();
    private configs: Map<string, Record<string, any>> = new Map();
    private states: Map<string, Record<string, any>> = new Map(); // Optional: if state needs storing

    constructor() {
        console.log("[InMemoryPluginStorage] Initialized.");
    }

    async getPlugins(): Promise<PluginRegistryEntry[]> {
        return Array.from(this.plugins.values());
    }

    async savePlugin(pluginEntry: PluginRegistryEntry): Promise<void> {
        // Deep clone to prevent accidental modification of the stored object
        const entryCopy = JSON.parse(JSON.stringify(pluginEntry));
        // Separate config handling if needed, or assume savePlugin saves the whole entry
        const { config, ...restOfEntry } = entryCopy;
        this.plugins.set(pluginEntry.id, restOfEntry as PluginRegistryEntry);
        if (config) {
             this.savePluginConfig(pluginEntry.id, config);
        }
    }

    async removePlugin(pluginId: string): Promise<void> {
        this.plugins.delete(pluginId);
        this.configs.delete(pluginId);
        this.states.delete(pluginId); // Remove state too
    }

    async getPluginConfig(pluginId: string): Promise<Record<string, any> | null> {
        return this.configs.get(pluginId) || null;
    }

    async savePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
        this.configs.set(pluginId, JSON.parse(JSON.stringify(config))); // Store copy
    }

    async getPluginState(pluginId: string): Promise<Record<string, any> | null> {
       return this.states.get(pluginId) || null;
    }

    async savePluginState(pluginId: string, state: Record<string, any>): Promise<void> {
        this.states.set(pluginId, JSON.parse(JSON.stringify(state))); // Store copy
    }
    
    async removePluginConfig(pluginId: string): Promise<void> {
         this.configs.delete(pluginId);
    }
}