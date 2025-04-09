// src/components/cam/ToolpathGenerator.tsx
import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Code, Cpu, Edit, Download, Play, Minimize2, Maximize2, Upload, HelpCircle, Save } from 'react-feather';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { predefinedTools, predefinedMaterials } from 'src/lib/predefinedLibraries';
import ToolsList from '@/src/pages/tools';
// Import useLibrary hook at the top of the file
import { useLibrary } from '../../hooks/useLibrary';
import { calculateCuttingStatistics, calculateOptimalChipLoad, calculateRecommendedPlungeRate, getCuttingFeedback } from '@/src/lib/gCodeGenerationUtils';
import { getOperationDescription } from '@/src/lib/operationDescriptions';
import { materialProperties } from '@/src/lib/materialProperties';
import { string } from 'zod';
import { Drawing } from '@prisma/client';
import SaveToolpathModal from './ToolpathModal';
import toast from 'react-hot-toast';
// Add the import at the top of the file
import { generateComponentToolpath, generateElementToolpath } from 'src/lib/componentToolpathUtils';
import { FixedCyclesUIRenderer, isFixedCycle } from 'src/components/cam/FixedCyclesUIRenderer';
import ToolpathGeneratorIntegration from 'src/components/cam/ToolpathGeneratorIntegration';
import { FixedCycleType } from './toolpathUtils/fixedCycles/fixedCyclesParser';
import router from 'next/router';
import { c } from 'framer-motion/dist/types.d-6pKw1mTI';
interface ToolpathGeneratorProps {
  onGCodeGenerated: (gcode: string) => void;
  onToolSelected?: (tool: any) => void; // Added for tool selection
}

// Machine type definition
type MachineType = 'mill' | 'lathe' | '3dprinter';

// Mill operation types
type MillOperationType = 'contour' | 'pocket' | 'drill' | 'engrave' | 'profile' | 'threading' | '3d_surface';

// Lathe operation types
type LatheOperationType = 'facing' | 'turning' | 'boring' | 'threading' | 'grooving' | 'parting' | 'knurling';

// 3D Printer operation types
type PrinterOperationType = 'standard' | 'vase' | 'support' | 'infill' | 'raft' | 'brim';

// Combined operation type
type OperationType = MillOperationType | LatheOperationType | PrinterOperationType;

type MaterialType = 'aluminum' | 'steel' | 'wood' | 'plastic' | 'brass' | 'titanium' | 'composite' | 'other';
type ToolType = 'endmill' | 'ballnose' | 'drill' | 'vbit' | 'chamfer' | 'threadmill' | 'reamer';

// Lathe tool types
type LatheToolType = 'turning' | 'facing' | 'threading' | 'grooving' | 'boring' | 'parting';

// 3D Printer nozzle types
type PrinterNozzleType = 'brass' | 'hardened' | 'ruby' | 'standard';

// Combined tool type
type AllToolType = ToolType | LatheToolType | PrinterNozzleType;

export interface ToolpathSettings {
  machineType: MachineType;
  operationType: OperationType;
  material: MaterialType;
  toolType: AllToolType;
  toolDiameter: number;
  flutes: number;
  depth: number;
  stepdown: number;
  stepover: number;
  feedrate: number;
  plungerate: number;
  rpm: number;
  tolerance: number;
  offset: 'inside' | 'outside' | 'center';
  direction: 'climb' | 'conventional';
  coolant: boolean;
  finishingPass: boolean;
  finishingAllowance: number;
  finishingStrategy: 'contour' |'parallel'|'spiral'|'radial',
  useAI: boolean;
  aiDifficulty: 'simple' | 'moderate' | 'complex';
  aiOptimize: 'speed' | 'quality' | 'balance';
  // Advanced optimization settings
  optimizePath: boolean;
  useArcFitting: boolean;
  useHighSpeedMode: boolean;
  useExactStop: boolean;
  useToolCompensation: boolean;
  useAdaptiveFeeds: boolean;
  useRestMachining: boolean;
  toolNumber?: number;
  // 3D printer specific settings
  nozzleDiameter?: number;
  filamentDiameter?: number;
  layerHeight?: number;
  extrusionWidth?: number;
  printSpeed?: number;
  printTemperature?: number;
  bedTemperature?: number;
  // Lathe specific settings
  stockDiameter?: number;
  stockLength?: number;
  spindleDirection?: 'cw' | 'ccw';
  turningOperation?: 'external' | 'internal' | 'face';
  applyToolCompensation?: boolean;
  originType: 'workpiece-center' | 'workpiece-corner' | 'workpiece-corner2' |'machine-zero' | 'custom';
  originX: number;
  originY: number;
  originZ: number;
}

