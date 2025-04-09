// src/plugins/core/api/file-api.ts
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';
import { EventEmitter } from 'events';

/**
 * File metadata
 */
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
  type: string;
}

/**
 * File read options
 */
export interface FileReadOptions {
  encoding?: 'utf8' | 'base64' | 'binary';
  asDataURL?: boolean;
  asArrayBuffer?: boolean;
}

/**
 * File write options
 */
export interface FileWriteOptions {
  overwrite?: boolean;
  createDirectory?: boolean;
}

/**
 * File filter for dialogs
 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Open file dialog options
 */
export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  multiple?: boolean;
  filters?: FileFilter[];
}

/**
 * Save file dialog options
 */
export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

/**
 * File API provides access to file system capabilities
 */
export class FileAPI extends EventEmitter {
  private pluginId: string;
  private pluginName: string;
  
  constructor(pluginId: string, pluginName: string) {
    super();
    this.pluginId = pluginId;
    this.pluginName = pluginName;
  }
  
        /**
   * Open a file dialog and let the user select files
   
  @requirePermission(PluginPermission.FILE_READ)
  */

  public async openFileDialog(options: OpenDialogOptions = {}): Promise<FileInfo[] | null> {
    return (window as any).__CAD_APP__.file.openFileDialog({
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Open a save file dialog
    @requirePermission(PluginPermission.FILE_WRITE)       
   */
  // @ts-ignore
  public async saveFileDialog(options: SaveDialogOptions = {}): Promise<FileInfo | null> {
    return (window as any).__CAD_APP__.file.saveFileDialog({
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Read a file's contents
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_READ)
  public async readFile(path: string, options: FileReadOptions = {}): Promise<string | ArrayBuffer> {
    return (window as any).__CAD_APP__.file.readFile(path, {
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Write content to a file
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_WRITE)
  public async writeFile(   
    path: string, 
    content: string | ArrayBuffer,
    options: FileWriteOptions = {}
  ): Promise<void> {
    await (window as any).__CAD_APP__.file.writeFile(path, content, {
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Export model to a file
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_WRITE)
  public async exportModel(
    format: 'stl' | 'obj' | 'step' | 'dxf',
    path: string,
    options: { selection?: boolean } = {}
  ): Promise<void> {
    await (window as any).__CAD_APP__.file.exportModel(format, path, {
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Import a CAD file into the model
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_READ)
  public async importModel(
    path: string,
    options: { 
      position?: { x: number; y: number; z: number }
    } = {}
  ): Promise<string[]> {
    return (window as any).__CAD_APP__.file.importModel(path, {
      ...options,
      pluginId: this.pluginId
    });
  }
  
  /**
   * Check if a file exists
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_READ)
  public async fileExists(path: string): Promise<boolean> {
    return (window as any).__CAD_APP__.file.fileExists(path);
  }
  
  /**
   * Get file metadata
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_READ)
  public async getFileInfo(path: string): Promise<FileInfo> {
    return (window as any).__CAD_APP__.file.getFileInfo(path);
  }
  
  /**
   * Create a temporary file
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_WRITE)
  public async createTempFile(extension: string): Promise<FileInfo> {
    return (window as any).__CAD_APP__.file.createTempFile(extension, this.pluginId);
  }
  
  /**
   * Watch a file for changes
   */
  // @ts-ignore
  @requirePermission(PluginPermission.FILE_READ)
  public watchFile(path: string, handler: (event: 'change' | 'delete') => void): () => void {
    // Create a unique event name for this file watch
    const eventName = `file:${path}:${this.pluginId}`;
    
    // Register with the app
    (window as any).__CAD_APP__.file.watchFile(path, eventName, this.pluginId);
    
    // Set up local event forwarding
    this.on(eventName, handler);
    
    // Return unsubscribe function
    return () => {
      (window as any).__CAD_APP__.file.unwatchFile(path, this.pluginId);
      this.off(eventName, handler);
    };
  }
}