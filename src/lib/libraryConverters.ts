// src/lib/libraryConverters.ts
import {
    ComponentLibraryItem,
    MaterialLibraryItem,
    ToolLibraryItem
  } from '@/src/hooks/useUnifiedLibrary';
  import { v4 as uuidv4 } from 'uuid';
  
  /**
   * Utility functions to convert between different library item formats
   */
  
  // Convert API component to local library format
  export function apiToLocalComponent(component: ComponentLibraryItem): any {
    return {
      name: component.name,
      description: component.description || '',
      type: component.type || 'custom',
      data: component.data || {},
      thumbnail: component.thumbnail,
      tags: component.tags || []
    };
  }
  
  // Convert local component to API format
  export function localToApiComponent(component: any): Partial<ComponentLibraryItem> {
    return {
      id: component.id || uuidv4(),
      name: component.name,
      description: component.description,
      type: component.type,
      data: component.data,
      thumbnail: component.thumbnail,
      tags: component.tags,
      createdAt: component.createdAt || new Date().toISOString(),
      updatedAt: component.updatedAt || new Date().toISOString()
    };
  }
  
  // Convert API material to local library format
  export function apiToLocalMaterial(material: MaterialLibraryItem): any {
    return {
      name: material.name,
      description: material.description || '',
      color: material.color || '#cccccc',
      density: material.density || 1.0,
      hardness: material.hardness || 50,
      properties: material.properties || {},
      tags: material.tags || []
    };
  }
  
  // Convert local material to API format
  export function localToApiMaterial(material: any): Partial<MaterialLibraryItem> {
    return {
      id: material.id || uuidv4(),
      name: material.name,
      description: material.description,
      color: material.color,
      density: material.density,
      hardness: material.hardness,
      properties: material.properties || {
        color: material.color,
        density: material.density,
        hardness: material.hardness
      },
      tags: material.tags,
      createdAt: material.createdAt || new Date().toISOString(),
      updatedAt: material.updatedAt || new Date().toISOString()
    };
  }
  
  // Convert API tool to local library format
  export function apiToLocalTool(tool: ToolLibraryItem): any {
    return {
      name: tool.name,
      description: tool.description || '',
      type: tool.type,
      diameter: tool.diameter,
      material: tool.material,
      numberOfFlutes: tool.numberOfFlutes,
      maxRPM: tool.maxRPM,
      coolantType: tool.coolantType,
      cuttingLength: tool.cuttingLength,
      totalLength: tool.totalLength,
      shankDiameter: tool.shankDiameter,
      notes: tool.notes,
      tags: tool.tags || []
    };
  }
  
  // Convert local tool to API format
  export function localToApiTool(tool: any): Partial<ToolLibraryItem> {
    return {
      id: tool.id || uuidv4(),
      name: tool.name,
      description: tool.description,
      type: tool.type,
      diameter: tool.diameter,
      material: tool.material,
      numberOfFlutes: tool.numberOfFlutes,
      maxRPM: tool.maxRPM,
      coolantType: tool.coolantType,
      cuttingLength: tool.cuttingLength,
      totalLength: tool.totalLength,
      shankDiameter: tool.shankDiameter,
      notes: tool.notes,
      tags: tool.tags,
      createdAt: tool.createdAt || new Date().toISOString(),
      updatedAt: tool.updatedAt || new Date().toISOString()
    };
  }
  
  // Convert predefined library item to local format
  export function predefinedToLocalItem(item: any, type: 'components' | 'materials' | 'tools'): any {
    switch (type) {
      case 'components':
        return {
          name: item.name,
          description: item.description || '',
          type: item.type || (item.data && item.data.type) || 'custom',
          data: item.data || {},
          thumbnail: item.thumbnail,
          tags: item.tags || []
        };
      
      case 'materials':
        return {
          name: item.name,
          description: item.description || '',
          color: item.properties?.color || '#cccccc',
          density: item.properties?.density || 1.0,
          hardness: item.properties?.hardness || 50,
          properties: item.properties || {},
          tags: item.tags || []
        };
      
      case 'tools':
        return {
          name: item.name,
          description: item.description || '',
          type: item.type,
          diameter: item.diameter,
          material: item.material,
          numberOfFlutes: item.numberOfFlutes,
          maxRPM: item.maxRPM,
          coolantType: item.coolantType,
          cuttingLength: item.cuttingLength,
          totalLength: item.totalLength,
          shankDiameter: item.shankDiameter,
          notes: item.notes,
          tags: item.tags || []
        };
    }
  }