// src/lib/bridges/componentCadBridge.ts
import { Component, validateComponentData, normalizeComponentData } from 'src/types/component';

interface ComponentCadBridgeOptions {
  validateBeforeSend?: boolean;
  preserveHistory?: boolean;
  timeoutMs?: number;
}

export class ComponentCadBridge {
  private static STORAGE_KEY = 'componentToLoadInCAD';
  private static TIMESTAMP_KEY = 'componentToLoadInCAD_timestamp';
  
  /**
   * Send a component to the CAD editor
   */
  static sendComponentToCAD(
    component: Component, 
    options: ComponentCadBridgeOptions = {}
  ): boolean {
    try {
      const { validateBeforeSend = true } = options;
      
      // Validate component data if requested
      if (validateBeforeSend) {
        const validation = validateComponentData(component.data);
        if (!validation.valid) {
          console.error('Invalid component data:', validation.errors);
          throw new Error(`Invalid component data: ${validation.errors?.join(', ')}`);
        }
      }
      
      // Prepare component data for CAD
      const componentForCAD = {
        id: component.id,
        name: component.name,
        data: normalizeComponentData(component.data)
      };
      
      // Store in localStorage with timestamp
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(componentForCAD));
      localStorage.setItem(this.TIMESTAMP_KEY, Date.now().toString());
      
      return true;
    } catch (error) {
      console.error('Error sending component to CAD:', error);
      return false;
    }
  }
  
  /**
   * Check if there's a component waiting to be loaded in CAD
   */
  static hasPendingComponent(): boolean {
    return localStorage.getItem(this.STORAGE_KEY) !== null;
  }
  
  /**
   * Get the component waiting to be loaded in CAD
   */
  static getPendingComponent(): { component: any; timestamp: number } | null {
    try {
      const componentStr = localStorage.getItem(this.STORAGE_KEY);
      const timestampStr = localStorage.getItem(this.TIMESTAMP_KEY);
      
      if (!componentStr) return null;
      
      return {
        component: JSON.parse(componentStr),
        timestamp: timestampStr ? parseInt(timestampStr, 10) : Date.now()
      };
    } catch (error) {
      console.error('Error getting pending component:', error);
      return null;
    }
  }
  
  /**
   * Clear the pending component
   */
  static clearPendingComponent(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.TIMESTAMP_KEY);
  }
}