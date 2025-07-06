// src/lib/libraryService.ts
import { v4 as uuidv4 } from "uuid";
import { transformLibraryItemToCADElement } from "src/lib/libraryTransform";
import { useElementsStore } from "src/store/elementsStore";
import cadComponentsLibrary from "src/lib/cadComponentsLibrary.json";
import { predefinedComponents, predefinedTools, predefinedMaterials } from "src/lib/predefinedLibraries";

export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  category: "component" | "tool" | "material" | "machine";
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
  
  // Cache per le richieste API con timestamp
  private apiCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minuti
  
  // Tracking richieste in corso per evitare duplicati
  private pendingRequests = new Map<string, Promise<any>>();

  private constructor() {
    // Initialize will be called explicitly
  }

  /**
   * Helper per richieste API con cache
   */
  private async cachedFetch(url: string, options?: RequestInit): Promise<any> {
    const cacheKey = `${url}-${JSON.stringify(options || {})}`;
    const now = Date.now();
    
    // Check cache first
    const cached = this.apiCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < cached.ttl) {
      console.log(`🎯 LibraryService cache HIT for ${url}`);
      return cached.data;
    }
    
    // Check if request is already pending
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      console.log(`⏳ LibraryService request pending for ${url}`);
      return await pendingRequest;
    }
    
    console.log(`🔄 LibraryService cache MISS for ${url}`);
    
    // Create the fetch promise
    const fetchPromise = (async () => {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`Failed to fetch from ${url}`);
        }
        const data = await response.json();
        
        // Store in cache
        this.apiCache.set(cacheKey, { 
          data, 
          timestamp: now, 
          ttl: this.CACHE_TTL 
        });
        
        return data;
      } finally {
        // Remove from pending requests
        this.pendingRequests.delete(cacheKey);
      }
    })();
    
    // Store the promise to prevent concurrent requests
    this.pendingRequests.set(cacheKey, fetchPromise);
    
    return await fetchPromise;
  }

  /**
   * Invalida le cache che iniziano con il pattern specificato
   */
  private invalidateCache(pattern: string): void {
    for (const [key] of Array.from(this.apiCache.entries())) {
      if (key.startsWith(pattern)) {
        this.apiCache.delete(key);
      }
    }
    console.log(`🗑️ LibraryService cache invalidated for pattern: ${pattern}`);
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
      id: comp.id || "",
      name: comp.name || "",
      description: comp.description || "",
      category: "component",
      type: comp.type || "",
      properties: comp.properties || {},
      tags: comp.tags || undefined
    }));
  }

  /**
   * Load user components from database via API (con cache)
   */
  private async loadUserComponents(userId: string): Promise<void> {
    try {
      const components = await this.cachedFetch("/api/components?public=true");

      this.userComponents[userId] = components.map((comp: any) => ({
        id: comp.id,
        name: comp.name,
        description: comp.description || undefined,
        category: "component",
        type: comp.type || "custom",
        properties: comp.data as Record<string, any>,
        tags: ["user", comp.type || "custom"],
        preview: comp.thumbnail || undefined
      }));
    } catch (error) {
      console.error("Failed to load user components:", error);
      this.userComponents[userId] = [];
    }
  }

  /**
   * Load user materials from database via API (con cache)
   */
  private async loadUserMaterials(userId: string): Promise<void> {
    try {
      const materials = await this.cachedFetch("/api/materials?public=true");

      this.userMaterials[userId] = materials.map((mat: any) => ({
        id: mat.id,
        name: mat.name,
        description: mat.description || undefined,
        category: "material",
        type: "material",
        properties: mat.properties as Record<string, any>,
        tags: ["user", "material"]
      }));
    } catch (error) {
      console.error("Failed to load user materials:", error);
      this.userMaterials[userId] = [];
    }
  }

  /**
   * Load user tools from database via API (con cache)
   */
  private async loadUserTools(userId: string): Promise<void> {
    try {
      const tools = await this.cachedFetch("/api/tools?public=true");

      this.userTools[userId] = tools.map((tool: any) => ({
        id: tool.id,
        name: tool.name,
        description: tool.notes || undefined,
        category: "tool",
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
        tags: ["user", tool.type, tool.material]
      }));
    } catch (error) {
      console.error("Failed to load user tools:", error);
      this.userTools[userId] = [];
    }
  }

  /**
   * Load user machine configs from database via API (con cache)
   */
  private async loadUserMachineConfigs(userId: string): Promise<void> {
    try {
      const configs = await this.cachedFetch("/api/machine-configs?public=true");

      this.userMachineConfigs[userId] = configs.map((config: any) => ({
        id: config.id,
        name: config.name,
        description: config.description || undefined,
        category: "machine",
        type: config.type,
        properties: config.config as Record<string, any>,
        tags: ["user", config.type]
      }));
    } catch (error) {
      console.error("Failed to load user machine configs:", error);
      this.userMachineConfigs[userId] = [];
    }
  }

  /**
   * Get CAD components with optional filtering
   */
  public getCadComponents(filter?: string): LibraryItem[] {
    let components = this.cadComponents;

    if (filter) {
      const searchTerm = filter.toLowerCase();
      components = components.filter(
        comp =>
          comp.name.toLowerCase().includes(searchTerm) ||
          comp.description?.toLowerCase().includes(searchTerm) ||
          comp.type.toLowerCase().includes(searchTerm) ||
          comp.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return components;
  }

  /**
   * Get user components with optional filtering
   */
  public getUserComponents(userId: string, filter?: string): LibraryItem[] {
    let components = this.userComponents[userId] || [];

    if (filter) {
      const searchTerm = filter.toLowerCase();
      components = components.filter(
        comp =>
          comp.name.toLowerCase().includes(searchTerm) ||
          comp.description?.toLowerCase().includes(searchTerm) ||
          comp.type.toLowerCase().includes(searchTerm) ||
          comp.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return components;
  }

  /**
   * Get user materials with optional filtering
   */
  public getUserMaterials(userId: string, filter?: string): LibraryItem[] {
    let materials = this.userMaterials[userId] || [];

    if (filter) {
      const searchTerm = filter.toLowerCase();
      materials = materials.filter(
        mat =>
          mat.name.toLowerCase().includes(searchTerm) ||
          mat.description?.toLowerCase().includes(searchTerm) ||
          mat.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return materials;
  }

  /**
   * Get user tools with optional filtering
   */
  public getUserTools(userId: string, filter?: string): LibraryItem[] {
    let tools = this.userTools[userId] || [];

    if (filter) {
      const searchTerm = filter.toLowerCase();
      tools = tools.filter(
        tool =>
          tool.name.toLowerCase().includes(searchTerm) ||
          tool.description?.toLowerCase().includes(searchTerm) ||
          tool.type.toLowerCase().includes(searchTerm) ||
          tool.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return tools;
  }

  /**
   * Get user machine configs with optional filtering
   */
  public getUserMachineConfigs(userId: string, filter?: string): LibraryItem[] {
    let configs = this.userMachineConfigs[userId] || [];

    if (filter) {
      const searchTerm = filter.toLowerCase();
      configs = configs.filter(
        config =>
          config.name.toLowerCase().includes(searchTerm) ||
          config.description?.toLowerCase().includes(searchTerm) ||
          config.type.toLowerCase().includes(searchTerm) ||
          config.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }

    return configs;
  }

  /**
   * Get predefined components (static data)
   */
  public getPredefinedComponents(): LibraryItem[] {
    return predefinedComponents.map(comp => ({
      id: comp.name.replace(/\s+/g, "-").toLowerCase(),
      name: comp.name,
      description: comp.description || "",
      category: "component",
      type: comp.type || "",
      properties: (comp.data?.valueOf as Record<string, any>) || {},
      tags: comp.data?.toString ? Object.keys(comp.data.toString) : []
    }));
  }

  /**
   * Get predefined materials (static data)
   */
  public getPredefinedMaterials(): LibraryItem[] {
    return predefinedMaterials.map(mat => ({
      id: mat.name.replace(/\s+/g, "-").toLowerCase(),
      name: mat.name,
      description: mat.description || "",
      category: "material",
      type: "material",
      properties: (mat.properties?.valueOf as Record<string, any>) || {},
      tags: mat.properties ? Object.keys(mat.properties) : []
    }));
  }

  /**
   * Get predefined tools (static data)
   */
  public getPredefinedTools(): LibraryItem[] {
    return predefinedTools.map(tool => ({
      id: tool.name?.replace(/\s+/g, "-").toLowerCase() || "unnamed-tool",
      name: tool.name || "Unnamed Tool",
      description: tool.notes || "",
      category: "tool",
      type: tool.type || "unknown",
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
      tags: ["predefined", tool.type || "tool", tool.material || "material"]
    }));
  }

  /**
   * Add a component to the CAD canvas
   */
  public addComponentToCAD(libraryItem: LibraryItem): string | null {
    try {
      const cadElement = transformLibraryItemToCADElement(libraryItem);
      if (cadElement) {
        const { addElement } = useElementsStore.getState();
        addElement(cadElement);
        return cadElement.id;
      }
      return null;
    } catch (error) {
      console.error("Failed to add component to CAD:", error);
      return null;
    }
  }

  /**
   * Save a component to the database via API
   */
  public async saveComponent(component: Omit<LibraryItem, "id">, projectId: string, userId: string): Promise<string> {
    try {
      const savedComponent = await this.cachedFetch("/api/components", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: component.name,
          description: component.description,
          data: component.properties,
          type: component.type,
          isPublic: false,
          projectId: projectId
        })
      });

      // Update local cache
      if (!this.userComponents[userId]) {
        this.userComponents[userId] = [];
      }

      this.userComponents[userId].push({
        id: savedComponent.id,
        name: savedComponent.name,
        description: savedComponent.description,
        category: "component",
        type: savedComponent.type || "custom",
        properties: savedComponent.data,
        tags: ["user", savedComponent.type || "custom"],
        preview: savedComponent.thumbnail
      });

      // Invalidate relevant caches after save
      this.invalidateCache("/api/components");

      return savedComponent.id;
    } catch (error) {
      console.error("Failed to save component:", error);
      throw error;
    }
  }

  /**
   * Save a material to the database via API
   */
  public async saveMaterial(
    material: Omit<LibraryItem, "id">,
    userId: string,
    organizationId?: string
  ): Promise<string> {
    try {
      const savedMaterial = await this.cachedFetch("/api/materials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: material.name,
          description: material.description,
          properties: material.properties,
          isPublic: false,
          organizationId: organizationId
        })
      });

      // Update local cache
      if (!this.userMaterials[userId]) {
        this.userMaterials[userId] = [];
      }

      this.userMaterials[userId].push({
        id: savedMaterial.id,
        name: savedMaterial.name,
        description: savedMaterial.description,
        category: "material",
        type: "material",
        properties: savedMaterial.properties,
        tags: ["user", "material"]
      });

      // Invalidate relevant caches after save
      this.invalidateCache("/api/materials");

      return savedMaterial.id;
    } catch (error) {
      console.error("Failed to save material:", error);
      throw error;
    }
  }

  /**
   * Save a tool to the database via API
   */
  public async saveTool(tool: Omit<LibraryItem, "id">, userId: string, organizationId?: string): Promise<string> {
    try {
      const toolData = {
        name: tool.name,
        type: tool.type,
        diameter: tool.properties.diameter || 0,
        material: tool.properties.material || "HSS",
        numberOfFlutes: tool.properties.numberOfFlutes,
        maxRPM: tool.properties.maxRPM,
        coolantType: tool.properties.coolantType,
        cuttingLength: tool.properties.cuttingLength,
        totalLength: tool.properties.totalLength,
        shankDiameter: tool.properties.shankDiameter,
        notes: tool.description,
        isPublic: false,
        organizationId: organizationId
      };

      const savedTool = await this.cachedFetch("/api/tools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(toolData)
      });

      // Update local cache
      if (!this.userTools[userId]) {
        this.userTools[userId] = [];
      }

      this.userTools[userId].push({
        id: savedTool.id,
        name: savedTool.name,
        description: savedTool.notes,
        category: "tool",
        type: savedTool.type,
        properties: {
          diameter: savedTool.diameter,
          material: savedTool.material,
          numberOfFlutes: savedTool.numberOfFlutes,
          maxRPM: savedTool.maxRPM,
          coolantType: savedTool.coolantType,
          cuttingLength: savedTool.cuttingLength,
          totalLength: savedTool.totalLength,
          shankDiameter: savedTool.shankDiameter
        },
        tags: ["user", savedTool.type, savedTool.material]
      });

      // Invalidate relevant caches after save
      this.invalidateCache("/api/tools");

      return savedTool.id;
    } catch (error) {
      console.error("Failed to save tool:", error);
      throw error;
    }
  }

  /**
   * Create a CAD element from library item (legacy support)
   */
  public createCADElementFromLibrary(componentId: string): any {
    // Find the component in any of our libraries
    const allComponents = [
      ...this.cadComponents,
      ...Object.values(this.userComponents).flat(),
      ...this.getPredefinedComponents()
    ];

    const component = allComponents.find(comp => comp.id === componentId);
    if (component) {
      return transformLibraryItemToCADElement(component);
    }

    return null;
  }

  /**
   * Refresh user data (reload from API)
   */
  public async refreshUserData(userId: string): Promise<void> {
    await this.loadUserComponents(userId);
    await this.loadUserMaterials(userId);
    await this.loadUserTools(userId);
    await this.loadUserMachineConfigs(userId);
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.userComponents = {};
    this.userMaterials = {};
    this.userTools = {};
    this.userMachineConfigs = {};
    this.initialized = false;
    
    // Pulisci anche il cache API
    this.apiCache.clear();
    this.pendingRequests.clear();
    console.log("🧹 LibraryService cache cleared");
  }
}

export default LibraryService;
