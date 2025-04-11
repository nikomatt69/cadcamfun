import { PluginManifest, validateManifest } from './pluginManifest';
import { PluginLifecycle } from './pluginLifecycle';
import { PluginStorage } from './pluginStorage';
import { EventEmitter } from 'events';
import { IPluginHost } from '../host/pluginHost';
import { PluginState } from '../registry';

/**
 * Interface for plugin metadata stored in the registry
 */
export interface PluginRegistryEntry {
  id: string;
  manifest: PluginManifest;
  state: PluginState;
  enabled: boolean;
  version: string;
  installedAt: Date;
  updatedAt: Date;
  config?: { [key: string]: any };
  configurationId?: string;
  errorCount: number;
  lastError?: string;
}

/**
 * Registry events emitted during plugin operations
 */
export enum PluginRegistryEvent {
  PLUGIN_INSTALLED = 'plugin:installed',
  PLUGIN_UNINSTALLED = 'plugin:uninstalled',
  PLUGIN_ENABLED = 'plugin:enabled',
  PLUGIN_DISABLED = 'plugin:disabled',
  PLUGIN_UPDATED = 'plugin:updated',
  PLUGIN_ERROR = 'plugin:error',
  REGISTRY_UPDATED = 'registry:updated',
}

/**
 * Plugin Registry class - core component that manages all installed plugins
 * and their metadata. Coordinates with lifecycle and storage.
 */
export class PluginRegistry extends EventEmitter {
  private plugins: Map<string, PluginRegistryEntry> = new Map();
  private lifecycle: PluginLifecycle | null = null;
  private storage: PluginStorage;

  constructor(storage: PluginStorage) {
    super();
    this.storage = storage;
    this.init();
  }

