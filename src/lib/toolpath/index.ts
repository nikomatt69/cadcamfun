// src/lib/toolpathGenerator/index.ts
// Export all toolpath generator utilities from this central file

import { generateDefaultToolpath } from '../toolpathGeneratorUtils';

// Element geometry extraction
export { 
    extractElementGeometry, 
    getElementDepth,
    type ElementGeometry 
  } from 'src/lib/elementGeometryUtils';
  
  // Generic toolpath generation
  export { 
    generateGenericToolpath,
    suggestMachiningParameters
  } from 'src/lib/genericToolpathUtils';
  
  // Component-specific toolpath generation
  export { 
    generateComponentToolpath,
    optimizeComponentMachiningOrder
  } from 'src/lib/componentToolpathUtils';
  
  // Main toolpath generator utilities
  export {
    generateElementToolpath,
    adjustSettingsForElement,
    generateDefaultToolpath
  } from 'src/lib/toolpathGeneratorUtils';
  
  /**
   * Main function to generate a toolpath for the selected element
   * This is the primary entry point to be used in the ToolpathGenerator component
   */
  export function generateFromSelectedElements(selectedElement: any, settings: any): string {
    if (!selectedElement) {
      return '; No element selected for toolpath generation\n';
    }
    
    // Log information about the selected element
    console.log(`Generating toolpath for element: ${selectedElement.type} (ID: ${selectedElement.id})`);
    
    try {
      // Generate toolpath using the default generator
      return generateDefaultToolpath(selectedElement, settings);
    } catch (error) {
      console.error('Error generating toolpath:', error);
      return `; Error generating toolpath: ${error}\n`;
    }
  }