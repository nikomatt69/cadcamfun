// src/lib/toolpathGeneratorUtils.ts
import { Element } from 'src/store/elementsStore';
import { extractElementGeometry, getElementDepth } from './elementGeometryUtils';
import { generateGenericToolpath, suggestMachiningParameters } from './genericToolpathUtils';
import { generateComponentToolpath } from './componentToolpathUtils';

/**
 * Main function to generate a toolpath for any element type
 * @param element The element to generate a toolpath for
 * @param settings The toolpath settings
 * @returns G-code string
 */
export function generateElementToolpath(element: Element, settings: any): string {
  if (!element) {
    return '; Error: No element provided\n';
  }
  
  // For components, use the specialized component handler
  if (element.type === 'component' || (element.elements && Array.isArray(element.elements) && element.elements.length > 0)) {
    return generateComponentToolpath(element, settings);
  }
  
  // Add common G-code header
  let gcode = '';
 
  
  // Add standard G-code initialization
  gcode += 'G90 ; Absolute positioning\n';
  gcode += 'G21 ; Metric units\n';
  gcode += 'G17 ; XY plane selection\n';
  gcode += `M3 S${settings.rpm} ; Start spindle\n`;
  
  if (settings.coolant) {
    gcode += 'M8 ; Coolant on\n';
  }
  
  gcode += 'G0 Z10 ; Move to safe height\n\n';
  
  // Add high-speed mode if enabled
  if (settings.useHighSpeedMode) {
    gcode += '; High Speed Machining mode enabled\n';
    gcode += 'G64 P0.01 ; Path blending with tolerance of 0.01mm\n\n';
  } else if (settings.useExactStop) {
    gcode += '; Exact Stop mode enabled\n';
    gcode += 'G61 ; Exact stop mode\n\n';
  }
  
  // Generate toolpath using generic approach
  let toolpathGcode = '';
  
  try {
    // Use the generic toolpath generator
    toolpathGcode = generateGenericToolpath(element, settings);
    
    // Add tool compensation if requested
    if (settings.useToolCompensation) {
      gcode += '; Tool compensation enabled\n';
      
      // Determine compensation direction based on offset and direction
      let compensationDirection = '';
      
      if (settings.operationType === 'contour' || settings.operationType === 'profile') {
        if (settings.offset === 'outside') {
          compensationDirection = settings.direction === 'climb' ? 'G42' : 'G41';
        } else if (settings.offset === 'inside') {
          compensationDirection = settings.direction === 'climb' ? 'G41' : 'G42';
        }
      }
      
      if (compensationDirection) {
        gcode += `${compensationDirection} D${settings.toolNumber || 1} ; Tool compensation\n`;
        
        // Extract first line of movement from toolpath for approach
        const firstLine = toolpathGcode.split('\n').find(line => line.trim().startsWith('G1'));
        if (firstLine) {
          const match = firstLine.match(/X([-\d.]+)\s+Y([-\d.]+)/);
          if (match) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            
            // Add approach point for compensation
            gcode += `G0 X${(x - 5).toFixed(3)} Y${y.toFixed(3)} ; Approach point for compensation\n`;
          }
        }
        
        // Add the toolpath
        gcode += toolpathGcode;
        
        // Add code to disable compensation
        gcode += 'G40 ; Cancel tool compensation\n';
      } else {
        // If we can't determine direction, use toolpath without compensation
        gcode += toolpathGcode;
      }
    } else {
      // Add the toolpath without compensation
      gcode += toolpathGcode;
    }
    
    // Add finishing pass if enabled
    if (settings.finishingPass) {
      const geometry = extractElementGeometry(element);
      
      gcode += '\n; Finishing pass\n';
      gcode += `; Finishing allowance: ${settings.finishingAllowance}mm\n`;
      gcode += `; Finishing strategy: ${settings.finishingStrategy || 'contour'}\n`;
      
      // Simple approach for finishing - just repeat the last contour with smaller step
      gcode += 'G0 Z5 ; Move to safe height for finishing pass\n';
      
      // Adjust settings for finishing pass
      const finishingSettings = {
        ...settings,
        stepdown: settings.stepdown / 2, // Use smaller step for finishing
        feedrate: settings.feedrate * 0.8, // Slow down for better finish
      };
      
      // Generate finishing toolpath (simplified - just repeats the last contour)
      const finishingGcode = generateGenericToolpath(element, finishingSettings);
      gcode += finishingGcode;
    }
  } catch (error) {
    console.error('Error generating toolpath:', error);
    gcode += `; Error generating toolpath: ${error}\n`;
  }
  
  // Program ending
  gcode += '\n; End of program\n';
  gcode += 'G0 Z30 ; Move to safe height\n';
  
  if (settings.coolant) {
    gcode += 'M9 ; Coolant off\n';
  }
  
  gcode += 'M5 ; Stop spindle\n';

  
  return gcode;
}

/**
 * Automatically adjust settings based on the selected element
 * @param element The selected element
 * @param currentSettings The current toolpath settings
 * @returns Updated settings
 */
export function adjustSettingsForElement(element: Element, currentSettings: any): any {
  if (!element) {
    return currentSettings;
  }
  
  const updatedSettings = { ...currentSettings };
  
  // Extract element geometry
  const geometry = extractElementGeometry(element);
  
  // Get suggested parameters
  const suggestions = suggestMachiningParameters(element);
  
  // Update depth if not manually set
  if (!updatedSettings.depthSetManually) {
    updatedSettings.depth = suggestions.depth;
  }
  
  // Update operation type if appropriate for the element
  if (suggestions.operationType) {
    updatedSettings.operationType = suggestions.operationType;
  }
  
  // Adjust stepdown based on element size
  if (suggestions.stepdown) {
    updatedSettings.stepdown = suggestions.stepdown;
  }
  
  // For very small elements, adjust feedrate and tool
  const maxDimension = Math.max(
    geometry.width || 0,
    geometry.height || 0,
    geometry.radius ? geometry.radius * 2 : 0
  );
  
  if (maxDimension < updatedSettings.toolDiameter * 2) {
    // Element is small relative to tool - suggest smaller tool
    updatedSettings.suggestSmallerTool = true;
  }
  
  return updatedSettings;
}

/**
 * Default toolpath generator for any element
 * This is the main entry point for generating toolpaths
 * @param element The element to generate a toolpath for
 * @param settings The toolpath settings
 * @returns G-code string
 */
export function generateDefaultToolpath(element: Element, settings: any): string {
  // Adjust settings for the specific element
  const optimizedSettings = adjustSettingsForElement(element, settings);
  
  // Generate the toolpath
  return generateElementToolpath(element, optimizedSettings);
}