  /**
   * Initialize the registry from persistent storage
   */
  private async init(): Promise<void> {
    try {
      const savedPlugins = await this.storage.getPlugins();
      if (savedPlugins) {
        for (const plugin of savedPlugins) {
          this.plugins.set(plugin.id, plugin);
        }
      }
      console.log(`[Registry] Initialized with ${this.plugins.size} plugins from storage: ${this.storage.constructor.name}`);
    } catch (error) {
      console.error(`[Registry] Failed to initialize from storage (${this.storage.constructor.name}):`, error);
    }
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): PluginRegistryEntry[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin by ID
   */
  public getPlugin(id: string): PluginRegistryEntry | undefined {
    return this.plugins.get(id);
  }

  /**
   * Install a new plugin from its manifest
   */
  public async installPlugin(manifest: PluginManifest, packagePath: string): Promise<PluginRegistryEntry> {
    if (!this.lifecycle) {
      throw new Error('Plugin installation can only be performed on the server-side registry instance.');
    }
    
    const validationResult = validateManifest(manifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid plugin manifest: ${validationResult.errors?.join(', ')}`);
    }
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already installed`);
    }

    // Check dependencies
    if (manifest.dependencies) {
      for (const [depId, versionRange] of Object.entries(manifest.dependencies)) {
        const dependency = this.plugins.get(depId);
        if (!dependency) {
          throw new Error(`Missing dependency: ${depId} (${versionRange})`);
        }
        // TODO: Add version compatibility check
      }
    }

    try {
      const installResult = await this.lifecycle.installPlugin(manifest, packagePath);
       if (!installResult.success) {
           throw new Error(`Lifecycle failed to install plugin: ${installResult.error}`);
       }

      const now = new Date();
      const entry: PluginRegistryEntry = {
        id: manifest.id,
        manifest,
        state: PluginState.INSTALLED,
        enabled: false,
        version: manifest.version,
        installedAt: now,
        updatedAt: now,
        errorCount: 0,
      };

      this.plugins.set(manifest.id, entry);
      await this.storage.savePlugin(entry);
      
      this.emit(PluginRegistryEvent.PLUGIN_INSTALLED, entry);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);

      return entry; 
    } catch (error) {
      console.error(`[Registry] Failed to install plugin ${manifest.id}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin by ID
   */
  public async uninstallPlugin(id: string): Promise<void> {
    if (!this.lifecycle) {
      throw new Error('Plugin uninstallation can only be performed on the server-side registry instance.');
    }
    const plugin = this.plugins.get(id);
    if (!plugin) { throw new Error(`Plugin ${id} is not installed`); }

    // Check for dependent plugins
    const dependentPlugins = this.findDependentPlugins(id);
    if (dependentPlugins.length > 0) {
      throw new Error(
        `Cannot uninstall plugin ${id} because it is required by: ${dependentPlugins.map(p => p.id).join(', ')}`
      );
    }

    try {
      await this.lifecycle.uninstallPlugin(plugin);
      this.plugins.delete(id);
      await this.storage.removePlugin(id);
      this.emit(PluginRegistryEvent.PLUGIN_UNINSTALLED, id);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
      console.log(`[Registry] Plugin ${id} uninstalled.`);
    } catch (error) {
      console.error(`[Registry] Failed to uninstall plugin ${id}:`, error);
      throw error;
    }
  }

  /**
   * Enable a plugin by ID
   */
  public async enablePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) { throw new Error(`Plugin ${id} is not installed`); }
    if (plugin.enabled) {
       console.log(`[Registry] Plugin ${id} is already enabled.`);
       return;
    }
    plugin.enabled = true;
    plugin.state = PluginState.ENABLED;
    plugin.updatedAt = new Date();
    await this.storage.savePlugin(plugin);
    this.emit(PluginRegistryEvent.PLUGIN_ENABLED, plugin);
    this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    console.log(`[Registry] Plugin ${id} enabled.`);
  }

  /**
   * Disable a plugin by ID
   */
  public async disablePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) { throw new Error(`Plugin ${id} is not installed`); }
    if (!plugin.enabled) {
       console.log(`[Registry] Plugin ${id} is already disabled.`);
       return; 
    }
    const dependentPlugins = this.findDependentPlugins(id);
    const enabledDependents = dependentPlugins.filter(p => p.enabled);
    if (enabledDependents.length > 0) {
      throw new Error(
        `Cannot disable plugin ${id} because it is required by these enabled plugins: ${enabledDependents.map(p => p.id).join(', ')}`
      );
    }

    const wasEnabled = plugin.enabled;
    const previousState = plugin.state;

    try {
      plugin.enabled = false;
      plugin.state = PluginState.DISABLED;
      plugin.updatedAt = new Date();
      await this.storage.savePlugin(plugin);
      
      if (this.lifecycle) {
         console.log(`[Registry] Plugin ${id} disabled, attempting to deactivate and unload host...`);
         try {
            await this.lifecycle.deactivateAndUnloadPlugin(plugin);
            console.log(`[Registry] Host for ${id} successfully deactivated and unloaded after disabling.`);
         } catch (unloadError) {
            console.error(`[Registry] Error during host unload after disabling plugin ${id} (non-fatal):`, unloadError);
         }
      }

      this.emit(PluginRegistryEvent.PLUGIN_DISABLED, plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
      console.log(`[Registry] Plugin ${id} marked as disabled.`); 
    } catch (error) {
      console.error(`[Registry] Failed to mark plugin ${id} as disabled:`, error);
      plugin.enabled = true; 
      plugin.state = previousState;
      plugin.updatedAt = plugin.updatedAt;
      throw error;
    }
  }

  /**
   * Update a plugin to a new version
   */
  public async updatePlugin(id: string, newManifest: PluginManifest, packagePath: string): Promise<PluginRegistryEntry> {
    if (!this.lifecycle) {
      throw new Error('Plugin update can only be performed on the server-side registry instance.');
    }
    const plugin = this.plugins.get(id);
    if (!plugin) { throw new Error(`Plugin ${id} not found for update.`); }
    if (id !== newManifest.id) { throw new Error(`Manifest ID (${newManifest.id}) doesn't match update target (${id})`); }
    const validationResult = validateManifest(newManifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid new plugin manifest: ${validationResult.errors?.join(', ')}`);
    }

    try {
      await this.lifecycle.updatePlugin(plugin, newManifest, packagePath);

      plugin.manifest = newManifest;
      plugin.version = newManifest.version;
      plugin.updatedAt = new Date();
      plugin.state = PluginState.INSTALLED;
      plugin.enabled = false;
      plugin.lastError = undefined;
      plugin.errorCount = 0;

      await this.storage.savePlugin(plugin);

      this.emit(PluginRegistryEvent.PLUGIN_UPDATED, plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
      console.log(`[Registry] Plugin ${id} updated to version ${newManifest.version}.`);

      return plugin;
    } catch (error) {
      console.error(`[Registry] Failed to update plugin ${id}:`, error);
      this.recordPluginError(id, `Failed to update: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Record an error that occurred in a plugin
   */
  public recordPluginError(id: string, errorMessage: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.errorCount = (plugin.errorCount || 0) + 1;
      plugin.lastError = errorMessage;
      plugin.updatedAt = new Date();
      plugin.state = PluginState.ERROR;
      this.storage.savePlugin(plugin).catch(err => {
        console.error(`[Registry] Failed to persist plugin error state for ${id}:`, err);
      });
      this.emit(PluginRegistryEvent.PLUGIN_ERROR, { id, error: errorMessage, count: plugin.errorCount });
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    } else {
      console.warn(`[Registry] Attempted to record error for non-existent plugin: ${id}`);
    }
  }

  /**
   * Find all plugins that depend on a specific plugin
   */
  private findDependentPlugins(id: string): PluginRegistryEntry[] {
    return Array.from(this.plugins.values()).filter(plugin => {
      const dependencies = plugin.manifest.dependencies || {};
      return Object.keys(dependencies).includes(id);
    });
  }

  /**
   * Get the lifecycle handler
   */
  public getLifecycle(): PluginLifecycle | null {
    if (!this.lifecycle) {
       // Non è un errore grave chiamarlo sul client, semplicemente non c'è
       // console.warn("[Registry] Attempted to get lifecycle, but it was not set (likely client-side).");
    }
    return this.lifecycle;
  }

  /**
   * Get the active host instance for a plugin
   * Note: This will typically load and activate the plugin if it's not already active.
   * Consider if a separate method to just retrieve without activating is needed.
   */
  public async getPluginHost(pluginId: string): Promise<IPluginHost | undefined> {
    if (!this.lifecycle) {
      console.warn('[Registry] Cannot get plugin host on the client side or without lifecycle manager.');
      return undefined;
    }
    const host = await this.lifecycle.getOrCreateHost(pluginId);
    return host ?? undefined;
  }

  /**
   * Get the storage handler
   */
  public getStorage(): PluginStorage {
    return this.storage;
  }

  public async updateState(id: string, state: PluginState): Promise<void> {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.state = state;
      plugin.updatedAt = new Date();
      await this.storage.savePlugin(plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    }
  }

  // Metodo per iniettare il lifecycle (solo server)
  public setLifecycle(lifecycle: PluginLifecycle): void {
      if (this.lifecycle) {
          console.warn("[Registry] Lifecycle instance already set.");
          return;
      }
      this.lifecycle = lifecycle;
      console.log("[Registry] Lifecycle instance injected.");
  }
}