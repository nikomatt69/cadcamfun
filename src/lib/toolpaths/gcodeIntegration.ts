import { fetchToolpathById, updateToolpath } from "../api/toolpaths";


// src/lib/toolpath/gcodeIntegration.ts
export interface Toolpath {
  id?: string;
  type: string;
  settings: {
    feedrate?: number;
    plungerate?: number;
    rpm?: number;
    depth?: number;
    stepdown?: number;
    stepover?: number;
    toolDiameter?: number;
    finishingAllowance?: number;
    coolant?: boolean;
    useArcFitting?: boolean;
    useHighSpeedMode?: boolean;
    useToolCompensation?: boolean;
  };
  paths?: Array<{
    type: string;
    points: Array<[number, number, number]>;
    feedrate?: number;
  }>;
}

export interface GcodeOptions {
  feedrate?: number;
  plungerate?: number;
  rpm?: number;
  depth?: number;
  stepdown?: number;
  stepover?: number;
  toolDiameter?: number;
  finishingAllowance?: number;
  coolant?: boolean;
  useArcFitting?: boolean;
  useHighSpeedMode?: boolean;
  useToolCompensation?: boolean;
}

export const generateGcodeFromExistingGenerator = async (toolpathId: string, options: GcodeOptions = {}) => {
  try {
    // Otteniamo il toolpath dal database
    const toolpath = await fetchToolpathById(toolpathId);
    
    // Utilizziamo il generatore esistente, assumendo che sia esposto globalmente o importabile
    let gcode = await generateGcode(toolpath.data as unknown as Toolpath, options);
    
    // Salviamo il G-code nel toolpath
    await updateToolpath({
      id: toolpathId,
      gcode
    });
    
    return gcode;
  } catch (error) {
    console.error('Error generating G-code from existing generator:', error);
    throw error;
  }
};

export const generateGcode = async (toolpath: Toolpath, options: GcodeOptions = {}): Promise<string> => {
  try {
    // Merge options with toolpath settings
    const mergedOptions = {
      ...toolpath.settings,
      ...options
    };

    // Generate G-code based on toolpath type and settings
    let gcode = '';
    
    // Add program header
    gcode += '; CAD/CAM FUN - Generated G-code\n';
    gcode += `; Operation: ${toolpath.type}\n`;
    gcode += `; Date: ${new Date().toISOString()}\n\n`;
    
    // Add basic setup
    gcode += 'G21 ; Set units to mm\n';
    gcode += 'G90 ; Absolute positioning\n';
    
    // Add coolant if enabled
    if (mergedOptions.coolant) {
      gcode += 'M8 ; Coolant on\n';
    }
    
    // Add spindle start
    if (mergedOptions.rpm) {
      gcode += `M3 S${mergedOptions.rpm} ; Start spindle clockwise\n`;
    }
    
    // Add the actual toolpath G-code here based on the type and paths
    if (toolpath.paths && toolpath.paths.length > 0) {
      gcode += '\n; Begin toolpath\n';
      toolpath.paths.forEach((path, index) => {
        gcode += `\n; Path ${index + 1}\n`;
        // Add path specific G-code here
      });
    }
    
    // Add program end
    gcode += '\n; End program\n';
    if (mergedOptions.coolant) {
      gcode += 'M9 ; Coolant off\n';
    }
    gcode += 'M5 ; Stop spindle\n';
    gcode += 'M30 ; Program end\n';
    
    return gcode;
  } catch (error) {
    console.error('Error generating G-code:', error);
    throw error;
  }
};        