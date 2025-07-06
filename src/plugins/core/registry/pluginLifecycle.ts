/**
 * Plugin lifecycle management
 * Handles installation, activation, deactivation, and uninstallation of plugins
 */

import { PluginManifest } from "./pluginManifest";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs"; // Keep for potential sync needs, but prefer async
import { IPluginHost } from "../host/pluginHost";
import { createPluginHost } from "../host/hostFactory";
import { SandboxOptions } from "../host/sandbox";
import { PluginState } from "./pluginTypes";
// Remove unzipper and stream-buffers as we won't re-process the zip
// import unzipper from 'unzipper';
// import streamBuffers from 'stream-buffers';
import {
  uploadToBucket,
  deleteFromBucket,
  listObjectKeysByPrefix,
  deleteMultipleObjects
} from "@/src/lib/storageService";

// Forward reference to avoid circular dependency
// The registry will inject itself during construction
type PluginRegistry = any;

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
  private activeHosts: Map<string, IPluginHost> = new Map();
  private defaultSandboxOptions: SandboxOptions;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
    this.defaultSandboxOptions = {
      csp: {
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "https:", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://*"],
        frameSrc: ["'self'"] // Adjust if plugins need to embed frames
      },
      allowEval: false,
      allowParentAccess: false
      // Add other default sandbox settings as needed
    };
  }

  /**
   * Helper function to recursively upload directory contents
   */
  async uploadDirectoryContents(localDirPath: string, bucketPrefix: string, rootDir: string): Promise<string[]> {
    const uploadedKeys: string[] = [];
    const entries = await fs.readdir(localDirPath, { withFileTypes: true });

    for (const entry of entries) {
      const currentLocalPath = path.join(localDirPath, entry.name);
      // Calculate relative path from the root extraction dir for bucket key
      const relativePath = path.relative(rootDir, currentLocalPath).replace(/\\/g, "/"); // Ensure forward slashes
      const bucketKey = `${bucketPrefix}${relativePath}`;

      if (entry.isDirectory()) {
        // Recursively upload subdirectory contents
        const subDirKeys = await this.uploadDirectoryContents(currentLocalPath, bucketPrefix, rootDir);
        uploadedKeys.push(...subDirKeys);
      } else if (entry.isFile()) {
        try {
          // console.log(`[Lifecycle] Uploading file: ${currentLocalPath} -> ${bucketKey}`);
          const fileBuffer = await fs.readFile(currentLocalPath);
          const contentType = "application/octet-stream"; // Or determine based on file extension

          // --- BEGIN ADDED LOGGING ---
          console.log(`[Lifecycle DEBUG] Attempting upload: Local='${currentLocalPath}', BucketKey='${bucketKey}'`);
          // --- END ADDED LOGGING ---

          const uploadedPath = await uploadToBucket(bucketKey, fileBuffer, contentType);

          // --- BEGIN ADDED LOGGING ---
          console.log(
            `[Lifecycle DEBUG] Successfully uploaded to BucketKey='${bucketKey}' (Returned path: ${uploadedPath})`
          );
          // --- END ADDED LOGGING ---

          uploadedKeys.push(uploadedPath);
        } catch (uploadErr) {
          console.error(`[Lifecycle] Upload failed for ${currentLocalPath} to ${bucketKey}:`, uploadErr);
          // --- BEGIN ADDED LOGGING ---
          console.error(
            `[Lifecycle DEBUG] FAILED upload: Local='${currentLocalPath}', BucketKey='${bucketKey}'`,
            uploadErr
          );
          // --- END ADDED LOGGING ---
          throw new Error(
            `Upload failed for ${currentLocalPath}: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`
          );
        }
      }
    }
    return uploadedKeys;
  }

  /**
   * Install a plugin by uploading its extracted files to the bucket
   */
  public async installPlugin(manifest: PluginManifest, packagePath: string): Promise<PluginInstallationResult> {
    const pluginId = manifest.id;
    // Ensure bucketPrefix ends with a slash
    const bucketPrefix = `plugins/${pluginId}/`.replace(/\/\/$/, "/");
    console.log(
      `[Lifecycle] Starting installation for ${pluginId} from extracted path ${packagePath} to bucket prefix ${bucketPrefix}`
    );
    let uploadedKeys: string[] = [];

    try {
      // 1. Clean up previous files (same as before)
      console.log(`[Lifecycle] Cleaning up previous files (if any) for ${pluginId} under prefix ${bucketPrefix}...`);
      try {
        const keysToDelete = await listObjectKeysByPrefix(bucketPrefix);
        if (keysToDelete.length > 0) {
          console.log(
            `[Lifecycle] Found ${keysToDelete.length} existing objects to delete for prefix ${bucketPrefix}.`
          );
          await deleteMultipleObjects(keysToDelete);
          console.log(`[Lifecycle] Finished cleanup for prefix ${bucketPrefix}.`);
        } else {
          console.log(`[Lifecycle] No existing objects found for prefix ${bucketPrefix}. Skipping cleanup.`);
        }
      } catch (cleanupError) {
        console.warn(
          `[Lifecycle] Non-fatal error during pre-install cleanup for prefix ${bucketPrefix}:`,
          cleanupError
        );
      }

      // 2. Upload the contents of the already extracted directory
      console.log(`[Lifecycle] Uploading directory contents from ${packagePath} to ${bucketPrefix}...`);
      // Pass packagePath as both the starting point and the root directory reference
      uploadedKeys = await this.uploadDirectoryContents(packagePath, bucketPrefix, packagePath);
      console.log(`[Lifecycle] Uploaded ${uploadedKeys.length} files for ${pluginId}.`);

      // 3. Verification (optional)
      console.log(`[Lifecycle] TODO: Verify required files exist in bucket if necessary.`);

      console.log(`[Lifecycle] Plugin ${pluginId} installed successfully to bucket prefix ${bucketPrefix}`);

      return {
        success: true,
        path: bucketPrefix
      };
    } catch (error) {
      // Rollback logic (attempt to delete uploaded files)
      console.error(`[Lifecycle] Failed to install plugin ${pluginId} to bucket:`, error);
      if (uploadedKeys.length > 0) {
        console.log(
          `[Lifecycle] Rolling back installation for ${pluginId}. Deleting ${uploadedKeys.length} uploaded files...`
        );
        try {
          // Use the actual bucket keys for deletion
          const keysToDelete = uploadedKeys.map(key =>
            key.startsWith(bucketPrefix) ? key : `${bucketPrefix}${path.relative(packagePath, key).replace(/\\/g, "/")}`
          ); // Reconstruct keys if needed, though uploadDirectoryContents should return full keys
          await deleteMultipleObjects(keysToDelete);
          console.log(`[Lifecycle] Rollback successful for ${pluginId}.`);
        } catch (rollbackError) {
          console.error(`[Lifecycle] Rollback deletion failed for ${pluginId}:`, rollbackError);
        }
      } else {
        console.log(`[Lifecycle] No files were uploaded, skipping rollback deletion for ${pluginId}.`);
      }

      return {
        success: false,
        path: "",
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Cleanup of the temporary EXTRACTION directory now happens in install.ts
      // if (packagePath) {
      //     console.log(`[Lifecycle] Note: Cleanup of temp directory ${packagePath} is handled by the caller (install API route).`);
      // }
    }
  }

  /**
   * Get or create the host instance for a given plugin ID.
   * Loads the host if it's not already loaded.
   */
  public async getOrCreateHost(pluginId: string): Promise<IPluginHost | null> {
    console.log(`[Lifecycle] getOrCreateHost called for: ${pluginId}`);
    if (this.activeHosts.has(pluginId)) {
      const existingHost = this.activeHosts.get(pluginId)!;
      console.log(`[Lifecycle] Returning active host for ${pluginId} with state: ${existingHost.getState()}`);
      return existingHost;
    }

    const plugin = await this.registry.getPlugin(pluginId);
    if (!plugin) {
      console.warn(`[Lifecycle] Plugin ${pluginId} not found in registry.`);
      return null;
    }
    if (plugin.state === PluginState.DISABLED || plugin.state === PluginState.ERROR) {
      console.warn(`[Lifecycle] Cannot create host for plugin ${pluginId} because its state is ${plugin.state}.`);
      return null;
    }
    if (!plugin.enabled) {
      console.warn(`[Lifecycle] Cannot create host for plugin ${pluginId} because it is not enabled.`);
      return null;
    }

    console.log(`[Lifecycle] Creating new host instance for plugin ${pluginId}`);
    let host: IPluginHost | null = null;
    try {
      const manifest = plugin.manifest;
      host = createPluginHost(manifest, this.defaultSandboxOptions);
      this.activeHosts.set(pluginId, host);
      console.log(`[Lifecycle] Host instance created for ${pluginId}. Attempting to load...`);

      await host.load();
      console.log(`[Lifecycle] Host successfully loaded for ${pluginId}. Final state: ${host.getState()}`);

      await this.registry.updateState(pluginId, host.getState());

      return host;
    } catch (error) {
      console.error(`[Lifecycle] Failed during create or load for host ${pluginId}:`, error);
      this.registry.recordPluginError(
        pluginId,
        `Host creation/load failed: ${error instanceof Error ? error.message : String(error)}`
      );

      if (this.activeHosts.has(pluginId)) {
        this.activeHosts.delete(pluginId);
      }
      return null;
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
        // Usa PluginState
        await host.deactivate();
      }
      await host.unload();
      // Temporaneamente commentato per evitare errori se getState non esiste o PluginState non importato correttamente
      console.warn(`[Lifecycle] Deactivate/Unload logic for host needs review/implementation.`);

      this.activeHosts.delete(id);

      console.log(`Successfully deactivated and unloaded plugin ${id} (host removed from active map)`);
    } catch (error) {
      console.error(`Failed to deactivate/unload plugin ${id}:`, error);
      this.registry.recordPluginError(
        id,
        `Deactivation/Unload error: ${error instanceof Error ? error.message : String(error)}`
      );
      this.activeHosts.delete(id);
      throw error;
    }
  }

  /**
   * Uninstall a plugin - remove its files from the bucket
   */
  public async uninstallPlugin(entry: any): Promise<void> {
    const { id } = entry;

    if (this.activeHosts.has(id)) {
      await this.deactivateAndUnloadPlugin(entry);
    }

    const bucketPrefix = `plugins/${id}/`;
    console.log(`[Lifecycle] Uninstalling plugin ${id}. Deleting files from bucket prefix ${bucketPrefix}`);

    try {
      // Lista gli oggetti nel bucket con il prefisso del plugin
      const keysToDelete = await listObjectKeysByPrefix(bucketPrefix);

      if (keysToDelete.length > 0) {
        // Elimina gli oggetti trovati
        await deleteMultipleObjects(keysToDelete);
        console.log(`[Lifecycle] Successfully deleted ${keysToDelete.length} objects from bucket for plugin ${id}.`);
      } else {
        console.log(`[Lifecycle] No objects found in bucket to delete for plugin ${id} with prefix ${bucketPrefix}.`);
      }

      console.log(`[Lifecycle] Finished uninstall process for plugin ${id} (files deleted from bucket).`);
    } catch (error) {
      console.error(`[Lifecycle] Failed during bucket cleanup for plugin ${id}:`, error);
      // Decidi se rilanciare l'errore o solo loggarlo. Rilanciare è più sicuro.
      throw new Error(
        `Failed to complete bucket cleanup during uninstall for ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update a plugin to a new version in the bucket
   */
  public async updatePlugin(entry: any, newManifest: PluginManifest, packagePath: string): Promise<void> {
    const { id } = entry;

    if (this.activeHosts.has(id)) {
      await this.deactivateAndUnloadPlugin(entry);
    }

    try {
      console.log(`[Lifecycle] Starting update for plugin ${id} to version ${newManifest.version}`);

      // 1. Disinstalla la vecchia versione (rimuovi file dal bucket usando la logica aggiornata)
      console.log(`[Lifecycle] Removing old version files for ${id}...`);
      await this.uninstallPlugin(entry);

      // 2. Installa la nuova versione (carica nuovi file nel bucket)
      console.log(`[Lifecycle] Installing new version files for ${id}...`);
      const installResult = await this.installPlugin(newManifest, packagePath);

      if (!installResult.success) {
        // installPlugin gestisce già il rollback parziale, quindi basta lanciare l'errore
        throw new Error(`Failed to install new version during update: ${installResult.error}`);
      }

      console.log(`Successfully updated plugin ${id} to version ${newManifest.version} in bucket.`);
    } catch (error) {
      console.error(`Failed to update plugin ${id}:`, error);
      // Registra l'errore nel registry
      this.registry.recordPluginError(id, `Update error: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Rilancia l'errore per segnalare il fallimento dell'update
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
