// src/lib/libraryService.ts
import { transformLibraryItemToCADElement } from "./libraryTransform";

// Interface for library item
export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  category: "component" | "tool" | "material" | "machine";
  type: string;
  data: any;
  properties?: Record<string, any>;
  tags: string[];
  thumbnail?: string;
}

// Class to handle library operations
export class LibraryService {
  private static instance: LibraryService;
  private predefinedItems: Record<string, LibraryItem[]>;
  private userItems: Record<string, LibraryItem[]>;
  
  // Cache per le richieste API con timestamp
  private apiCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minuti
  
  // Tracking richieste in corso per evitare duplicati
  private pendingRequests = new Map<string, Promise<any>>();

  private constructor() {
    this.predefinedItems = {
      component: [],
      tool: [],
      material: [],
      machine: []
    };

    this.userItems = {
      component: [],
      tool: [],
      material: [],
      machine: []
    };
  }

  public static getInstance(): LibraryService {
    if (!LibraryService.instance) {
      LibraryService.instance = new LibraryService();
    }
    return LibraryService.instance;
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
          throw new Error(`Failed to fetch from ${url}: ${response.statusText}`);
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

  // Load predefined items (con cache)
  public async loadPredefinedItems() {
    try {
      // Utilizzo cachedFetch per tutte le richieste
      const [components, tools, materials, machines] = await Promise.all([
        this.cachedFetch("/api/library/predefined?category=component"),
        this.cachedFetch("/api/library/predefined?category=tool"),
        this.cachedFetch("/api/library/predefined?category=material"),
        this.cachedFetch("/api/library/predefined?category=machine")
      ]);

      this.predefinedItems.component = components;
      this.predefinedItems.tool = tools;
      this.predefinedItems.material = materials;
      this.predefinedItems.machine = machines;
    } catch (error) {
      console.error("Error loading predefined items:", error);
    }
  }

  // Load user components (con cache)
  public async loadUserComponents(): Promise<void> {
    try {
      const { data } = await this.cachedFetch("/api/library/components");
      this.userItems.component = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Error loading user components:", error);
      this.userItems.component = [];
    }
  }

  // Load user materials (con cache)
  public async loadUserMaterials(): Promise<void> {
    try {
      const { data } = await this.cachedFetch("/api/library/materials");
      this.userItems.material = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Error loading user materials:", error);
      this.userItems.material = [];
    }
  }

  // Load user tools (con cache)
  public async loadUserTools(): Promise<void> {
    try {
      const { data } = await this.cachedFetch("/api/library/tools");
      this.userItems.tool = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Error loading user tools:", error);
      this.userItems.tool = [];
    }
  }

  // Load user machine configs (con cache)
  public async loadUserMachineConfigs(): Promise<void> {
    try {
      const { data } = await this.cachedFetch("/api/machine-configs");
      this.userItems.machine = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Error loading user machine configs:", error);
      this.userItems.machine = [];
    }
  }

  // Initialize all user data
  public async initialize(): Promise<void> {
    await Promise.all([
      this.loadUserComponents(),
      this.loadUserMaterials(),
      this.loadUserTools(),
      this.loadUserMachineConfigs()
    ]);
  }

  // Get all components
  public getComponents(): LibraryItem[] {
    return [...this.predefinedItems.component, ...this.userItems.component];
  }

  // Get all tools
  public getTools(): LibraryItem[] {
    return [...this.predefinedItems.tool, ...this.userItems.tool];
  }

  // Get all materials
  public getMaterials(): LibraryItem[] {
    return [...this.predefinedItems.material, ...this.userItems.material];
  }

  // Get all machines
  public getMachines(): LibraryItem[] {
    return [...this.predefinedItems.machine, ...this.userItems.machine];
  }

  // Add item to user library (con cache)
  public async addItem(item: Omit<LibraryItem, "id">): Promise<LibraryItem> {
    try {
      const newItem = await this.cachedFetch("/api/library", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(item)
      });

      // Add to local cache
      if (this.userItems[newItem.category]) {
        this.userItems[newItem.category].push(newItem);
      }

      return newItem;
    } catch (error) {
      console.error("Error adding item to library:", error);
      throw error;
    }
  }

  // Transform library item to CAD element
  public transformToCadElement(item: LibraryItem) {
    return transformLibraryItemToCADElement(item);
  }

  // Search across all library items
  public search(query: string): LibraryItem[] {
    const allItems = [...this.getComponents(), ...this.getTools(), ...this.getMaterials(), ...this.getMachines()];

    if (!query.trim()) {
      return allItems;
    }

    const lowerQuery = query.toLowerCase();

    return allItems.filter(
      item =>
        item.name.toLowerCase().includes(lowerQuery) ||
        (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
        item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

// Export singleton instance
export const libraryService = LibraryService.getInstance();

// Initialize library service
export async function initLibraryService() {
  await libraryService.loadPredefinedItems();
  await libraryService.initialize();
  return libraryService;
}
