/**
 * Advanced Fanuc-specific G-code generator
 * 
 * Features:
 * - Specialized for Fanuc CNC controllers
 * - Support for Fanuc-specific syntax and cycles
 * - Post-processor for optimizing and validating code
 * - Simulation validation to verify tool path integrity
 */

// Core interfaces for CNC programming
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Arc {
  center: Point3D;
  startPoint: Point3D;
  endPoint: Point3D;
  radius: number;
  direction: 'CW' | 'CCW';
}

// Fanuc-specific parameters and settings
export interface FanucMachineParameters {
  controllerType: 'Fanuc 0i' | 'Fanuc 30i' | 'Fanuc 31i' | 'Fanuc 0i-MF' | 'Fanuc 31i-B';
  highSpeedMode: boolean;
  nanoSmoothing: boolean;
  useAICC: boolean; // AI Contour Control
  useAIAPC?: boolean; // AI Adaptive Precision Control
  programNumber: string; // e.g. "O1000"
  macroVariables?: Record<number, number>; // For parametric programming
  feedrateMode: 'per-minute' | 'per-revolution';
  cuttingMode: 'G64' | 'G61' | 'G61.1'; // Exact stop, cutting mode or exact stop modal
  workOffset: 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59' | string; // Support for G54.1 P1 etc.
  useDecimalPoint: boolean; // Some Fanuc controllers require leading zeros
  maxBlockNumber: number; // For block numbering, e.g. 9999
  blockNumberIncrement: number; // e.g. 10 for N10, N20, etc.
  toolChangePosition?: Point3D; // Safe position for tool changes
  useSubPrograms: boolean; // Whether to generate subprograms for repeated operations
  maxRapidFeedrate?: Record<string, number>; // Max rapid movement speed per axis
  useInches?: boolean; // G20/G21 setting
  simulationValidation: boolean; // Whether to run simulation validation
  maxFeedrate: number; // Maximum allowed feedrate
  maxSpindleSpeed: number; // Maximum spindle RPM
  coolantOptions: {
    flood: boolean; // M8
    mist: boolean; // M7
    through: boolean; // M8 + special parameter setting
  };
  optimizationLevel: 'none' | 'basic' | 'advanced';
}

// Interface for tool definition
export interface FanucTool {
  id: number; // Tool number
  type: 'mill' | 'drill' | 'tap' | 'reamer' | 'boring' | 'turn' | 'groove' | 'thread';
  diameter: number;
  length: number;
  cornerRadius?: number;
  numberOfFlutes?: number;
  material?: string;
  compensation: {
    lengthOffset: number; // H value
    diameterOffset: number; // D value
    lengthWear?: number; // For advanced tool management
    diameterWear?: number; // For advanced tool management
  };
  maxFeedrate?: number;
  maxSpindleSpeed?: number;
  coolantRequired: boolean;
}

// Interface for a toolpath operation
export interface FanucOperation {
  type: 'facing' | 'profile' | 'pocket' | 'drill' | 'tap' | 'bore' | 'thread' | 'turn' | 'groove' | 'contour' | 'custom';
  tool: FanucTool;
  depth: number;
  stepdown?: number;
  geometry: Array<Point3D | Arc>;
  parameters: {
    feedrate: number;
    plungeFeedrate: number;
    spindleSpeed: number;
    coolant: boolean;
    useToolCompensation: boolean;
    compensationType?: 'G41' | 'G42'; // Left or right cutter compensation
    stockToLeave?: number; // Material to leave for finishing
    finishPass?: boolean;
    approachStrategy: 'direct' | 'ramp' | 'helix' | 'pre-drill';
    exitStrategy: 'direct' | 'ramp' | 'loop';
    useCannedCycle?: boolean; // Whether to use Fanuc canned cycles where applicable
    useRigidTapping?: boolean; // For tapping operations
    cycleParameters?: Record<string, number>; // Specific parameters for canned cycles
  };
}

// Interface for the entire CNC program
export interface FanucProgram {
  programName: string;
  operations: FanucOperation[];
  workpieceZero: Point3D; // Workpiece zero position
  workpieceMaterial?: string;
  workpieceDimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  stockSize?: {
    width: number;
    height: number;
    depth: number;
  };
  fixtures?: {
    type: string;
    position: Point3D;
  }[];
  machineParameters: FanucMachineParameters;
  tools: FanucTool[];
  useOptionalStop?: boolean; // M01 after each operation
  safetyChecks: boolean; // Enable extra safety validations
}

/**
 * Main function to generate Fanuc-specific G-code from program definition
 */
export function generateFanucGcode(program: FanucProgram): { gcode: string; validationResults?: any } {
  try {
    // Generate base G-code
    let gcode = generateBaseGcode(program);
    
    // Apply Fanuc-specific post-processing
    gcode = applyFanucPostProcessor(gcode, program);
    
    // Validate the G-code if enabled
    const validationResults = program.machineParameters.simulationValidation ? 
      simulateAndValidateGcode(gcode, program) : undefined;
    
    return { gcode, validationResults };
  } catch (error) {
    console.error('Error generating Fanuc G-code:', error);
    throw new Error(`Failed to generate Fanuc G-code: ${error}`);
  }
}

/**
 * Generate base G-code program structure
 */
function generateBaseGcode(program: FanucProgram): string {
  let gcode = '';
  
  // Program header with number and comments
  gcode += `${program.machineParameters.programNumber} (${program.programName})\n`;
  gcode += `(CREATED: ${new Date().toISOString()})\n`;
  gcode += `(MATERIAL: ${program.workpieceMaterial || 'UNDEFINED'})\n\n`;
  
  // Add machine setup commands
  gcode += generateMachineSetupCommands(program);
  
  // Initial safe moves and setup
  gcode += generateInitialSetup(program);
  
  // Process each operation
  program.operations.forEach((operation, index) => {
    gcode += `\n(OPERATION ${index + 1}: ${operation.type.toUpperCase()})\n`;
    
    // Optional stop between operations if configured
    if (index > 0 && program.useOptionalStop) {
      gcode += 'M01 (OPTIONAL STOP)\n';
    }
    
    // Tool change sequence
    gcode += generateToolChange(operation.tool, program);
    
    // Operation specific G-code
    switch (operation.type) {
      case 'profile':
        gcode += generateProfileOperation(operation, program);
        break;
      case 'pocket':
        gcode += generatePocketOperation(operation, program);
        break;
      case 'drill':
        gcode += generateDrillOperation(operation, program);
        break;
      case 'tap':
        gcode += generateTapOperation(operation, program);
        break;
      case 'bore':
        gcode += generateBoreOperation(operation, program);
        break;
      case 'facing':
        gcode += generateFacingOperation(operation, program);
        break;
      case 'thread':
        gcode += generateThreadOperation(operation, program);
        break;
      case 'turn':
        gcode += generateTurnOperation(operation, program);
        break;
      case 'groove':
        gcode += generateGrooveOperation(operation, program);
        break;
      case 'contour':
        gcode += generateContourOperation(operation, program);
        break;
      default:
        gcode += generateCustomOperation(operation, program);
    }
    
    // Return to safe height/position
    gcode += 'G0 Z100. (RETRACT TO SAFE HEIGHT)\n';
    // Turn off coolant after operation
    gcode += 'M9 (COOLANT OFF)\n';
  });
  
  // Program end
  gcode += generateProgramEnd(program);
  
  return gcode;
}

