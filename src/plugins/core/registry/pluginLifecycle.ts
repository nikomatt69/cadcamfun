/**
 * Plugin lifecycle management
 * Handles installation, activation, deactivation, and uninstallation of plugins
 */

import { PluginManifest } from './pluginManifest';
import path from 'path';
import fs from 'fs/promises';
import { IPluginHost, PluginHostBase } from '../host/pluginHost';
import { IFramePluginHost } from '../host/iframeHost';
import { WorkerPluginHost } from '../host/workerHost';
import { SandboxOptions } from '../host/sandbox';

// Forward reference to avoid circular dependency
// The registry will inject itself during construction
type PluginRegistry = any;

/**
 * Plugin states in the lifecycle
 */
export enum PluginState {
  NONE = 'none',
  INSTALLED = 'installed',
  LOADED = 'loaded',
  ACTIVATED = 'activated',
  DEACTIVATED = 'deactivated',
  ERROR = 'error',
}

/**
 * Plugin package extraction and installation result
 */
interface PluginInstallationResult {
  success: boolean;
  path: string;
  error?: string;
}

/**
 * Plugin runtime instance
 */
interface PluginRuntime {
  id: string;
  instance: any;
  api: any;
}

/**
 * Plugin lifecycle manager
 * Responsible for the full plugin lifecycle from installation to uninstallation
 */
