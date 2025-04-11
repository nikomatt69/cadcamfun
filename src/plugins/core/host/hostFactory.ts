// src/plugins/core/host/hostFactory.ts
import { PluginManifest } from '../registry/pluginManifest';
import { SandboxOptions } from './sandbox';
import { IPluginHost } from './pluginHost'; // Keep interface import

/**
 * Create a plugin host instance based on the plugin manifest requirements.
 * Uses dynamic require() inside the function to defer loading host classes
 * and break potential build-time circular dependencies.
 *
 * @param manifest The plugin manifest.
 * @param sandboxOptions Options for the sandbox environment.
 * @returns An instance of IPluginHost (either IFramePluginHost or WorkerPluginHost).
 */
export function createPluginHost(
  manifest: PluginManifest,
  sandboxOptions: SandboxOptions
): IPluginHost {
  
  // Determine if the plugin explicitly contributes UI elements requiring an iframe
  const hasUIContribution = !!(
    manifest.contributes && (
      manifest.contributes.sidebar || 
      manifest.contributes.propertyPanel || 
      manifest.contributes.menus || // Menus likely interact with or require plugin UI context
      manifest.contributes.themes    // Themes affect UI rendering
    )
  );

  if (hasUIContribution) {
    // Dynamically require IFramePluginHost only when needed
    const { IFramePluginHost } = require('./iframeHost');
    return new IFramePluginHost(manifest, sandboxOptions);
  } else {
    // Dynamically require WorkerPluginHost only when needed
    const { WorkerPluginHost } = require('./workerHost');
    return new WorkerPluginHost(manifest, sandboxOptions);
  }
} 