import { PluginManifest, validateManifest } from './pluginManifest';
import { PluginLifecycle, PluginState } from './pluginLifecycle';
import { PluginStorage } from './pluginStorage';
import { EventEmitter } from 'events';
import { IPluginHost } from '../host/pluginHost';

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
  private lifecycle: PluginLifecycle;
  private storage: PluginStorage;

  constructor(storage: PluginStorage) {
    super();
    this.storage = storage;
    this.lifecycle = new PluginLifecycle(this);
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
      console.log(`Plugin registry initialized with ${this.plugins.size} plugins`);
    } catch (error) {
      console.error('Failed to initialize plugin registry:', error);
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
    // Validate the manifest
    const validationResult = validateManifest(manifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid plugin manifest: ${validationResult.errors?.join(', ')}`);
    }

    // Check if plugin already exists
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
      // Let lifecycle handler do the installation
      await this.lifecycle.installPlugin(manifest, packagePath);

      // Create registry entry
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

      // Add to registry
      this.plugins.set(manifest.id, entry);

      // Persist to storage
      await this.storage.savePlugin(entry);
      
      // Emit event
      this.emit(PluginRegistryEvent.PLUGIN_INSTALLED, entry);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);

      return entry;
    } catch (error) {
      console.error(`Failed to install plugin ${manifest.id}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall a plugin by ID
   */
  public async uninstallPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not installed`);
    }

    // Check for dependent plugins
    const dependentPlugins = this.findDependentPlugins(id);
    if (dependentPlugins.length > 0) {
      throw new Error(
        `Cannot uninstall plugin ${id} because it is required by: ${dependentPlugins.map(p => p.id).join(', ')}`
      );
    }

    try {
      // Let lifecycle handler manage uninstallation
      await this.lifecycle.uninstallPlugin(plugin);

      // Remove from registry
      this.plugins.delete(id);

      // Remove from storage
      await this.storage.removePlugin(id);

      // Emit event
      this.emit(PluginRegistryEvent.PLUGIN_UNINSTALLED, id);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    } catch (error) {
      console.error(`Failed to uninstall plugin ${id}:`, error);
      throw error;
    }
  }

  /**
   * Enable a plugin by ID
   */
  public async enablePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not installed`);
    }

    if (plugin.enabled && plugin.state === PluginState.ACTIVATED) {
      return; // Already enabled and activated
    }

    try {
      // Let lifecycle handler load and activate the plugin
      await this.lifecycle.loadAndActivatePlugin(plugin);

      // Update registry entry
      plugin.enabled = true;
      plugin.state = PluginState.ACTIVATED;
      plugin.updatedAt = new Date();

      // Update storage
      await this.storage.savePlugin(plugin);

      // Emit event
      this.emit(PluginRegistryEvent.PLUGIN_ENABLED, plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    } catch (error) {
      console.error(`Failed to enable plugin ${id}:`, error);
      this.recordPluginError(id, `Failed to enable: ${error instanceof Error ? error.message : String(error)}`);
      if (plugin.state !== PluginState.ERROR) {
        plugin.state = PluginState.ERROR;
        plugin.enabled = false;
        await this.storage.savePlugin(plugin);
        this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
      }
      throw error;
    }
  }

  /**
   * Disable a plugin by ID
   */
  public async disablePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not installed`);
    }

    if (!plugin.enabled) {
      return; // Already disabled
    }

    // Check for dependent plugins
    const dependentPlugins = this.findDependentPlugins(id);
    const enabledDependents = dependentPlugins.filter(p => p.enabled);
    if (enabledDependents.length > 0) {
      throw new Error(
        `Cannot disable plugin ${id} because it is required by these enabled plugins: ${enabledDependents.map(p => p.id).join(', ')}`
      );
    }

    try {
      // Let lifecycle handler deactivate and unload the plugin
      await this.lifecycle.deactivateAndUnloadPlugin(plugin);

      // Update registry entry
      plugin.enabled = false;
      plugin.state = PluginState.DEACTIVATED;
      plugin.updatedAt = new Date();

      // Update storage
      await this.storage.savePlugin(plugin);

      // Emit event
      this.emit(PluginRegistryEvent.PLUGIN_DISABLED, plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);
    } catch (error) {
      console.error(`Failed to disable plugin ${id}:`, error);
      this.recordPluginError(id, `Failed to disable: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update a plugin to a new version
   */
  public async updatePlugin(id: string, newManifest: PluginManifest, packagePath: string): Promise<PluginRegistryEntry> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not installed`);
    }

    // Validate the manifest
    const validationResult = validateManifest(newManifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid plugin manifest: ${validationResult.errors?.join(', ')}`);
    }

    // Ensure IDs match
    if (id !== newManifest.id) {
      throw new Error(`Manifest ID (${newManifest.id}) doesn't match the plugin being updated (${id})`);
    }

    try {
      // Check if plugin is currently enabled
      const wasEnabled = plugin.enabled;

      // Disable if necessary
      if (wasEnabled) {
        await this.disablePlugin(id);
      }

      // Let lifecycle handler update the plugin
      await this.lifecycle.updatePlugin(plugin, newManifest, packagePath);

      // Update registry entry
      plugin.manifest = newManifest;
      plugin.version = newManifest.version;
      plugin.updatedAt = new Date();
      plugin.state = PluginState.INSTALLED;

      // Re-enable if it was enabled before
      if (wasEnabled) {
        await this.enablePlugin(id);
      }

      // Update storage
      await this.storage.savePlugin(plugin);

      // Emit event
      this.emit(PluginRegistryEvent.PLUGIN_UPDATED, plugin);
      this.emit(PluginRegistryEvent.REGISTRY_UPDATED);

      return plugin;
    } catch (error) {
      console.error(`Failed to update plugin ${id}:`, error);
      this.recordPluginError(id, `Failed to update: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Record an error that occurred in a plugin
   */
  public recordPluginError(id: string, errorMessage: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      console.warn(`Attempted to record error for non-existent plugin ${id}: ${errorMessage}`);
      return;
    }

    // Update error information
    plugin.errorCount += 1;
    plugin.lastError = errorMessage;
    plugin.updatedAt = new Date();

    // Try to persist, but don't wait
    this.storage.savePlugin(plugin).catch(err => {
      console.error(`Failed to persist plugin error for ${id}:`, err);
    });

    // Emit event
    this.emit(PluginRegistryEvent.PLUGIN_ERROR, { id, error: errorMessage, count: plugin.errorCount });
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
  public getLifecycle(): PluginLifecycle {
    return this.lifecycle;
  }

  /**
   * Get the active host instance for a plugin
   * Note: This will typically load and activate the plugin if it's not already active.
   * Consider if a separate method to just retrieve without activating is needed.
   */
  public async getPluginHost(pluginId: string): Promise<IPluginHost | undefined> {
    const pluginEntry = this.plugins.get(pluginId);
    if (!pluginEntry) {
      console.warn(`Attempted to get host for non-existent plugin: ${pluginId}`);
      return undefined;
    }
    
    if (!pluginEntry.enabled) {
       console.warn(`Attempted to get host for disabled plugin: ${pluginId}. Enabling first.`);
       // Decide if enabling automatically is desired here
       try {
         await this.enablePlugin(pluginId); // Enable implicitly might be needed for UI components
       } catch (error) {
         console.error(`Failed to auto-enable plugin ${pluginId} before getting host:`, error);
         return undefined; // Failed to enable, can't get host
       }
    }
    
    // Now that it should be enabled, get/create the host via lifecycle
    try {
      // Use loadAndActivatePlugin which handles creation and activation
      const host = await this.lifecycle.loadAndActivatePlugin(pluginEntry);
      return host;
    } catch (error) {
      console.error(`Failed to get or activate host for plugin ${pluginId}:`, error);
      // Error is already recorded by lifecycle
      return undefined;
    }
  }

  /**
   * Get the storage handler
   */
  public getStorage(): PluginStorage {
    return this.storage;
  }
}