export class PluginLifecycle {
  private registry: PluginRegistry;
  private pluginsDir: string;
  private activeHosts: Map<string, IPluginHost> = new Map();
  private defaultSandboxOptions: SandboxOptions;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
    this.pluginsDir = path.join(process.cwd(), 'plugins-data');
    this.ensurePluginsDirectory();
    this.defaultSandboxOptions = {
        csp: {
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "https:", "data:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://*"],
            frameSrc: ["'none'"],
        },
        allowEval: false,
        allowParentAccess: false,
    };
  }

  /**
   * Ensure the plugins directory exists
   */
  private async ensurePluginsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create plugins directory:', error);
    }
  }

  /**
   * Get the directory path for a plugin
   */
  private getPluginDirectory(pluginId: string): string {
    return path.join(this.pluginsDir, pluginId);
  }

  /**
   * Install a plugin from a package file
   */
  public async installPlugin(manifest: PluginManifest, packagePath: string): Promise<PluginInstallationResult> {
    try {
      const pluginDir = this.getPluginDirectory(manifest.id);
      
      // Create plugin directory
      await fs.mkdir(pluginDir, { recursive: true });
      
      // TODO: Extract the package file (likely a ZIP) to the plugin directory
      // For now, simulating extraction
      console.log(`Installing plugin ${manifest.id} from ${packagePath} to ${pluginDir}`);
      
      // Save the manifest file
      await fs.writeFile(
        path.join(pluginDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );
      
      return {
        success: true,
        path: pluginDir,
      };
    } catch (error) {
      console.error(`Failed to install plugin ${manifest.id}:`, error);
      return {
        success: false,
        path: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Load and Activate a plugin
   */
  public async loadAndActivatePlugin(entry: any): Promise<IPluginHost> {
    const { id, manifest } = entry;
    
    // Skip if already activated
    if (this.activeHosts.has(id)) {
      const existingHost = this.activeHosts.get(id)!;
      if (existingHost.getState() === PluginState.ACTIVATED) {
          console.log(`Plugin ${id} is already active.`);
          return existingHost;
      } else if (existingHost.getState() === PluginState.LOADED) {
          // Already loaded, just activate
          try {
              await existingHost.activate();
              console.log(`Successfully activated plugin ${id}`);
              return existingHost;
          } catch (error) {
              console.error(`Failed to activate already loaded plugin ${id}:`, error);
              this.registry.recordPluginError(id, `Re-activation error: ${error instanceof Error ? error.message : String(error)}`);
              throw error;
          }
      }
      // If in error or other state, try removing and re-creating
      await this.deactivateAndUnloadPlugin(entry);
    }
    
    try {
      // Determine host type (simple example: iframe if sidebar exists)
      const requiresUI = !!manifest.contributes?.sidebar; // Add more sophisticated checks as needed
      let host: IPluginHost;

      if (requiresUI) {
        console.log(`Creating IFrame host for plugin ${id}`);
        host = new IFramePluginHost(manifest, this.defaultSandboxOptions);
      } else {
        console.log(`Creating Worker host for plugin ${id}`);
        host = new WorkerPluginHost(manifest, this.defaultSandboxOptions);
      }

      // Load the plugin code
      await host.load(); 
      
      // Activate the plugin
      await host.activate();
      
      // Store the active host
      this.activeHosts.set(id, host);
      
      console.log(`Successfully loaded and activated plugin ${id}`);
      return host;
    } catch (error) {
      console.error(`Failed to load and activate plugin ${id}:`, error);
      this.registry.recordPluginError(id, `Activation error: ${error instanceof Error ? error.message : String(error)}`);
      // Attempt cleanup if host was partially created
      const partialHost = this.activeHosts.get(id);
      if (partialHost) {
        try { await partialHost.unload(); } catch (e) { /* ignore cleanup error */ }
        this.activeHosts.delete(id);
      }
      throw error;
    }
  }

  /**
   * Deactivate and Unload a plugin
   */
  public async deactivateAndUnloadPlugin(entry: any): Promise<void> {
    const { id } = entry;
    const host = this.activeHosts.get(id);

    if (!host) {
      console.log(`Plugin ${id} is not active, nothing to deactivate/unload.`);
      return;
    }
    
    try {
      if (host.getState() === PluginState.ACTIVATED) {
        await host.deactivate();
      }
      await host.unload(); 
      
      this.activeHosts.delete(id);
      
      console.log(`Successfully deactivated and unloaded plugin ${id}`);
    } catch (error) {
      console.error(`Failed to deactivate/unload plugin ${id}:`, error);
      this.registry.recordPluginError(id, `Deactivation/Unload error: ${error instanceof Error ? error.message : String(error)}`);
      // Keep host in map if deactivation/unload failed? Or remove? Let's remove.
      this.activeHosts.delete(id); 
      throw error;
    }
  }

  /**
   * Uninstall a plugin - remove its files
   */
  public async uninstallPlugin(entry: any): Promise<void> {
    const { id } = entry;
    
    // Deactivate first if active
    if (this.activeHosts.has(id)) {
      await this.deactivateAndUnloadPlugin(entry);
    }
    
    try {
      const pluginDir = this.getPluginDirectory(id);
      
      // Remove the plugin directory
      await fs.rm(pluginDir, { recursive: true, force: true });
      
      console.log(`Successfully uninstalled plugin ${id}`);
    } catch (error) {
      console.error(`Failed to uninstall plugin ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update a plugin to a new version
   */
  public async updatePlugin(entry: any, newManifest: PluginManifest, packagePath: string): Promise<void> {
    const { id } = entry;
    
    // Deactivate the current version
    if (this.activeHosts.has(id)) {
      await this.deactivateAndUnloadPlugin(entry);
    }
    
    try {
      // Remove existing files except configuration
      const pluginDir = this.getPluginDirectory(id);
      
      // Create a temporary directory for the new version
      const tempDir = `${pluginDir}_temp`;
      
      // Install the new version to the temporary directory
      const installResult = await this.installPlugin(newManifest, packagePath);
      
      if (!installResult.success) {
        throw new Error(`Failed to install new version: ${installResult.error}`);
      }
      
      // Remove the old version
      await fs.rm(pluginDir, { recursive: true, force: true });
      
      // Rename the temporary directory to the plugin directory
      await fs.rename(tempDir, pluginDir);
      
      console.log(`Successfully updated plugin ${id} to version ${newManifest.version}`);
    } catch (error) {
      console.error(`Failed to update plugin ${id}:`, error);
      this.registry.recordPluginError(id, `Update error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get an active plugin host instance
   */
  public getHost(pluginId: string): IPluginHost | undefined {
    return this.activeHosts.get(pluginId);
  }

  /**
   * Get all active plugin hosts
   */
  public getActiveHosts(): Map<string, IPluginHost> {
    return this.activeHosts;
  }
}