// src/lib/libraryService.ts
import { v4 as uuidv4 } from 'uuid';
import { prisma } from 'src/lib/prisma';
import { transformLibraryItemToCADElement } from 'src/lib/libraryTransform';
import { useElementsStore } from 'src/store/elementsStore';
import cadComponentsLibrary from 'src/lib/cadComponentsLibrary.json';
import { predefinedComponents, predefinedTools, predefinedMaterials } from 'src/lib/predefinedLibraries';

export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  category: 'component' | 'tool' | 'material' | 'machine';
  type: string; 
  properties: Record<string, any>;
  tags?: string[];
  preview?: string;
}

class LibraryService {
  // Singleton instance
  private static instance: LibraryService;
  
  // In-memory libraries
  private cadComponents: LibraryItem[] = [];
  private userComponents: Record<string, LibraryItem[]> = {};
  private userMaterials: Record<string, LibraryItem[]> = {};
  private userTools: Record<string, LibraryItem[]> = {};
  private userMachineConfigs: Record<string, LibraryItem[]> = {};

  private initialized = false;

  private constructor() {
    // Initialize will be called explicitly
  }

  public static getInstance(): LibraryService {
    if (!LibraryService.instance) {
      LibraryService.instance = new LibraryService();
    }
    return LibraryService.instance;
  }

  /**
   * Initialize the library service with built-in and user components
   */
  public async initialize(userId?: string): Promise<void> {
    if (this.initialized) return;

    // Load built-in CAD components
    this.loadBuiltInComponents();

    // Load user components if userId is provided
    if (userId) {
      await this.loadUserComponents(userId);
      await this.loadUserMaterials(userId);
      await this.loadUserTools(userId);
      await this.loadUserMachineConfigs(userId);
    }

    this.initialized = true;
  }

  /**
   * Load built-in CAD components from local JSON file
   */
  private loadBuiltInComponents(): void {
    this.cadComponents = cadComponentsLibrary.map(comp => ({
      id: comp.id || '',
      name: comp.name || '',
      description: comp.description || '',
      category: 'component',
      type: comp.type || '',
      properties: comp.properties || {},
      tags: comp.tags || undefined
    }));
  }

  /**
   * Load user components from database
   */
  private async loadUserComponents(userId: string): Promise<void> {
    try {
      const components = await prisma.component.findMany({
        where: {
          OR: [
            { project: { ownerId: userId } },
            { isPublic: true }
          ]
        }
      });
 
      this.userComponents[userId] = components.map(comp => ({
        id: comp.id,
        name: comp.name,
        description: comp.description || undefined,
        category: 'component',
        type: comp.type || 'custom',
        properties: comp.data as Record<string, any>,
        tags: ['user', comp.type || 'custom'],
        preview: comp.thumbnail || undefined
      }));
    } catch (error) {
      console.error('Failed to load user components:', error);
      this.userComponents[userId] = [];
    }
  }