/**
 * Generate machine setup commands (units, work offset, etc)
 */
function generateMachineSetupCommands(program: FanucProgram): string {
  let setup = '';
  
  // Set units (G20 = inches, G21 = mm)
  setup += program.machineParameters.useInches ? 'G20 (INCH)\n' : 'G21 (MM)\n';
  
  // Set programming mode - absolute positioning
  setup += 'G90 (ABSOLUTE POSITIONING)\n';
  
  // Plane selection - typically XY plane for milling
  setup += 'G17 (XY PLANE SELECTION)\n';
  
  // Cutting mode setting
  setup += `${program.machineParameters.cuttingMode} (CUTTING MODE)`
    + (program.machineParameters.cuttingMode === 'G64' ? ' (CONTINUOUS PATH MODE)\n' : 
       program.machineParameters.cuttingMode === 'G61' ? ' (EXACT STOP MODE)\n' : 
       ' (EXACT STOP MODAL)\n');
  
  // Feedrate mode
  setup += program.machineParameters.feedrateMode === 'per-minute' ? 
    'G94 (FEED PER MINUTE)\n' : 'G95 (FEED PER REVOLUTION)\n';
  
  // Set work coordinate system
  setup += `${program.machineParameters.workOffset} (WORK OFFSET)\n`;
  
  // Add high speed mode settings if enabled
  if (program.machineParameters.highSpeedMode) {
    setup += 'G05.1 Q1 (HIGH SPEED MODE ON)\n';
  }
  
  // Add nano smoothing if enabled
  if (program.machineParameters.nanoSmoothing) {
    setup += 'G05.1 Q3 (NANO SMOOTHING ON)\n';
  }
  
  // Add AI Contour Control if enabled
  if (program.machineParameters.useAICC) {
    setup += 'G05.1 Q1 (AI CONTOUR CONTROL ON)\n';
  }
  
  // Set any required macro variables
  if (program.machineParameters.macroVariables) {
    setup += '\n(MACRO VARIABLE SETUP)\n';
    Object.entries(program.machineParameters.macroVariables).forEach(([variable, value]) => {
      setup += `#${variable} = ${value}\n`;
    });
  }
  
  return setup;
}

/**
 * Generate initial setup commands (safe moves, etc)
 */
function generateInitialSetup(program: FanucProgram): string {
  let setup = '';
  
  // Safe initial movement - return to reference point
  setup += 'G91 G28 Z0 (RETURN Z TO REFERENCE)\n';
  setup += 'G28 X0 Y0 (RETURN XY TO REFERENCE)\n';
  setup += 'G90 (BACK TO ABSOLUTE POSITIONING)\n';
  
  // Move to initial position if specified
  if (program.machineParameters.toolChangePosition) {
    const pos = program.machineParameters.toolChangePosition;
    setup += `G0 X${formatCoordinate(pos.x, program)} Y${formatCoordinate(pos.y, program)} (MOVE TO SAFE POSITION)\n`;
    setup += `G0 Z${formatCoordinate(pos.z, program)} (MOVE TO SAFE HEIGHT)\n`;
  }
  
  return setup;
}

/**
 * Generate tool change sequence
 */
function generateToolChange(tool: FanucTool, program: FanucProgram): string {
  let toolChange = '';
  
  // Move to safe Z height before tool change
  if (program.machineParameters.toolChangePosition) {
    const pos = program.machineParameters.toolChangePosition;
    toolChange += `G0 Z${formatCoordinate(pos.z, program)} (RETRACT FOR TOOL CHANGE)\n`;
    toolChange += `G0 X${formatCoordinate(pos.x, program)} Y${formatCoordinate(pos.y, program)} (MOVE TO TOOL CHANGE XY)\n`;
  } else {
    toolChange += 'G0 Z100. (RETRACT FOR TOOL CHANGE)\n';
  }
  
  // Call tool
  toolChange += `T${tool.id} M6 (TOOL CHANGE: ${tool.type.toUpperCase()} D=${tool.diameter})\n`;
  
  // Apply tool length compensation
  toolChange += `G43 H${tool.compensation.lengthOffset} (TOOL LENGTH COMPENSATION)\n`;
  
  // Set spindle speed and start spindle
  toolChange += `S${Math.min(tool.maxSpindleSpeed || 99999, program.machineParameters.maxSpindleSpeed)} M3 (SPINDLE ON CW)\n`;
  
  // Turn on coolant if required
  if (tool.coolantRequired) {
    if (program.machineParameters.coolantOptions.through) {
      toolChange += 'M8 (THROUGH COOLANT ON)\n';
    } else if (program.machineParameters.coolantOptions.flood) {
      toolChange += 'M8 (FLOOD COOLANT ON)\n';
    } else if (program.machineParameters.coolantOptions.mist) {
      toolChange += 'M7 (MIST COOLANT ON)\n';
    }
  }
  
  return toolChange;
}

/**
 * Generate profile operation G-code
 */
function generateProfileOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Calculate depths and passes
  const totalDepth = operation.depth;
  const stepdown = operation.stepdown || totalDepth;
  const passes = Math.ceil(totalDepth / stepdown);
  
  // Apply tool compensation if requested
  if (operation.parameters.useToolCompensation && operation.parameters.compensationType) {
    gcode += `${operation.parameters.compensationType} D${operation.tool.compensation.diameterOffset} (CUTTER COMPENSATION)\n`;
  }
  
  // Perform multiple passes if needed
  for (let pass = 1; pass <= passes; pass++) {
    const currentDepth = Math.min(pass * stepdown, totalDepth);
    
    gcode += `(PASS ${pass}/${passes} - DEPTH: ${currentDepth.toFixed(3)})\n`;
    
    // First point approach
    if (operation.geometry.length > 0) {
      const firstPoint = operation.geometry[0] as Point3D;
      gcode += `G0 X${formatCoordinate(firstPoint.x, program)} Y${formatCoordinate(firstPoint.y, program)} (RAPID TO START POSITION)\n`;
      
      // Handle different approach strategies
      switch (operation.parameters.approachStrategy) {
        case 'ramp':
          gcode += generateRampEntry(firstPoint, currentDepth, operation, program);
          break;
        case 'helix':
          gcode += generateHelixEntry(firstPoint, currentDepth, operation, program);
          break;
        default: // direct plunge
          gcode += `G1 Z${formatCoordinate(-currentDepth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO DEPTH)\n`;
      }
      
      // Process remaining geometry
      for (let i = 1; i < operation.geometry.length; i++) {
        const elem = operation.geometry[i];
        
        if ('radius' in elem) { // It's an arc
          const arc = elem as Arc;
          if (arc.direction === 'CW') {
            gcode += `G2 X${formatCoordinate(arc.endPoint.x, program)} Y${formatCoordinate(arc.endPoint.y, program)} ` +
                     `I${formatCoordinate(arc.center.x - arc.startPoint.x, program)} ` + 
                     `J${formatCoordinate(arc.center.y - arc.startPoint.y, program)} ` +
                     `F${operation.parameters.feedrate} (CW ARC)\n`;
          } else {
            gcode += `G3 X${formatCoordinate(arc.endPoint.x, program)} Y${formatCoordinate(arc.endPoint.y, program)} ` +
                     `I${formatCoordinate(arc.center.x - arc.startPoint.x, program)} ` + 
                     `J${formatCoordinate(arc.center.y - arc.startPoint.y, program)} ` +
                     `F${operation.parameters.feedrate} (CCW ARC)\n`;
          }
        } else { // It's a point
          const point = elem as Point3D;
          gcode += `G1 X${formatCoordinate(point.x, program)} Y${formatCoordinate(point.y, program)} ` +
                   `Z${formatCoordinate(-currentDepth, program)} F${operation.parameters.feedrate} (LINEAR MOVE)\n`;
        }
      }
      
      // Handle exit strategy
      if (operation.parameters.exitStrategy === 'loop' && operation.geometry.length > 0) {
        const firstPoint = operation.geometry[0] as Point3D;
        gcode += `G1 X${formatCoordinate(firstPoint.x, program)} Y${formatCoordinate(firstPoint.y, program)} ` +
                 `F${operation.parameters.feedrate} (RETURN TO START)\n`;
      }
    }
  }
  
  // Cancel tool compensation if it was used
  if (operation.parameters.useToolCompensation) {
    gcode += 'G40 (CANCEL CUTTER COMPENSATION)\n';
  }
  
  return gcode;
}

/**
 * Generate pocket operation G-code
 */
function generatePocketOperation(operation: FanucOperation, program: FanucProgram): string {
  // For pocket operations, we might use a specific macro or canned cycle for Fanuc,
  // but for now we'll implement a generic pocket toolpath
  let gcode = '';
  
  // Calculate depths and passes
  const totalDepth = operation.depth;
  const stepdown = operation.stepdown || totalDepth;
  const passes = Math.ceil(totalDepth / stepdown);
  
  // For a simple pocket, we'll assume the first point is the center
  if (operation.geometry.length > 0) {
    const centerPoint = operation.geometry[0] as Point3D;
    
    // Perform multiple passes if needed
    for (let pass = 1; pass <= passes; pass++) {
      const currentDepth = Math.min(pass * stepdown, totalDepth);
      
      gcode += `(POCKET PASS ${pass}/${passes} - DEPTH: ${currentDepth.toFixed(3)})\n`;
      
      // Position over center
      gcode += `G0 X${formatCoordinate(centerPoint.x, program)} Y${formatCoordinate(centerPoint.y, program)} (POSITION OVER POCKET CENTER)\n`;
      
      // Plunge or helix entry
      if (operation.parameters.approachStrategy === 'helix') {
        gcode += generateHelixEntry(centerPoint, currentDepth, operation, program);
      } else {
        gcode += `G1 Z${formatCoordinate(-currentDepth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO DEPTH)\n`;
      }
      
      // Generate spiral outward toolpath for pocket
      // This is a simplified version - a real implementation would consider the actual pocket geometry
      gcode += `(SPIRAL POCKET CLEARING WOULD BE GENERATED HERE)\n`;
      
      // For demonstration, just do a sample pattern
      gcode += `G1 X${formatCoordinate(centerPoint.x + 10, program)} F${operation.parameters.feedrate} (SAMPLE MOVE)\n`;
      gcode += `G1 Y${formatCoordinate(centerPoint.y + 10, program)} (SAMPLE MOVE)\n`;
      gcode += `G1 X${formatCoordinate(centerPoint.x - 10, program)} (SAMPLE MOVE)\n`;
      gcode += `G1 Y${formatCoordinate(centerPoint.y - 10, program)} (SAMPLE MOVE)\n`;
      gcode += `G1 X${formatCoordinate(centerPoint.x, program)} Y${formatCoordinate(centerPoint.y, program)} (RETURN TO CENTER)\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate drilling operation G-code using Fanuc canned cycles
 */
function generateDrillOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Use canned cycle for drilling if enabled
  if (operation.parameters.useCannedCycle) {
    const R = 5.0; // Retract height
    const depth = operation.depth;
    const P = operation.parameters.cycleParameters?.dwellTime || 0; // Dwell time in seconds
    const F = operation.parameters.feedrate;
    
    // Set up canned cycle - G81 is simple drilling
    gcode += `G81 R${formatCoordinate(R, program)} Z${formatCoordinate(-depth, program)} F${F} (DRILL CYCLE)\n`;
    
    // Process each point for drilling
    operation.geometry.forEach((point, index) => {
      const pt = point as Point3D; // Assume all geometry points are drill positions
      gcode += `X${formatCoordinate(pt.x, program)} Y${formatCoordinate(pt.y, program)} (HOLE ${index + 1})\n`;
    });
    
    // Cancel canned cycle
    gcode += 'G80 (CANCEL DRILL CYCLE)\n';
  } else {
    // Manual drilling without canned cycle
    operation.geometry.forEach((point, index) => {
      const pt = point as Point3D;
      gcode += `(HOLE ${index + 1})\n`;
      gcode += `G0 X${formatCoordinate(pt.x, program)} Y${formatCoordinate(pt.y, program)} (POSITION)\n`;
      gcode += `G0 Z5.0 (MOVE TO CLEARANCE PLANE)\n`;
      gcode += `G1 Z${formatCoordinate(-operation.depth, program)} F${operation.parameters.plungeFeedrate} (DRILL)\n`;
      gcode += `G0 Z5.0 (RETRACT)\n`;
    });
  }
  
  return gcode;
}

/**
 * Generate tapping operation G-code using Fanuc canned cycles
 */
function generateTapOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Always use canned cycle for tapping - it's much safer
  const R = 5.0; // Retract height
  const depth = operation.depth;
  const F = operation.parameters.feedrate;
  const pitch = operation.parameters.cycleParameters?.threadPitch || 1.0; // Thread pitch
  
  // Set up proper tapping cycle
  if (operation.parameters.useRigidTapping) {
    // Rigid tapping - G84 with M29 for rigid mode
    gcode += `M29 S${operation.parameters.spindleSpeed} (RIGID TAPPING MODE)\n`;
    gcode += `G84 R${formatCoordinate(R, program)} Z${formatCoordinate(-depth, program)} F${pitch} (RIGID TAP CYCLE)\n`;
  } else {
    // Regular tapping - G84
    gcode += `G84 R${formatCoordinate(R, program)} Z${formatCoordinate(-depth, program)} F${pitch} (TAP CYCLE)\n`;
  }
  
  // Process each point for tapping
  operation.geometry.forEach((point, index) => {
    const pt = point as Point3D;
    gcode += `X${formatCoordinate(pt.x, program)} Y${formatCoordinate(pt.y, program)} (TAP ${index + 1})\n`;
  });
  
  // Cancel canned cycle
  gcode += 'G80 (CANCEL TAP CYCLE)\n';
  
  return gcode;
}

/**
 * Generate boring operation G-code using Fanuc canned cycles
 */
function generateBoreOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Use appropriate boring cycle based on parameters
  const R = 5.0; // Retract height
  const depth = operation.depth;
  const F = operation.parameters.feedrate;
  const P = operation.parameters.cycleParameters?.dwellTime || 0; // Dwell time at bottom
  
  // Choose the appropriate boring cycle
  let cycleType = 'G85'; // Default: boring with feed out
  
  if (P > 0) {
    cycleType = 'G82'; // Boring with dwell
    gcode += `${cycleType} R${formatCoordinate(R, program)} Z${formatCoordinate(-depth, program)} P${P} F${F} (BORE WITH DWELL CYCLE)\n`;
  } else {
    gcode += `${cycleType} R${formatCoordinate(R, program)} Z${formatCoordinate(-depth, program)} F${F} (BORE CYCLE)\n`;
  }
  
  // Process each point for boring
  operation.geometry.forEach((point, index) => {
    const pt = point as Point3D;
    gcode += `X${formatCoordinate(pt.x, program)} Y${formatCoordinate(pt.y, program)} (BORE ${index + 1})\n`;
  });
  
  // Cancel canned cycle
  gcode += 'G80 (CANCEL BORE CYCLE)\n';
  
  return gcode;
}

/**
 * Generate facing operation G-code
 */
function generateFacingOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Facing typically requires start point, end point, width, and step-over
  if (operation.geometry.length >= 2) {
    const startPoint = operation.geometry[0] as Point3D;
    const endPoint = operation.geometry[1] as Point3D;
    
    // Extract step-over from parameters or use a default (40% of tool diameter)
    const stepover = operation.parameters.cycleParameters?.stepover || (operation.tool.diameter * 0.4);
    
    // Calculate the distance and direction for step-over
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.sqrt(dx*dx + dy*dy);
    
    // Calculate number of passes needed
    const passes = Math.ceil(distance / stepover);
    const actualStepover = distance / passes;
    
    // Calculate perpendicular direction for step-over
    const perpX = -dy / distance;
    const perpY = dx / distance;
    
    // Move to start position and set cutting depth
    gcode += `G0 X${formatCoordinate(startPoint.x, program)} Y${formatCoordinate(startPoint.y, program)} (MOVE TO FACING START)\n`;
    gcode += `G0 Z5.0 (MOVE TO CLEARANCE PLANE)\n`;
    gcode += `G1 Z${formatCoordinate(-operation.depth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO DEPTH)\n`;
    
    // Generate facing passes
    let currentX = startPoint.x;
    let currentY = startPoint.y;
    let direction = 1; // Alternating direction for climb vs. conventional
    
    for (let i = 0; i <= passes; i++) {
      // Calculate positions for this pass
      const passX = startPoint.x + perpX * i * actualStepover;
      const passY = startPoint.y + perpY * i * actualStepover;
      const endPassX = endPoint.x + perpX * i * actualStepover;
      const endPassY = endPoint.y + perpY * i * actualStepover;
      
      // Move to start of this pass
      gcode += `G1 X${formatCoordinate(passX, program)} Y${formatCoordinate(passY, program)} F${operation.parameters.feedrate} (START PASS ${i+1})\n`;
      
      // Cut along the pass
      gcode += `G1 X${formatCoordinate(endPassX, program)} Y${formatCoordinate(endPassY, program)} (FACE CUT)\n`;
      
      // Alternate direction for next pass
      direction *= -1;
    }
  } else {
    gcode += `(ERROR: FACING OPERATION REQUIRES AT LEAST 2 GEOMETRY POINTS)\n`;
  }
  
  return gcode;
}

/**
 * Generate thread milling operation G-code (specific to Fanuc)
 */
function generateThreadOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Thread operations can be complex - this is a simplified implementation
  if (operation.geometry.length > 0) {
    const centerPoint = operation.geometry[0] as Point3D;
    const threadDiameter = operation.parameters.cycleParameters?.threadDiameter || 10.0;
    const threadPitch = operation.parameters.cycleParameters?.threadPitch || 1.0;
    const threadDepth = operation.depth;
    
    // Move to position
    gcode += `G0 X${formatCoordinate(centerPoint.x, program)} Y${formatCoordinate(centerPoint.y, program)} (POSITION OVER THREAD CENTER)\n`;
    gcode += `G0 Z5.0 (MOVE TO CLEARANCE PLANE)\n`;
    
    // For Fanuc, we might use a specific thread milling cycle if available
    // This is simplified - real thread milling is more complex
    gcode += `(SIMPLIFIED THREAD MILLING SEQUENCE)\n`;
    gcode += `G1 Z${formatCoordinate(-threadDepth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO THREAD DEPTH)\n`;
    
    // Helical thread cutting movement would be here
    gcode += `(HELICAL THREAD CUTTING MOVEMENTS WOULD BE GENERATED HERE)\n`;
    gcode += `(THREAD DIAMETER: ${threadDiameter}, PITCH: ${threadPitch})\n`;
    
    // Retract
    gcode += `G0 Z5.0 (RETRACT AFTER THREADING)\n`;
  }
  
  return gcode;
}

/**
 * Generate turning operation G-code for Fanuc lathe controllers
 */
function generateTurnOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Turning operations are specific to lathe machines
  gcode += `(TURNING OPERATION FOR LATHE)\n`;
  
  // For lathes, we typically work in the XZ plane (G18)
  gcode += `G18 (XZ PLANE SELECTION FOR TURNING)\n`;
  
  // Set constant surface speed mode if available
  gcode += `G96 S${operation.parameters.spindleSpeed} (CONSTANT SURFACE SPEED MODE)\n`;
  gcode += `G50 S${Math.min(operation.tool.maxSpindleSpeed || 99999, program.machineParameters.maxSpindleSpeed)} (MAX SPINDLE SPEED LIMIT)\n`;
  
  // Process each point in the turning profile
  if (operation.geometry.length > 1) {
    const firstPoint = operation.geometry[0] as Point3D;
    
    // Position to start point - in turning X is diameter, Z is length
    gcode += `G0 X${formatCoordinate(firstPoint.x * 2, program)} Z${formatCoordinate(firstPoint.z, program)} (RAPID TO START)\n`;
    
    // Apply tool nose radius compensation if requested
    if (operation.parameters.useToolCompensation && operation.parameters.compensationType) {
      gcode += `${operation.parameters.compensationType} (TOOL NOSE RADIUS COMPENSATION)\n`;
    }
    
    // Process subsequent points for turning profile
    for (let i = 1; i < operation.geometry.length; i++) {
      const point = operation.geometry[i] as Point3D;
      
      // In turning, X is typically programmed as diameter, not radius
      gcode += `G1 X${formatCoordinate(point.x * 2, program)} Z${formatCoordinate(point.z, program)} F${operation.parameters.feedrate} (TURNING MOVE)\n`;
    }
    
    // Cancel tool nose radius compensation
    if (operation.parameters.useToolCompensation) {
      gcode += `G40 (CANCEL TOOL NOSE RADIUS COMPENSATION)\n`;
    }
  }
  
  // Return to G17 (XY plane) if this is a mixed mill/turn machine
  gcode += `G17 (RETURN TO XY PLANE FOR MILLING)\n`;
  
  return gcode;
}

/**
 * Generate grooving operation G-code for Fanuc lathe controllers
 */
function generateGrooveOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Grooving operations are specific to lathe machines
  gcode += `(GROOVING OPERATION FOR LATHE)\n`;
  
  // For lathes, we typically work in the XZ plane (G18)
  gcode += `G18 (XZ PLANE SELECTION FOR GROOVING)\n`;
  
  // Process groove parameters
  if (operation.geometry.length > 0) {
    const groovePoint = operation.geometry[0] as Point3D;
    const grooveWidth = operation.parameters.cycleParameters?.grooveWidth || operation.tool.diameter;
    const grooveDepth = operation.depth;
    
    // Move to groove start position
    gcode += `G0 X${formatCoordinate(groovePoint.x * 2, program)} Z${formatCoordinate(groovePoint.z, program)} (RAPID TO GROOVE START)\n`;
    
    // Determine if we need multiple passes
    const maxDepth = operation.parameters.cycleParameters?.maxGrooveDepth || grooveDepth;
    const passes = Math.ceil(grooveDepth / maxDepth);
    
    // Perform grooving passes
    for (let pass = 1; pass <= passes; pass++) {
      const currentDepth = Math.min(pass * maxDepth, grooveDepth);
      const currentX = groovePoint.x - currentDepth;
      
      gcode += `(GROOVE PASS ${pass}/${passes} - DEPTH: ${currentDepth.toFixed(3)})\n`;
      // Plunge in X (radial direction for a lathe)
      gcode += `G1 X${formatCoordinate(currentX * 2, program)} F${operation.parameters.plungeFeedrate} (GROOVE PLUNGE)\n`;
      
      // Retract
      gcode += `G1 X${formatCoordinate(groovePoint.x * 2, program)} (RETRACT FROM GROOVE)\n`;
    }
  }
  
  // Return to G17 (XY plane) if this is a mixed mill/turn machine
  gcode += `G17 (RETURN TO XY PLANE FOR MILLING)\n`;
  
  return gcode;
}

/**
 * Generate contour operation G-code with high-precision setting for Fanuc
 */
function generateContourOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Enable high precision contour mode if available on this Fanuc controller
  if (program.machineParameters.useAICC) {
    gcode += `G05.1 Q1 (ENABLE HIGH PRECISION CONTOUR CONTROL)\n`;
  }
  
  // Calculate depths and passes
  const totalDepth = operation.depth;
  const stepdown = operation.stepdown || totalDepth;
  const passes = Math.ceil(totalDepth / stepdown);
  
  // Apply tool compensation if requested
  if (operation.parameters.useToolCompensation && operation.parameters.compensationType) {
    gcode += `${operation.parameters.compensationType} D${operation.tool.compensation.diameterOffset} (CUTTER COMPENSATION)\n`;
  }
  
  // Perform multiple passes if needed
  for (let pass = 1; pass <= passes; pass++) {
    const currentDepth = Math.min(pass * stepdown, totalDepth);
    
    gcode += `(CONTOUR PASS ${pass}/${passes} - DEPTH: ${currentDepth.toFixed(3)})\n`;
    
    // Process geometry points for contour
    if (operation.geometry.length > 0) {
      const firstPoint = operation.geometry[0] as Point3D;
      gcode += `G0 X${formatCoordinate(firstPoint.x, program)} Y${formatCoordinate(firstPoint.y, program)} (RAPID TO START)\n`;
      
      // Plunge to depth
      gcode += `G1 Z${formatCoordinate(-currentDepth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO DEPTH)\n`;
      
      // Process subsequent points for contour
      for (let i = 1; i < operation.geometry.length; i++) {
        const elem = operation.geometry[i];
        
        if ('radius' in elem) { // It's an arc
          const arc = elem as Arc;
          if (arc.direction === 'CW') {
            gcode += `G2 X${formatCoordinate(arc.endPoint.x, program)} Y${formatCoordinate(arc.endPoint.y, program)} ` +
                     `I${formatCoordinate(arc.center.x - arc.startPoint.x, program)} ` + 
                     `J${formatCoordinate(arc.center.y - arc.startPoint.y, program)} ` +
                     `F${operation.parameters.feedrate} (CW ARC)\n`;
          } else {
            gcode += `G3 X${formatCoordinate(arc.endPoint.x, program)} Y${formatCoordinate(arc.endPoint.y, program)} ` +
                     `I${formatCoordinate(arc.center.x - arc.startPoint.x, program)} ` + 
                     `J${formatCoordinate(arc.center.y - arc.startPoint.y, program)} ` +
                     `F${operation.parameters.feedrate} (CCW ARC)\n`;
          }
        } else { // It's a point
          const point = elem as Point3D;
          gcode += `G1 X${formatCoordinate(point.x, program)} Y${formatCoordinate(point.y, program)} ` +
                   `F${operation.parameters.feedrate} (LINEAR MOVE)\n`;
        }
      }
      
      // Handle loop back to start if required
      if (operation.parameters.exitStrategy === 'loop' && operation.geometry.length > 0) {
        const firstPoint = operation.geometry[0] as Point3D;
        gcode += `G1 X${formatCoordinate(firstPoint.x, program)} Y${formatCoordinate(firstPoint.y, program)} ` +
                 `F${operation.parameters.feedrate} (RETURN TO START)\n`;
      }
    }
  }
  
  // Disable high precision mode
  if (program.machineParameters.useAICC) {
    gcode += `G05.1 Q0 (DISABLE HIGH PRECISION CONTOUR CONTROL)\n`;
  }
  
  // Cancel tool compensation if it was used
  if (operation.parameters.useToolCompensation) {
    gcode += `G40 (CANCEL CUTTER COMPENSATION)\n`;
  }
  
  return gcode;
}

/**
 * Generate custom operation G-code
 */
function generateCustomOperation(operation: FanucOperation, program: FanucProgram): string {
  let gcode = '';
  
  // Custom operations can contain user-defined commands
  gcode += `(CUSTOM OPERATION: ${operation.type})\n`;
  
  // For custom operations, we just process the geometry as simple moves
  if (operation.geometry.length > 0) {
    const firstPoint = operation.geometry[0] as Point3D;
    gcode += `G0 X${formatCoordinate(firstPoint.x, program)} Y${formatCoordinate(firstPoint.y, program)} (RAPID TO START)\n`;
    gcode += `G1 Z${formatCoordinate(-operation.depth, program)} F${operation.parameters.plungeFeedrate} (PLUNGE TO DEPTH)\n`;
    
    // Process subsequent points
    for (let i = 1; i < operation.geometry.length; i++) {
      const point = operation.geometry[i] as Point3D;
      gcode += `G1 X${formatCoordinate(point.x, program)} Y${formatCoordinate(point.y, program)} ` +
               `F${operation.parameters.feedrate} (CUSTOM MOVE)\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate program end sequence
 */
function generateProgramEnd(program: FanucProgram): string {
  let end = '\n';
  
  // Return to safe position
  if (program.machineParameters.toolChangePosition) {
    const pos = program.machineParameters.toolChangePosition;
    end += `G0 Z${formatCoordinate(pos.z, program)} (RETRACT TO SAFE Z)\n`;
    end += `G0 X${formatCoordinate(pos.x, program)} Y${formatCoordinate(pos.y, program)} (MOVE TO SAFE XY)\n`;
  } else {
    end += `G0 Z100. (RETRACT TO SAFE Z)\n`;
  }
  
  // Disable advanced features if they were enabled
  if (program.machineParameters.highSpeedMode) {
    end += `G05.1 Q0 (HIGH SPEED MODE OFF)\n`;
  }
  
  if (program.machineParameters.nanoSmoothing) {
    end += `G05.1 Q0 (NANO SMOOTHING OFF)\n`;
  }
  
  if (program.machineParameters.useAICC) {
    end += `G05.1 Q0 (AI CONTOUR CONTROL OFF)\n`;
  }
  
  // Return to the reference position
  end += `G91 G28 Z0 (RETURN Z TO REFERENCE)\n`;
  end += `G28 X0 Y0 (RETURN XY TO REFERENCE)\n`;
  end += `G90 (BACK TO ABSOLUTE POSITIONING)\n`;
  
  // Program end code
  end += `M30 (PROGRAM END)\n`;
  end += `%\n`;
  
  return end;
}

/**
 * Generate a helix entry move
 */
function generateHelixEntry(startPoint: Point3D, depth: number, operation: FanucOperation, program: FanucProgram): string {
  let helix = '';
  
  // Calculate helix parameters
  const helixRadius = (operation.tool.diameter * 0.4); // Typically 40% of tool diameter
  const centerX = startPoint.x;
  const centerY = startPoint.y;
  
  // Start at the surface
  helix += `G0 Z0 (POSITION TO SURFACE)\n`;
  
  // Calculate helix parameters for Fanuc
  // In Fanuc, we typically use G2/G3 with Z movement for helical interpolation
  helix += `G3 X${formatCoordinate(centerX, program)} Y${formatCoordinate(centerY, program)} ` +
          `Z${formatCoordinate(-depth, program)} ` +
          `I${formatCoordinate(helixRadius, program)} J0 ` +
          `F${operation.parameters.plungeFeedrate} (HELICAL ENTRY)\n`;
  
  return helix;
}

/**
 * Generate a ramp entry move
 */
function generateRampEntry(startPoint: Point3D, depth: number, operation: FanucOperation, program: FanucProgram): string {
  let ramp = '';
  
  // Calculate ramp length based on tool diameter and depth
  const rampLength = depth * 5; // Typical ramp length is 5x depth
  const rampAngle = Math.atan(depth / rampLength);
  
  // Calculate end point of ramp
  const endX = startPoint.x + rampLength;
  const endY = startPoint.y;
  
  // Start at surface
  ramp += `G0 Z0 (POSITION TO SURFACE)\n`;
  
  // Ramp down
  ramp += `G1 X${formatCoordinate(endX, program)} Z${formatCoordinate(-depth, program)} ` +
          `F${operation.parameters.plungeFeedrate} (RAMP ENTRY)\n`;
  
  // Return to original X position at final depth
  ramp += `G1 X${formatCoordinate(startPoint.x, program)} F${operation.parameters.feedrate} (RETURN TO START POSITION)\n`;
  
  return ramp;
}

/**
 * Format coordinate value according to program settings (decimal points, etc)
 */
function formatCoordinate(value: number, program: FanucProgram): string {
  // Format with or without decimal point based on Fanuc controller settings
  if (program.machineParameters.useDecimalPoint) {
    return value.toFixed(3); // Format with 3 decimal places
  } else {
    // Some older Fanuc controllers use integer format with implied decimal point
    // For example, 12.345 would be written as 12345
    return Math.round(value * 1000).toString();
  }
}

/**
 * Apply Fanuc-specific post-processing to the generated G-code
 */
function applyFanucPostProcessor(gcode: string, program: FanucProgram): string {
  let processed = gcode;
  
  // Apply block numbering if specified
  if (program.machineParameters.blockNumberIncrement > 0) {
    const lines = processed.split('\n');
    let blockNumber = 10; // Usually start at N10
    
    processed = lines.map(line => {
      // Skip comments and empty lines for numbering
      if (line.trim() === '' || line.trim().startsWith('(')) {
        return line;
      }
      
      const formattedNumber = blockNumber.toString().padStart(4, '0');
      blockNumber += program.machineParameters.blockNumberIncrement;
      return `N${formattedNumber} ${line}`;
    }).join('\n');
  }
  
  // Apply optimization based on the selected level
  if (program.machineParameters.optimizationLevel !== 'none') {
    processed = optimizeGcode(processed, program);
  }
  
  // Add a percent sign at the beginning of the program (Fanuc standard)
  processed = `%\n${processed}`;
  
  return processed;
}

/**
 * Optimize G-code for Fanuc controllers
 */
function optimizeGcode(gcode: string, program: FanucProgram): string {
  let optimized = gcode;
  const lines = optimized.split('\n');
  const optimizedLines: string[] = [];
  
  // Track modal states to avoid redundant commands
  let activeG0Modal = false;
  let activeG1Modal = false;
  let activeSpindleSpeed = 0;
  let activeFeedrate = 0;
  
  // Basic optimization - remove redundant commands
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Always keep comments and empty lines
    if (line === '' || line.startsWith('(')) {
      optimizedLines.push(line);
      continue;
    }
    
    // Extract commands from the line
    const hasG0 = line.includes('G0 ');
    const hasG1 = line.includes('G1 ');
    const feedrateMatch = line.match(/F([0-9.]+)/);
    const spindleMatch = line.match(/S([0-9.]+)/);
    
    let optimizedLine = line;
    
    // Remove redundant G0/G1 if they are already active
    if (hasG0 && activeG0Modal) {
      optimizedLine = optimizedLine.replace('G0 ', '');
    }
    
    if (hasG1 && activeG1Modal) {
      optimizedLine = optimizedLine.replace('G1 ', '');
    }
    
    // Update modal states
    if (hasG0) activeG0Modal = true;
    if (hasG1) activeG1Modal = true;
    
    // Advanced optimization if selected
    if (program.machineParameters.optimizationLevel === 'advanced') {
      // Remove redundant feedrates
      if (feedrateMatch) {
        const feedrate = parseFloat(feedrateMatch[1]);
        if (feedrate === activeFeedrate) {
          optimizedLine = optimizedLine.replace(/F[0-9.]+/, '');
        } else {
          activeFeedrate = feedrate;
        }
      }
      
      // Remove redundant spindle speeds
      if (spindleMatch) {
        const spindleSpeed = parseFloat(spindleMatch[1]);
        if (spindleSpeed === activeSpindleSpeed) {
          optimizedLine = optimizedLine.replace(/S[0-9.]+/, '');
        } else {
          activeSpindleSpeed = spindleSpeed;
        }
      }
    }
    
    optimizedLines.push(optimizedLine);
  }
  
  return optimizedLines.join('\n');
}

/**
 * Simulate and validate the G-code before returning
 */
function simulateAndValidateGcode(gcode: string, program: FanucProgram): any {
  const validationResults = {
    isValid: true,
    warnings: [] as string[],
    errors: [] as string[],
    statistics: {
      totalRapidDistance: 0,
      totalCuttingDistance: 0,
      estimatedMachiningTime: 0,
      toolChanges: 0,
      maxDepth: 0,
    }
  };
  
  // Simple validation - looking for basic issues
  const lines = gcode.split('\n');
  
  // Track position and state for simulation
  const position = { x: 0, y: 0, z: 0 };
  let currentFeedrate = 0;
  let currentSpindleSpeed = 0;
  let inRapidMode = false;
  let toolChangeCount = 0;
  let maxDepth = 0;
  let rapidDistance = 0;
  let cuttingDistance = 0;
  let estimatedTime = 0;
  
  // Validate each line of the G-code
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip comments and empty lines
    if (line === '' || line.startsWith('(')) continue;
    
    // Check for tool changes
    if (line.includes('M6')) {
      toolChangeCount++;
    }
    
    // Extract G-code command
    const g0Match = line.match(/G0\s/);
    const g1Match = line.match(/G1\s/);
    const g2Match = line.match(/G2\s/);
    const g3Match = line.match(/G3\s/);
    
    // Extract coordinates
    const xMatch = line.match(/X(-?[0-9.]+)/);
    const yMatch = line.match(/Y(-?[0-9.]+)/);
    const zMatch = line.match(/Z(-?[0-9.]+)/);
    const feedrateMatch = line.match(/F([0-9.]+)/);
    const spindleMatch = line.match(/S([0-9.]+)/);
    
    // Update position and state
    const newX = xMatch ? parseFloat(xMatch[1]) : position.x;
    const newY = yMatch ? parseFloat(yMatch[1]) : position.y;
    const newZ = zMatch ? parseFloat(zMatch[1]) : position.z;
    
    if (feedrateMatch) {
      currentFeedrate = parseFloat(feedrateMatch[1]);
    }
    
    if (spindleMatch) {
      currentSpindleSpeed = parseFloat(spindleMatch[1]);
    }
    
    // Check for exceeding maximum feedrate
    if (currentFeedrate > program.machineParameters.maxFeedrate) {
      validationResults.warnings.push(`Line ${i+1}: Feedrate ${currentFeedrate} exceeds maximum ${program.machineParameters.maxFeedrate}`);
    }
    
    // Check for exceeding maximum spindle speed
    if (currentSpindleSpeed > program.machineParameters.maxSpindleSpeed) {
      validationResults.warnings.push(`Line ${i+1}: Spindle speed ${currentSpindleSpeed} exceeds maximum ${program.machineParameters.maxSpindleSpeed}`);
    }
    
    // Calculate distance moved
    const distance = Math.sqrt(
      Math.pow(newX - position.x, 2) +
      Math.pow(newY - position.y, 2) +
      Math.pow(newZ - position.z, 2)
    );
    
    // Check for large Z movements that might indicate a crash
    if (newZ < position.z && position.z > 0 && newZ < -10 && g0Match) {
      validationResults.warnings.push(`Line ${i+1}: Large rapid Z plunge detected (${position.z} to ${newZ})`);
    }
    
    // Check if we're going deeper than expected
    if (newZ < maxDepth) {
      maxDepth = newZ;
    }
    
    // Update position
    position.x = newX;
    position.y = newY;
    position.z = newZ;
    
    // Update distance and time statistics
    if (g0Match) {
      inRapidMode = true;
      rapidDistance += distance;
      // Assume rapid moves at 10000 mm/min for time estimation
      estimatedTime += distance / 10000 * 60; // in seconds
    } else if (g1Match || g2Match || g3Match) {
      inRapidMode = false;
      cuttingDistance += distance;
      if (currentFeedrate > 0) {
        estimatedTime += distance / currentFeedrate * 60; // in seconds
      }
    }
  }
  
  // Update statistics
  validationResults.statistics.totalRapidDistance = rapidDistance;
  validationResults.statistics.totalCuttingDistance = cuttingDistance;
  validationResults.statistics.estimatedMachiningTime = estimatedTime;
  validationResults.statistics.toolChanges = toolChangeCount;
  validationResults.statistics.maxDepth = maxDepth;
  
  // Check final validation status
  validationResults.isValid = validationResults.errors.length === 0;
  
  return validationResults;
}

/**
 * Example usage of the Fanuc G-code generator
 */
export function createSampleProgram(): FanucProgram {
  return {
    programName: "SAMPLE_PROGRAM",
    operations: [
      {
        type: 'profile',
        tool: {
          id: 1,
          type: 'mill',
          diameter: 10,
          length: 75,
          cornerRadius: 0,
          numberOfFlutes: 4,
          material: 'Carbide',
          compensation: {
            lengthOffset: 1,
            diameterOffset: 1
          },
          maxFeedrate: 1000,
          maxSpindleSpeed: 8000,
          coolantRequired: true
        },
        depth: 5,
        stepdown: 2.5,
        geometry: [
          { x: 10, y: 10, z: 0 },
          { x: 90, y: 10, z: 0 },
          { x: 90, y: 90, z: 0 },
          { x: 10, y: 90, z: 0 },
          { x: 10, y: 10, z: 0 }
        ],
        parameters: {
          feedrate: 800,
          plungeFeedrate: 300,
          spindleSpeed: 6000,
          coolant: true,
          useToolCompensation: true,
          compensationType: 'G41',
          stockToLeave: 0.2,
          finishPass: true,
          approachStrategy: 'ramp',
          exitStrategy: 'loop'
        }
      },
      {
        type: 'drill',
        tool: {
          id: 2,
          type: 'drill',
          diameter: 8,
          length: 80,
          compensation: {
            lengthOffset: 2,
            diameterOffset: 2
          },
          maxFeedrate: 500,
          maxSpindleSpeed: 3000,
          coolantRequired: true
        },
        depth: 30,
        geometry: [
          { x: 25, y: 25, z: 0 },
          { x: 75, y: 25, z: 0 },
          { x: 75, y: 75, z: 0 },
          { x: 25, y: 75, z: 0 }
        ],
        parameters: {
          feedrate: 300,
          plungeFeedrate: 150,
          spindleSpeed: 2500,
          coolant: true,
          useToolCompensation: false,
          approachStrategy: 'direct',
          exitStrategy: 'direct',
          useCannedCycle: true,
          cycleParameters: {
            dwellTime: 0.2
          }
        }
      }
    ],
    workpieceZero: { x: 0, y: 0, z: 0 },
    workpieceMaterial: "Aluminum 6061",
    workpieceDimensions: {
      width: 100,
      height: 100,
      depth: 20
    },
    machineParameters: {
      controllerType: 'Fanuc 30i',
      highSpeedMode: true,
      nanoSmoothing: false,
      useAICC: true,
      programNumber: "O1000",
      feedrateMode: 'per-minute',
      cuttingMode: 'G64',
      workOffset: 'G54',
      useDecimalPoint: true,
      maxBlockNumber: 9999,
      blockNumberIncrement: 10,
      toolChangePosition: { x: -50, y: -50, z: 100 },
      useSubPrograms: false,
      useInches: false,
      simulationValidation: true,
      maxFeedrate: 10000,
      maxSpindleSpeed: 12000,
      coolantOptions: {
        flood: true,
        mist: true,
        through: false
      },
      optimizationLevel: 'advanced'
    },
    tools: [
      {
        id: 1,
        type: 'mill',
        diameter: 10,
        length: 75,
        cornerRadius: 0,
        numberOfFlutes: 4,
        material: 'Carbide',
        compensation: {
          lengthOffset: 1,
          diameterOffset: 1
        },
        maxFeedrate: 1000,
        maxSpindleSpeed: 8000,
        coolantRequired: true
      },
      {
        id: 2,
        type: 'drill',
        diameter: 8,
        length: 80,
        compensation: {
          lengthOffset: 2,
          diameterOffset: 2
        },
        maxFeedrate: 500,
        maxSpindleSpeed: 3000,
        coolantRequired: true
      }
    ],
    useOptionalStop: true,
    safetyChecks: true
  };
}