const ToolpathGenerator: React.FC<ToolpathGeneratorProps> = ({ onGCodeGenerated, onToolSelected }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    machine: true,
    operation: true,
    material: true,
    tool: false,
    cutting: false,
    advanced: false,
    ai: false,
    printer: false,
    lathe: false,
    origin: true ,
    fixedCycles: false,  // Nuova sezione
  });
  
  const [settings, setSettings] = useState<ToolpathSettings>({
    machineType: 'mill',
    operationType: 'contour',
    material: 'aluminum',
    toolType: 'endmill',
    toolDiameter: 6,
    flutes: 2,
    depth: 5,
    stepdown: 1,
    stepover: 40, // Percentuale
    feedrate: 800,
    plungerate: 300,
    rpm: 10000,
    tolerance: 0.01,
    offset: 'outside',
    direction: 'climb',
    coolant: true,
    finishingPass: false,
    finishingAllowance: 0.2,
    finishingStrategy:'contour',
    useAI: false,
    aiDifficulty: 'moderate',
    aiOptimize: 'balance',
    // Advanced optimization settings
    optimizePath: false,
    useArcFitting: false,
    useHighSpeedMode: false,
    useExactStop: false,
    useToolCompensation: false,
    useAdaptiveFeeds: false,
    useRestMachining: false,
    toolNumber: 1,
    // 3D printer default settings
    nozzleDiameter: 0.4,
    filamentDiameter: 1.75,
    layerHeight: 0.2,
    extrusionWidth: 0.4,
    printSpeed: 60,
    printTemperature: 200,
    bedTemperature: 60,
    // Lathe default settings
    stockDiameter: 50,
    stockLength: 100,
    spindleDirection: 'cw',
    turningOperation: 'external',
    applyToolCompensation: true,
    originType: 'workpiece-center',
    originX: 0,
    originY: 0, 
    originZ: 0
  });
  
  const [selectedLibraryTool, setSelectedLibraryTool] = useState<any>(null);
  const [geometryType, setGeometryType] = useState<'rectangle' | 'circle' | 'polygon' | 'custom' | 'selected'|'cube'|'sphere'|'cylinder'|'cone'|'extrude'|'line'|'pyramid'|'hemisphere'|'ellipsoid'|'capsule'|'triangle'|'ellipse'|'prism'>('rectangle');
  const [rectangleWidth, setRectangleWidth] = useState(100);
  const [rectangleHeight, setRectangleHeight] = useState(50);
  const [circleRadius, setCircleRadius] = useState(25);
  const [polygonSides, setPolygonSides] = useState(6);
  const [polygonRadius, setPolygonRadius] = useState(30);
  const [customPath, setCustomPath] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  // Aggiungere tra gli altri stati nel componente ToolpathGenerator
  const [currentGCode, setCurrentGCode] = useState<string>('');
  const [detectedCycles, setDetectedCycles] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  // References to selected CAD elements
  const { elements, selectedElement } = useElementsStore();
  const { workpiece } = useCADStore();
  
  // Timer reference for success messages
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add this: access the library tools and materials using the hook
  const { tools: userTools, materials: userMaterials } = useLibrary();
  
  // Update settings when selected library tool changes
  useEffect(() => {
    if (selectedLibraryTool) {
      setSettings(prev => ({
        ...prev,
        toolType: selectedLibraryTool.type as AllToolType || 'endmill',
        toolDiameter: selectedLibraryTool.diameter || 6,
        flutes: selectedLibraryTool.numberOfFlutes || 2,
        rpm: selectedLibraryTool.maxRPM || 12000
      }));
      
      // Notify parent component about tool selection
      if (onToolSelected) {
        onToolSelected(selectedLibraryTool);
      }
      
      setSuccess(`Tool "${selectedLibraryTool.name}" loaded from library`);
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 3000);
    }
  }, [selectedLibraryTool, onToolSelected]);
  
  // Load default settings based on selected material
  useEffect(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    
    // Set defaults based on material
    switch (settings.material) {
      case 'aluminum':
        setSettings(prev => ({
          ...prev,
          feedrate: 800,
          plungerate: 300,
          rpm: 12000
        }));
        break;
      case 'steel':
        setSettings(prev => ({
          ...prev,
          feedrate: 400,
          plungerate: 150,
          rpm: 8000
        }));
        break;
      case 'wood':
        setSettings(prev => ({
          ...prev,
          feedrate: 1200,
          plungerate: 500,
          rpm: 15000
        }));
        break;
      case 'plastic':
        setSettings(prev => ({
          ...prev,
          feedrate: 600,
          plungerate: 200,
          rpm: 10000
        }));
        break;
      case 'brass':
        setSettings(prev => ({
          ...prev,
          feedrate: 600,
          plungerate: 200,
          rpm: 10000
        }));
        break;
      case 'titanium':
        setSettings(prev => ({
          ...prev,
          feedrate: 200,
          plungerate: 100,
          rpm: 6000
        }));
        break;
      default:
        break;
    }
  }, [settings.material]);
  
  // Set default operation types when machine type changes
  useEffect(() => {
    switch (settings.machineType) {
      case 'mill':
        if (!['contour', 'pocket', 'drill', 'engrave', 'profile', 'threading', '3d_surface'].includes(settings.operationType as string)) {
          setSettings(prev => ({
            ...prev,
            operationType: 'contour',
            toolType: 'endmill'
          }));
        }
        break;
      case 'lathe':
        if (!['facing', 'turning', 'boring', 'threading', 'grooving', 'parting', 'knurling'].includes(settings.operationType as string)) {
          setSettings(prev => ({
            ...prev,
            operationType: 'turning',
            toolType: 'turning'
          }));
        }
        break;
      case '3dprinter':
        if (!['standard', 'vase', 'support', 'infill', 'raft', 'brim'].includes(settings.operationType as string)) {
          setSettings(prev => ({
            ...prev,
            operationType: 'standard',
            toolType: 'standard'
          }));
        }
        break;
    }
  }, [settings.machineType]);
  
  // Update AI suggestions when relevant settings change
  useEffect(() => {
    if (settings.useAI) {
      generateAISuggestions();
    }
  }, [settings.useAI, settings.material, settings.toolDiameter, settings.operationType, settings.machineType]);
  
  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Update settings
  const updateSettings = (key: keyof ToolpathSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Helper to update numeric values
  const updateNumericValue = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };
  
  // Generate AI suggestions
  const generateAISuggestions = async () => {
    setIsAIProcessing(true);
    
    try {
      // Simulate API call to Claude
      setTimeout(() => {
        let suggestions: string[] = [];
        
        switch (settings.machineType) {
          case 'mill':
            suggestions = [
              `Per ${settings.material} con fresa da ${settings.toolDiameter}mm, consigliata una velocità di avanzamento di ${settings.material === 'aluminum' ? 800 : settings.material === 'steel' ? 400 : 600} mm/min.`,
              `Con profondità di ${settings.depth}mm, suggeriamo incrementi di ${Math.min(settings.toolDiameter / 4, 1).toFixed(1)}mm per migliori risultati.`,
              `Per ottimizzare durata utensile su ${settings.material}, considera ${settings.material === 'steel' || settings.material === 'titanium' ? 'refrigerante ad alta pressione' : 'refrigerante standard'}.`
            ];
            break;
          case 'lathe':
            suggestions = [
              `Per tornitura di ${settings.material}, la velocità di avanzamento consigliata è ${settings.material === 'aluminum' ? 0.2 : settings.material === 'steel' ? 0.15 : 0.25} mm/giro.`,
              `Profondità di passata consigliata: ${settings.material === 'aluminum' ? 1.5 : settings.material === 'steel' ? 0.8 : 1.0}mm per sgrossatura.`,
              `Velocità di taglio ottimale: ${settings.material === 'aluminum' ? 300 : settings.material === 'steel' ? 150 : 200} m/min.`
            ];
            break;
          case '3dprinter':
            suggestions = [
              `La temperatura consigliata per ${settings.material === 'plastic' ? 'PLA' : settings.material} è ${settings.material === 'plastic' ? '200-220°C' : '240-260°C'}.`,
              `Per un'altezza del layer di ${settings.layerHeight}mm, una velocità di stampa di ${settings.printSpeed}mm/s è ottimale.`,
              `Temperatura del piatto consigliata: ${settings.material === 'plastic' ? '60°C per PLA, 80°C per PETG' : '100-110°C per ABS/ASA'}.`
            ];
            break;
        }
        
        setAiSuggestions(suggestions);
        setIsAIProcessing(false);
      }, 1500);
    } catch (err) {
      console.error('Errore nella generazione dei suggerimenti AI:', err);
      setIsAIProcessing(false);
    }
  };

  const convertLinesToArcs = (gcode: string, tolerance: number): string => {
    // Split into lines
    const lines = gcode.split('\n');
    const resultLines: string[] = [];
    
    // Collect points for potential arc fitting
    const points: {x: number, y: number, z: number}[] = [];
    
    // Utility to parse a G-code line to a point
    const parsePoint = (line: string): {x: number, y: number, z: number} | null => {
      if (!line.startsWith('G1')) return null;
      
      const x = parseCoordinate(line, 'X');
      const y = parseCoordinate(line, 'Y');
      const z = parseCoordinate(line, 'Z');
      
      if (x === null || y === null) return null;
      
      return { x, y, z: z ?? 0 };
    };
    
    // Utility to parse coordinates from G-code line
    const parseCoordinate = (line: string, axis: string): number | null => {
      const match = line.match(new RegExp(`${axis}([+-]?\\d*\\.?\\d+)`));
      return match ? parseFloat(match[1]) : null;
    };
    
    // Check if 3 points form an arc
    const formValidArc = (p1: any, p2: any, p3: any): boolean => {
      // Points must be on the same Z plane for G2/G3
      if (p1.z !== p2.z || p2.z !== p3.z) return false;
      
      // Simple test: check if middle point is approximately equidistant from endpoints
      // (this is a very simplified check - real arc fitting is more complex)
      const d1 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const d2 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2));
      
      return Math.abs(d1 - d2) < tolerance;
    };
    
    // Generate G2/G3 arc command
    const createArcCommand = (p1: any, p2: any, p3: any, feedrate: number | null): string => {
      // Determine if this is clockwise (G2) or counterclockwise (G3)
      // This is a simplified method - real implementations use cross product
      const isClockwise = ((p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x)) < 0;
      const command = isClockwise ? 'G2' : 'G3';
      
      // Calculate arc center (I/J) relative to start point
      // This is a simplified calculation - real implementations use proper circle equations
      const centerX = (p1.x + p3.x) / 2;
      const centerY = (p1.y + p3.y) / 2;
      
      const I = (centerX - p1.x).toFixed(3);
      const J = (centerY - p1.y).toFixed(3);
      
      let arc = `${command} X${p3.x.toFixed(3)} Y${p3.y.toFixed(3)} I${I} J${J}`;
      if (feedrate !== null) {
        arc += ` F${feedrate}`;
      }
      
      return arc + ` ; Arc converted from linear segments`;
    };
    
    // Process the G-code
    let currentFeedrate: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Track current feedrate
      const fMatch = line.match(/F([+-]?\\d*\\.?\\d+)/);
      if (fMatch) {
        currentFeedrate = parseFloat(fMatch[1]);
      }
      
      const point = parsePoint(line);
      
      if (point) {
        // Add to point collection for potential arc
        points.push(point);
        
        // If we have 3 points, check if they form an arc
        if (points.length === 3) {
          if (formValidArc(points[0], points[1], points[2])) {
            // Remove the last line we added (middle point)
            resultLines.pop();
            
            // Add arc command
            resultLines.push(createArcCommand(points[0], points[1], points[2], currentFeedrate));
            
            // Reset points array with the last point as first point for next potential arc
            const lastPoint = points[2];
            points.length = 0;
            points.push(lastPoint);
          } else {
            // Not a valid arc, remove the first point and continue
            points.shift();
          }
        }
      } else {
        // Reset point collection on non-G1 commands
        points.length = 0;
        resultLines.push(line);
      }
    }
    
    return resultLines.join('\n');
  };
  const optimizeToolpath = (gcode: string): string => {
    // Split into lines
    const lines = gcode.split('\n');
    const optimizedLines: string[] = [];
    
    // Track current position
    let currentX: number | null = null;
    let currentY: number | null = null;
    let currentZ: number | null = null;
    let currentF: number | null = null;
     
    // Utility to parse coordinates from G-code line
    const parseCoordinate = (line: string, axis: string): number | null => {
      const match = line.match(new RegExp(`${axis}([+-]?\\d*\\.?\\d+)`));
      return match ? parseFloat(match[1]) : null;
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Always keep comments and non G0/G1 commands
      if (line.startsWith(';') || (!line.startsWith('G0') && !line.startsWith('G1'))) {
        optimizedLines.push(line);
        continue;
      }
      // Parse new position
      const x: number | null = parseCoordinate(line, 'X') ?? currentX;
      const y: number | null = parseCoordinate(line, 'Y') ?? currentY;
      const z: number | null = parseCoordinate(line, 'Z') ?? currentZ;
      const f: number | null = parseCoordinate(line, 'F') ?? currentF;
      // Skip redundant moves (same position, same feedrate)
      if (x === currentX && y === currentY && z === currentZ && f === currentF) {
        continue;
      }
      
      // If move is too small (below tolerance), skip it
      const isSmallMove = 
        currentX !== null && currentY !== null && currentZ !== null &&
        x !== null && y !== null && z !== null &&
        Math.sqrt(
          Math.pow(x - currentX, 2) + 
          Math.pow(y - currentY, 2) + 
          Math.pow(z - currentZ, 2)
        ) < settings.tolerance;
      
      if (isSmallMove && line.startsWith('G1')) {
        continue;
      }
      
      // Update current position
      currentX = x;
      currentY = y;
      currentZ = z;
      currentF = f;
      
      // Keep this line
      optimizedLines.push(line);
    }
    
    return optimizedLines.join('\n');
  };
  
  // Generate G-code based on current settings
  const generateGCode = () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    
    try {
      let gcode = '';
      
      // Select the appropriate G-code generator based on machine type
      switch (settings.machineType) {
        case 'mill':
          gcode = generateMillGCode();
          break;
        case 'lathe':
          gcode = generateLatheGCode();
          break;
        case '3dprinter':
          gcode = generate3DPrinterGCode();
          break;
      }
      
      // Ottimizzazioni avanzate (solo se abilitate nelle impostazioni avanzate)
      if (settings.optimizePath) {
        gcode = optimizeToolpath(gcode);
      }
      
      if (settings.useArcFitting) {
        gcode = convertLinesToArcs(gcode, settings.tolerance);
      }

      // Impostare il G-code corrente per l'analisi dei cicli fissi
      setCurrentGCode(gcode);
    
      // Analizzare il G-code per individuare cicli fissi
      const lines = gcode.split('\n');
      const cycles = lines
        .filter(line => isFixedCycle(line))
        .map(line => ({
          gcode: line,
          
          // Altre proprietà recuperate dal parser...
        }));
      
      setDetectedCycles(cycles);
      
      // Show success message
      setSuccess('G-code generated successfully!');
      
      // Reset success message after a timeout
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      
      // Pass generated G-code back to parent
      onGCodeGenerated(gcode);
    } catch (err) {
      setError('Error generating G-code. Check your settings.');
      console.error('G-code generation error:', err);
    } finally {
      setIsGenerating(false); 
    } 
  };
  const handleFixedCycleGCode = (newGCode: string) => {
    // Aggiorna il G-code
    setCurrentGCode(prevGCode => {
      // Se il G-code precedente conteneva cicli fissi, sostituiscili
      if (prevGCode.includes('G8')) {
        const lines = prevGCode.split('\n');
        const newLines = lines.filter(line => !isFixedCycle(line) && !line.includes('G80'));
        return [...newLines, newGCode, 'G80 ; Cancel fixed cycle'].join('\n');
      } else {
        // Altrimenti, aggiungi i nuovi cicli fissi
        return [prevGCode, newGCode, 'G80 ; Cancel fixed cycle'].join('\n');
      }
    });
    
    // Genera nuovamente il G-code completo e invialo al componente padre
    if (onGCodeGenerated) {
      onGCodeGenerated(currentGCode);
    }
  };
  const applyOriginOffset = (x: number, y: number, z: number = 0): { x: number, y: number, z: number } => {
    switch (settings.originType) {
      case 'workpiece-center':
        // Already centered, no change needed
        return { x, y, z };
        
      case 'workpiece-corner':
        // Convert from center-origin to corner-origin
        if (geometryType === 'rectangle') {
          return { 
            x: x + rectangleWidth / 2, 
            y: y + rectangleHeight / 2, 
            z
          };
        } else if (geometryType === 'circle') {
          return { 
            x: x + circleRadius, 
            y: y + circleRadius, 
            z 
          };
        } else if (geometryType === 'polygon') {
          return { 
            x: x + polygonRadius, 
            y: y + polygonRadius, 
            z 
          };

        }
        case 'workpiece-corner2':
        // Convert from center-origin to corner-origin
        if (geometryType === 'rectangle') {
          return { 
            x: x + rectangleWidth / 2, 
            y: y + rectangleHeight / 2, 
            z : z =  workpiece.depth / 2 
          };
        } else if (geometryType === 'circle') {
          return { 
            x: x + circleRadius, 
            y: y + circleRadius, 
            z 
          };
        } else if (geometryType === 'polygon') {
          return { 
            x: x + polygonRadius, 
            y: y + polygonRadius, 
            z 
          };
        } else if (geometryType === 'selected' && selectedElement) {
          // Handle based on element type
          if (selectedElement.type === 'rectangle') {
            return { 
              x: x + selectedElement.width / 2, 
              y: y + selectedElement.height / 2, 
              z 
            };
          } else if (selectedElement.type === 'circle') {
            return { 
              x: x + selectedElement.radius, 
              y: y + selectedElement.radius, 
              z 
            };
          }
        }
        return { x, y, z };
        
      case 'machine-zero':
        // Add workpiece position relative to machine zero
        // This would typically come from a machine setup
        return { 
          x: x + (workpiece?.width || 0), 
          y: y + (workpiece?.depth || 0), 
          z: z + (workpiece?.height || 0) 
        };
        
      case 'custom':
        // Apply custom offset
        return { 
          x: x + settings.originX, 
          y: y + settings.originY, 
          z: z + settings.originZ 
        };
        
      default:
        return { x, y, z };
    }
  };
  
  // Generate G-code for milling operations
  const generateMillGCode = () => {
    let gcode = '';
    
    // Program header
    gcode += '; CAD/CAM SYSTEM - Generated Mill G-code with AI assistance\n';
    gcode += `; Operation: ${settings.operationType}\n`;
    gcode += `; Material: ${settings.material}\n`;
    gcode += `; Tool: ${settings.toolType} Ø${settings.toolDiameter}mm\n`;
    gcode += `; Date: ${new Date().toISOString()}\n\n`;
    
    // Program initialization
    gcode += 'G90 ; Absolute positioning\n';
    gcode += 'G21 ; Metric units\n';
    gcode += 'G17 ; XY plane selection\n';
    gcode += `M3 S${settings.rpm} ; Start spindle\n`;
    
    if (settings.coolant) {
      gcode += 'M8 ; Coolant on\n';
    }
    
    gcode += 'G0 Z10 ; Move to safe height\n\n';
    
    // Aggiungiamo impostazioni avanzate se abilitate
    if (settings.useHighSpeedMode) {
      gcode += '; High Speed Machining mode enabled\n';
      gcode += 'G64 P0.01 ; Path blending with tolerance of 0.01mm\n\n';
    } else if (settings.useExactStop) {
      gcode += '; Exact Stop mode enabled\n';
      gcode += 'G61 ; Exact stop mode\n\n';
    }
    
    // Generate toolpath based on geometry type and operation
    let toolpathGcode = '';
    
    if (geometryType === 'rectangle') {
      toolpathGcode += generateRectangleToolpath();
    } else if (geometryType === 'circle') {
      toolpathGcode += generateCircleToolpath();
    } else if (geometryType === 'polygon') {
      toolpathGcode += generatePolygonToolpath();
    } else if (geometryType === 'custom' && customPath) {
      toolpathGcode += `; Custom path\n${customPath}\n`;
    } else if (geometryType === 'selected') {
      toolpathGcode += generateFromSelectedElements();
    }
    
    // Aggiungiamo la compensazione utensile se abilitata
    if (settings.useToolCompensation) {
      gcode += '; Tool compensation enabled\n';
      
      // Determina direzione compensazione in base a offset e direzione di taglio
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
        
        // Aggiunge movimento di approccio per la compensazione
        const firstLine = toolpathGcode.split('\n').find(line => line.trim().startsWith('G1'));
        if (firstLine) {
          const match = firstLine.match(/X([-\d.]+)\s+Y([-\d.]+)/);
          if (match) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            
            // Aggiunge punto di approccio (perpendicolare al primo movimento)
            gcode += `G0 X${(x - 5).toFixed(3)} Y${y.toFixed(3)} ; Approach point for compensation\n`;
          }
        }
        
        // Aggiungi il toolpath
        gcode += toolpathGcode;
        
        // Aggiungi il codice per disattivare la compensazione
        gcode += 'G40 ; Cancel tool compensation\n';
      } else {
        // Se non possiamo determinare la direzione, usiamo il toolpath senza compensazione
        gcode += toolpathGcode;
      }
    } else {
      // Usa il toolpath normalmente
      gcode += toolpathGcode;
    } 
    
    // Finishing pass if enabled
    if (settings.finishingPass) {
      gcode += '\n; Finishing pass\n';
      gcode += `; Finishing allowance: ${settings.finishingAllowance}mm\n`;
      
      // Applica una strategia diversa per la finitura se specificata
      if (settings.finishingStrategy === 'contour') {
        gcode += '; Contour finishing strategy\n';
        // Implementa la logica per contornatura
      } else if (settings.finishingStrategy === 'parallel') {
        gcode += '; Parallel finishing strategy\n';
        // Implementa la logica per passate parallele
      } else if (settings.finishingStrategy === 'spiral') {
        gcode += '; Spiral finishing strategy\n';
        // Implementa la logica per spirale
      } else if (settings.finishingStrategy === 'radial') {
        gcode += '; Radial finishing strategy\n';
        // Implementa la logica per finitura radiale
      } else {
        // Default to contour finishing
        gcode += 'G0 Z5 ; Move to safe height for finishing pass\n';
        // Implementa contornatura di default
      }
    }
    
    // Program ending
    gcode += '\n; End of program\n';
    gcode += 'G0 Z30 ; Move to safe height\n';
    
    if (settings.coolant) {
      gcode += 'M9 ; Coolant off\n';
    }
    
    gcode += 'M5 ; Stop spindle\n';
    gcode += 'M30 ; Program end\n';
    
    return gcode;
  };
  
  // Generate G-code for lathe operations
  const generateLatheGCode = () => {
    let gcode = '';
    
    // Program header
    gcode += '; CAD/CAM SYSTEM - Generated Lathe G-code with AI assistance\n';
    gcode += `; Operation: ${settings.operationType}\n`;
    gcode += `; Material: ${settings.material}\n`;
    gcode += `; Tool: ${settings.toolType}\n`;
    gcode += `; Stock: Ø${settings.stockDiameter}mm x ${settings.stockLength}mm\n`;
    gcode += `; Date: ${new Date().toISOString()}\n\n`;
    
    // Program initialization
    gcode += 'G90 ; Absolute positioning\n';
    gcode += 'G21 ; Metric units\n';
    gcode += 'G18 ; XZ plane selection (standard for lathes)\n';
    gcode += `M3 S${settings.rpm} ; Start spindle ${settings.spindleDirection === 'cw' ? 'clockwise' : 'counter-clockwise'}\n`;
    
    if (settings.coolant) {
      gcode += 'M8 ; Coolant on\n';
    }
    
    // G-code generation based on lathe operation type
    switch (settings.operationType as LatheOperationType) {
      case 'facing':
        gcode += generateLatheFacingOperation();
        break;
      case 'turning':
        gcode += generateLatheTurningOperation();
        break;
      case 'boring':
        gcode += generateLatheBoringOperation();
        break;
      case 'threading':
        gcode += generateLatheThreadingOperation();
        break;
      case 'grooving':
        gcode += generateLatheGroovingOperation();
        break;
      case 'parting':
        gcode += generateLathePartingOperation();
        break;
      case 'knurling':
        gcode += generateLatheKnurlingOperation();
        break;
    }
    
    // Program ending
    gcode += '\n; End of program\n';
    gcode += 'G0 X50 Z50 ; Retract to safe position\n';
    
    if (settings.coolant) {
      gcode += 'M9 ; Coolant off\n';
    }
    
    gcode += 'M5 ; Stop spindle\n';
    gcode += 'M30 ; Program end\n';
    
    return gcode;
  };
  
  // Generate facing operation for lathe
  const generateLatheFacingOperation = () => {
    const { stockDiameter, stockLength, depth, stepdown, feedrate } = settings;
    let gcode = '\n; Facing operation\n';
    
    // Tool setup
    gcode += 'G0 X' + (stockDiameter! + 2).toFixed(3) + ' Z2 ; Position tool\n';
    
    // Multiple passes for facing
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} Z${currentZ.toFixed(3)} ; Rapid to start position\n`;
      gcode += `G1 X-1 F${feedrate} ; Face cut\n`;
      gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} ; Retract\n`;
    }
    
    return gcode;
  };
  
  // Generate turning operation for lathe
  const generateLatheTurningOperation = () => {
    const { stockDiameter, stockLength, depth, stepdown, feedrate, turningOperation } = settings;
    let gcode = '\n; Turning operation\n';
    
    if (turningOperation === 'external') {
      // External turning
      gcode += 'G0 X' + (stockDiameter! + 2).toFixed(3) + ' Z2 ; Position tool\n';
      gcode += 'G0 Z0 ; Move to face\n';
      
      // Multiple passes for turning
      for (let d = 0; d < depth; d += stepdown) {
        const currentDepth = Math.min(depth, d + stepdown);
        const currentDiameter = stockDiameter! - (currentDepth * 2); // Diameter decreases with each pass
        
        gcode += `G0 X${(currentDiameter + 1).toFixed(3)} ; Rapid to diameter\n`;
        gcode += `G1 X${currentDiameter.toFixed(3)} F${feedrate/2} ; Plunge to depth\n`;
        gcode += `G1 Z${stockLength!.toFixed(3)} F${feedrate} ; Turn along Z\n`;
        gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} ; Retract\n`;
        gcode += `G0 Z0 ; Return to face\n`;
      }
    } else if (turningOperation === 'internal') {
      // Internall turning (boring)
      const holeDiameter = stockDiameter! / 2; // Assuming a pre-drilled hole
      
      gcode += 'G0 X' + (holeDiameter - 1).toFixed(3) + ' Z2 ; Position tool\n';
      gcode += 'G0 Z0 ; Move to face\n';
      
      // Multiple passes for internal turning
      for (let d = 0; d < depth; d += stepdown) {
        const currentDepth = Math.min(depth, d + stepdown);
        const currentDiameter = holeDiameter + (currentDepth * 2); // Diameter increases with each pass
        
        gcode += `G0 X${(currentDiameter - 1).toFixed(3)} ; Rapid to diameter\n`;
        gcode += `G1 X${currentDiameter.toFixed(3)} F${feedrate/2} ; Plunge to depth\n`;
        gcode += `G1 Z${(stockLength! * 0.7).toFixed(3)} F${feedrate} ; Turn along Z\n`;
        gcode += `G0 X${(holeDiameter - 1).toFixed(3)} ; Retract\n`;
        gcode += `G0 Z0 ; Return to face\n`;
      }
    }
    
    return gcode;
  };
  
  // Generate boring operation for lathe
  const generateLatheBoringOperation = () => {
    const { stockDiameter, stockLength, depth, stepdown, feedrate } = settings;
    let gcode = '\n; Boring operation\n';
    
    // Assume a starting hole with half the stock diameter
    const startingHoleDiameter = stockDiameter! * 0.3;
    const finalHoleDiameter = startingHoleDiameter + (depth * 2);
    
    // Position tool for boring
    gcode += `G0 X${(startingHoleDiameter - 1).toFixed(3)} Z2 ; Position tool\n`;
    gcode += 'G0 Z0 ; Move to hole entrance\n';
    
    // Multiple passes for boring
    for (let d = 0; d < depth; d += stepdown) {
      const currentDepth = Math.min(depth, d + stepdown);
      const currentDiameter = startingHoleDiameter + (currentDepth * 2);
      
      gcode += `G1 X${currentDiameter.toFixed(3)} F${feedrate/2} ; Bore to diameter\n`;
      gcode += `G1 Z-${(stockLength! * 0.5).toFixed(3)} F${feedrate} ; Bore along Z\n`;
      gcode += `G0 X${(startingHoleDiameter - 1).toFixed(3)} ; Retract\n`;
      gcode += `G0 Z0 ; Return to hole entrance\n`;
    }
    
    return gcode;
  };
  
  // Generate threading operation for lathe
  const generateLatheThreadingOperation = () => {
    const { stockDiameter, stockLength, depth, feedrate } = settings;
    let gcode = '\n; Threading operation\n';
    
    // Thread parameters
    const threadPitch = 1.5; // mm per revolution
    const threadLength = stockLength! * 0.7;
    const threadStartZ = 2;
    const threadEndZ = threadStartZ + threadLength;
    const threadDiameter = stockDiameter! - (depth * 2);
    
    // Position tool for threading
    gcode += `G0 X${(stockDiameter! + 5).toFixed(3)} Z${threadStartZ.toFixed(3)} ; Position tool\n`;
    
    // Progressive threading passes
    for (let d = 0.1; d <= depth; d += 0.1) {
      const currentDiameter = stockDiameter! - (d * 2);
      gcode += `G0 X${currentDiameter.toFixed(3)} ; Rapid to thread diameter\n`;
      gcode += `G32 Z${threadEndZ.toFixed(3)} F${threadPitch} ; Thread cutting move\n`;
      gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} ; Retract\n`;
      gcode += `G0 Z${threadStartZ.toFixed(3)} ; Return to start\n`;
    }
    
    return gcode;
  };
  
  // Generate grooving operation for lathe
  const generateLatheGroovingOperation = () => {
    const { stockDiameter, depth, feedrate } = settings;
    let gcode = '\n; Grooving operation\n';
    
    // Groove parameters
    const grooveWidth = 3; // mm
    const grooveDepth = depth;
    const groovePositionZ = 20; // mm from the face
    
    // Position tool for grooving
    gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} Z${groovePositionZ.toFixed(3)} ; Position tool\n`;
    
    // Multiple passes for grooving
    for (let d = 0; d < grooveDepth; d += 0.5) {
      const currentDepth = Math.min(grooveDepth, d + 0.5);
      const currentDiameter = stockDiameter! - (currentDepth * 2);
      
      gcode += `G1 X${currentDiameter.toFixed(3)} F${feedrate/2} ; Plunge to depth\n`;
      gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} ; Retract\n`;
    }
    
    // Finishing passes for sides of groove
    gcode += `G0 Z${(groovePositionZ - grooveWidth/2).toFixed(3)} ; Position to groove start\n`;
    gcode += `G1 X${(stockDiameter! - (grooveDepth * 2)).toFixed(3)} F${feedrate/2} ; Plunge to depth\n`;
    gcode += `G1 Z${(groovePositionZ + grooveWidth/2).toFixed(3)} F${feedrate} ; Cut to groove end\n`;
    gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} ; Retract\n`;
    
    return gcode;
  };
  
  // Generate parting operation for lathe
  const generateLathePartingOperation = () => {
    const { stockDiameter, feedrate } = settings;
    let gcode = '\n; Parting operation\n';
    
    // Parting parameters
    const partPositionZ = 30; // mm from the face
    
    // Position tool for parting
    gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} Z${partPositionZ.toFixed(3)} ; Position tool\n`;
    
    // Parting cut
    gcode += `G1 X-1 F${feedrate/3} ; Part off\n`;
    gcode += `G0 X${(stockDiameter! + 5).toFixed(3)} ; Retract\n`;
    
    return gcode;
  };
  
  // Generate knurling operation for lathe
  const generateLatheKnurlingOperation = () => {
    const { stockDiameter, stockLength, feedrate } = settings;
    let gcode = '\n; Knurling operation\n';
    
    // Knurling parameters
    const knurlStartZ = 5;
    const knurlLength = 30;
    const knurlEndZ = knurlStartZ + knurlLength;
    
    // Position tool for knurling
    gcode += `G0 X${(stockDiameter! + 2).toFixed(3)} Z${knurlStartZ.toFixed(3)} ; Position tool\n`;
    
    // Knurling passes
    gcode += `G1 X${stockDiameter!.toFixed(3)} F${feedrate/2} ; Approach to diameter\n`;
    gcode += `G1 Z${knurlEndZ.toFixed(3)} F${feedrate/4} ; Knurl along length\n`;
    gcode += `G0 X${(stockDiameter! + 5).toFixed(3)} ; Retract\n`;
    gcode += `G0 Z${knurlStartZ.toFixed(3)} ; Return to start\n`;
    
    // Second pass for deeper knurl
    gcode += `G1 X${(stockDiameter! + 0.2).toFixed(3)} F${feedrate/2} ; Approach with pressure\n`;
    gcode += `G1 Z${knurlEndZ.toFixed(3)} F${feedrate/4} ; Knurl along length again\n`;
    gcode += `G0 X${(stockDiameter! + 5).toFixed(3)} ; Retract\n`;
    
    return gcode;
  };
  
  // Generate G-code for 3D printer operations
  const generate3DPrinterGCode = () => {
    let gcode = '';
    
    // Program header
    gcode += '; Generated 3D Printer G-code with AI assistance\n';
    gcode += `; Operation: ${settings.operationType}\n`;
    gcode += `; Material: ${settings.material === 'plastic' ? 'PLA' : settings.material}\n`;
    gcode += `; Nozzle: ${settings.nozzleDiameter}mm\n`;
    gcode += `; Layer Height: ${settings.layerHeight}mm\n`;
    gcode += `; Date: ${new Date().toISOString()}\n\n`;
    
    // Program initialization
    gcode += 'M82 ; Set extruder to absolute mode\n';
    gcode += 'G21 ; Set units to millimeters\n';
    gcode += 'G90 ; Use absolute coordinates\n';
    gcode += `M104 S${settings.printTemperature} ; Set extruder temperature\n`;
    gcode += `M140 S${settings.bedTemperature} ; Set bed temperature\n`;
    gcode += 'M109 S' + settings.printTemperature + ' ; Wait for extruder temperature\n';
    gcode += 'M190 S' + settings.bedTemperature + ' ; Wait for bed temperature\n';
    gcode += 'G28 ; Home all axes\n';
    gcode += 'G1 Z5 F5000 ; Move Z up a bit\n';
    gcode += 'G1 X0 Y0 Z0.3 F3000 ; Move to start position\n';
    gcode += 'G1 E5 F1800 ; Prime the extruder\n';
    gcode += 'G92 E0 ; Reset extruder position\n\n';
    
    // G-code generation based on 3D printer operation type
    switch (settings.operationType as PrinterOperationType) {
      case 'standard':
        gcode += generate3DPrinterStandardOperation();
        break;
      case 'vase':
        gcode += generate3DPrinterVaseOperation();
        break;
      case 'support':
        gcode += generate3DPrinterSupportOperation();
        break;
      case 'infill':
        gcode += generate3DPrinterInfillOperation();
        break;
      case 'raft':
        gcode += generate3DPrinterRaftOperation();
        break;
      case 'brim':
        gcode += generate3DPrinterBrimOperation();
        break;
    }
    
    // Program ending
    gcode += '\n; End of print\n';
    gcode += 'G1 E-2 F1800 ; Retract filament\n';
    gcode += 'G1 Z' + (settings.depth + 5).toFixed(2) + ' F3000 ; Move Z up\n';
    gcode += 'G1 X0 Y200 F3000 ; Move to front\n';
    gcode += 'M104 S0 ; Turn off extruder\n';
    gcode += 'M140 S0 ; Turn off bed\n';
    gcode += 'M84 ; Disable motors\n';
    
    return gcode;
  };
  
  // Generate standard 3D print operation
  const generate3DPrinterStandardOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed, depth } = settings;
    const layers = Math.ceil(depth / layerHeight!);
    let gcode = '\n; Standard printing operation\n';
    
    // Simple example: print a small square object
    const size = Math.min(rectangleWidth, rectangleHeight);
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea;
    
    // Print layers
    for (let layer = 0; layer < layers; layer++) {
      const z = layerHeight! * (layer + 1);
      gcode += `\n; Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
      
      // Move to new layer
      gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;
      
      // Outer perimeter
      gcode += 'G1 F' + printSpeed + ' ; Set print speed\n';
      gcode += `G1 X${(-size/2).toFixed(3)} Y${(-size/2).toFixed(3)} E0.5 ; Move to start position\n`;
      gcode += `G1 X${(size/2).toFixed(3)} Y${(-size/2).toFixed(3)} E${(extrusionMultiplier * size).toFixed(5)} ; Draw line\n`;
      gcode += `G1 X${(size/2).toFixed(3)} Y${(size/2).toFixed(3)} E${(extrusionMultiplier * size * 2).toFixed(5)} ; Draw line\n`;
      gcode += `G1 X${(-size/2).toFixed(3)} Y${(size/2).toFixed(3)} E${(extrusionMultiplier * size * 3).toFixed(5)} ; Draw line\n`;
      gcode += `G1 X${(-size/2).toFixed(3)} Y${(-size/2).toFixed(3)} E${(extrusionMultiplier * size * 4).toFixed(5)} ; Draw line\n`;
      
      // Simple infill (if not first or last layer)
      if (layer > 0 && layer < layers - 1) {
        // Reset extruder for infill
        gcode += 'G92 E0 ; Reset extruder position\n';
        
        // Infill pattern - simple zigzag
        const infillSpacing = extrusionWidth! * 2;
        for (let y = -size/2 + infillSpacing; y < size/2; y += infillSpacing) {
          const dir = (Math.floor(y / infillSpacing) % 2 === 0);
          gcode += `G1 X${(dir ? -size/2 : size/2).toFixed(3)} Y${y.toFixed(3)} F3000 E0.1 ; Move to start infill line\n`;
          gcode += `G1 X${(dir ? size/2 : -size/2).toFixed(3)} Y${y.toFixed(3)} F${printSpeed} E${(extrusionMultiplier * size).toFixed(5)} ; Infill line\n`;
        }
      }
      
      // Reset extruder before next layer
      gcode += 'G92 E0 ; Reset extruder position\n';
    }
    
    return gcode;
  };
  
  // Generate vase mode 3D print operation
  const generate3DPrinterVaseOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed, depth } = settings;
    const layers = Math.ceil(depth / layerHeight!);
    let gcode = '\n; Vase mode printing operation\n';
    
    // Vase parameters
    const baseRadius = circleRadius;
    const topRadius = baseRadius * 0.8; // Slight taper at the top
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea;
    
    // Print base (first layer)
    gcode += `\n; Base layer, Z=${layerHeight!.toFixed(3)}\n`;
    gcode += `G1 Z${layerHeight!.toFixed(3)} F3000 ; Move to first layer\n`;
    
    // Concentric circles for base
    for (let r = baseRadius; r > 0; r -= extrusionWidth! * 1.2) {
      const circumference = 2 * Math.PI * r;
      gcode += `G1 X${r.toFixed(3)} Y0 F3000 ; Move to radius\n`;
      gcode += `G1 F${printSpeed} E0.5 ; Prepare to print\n`;
      gcode += `G2 X${r.toFixed(3)} Y0 I${(-r).toFixed(3)} J0 E${(extrusionMultiplier * circumference).toFixed(5)} ; Print circle\n`;
    }
    
    // Reset extruder before wall
    gcode += 'G92 E0 ; Reset extruder position\n';
    
    // Print spiral wall
    gcode += '\n; Spiral vase walls\n';
    gcode += 'M106 S255 ; Fan on full\n';
    gcode += 'G1 F3000 ; Set move speed\n';
    gcode += `G1 X${baseRadius.toFixed(3)} Y0 ; Move to start position\n`;
    
    // Continuous spiral with Z change
    gcode += 'G92 E0 ; Reset extruder position\n';
    gcode += `G1 F${printSpeed} ; Set print speed\n`;
    
    const segments = 32; // Number of segments per revolution
    const angleStep = 360 / segments;
    
    for (let layer = 1; layer < layers; layer++) {
      const z = layerHeight! * (layer + 1);
      const ratio = layer / layers;
      const currentRadius = baseRadius - (baseRadius - topRadius) * ratio;
      
      for (let i = 0; i < segments; i++) {
        const angle = i * angleStep;
        const x = currentRadius * Math.cos(angle * Math.PI / 180);
        const y = currentRadius * Math.sin(angle * Math.PI / 180);
        const zHeight = z + (i / segments) * layerHeight!;
        const extrusionAmount = extrusionMultiplier * (2 * Math.PI * currentRadius / segments);
        
        gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${zHeight.toFixed(3)} E${(layer * 10 + i * extrusionAmount).toFixed(5)} ; Spiral\n`;
      }
    }
    
    return gcode;
  };
  
  // Generate support operation for 3D printer
  const generate3DPrinterSupportOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed, depth } = settings;
    const layers = Math.ceil(depth / layerHeight!);
    let gcode = '\n; Support structure printing operation\n';
    
    // Support parameter - sparse grid
    const gridSpacing = 5; // mm between support lines
    const size = Math.max(rectangleWidth, rectangleHeight);
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea * 0.8; // Slightly less for supports
    
    for (let layer = 0; layer < layers; layer++) {
      const z = layerHeight! * (layer + 1);
      gcode += `\n; Support Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
      gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;
      
      // Reset extruder for this layer
      gcode += 'G92 E0 ; Reset extruder position\n';
      
      // Alternate direction of support grid
      const altLayer = layer % 2 === 0;
      
      // Print support grid
      if (altLayer) {
        // X direction lines
        for (let y = -size/2; y <= size/2; y += gridSpacing) {
          gcode += `G1 X${(-size/2).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${(size/2).toFixed(3)} Y${y.toFixed(3)} F${printSpeed} E${(extrusionMultiplier * size).toFixed(5)} ; Support line\n`;
        }
      } else {
        // Y direction lines
        for (let x = -size/2; x <= size/2; x += gridSpacing) {
          gcode += `G1 X${x.toFixed(3)} Y${(-size/2).toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${x.toFixed(3)} Y${(size/2).toFixed(3)} F${printSpeed} E${(extrusionMultiplier * size).toFixed(5)} ; Support line\n`;
        }
      }
    }
    
    return gcode;
  };
  
  // Generate infill operation for 3D printer
  const generate3DPrinterInfillOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed, depth } = settings;
    const layers = Math.ceil(depth / layerHeight!);
    let gcode = '\n; Infill structure printing operation\n';
    
    // Infill parameters
    const infillPercentage = 20; // 20% density
    const infillSpacing = extrusionWidth! * (100 / infillPercentage);
    const size = Math.min(rectangleWidth, rectangleHeight);
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea;
    
    for (let layer = 0; layer < layers; layer++) {
      const z = layerHeight! * (layer + 1);
      gcode += `\n; Infill Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
      gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;
      
      // Reset extruder for this layer
      gcode += 'G92 E0 ; Reset extruder position\n';
      
      // Alternate infill pattern direction and angle
      const angle = (layer % 2 === 0) ? 0 : 90; // Alternate 0/90 degrees
      
      if (angle === 0) {
        // Horizontal lines
        for (let y = -size/2; y <= size/2; y += infillSpacing) {
          gcode += `G1 X${(-size/2).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${(size/2).toFixed(3)} Y${y.toFixed(3)} F${printSpeed} E${(extrusionMultiplier * size).toFixed(5)} ; Infill line\n`;
        }
      } else {
        // Vertical lines
        for (let x = -size/2; x <= size/2; x += infillSpacing) {
          gcode += `G1 X${x.toFixed(3)} Y${(-size/2).toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${x.toFixed(3)} Y${(size/2).toFixed(3)} F${printSpeed} E${(extrusionMultiplier * size).toFixed(5)} ; Infill line\n`;
        }
      }
    }
    
    return gcode;
  };
  
  // Generate raft operation for 3D printer
  const generate3DPrinterRaftOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed } = settings;
    let gcode = '\n; Raft printing operation\n';
    
    // Raft parameters
    const raftLayers = 3;
    const raftSize = Math.max(rectangleWidth, rectangleHeight) + 10; // Extend beyond object
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea;
    
    for (let layer = 0; layer < raftLayers; layer++) {
      const z = layerHeight! * (layer + 1);
      gcode += `\n; Raft Layer ${layer + 1}, Z=${z.toFixed(3)}\n`;
      gcode += `G1 Z${z.toFixed(3)} F3000 ; Move to new layer\n`;
      
      // Reset extruder for this layer
      gcode += 'G92 E0 ; Reset extruder position\n';
      
      // First layer: wide spacing, thick lines
      // Middle layers: medium spacing
      // Top layer: dense pattern for smooth surface
      
      let spacing;
      let speedFactor;
      let flowFactor;
      
      if (layer === 0) {
        spacing = extrusionWidth! * 3;
        speedFactor = 0.6; // Slower for first layer
        flowFactor = 1.5; // More material for adhesion
      } else if (layer === raftLayers - 1) {
        spacing = extrusionWidth! * 1.2;
        speedFactor = 0.8;
        flowFactor = 1.0;
      } else {
        spacing = extrusionWidth! * 2;
        speedFactor = 0.7;
        flowFactor = 1.2;
      }
      
      // Alternate directions for each layer
      const angle = (layer % 2 === 0) ? 0 : 90;
      
      if (angle === 0) {
        // Horizontal lines
        for (let y = -raftSize/2; y <= raftSize/2; y += spacing) {
          gcode += `G1 X${(-raftSize/2).toFixed(3)} Y${y.toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${(raftSize/2).toFixed(3)} Y${y.toFixed(3)} F${(printSpeed! * speedFactor)} E${(extrusionMultiplier * flowFactor * raftSize).toFixed(5)} ; Raft line\n`;
        }
      } else {
        // Vertical lines
        for (let x = -raftSize/2; x <= raftSize/2; x += spacing) {
          gcode += `G1 X${x.toFixed(3)} Y${(-raftSize/2).toFixed(3)} F3000 ; Move to start line\n`;
          gcode += `G1 X${x.toFixed(3)} Y${(raftSize/2).toFixed(3)} F${(printSpeed! * speedFactor)} E${(extrusionMultiplier * flowFactor * raftSize).toFixed(5)} ; Raft line\n`;
        }
      }
    }
    
    return gcode;
  };
  
  // Generate brim operation for 3D printer
  const generate3DPrinterBrimOperation = () => {
    const { layerHeight, extrusionWidth, printSpeed } = settings;
    let gcode = '\n; Brim printing operation\n';
    
    // Brim parameters
    const brimLoops = 5;
    const size = Math.min(rectangleWidth, rectangleHeight);
    
    // Calculate extrusion values
    const filamentArea = Math.PI * Math.pow(settings.filamentDiameter! / 2, 2);
    const extrusionArea = extrusionWidth! * layerHeight!;
    const extrusionMultiplier = extrusionArea / filamentArea;
    
    // First layer only
    gcode += `\n; Brim Layer, Z=${layerHeight!.toFixed(3)}\n`;
    gcode += `G1 Z${layerHeight!.toFixed(3)} F3000 ; Move to first layer\n`;
    
    // Reset extruder
    gcode += 'G92 E0 ; Reset extruder position\n';
    
    // Print concentric brim
    for (let i = 1; i <= brimLoops; i++) {
      const currentSize = size + (i * extrusionWidth! * 1.1);
      const perimeter = currentSize * 4;
      
      // Square brim
      gcode += `\n; Brim loop ${i}\n`;
      gcode += `G1 X${(-currentSize/2).toFixed(3)} Y${(-currentSize/2).toFixed(3)} F3000 ; Move to start\n`;
      gcode += `G1 F${printSpeed} E0.5 ; Prepare to print\n`;
      gcode += `G1 X${(currentSize/2).toFixed(3)} Y${(-currentSize/2).toFixed(3)} E${(extrusionMultiplier * currentSize).toFixed(5)} ; Brim line\n`;
      gcode += `G1 X${(currentSize/2).toFixed(3)} Y${(currentSize/2).toFixed(3)} E${(extrusionMultiplier * (currentSize * 2)).toFixed(5)} ; Brim line\n`;
      gcode += `G1 X${(-currentSize/2).toFixed(3)} Y${(currentSize/2).toFixed(3)} E${(extrusionMultiplier * (currentSize * 3)).toFixed(5)} ; Brim line\n`;
      gcode += `G1 X${(-currentSize/2).toFixed(3)} Y${(-currentSize/2).toFixed(3)} E${(extrusionMultiplier * (currentSize * 4)).toFixed(5)} ; Brim line\n`;
    }
    
    // Reset extruder after brim
    gcode += 'G92 E0 ; Reset extruder position\n';
    
    return gcode;
  };
  
  // Generate from selected CAD elements
  const generateFromSelectedElements = () => {
    if (!selectedElement) {
      return '; No element selected for toolpath generation\n';
    }
    
    let gcode = `; Toolpath from selected element (${selectedElement.type})\n`;
    
    // Logic based on selected element type
    switch (selectedElement.type) {
      case 'circle':
        gcode += generateCircleFromElement(selectedElement);
        break;
      case 'rectangle':
        gcode += generateRectangleFromElement(selectedElement);
        break;
      case 'line':
        gcode += generateLineFromElement(selectedElement);
        break;
      case 'cube':
        gcode += generateCubeFromElement(selectedElement);
        break;
      case 'sphere':
        gcode += generateSphereFromElement(selectedElement);
        break;
      case 'cylinder':
        gcode += generateCylinderFromElement(selectedElement);
        break;
      case 'cone':
        gcode += generateConeFromElement(selectedElement);
        break;
      case 'torus':
        gcode += generateTorusFromElement(selectedElement);
        break;
      case 'extrude':
        gcode += generateExtrudeFromElement(selectedElement);
        break;
      case 'text':
        gcode += generateTextFromElement(selectedElement);
        break;
      case 'polygon':
        gcode += generatePolygonFromElement(selectedElement);
        break;
      case 'component':
        gcode += generateElementToolpath(selectedElement, settings);
        break;
      case 'composite':
        gcode += generateCompositeFromElement(selectedElement);
        break;
      case 'pyramid':
        gcode += generatePyramidToolpath(selectedElement, settings);
        break;
      case 'hemisphere':
        gcode += generateHemisphereToolpath(selectedElement, settings);
        break;
      case 'prism':
        gcode += generatePrismToolpath(selectedElement, settings);
        break;
      case 'ellipsoid':
        gcode += generateEllipsoidToolpath(selectedElement, settings);
        break;
      case 'capsule':
        gcode += generateCapsuleToolpath(selectedElement, settings);
        break;
      case 'triangle':
        gcode += generateTriangleToolpath(selectedElement, settings);
        break;
      case 'arc':
        gcode += generateArcToolpath(selectedElement, settings);
        break;
      case 'ellipse':
        gcode += generateEllipseToolpath(selectedElement, settings);
        break;
      case 'text3d':
        gcode += generateText3DToolpath(selectedElement, settings);
        break;
      default:
        // Use the generic toolpath generator for any other element type
        try {
          // Import from our new toolpath generator modules
          const { generateDefaultToolpath } = require('src/lib/toolpath');
          gcode += generateDefaultToolpath(selectedElement, settings);
        } catch (error) {
          console.error('Error generating toolpath:', error);
          gcode += `; Error generating generic toolpath: ${error}\n; Falling back to component toolpath\n`;
          gcode += generateElementToolpath(selectedElement, settings);
        }
    }
    
    return gcode;
  };

  // Generate from a selected cube element
  const generateCubeFromElement = (element: any) => {
    let gcode = `; Cube: center (${element.x}, ${element.y}, ${element.z}), width ${element.width}mm, height ${element.height}mm, depth ${element.depth}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For cubes, typically we only work on the top face for 3-axis machining
    // Calculate offset distance based on selected offset type
    let offsetDistance = 0;
    if (offset === 'inside') {
      offsetDistance = -toolDiameter / 2;
    } else if (offset === 'outside') {
      offsetDistance = toolDiameter / 2;
    }
    
    // Calculate rectangle coordinates with offset
    const width = element.width + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    const height = element.depth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    
    // Start point (top face)
    const startX = element.x - width / 2;
    const startY = element.y - height / 2;
    const startZ = element.z + element.height / 2; // Top face
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      const actualZ = startZ + currentZ;
      
      gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
      gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(startZ + 5).toFixed(3)} ; Move to start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Contour
      const corners = [
        [startX, startY],
        [startX + width, startY],
        [startX + width, startY + height],
        [startX, startY + height],
        [startX, startY] // Close the loop
      ];
      
      // Reverse order for conventional milling
      if (direction === 'conventional') {
        corners.reverse();
      }
      
      for (let i = 0; i < corners.length; i++) {
        gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
      }
    }
    
    return gcode;
  };

  // Generate from a selected sphere element
  const generateSphereFromElement = (element: any) => {
    let gcode = `; Sphere: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For spheres, we typically create concentric circles at different heights
    // Calculate offset distance based on selected offset type
    let effectiveRadius = element.radius;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // Start with the top of the sphere
    const topZ = element.z + element.radius;
    
    // Generate toolpath in slices from top to bottom
    for (let sliceZ = topZ; sliceZ >= element.z - depth; sliceZ -= stepdown) {
      // Calculate radius of this slice (using Pythagorean theorem)
      const distFromCenter = Math.abs(sliceZ - element.z);
      const sliceRadius = distFromCenter < element.radius ? 
        Math.sqrt(element.radius * element.radius - distFromCenter * distFromCenter) : 0;
      
      if (sliceRadius <= 0) continue;
      
      gcode += `\n; Sphere Slice at Z=${sliceZ.toFixed(3)}, Radius=${sliceRadius.toFixed(3)}\n`;
      
      // Move to start point on this slice
      gcode += `G0 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(sliceZ + 5).toFixed(3)} ; Move above slice\n`;
      gcode += `G1 Z${sliceZ.toFixed(3)} F${plungerate} ; Plunge to slice level\n`;
      
      // Full circle for this slice
      if (direction === 'climb') {
        gcode += `G3 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-sliceRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${(element.x + sliceRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-sliceRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    }
    
    return gcode;
  };

  // Generate from a selected cylinder element
  const generateCylinderFromElement = (element: any) => {
    let gcode = `; Cylinder: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, height ${element.height}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // Calculate offset distance based on selected offset type
    let effectiveRadius = element.radius;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // Start with the top of the cylinder
    const topZ = element.z + element.height / 2;
    
    // For each Z level
    for (let z = 0; z > -Math.min(depth, element.height); z -= stepdown) {
      const currentZ = Math.max(-Math.min(depth, element.height), z);
      const actualZ = topZ + currentZ;
      
      gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
      
      // Move to start point on circle
      gcode += `G0 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(topZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Full circle
      if (direction === 'climb') {
        gcode += `G3 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    }
    
    return gcode;
  };

  // Generate from a selected cone element
  const generateConeFromElement = (element: any) => {
    let gcode = `; Cone: base center (${element.x}, ${element.y}, ${element.z}), base radius ${element.radius}mm, height ${element.height}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For cones, we create circles with decreasing radii as we move up the cone
    const baseZ = element.z - element.height / 2;
    const topZ = element.z + element.height / 2;
    
    // Generate toolpath in slices from bottom to top (or according to depth)
    for (let sliceZ = baseZ; sliceZ <= Math.min(baseZ + depth, topZ); sliceZ += stepdown) {
      // Calculate radius of this slice (linear proportion)
      const progress = (sliceZ - baseZ) / element.height;
      const sliceRadius = element.radius * (1 - progress);
      
      if (sliceRadius <= toolDiameter / 2) continue;
      
      // Calculate offset distance based on selected offset type
      let effectiveRadius = sliceRadius;
      if (offset === 'inside') {
        effectiveRadius -= toolDiameter / 2;
      } else if (offset === 'outside') {
        effectiveRadius += toolDiameter / 2;
      }
      
      if (effectiveRadius <= 0) continue;
      
      gcode += `\n; Cone Slice at Z=${sliceZ.toFixed(3)}, Radius=${effectiveRadius.toFixed(3)}\n`;
      
      // Move to start point on this slice
      gcode += `G0 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(sliceZ + 5).toFixed(3)} ; Move above slice\n`;
      gcode += `G1 Z${sliceZ.toFixed(3)} F${plungerate} ; Plunge to slice level\n`;
      
      // Full circle for this slice
      if (direction === 'climb') {
        gcode += `G3 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    }
    
    return gcode;
  };

  // Generate from a selected torus element
  const generateTorusFromElement = (element: any) => {
    let gcode = `; Torus: center (${element.x}, ${element.y}, ${element.z}), major radius ${element.radius}mm, minor radius ${element.tubeRadius}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For a torus, we typically create concentric circles at different heights
    const majorRadius = element.radius || 30;
    const minorRadius = element.tubeRadius || 10;
    
    // Calculate top and bottom Z values
    const topZ = element.z + minorRadius;
    const bottomZ = element.z - minorRadius;
    
    // Generate toolpath in slices from top to bottom
    for (let sliceZ = topZ; sliceZ >= Math.max(bottomZ, topZ - depth); sliceZ -= stepdown) {
      // Distance from center plane
      const distFromCenter = Math.abs(sliceZ - element.z);
      
      // Skip if we're outside the torus
      if (distFromCenter > minorRadius) continue;
      
      // Calculate inner and outer radii for this slice
      const minorSliceRadius = Math.sqrt(minorRadius * minorRadius - distFromCenter * distFromCenter);
      const outerRadius = majorRadius + minorSliceRadius;
      const innerRadius = majorRadius - minorSliceRadius;
      
      // Apply tool offset
      let effectiveOuterRadius = outerRadius;
      let effectiveInnerRadius = innerRadius;
      
      if (offset === 'outside') {
        effectiveOuterRadius += toolDiameter / 2;
        effectiveInnerRadius -= toolDiameter / 2;
      } else if (offset === 'inside') {
        effectiveOuterRadius -= toolDiameter / 2;
        effectiveInnerRadius += toolDiameter / 2;
      }
      
      if (effectiveInnerRadius >= effectiveOuterRadius) continue;
      
      gcode += `\n; Torus Slice at Z=${sliceZ.toFixed(3)}, Outer=${effectiveOuterRadius.toFixed(3)}, Inner=${effectiveInnerRadius.toFixed(3)}\n`;
      
      // Outer circle
      gcode += `G0 X${(element.x + effectiveOuterRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(sliceZ + 5).toFixed(3)} ; Move above outer circle\n`;
      gcode += `G1 Z${sliceZ.toFixed(3)} F${plungerate} ; Plunge to slice level\n`;
      
      if (direction === 'climb') {
        gcode += `G3 X${(element.x + effectiveOuterRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveOuterRadius).toFixed(3)} J0 F${feedrate} ; Outer circle clockwise\n`;
      } else {
        gcode += `G2 X${(element.x + effectiveOuterRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveOuterRadius).toFixed(3)} J0 F${feedrate} ; Outer circle counter-clockwise\n`;
      }
      
      // Inner circle (reverse direction)
      gcode += `G0 X${(element.x + effectiveInnerRadius).toFixed(3)} Y${element.y.toFixed(3)} ; Move to inner circle\n`;
      
      if (direction === 'climb') {
        gcode += `G2 X${(element.x + effectiveInnerRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveInnerRadius).toFixed(3)} J0 F${feedrate} ; Inner circle counter-clockwise\n`;
      } else {
        gcode += `G3 X${(element.x + effectiveInnerRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveInnerRadius).toFixed(3)} J0 F${feedrate} ; Inner circle clockwise\n`;
      }
    }
    
    return gcode;
  };

  // Generate from a selected extrude element
  const generateExtrudeFromElement = (element: any) => {
    let gcode = `; Extrude: base at (${element.x}, ${element.y}, ${element.z}), shape type: ${element.shapeType || 'custom'}, height: ${element.height || 10}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For extrusions, we follow the base profile at different heights
    // We'll use a simplified approach assuming it's a rectangular or circular extrusion
    
    if (element.shapeType === 'rectangle' || element.baseShape?.type === 'rectangle') {
      // Rectangle extrusion
      const width = element.width || element.baseShape?.width || 50;
      const length = element.length || element.baseShape?.length || 50;
      
      // Calculate offset distance
      let offsetDistance = 0;
      if (offset === 'inside') {
        offsetDistance = -toolDiameter / 2;
      } else if (offset === 'outside') {
        offsetDistance = toolDiameter / 2;
      }
      
      // Calculate rectangle coordinates with offset
      const rectWidth = width + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
      const rectLength = length + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
      
      // Start point
      const startX = element.x - rectWidth / 2;
      const startY = element.y - rectLength / 2;
      const startZ = element.z;
      
      // For each Z level, up to the extrusion height or the depth parameter
      for (let z = 0; z < Math.min(element.height || 10, depth); z += stepdown) {
        const currentZ = Math.min(element.height || 10, z);
        const actualZ = startZ + currentZ;
        
        gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
        gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
        gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Contour
        const corners = [
          [startX, startY],
          [startX + rectWidth, startY],
          [startX + rectWidth, startY + rectLength],
          [startX, startY + rectLength],
          [startX, startY] // Close the loop
        ];
        
        // Reverse order for conventional milling
        if (direction === 'conventional') {
          corners.reverse();
        }
        
        for (let i = 0; i < corners.length; i++) {
          gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
        }
      }
    } else if (element.shapeType === 'circle' || element.baseShape?.type === 'circle') {
      // Circle extrusion
      const radius = element.radius || element.baseShape?.radius || 25;
      
      // Calculate offset distance
      let effectiveRadius = radius;
      if (offset === 'inside') {
        effectiveRadius -= toolDiameter / 2;
      } else if (offset === 'outside') {
        effectiveRadius += toolDiameter / 2;
      }
      
      // For each Z level, up to the extrusion height or the depth parameter
      for (let z = 0; z < Math.min(element.height || 10, depth); z += stepdown) {
        const currentZ = Math.min(element.height || 10, z);
        const actualZ = element.z + currentZ;
        
        gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
        gcode += `G0 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
        gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Full circle
        if (direction === 'climb') {
          gcode += `G3 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
        } else {
          gcode += `G2 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
        }
      }
    } else {
      // Generic extrusion - use a placeholder message
      gcode += `; Complex extrusion path not supported - convert to basic shapes first\n`;
    }
    
    return gcode;
  };

  // Generate from a selected text element
  const generateTextFromElement = (element: any) => {
    let gcode = `; Text: position (${element.x}, ${element.y}, ${element.z}), content: "${element.text || 'Text'}"\n`;
    
    // Text engraving is complex and typically requires specialized CAM software
    gcode += `; Text engraving requires conversion to paths - please use CAM software for text operations\n`;
    gcode += `; Recommend using outline paths or importing as SVG for text machining\n`;
    
    return gcode;
  };

  // Generate from a selected polygon element
  const generatePolygonFromElement = (element: any) => {
    let gcode = `; Polygon: center (${element.x}, ${element.y}, ${element.z}), sides: ${element.sides || 6}, radius: ${element.radius || 30}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // For polygons, we calculate vertices and create a path
    const sides = element.sides || 6;
    let radius = element.radius || 30;
    
    // Calculate offset distance based on selected offset type
    if (offset === 'inside') {
      radius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      radius += toolDiameter / 2;
    }
    
    if (radius <= 0) {
      return `; Cannot generate toolpath: radius after offset is too small\n`;
    }
    
    // Calculate polygon points
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = i * (2 * Math.PI / sides);
      const x = element.x + radius * Math.cos(angle);
      const y = element.y + radius * Math.sin(angle);
      points.push([x, y]);
    }
    points.push(points[0]); // Close the loop
    
    // Reverse order for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      const actualZ = element.z + currentZ;
      
      gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
      
      // Move to first point
      gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(element.z + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Follow polygon path
      for (let i = 1; i < points.length; i++) {
        gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
      }
    }
    
    return gcode;
  };
  const generatePolygonToolpath = () => {
    let gcode = `; Polygon toolpath (${polygonSides} sides)\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction, operationType, stepover } = settings;
    
    // Calculate offset distance based on selected offset type
    let effectiveRadius = polygonRadius;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      
      // For pocket operation
      if (operationType === 'pocket') {
        // Calculate number of passes based on stepover
        const stepSize = toolDiameter * (stepover / 100);
        const numSteps = Math.ceil(effectiveRadius / stepSize);
        
        gcode += `; Polygon pocket operation - Stepover: ${stepover}% (${stepSize.toFixed(2)}mm)\n`;
        
        // Start from center and spiral outward
        const centerPoint = applyOriginOffset(0, 0);
        gcode += `G0 X${centerPoint.x.toFixed(3)} Y${centerPoint.y.toFixed(3)} ; Move to center\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        for (let i = 1; i <= numSteps; i++) {
          const currentRadius = Math.min(i * stepSize, effectiveRadius);
          
          // Calculate polygon points for this radius
          const points = [];
          for (let j = 0; j < polygonSides; j++) {
            const angle = j * (2 * Math.PI / polygonSides);
            const baseX = currentRadius * Math.cos(angle);
            const baseY = currentRadius * Math.sin(angle);
            // Apply origin offset
            const offsetPoint = applyOriginOffset(baseX, baseY);
            points.push(offsetPoint);
          }
          // Close the polygon
          points.push(points[0]);
          
          // Reverse order for conventional milling
          if (direction === 'conventional') {
            points.reverse();
          }
          
          // Polygon path
          for (let j = 0; j < points.length; j++) {
            gcode += `G1 X${points[j].x.toFixed(3)} Y${points[j].y.toFixed(3)} F${feedrate} ; Point ${j+1} at radius ${currentRadius.toFixed(3)}\n`;
          }
        }
      } else {
        // Calculate polygon points with origin offset
        const points = [];
        for (let i = 0; i < polygonSides; i++) {
          const angle = i * (2 * Math.PI / polygonSides);
          const baseX = effectiveRadius * Math.cos(angle);
          const baseY = effectiveRadius * Math.sin(angle);
          // Apply origin offset
          const offsetPoint = applyOriginOffset(baseX, baseY);
          points.push(offsetPoint);
        }
        // Close the loop
        points.push(points[0]);
        
        // Reverse order for conventional milling
        if (direction === 'conventional') {
          points.reverse();
        }
        
        // Move to first point
        gcode += `G0 X${points[0].x.toFixed(3)} Y${points[0].y.toFixed(3)} ; Move to start position\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Cut polygon
        for (let i = 1; i < points.length; i++) {
          gcode += `G1 X${points[i].x.toFixed(3)} Y${points[i].y.toFixed(3)} F${feedrate} ; Point ${i}\n`;
        }
      }
    }
    
    return gcode;
  };
  // Generate from a composite element
  const generateCompositeFromElement = (element: any) => {
    let gcode = `; Composite element with sub-elements\n`;
    
    if (!element.elements || !Array.isArray(element.elements) || element.elements.length === 0) {
      return `; No sub-elements found in composite element\n`;
    }
    
    gcode += `; Processing ${element.elements.length} sub-elements\n`;
    
    // Process each sub-element
    for (const subElement of element.elements) {
      if (!subElement) continue;
      
      gcode += `\n; Sub-element type: ${subElement.type}\n`;
      
      switch (subElement.type) {
        case 'circle':
          gcode += generateCircleFromElement(subElement);
          break;
        case 'rectangle':
          gcode += generateRectangleFromElement(subElement);
          break;
        case 'line':
          gcode += generateLineFromElement(subElement);
          break;
        case 'cube':
          gcode += generateCubeFromElement(subElement);
          break;
        case 'sphere':
          gcode += generateSphereFromElement(subElement);
          break;
        case 'cylinder':
          gcode += generateCylinderFromElement(subElement);
          break;
        case 'cone':
          gcode += generateConeFromElement(subElement);
          break;
        case 'torus':
          gcode += generateTorusFromElement(subElement);
          break;
        case 'extrude':
          gcode += generateExtrudeFromElement(subElement);
          break;
        case 'text':
          gcode += generateTextFromElement(subElement);
          break;
          case 'pyramid':
            gcode += generatePyramidToolpath(subElement, settings);
            break;
          case 'hemisphere':
            gcode += generateHemisphereToolpath(subElement, settings);
            break;
          case 'prism':
            gcode += generatePrismToolpath(subElement, settings);
            break;
          case 'ellipsoid':
            gcode += generateEllipsoidToolpath(subElement, settings);
            break;
          case 'capsule':
            gcode += generateCapsuleToolpath(subElement, settings);
            break;
          case 'triangle':
            gcode += generateTriangleToolpath(subElement, settings);
            break;
          case 'arc':
            gcode += generateArcToolpath(subElement, settings);
            break;
          case 'ellipse':
            gcode += generateEllipseToolpath(subElement, settings);
            break;
          case 'text3d':
            gcode += generateText3DToolpath(subElement, settings);
            break;
        case 'polygon':
          gcode += generatePolygonFromElement(subElement);
          break;
        // ... other cases ...
        
        case 'group':
          gcode += `; Group element with ${subElement.elements?.length || 0} sub-elements\n`;
          if (subElement.elements && Array.isArray(subElement.elements) && subElement.elements.length > 0) {
            gcode += generateCompositeFromElement(subElement); // Recursively process nested groups
          } else {
            gcode += `; Empty group, no toolpath generated\n`;
          }
        
          break;
        case 'tube':
          gcode += `; Tube element: ${subElement.path?.length || 0} path points, radius=${subElement.radius}\n`;
          gcode += `; Toolpath generation for tube is not yet implemented\n`;
          break;
        case 'lathe':
          gcode += `; Lathe element: ${subElement.points?.length || 0} points, segments=${subElement.segments}\n`;
          gcode += `; Toolpath generation for lathe is not yet implemented\n`;
          break;
        case 'grid':
          gcode += `; Grid element: size=${subElement.size}, divisions=${subElement.divisions}, plane=${subElement.plane}\n`;
          gcode += `; Toolpath generation for grid is not yet implemented\n`;
          break;
        case 'component':
          gcode += `; Component with ${subElement.elements?.length || 0} elements\n`;
          gcode += generateComponentToolpath(subElement, settings);
          break;
        default:
          gcode += generateCompositeFromElement(selectedElement);
      }
    }
    
    return gcode;
  };
  
  // Generate from a selected rectangle element
  const generateRectangleFromElement = (element: any) => {
    let gcode = `; Rectangle: center (${element.x}, ${element.y}), width ${element.width}mm, height ${element.height}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // Calculate offset distance based on selected offset type
    let offsetDistance = 0;
    if (offset === 'inside') {
      offsetDistance = -toolDiameter / 2;
    } else if (offset === 'outside') {
      offsetDistance = toolDiameter / 2;
    }
    
    // Calculate rectangle coordinates with offset
    const width = element.width + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    const height = element.height + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    
    // Start point
    const startX = element.x - width / 2;
    const startY = element.y - height / 2;
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} ; Move to start position\n`;
      gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Contour
      const corners = [
        [startX, startY],
        [startX + width, startY],
        [startX + width, startY + height],
        [startX, startY + height],
        [startX, startY] // Close the loop
      ];
      
      // Reverse order for conventional milling
      if (direction === 'conventional') {
        corners.reverse();
      }
      
      for (let i = 0; i < corners.length; i++) {
        gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
      }
    }
    
    return gcode;
  };
  
  // Generate from a selected line element
  const generateLineFromElement = (element: any) => {
    let gcode = `; Line: from (${element.x1}, ${element.y1}) to (${element.x2}, ${element.y2})\n`;
    const { depth, stepdown, feedrate, plungerate } = settings;
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      gcode += `G0 X${element.x1.toFixed(3)} Y${element.y1.toFixed(3)} ; Move to start position\n`;
      gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      gcode += `G1 X${element.x2.toFixed(3)} Y${element.y2.toFixed(3)} F${feedrate} ; Linear move to end\n`;
    }
    
    return gcode;
  };
  
  // Generate rectangular toolpath
  const generateRectangleToolpath = () => {
    let gcode = '; Rectangle toolpath\n';
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction, stepover, operationType } = settings;
    
    // Calculate offset distance based on selected offset type
    let offsetDistance = 0;
    if (offset === 'inside') {
      offsetDistance = -toolDiameter / 2;
    } else if (offset === 'outside') {
      offsetDistance = toolDiameter / 2;
    }
    
    // Calculate rectangle coordinates with offset
    const width = rectangleWidth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    const height = rectangleHeight + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    
    // Start point (with origin in center of rectangle)
    const baseStartX = -width / 2;
    const baseStartY = -height / 2;
    
    // Apply origin offset to get actual coordinates
    const startPoint = applyOriginOffset(baseStartX, baseStartY);
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      
      // For pocket operation
      if (operationType === 'pocket') {
        // Calculate number of passes based on stepover
        const stepSize = toolDiameter * (stepover / 100);
        const numXSteps = Math.ceil(width / stepSize);
        const numYSteps = Math.ceil(height / stepSize);
        
        gcode += `; Pocket operation - Stepover: ${stepover}% (${stepSize.toFixed(2)}mm)\n`;
        
        // Start from center and spiral outward
        const centerPoint = applyOriginOffset(0, 0);
        gcode += `G0 X${centerPoint.x.toFixed(3)} Y${centerPoint.y.toFixed(3)} ; Move to center\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        let currentStep = 1;
        const maxSteps = Math.max(numXSteps, numYSteps);
        
        while (currentStep <= maxSteps) {
          const currentX = Math.min(width / 2, currentStep * stepSize / 2);
          const currentY = Math.min(height / 2, currentStep * stepSize / 2);
          
          // Rectangular spiral with origin offset
          const corner1 = applyOriginOffset(currentX, -currentY);
          const corner2 = applyOriginOffset(currentX, currentY);
          const corner3 = applyOriginOffset(-currentX, currentY);
          const corner4 = applyOriginOffset(-currentX, -currentY);
          
          gcode += `G1 X${corner1.x.toFixed(3)} Y${corner1.y.toFixed(3)} F${feedrate} ; Step ${currentStep} corner 1\n`;
          gcode += `G1 X${corner2.x.toFixed(3)} Y${corner2.y.toFixed(3)} F${feedrate} ; Step ${currentStep} corner 2\n`;
          gcode += `G1 X${corner3.x.toFixed(3)} Y${corner3.y.toFixed(3)} F${feedrate} ; Step ${currentStep} corner 3\n`;
          gcode += `G1 X${corner4.x.toFixed(3)} Y${corner4.y.toFixed(3)} F${feedrate} ; Step ${currentStep} corner 4\n`;
          gcode += `G1 X${corner1.x.toFixed(3)} Y${corner1.y.toFixed(3)} F${feedrate} ; Close loop\n`;
          
          currentStep++;
        }
      } else {
        // Standard contour
        gcode += `G0 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} ; Move to start position\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Contour
        const corners = [
          applyOriginOffset(baseStartX, baseStartY),
          applyOriginOffset(baseStartX + width, baseStartY),
          applyOriginOffset(baseStartX + width, baseStartY + height),
          applyOriginOffset(baseStartX, baseStartY + height),
          applyOriginOffset(baseStartX, baseStartY) // Close the loop
        ];
        
        // Reverse order for conventional milling
        if (direction === 'conventional') {
          corners.reverse();
        }
        
        for (let i = 0; i < corners.length; i++) {
          gcode += `G1 X${corners[i].x.toFixed(3)} Y${corners[i].y.toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
        }
      }
    }
    
    return gcode;
  };

