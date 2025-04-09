// src/plugins/core/host/plugin-host.ts
import { PluginManifest } from '../registry/pluginManifest';
import { PluginBridge } from './pluginBridge';
import { PluginState } from '../registry/pluginLifecycle';
import { SandboxOptions } from './sandbox';

/**
 * Interface for Plugin Host implementations
 * Provides a common API for different host environments (Worker, iFrame, etc.)
 */
export interface IPluginHost {
  /** Load and initialize the plugin */
  load(): Promise<void>;
  
  /** Activate the plugin */
  activate(): Promise<void>;
  
  /** Deactivate the plugin */
  deactivate(): Promise<boolean>;
  
  /** Unload and clean up the plugin */
  unload(): Promise<void>;
  
  /** Get the current lifecycle state of the plugin */
  getState(): PluginState;
  
  /** Get the communication bridge for this plugin */
  getBridge(): PluginBridge;
  
  /** Get the plugin's manifest */
  getManifest(): PluginManifest;
}

/**
 * Abstract base class for plugin hosts
 * Implements common functionality across different host types
 */
export abstract class PluginHostBase implements IPluginHost {
  protected state: PluginState = PluginState.INSTALLED;
  protected bridge: PluginBridge;
  
  constructor(
    protected manifest: PluginManifest,
    protected sandboxOptions: SandboxOptions
  ) {
    this.bridge = new PluginBridge(manifest.id);
  }
  
  /**
   * Load the plugin code and initialize the environment
   * Abstract method to be implemented by specific host types
   */
  public abstract load(): Promise<void>;
  
  /**
   * Activate the plugin by calling its activate method
   */
  public async activate(): Promise<void> {
    if (this.state !== PluginState.LOADED) {
      throw new Error(`Cannot activate plugin ${this.manifest.id} in state ${this.state}`);
    }
    
    try {
      // Call the plugin's activate method via RPC
      await this.bridge.call('_lifecycle.activate', {});
      this.state = PluginState.ACTIVATED;
      console.log(`Plugin ${this.manifest.id} activated successfully`);
    } catch (error) {
      console.error(`Failed to activate plugin ${this.manifest.id}:`, error);
      throw new Error(`Activation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Deactivate the plugin by calling its deactivate method
   */
  public async deactivate(): Promise<boolean> {
    if (this.state !== PluginState.ACTIVATED) {
      console.warn(`Plugin ${this.manifest.id} is not active, cannot deactivate`);
      return false;
    }
    
    try {
      // Call the plugin's deactivate method via RPC
      await this.bridge.call('_lifecycle.deactivate', {});
      this.state = PluginState.LOADED;
      console.log(`Plugin ${this.manifest.id} deactivated successfully`);
      return true;
    } catch (error) {
      console.error(`Failed to deactivate plugin ${this.manifest.id}:`, error);
      return false;
    }
  }
  
  /**
   * Unload the plugin and clean up resources
   * Abstract method to be implemented by specific host types
   */
  public abstract unload(): Promise<void>;
  
  /**
   * Get the current lifecycle state of the plugin
   */
  public getState(): PluginState {
    return this.state;
  }
  
  /**
   * Get the communication bridge for this plugin
   */
  public getBridge(): PluginBridge {
    return this.bridge;
  }
  
  /**
   * Get the plugin's manifest
   */
  public getManifest(): PluginManifest {
    return this.manifest;
  }
  
  /**
   * Handle plugin errors
   */
  protected handleError(error: Error, context: string): void {
    console.error(`Plugin ${this.manifest.id} error in ${context}:`, error);
    
    // Dispatch an error event that can be handled by the plugin registry
    const errorEvent = new CustomEvent('plugin-error', {
      detail: {
        pluginId: this.manifest.id,
        error: {
          message: error.message,
          stack: error.stack,
          context
        }
      }
    });
    
    window.dispatchEvent(errorEvent);
  }
  
  /**
   * Create a plugin host factory based on the plugin requirements
   */
  public static create(
    manifest: PluginManifest,
    sandboxOptions: SandboxOptions
  ): IPluginHost {
    // Determine the best host type based on the plugin's needs
    if (manifest.contributes?.sidebar || (manifest.contributes as any)?.views) {
      // If the plugin needs UI, use an iFrame host
      const { IFramePluginHost } = require('./iframeHost');
      return new IFramePluginHost(manifest, sandboxOptions);
    } else {
      // For plugins without UI, use a Worker host for better isolation
      const { WorkerPluginHost } = require('./workerHost');
      return new WorkerPluginHost(manifest, sandboxOptions);
    }
  }
}