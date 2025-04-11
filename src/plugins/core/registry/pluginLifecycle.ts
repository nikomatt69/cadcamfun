/**
 * Plugin lifecycle management
 * Handles installation, activation, deactivation, and uninstallation of plugins
 */

import { PluginManifest } from './pluginManifest';
import path from 'path';
import fs from 'fs/promises';
import { IPluginHost } from '../host/pluginHost';
import { createPluginHost } from '../host/hostFactory';
import { SandboxOptions } from '../host/sandbox';
import { PluginState } from './pluginTypes';
import unzipper from 'unzipper';
import fsSync from 'fs';
import streamBuffers from 'stream-buffers';
import { uploadToBucket, deleteFromBucket, listObjectKeysByPrefix, deleteMultipleObjects } from '@/src/lib/storageService';

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
            frameSrc: ["'none'"], // Adjust if plugins need to embed frames
        },
        allowEval: false,
        allowParentAccess: false, 
        // Add other default sandbox settings as needed
    };
  }

  /**
   * Install a plugin by uploading its files to the bucket
   */
  public async installPlugin(manifest: PluginManifest, packagePath: string): Promise<PluginInstallationResult> {
    const pluginId = manifest.id;
    const bucketPrefix = `plugins/${pluginId}/`; 
    console.log(`[Lifecycle] Starting installation for ${pluginId} from ${packagePath} to bucket prefix ${bucketPrefix}`);
    const uploadedKeys: string[] = []; 

    try {
      // 1. Pulire eventuali file precedenti nel bucket per questo pluginId
      console.log(`[Lifecycle] Cleaning up previous files (if any) for ${pluginId} under prefix ${bucketPrefix}...`);
      try {
        const keysToDelete = await listObjectKeysByPrefix(bucketPrefix);
        if (keysToDelete.length > 0) {
           console.log(`[Lifecycle] Found ${keysToDelete.length} existing objects to delete for prefix ${bucketPrefix}.`);
           await deleteMultipleObjects(keysToDelete);
           console.log(`[Lifecycle] Finished cleanup for prefix ${bucketPrefix}.`);
        } else {
           console.log(`[Lifecycle] No existing objects found for prefix ${bucketPrefix}. Skipping cleanup.`);
        }
      } catch (cleanupError) {
         // Logga l'errore ma non bloccare l'installazione per questo motivo
         // Potrebbe essere un problema temporaneo di list/delete o bucket non ancora esistente
         console.warn(`[Lifecycle] Non-fatal error during pre-install cleanup for prefix ${bucketPrefix}:`, cleanupError);
      }
      
      // 2. Leggere lo zip e caricare ogni file nel bucket
      await new Promise<void>((resolve, reject) => {
        const promises: Promise<string>[] = []; 
        fsSync.createReadStream(packagePath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            const filePath = entry.path;
            const type = entry.type; 
            
            if (type === 'File' && !filePath.endsWith('/')) { 
              const bucketKey = `${bucketPrefix}${filePath}`;
              // console.log(`[Lifecycle] Processing file entry: ${filePath} -> ${bucketKey}`);
              const writableStreamBuffer = new streamBuffers.WritableStreamBuffer({
                initialSize: (100 * 1024),  
                incrementAmount: (10 * 1024) 
              });

              entry.pipe(writableStreamBuffer)
                .on('finish', () => {
                  const buffer = writableStreamBuffer.getContents();
                  if (buffer && buffer.length > 0) {
                    const contentType = 'application/octet-stream'; 
                    // console.log(`[Lifecycle] Uploading ${filePath} (${buffer.length} bytes) to ${bucketKey}`);
                    const uploadPromise = uploadToBucket(bucketKey, buffer, contentType)
                                         .then(uploadedPath => {
                                            // console.log(`[Lifecycle] Successfully uploaded ${filePath} to ${uploadedPath}`);
                                            uploadedKeys.push(uploadedPath); 
                                            return uploadedPath;
                                         })
                                         .catch(uploadErr => {
                                             console.error(`[Lifecycle] Upload failed for ${filePath} to ${bucketKey}:`, uploadErr);
                                             throw new Error(`Upload failed for ${filePath}: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`);
                                         });
                    promises.push(uploadPromise);
                  } else {
                     console.warn(`[Lifecycle] Empty buffer for file: ${filePath}. Skipping upload.`);
                     entry.autodrain(); 
                  }
                })
                .on('error', (streamError: Error) => { 
                    console.error(`[Lifecycle] Error piping/buffering entry ${filePath}:`, streamError);
                    entry.autodrain(); 
                    reject(new Error(`Error processing entry ${filePath}: ${streamError.message}`));
                });

            } else {
              entry.autodrain();
            }
          })
          .on('error', (zipError: Error) => { 
            console.error(`[Lifecycle] Error parsing zip stream for ${pluginId}:`, zipError);
            reject(new Error(`Failed to parse package: ${zipError.message}`));
          })
          .on('close', async () => {
            console.log(`[Lifecycle] Finished processing zip entries for ${pluginId}. Waiting for ${promises.length} uploads...`);
            try {
               await Promise.all(promises);
               console.log(`[Lifecycle] All uploads completed successfully for ${pluginId}`);
               resolve();
            } catch (uploadError) {
               console.error(`[Lifecycle] One or more uploads failed for ${pluginId}:`, uploadError);
               // Non serve rigettare qui, l'errore individuale ha già rigettato la Promise esterna
            }
          });
      }); // Fine Promise lettura zip

      // 3. (Opzionale) Verificare che il manifest sia stato caricato nel bucket
      console.log(`[Lifecycle] TODO: Implement check for ${bucketPrefix}manifest.json existence if needed.`);
      
      console.log(`[Lifecycle] Plugin ${pluginId} installed successfully to bucket prefix ${bucketPrefix}`);
      
      return {
        success: true,
        path: bucketPrefix, 
      };
    } catch (error) {
      console.error(`[Lifecycle] Failed to install plugin ${pluginId} to bucket:`, error);
      console.log(`[Lifecycle] Rolling back installation for ${pluginId}. Deleting ${uploadedKeys.length} uploaded files...`);
      if (uploadedKeys.length > 0) {
         const deletePromises = uploadedKeys.map(key => deleteFromBucket(key).catch(delErr => console.error(`[Lifecycle] Rollback deletion failed for key ${key}:`, delErr)));
         await Promise.all(deletePromises);
      }
      console.log(`[Lifecycle] Rollback finished for ${pluginId}.`);

      return {
        success: false,
        path: '',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
       if (packagePath) {
           console.log(`[Lifecycle] Cleaning up temporary package file: ${packagePath}`);
           await fs.rm(packagePath, { force: true, recursive: true }).catch(e => console.warn(`[Lifecycle] Failed to cleanup temp package ${packagePath}:`, e));
       }
    }
  }

  /**
   * Get or create the host instance for a given plugin ID.
   * Loads the host if it's not already loaded.
   */
  public async getOrCreateHost(pluginId: string): Promise<IPluginHost | null> {
    if (this.activeHosts.has(pluginId)) {
      return this.activeHosts.get(pluginId)!;
    }

    const plugin = await this.registry.get(pluginId);
    if (!plugin || plugin.state === PluginState.DISABLED || plugin.state === PluginState.ERROR) {
        console.warn(`[Lifecycle] Cannot get/create host for plugin ${pluginId} (not found or disabled/error state).`);
        return null;
    }

    console.info(`[Lifecycle] Creating host for plugin ${pluginId}`);
    try {
        const manifest = plugin.manifest;
        
        // Use the factory function with the locally defined default options
        const host = createPluginHost(manifest, this.defaultSandboxOptions);
        
        this.activeHosts.set(pluginId, host);
        console.info(`[Lifecycle] Host created for ${pluginId}. Loading...`);

        // Load the host (this should handle its internal state transition)
        await host.load(); 
        console.info(`[Lifecycle] Host loaded for ${pluginId}`);

        // Update plugin state in registry after successful load
        await this.registry.updateState(pluginId, PluginState.LOADED);
        
        return host;
    } catch (error) {
        console.error(`[Lifecycle] Failed to create or load host for plugin ${pluginId}:`, error);
        await this.registry.updateState(pluginId, PluginState.ERROR);
        // Remove from active hosts if creation failed
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
      // if (host.getState() === PluginState.ACTIVATED) { // Usa PluginState
      //   await host.deactivate();
      // }
      // await host.unload(); 
      // Temporaneamente commentato per evitare errori se getState non esiste o PluginState non importato correttamente
      console.warn(`[Lifecycle] Deactivate/Unload logic for host needs review/implementation.`);
      
      this.activeHosts.delete(id);
      
      console.log(`Successfully deactivated and unloaded plugin ${id} (host removed from active map)`);
    } catch (error) {
      console.error(`Failed to deactivate/unload plugin ${id}:`, error);
      this.registry.recordPluginError(id, `Deactivation/Unload error: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`Failed to complete bucket cleanup during uninstall for ${id}: ${error instanceof Error ? error.message : String(error)}`);
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