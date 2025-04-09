// src/lib/libraryService.ts
import { transformLibraryItemToCADElement } from './libraryTransform';

// Interface for library item
export interface LibraryItem {
  id: string;
  name: string;
  description?: string;
  category: 'component' | 'tool' | 'material' | 'machine';
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
  
  // Load predefined items
  public async loadPredefinedItems() {
    try {
      // Here you could fetch from static JSON files or API
      const components = await fetch('/api/library/predefined?category=component').then(res => res.json());
      const tools = await fetch('/api/library/predefined?category=tool').then(res => res.json());
      const materials = await fetch('/api/library/predefined?category=material').then(res => res.json());
      const machines = await fetch('/api/library/predefined?category=machine').then(res => res.json());
      
      this.predefinedItems.component = components;
      this.predefinedItems.tool = tools;
      this.predefinedItems.material = materials;
      this.predefinedItems.machine = machines;
    } catch (error) {
      console.error('Error loading predefined items:', error);
    }
  }
  
  // Load user components
  public async loadUserComponents(): Promise<void> {
    try {
      const response = await fetch('/api/library/components');
      const { data } = await response.json();
      this.userItems.component = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading user components:', error);
      this.userItems.component = [];
    }
  }

  // Load user materials
  public async loadUserMaterials(): Promise<void> {
    try {
      const response = await fetch('/api/library/materials');
      const { data } = await response.json();
      this.userItems.material = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading user materials:', error);
      this.userItems.material = [];
    }
  }

  // Load user tools
  public async loadUserTools(): Promise<void> {
    try {
      const response = await fetch('/api/library/tools');
      const { data } = await response.json();
      this.userItems.tool = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading user tools:', error);
      this.userItems.tool = [];
    }
  }

  // Load user machine configs
  public async loadUserMachineConfigs(): Promise<void> {
    try {
      const response = await fetch('/api/machine-configs');
      const { data } = await response.json();
      this.userItems.machine = Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error loading user machine configs:', error);
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
  
  // Add item to user library
  public async addItem(item: Omit<LibraryItem, 'id'>): Promise<LibraryItem> {
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add item to library');
      }
      
      const newItem = await response.json();
      
      // Add to local cache
      if (this.userItems[newItem.category]) {
        this.userItems[newItem.category].push(newItem);
      }
      
      return newItem;
    } catch (error) {
      console.error('Error adding item to library:', error);
      throw error;
    }
  }
  
  // Transform library item to CAD element
  public transformToCadElement(item: LibraryItem) {
    return transformLibraryItemToCADElement(item);
  }
  
  // Search across all library items
  public search(query: string): LibraryItem[] {
    const allItems = [
      ...this.getComponents(),
      ...this.getTools(),
      ...this.getMaterials(),
      ...this.getMachines()
    ];
    
    if (!query.trim()) {
      return allItems;
    }
    
    const lowerQuery = query.toLowerCase();
    
    return allItems.filter(item => 
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