/**
 * Generate toolpath for a pyramid element
 */
function generatePyramidToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Pyramid: center (${element.x}, ${element.y}, ${element.z}), base width ${element.baseWidth || element.width}mm, base depth ${element.baseDepth || element.depth}mm, height ${element.height}mm\n`;
  
  // Calculate offset distance based on selected offset type
  let offsetDistance = 0;
  if (offset === 'inside') {
    offsetDistance = -toolDiameter / 2;
  } else if (offset === 'outside') {
    offsetDistance = toolDiameter / 2;
  }
  
  // Get base dimensions
  const baseWidth = element.baseWidth || element.width || 50;
  const baseDepth = element.baseDepth || element.depth || 50;
  const height = element.height || 50;
  
  // Calculate the top Z of the pyramid
  const topZ = element.z + height / 2;
  const bottomZ = element.z - height / 2;
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, height); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, height), z);
    const actualZ = topZ + currentZ;
    
    // Calculate the slice dimensions at this Z level
    // As we move down from the top, the slice gets larger
    const ratio = 1 - (actualZ - bottomZ) / height;
    const sliceWidth = baseWidth * ratio;
    const sliceDepth = baseDepth * ratio;
    
    // Calculate the corners of this slice
    const halfSliceWidth = sliceWidth / 2;
    const halfSliceDepth = sliceDepth / 2;
    
    // Apply offset to the slice dimensions
    const offsetWidth = sliceWidth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    const offsetDepth = sliceDepth + offsetDistance * 2 * (offset === 'outside' ? 1 : -1);
    
    // Skip if dimensions are too small
    if (offsetWidth <= 0 || offsetDepth <= 0) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Offset dimensions too small, skipping\n`;
      continue;
    }
    
    const halfOffsetWidth = offsetWidth / 2;
    const halfOffsetDepth = offsetDepth / 2;
    
    // Start point
    const startX = element.x - halfOffsetWidth;
    const startY = element.y - halfOffsetDepth;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Slice width: ${offsetWidth.toFixed(3)}, Slice depth: ${offsetDepth.toFixed(3)}\n`;
    gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Contour of the slice (rectangular)
    const corners = [
      [startX, startY],
      [startX + offsetWidth, startY],
      [startX + offsetWidth, startY + offsetDepth],
      [startX, startY + offsetDepth],
      [startX, startY] // Close the loop
    ];
    
    // Reverse order for conventional milling
    if (direction === 'conventional') {
      corners.reverse();
    }
    
    for (let i = 0; i < corners.length; i++) {
      gcode += `G1 X${corners[i][0].toFixed(3)} Y${corners[i][1].toFixed(3)} F${feedrate} ; Corner ${i+1}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a hemisphere element
 */
function generateHemisphereToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction: millingDirection } = settings;
  
  let gcode = `; Hemisphere: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, direction ${element.direction || 'up'}\n`;
  
  // Get hemisphere properties
  const radius = element.radius || 25;
  const hemisphereDirection = element.direction || 'up'; // 'up' or 'down'
  
  // Determine the Z extents of the hemisphere
  let topZ, bottomZ;
  if (hemisphereDirection === 'up') {
    topZ = element.z + radius;
    bottomZ = element.z;
  } else {
    topZ = element.z;
    bottomZ = element.z - radius;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, radius); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, radius), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the hemisphere
    if (actualZ < bottomZ) {
      continue;
    }
    
    // Calculate radius at this height using the sphere equation
    const distanceFromCenter = Math.abs(actualZ - (hemisphereDirection === 'up' ? element.z : element.z));
    const radiusAtHeight = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2)));
    
    // Apply offset to the radius
    let effectiveRadius = radiusAtHeight;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // Skip if radius is too small
    if (effectiveRadius <= 0) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Radius too small, skipping\n`;
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Radius: ${effectiveRadius.toFixed(3)}\n`;
    
    // Move to start point on circle
    gcode += `G0 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Full circle
    if (millingDirection === 'climb') {
      gcode += `G3 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
    } else {
      gcode += `G2 X${(element.x + effectiveRadius).toFixed(3)} Y${element.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a prism element
 */
function generatePrismToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Prism: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, height ${element.height}mm, sides ${element.sides || 6}\n`;
  
  // Get prism properties
  const radius = element.radius || 25;
  const height = element.height || 50;
  const sides = element.sides || 6;
  
  // Calculate the top Z of the prism
  const topZ = element.z + height / 2;
  const bottomZ = element.z - height / 2;
  
  // Apply offset to the radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius -= toolDiameter / 2;
  } else if (offset === 'outside') {
    effectiveRadius += toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Prism radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, height); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, height), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the prism
    if (actualZ < bottomZ) {
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Generate points for the polygon representing the prism cross-section
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = i * (2 * Math.PI / sides);
      const x = element.x + effectiveRadius * Math.cos(angle);
      const y = element.y + effectiveRadius * Math.sin(angle);
      points.push([x, y]);
    }
    points.push(points[0]); // Close the loop
    
    // Reverse for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the polygon
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for an ellipsoid element
 */
function generateEllipsoidToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Ellipsoid: center (${element.x}, ${element.y}, ${element.z}), radiusX ${element.radiusX || element.width/2 || 25}mm, radiusY ${element.radiusY || element.height/2 || 15}mm, radiusZ ${element.radiusZ || element.depth/2 || 20}mm\n`;
  
  // Get ellipsoid properties
  const radiusX = element.radiusX || element.width/2 || 25;
  const radiusY = element.radiusY || element.height/2 || 15;
  const radiusZ = element.radiusZ || element.depth/2 || 20;
  
  // Calculate the top Z of the ellipsoid
  const topZ = element.z + radiusZ;
  const bottomZ = element.z - radiusZ;
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, radiusZ * 2); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, radiusZ * 2), z);
    const actualZ = topZ + currentZ;
    
    // Skip if we're below the ellipsoid
    if (actualZ < bottomZ) {
      continue;
    }
    
    // Calculate ratio of distance from center on Z axis
    const zRatio = Math.abs(actualZ - element.z) / radiusZ;
    
    // Skip if we're outside the ellipsoid
    if (zRatio > 1) {
      continue;
    }
    
    // Calculate X and Y radii at this Z level using the ellipsoid equation
    // For an ellipsoid, we scale the circle based on the Z ratio
    const scaleForZ = Math.sqrt(1 - Math.pow(zRatio, 2));
    const ellipseRadiusX = radiusX * scaleForZ;
    const ellipseRadiusY = radiusY * scaleForZ;
    
    // We need to approximate the ellipse with line segments for the G-code
    // Generate points along the ellipse
    const numPoints = 36; // More points for smoother ellipse
    const points = [];
    
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      
      // Apply tool offset to the ellipse equation
      // This is a simplification - proper ellipse offsetting is complex
      const offsetRadiusX = offset === 'outside' ? ellipseRadiusX + toolDiameter / 2 : 
                           offset === 'inside' ? Math.max(0, ellipseRadiusX - toolDiameter / 2) : 
                           ellipseRadiusX;
                           
      const offsetRadiusY = offset === 'outside' ? ellipseRadiusY + toolDiameter / 2 : 
                           offset === 'inside' ? Math.max(0, ellipseRadiusY - toolDiameter / 2) : 
                           ellipseRadiusY;
      
      // Skip if any radius is too small
      if (offsetRadiusX <= 0 || offsetRadiusY <= 0) {
        continue;
      }
      
      const x = element.x + offsetRadiusX * Math.cos(angle);
      const y = element.y + offsetRadiusY * Math.sin(angle);
      
      points.push([x, y]);
    }
    
    // Skip if we couldn't generate points
    if (points.length <= 2) {
      gcode += `\n; Z Level: ${actualZ.toFixed(3)} - Offset dimensions too small, skipping\n`;
      continue;
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, X Radius: ${ellipseRadiusX.toFixed(3)}, Y Radius: ${ellipseRadiusY.toFixed(3)}\n`;
    
    // Reverse points for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the ellipse points
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Ellipse point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a capsule element
 */
function generateCapsuleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Capsule: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius || 15}mm, height ${element.height || 50}mm, direction ${element.direction || 'z'}\n`;
  
  // Get capsule properties
  const radius = element.radius || 15;
  const height = element.height || 50;
  const capsuleDirection = element.direction || 'z';
  
  // Calculate the cylinder section length (total height minus the two hemispheres)
  const cylinderLength = Math.max(0, height - 2 * radius);
  
  // Calculate the extents of the capsule
  let minX, maxX, minY, maxY, minZ, maxZ;
  
  if (capsuleDirection === 'x') {
    minX = element.x - height / 2;
    maxX = element.x + height / 2;
    minY = element.y - radius;
    maxY = element.y + radius;
    minZ = element.z - radius;
    maxZ = element.z + radius;
  } else if (capsuleDirection === 'y') {
    minX = element.x - radius;
    maxX = element.x + radius;
    minY = element.y - height / 2;
    maxY = element.y + height / 2;
    minZ = element.z - radius;
    maxZ = element.z + radius;
  } else { // z-direction
    minX = element.x - radius;
    maxX = element.x + radius;
    minY = element.y - radius;
    maxY = element.y + radius;
    minZ = element.z - height / 2;
    maxZ = element.z + height / 2;
  }
  
  // Apply offset to the radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius = Math.max(0, radius - toolDiameter / 2);
  } else if (offset === 'outside') {
    effectiveRadius = radius + toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Capsule radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level from top to bottom
  for (let z = 0; z > -Math.min(depth, maxZ - minZ); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, maxZ - minZ), z);
    const actualZ = maxZ + currentZ;
    
    // Skip if we're below the capsule
    if (actualZ < minZ) {
      continue;
    }
    
    let slice;
    
    if (capsuleDirection === 'z') {
      // For Z-direction capsule, we need to determine if we're in the hemispheres or cylinder part
      if (actualZ > element.z + cylinderLength / 2) {
        // Top hemisphere
        const distFromTop = maxZ - actualZ;
        const radiusAtZ = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(radius - distFromTop, 2)));
        slice = { type: 'circle', x: element.x, y: element.y, radius: radiusAtZ };
      } else if (actualZ < element.z - cylinderLength / 2) {
        // Bottom hemisphere
        const distFromBottom = actualZ - minZ;
        const radiusAtZ = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(radius - distFromBottom, 2)));
        slice = { type: 'circle', x: element.x, y: element.y, radius: radiusAtZ };
      } else {
        // Cylinder part
        slice = { type: 'circle', x: element.x, y: element.y, radius: radius };
      }
    } else if (capsuleDirection === 'y') {
      // For Y-direction capsule, we need to determine the slice shape based on Z position
      // This is a simplification - for exact Y-axis capsule, we would need more complex calculations
      slice = { type: 'ellipse', x: element.x, y: element.y, radiusX: radius, radiusY: height / 2 };
    } else { // x-direction
      // For X-direction capsule, we need to determine the slice shape based on Z position
      // This is a simplification - for exact X-axis capsule, we would need more complex calculations
      slice = { type: 'ellipse', x: element.x, y: element.y, radiusX: height / 2, radiusY: radius };
    }
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}, Slice type: ${slice.type}\n`;
    
    if (slice.type === 'circle') {
      // Generate circle toolpath
      const points = [];
      const numPoints = 36;
      
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = slice.x + effectiveRadius * Math.cos(angle);
        const y = slice.y + effectiveRadius * Math.sin(angle);
        points.push([x, y]);
      }
      
      // Reverse for conventional milling if needed
      if (direction === 'conventional') {
        points.reverse();
      }
      
      // Move to first point
      gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Move along the circle
      for (let i = 1; i < points.length; i++) {
        gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Circle point ${i}\n`;
      }
    } else { // ellipse
      // Generate ellipse toolpath
      const points = [];
      const numPoints = 36;
      
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = slice.x + slice.radiusX * Math.cos(angle);
        const y = slice.y + slice.radiusY * Math.sin(angle);
        points.push([x, y]);
      }
      
      // Reverse for conventional milling if needed
      if (direction === 'conventional') {
        points.reverse();
      }
      
      // Move to first point
      gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Move along the ellipse
      for (let i = 1; i < points.length; i++) {
        gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Ellipse point ${i}\n`;
      }
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a triangle element
 */
function generateTriangleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  // Check if we have array of points or individual point coordinates
  const hasPoints = element.points && Array.isArray(element.points) && element.points.length >= 3;
  const hasCoordinates = element.x1 !== undefined && element.y1 !== undefined &&
                         element.x2 !== undefined && element.y2 !== undefined &&
                         element.x3 !== undefined && element.y3 !== undefined;
  
  if (!hasPoints && !hasCoordinates) {
    return `; Triangle missing points or coordinates\n`;
  }
  
  // Determine the triangle points
  let points;
  
  if (hasPoints) {
    points = element.points.slice(0, 3);
  } else {
    points = [
      { x: element.x1, y: element.y1, z: element.z1 || element.z || 0 },
      { x: element.x2, y: element.y2, z: element.z2 || element.z || 0 },
      { x: element.x3, y: element.y3, z: element.z3 || element.z || 0 }
    ];
  }
  
  let gcode = `; Triangle: points [(${points[0].x}, ${points[0].y}), (${points[1].x}, ${points[1].y}), (${points[2].x}, ${points[2].y})]\n`;
  
  // Calculate the depth range
  const zValues = points.map((p: {x: number, y: number, z?: number}) => p.z || 0);
  const maxZ = Math.max(...zValues);
  const minZ = Math.min(...zValues);
  const triangleDepth = maxZ - minZ;
  
  // Convert points to the format expected by the rest of the code
  const trianglePoints = points.map((p: {x: number, y: number, z?: number}) => [p.x, p.y]);
  trianglePoints.push(trianglePoints[0]); // Close the loop
  
  // Apply offset if needed
  let offsetPoints = trianglePoints;
  
  if (offset !== 'center') {
    const newOffsetPoints = offsetPolygon(trianglePoints, offset === 'outside' ? toolDiameter / 2 : -toolDiameter / 2);
    
    // Check if offset was successful
    if (newOffsetPoints && newOffsetPoints.length >= 3) {
      offsetPoints = newOffsetPoints;
    } else {
      gcode += `; Could not apply offset to triangle, using original points\n`;
    }
  }
  
  // For each Z level
  for (let z = 0; z > -Math.min(depth, triangleDepth); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, triangleDepth), z);
    const actualZ = maxZ + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Make a copy of the points for this level
    let levelPoints = [...offsetPoints];
    
    // Reverse for conventional milling if needed
    if (direction === 'conventional') {
      levelPoints.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${levelPoints[0][0].toFixed(3)} Y${levelPoints[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the triangle
    for (let i = 1; i < levelPoints.length; i++) {
      gcode += `G1 X${levelPoints[i][0].toFixed(3)} Y${levelPoints[i][1].toFixed(3)} F${feedrate} ; Point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Helper function to offset a polygon by a distance
 * Positive distance offsets outward, negative offsets inward
 * This is a simplified algorithm and may not work for all polygons
 */
function offsetPolygon(points: number[][], distance: number): number[][] | null {
  // If there are not enough points, return null
  if (points.length < 3) {
    return null;
  }
  
  // Calculate the centroid of the polygon
  const centroid = calculateCentroid(points);
  
  // Create a new array for the offset points
  const offsetPoints: number[][] = [];
  
  // Process each point
  for (let i = 0; i < points.length; i++) {
    // Get the current point
    const point = points[i];
    
    // Calculate the direction from the centroid to the point
    const dx = point[0] - centroid[0];
    const dy = point[1] - centroid[1];
    
    // Calculate the length of the vector
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Skip if the point is too close to the centroid
    if (length < 0.0001) {
      continue;
    }
    
    // Calculate the unit vector
    const ux = dx / length;
    const uy = dy / length;
    
    // Calculate the offset point
    const offsetX = point[0] + ux * distance;
    const offsetY = point[1] + uy * distance;
    
    // Add the offset point
    offsetPoints.push([offsetX, offsetY]);
  }
  
  // If we don't have enough points after offsetting, return null
  if (offsetPoints.length < 3) {
    return null;
  }
  
  // Close the loop if needed
  if (offsetPoints.length > 0 && 
     (offsetPoints[0][0] !== offsetPoints[offsetPoints.length - 1][0] || 
      offsetPoints[0][1] !== offsetPoints[offsetPoints.length - 1][1])) {
    offsetPoints.push([...offsetPoints[0]]);
  }
  
  return offsetPoints;
}

/**
 * Helper function to calculate the centroid of a polygon
 */
function calculateCentroid(points: number[][]): number[] {
  let sumX = 0;
  let sumY = 0;
  
  // Skip the last point if it's the same as the first (closed loop)
  const count = points.length > 1 && 
               points[0][0] === points[points.length - 1][0] && 
               points[0][1] === points[points.length - 1][1] 
               ? points.length - 1 : points.length;
  
  for (let i = 0; i < count; i++) {
    sumX += points[i][0];
    sumY += points[i][1];
  }
  
  return [sumX / count, sumY / count];
}

/**
 * Generate toolpath for an arc element
 */
function generateArcToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Arc: center (${element.x}, ${element.y}, ${element.z}), radius ${element.radius}mm, startAngle ${element.startAngle || 0}°, endAngle ${element.endAngle || 360}°\n`;
  
  // Get arc properties
  const radius = element.radius || 25;
  const startAngle = (element.startAngle || 0) * Math.PI / 180; // Convert to radians
  const endAngle = (element.endAngle || 360) * Math.PI / 180; // Convert to radians
  const clockwise = direction === 'climb'; // Climb milling uses G3 (clockwise)
  
  // Apply offset to the radius
  let effectiveRadius = radius;
  if (offset === 'inside') {
    effectiveRadius = Math.max(0, radius - toolDiameter / 2);
  } else if (offset === 'outside') {
    effectiveRadius = radius + toolDiameter / 2;
  }
  
  // Skip if radius is too small
  if (effectiveRadius <= 0) {
    return `; Arc radius after offset too small, cannot generate toolpath\n`;
  }
  
  // For each Z level
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Calculate start and end points of the arc
    const startX = element.x + effectiveRadius * Math.cos(startAngle);
    const startY = element.y + effectiveRadius * Math.sin(startAngle);
    const endX = element.x + effectiveRadius * Math.cos(endAngle);
    const endY = element.y + effectiveRadius * Math.sin(endAngle);
    
    // Move to start point
    gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Calculate I and J values for arc
    const i = element.x - startX; // Distance from start point to center in X
    const j = element.y - startY; // Distance from start point to center in Y
    
    // If start and end angles are the same or differ by 360 degrees (full circle)
    if (Math.abs(startAngle - endAngle) < 0.001 || Math.abs(Math.abs(startAngle - endAngle) - 2 * Math.PI) < 0.001) {
      // Full circle
      if (clockwise) {
        gcode += `G3 X${startX.toFixed(3)} Y${startY.toFixed(3)} I${i.toFixed(3)} J${j.toFixed(3)} F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${startX.toFixed(3)} Y${startY.toFixed(3)} I${i.toFixed(3)} J${j.toFixed(3)} F${feedrate} ; Counter-clockwise full circle\n`;
      }
    } else {
      // Partial arc
      if (clockwise) {
        gcode += `G3 X${endX.toFixed(3)} Y${endY.toFixed(3)} I${i.toFixed(3)} J${j.toFixed(3)} F${feedrate} ; Clockwise arc\n`;
      } else {
        gcode += `G2 X${endX.toFixed(3)} Y${endY.toFixed(3)} I${i.toFixed(3)} J${j.toFixed(3)} F${feedrate} ; Counter-clockwise arc\n`;
      }
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for an ellipse element
 */
function generateEllipseToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
  
  let gcode = `; Ellipse: center (${element.x}, ${element.y}, ${element.z}), radiusX ${element.radiusX || element.width/2 || 25}mm, radiusY ${element.radiusY || element.height/2 || 15}mm\n`;
  
  // Get ellipse properties
  const radiusX = element.radiusX || element.width/2 || 25;
  const radiusY = element.radiusY || element.height/2 || 15;
  
  // We need to approximate the ellipse with line segments for the G-code
  // Generate points along the ellipse
  const numPoints = 72; // More points for smoother ellipse
  
  // For each Z level
  for (let z = 0; z > -depth; z -= stepdown) {
    const currentZ = Math.max(-depth, z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Apply tool offset to the ellipse equation (simplified approach)
    const offsetRadiusX = offset === 'outside' ? radiusX + toolDiameter / 2 : 
                         offset === 'inside' ? Math.max(0, radiusX - toolDiameter / 2) : 
                         radiusX;
                         
    const offsetRadiusY = offset === 'outside' ? radiusY + toolDiameter / 2 : 
                         offset === 'inside' ? Math.max(0, radiusY - toolDiameter / 2) : 
                         radiusY;
    
    // Skip if any radius is too small
    if (offsetRadiusX <= 0 || offsetRadiusY <= 0) {
      gcode += `; Offset dimensions too small, skipping this Z level\n`;
      continue;
    }
    
    // Generate points for ellipse
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const x = element.x + offsetRadiusX * Math.cos(angle);
      const y = element.y + offsetRadiusY * Math.sin(angle);
      points.push([x, y]);
    }
    
    // Reverse points for conventional milling if needed
    if (direction === 'conventional') {
      points.reverse();
    }
    
    // Move to first point
    gcode += `G0 X${points[0][0].toFixed(3)} Y${points[0][1].toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Move along the ellipse points
    for (let i = 1; i < points.length; i++) {
      gcode += `G1 X${points[i][0].toFixed(3)} Y${points[i][1].toFixed(3)} F${feedrate} ; Ellipse point ${i}\n`;
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a 3D text element
 */
function generateText3DToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = `; 3D Text: position (${element.x}, ${element.y}, ${element.z}), text "${element.text || ''}", height ${element.height || 10}mm, depth ${element.depth || 5}mm\n`;
  
  // This is a simplified approximation for text
  // In a real implementation, you would need to:
  // 1. Convert the text to paths/outlines
  // 2. Generate toolpaths for each character
  
  // Get text properties
  const text = element.text || '';
  const textHeight = element.height || 10;
  const textDepth = element.depth || 5;
  
  // Skip if no text
  if (!text) {
    return `; No text content provided\n`;
  }
  
  gcode += `; Note: Text toolpath is approximated - for production use, convert text to paths first\n`;
  
  // For each Z level
  for (let z = 0; z > -Math.min(depth, textDepth); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, textDepth), z);
    const actualZ = element.z + currentZ;
    
    gcode += `\n; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Approximate the text bounds
    const textWidth = text.length * textHeight * 0.6; // Rough estimate of text width
    
    // Generate a box around the text area
    const left = element.x;
    const right = element.x + textWidth;
    const top = element.y + textHeight;
    const bottom = element.y;
    
    // Simple rectangular outline for text bounds (placeholder)
    gcode += `G0 X${left.toFixed(3)} Y${bottom.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    gcode += `G1 X${right.toFixed(3)} Y${bottom.toFixed(3)} F${feedrate} ; Bottom edge\n`;
    gcode += `G1 X${right.toFixed(3)} Y${top.toFixed(3)} F${feedrate} ; Right edge\n`;
    gcode += `G1 X${left.toFixed(3)} Y${top.toFixed(3)} F${feedrate} ; Top edge\n`;
    gcode += `G1 X${left.toFixed(3)} Y${bottom.toFixed(3)} F${feedrate} ; Left edge\n`;
    
    // Add note about how text would actually be machined
    gcode += `; Note: For actual text engraving, each character would need to be converted to paths\n`;
    gcode += `; Characters would be machined individually with appropriate tool movement\n`;
  }
  
  gcode += `; For production text machining, please export text as SVG or DXF and import as paths\n`;
  
  return gcode;
}
  
  // Generate circular toolpath
  const generateCircleToolpath = () => {
    let gcode = '; Circle toolpath\n';
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction, stepover, operationType } = settings;
    
    // Calculate offset distance based on selected offset type
    let effectiveRadius = circleRadius;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      
      // For pocket operation
      if (operationType === 'pocket') {
        // Calculate number of passes based on stepover
        const stepSize = toolDiameter * (stepover / 100);
        const numSteps = Math.ceil(effectiveRadius / stepSize);
        
        gcode += `; Circular pocket operation - Stepover: ${stepover}% (${stepSize.toFixed(2)}mm)\n`;
        
        // Start from center and spiral outward
        const centerPoint = applyOriginOffset(0, 0);
        gcode += `G0 X${centerPoint.x.toFixed(3)} Y${centerPoint.y.toFixed(3)} ; Move to center\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        for (let i = 1; i <= numSteps; i++) {
          const currentRadius = i * stepSize;
          if (currentRadius > effectiveRadius) break;
          
          // Center of circle with origin offset
          const center = applyOriginOffset(0, 0);
          
          // Full circle at each step
          if (direction === 'climb') {
            gcode += `G3 X${center.x.toFixed(3)} Y${center.y.toFixed(3)} I${currentRadius.toFixed(3)} J0 F${feedrate} ; Circle at radius ${currentRadius.toFixed(3)}mm\n`;
          } else {
            gcode += `G2 X${center.x.toFixed(3)} Y${center.y.toFixed(3)} I${currentRadius.toFixed(3)} J0 F${feedrate} ; Circle at radius ${currentRadius.toFixed(3)}mm\n`;
          }
        }
      } else {
        // Standard circular contour
        // Move to start point on circle with origin offset
        const startPoint = applyOriginOffset(effectiveRadius, 0);
        const center = applyOriginOffset(0, 0);
        
        gcode += `G0 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} ; Move to start position\n`;
        gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
        
        // Full circle - calculate I and J values as offsets from current position to circle center
        const iOffset = center.x - startPoint.x;
        const jOffset = center.y - startPoint.y;
        
        if (direction === 'climb') {
          gcode += `G3 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} I${iOffset.toFixed(3)} J${jOffset.toFixed(3)} F${feedrate} ; Clockwise full circle\n`;
        } else {
          gcode += `G2 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} I${iOffset.toFixed(3)} J${jOffset.toFixed(3)} F${feedrate} ; Counter-clockwise full circle\n`;
        }
      }
    }
    
    return gcode;
  };

  
  const generateCircleFromElement = (element: any) => {
    let gcode = `; Circle: center (${element.x}, ${element.y}), radius ${element.radius}mm\n`;
    const { toolDiameter, depth, stepdown, feedrate, plungerate, offset, direction } = settings;
    
    // Calculate offset distance based on selected offset type
    let effectiveRadius = element.radius;
    if (offset === 'inside') {
      effectiveRadius -= toolDiameter / 2;
    } else if (offset === 'outside') {
      effectiveRadius += toolDiameter / 2;
    }
    
    // For each Z level
    for (let z = 0; z > -depth; z -= stepdown) {
      const currentZ = Math.max(-depth, z);
      
      gcode += `\n; Z Level: ${currentZ}\n`;
      
      // Apply origin offset to element position
      const center = applyOriginOffset(element.x, element.y);
      const startPoint = {
        x: center.x + effectiveRadius,
        y: center.y,
        z: currentZ
      };
      
      // Move to start point on circle
      gcode += `G0 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} ; Move to start position\n`;
      gcode += `G1 Z${currentZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Full circle - I and J are relative offsets from current position to center
      if (direction === 'climb') {
        gcode += `G3 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Clockwise full circle\n`;
      } else {
        gcode += `G2 X${startPoint.x.toFixed(3)} Y${startPoint.y.toFixed(3)} I${(-effectiveRadius).toFixed(3)} J0 F${feedrate} ; Counter-clockwise full circle\n`;
      }
    }
    
    return gcode;
  };


  const handleSaveToolpath = async (metadata: { name: any; description: any; drawingId: any; materialId: any; toolId: any; }) => {
    setIsSaving(true);
    setError(null);
    
    try {
      if (!metadata.drawingId) {
        throw new Error('Drawing ID is required');
      }
      const toolpathData = {
        name: metadata.name,
        description: metadata.description,
        drawingId: metadata.drawingId, // Current drawing ID
        materialId: metadata.materialId || settings.material,
        toolId: metadata.toolId || selectedLibraryTool?.id,
        data: {
          settings: { ...settings },
          gcode: currentGCode,
          elements: elements, // Include selected elements
          workpiece: workpiece // Include workpiece data
        }
      };
      
      // First verify the drawing exists and we have access
      const drawingResponse = await fetch(`/api/drawings/${metadata.drawingId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!drawingResponse.ok) {
        if (drawingResponse.status === 404) {
          throw new Error('Drawing not found');
        } else if (drawingResponse.status === 401) {
          throw new Error('Please log in to save toolpaths');
        } else if (drawingResponse.status === 403) {
          throw new Error('You do not have permission to access this drawing');
        }
        throw new Error('Failed to verify drawing access');
      }
      
      const response = await fetch('/api/toolpaths', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toolpathData),
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to save toolpaths');
        } else if (response.status === 403) {
          throw new Error('You do not have permission to save toolpaths');
        }
        throw new Error('Failed to save toolpath');
      } 
      
      const savedToolpath = await response.json();
      setSaveFeedback(`Toolpath "${metadata.name}" saved successfully!`);
      setShowSaveModal(false);
      if (savedToolpath.id) {
        toast.success(`Toolpath saved successfully`);
        router.push(`/toolpaths/${savedToolpath.id}`);
      }
      // Maybe notify parent component or refresh list
    } catch (err: any) {
      setSaveError(err || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  // Render machine section
  const renderMachineSection = () => {
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('machine')}
        >
          <h3 className="text-lg font-medium text-gray-900">Machine Type</h3>
          {expanded.machine ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.machine && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Macchina
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.machineType}
                onChange={(e) => updateSettings('machineType', e.target.value)}
              >
                <option value="mill">CNC Mill</option>
                <option value="lathe">CNC Lathe</option>
                <option value="3dprinter">3D Printer</option>
              </select>
            </div>
            
            {/* Machine-specific info */}
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-800">
                {settings.machineType === 'mill' && (
                  <>CNC Mill - Ideal for machining flat surfaces, contours, and pockets.</>
                )}
                {settings.machineType === 'lathe' && (
                  <>CNC Lathe - Ideal for cylindrical parts, shafts, and rotational components.</>
                )}
                {settings.machineType === '3dprinter' && (
                  <>3D Printer - Additive manufacturing for models and prototypes.</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };


  const renderOriginSection = () => {
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('origin')}
        >
          <h3 className="text-lg font-medium text-gray-900">Coordinate Origin</h3>
          {expanded.origin ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.origin && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Origin Type
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.originType}
                onChange={(e) => updateSettings('originType', e.target.value)}
              >
                <option value="workpiece-center">Workpiece Center</option>
                <option value="workpiece-corner">Workpiece Corner (bottom left)</option>
                <option value="workpiece-corner2">Workpiece Corner (top left)</option>
                <option value="machine-zero">Machine Zero</option>
                <option value="custom">Custom Coordinates</option>
              </select>
            </div>
            
            {settings.originType === 'custom' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    X (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.originX}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        updateSettings('originX', value);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Y (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.originY}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        updateSettings('originY', value);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Z (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.originZ}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        updateSettings('originZ', value);
                      }
                    }}
                  />
                </div>
              </div>
            )}
             <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Riferimento Visuale</h4>
            <div className="w-full h-32 relative bg-white border border-gray-300 rounded">
              {/* Semplice schema visivo dell'origine coordinate */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg width="100%" height="100%" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
                  {/* Rettangolo del pezzo */}
                  <rect x="50" y="20" width="100" height="60" fill="none" stroke="#9CA3AF" strokeWidth="1" />
                  
                  {/* Origin basata sul tipo selezionato */}
                  {settings.originType === 'workpiece-center' && (
                    <>
                      <circle cx="100" cy="50" r="4" fill="#3B82F6" />
                      <line x1="100" y1="10" x2="100" y2="90" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <line x1="20" y1="50" x2="180" y2="50" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <text x="110" y="40" fontSize="12" fill="#3B82F6">Origin</text>
                    </>
                  )}
                  
                  {settings.originType === 'workpiece-corner' && (
                    <>
                      <circle cx="50" cy="80" r="4" fill="#3B82F6" />
                      <line x1="50" y1="10" x2="50" y2="90" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <line x1="20" y1="80" x2="180" y2="80" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <text x="35" y="95" fontSize="12" fill="#3B82F6">Origin</text>
                    </>
                  )}
                  
                  {settings.originType === 'workpiece-corner2' && (
                    <>
                      <circle cx="50" cy="20" r="4" fill="#3B82F6" />
                      <line x1="50" y1="10" x2="50" y2="90" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <line x1="20" y1="20" x2="180" y2="20" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <text x="35" y="15" fontSize="12" fill="#3B82F6">Origin</text>
                    </>
                  )}
                  
                  {settings.originType === 'machine-zero' && (
                    <>
                      <circle cx="20" cy="10" r="4" fill="#3B82F6" />
                      <line x1="20" y1="10" x2="20" y2="90" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <line x1="20" y1="10" x2="180" y2="10" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4,2" />
                      <text x="10" y="25" fontSize="12" fill="#3B82F6">Zero</text>
                    </>
                  )}
                  
                  {settings.originType === 'custom' && (
                    <>
                      <circle cx={(settings.originX/2) + 100} cy={50 - (settings.originY/2)} r="4" fill="#3B82F6" />
                      <text x={(settings.originX/2) + 105} cy={45 - (settings.originY/2)} fontSize="12" fill="#3B82F6">
                        Custom
                      </text>
                    </>
                  )}
                  
                  {/* Assi */}
                  <text x="180" y="50" fontSize="10" fill="#374151">X+</text>
                  <text x="100" y="10" fontSize="10" fill="#374151">Y+</text>
                </svg>
              </div>
            </div>
          </div>
            
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-800">
                {settings.originType === 'workpiece-center' && 
                  'The toolpath will be generated using the center of the workpiece as origin (X0, Y0, Z0).'}
                {settings.originType === 'workpiece-corner' && 
                  'Il percorso verrà generato considerando l\'angolo inferiore sinistro del pezzo come origine (X0, Y0), con Z0 sulla superficie superiore.'}
                {settings.originType === 'machine-zero' && 
                  'The toolpath will be generated using machine coordinates without offset.'}
                {settings.originType === 'custom' && 
                  'Imposta coordinate personalizzate per l\'origine del percorso utensile.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render lathe specific settings
  const renderLatheSection = () => {
    if (settings.machineType !== 'lathe') return null;
    
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('lathe')}
        >
          <h3 className="text-lg font-medium text-gray-900">Lathe Parameters</h3>
          {expanded.lathe ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.lathe && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Diameter (mm)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.stockDiameter}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('stockDiameter', value);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Length (mm)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.stockLength}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('stockLength', value);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Spindle Direction
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.spindleDirection}
                onChange={(e) => updateSettings('spindleDirection', e.target.value as 'cw' | 'ccw')}
              >
                <option value="cw">Clockwise (CW)</option>
                <option value="ccw">Counterclockwise (CCW)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Turning Type
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.turningOperation}
                onChange={(e) => updateSettings('turningOperation', e.target.value as 'external' | 'internal' | 'face')}
              >
                <option value="external">External</option>
                <option value="internal">Internal</option>
                <option value="face">Face</option>
              </select>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="toolCompensation"
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                checked={settings.applyToolCompensation}
                onChange={(e) => updateSettings('applyToolCompensation', e.target.checked)}
              />
              <label htmlFor="toolCompensation" className="ml-2 block text-sm text-gray-700">
                Apply tool radius compensation
              </label>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Render 3D printer specific settings
  const render3DPrinterSection = () => {
    if (settings.machineType !== '3dprinter') return null;
    
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('printer')}
        >
          <h3 className="text-lg font-medium text-gray-900">3D Printer Parameters</h3>
          {expanded.printer ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.printer && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nozzle Diameter (mm)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.nozzleDiameter}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('nozzleDiameter', value);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filament Diameter (mm)
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.filamentDiameter}
                onChange={(e) => updateSettings('filamentDiameter', parseFloat(e.target.value))}
              >
                <option value="1.75">1.75 mm</option>
                <option value="2.85">2.85 mm</option>
                <option value="3.0">3.0 mm</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                 Layer Height (mm)
              </label>
              <input
                type="number"
                min="0.05"
                max="0.35"
                step="0.05"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.layerHeight}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('layerHeight', value);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Extrusion Width (mm)
              </label>
              <input
                type="number"
                min="0.2"
                step="0.1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.extrusionWidth}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('extrusionWidth', value);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Print Speed (mm/s)
              </label>
              <input
                type="number"
                min="10"
                max="150"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.printSpeed}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('printSpeed', value);
                  }
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Print Temperature (°C)
                </label>
                <input
                  type="number"
                  min="150"
                  max="300"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.printTemperature}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                      updateSettings('printTemperature', value);
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                Plate Temperature (°C)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.bedTemperature}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                      updateSettings('bedTemperature', value);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Update operation section to be machine specific
  const renderOperationSection = () => {
    // Ottieni descrizione dell'operazione corrente
    const operationInfo = getOperationDescription(settings.operationType);
  
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('operation')}
        >
          <h3 className="text-lg font-medium text-gray-900">Operation</h3>
          {expanded.operation ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.operation && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Operation Type
              </label>
              {settings.machineType === 'mill' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.operationType}
                  onChange={(e) => updateSettings('operationType', e.target.value)}
                >
                  <option value="contour">Contouring</option>
                  <option value="pocket">Pocket Clearing</option>
                  <option value="drill">Drilling</option>
                  <option value="engrave">Engraving</option>
                  <option value="profile">3D Profile</option>
                  <option value="threading">Threading</option>
                  <option value="3d_surface">3D Surface</option>
                </select>
              )}
              
              {settings.machineType === 'lathe' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.operationType}
                  onChange={(e) => updateSettings('operationType', e.target.value)}
                >
                  <option value="turning">Turning</option>
                  <option value="facing">Facing</option>
                  <option value="boring">Boring</option>
                  <option value="threading">Threading</option>
                  <option value="grooving">Grooving</option>
                  <option value="parting">Parting</option>
                  <option value="knurling">Knurling</option>
                </select>
              )}
              
              {settings.machineType === '3dprinter' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.operationType}
                  onChange={(e) => updateSettings('operationType', e.target.value)}
                >
                  <option value="standard">Standard Print</option>
                  <option value="vase">Vase Mode (Spiral)</option>
                  <option value="support">Support Structures</option>
                  <option value="infill">Infill</option>
                  <option value="raft">Raft Base</option>
                  <option value="brim">Brim</option>
                </select>
              )}
            </div>
            
            {/* Descrizione dell'operazione */}
            <div className="p-4 bg-blue-50 rounded-md">
              <p className="text-blue-700 text-sm">
                {operationInfo.description}
              </p>
            </div>
  
            {/* Show geometry options only for mill operations */}
            {settings.machineType === 'mill' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Geometry Type
                  </label>
                  <select
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={geometryType}
                    onChange={(e) => {
                      const newGeometryType = e.target.value as 'rectangle' | 'circle' | 'polygon' | 'custom' | 'selected' | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'extrude' | 'line' | 'pyramid' | 'hemisphere' | 'ellipsoid' | 'capsule' | 'triangle' | 'ellipse' | 'prism';
                      setGeometryType(newGeometryType);
                      
                      // Quando cambia il tipo di geometria, aggiorni lo spessore se è selezionato un elemento
                      if (newGeometryType === 'selected' && selectedElement) {
                        // Se c'è un elemento selezionato, usa la sua dimensione come spessore
                        let depth = 0;
                        
                        if (selectedElement.type === 'rectangle' || selectedElement.type === 'circle' || 
                            selectedElement.type === 'polygon') {
                          // Per elementi 2D, manteniamo lo spessore attuale
                          depth = settings.depth; 
                        } else if (selectedElement.type === 'cube') {
                          depth = selectedElement.depth || settings.depth;
                        } else if (selectedElement.type === 'cylinder') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'sphere') {
                          depth = selectedElement.radius * 2 || settings.depth;
                        } else if (selectedElement.type === 'cone') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'extrude') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'pyramid') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'hemisphere') {
                          depth = selectedElement.radius || settings.depth;
                        } else if (selectedElement.type === 'prism') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'ellipsoid') {
                          depth = selectedElement.radiusZ * 2 || selectedElement.depth || settings.depth;
                        } else if (selectedElement.type === 'capsule') {
                          depth = selectedElement.height || settings.depth;
                        } else if (selectedElement.type === 'triangle') {
                          // Per elementi 2D, manteniamo lo spessore attuale
                          depth = settings.depth;
                        } else if (selectedElement.type === 'arc') {
                          // Per elementi 2D, manteniamo lo spessore attuale
                          depth = settings.depth;
                        } else if (selectedElement.type === 'ellipse') {
                          // Per elementi 2D, manteniamo lo spessore attuale
                        }
                        
                        // Aggiorna lo spessore
                        updateSettings('depth', depth);
                      }
                    }}
                  >
                    <option value="rectangle">Rectangle</option>
                    <option value="circle">Circle</option>
                    <option value="polygon">Polygon</option>
                    <option value="selected">From Selected Element</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                
                {/* Selection state if "Da elemento selezionato" is chosen */}
                {geometryType === 'selected' && (
                  <div className={`p-3 ${selectedElement ? 'bg-green-50' : 'bg-yellow-50'} rounded-md`}>
                    {selectedElement ? (
                      <div>
                        <p className="text-sm text-green-700 font-medium mb-2">
                          Selected Element: {selectedElement.type} (ID: {selectedElement.id.substring(0, 6)}...)
                        </p>
                        
                        {/* Display element dimensions based on type */}
                        <div className="mt-2 border-t border-green-200 pt-2">
                          <p className="text-sm font-medium text-gray-700 mb-1">Element Dimensions:</p>
                          
                          {selectedElement.type === 'rectangle' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Width:</span>
                                <span className="font-medium">{selectedElement.width} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Height:</span>
                                <span className="font-medium">{selectedElement.height} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Position X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Position Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              {selectedElement.z !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Position Z:</span>
                                  <span className="font-medium">{selectedElement.z} mm</span>
                                </div>
                              )}
                              {/* Aggiungiamo il campo per lo spessore di lavorazione */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'circle' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Radius:</span>
                                <span className="font-medium">{selectedElement.radius} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Diameter:</span>
                                <span className="font-medium">{selectedElement.radius * 2} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              {selectedElement.z !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Center Z:</span>
                                  <span className="font-medium">{selectedElement.z} mm</span>
                                </div>
                              )}
                              {/* Aggiungiamo il campo per lo spessore di lavorazione */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'line' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Point 1 X:</span>
                                <span className="font-medium">{selectedElement.x1} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Point 1 Y:</span>
                                <span className="font-medium">{selectedElement.y1} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Point 2 X:</span>
                                <span className="font-medium">{selectedElement.x2} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Point 2 Y:</span>
                                <span className="font-medium">{selectedElement.y2} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Length:</span>
                                <span className="font-medium">
                                  {Math.sqrt(
                                    Math.pow(selectedElement.x2 - selectedElement.x1, 2) + 
                                    Math.pow(selectedElement.y2 - selectedElement.y1, 2)
                                  ).toFixed(2)} mm
                                </span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'polygon' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Sides:</span>
                                <span className="font-medium">{selectedElement.sides || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Radius:</span>
                                <span className="font-medium">{selectedElement.radius || 'N/A'} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'cube' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Width:</span>
                                <span className="font-medium">{selectedElement.width} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Height:</span>
                                <span className="font-medium">{selectedElement.height} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Depth:</span>
                                <span className="font-medium">{selectedElement.depth} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Z:</span>
                                <span className="font-medium">{selectedElement.z} mm</span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione evidenziando che corrisponde alla profondità */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'sphere' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Radius:</span>
                                <span className="font-medium">{selectedElement.radius} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Diameter:</span>
                                <span className="font-medium">{selectedElement.radius * 2} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Z:</span>
                                <span className="font-medium">{selectedElement.z} mm</span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione evidenziando che corrisponde al diametro */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'cylinder' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Radius:</span>
                                <span className="font-medium">{selectedElement.radius} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Diameter:</span>
                                <span className="font-medium">{selectedElement.radius * 2} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Height:</span>
                                <span className="font-medium">{selectedElement.height} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Z:</span>
                                <span className="font-medium">{selectedElement.z} mm</span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione evidenziando che corrisponde all'altezza */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {selectedElement.type === 'cone' && (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base Radius:</span>
                                <span className="font-medium">{selectedElement.radius} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Height:</span>
                                <span className="font-medium">{selectedElement.height} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center X:</span>
                                <span className="font-medium">{selectedElement.x} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Y:</span>
                                <span className="font-medium">{selectedElement.y} mm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Center Z:</span>
                                <span className="font-medium">{selectedElement.z} mm</span>
                              </div>
                              {/* Aggiungiamo il campo per lo spessore di lavorazione evidenziando che corrisponde all'altezza */}
                              <div className="flex justify-between col-span-2 mt-2 border-t border-green-200 pt-2">
                                <span className="text-gray-600 font-medium">Machining Depth:</span>
                                <span className="font-medium text-blue-600">{settings.depth} mm</span>
                              </div>
                            </div>
                          )}
                          
                          {(selectedElement.type !== 'rectangle' && 
                            selectedElement.type !== 'circle' && 
                            selectedElement.type !== 'line' && 
                            selectedElement.type !== 'polygon' &&
                            selectedElement.type !== 'cube' &&
                            selectedElement.type !== 'sphere' &&
                            selectedElement.type !== 'cylinder' &&
                            selectedElement.type !== 'cone') && (
                            <div className="text-sm text-gray-600">
                              Details available for this element in the CAD Editor.
                            </div>
                          )}
                        </div>
                        
                        {/* Aggiungiamo un input per modificare lo spessore direttamente */}
                        <div className="mt-3 p-2 bg-blue-50 rounded-md">
                          <label className="block text-sm font-medium text-blue-700 mb-1">
                            Machining Depth (mm)
                          </label>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            className="w-full p-2 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={settings.depth}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (!isNaN(value) && value > 0) {
                                updateSettings('depth', value);
                              }
                            }}
                          />
                        </div>
                        
                        {/* Button to use these dimensions */}
                        <div className="mt-3 flex justify-between">
                          <button
                            type="button"
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={() => {
                              // Use the selected element dimensions based on type
                              if (selectedElement.type === 'rectangle') {
                                setRectangleWidth(selectedElement.width);
                                setRectangleHeight(selectedElement.height);
                              } else if (selectedElement.type === 'circle') {
                                setCircleRadius(selectedElement.radius);
                              } else if (selectedElement.type === 'polygon' && selectedElement.sides && selectedElement.radius) {
                                setPolygonSides(selectedElement.sides);
                                setPolygonRadius(selectedElement.radius);
                              }
                              
                              // Show success message
                              setSuccess('Dimensions applied from CAD');
                              if (successTimerRef.current) {
                                clearTimeout(successTimerRef.current);
                              }
                              successTimerRef.current = setTimeout(() => {
                                setSuccess(null);
                              }, 3000);
                            }}
                          >
                            Use XY Dimensions
                          </button>
                          
                          {/* Aggiungiamo un pulsante specifico per usare lo spessore dalla geometria 3D */}
                          {(selectedElement.type === 'cube' || 
                            selectedElement.type === 'sphere' || 
                            selectedElement.type === 'cylinder' || 
                            selectedElement.type === 'cone') && (
                            <button
                              type="button"
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                              onClick={() => {
                                // Imposta lo spessore in base al tipo di geometria 3D
                                if (selectedElement.type === 'cube') {
                                  updateSettings('depth', selectedElement.depth);
                                } else if (selectedElement.type === 'sphere') {
                                  updateSettings('depth', selectedElement.radius * 2);
                                } else if (selectedElement.type === 'cylinder') {
                                  updateSettings('depth', selectedElement.height);
                                } else if (selectedElement.type === 'cone') {
                                  updateSettings('depth', selectedElement.height);
                                }
                                
                                // Show success message
                                setSuccess('Depth updated from 3D geometry');
                                if (successTimerRef.current) {
                                  clearTimeout(successTimerRef.current);
                                }
                                successTimerRef.current = setTimeout(() => {
                                  setSuccess(null);
                                }, 3000);
                              }}
                            >
                              Use 3D Depth
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-yellow-700">
                        No element selected. Select an element in the CAD Editor.
                      </p>
                    )}
                  </div>
                )}
                
                {/* Geometry specific settings */}
                {geometryType === 'rectangle' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Width (mm)(X)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={rectangleWidth}
                          onChange={(e) => updateNumericValue(e, setRectangleWidth)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Height (mm)(Y)
                        </label>
                        <input
                          type="number"
                          min="1"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={rectangleHeight}
                          onChange={(e) => updateNumericValue(e, setRectangleHeight)}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Thickness (mm)(Z)
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={settings.depth}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value) && value > 0) {
                              updateSettings('depth', value);
                            }
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Geometry Preview - Stilizzata come nell'immagine richiesta */}
                    <div className="border border-gray-200 rounded-md p-4 bg-white">
                      <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">Geometry Preview</h4>
                      <div className="w-full h-64 relative">
                        <svg width="100%" height="100%" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
                          {/* Griglia leggera */}
                          {Array.from({length: 21}).map((_, i) => (
                            <line 
                              key={`grid-v-${i}`} 
                              x1={50 + i * 15} 
                              y1="30" 
                              x2={50 + i * 15} 
                              y2="270" 
                              stroke="#F3F4F6" 
                              strokeWidth="1" 
                            />
                          ))}
                          {Array.from({length: 17}).map((_, i) => (
                            <line 
                              key={`grid-h-${i}`} 
                              x1="50" 
                              y1={30 + i * 15} 
                              x2="350" 
                              y2={30 + i * 15} 
                              stroke="#F3F4F6" 
                              strokeWidth="1" 
                            />
                          ))}
                          
                          {/* Assi principali */}
                          <line x1="50" y1="150" x2="350" y2="150" stroke="#E5E7EB" strokeWidth="1" />
                          <line x1="200" y1="30" x2="200" y2="270" stroke="#E5E7EB" strokeWidth="1" />
                          
                          {/* Etichette degli assi */}
                          <text x="345" y="165" fontSize="14" fill="#9CA3AF">X</text>
                          <text x="210" y="40" fontSize="14" fill="#9CA3AF">Y</text>
                        
                        {/* Rettangolo più visibile e blu */}
                        <rect 
                          x={200 - (rectangleWidth / 2)} 
                          y={150 - (rectangleHeight / 2)} 
                          width={rectangleWidth} 
                          height={rectangleHeight} 
                          fill="none" 
                          stroke="#4F83ED" 
                          strokeWidth="2" 
                        />
                        
                        {/* Indicazione dello spessore */}
                        <text 
                          x={200} 
                          y={150 + (rectangleHeight / 2) + 20} 
                          fontSize="12" 
                          fill="#4F83ED"
                          textAnchor="middle"
                        >
                          Depth: {settings.depth}mm
                        </text>
                        
                        {/* Origin al centro */}
                        <circle cx="200" cy="150" r="5" fill="#EF4444" />
                        <text x="210" y="160" fontSize="12" fontWeight="500" fill="#EF4444">Origin</text>
                      </svg>
                    </div>
                  </div>
                </>
              )}
              
              {geometryType === 'circle' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Radius (mm)
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={circleRadius}
                        onChange={(e) => updateNumericValue(e, setCircleRadius)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Thickness (mm)(Z)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={settings.depth}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value > 0) {
                            updateSettings('depth', value);
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Geometry Preview Cerchio - Stilizzata come nell'immagine richiesta */}
                  <div className="border border-gray-200 rounded-md p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">Geometry Preview</h4>
                    <div className="w-full h-64 relative"> 
                      <svg width="100%" height="100%" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
                        {/* Griglia leggera */}
                        {Array.from({length: 21}).map((_, i) => (
                          <line 
                            key={`grid-v-${i}`} 
                            x1={50 + i * 15} 
                            y1="30" 
                            x2={50 + i * 15} 
                            y2="270" 
                            stroke="#F3F4F6" 
                            strokeWidth="1" 
                          />
                        ))}
                        {Array.from({length: 17}).map((_, i) => (
                          <line 
                            key={`grid-h-${i}`} 
                            x1="50" 
                            y1={30 + i * 15} 
                            x2="350" 
                            y2={30 + i * 15} 
                            stroke="#F3F4F6" 
                            strokeWidth="1" 
                          />
                        ))}
                        
                        {/* Assi principali */}
                        <line x1="50" y1="150" x2="350" y2="150" stroke="#E5E7EB" strokeWidth="1" />
                        <line x1="200" y1="30" x2="200" y2="270" stroke="#E5E7EB" strokeWidth="1" />
                        
                        {/* Etichette degli assi */}
                        <text x="345" y="165" fontSize="14" fill="#9CA3AF">X</text>
                        <text x="210" y="40" fontSize="14" fill="#9CA3AF">Y</text>
                        
                        {/* Cerchio */}
                        <circle 
                          cx="200" 
                          cy="150" 
                          r={circleRadius} 
                          fill="none" 
                          stroke="#4F83ED" 
                          strokeWidth="2" 
                        />
                        
                        {/* Indicazione dello spessore */}
                        <text 
                          x={200} 
                          y={150 + circleRadius + 20} 
                          fontSize="12" 
                          fill="#4F83ED"
                          textAnchor="middle"
                        >
                          Depth: {settings.depth}mm
                        </text>
                        
                        {/* Origin al centro */}
                        <circle cx="200" cy="150" r="5" fill="#EF4444" />
                        <text x="210" y="160" fontSize="12" fontWeight="500" fill="#EF4444">Origin</text>
                      </svg>
                    </div>
                  </div>
                </>
              )}
              
              {geometryType === 'polygon' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Numero Lati
                      </label>
                      <input
                        type="number"
                        min="3"
                        max="20"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={polygonSides}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value >= 3) {
                            setPolygonSides(value);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Raggio (mm)
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={polygonRadius}
                        onChange={(e) => updateNumericValue(e, setPolygonRadius)}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Thickness (mm)(Z)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={settings.depth}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value > 0) {
                            updateSettings('depth', value);
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Geometry Preview Poligono - Stilizzata come nell'immagine richiesta */}
                  <div className="border border-gray-200 rounded-md p-4 bg-white">
                    <h4 className="text-sm font-medium text-gray-700 mb-4 text-center">Geometry Preview</h4>
                    <div className="w-full h-64 relative">
                      <svg width="100%" height="100%" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
                        {/* Griglia leggera */}
                        {Array.from({length: 21}).map((_, i) => (
                          <line 
                            key={`grid-v-${i}`} 
                            x1={50 + i * 15} 
                            y1="30" 
                            x2={50 + i * 15} 
                            y2="270" 
                            stroke="#F3F4F6" 
                            strokeWidth="1" 
                          />
                        ))}
                        {Array.from({length: 17}).map((_, i) => (
                          <line 
                            key={`grid-h-${i}`} 
                            x1="50" 
                            y1={30 + i * 15} 
                            x2="350" 
                            y2={30 + i * 15} 
                            stroke="#F3F4F6" 
                            strokeWidth="1" 
                          />
                        ))}
                        
                        {/* Assi principali */}
                        <line x1="50" y1="150" x2="350" y2="150" stroke="#E5E7EB" strokeWidth="1" />
                        <line x1="200" y1="30" x2="200" y2="270" stroke="#E5E7EB" strokeWidth="1" />
                        
                        {/* Etichette degli assi */}
                        <text x="345" y="165" fontSize="14" fill="#9CA3AF">X</text>
                        <text x="210" y="40" fontSize="14" fill="#9CA3AF">Y</text>
                        
                        {/* Poligono */}
                        <polygon 
                          points={Array.from({length: polygonSides}).map((_, i) => {
                            const angle = i * (2 * Math.PI / polygonSides);
                            const x = 200 + polygonRadius * Math.cos(angle);
                            const y = 150 + polygonRadius * Math.sin(angle);
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none" 
                          stroke="#4F83ED" 
                          strokeWidth="2" 
                        />
                        
                        {/* Indicazione dello spessore */}
                        <text 
                          x={200} 
                          y={150 + polygonRadius + 20} 
                          fontSize="12" 
                          fill="#4F83ED"
                          textAnchor="middle"
                        >
                          Spessore: {settings.depth}mm
                        </text>
                        
                        {/* Origin al centro */}
                        <circle cx="200" cy="150" r="5" fill="#EF4444" />
                        <text x="210" y="160" fontSize="12" fontWeight="500" fill="#EF4444">Origin</text>
                      </svg>
                    </div>
                  </div>
                </>
              )}
              
              {geometryType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    G-code Custom
                  </label>
                  <div className="relative">
                    <textarea
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm h-32"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      placeholder="Inserisci G-code personalizzato qui..."
                    />
                    {settings.useAI && !isAIProcessing && (
                      <button
                        type="button"
                        className="absolute top-2 right-2 p-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        title="Genera G-code con AI"
                        onClick={() => {
                          // Simulate AI G-code generation
                          setIsAIProcessing(true);
                          setTimeout(() => {
                            setCustomPath(
                              `; G-code generato automaticamente da AI\n` +
                              `G0 Z10 ; Posizione sicura\n` +
                              `G0 X0 Y0 ; Posizione iniziale\n` +
                              `G1 Z-${settings.depth/2} F${settings.plungerate} ; Prima profondità\n` +
                              `G1 X10 Y10 F${settings.feedrate} ; Movimento lineare\n` +
                              `G2 X20 Y0 I0 J-10 F${settings.feedrate} ; Arco in senso orario\n` +
                              `G1 X0 Y0 F${settings.feedrate} ; Ritorno all'origine\n` +
                              `G0 Z10 ; Posizione sicura\n`
                            );
                            setIsAIProcessing(false);
                          }, 2000);
                        }}
                      >
                        <Cpu size={16} />
                      </button>
                    )}
                    {isAIProcessing && (
                      <div className="absolute top-2 right-2 p-1">
                        <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div className="flex justify-start">
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:text-blue-800"
                        onClick={() => {
                          const sampleCode = 
                            `; Esempio di G-code\n` +
                            `G0 Z5 ; Posizione sicura\n` +
                            `G0 X0 Y0 ; Vai all'origine\n` +
                            `G1 Z-1 F100 ; Scendi a profondità 1mm\n` +
                            `G1 X10 Y0 F200 ; Muovi a X=10mm\n` +
                            `G1 X10 Y10 F200 ; Muovi a Y=10mm\n` +
                            `G1 X0 Y10 F200 ; Muovi a X=0mm\n` +
                            `G1 X0 Y0 F200 ; Torna all'origine\n` +
                            `G0 Z5 ; Torna a posizione sicura\n`;
                          setCustomPath(sampleCode);
                        }}
                      >
                        Inserisci esempio
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Thickness (mm)(Z)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        value={settings.depth}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value > 0) {
                            updateSettings('depth', value);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
  // Render material section
  const renderMaterialSection = () => {
    return (
      <div className="mb-6 text-xs">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('material')}
        >
          <h3 className="text-lg font-medium text-gray-900">Material</h3>
          {expanded.material ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.material && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material Type
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.material}
                onChange={(e) => updateSettings('material', e.target.value)}
              >
                <option value="aluminum">Aluminum</option>
                <option value="steel">Steel</option>
                <option value="wood">Wood</option>
                <option value="plastic">Plastic</option>
                <option value="brass">Brass</option>
                <option value="titanium">Titanium</option>
                <option value="composite">Composite</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            {/* Material property preview */}
            {settings.material && materialProperties[settings.material] && (
              <div className="p-3 bg-blue-50 rounded-md">
                <h4 className="text-xs font-medium text-blue-800 mb-2">
                  {settings.material === 'aluminum' 
                    ? 'Aluminum' 
                    : settings.material === 'steel' 
                    ? 'Steel' 
                    : settings.material === 'wood' 
                    ? 'Wood' 
                    : settings.material === 'plastic' 
                    ? 'Plastic' 
                    : settings.material === 'brass' 
                    ? 'Brass' 
                    : settings.material === 'titanium' 
                    ? 'Titanium' 
                    : settings.material === 'composite' 
                    ? 'Composite' 
                    : 'Other'} Properties
                </h4>
                <div className="grid gap-x-4 gap-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Density:</span>
                    <span className="font-medium text-blue-700">{materialProperties[settings.material].density}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Hardness:</span>
                    <span className="font-medium text-blue-700">{materialProperties[settings.material].hardness}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Thermal Behavior:</span>
                    <span className="font-medium text-blue-700">{materialProperties[settings.material].thermalBehavior}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Chip Type:</span>
                    <span className="font-medium text-blue-700">{materialProperties[settings.material].chipType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Coolant:</span>
                    <span className="font-medium text-blue-700">{materialProperties[settings.material].coolant}</span>
                  </div>
                  {materialProperties[settings.material].recommendedToolCoating && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tool Coating:</span>
                      <span className="font-medium text-blue-700">{materialProperties[settings.material].recommendedToolCoating}</span>
                    </div>
                  )}
                </div>
                
                {/* Apply recommended parameters button */}
                <button
                  type="button"
                  className="mt-3 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                  onClick={() => {
                    // Apply recommended parameters based on material
                    if (materialProperties[settings.material].feedrateModifier && 
                        materialProperties[settings.material].speedModifier) {
                      const baseFeedrate = 1000;  // Base value
                      const baseRPM = 10000;      // Base value
                      
                      setSettings(prev => ({
                        ...prev,
                        feedrate: Math.round(baseFeedrate * materialProperties[settings.material].feedrateModifier!),
                        plungerate: Math.round((baseFeedrate * materialProperties[settings.material].feedrateModifier! * 0.4)),
                        rpm: Math.round(baseRPM * materialProperties[settings.material].speedModifier!),
                        coolant: materialProperties[settings.material].coolant === 'Necessario' || 
                                materialProperties[settings.material].coolant === 'Raccomandato' || 
                                materialProperties[settings.material].coolant === 'Necessario ad alta pressione'
                      }));
                      
                      setSuccess(`Parameters optimized for ${settings.material}`);
                      successTimerRef.current = setTimeout(() => {
                        setSuccess(null);
                      }, 3000);
                    }
                  }}
                >
                  Apply recommended parameters
                </button>
              </div>
            )}
            
            {/* Show workpiece info but don't override depth */}
            {workpiece && (
              <div className="mt-2 p-3 bg-blue-50 rounded-md">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-800">Workpiece Information</span>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:text-blue-800"
                    onClick={() => {
                      // Show only a message that informs the user to set the depth in the Operations section
                      setSuccess('Workpiece thickness is determined by the geometry selected in the Operations section');
                      successTimerRef.current = setTimeout(() => {
                        setSuccess(null);
                      }, 4000);
                    }}
                  >
                    Info
                  </button>
                </div>
                <div className="mt-1 text-xs text-blue-600">
                  {workpiece.width} x {workpiece.height} x {workpiece.depth} mm ({workpiece.material})
                </div>
                <div className="mt-1 text-xs text-gray-500 italic">
                  Note: Workpiece thickness is determined by the geometry selected
                </div>
              </div>
            )}
            
            {/* Library materials dropdown - new section */}
            <div className="mt-2 flex flex-col pt-2 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select from Materials Library
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => {
                  const materialId = e.target.value;
                  if (materialId) {
                    // Check if it's from predefined materials
                    const material = predefinedMaterials.find(m => m.name === materialId);
                    
                    // Check if it's from user/API materials
                    const userMaterial = userMaterials.find(m => m.id === materialId);
                    
                    // Process the selected material from either source
                    if (material) {
                      // Map library material to our material types
                      let materialType: MaterialType = 'other';
                      
                      if (material.name.toLowerCase().includes('aluminum')) materialType = 'aluminum';
                      else if (material.name.toLowerCase().includes('steel')) materialType = 'steel';
                      else if (material.name.toLowerCase().includes('wood')) materialType = 'wood';
                      else if (material.name.toLowerCase().includes('plastic')) materialType = 'plastic';
                      else if (material.name.toLowerCase().includes('brass')) materialType = 'brass';
                      else if (material.name.toLowerCase().includes('titanium')) materialType = 'titanium';
                      
                      setSettings(prev => ({
                        ...prev,
                        material: materialType
                      }));
                      
                      setSuccess(`Material "${material.name}" loaded from library`);
                      successTimerRef.current = setTimeout(() => {
                        setSuccess(null);
                      }, 3000);
                    } else if (userMaterial) {
                      // Map user material to our material types
                      let materialType: MaterialType = 'other';
                      
                      const materialName = userMaterial.name.toLowerCase();
                      if (materialName.includes('aluminum')) materialType = 'aluminum';
                      else if (materialName.includes('steel')) materialType = 'steel';
                      else if (materialName.includes('wood')) materialType = 'wood';
                      else if (materialName.includes('plastic')) materialType = 'plastic';
                      else if (materialName.includes('brass')) materialType = 'brass';
                      else if (materialName.includes('titanium')) materialType = 'titanium';
                      
                      setSettings(prev => ({
                        ...prev,
                        material: materialType
                      }));
                      
                      setSuccess(`Material "${userMaterial.name}" loaded from library`);
                      successTimerRef.current = setTimeout(() => {
                        setSuccess(null);
                      }, 3000);
                    }
                  }
                }}
              >
                <option value="">Select a material</option>
                
                {/* Predefined Materials Section */}
                <optgroup label="Predefined Materials">
                  {predefinedMaterials.map((material, idx) => (
                    <option key={`predefined-${material.name || `material-${idx}`}`} value={material.name}>
                      {material.name}
                    </option>
                  ))}
                </optgroup>
                
                {/* User/Local Materials Section */}
                {userMaterials.length > 0 && (
                  <optgroup label="Local Materials">
                    {userMaterials.map((material) => (
                      <option key={`user-${material.id}`} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Update tool section to be machine specific
  const renderToolSection = () => {
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('tool')}
        >
          <h3 className="text-lg font-medium text-gray-900">Tool</h3>
          {expanded.tool ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.tool && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tool Type
              </label>
              
              {settings.machineType === 'mill' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.toolType}
                  onChange={(e) => updateSettings('toolType', e.target.value)}
                >
                  <option value="endmill">Endmill</option>
                  <option value="ballnose">Ballnose</option>
                  <option value="drill">Drill</option>
                  <option value="vbit">V-bit</option>
                  <option value="chamfer">Chamfer</option>
                  <option value="threadmill">Threadmill</option>
                  <option value="reamer">Reamer</option>
                </select>
              )}
              
              {settings.machineType === 'lathe' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.toolType}
                  onChange={(e) => updateSettings('toolType', e.target.value)}
                >
                  <option value="turning">Turning</option>
                  <option value="facing">Facing</option>
                  <option value="boring">Boring</option>
                  <option value="threading">Threading</option>
                  <option value="grooving">Grooving</option>
                  <option value="parting">Parting</option>
                </select>
              )}
              
              {settings.machineType === '3dprinter' && (
                <select
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.toolType}
                  onChange={(e) => updateSettings('toolType', e.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="brass">Brass</option>
                  <option value="hardened">Hardened</option>
                  <option value="ruby">Ruby</option>
                </select>
              )}
            </div>
            <div className="p-3 bg-gray-50 rounded-md">
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                {settings.machineType === 'mill' ? 
                  (settings.toolType === 'endmill' ? 'Endmill' : 
                   settings.toolType === 'ballnose' ? 'Ballnose' : 
                  
                   settings.toolType === 'drill' ? 'Drill' : 
                   settings.toolType === 'vbit' ? 'V-bit' : 
                    'Special tool') : 
                  settings.machineType === 'lathe' ? 
                  (settings.toolType === 'turning' ? 'Turning' : 
                   settings.toolType === 'facing' ? 'Facing' : 
                   settings.toolType === 'boring' ? 'Boring' : 
                   'Threadmill') : 
                  '3D printer tool'
                }
              </h4>
              <div className="text-xs text-gray-500">
                {selectedLibraryTool ? 
                  `${selectedLibraryTool.name || 'Custom tool'}` : 
                  'Generic tool'
                }
              </div>
            </div>
            <div className="flex items-center">
              <div className="w-20 h-20 mr-4 bg-white rounded-md border border-gray-200 flex items-center justify-center">
                {/* SVG dell'utensile in base al tipo */}
                <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
                  {settings.machineType === 'mill' && settings.toolType === 'endmill' && (
                    <g>
                      <rect x="15" y="5" width="10" height="30" fill="#9CA3AF" />
                      <rect x="17" y="5" width="6" height="30" fill="#D1D5DB" />
                      <rect x="15" y="3" width="10" height="2" fill="#6B7280" />
                    </g>
                  )}
                  
                  {settings.machineType === 'mill' && settings.toolType === 'ballnose' && (
                    <g>
                      <rect x="15" y="5" width="10" height="25" fill="#9CA3AF" />
                      <rect x="17" y="5" width="6" height="25" fill="#D1D5DB" />
                      <ellipse cx="20" cy="30" rx="5" ry="5" fill="#9CA3AF" />
                      <rect x="15" y="3" width="10" height="2" fill="#6B7280" />
                    </g>
                  )}
                  
                  {settings.machineType === 'mill' && settings.toolType === 'drill' && (
                    <g>
                      <rect x="15" y="5" width="10" height="25" fill="#9CA3AF" />
                      <rect x="17" y="5" width="6" height="25" fill="#D1D5DB" />
                      <polygon points="20,35 15,30 25,30" fill="#9CA3AF" />
                      <rect x="15" y="3" width="10" height="2" fill="#6B7280" />
                    </g>
                  )}
                  
                  {settings.machineType === 'lathe' && (
                    <g>
                      <rect x="10" y="15" width="20" height="10" fill="#9CA3AF" />
                      <polygon points="30,15 35,10 35,20 30,25" fill="#6B7280" />
                      <rect x="8" y="15" width="2" height="10" fill="#4B5563" />
                    </g>
                  )}
                  
                  {settings.machineType === '3dprinter' && (
                    <g>
                      <rect x="15" y="5" width="10" height="15" fill="#9CA3AF" />
                      <polygon points="25,20 15,20 18,35 22,35" fill="#6B7280" />
                      <circle cx="20" cy="35" r="1" fill="#4B5563" />
                    </g>
                  )}
                </svg>
              </div>
              <div className="flex-1">
                <table className="w-full text-xs">
                  <tbody>
                    {settings.machineType !== '3dprinter' && (
                      <>
                        <tr>
                          <td className="py-1 text-gray-500">Diameter:</td>
                          <td className="py-1 text-gray-800">{settings.toolDiameter} mm</td>
                        </tr>
                        <tr>
                          <td className="py-1 text-gray-500">Flutes:</td>
                          <td className="py-1 text-gray-800">{settings.flutes}</td>
                        </tr>
                      </>
                    )}
                    {settings.machineType === '3dprinter' && (
                      <>
                        <tr>
                          <td className="py-1 text-gray-500">Nozzle Diameter:</td>
                          <td className="py-1 text-gray-800">{settings.nozzleDiameter} mm</td>
                        </tr>
                        <tr>
                          <td className="py-1 text-gray-500">Filament Diameter:</td>
                          <td className="py-1 text-gray-800">{settings.filamentDiameter} mm</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td className="py-1 text-gray-500">Max Speed:</td>
                      <td className="py-1 text-gray-800">{settings.rpm} RPM</td>
                    </tr>
                    {selectedLibraryTool && selectedLibraryTool.material && (
                      <tr>
                        <td className="py-1 text-gray-500">Material:</td>
                        <td className="py-1 text-gray-800">{selectedLibraryTool.material}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
            
            
            {settings.machineType !== '3dprinter' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tool Diameter (mm)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.toolDiameter}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value > 0) {
                        updateSettings('toolDiameter', value);
                      }
                    }}
                  />
                </div>
                
                {settings.machineType === 'mill' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Numero di Taglienti
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={settings.flutes}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value > 0) {
                          updateSettings('flutes', value);
                        }
                      }}
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Velocità Rotazione (RPM)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.rpm}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value > 0) {
                        updateSettings('rpm', value);
                      }
                    }}
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="coolant"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.coolant}
                    onChange={(e) => updateSettings('coolant', e.target.checked)}
                  />
                  <label htmlFor="coolant" className="ml-2 block text-sm text-gray-700">
                    Attiva Refrigerante
                  </label>
                </div>
              </>
            )}
            
            {/* Library tools dropdown - new section */}
            <div className="mt-2 flex flex-col pt-2 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seleziona da Libreria
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => {
                  const toolId = e.target.value;
                  if (toolId) {
                    // Check if it's from predefined tools
                    const tool = predefinedTools.find(t => t.name === toolId);
                    
                    // Check if it's from user/API tools
                    const userTool = userTools.find(t => t.id === toolId);
                    
                    // Set the selected tool from either source
                    if (tool) {
                      setSelectedLibraryTool(tool);
                    } else if (userTool) {
                      setSelectedLibraryTool(userTool);
                    }
                  }
                }}
                value={selectedLibraryTool?.id || selectedLibraryTool?.name || ''}
              >
                <option value="">Seleziona un utensile</option>
                
                {/* Predefined Tools Section */}
                <optgroup label="Utensili Predefiniti">
                  {predefinedTools 
                    .filter(tool => {
                      // Filter tools by machine type
                      if (settings.machineType === 'mill') {
                        return ['endmill', 'ballnose', 'drill', 'vbit', 'chamfer', 'threadmill', 'reamer'].includes(tool.type);
                      } else if (settings.machineType === 'lathe') {
                        return ['turning', 'facing', 'boring', 'threading', 'grooving', 'parting'].includes(tool.type);
                      } else {
                        return true; // Show all for 3D printer
                      }
                    })
                    .map((tool, idx) => (
                      <option key={`predefined-${tool.name || `tool-${idx}`}`} value={tool.name}>
                        {tool.name} - {tool.type} {tool.diameter}mm
                      </option>
                    ))}
                </optgroup>
                
                {/* User/Local Tools Section */}
                {userTools.length > 0 && (
                  <optgroup label="Utensili Locali">
                    {userTools
                      .filter(tool => {
                        // Filter tools by machine type
                        if (settings.machineType === 'mill') {
                          return ['endmill', 'ballnose', 'drill', 'vbit', 'chamfer', 'threadmill', 'reamer'].includes(tool.type);
                        } else if (settings.machineType === 'lathe') {
                          return ['turning', 'facing', 'boring', 'threading', 'grooving', 'parting'].includes(tool.type);
                        } else {
                          return true; // Show all for 3D printer
                        }
                      })
                      .map((tool) => (
                        <option key={`user-${tool.id}`} value={tool.id}>
                          {tool.name} - {tool.type} {tool.properties.diameter}mm
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
            
            {/* Tool library management */}
            <div className="mt-2 flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">Upload dalla libreria</span>
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                onClick={() => {
                  // Simulate loading a tool from library
                  if (settings.machineType === 'mill') {
                    setSettings(prev => ({
                      ...prev,
                      toolType: 'endmill',
                      toolDiameter: 6,
                      flutes: 4,
                      rpm: 12000
                    }));
                  } else if (settings.machineType === 'lathe') {
                    setSettings(prev => ({
                      ...prev,
                      toolType: 'turning',
                      toolDiameter: 12,
                      rpm: 1500
                    }));
                  } else {
                    setSettings(prev => ({
                      ...prev,
                      toolType: 'standard',
                      nozzleDiameter: 0.4
                    }));
                  }
                  setSuccess('Utensile caricato dalla libreria!');
                  successTimerRef.current = setTimeout(() => {
                    setSuccess(null);
                  }, 3000);
                }}
              >
                <Upload size={14} className="mr-1" /> Upload
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };


  const renderFixedCyclesSection = () => {
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('fixedCycles')}
        >
          <h3 className="text-lg font-medium text-gray-900">Cicli Fissi</h3>
          {expanded.fixedCycles ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.fixedCycles && (
          <div className="mt-3 space-y-4">
            <ToolpathGeneratorIntegration
              currentGCode={currentGCode}
              onGCodeGenerated={handleFixedCycleGCode}
              options={{
                defaultCycleType: FixedCycleType.DRILLING,
                includeFixedCycles: true,
                showFixedCyclesPanel: true
              }}
            />
            
            {detectedCycles.length > 0 && (
  <div className="mt-4 p-3 bg-blue-50 rounded-md">
    <h4 className="text-sm font-medium text-blue-800 mb-2">
      Cicli Fissi Rilevati ({detectedCycles.length})
    </h4>
    <div className="space-y-2">
      {detectedCycles.map((cycle, index) => (
        <div 
          key={`cycle-${index}`}
          className="p-2 bg-white rounded border border-blue-200 cursor-pointer hover:bg-blue-50"
          onClick={() => setSelectedCycle(cycle)}
        >
          <div className="text-xs font-mono">{cycle.gcode}</div>
        </div>
      ))}
    </div>
  </div>
)}

{selectedCycle && (
  <div className="mt-4">
    <h4 className="text-sm font-medium text-gray-800 mb-2">Modifica Ciclo Fisso</h4>
    <FixedCyclesUIRenderer
      gCodeLine={selectedCycle.gcode}
      onParametersChange={(params) => {
        console.log('Parametri aggiornati:', params);
      }}
      onApply={handleFixedCycleGCode}
    />
  </div>
)}
<div className="mb-4 flex justify-between">
  <button
    type="button"
    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    onClick={() => {
      // Crea un ciclo fisso di esempio basato sull'elemento selezionato
      if (selectedElement) {
        const x = selectedElement.x || 0;
        const y = selectedElement.y || 0;
        const z = -settings.depth;
        const r = 2; // Piano di riferimento predefinito
        
        const newCycle = `G81 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} R${r.toFixed(3)} F${settings.feedrate} ; Drilling cycle`;
        handleFixedCycleGCode(newCycle);
      } else {
        setError('Seleziona un elemento prima di creare un ciclo fisso');
        setTimeout(() => setError(null), 3000);
      }
    }}
  >
    Crea Ciclo Fisso
  </button>
  
  {detectedCycles.length > 0 && (
    <button
      type="button"
      className="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
      onClick={() => {
        // Rimuovi tutti i cicli fissi dal G-code
        const lines = currentGCode.split('\n');
        const newLines = lines.filter(line => !isFixedCycle(line) && !line.includes('G80'));
        setCurrentGCode(newLines.join('\n'));
        setDetectedCycles([]);
        if (onGCodeGenerated) {
          onGCodeGenerated(newLines.join('\n'));
        }
      }}
    >
      Rimuovi Tutti i Cicli
    </button>
  )}
</div>
          </div>
        )}
      </div>
    );
  };

  // Render cutting parameters section
  const renderCuttingSection = () => {
    // Calcola le statistiche di taglio e suggerimenti
    const optimalChipLoad = calculateOptimalChipLoad(settings.material, settings.toolDiameter, settings.flutes);
    const recommendedPlunge = calculateRecommendedPlungeRate(settings.feedrate);
    const cuttingFeedback = getCuttingFeedback(settings);
    const chipLoad = (settings.feedrate / (settings.rpm * settings.flutes)).toFixed(3);
    const cuttingStats = calculateCuttingStatistics(settings);
    const effectiveStepover = (settings.stepover / 100) * settings.toolDiameter;
    
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('cutting')}
        >
          <h3 className="text-lg font-medium text-gray-900">Parametri di Taglio</h3>
          {expanded.cutting ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.cutting && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profondità di Passata (mm)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.stepdown}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('stepdown', value);
                  }
                }}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Min: 0.1mm</span>
                <span>Max consigliato: 3mm</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Avanzamento (mm/min)
              </label>
              <input
                type="number"
                min="1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.feedrate}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('feedrate', value);
                  }
                }}
              />
              <div className="flex flex-col text-xs mt-1">
                <span className="text-gray-500">Avanzamento per dente: {chipLoad} mm</span>
                {cuttingFeedback && (
                  <span className={`${cuttingFeedback.startsWith('✓') ? 'text-green-600' : 'text-yellow-600'} font-medium`}>
                    {cuttingFeedback}
                  </span>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Velocità Entrata (mm/min)
              </label>
              <input
                type="number"
                min="1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.plungerate}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateSettings('plungerate', value);
                  }
                }}
              />
              <div className="text-xs text-gray-500 mt-1">
                Consigliato: {recommendedPlunge} mm/min ({Math.round((recommendedPlunge / settings.feedrate) * 100)}% dell avanzamento)
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stepover (% del diametro)
              </label>
              <input
                type="number"
                min="10"
                max="90"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.stepover}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value >= 10 && value <= 90) {
                    updateSettings('stepover', value);
                  }
                }}
              />
              <div className="text-xs text-gray-500 mt-1">
                Larghezza effettiva: {effectiveStepover.toFixed(2)} mm
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offset Utensile
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.offset}
                onChange={(e) => updateSettings('offset', e.target.value)}
              >
                <option value="outside">Esterno</option>
                <option value="inside">Interno</option>
                <option value="center">Centro</option>
              </select>
              
              {/* Visualizzazione grafica offset utensile */}
              <div className="mt-2 flex justify-center">
                <div className="w-48 h-32 relative">
                  <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
                    {settings.offset === 'center' && (
                      <>
                        <rect x="70" y="40" width="100" height="80" stroke="#4B83F0" strokeWidth="2" strokeDasharray="5,5" fill="none" />
                        <circle cx="120" cy="40" r="4" fill="#4B83F0" />
                        <line x1="120" y1="20" x2="120" y2="140" stroke="#4B83F0" strokeWidth="1" strokeDasharray="4,4" />
                        <line x1="50" y1="80" x2="190" y2="80" stroke="#4B83F0" strokeWidth="1" strokeDasharray="4,4" />
                      </>
                    )}
                    
                    {settings.offset === 'outside' && (
                      <>
                        <rect x="70" y="40" width="100" height="80" stroke="#4B83F0" strokeWidth="2" strokeDasharray="5,5" fill="none" />
                        <rect x="60" y="30" width="120" height="100" stroke="#4B83F0" strokeWidth="2" fill="none" />
                        <circle cx="60" cy="30" r="4" fill="#4B83F0" />
                        <path d="M 60,30 L 70,40" stroke="#4B83F0" strokeWidth="1" />
                      </>
                    )}
                    
                    {settings.offset === 'inside' && (
                      <>
                        <rect x="70" y="40" width="100" height="80" stroke="#4B83F0" strokeWidth="2" strokeDasharray="5,5" fill="none" />
                        <rect x="80" y="50" width="80" height="60" stroke="#4B83F0" strokeWidth="2" fill="none" />
                        <circle cx="80" cy="50" r="4" fill="#4B83F0" />
                        <path d="M 80,50 L 70,40" stroke="#4B83F0" strokeWidth="1" />
                      </>
                    )}
                  </svg>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direzione di Taglio
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={settings.direction}
                onChange={(e) => updateSettings('direction', e.target.value)}
              >
                <option value="climb">Concordante (Climb)</option>
                <option value="conventional">Discordante (Conventional)</option>
              </select>
              
              {/* Visualizzazione grafica direzione taglio */}
              <div className="mt-2 flex justify-center">
                <div className="w-48 h-32 relative">
                  <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
                    <text x="120" y="30" textAnchor="middle" fontSize="16" fill="#4B83F0">
                      {settings.direction === 'climb' ? 'Concordante' : 'Discordante'}
                    </text>
                    
                    {/* Utensile concordante (sinistra) */}
                    <circle cx="80" cy="80" r="40" fill="none" stroke="#aaa" strokeWidth="1" />
                    <circle cx="80" cy="80" r={settings.direction === 'climb' ? "14" : "8"} fill="#4B83F0" />
                    
                    {settings.direction === 'climb' && (
                      <path d="M 80,80 Q 100,95 120,80" stroke="#4B83F0" strokeWidth="2" fill="none" strokeDasharray="4,3" />
                    )}
                    
                    {settings.direction === 'climb' && (
                      <path d="M 115,77 L 120,80 L 115,83" fill="none" stroke="#4B83F0" strokeWidth="2" />
                    )}
                    
                    {/* Utensile discordante (destra) */}
                    <circle cx="160" cy="80" r="40" fill="none" stroke="#aaa" strokeWidth="1" />
                    <circle cx="160" cy="80" r={settings.direction === 'conventional' ? "14" : "8"} fill="#4B83F0" />
                    
                    {settings.direction === 'conventional' && (
                      <path d="M 160,80 Q 140,65 120,80" stroke="#4B83F0" strokeWidth="2" fill="none" strokeDasharray="4,3" />
                    )}
                    
                    {settings.direction === 'conventional' && (
                      <path d="M 125,77 L 120,80 L 125,83" fill="none" stroke="#4B83F0" strokeWidth="2" />
                    )}
                  </svg>
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="finishingPass"
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                checked={settings.finishingPass}
                onChange={(e) => updateSettings('finishingPass', e.target.checked)}
              />
              <label htmlFor="finishingPass" className="ml-2 block text-sm text-gray-700">
                Aggiungi Passaggio di Finitura
              </label>
            </div>
            
            {settings.finishingPass && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sovrametallo per Finitura (mm)
                </label>
                <input
                  type="number"
                  min="0.05"
                  max="1"
                  step="0.05"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  value={settings.finishingAllowance}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      updateSettings('finishingAllowance', value);
                    }
                  }}
                />
              </div>
            )}
            
            {/* Tabella con statistiche di taglio */}
            <div className="mt-4 p-4 border border-gray-300 bg-gray-50 rounded-md">
              <h4 className="text-xs font-medium text-gray-800 mb-2">Statistiche di Taglio</h4>
              <div className="grid  gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Velocità di taglio:</span>
                  <span className="font-medium">{cuttingStats.cuttingSpeed.toFixed(1)} m/min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avanzamento per dente:</span>
                  <span className="font-medium">{chipLoad} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tasso rimozione:</span>
                  <span className="font-medium">{cuttingStats.materialRemovalRate.toFixed(2)} cm³/min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Stepover effettivo:</span>
                  <span className="font-medium">{effectiveStepover.toFixed(2)} mm</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render advanced section
  const renderAdvancedSection = () => {
    return (
      <div className="mb-6" data-testid="advanced-options-panel">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('advanced')}
        >
          <h3 className="text-lg font-medium text-gray-900">Impostazioni Avanzate</h3>
          {expanded.advanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.advanced && (
          <div className="mt-3 space-y-4">
            {/* Tolleranza */}
            <div>
              <h4 className="text-sm font-medium text-gray-800 mb-2">Impostazioni di Precisione</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Tolleranza (mm)
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.tolerance}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value) && value > 0) {
                        updateSettings('tolerance', value);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            
            {/* Ottimizzazione percorso */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-800 mb-2">Ottimizzazione Percorso</h4>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-path-optimization"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.optimizePath || false}
                    onChange={(e) => updateSettings('optimizePath', e.target.checked)}
                  />
                  <label htmlFor="use-path-optimization" className="ml-2 block text-sm text-gray-700">
                    Abilita ottimizzazione percorso
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-arc-fitting"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.useArcFitting || false}
                    onChange={(e) => updateSettings('useArcFitting', e.target.checked)}
                  />
                  <label htmlFor="use-arc-fitting" className="ml-2 block text-sm text-gray-700">
                    Converti segmenti in archi (G2/G3)
                  </label>
                </div>
              </div>
            </div>
            
            {/* Strategie avanzate di taglio */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-800 mb-2">Strategie Avanzate</h4>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-adaptive-feeds"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.useAdaptiveFeeds || false}
                    onChange={(e) => updateSettings('useAdaptiveFeeds', e.target.checked)}
                  />
                  <label htmlFor="use-adaptive-feeds" className="ml-2 block text-sm text-gray-700">
                    Abilita velocità adattive in curva
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-rest-machining"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.useRestMachining || false}
                    onChange={(e) => updateSettings('useRestMachining', e.target.checked)}
                  />
                  <label htmlFor="use-rest-machining" className="ml-2 block text-sm text-gray-700">
                    Utilizza lavorazione residua (Rest Machining)
                  </label>
                </div>
                
                {settings.finishingPass && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Strategia finitura
                    </label>
                    <select
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={settings.finishingStrategy || 'contour'}
                      onChange={(e) => updateSettings('finishingStrategy', e.target.value)}
                    >
                      <option value="contour">Contornatura</option>
                      <option value="parallel">Passate parallele</option>
                      <option value="spiral">Spirale</option>
                      <option value="radial">Radiale</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            
            {/* Opzioni di compensazione */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-800 mb-2">Compensazione Utensile</h4>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-tool-compensation"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={settings.useToolCompensation || false}
                    onChange={(e) => updateSettings('useToolCompensation', e.target.checked)}
                  />
                  <label htmlFor="use-tool-compensation" className="ml-2 block text-sm text-gray-700">
                    Usa compensazione utensile nel G-code (G41/G42)
                  </label>
                </div>
                
                {settings.useToolCompensation && (
                  <div className="p-2 bg-blue-50 rounded-md">
                    <p className="text-xs text-blue-700">
                      La compensazione raggio utensile (cutter compensation) verrà inserita 
                      direttamente nel G-code. La direzione sarà determinata automaticamente 
                      dalle impostazioni di offset e direzione di taglio.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Opzioni avanzate generali */}
            <div className="border-t border-gray-200 pt-4">
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  Le impostazioni avanzate permettono un controllo più preciso del percorso utensile, ma possono richiedere una regolazione manuale per risultati ottimali. Le funzionalità avanzate dipendono dal tipo di controllo numerico utilizzato.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render AI section
  const renderAISection = () => {
    return (
      <div className="mb-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection('ai')}
        >
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Cpu size={18} className="mr-2 text-blue-600" /> Assistenza AI
          </h3>
          {expanded.ai ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.ai && (
          <div className="mt-3 space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="useAI"
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                checked={settings.useAI}
                onChange={(e) => updateSettings('useAI', e.target.checked)}
              />
              <label htmlFor="useAI" className="ml-2 block text-sm text-gray-700">
                Attiva suggerimenti AI
              </label>
            </div>
            
            {settings.useAI && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complessità del Progetto
                  </label>
                  <select
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.aiDifficulty}
                    onChange={(e) => updateSettings('aiDifficulty', e.target.value)}
                  >
                    <option value="simple">Semplice</option>
                    <option value="moderate">Moderata</option>
                    <option value="complex">Complessa</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ottimizza Per
                  </label>
                  <select
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={settings.aiOptimize}
                    onChange={(e) => updateSettings('aiOptimize', e.target.value)}
                  >
                    <option value="speed">Velocità di Lavorazione</option>
                    <option value="quality">Qualità Superficiale</option>
                    <option value="balance">Bilanciato</option>
                  </select>
                </div>
                
                {/* Mostra suggerimenti AI se disponibili */}
                <div className="p-3 bg-blue-50 rounded-md">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Suggerimenti AI</h4>
                  {isAIProcessing ? (
                    <div className="flex justify-center items-center py-4">
                      <svg className="animate-spin h-5 w-5 text-blue-500 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-sm text-blue-600">Analizzando parametri...</span>
                    </div>
                 ) : aiSuggestions.length > 0 ? (
                  <ul className="space-y-2">
                    {aiSuggestions.map((suggestion, index) => (
                      <li key={index} className="text-sm text-blue-700 flex items-start">
                        <Cpu size={14} className="mt-0.5 mr-2 flex-shrink-0" />
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-blue-600">
                    Attiva i suggerimenti AI per ricevere consigli basati sui tuoi parametri di lavorazione.
                  </p>
                )}
              </div>
              
              <div className="mt-2 p-3 bg-gray-50 rounded-md">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Chiedi all&apos;AI</h4>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full p-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Fai una domanda sulla lavorazione..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                        const question = (e.target as HTMLInputElement).value;
                        // Simula risposta AI
                        setIsAIProcessing(true);
                        setTimeout(() => {
                          setAiSuggestions([
                            ...aiSuggestions,
                            `Sulla base della tua domanda "${question}", consiglio di utilizzare una velocità di avanzamento più bassa per il ${settings.material} quando si lavora con profondità superiori a ${settings.depth/2}mm.`
                          ]);
                          setIsAIProcessing(false);
                          (e.target as HTMLInputElement).value = '';
                        }, 1500);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-2 text-blue-600"
                    onClick={() => {
                      // Trigger per far capire all'utente che può fare domande
                      setAiSuggestions([
                        ...aiSuggestions,
                        `Posso aiutarti con consigli sulla lavorazione del ${settings.material}. Prova a chiedermi riguardo le velocità ottimali o le profondità di passata.`
                      ]);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
  }
  return (
    <div className={`bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white p-4 rounded-md shadow-md ${showFullscreen ? "fixed inset-0 z-50 overflow-auto" : ""}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Generatore Percorso Utensile</h2>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowFullscreen(!showFullscreen)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
            title={showFullscreen ? "Esci da schermo intero" : "Schermo intero"}
          >
            {showFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button
            type="button"
            className="p-1 rounded-md hover:bg-gray-100 text-gray-600"
            title="Aiuto"
            onClick={() => {
              alert("This is the toolpath generator. To start, choose an'operation and configure the cutting parameters.");
            }}
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>
      {renderOriginSection()}
      {renderMachineSection()}
      {renderOperationSection()}
      {renderFixedCyclesSection()}
      {renderMaterialSection()}
      {renderToolSection()}
      {renderLatheSection()}
      {render3DPrinterSection()}
      {renderCuttingSection()}
      {renderAdvancedSection()}
      {renderAISection()}
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded-md flex items-start">
          <AlertTriangle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-50 rounded-md flex items-start">
          <Check className="text-green-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}
      
      <button
        onClick={generateGCode}
        disabled={isGenerating}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generazione in corso...
          </>
        ) : (
          <>
            <Code size={18} className="mr-2" />
            Genera G-Code
          </>
        )}
      </button>

      <button
    onClick={() => {
      if (!currentGCode) {
        toast.error('No G-code generated yet!');
        return;
      }
      
      // Save the G-code to localStorage for the toolpaths page to pick up
      localStorage.setItem('gcodeFromToolpathGenerator', currentGCode);
      localStorage.setItem('settingsFromToolpathGenerator', JSON.stringify(settings));
      
      // Redirect to toolpaths page to create a new toolpath
      router.push('/toolpaths?fromGenerator=true');
      
      toast.success('G-code ready to save as toolpath');
    }}
    className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center mt-2"
  >
    <Save size={18} className="mr-2" />
    Save as Toolpath
  </button>

      {/* Aggiungere la possibilità di salvare/caricare configurazioni */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Configurazioni salvate</span>
          <div className="flex space-x-2">
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              onClick={() => {
                // Simula il salvataggio della configurazione corrente
                localStorage.setItem('toolpath-config', JSON.stringify(settings));
                setSuccess('Configurazione salvata!');
                successTimerRef.current = setTimeout(() => {
                  setSuccess(null);
                }, 3000);
              }}
            >
              <Save size={14} className="mr-1" /> Salva
            </button>
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              onClick={() => {
                // Simula il caricamento di una configurazione salvata
                const savedConfig = localStorage.getItem('toolpath-config');
                if (savedConfig) {
                  setSettings(JSON.parse(savedConfig));
                  setSuccess('Configurazione caricata!');
                  successTimerRef.current = setTimeout(() => {
                    setSuccess(null);
                  }, 3000);
                } else {
                  setError('No saved configuration found');
                  setTimeout(() => {
                    setError(null);
                  }, 3000);
                }
              }}
            >
              <Upload size={14} className="mr-1" /> Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolpathGenerator;