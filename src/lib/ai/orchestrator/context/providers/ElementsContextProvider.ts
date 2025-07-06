import { Element, useElementsStore } from "@/src/store/elementsStore";
import { ApplicationContext, ResponseArtifact } from "../../UnifiedAIOrchestrator";

export class ElementsContextProvider {
  private lastElementsSnapshot: Element[] = [];
  private lastUpdateTime: number = 0;
  private changeListeners: Set<() => void> = new Set();

  /**
   * Get current elements context from canvas/store
   */
  async getElementsContext(): Promise<ApplicationContext["elements"]> {
    const allElements = await this.getCurrentElements();
    const selectedElements = await this.getSelectedElements(allElements);
    const visibleElements = await this.getVisibleElements(allElements);

    return {
      selected: selectedElements,
      visible: visibleElements,
      total: allElements,
      types: this.calculateElementTypes(allElements),
      boundingBox: this.calculateBoundingBox(allElements)
    };
  }

  /**
   * Check for element updates periodically
   */
  checkForUpdates(): void {
    this.getCurrentElements().then(currentElements => {
      if (this.hasElementsChanged(currentElements)) {
        this.lastElementsSnapshot = [...currentElements];
        this.lastUpdateTime = Date.now();
        this.changeListeners.forEach(listener => listener());
      }
    });
  }

  /**
   * Process artifacts and extract elements
   */
  processArtifacts(artifacts: ResponseArtifact[]): void {
    const newElements: Element[] = [];
    artifacts.forEach(artifact => {
      if (artifact.type === "elements" && Array.isArray(artifact.content)) {
        newElements.push(...artifact.content);
      }
    });

    if (newElements.length > 0) {
      console.log(
        "[ElementsContextProvider] Received new elements from artifacts, expecting store to update.",
        newElements
      );
      this.notifyNewElements(newElements);
    }
  }

  /**
   * Add change listener
   */
  addChangeListener(listener: () => void): () => void {
    this.changeListeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Get current elements from various sources
   */
  private async getCurrentElements(): Promise<Element[]> {
    // Get elements from the Zustand store
    return useElementsStore.getState().elements;
  }

  /**
   * Get selected elements
   */
  private async getSelectedElements(allElements: Element[]): Promise<Element[]> {
    // Filter elements from the store based on an isSelected property
    return allElements.filter(el => el.isSelected);
  }

  /**
   * Get visible elements (filtered by layers, visibility, etc.)
   */
  private async getVisibleElements(allElements: Element[]): Promise<Element[]> {
    // Filter elements from the store based on an isVisible property
    // And potentially layer visibility
    return allElements.filter(el => el.isVisible && (el.layerId ? this.isLayerVisible(el.layerId) : true));
  }

  /**
   * Calculate element types distribution
   */
  private calculateElementTypes(elements: Element[]): Record<string, number> {
    const types: Record<string, number> = {};
    elements.forEach(el => {
      types[el.type] = (types[el.type] || 0) + 1;
    });
    return types;
  }

  /**
   * Calculate bounding box for all elements
   */
  private calculateBoundingBox(elements: Element[]): ApplicationContext["elements"]["boundingBox"] {
    if (elements.length === 0) {
      return undefined;
    }

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    elements.forEach(el => {
      const bounds = this.getElementBounds(el);
      if (bounds) {
        minX = Math.min(minX, bounds.min.x);
        minY = Math.min(minY, bounds.min.y);
        minZ = Math.min(minZ, bounds.min.z);
        maxX = Math.max(maxX, bounds.max.x);
        maxY = Math.max(maxY, bounds.max.y);
        maxZ = Math.max(maxZ, bounds.max.z);
      }
    });

    if (!isFinite(minX)) {
      return undefined;
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
  }

  /**
   * Get bounds for a single element
   */
  private getElementBounds(
    element: Element
  ): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
    const { x, y, z } = element;
    let halfWidth = 0,
      halfHeight = 0,
      halfDepth = 0;

    if (element.type === "cube" || element.type === "box") {
      halfWidth = (element.width || 0) / 2;
      halfHeight = (element.height || 0) / 2;
      halfDepth = (element.depth || 0) / 2;
    } else if (element.type === "sphere") {
      halfWidth = halfHeight = halfDepth = element.radius || 0;
    } else if (element.type === "cylinder") {
      halfWidth = halfDepth = element.radius || 0;
      halfHeight = (element.height || 0) / 2;
    } else if (element.type === "plane") {
      halfWidth = (element.width || 0) / 2;
      halfHeight = (element.height || 0) / 2;
    }

    if (halfWidth === 0 && halfHeight === 0 && halfDepth === 0 && element.type !== "plane") {
      if (element.type === "point" || element.type === "vertex") {
        return {
          min: { x: x, y: y, z: z },
          max: { x: x, y: y, z: z }
        };
      }
    }

    return {
      min: { x: x - halfWidth, y: y - halfHeight, z: z - halfDepth },
      max: { x: x + halfWidth, y: y + halfHeight, z: z + halfDepth }
    };
  }

  /**
   * Check if elements have changed since last snapshot
   */
  private hasElementsChanged(currentElements: Element[]): boolean {
    if (currentElements.length !== this.lastElementsSnapshot.length) {
      return true;
    }
    for (let i = 0; i < currentElements.length; i++) {
      if (currentElements[i] !== this.lastElementsSnapshot[i]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a layer is visible
   */
  private isLayerVisible(layerId: string): boolean {
    return true;
  }

  /**
   * Notify about new elements
   */
  private notifyNewElements(elements: Element[]): void {
    console.log("[ElementsContextProvider] Notifying listeners of new elements:", elements.length);
  }

  /**
   * Get empty elements context
   */
  private getEmptyElementsContext(): ApplicationContext["elements"] {
    return {
      selected: [],
      visible: [],
      total: [],
      types: {},
      boundingBox: undefined
    };
  }
}
