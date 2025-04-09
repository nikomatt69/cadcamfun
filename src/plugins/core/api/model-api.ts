// src/plugins/core/api/model-api.ts
import { PluginPermission } from '../registry';
import { requirePermission } from './capabilities';
import { EventEmitter } from 'events';

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
    // This would be implemented by the host application
    // accessing the actual CAD model
    return window.__CAD_APP__.model.getEntities(options);
  }
  
  /**
   * Get a specific entity by ID
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_READ)
  public async getEntityById(id: string): Promise<ComponentElement | null> {
    return window.__CAD_APP__.model.getEntityById(id);
  }
  
  /**
   * Get the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async getSelection(): Promise<ModelSelection> {
    return window.__CAD_APP__.model.getSelection();
  }
  
  /**
   * Set the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async setSelection(selection: ModelSelection): Promise<void> {
    await window.__CAD_APP__.model.setSelection(selection);
  }
  
  /**
   * Add elements to the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async addToSelection(elementIds: string[]): Promise<void> {
    await window.__CAD_APP__.model.addToSelection(elementIds);
  }
  
  /**
   * Clear the current selection
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_SELECTION)
  public async clearSelection(): Promise<void> {
    await window.__CAD_APP__.model.clearSelection();
  }
  
  /**
   * Create a new element in the model
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async createElement(element: Partial<ComponentElement>): Promise<string> {
    return window.__CAD_APP__.model.createElement(element);
  }
  
  /**
   * Update an existing element
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async updateElement(id: string, updates: Partial<ComponentElement>): Promise<void> {
    await window.__CAD_APP__.model.updateElement(id, updates);
  }
  
  /**
   * Delete elements from the model
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async deleteElements(elementIds: string[]): Promise<void> {
    await window.__CAD_APP__.model.deleteElements(elementIds);
  }
  
  /**
   * Transform elements (move, rotate, scale)
   */
  // @ts-ignore
  @requirePermission(PluginPermission.MODEL_WRITE)
  public async transformElements(params: ModelTransformParams): Promise<void> {
    await window.__CAD_APP__.model.transformElements(params);
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
    return window.__CAD_APP__.model.createComponent(name, elementIds, isPublic);
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
    return window.__CAD_APP__.model.measureDistance(fromElementId, toElementId);
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