// src/plugins/core/api/storage-api.ts
import { EventEmitter } from 'events';
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';

interface StorageItem {
  value: any;
  timestamp: number;
}

interface StorageChangeEvent {
  key: string;
  value: any;
  pluginId: string;
}

/**
 * Storage API provides persistent storage for plugins
 * Uses a combination of in-memory cache and localStorage persistence
 */
export class StorageAPI extends EventEmitter {
  private pluginId: string;
  private storage: Map<string, StorageItem> = new Map();
  private readonly STORAGE_PREFIX = 'plugin_storage_';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit per plugin

  constructor(pluginId: string) {
    super();
    this.pluginId = pluginId;
    this.loadFromLocalStorage();
  }

  /**
   * Get a value from storage
   */
  @requirePermission(PluginPermission.STORAGE_LOCAL)
  public async get<T = any>(key: string, defaultValue?: T): Promise<T | undefined> {
    const item = this.storage.get(key);
    
    if (!item) {
      return defaultValue;
    }
    
    try {
      return item.value as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Set a value in storage
   */
  @requirePermission(PluginPermission.STORAGE_LOCAL)
  public async set<T = any>(key: string, value: T): Promise<void> {
    // Check storage size limit
    const estimatedSize = JSON.stringify(value).length;
    const currentSize = this.calculateStorageSize();
    
    if (currentSize + estimatedSize > this.MAX_STORAGE_SIZE) {
      throw new Error('Storage quota exceeded');
    }

    const item: StorageItem = {
      value,
      timestamp: Date.now()
    };
    
    const oldValue = this.storage.get(key)?.value;
    this.storage.set(key, item);
    
    // Persist to localStorage
    this.saveToLocalStorage(key, item);
    
    // Emit change event
    this.emitChange(key, value, oldValue);
  }

  /**
   * Remove a value from storage
   */
  @requirePermission(PluginPermission.STORAGE_LOCAL)
  public async remove(key: string): Promise<void> {
    const oldValue = this.storage.get(key)?.value;
    this.storage.delete(key);
    
    // Remove from localStorage
    this.removeFromLocalStorage(key);
    
    // Emit change event
    this.emitChange(key, undefined, oldValue);
  }

  /**
   * Clear all storage for this plugin
   */
  @requirePermission(PluginPermission.STORAGE_LOCAL)
  public async clear(): Promise<void> {
    const keys = Array.from(this.storage.keys());
    this.storage.clear();
    
    // Clear from localStorage
    keys.forEach(key => this.removeFromLocalStorage(key));
    
    // Emit change events for each key
    keys.forEach(key => this.emitChange(key, undefined, undefined));
  }

  /**
   * Get all keys in storage
   */
  @requirePermission(PluginPermission.STORAGE_LOCAL)
  public async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  /**
   * Subscribe to storage changes
   */
  public onDidChangeStorage(callback: (key: string, value: any) => void): () => void {
    this.on('change', callback);
    return () => this.off('change', callback);
  }

  /**
   * Emit change event
   */
  private emitChange(key: string, newValue: any, oldValue: any): void {
    const event: StorageChangeEvent = {
      key,
      value: newValue,
      pluginId: this.pluginId
    };
    this.emit('change', key, newValue, oldValue);
  }

  /**
   * Calculate total storage size
   */
  private calculateStorageSize(): number {
    let size = 0;
    for (const item of this.storage.values()) {
      size += JSON.stringify(item.value).length;
    }
    return size;
  }

  /**
   * Load plugin storage from localStorage
   */
  private loadFromLocalStorage(): void {
    try {
      const storageKey = this.STORAGE_PREFIX + this.pluginId;
      const data = localStorage.getItem(storageKey);
      
      if (data) {
        const parsed = JSON.parse(data);
        for (const [key, item] of Object.entries(parsed)) {
          this.storage.set(key, item as StorageItem);
        }
      }
    } catch (error) {
      console.error('Failed to load plugin storage from localStorage:', error);
    }
  }

  /**
   * Save a key to localStorage
   */
  private saveToLocalStorage(key: string, item: StorageItem): void {
    try {
      const storageKey = this.STORAGE_PREFIX + this.pluginId;
      let data: Record<string, StorageItem> = {};
      
      const existing = localStorage.getItem(storageKey);
      if (existing) {
        data = JSON.parse(existing);
      }
      
      data[key] = item;
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
      throw new Error('Storage quota may be exceeded');
    }
  }

  /**
   * Remove a key from localStorage
   */
  private removeFromLocalStorage(key: string): void {
    try {
      const storageKey = this.STORAGE_PREFIX + this.pluginId;
      const data = localStorage.getItem(storageKey);
      
      if (data) {
        const parsed = JSON.parse(data);
        delete parsed[key];
        localStorage.setItem(storageKey, JSON.stringify(parsed));
      }
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.storage.clear();
    this.removeAllListeners();
  }
}
