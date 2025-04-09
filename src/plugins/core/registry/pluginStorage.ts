/**
 * Plugin storage management
 * Provides persistent storage for plugin registry data, configurations, and state
 */

import { PluginRegistryEntry } from './pluginRegistry';
import fs from 'fs/promises';
import path from 'path';

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
}

/**
 * File-system based plugin storage provider
 * Stores data in JSON files on disk
 */
export class FileSystemPluginStorage implements PluginStorageProvider {
  private storagePath: string;
  private registryPath: string;
  private configPath: string;
  private statePath: string;
  
  constructor(basePath?: string) {
    this.storagePath = basePath || path.join(process.cwd(), 'plugins-data');
    this.registryPath = path.join(this.storagePath, 'registry.json');
    this.configPath = path.join(this.storagePath, 'configs');
    this.statePath = path.join(this.storagePath, 'state');
    
    this.initialize();
  }
  
  /**
   * Initialize storage directories
   */
  private async initialize(): Promise<void> {
    try {
      // Create base directories
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.mkdir(this.configPath, { recursive: true });
      await fs.mkdir(this.statePath, { recursive: true });
      
      // Ensure registry file exists
      try {
        await fs.access(this.registryPath);
      } catch {
        // Create empty registry if it doesn't exist
        await fs.writeFile(this.registryPath, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Failed to initialize plugin storage:', error);
    }
  }
  
  /**
   * Get all plugin registry entries
   */
  public async getPlugins(): Promise<PluginRegistryEntry[]> {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      const plugins = JSON.parse(data) as PluginRegistryEntry[];
      
      // Convert date strings to Date objects
      return plugins.map(plugin => ({
        ...plugin,
        installedAt: new Date(plugin.installedAt),
        updatedAt: new Date(plugin.updatedAt),
      }));
    } catch (error) {
      console.error('Failed to read plugin registry:', error);
      return [];
    }
  }
  
  /**
   * Save a plugin registry entry
   */
  public async savePlugin(plugin: PluginRegistryEntry): Promise<void> {
    try {
      // Get current registry
      const plugins = await this.getPlugins();
      
      // Update or add the plugin
      const index = plugins.findIndex(p => p.id === plugin.id);
      
      if (index >= 0) {
        plugins[index] = plugin;
      } else {
        plugins.push(plugin);
      }
      
      // Save registry
      await fs.writeFile(
        this.registryPath, 
        JSON.stringify(plugins, null, 2)
      );
    } catch (error) {
      console.error(`Failed to save plugin ${plugin.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a plugin registry entry
   */
  public async removePlugin(id: string): Promise<void> {
    try {
      // Get current registry
      const plugins = await this.getPlugins();
      
      // Remove the plugin
      const updatedPlugins = plugins.filter(p => p.id !== id);
      
      // Save registry
      await fs.writeFile(
        this.registryPath, 
        JSON.stringify(updatedPlugins, null, 2)
      );
      
      // Remove configuration and state files
      try {
        await fs.unlink(this.getPluginConfigPath(id));
      } catch (error) {
        // Ignore if files don't exist
      }
      
      try {
        await fs.unlink(this.getPluginStatePath(id));
      } catch (error) {
        // Ignore if files don't exist
      }
    } catch (error) {
      console.error(`Failed to remove plugin ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the path to a plugin's configuration file
   */
  private getPluginConfigPath(pluginId: string): string {
    return path.join(this.configPath, `${pluginId}.json`);
  }
  
  /**
   * Get the path to a plugin's state file
   */
  private getPluginStatePath(pluginId: string): string {
    return path.join(this.statePath, `${pluginId}.json`);
  }
  
  /**
   * Get plugin configuration data
   */
  public async getPluginConfig(pluginId: string): Promise<Record<string, any> | null> {
    try {
      const configPath = this.getPluginConfigPath(pluginId);
      const data = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Return null if config doesn't exist yet
      return null;
    }
  }
  
  /**
   * Save plugin configuration data
   */
  public async savePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
    try {
      const configPath = this.getPluginConfigPath(pluginId);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(`Failed to save config for plugin ${pluginId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get plugin state data
   */
  public async getPluginState(pluginId: string): Promise<Record<string, any> | null> {
    try {
      const statePath = this.getPluginStatePath(pluginId);
      const data = await fs.readFile(statePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // Return null if state doesn't exist yet
      return null;
    }
  }
  
  /**
   * Save plugin state data
   */
  public async savePluginState(pluginId: string, state: Record<string, any>): Promise<void> {
    try {
      const statePath = this.getPluginStatePath(pluginId);
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error(`Failed to save state for plugin ${pluginId}:`, error);
      throw error;
    }
  }
}

/**
 * In-memory plugin storage provider for testing/development
 */
export class InMemoryPluginStorage implements PluginStorageProvider {
  private plugins: PluginRegistryEntry[] = [];
  private configs: Map<string, Record<string, any>> = new Map();
  private states: Map<string, Record<string, any>> = new Map();
  
  /**
   * Get all plugin registry entries
   */
  public async getPlugins(): Promise<PluginRegistryEntry[]> {
    return [...this.plugins];
  }
  
  /**
   * Save a plugin registry entry
   */
  public async savePlugin(plugin: PluginRegistryEntry): Promise<void> {
    const index = this.plugins.findIndex(p => p.id === plugin.id);
    
    if (index >= 0) {
      this.plugins[index] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }
  
  /**
   * Remove a plugin registry entry
   */
  public async removePlugin(id: string): Promise<void> {
    this.plugins = this.plugins.filter(p => p.id !== id);
    this.configs.delete(id);
    this.states.delete(id);
  }
  
  /**
   * Get plugin configuration data
   */
  public async getPluginConfig(pluginId: string): Promise<Record<string, any> | null> {
    return this.configs.get(pluginId) || null;
  }
  
  /**
   * Save plugin configuration data
   */
  public async savePluginConfig(pluginId: string, config: Record<string, any>): Promise<void> {
    this.configs.set(pluginId, config);
  }
  
  /**
   * Get plugin state data
   */
  public async getPluginState(pluginId: string): Promise<Record<string, any> | null> {
    return this.states.get(pluginId) || null;
  }
  
  /**
   * Save plugin state data
   */
  public async savePluginState(pluginId: string, state: Record<string, any>): Promise<void> {
    this.states.set(pluginId, state);
  }
}

/**
 * Plugin Storage class - main export
 * Default implementation that can be configured to use different providers
 */
export class PluginStorage implements PluginStorageProvider {
  private provider: PluginStorageProvider;
  
  constructor(provider?: PluginStorageProvider) {
    // Use file system storage by default, or the provided storage provider
    this.provider = provider || new FileSystemPluginStorage();
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
    return this.provider.savePlugin(plugin);
  }
  
  /**
   * Remove a plugin registry entry
   */
  public async removePlugin(id: string): Promise<void> {
    return this.provider.removePlugin(id);
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
    return this.provider.savePluginConfig(pluginId, config);
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
}