  /**
   * Load user materials from database
   */
  private async loadUserMaterials(userId: string): Promise<void> {
    try {
      const materials = await prisma.material.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { isPublic: true }
          ]
        }
      });

      this.userMaterials[userId] = materials.map(mat => ({
        id: mat.id,
        name: mat.name,
        description: mat.description || undefined,
        category: 'material',
        type: 'material',
        properties: mat.properties as Record<string, any>,
        tags: ['user', 'material']
      }));
    } catch (error) {
      console.error('Failed to load user materials:', error);
      this.userMaterials[userId] = [];
    }
  }

  /**
   * Load user tools from database
   */
  private async loadUserTools(userId: string): Promise<void> {
    try {
      const tools = await prisma.tool.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { isPublic: true }
          ]
        }
      });

      this.userTools[userId] = tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.notes || undefined,
        category: 'tool',
        type: tool.type,
        properties: {
          diameter: tool.diameter,
          material: tool.material,
          numberOfFlutes: tool.numberOfFlutes,
          maxRPM: tool.maxRPM,
          coolantType: tool.coolantType,
          cuttingLength: tool.cuttingLength,
          totalLength: tool.totalLength,
          shankDiameter: tool.shankDiameter
        },
        tags: ['user', tool.type, tool.material]
      }));
    } catch (error) {
      console.error('Failed to load user tools:', error);
      this.userTools[userId] = [];
    }
  }

  private async loadUserMachineConfigs(userId: string): Promise<void> {
    try {
      const configs = await prisma.machineConfig.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { isPublic: true }
          ]
        }
      });

      this.userMachineConfigs[userId] = configs.map(config => ({
        id: config.id,
        name: config.name,
        description: config.description || undefined,
        category: 'machine',
        type: config.type,
        properties: config.config as Record<string, any>,
        tags: ['user', config.type]
      }));
    } catch (error) {
      console.error('Failed to load user machine configs:', error);
      this.userMachineConfigs[userId] = [];
    }
  }

  /**
   * Get all CAD components
   */
  public getCadComponents(filter?: string): LibraryItem[] {
    if (!filter) return this.cadComponents;
    
    const lowerFilter = filter.toLowerCase();
    return this.cadComponents.filter(comp => 
      comp.name.toLowerCase().includes(lowerFilter) ||
      comp.description?.toLowerCase().includes(lowerFilter) ||
      comp.type.toLowerCase().includes(lowerFilter) ||
      comp.tags?.some(tag => tag.toLowerCase().includes(lowerFilter))
    );
  }

  /**
   * Get all user components
   */
  public getUserComponents(userId: string, filter?: string): LibraryItem[] {
    if (!this.userComponents[userId]) return [];
    
    if (!filter) return this.userComponents[userId];
    
    const lowerFilter = filter.toLowerCase();
    return this.userComponents[userId].filter(comp => 
      comp.name.toLowerCase().includes(lowerFilter) ||
      comp.description?.toLowerCase().includes(lowerFilter) ||
      comp.type.toLowerCase().includes(lowerFilter) ||
      comp.tags?.some(tag => tag.toLowerCase().includes(lowerFilter))
    );
  }

  /**
   * Get all user materials
   */
  public getUserMaterials(userId: string, filter?: string): LibraryItem[] {
    if (!this.userMaterials[userId]) return [];
    
    if (!filter) return this.userMaterials[userId];
    
    const lowerFilter = filter.toLowerCase();
    return this.userMaterials[userId].filter(mat => 
      mat.name.toLowerCase().includes(lowerFilter) ||
      mat.description?.toLowerCase().includes(lowerFilter) ||
      mat.tags?.some(tag => tag.toLowerCase().includes(lowerFilter))
    );
  }

  /**
   * Get all user tools
   */
  public getUserTools(userId: string, filter?: string): LibraryItem[] {
    if (!this.userTools[userId]) return [];
    
    if (!filter) return this.userTools[userId];
    
    const lowerFilter = filter.toLowerCase();
    return this.userTools[userId].filter(tool => 
      tool.name.toLowerCase().includes(lowerFilter) ||
      tool.description?.toLowerCase().includes(lowerFilter) ||
      tool.type.toLowerCase().includes(lowerFilter) ||
      tool.tags?.some(tag => tag.toLowerCase().includes(lowerFilter))
    );
  }

  /**
   * Get all user machine configs
   */
  public getUserMachineConfigs(userId: string, filter?: string): LibraryItem[] {
    if (!this.userMachineConfigs[userId]) {
      return [];
    }
    
    const configs = Array.isArray(this.userMachineConfigs[userId]) 
      ? this.userMachineConfigs[userId] 
      : [];
    
    if (!filter) return configs;
    
    const lowerFilter = filter.toLowerCase();
    return configs.filter(config => 
      config.name.toLowerCase().includes(lowerFilter) ||
      config.description?.toLowerCase().includes(lowerFilter) ||
      config.type.toLowerCase().includes(lowerFilter) ||
      config.tags?.some(tag => tag.toLowerCase().includes(lowerFilter))
    );
  }

  /**
   * Get predefined components from library
   */
  public getPredefinedComponents(): LibraryItem[] {
    return predefinedComponents.map((comp, index) => ({
      id: `predefined-comp-${index}`,
      name: comp.name,
      description: comp.description || "",
      category: 'component',
      type: comp.type || '' ,
      properties: comp.data?.valueOf || {},
      tags: comp.data?.toString ? Object.keys(comp.data.toString) : []
    }));
  }

  /**
   * Get predefined materials from library
   */
  public getPredefinedMaterials(): LibraryItem[] {
    return predefinedMaterials.map((mat, index) => ({
      id: `predefined-mat-${index}`,
      name: mat.name,
      description: mat.description || "",
      category: 'material',
      type: 'material',
      properties: mat.properties?.valueOf || {},
      tags: mat.properties ? Object.keys(mat.properties) : []
    }));
  }

  /**
   * Get predefined tools from library
   */
  public getPredefinedTools(): LibraryItem[] {
    return predefinedTools.map((tool, index) => ({
      id: `predefined-tool-${index}`,
      name: tool.name,
      description: tool.notes || "",
      category: 'tool',
      type: tool.type,
      properties: {
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes,
        maxRPM: tool.maxRPM
      },
      tags: [tool.type, tool.material]
    }));
  }

  /**
   * Add component to CAD editor
   */
  public addComponentToCAD(libraryItem: LibraryItem): string | null {
    try {
      const cadElement = transformLibraryItemToCADElement(libraryItem);
      return useElementsStore.getState().addElement(cadElement);
    } catch (error) {
      console.error('Failed to add component to CAD:', error);
      return null;
    }
  }

  /**
   * Save a component to the user's library
   */
  public async saveComponent(
    component: Omit<LibraryItem, 'id'>, 
    projectId: string,
    userId: string
  ): Promise<string> {
    try {
      const newComponent = await prisma.component.create({
        data: {
          name: component.name,
          description: component.description,
          data: component.properties,
          type: component.type,
          projectId,
          isPublic: false
        }
      });

      // Add to in-memory cache
      if (!this.userComponents[userId]) {
        this.userComponents[userId] = [];
      }

      this.userComponents[userId].push({
        id: newComponent.id,
        name: newComponent.name,
        description: newComponent.description || undefined,
        category: 'component',
        type: newComponent.type || 'custom',
        properties: newComponent.data as Record<string, any>,
        tags: ['user', newComponent.type || 'custom']
      });

      return newComponent.id;
    } catch (error) {
      console.error('Failed to save component:', error);
      throw error;
    }
  }

  /**
   * Save a material to the user's library
   */
  public async saveMaterial(
    material: Omit<LibraryItem, 'id'>,
    userId: string,
    organizationId?: string
  ): Promise<string> {
    try {
      const newMaterial = await prisma.material.create({
        data: {
          name: material.name,
          description: material.description,
          properties: material.properties,
          ownerId: userId,
          organizationId,
          isPublic: false
        }
      });

      // Add to in-memory cache
      if (!this.userMaterials[userId]) {
        this.userMaterials[userId] = [];
      }

      this.userMaterials[userId].push({
        id: newMaterial.id,
        name: newMaterial.name,
        description: newMaterial.description || undefined,
        category: 'material',
        type: 'material',
        properties: newMaterial.properties as Record<string, any>,
        tags: ['user', 'material']
      });

      return newMaterial.id;
    } catch (error) {
      console.error('Failed to save material:', error);
      throw error;
    }
  }

  /**
   * Save a tool to the user's library
   */
  public async saveTool(
    tool: Omit<LibraryItem, 'id'>,
    userId: string,
    organizationId?: string
  ): Promise<string> {
    try {
      const properties = tool.properties;
      
      const newTool = await prisma.tool.create({
        data: {
          name: tool.name,
          type: tool.type,
          diameter: properties.diameter,
          material: properties.material,
          numberOfFlutes: properties.numberOfFlutes,
          maxRPM: properties.maxRPM,
          coolantType: properties.coolantType,
          cuttingLength: properties.cuttingLength,
          totalLength: properties.totalLength,
          shankDiameter: properties.shankDiameter,
          notes: tool.description,
          ownerId: userId,
          organizationId,
          isPublic: false
        }
      });

      // Add to in-memory cache
      if (!this.userTools[userId]) {
        this.userTools[userId] = [];
      }

      this.userTools[userId].push({
        id: newTool.id,
        name: newTool.name,
        description: newTool.notes || undefined,
        category: 'tool',
        type: newTool.type,
        properties: {
          diameter: newTool.diameter,
          material: newTool.material,
          numberOfFlutes: newTool.numberOfFlutes,
          maxRPM: newTool.maxRPM,
          coolantType: newTool.coolantType,
          cuttingLength: newTool.cuttingLength,
          totalLength: newTool.totalLength,
          shankDiameter: newTool.shankDiameter
        },
        tags: ['user', newTool.type, newTool.material]
      });

      return newTool.id;
    } catch (error) {
      console.error('Failed to save tool:', error);
      throw error;
    }
  }

  /**
   * Create a CAD element from a library component
   */
  public createCADElementFromLibrary(componentId: string): any {
    try {
      // Find component in all libraries
      const component = this.cadComponents.find(c => c.id === componentId);
      
      if (!component) {
        console.error(`Component with ID ${componentId} not found in library`);
        return null;
      }
      
      // Create CAD element based on component type
      const props = component.properties;
      
      switch (component.type) {
        case 'workpiece':
          return {
            type: 'workpiece',
            layerId: 'default',
            name: component.name,
            x: props.x || 0,
            y: props.y || 0,
            z: props.z || 0,
            width: props.width || 100,
            height: props.height || 20,
            depth: props.depth || 100,
            color: props.color || '#AAAAAA',
            wireframe: props.wireframe || false
          };
          
        case 'line':
          return {
            type: 'line',
            layerId: 'default',
            name: component.name,
            x1: props.x1 || 0,
            y1: props.y1 || 0,
            z1: props.z1 || 0,
            x2: props.x2 || 100,
            y2: props.y2 || 0,
            z2: props.z2 || 0,
            color: props.color || '#000000',
            linewidth: props.linewidth || 1
          };
          
        case 'circle':
          return {
            type: 'circle',
            layerId: 'default',
            name: component.name,
            x: props.x || 0,
            y: props.y || 0,
            z: props.z || 0,
            radius: props.radius || 50,
            color: props.color || '#0066FF'
          };
          
        case 'rectangle':
          return {
            type: 'rectangle',
            layerId: 'default',
            name: component.name,
            x: props.x || 0,
            y: props.y || 0,
            z: props.z || 0,
            width: props.width || 100,
            height: props.height || 50,
            angle: props.angle || 0,
            color: props.color || '#00AA00'
          };
          
        case 'cube':
          return {
            type: 'cube',
            layerId: 'default',
            name: component.name,
            x: props.x || 0,
            y: props.y || 0,
            z: props.z || 0,
            width: props.width || 50,
            height: props.height || 50,
            depth: props.depth || 50,
            color: props.color || '#1E88E5',
            wireframe: props.wireframe || false
          };
          
        case 'sphere':
          return {
            type: 'sphere',
            layerId: 'default',
            name: component.name,
            x: props.x || 0,
            y: props.y || 0,
            z: props.z || 0,
            radius: props.radius || 25,
            color: props.color || '#E91E63',
            wireframe: props.wireframe || false
          };
          
        // Add other element types as needed
          
        default:
          console.warn(`Unsupported component type: ${component.type}, using default cube`);
          return {
            type: 'cube',
            layerId: 'default',
            name: component.name,
            x: 0,
            y: 0,
            z: 0,
            width: 50,
            height: 50,
            depth: 50,
            color: '#1E88E5',
            wireframe: false
          };
      }
    } catch (error) {
      console.error('Error creating CAD element from library:', error);
      return null;
    }
  }
}

// Export a singleton instance
export const libraryService = LibraryService.getInstance();
export default libraryService;