// src/plugins/core/api/model-api.ts
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';
import { EventEmitter } from 'events';
import { getPluginAPI } from './pluginApiRegistry';

// Types based on your CAD system structure
import {
  ComponentElement,
  ComponentData,
  Component
} from '@/src/types/component';

/**
 * Selection in the CAD model
 */
export interface ModelSelection {
  elements: string[];
  componentId?: string;
}

/**
 * Entity query options
 */
export interface EntityQueryOptions {
  type?: string;
  layerId?: string;
  componentId?: string;
  includeHidden?: boolean;
}

/**
 * Model transformation parameters
 */
export interface ModelTransformParams {
  elementIds: string[];
  translate?: { x: number; y: number; z: number };
  rotate?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

/**
 * Get the model API (works with or without window global)
 */
function getModelAPI() {
  try {
    return getPluginAPI().model;
  } catch {
    // Fallback to window for backward compatibility
    return (window as any).__CAD_APP__?.model;
  }
}

/**
 * Model API provides access to the CAD model
 */
export class ModelAPI extends EventEmitter {
  private pluginId: string;
  private pluginName: string;
  
  constructor(pluginId: string, pluginName: string) {
    super();
    this.pluginId = pluginId;
    this.pluginName = pluginName;
  }
  
  /**
   * Get all entities with optional filtering
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_READ)
  public async getEntities(options: EntityQueryOptions = {}): Promise<ComponentElement[]> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.getEntities(options);
  }
  
  /**
   * Get a specific entity by ID
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_READ)
  public async getEntityById(id: string): Promise<ComponentElement | null> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.getEntityById(id);
  }
  
  /**
   * Get the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async getSelection(): Promise<ModelSelection> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.getSelection();
  }
  
  /**
   * Set the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async setSelection(selection: ModelSelection): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.setSelection(selection);
  }
  
  /**
   * Add elements to the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async addToSelection(elementIds: string[]): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.addToSelection(elementIds);
  }
  
  /**
   * Clear the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async clearSelection(): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.clearSelection();
  }
  
  /**
   * Create a new element in the model
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async createElement(element: Partial<ComponentElement>): Promise<string> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.createElement(element);
  }
  
  /**
   * Update an existing element
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async updateElement(id: string, updates: Partial<ComponentElement>): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.updateElement(id, updates);
  }
  
  /**
   * Delete elements from the model
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async deleteElements(elementIds: string[]): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.deleteElements(elementIds);
  }
  
  /**
   * Transform elements (move, rotate, scale)
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async transformElements(params: ModelTransformParams): Promise<void> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    await api.transformElements(params);
  }
  
  /**
   * Create a component from elements
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async createComponent(
    name: string, 
    elementIds: string[], 
    isPublic: boolean = false
  ): Promise<string> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.createComponent(name, elementIds, isPublic);
  }
  
  /**
   * Get measurements between elements or points
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_READ)
  public async measureDistance(
    fromElementId: string, 
    toElementId: string
  ): Promise<number> {
    const api = getModelAPI();
    if (!api) throw new Error('Model API not available');
    return api.measureDistance(fromElementId, toElementId);
  }
  
  /**
   * Register for selection changed events
   */
  public onSelectionChanged(handler: (selection: ModelSelection) => void): () => void {
    this.on('selectionChanged', handler);
    
    // Return unsubscribe function
    return () => {
      this.off('selectionChanged', handler);
    };
  }
  
  /**
   * Register for model changed events
   */
  public onModelChanged(handler: (changeInfo: any) => void): () => void {
    this.on('modelChanged', handler);
    
    // Return unsubscribe function
    return () => {
      this.off('modelChanged', handler);
    };
  }
}