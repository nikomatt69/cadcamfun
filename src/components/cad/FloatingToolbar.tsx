// src/components/cad/FloatingToolbar.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Edit3, Square, Circle, Box, Minus, 
  Plus, X, ChevronUp, ChevronDown, 
  Menu, Grid, Tool, Layers, Settings, Sliders,
  Copy, Trash2, RotateCcw, Maximize2, Move,
  Package, Search, Cpu, Book, Filter,
  Type, Triangle, UploadCloud,
  PenTool
} from 'react-feather';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import toast from 'react-hot-toast';

import { predefinedComponents, predefinedTools } from 'src/lib/predefinedLibraries';
import { ToolLibraryItem } from '@/src/hooks/useUnifiedLibrary';

import LocalComponentsLibraryView from '../library/LocalComponentsLibraryView';
import UnifiedLibraryBrowser from './UnifiedLibraryBrowser';
import { ComponentLibraryItem } from '@/src/hooks/useUnifiedLibrary';
import ComponentsLibraryView from '../library/ComponentsLibraryView';
import DrawingToolbar from '../cam/DrawingToolbar';
import { useDrawingTools } from '@/src/hooks/useDrawingTools';
import LibraryMenu from './LibraryMenu';
import { AIHub } from '../ai/ai-new';
import ToolPanel from './ToolPanel';

interface Position {
  x: number;
  y: number;
}

interface FloatingToolbarProps {
  initialPosition?: Position;
  onClose?: () => void;
}

const TOOLBAR_MODES = ['create', 'transform', 'library', 'ai','drawing'] as const;
type ToolbarMode = typeof TOOLBAR_MODES[number];

const LIBRARY_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'structural', label: 'Structural' },
  { id: 'fixture', label: 'Fixtures' },
  { id: 'enclosure', label: 'Enclosures' }
];

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ 
  initialPosition = { x: 100, y: 100 },
  onClose
}) => {
  const [mode, setMode] = useState<ToolbarMode>('create');
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Animation variants for the toolbar
  const toolbarVariants = {
    hidden: { 
      opacity: 0,
      scale: 0.8,
      y: 20
    },
    visible: { 
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30
      }
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      y: -20,
      transition: {
        duration: 0.2
      }
    }
  };

  // Animation variants for buttons
  const buttonVariants = {
    hover: { 
      scale: 1.05,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 10
      }
    },
    tap: { 
      scale: 0.95 
    }
  };

  // Animation variants for mode switching
  const modeContentVariants = {
    enter: {
      x: -20,
      opacity: 0
    },
    center: {
      x: 0,
      opacity: 1,
      transition: {
        x: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 }
      }
    },
    exit: {
      x: 20,
      opacity: 0,
      transition: {
        duration: 0.2
      }
    }
  };

  const [selectedMode, setSelectedMode] = useState<ToolbarMode>('create');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [showLibraryView, setShowLibraryView] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'layers' | 'settings' >('tools');
  const [showUnifiedLibrary, setShowUnifiedLibrary] = useState(false);
  const { addElement, selectedElement, duplicateElement, deleteElement, addElements } = useElementsStore();
  const { toggleGrid, toggleAxis, viewMode, setViewMode } = useCADStore();
  const { activeLayer, layers } = useLayerStore();
  const { toolState, setActiveTool, setPenSize, setEraserSize, setHighlighterSize, 
    setColor, setTextSize, setDimensionStyle, startDrawing, addDrawingPoint, 
    finishDrawing, resetDrawing } = useDrawingTools();
  // Check if the active layer is locked
  const isLayerLocked = React.useMemo(() => {
    if (!activeLayer) return true;
    const layer = layers.find(l => l.id === activeLayer);
    return layer?.locked || false;
  }, [activeLayer, layers]);

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!toolbarRef.current) return;
    
    setIsDragging(true);
    const rect = toolbarRef.current.getBoundingClientRect();
    const dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Handle dragging
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDrag = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - 100,
        y: e.clientY - 20
      });
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Add drag event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDrag, isDragging]);

  // Filter components for library mode
  const filteredComponents = predefinedComponents.filter(component => {
    // Filter by search query
    const matchesSearch = !searchQuery || 
      component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (component.description && component.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Filter by category
    const matchesCategory = selectedCategory === 'all' || 
      (component.data && component.type === selectedCategory);
    
    return matchesSearch && matchesCategory;
  });

  // Handle adding a new element
  const handleAddElement = (type: string) => {
    if (isLayerLocked) {
      alert('Cannot add elements to a locked layer');
      return;
    }
    
    let newElement;
    
    switch(type) {
      case 'rectangle':
        newElement = {
          type: 'rectangle',
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          color: '#1e88e5',
          linewidth: 1
        };
        break;
      case 'circle':
        newElement = {
          type: 'circle',
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          color: '#1e88e5',
          linewidth: 1
        };
        break;
      case 'cube':
        newElement = {
          type: 'cube',
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          depth: 100,
          color: '#1e88e5',
          wireframe: false
        };
        break;
      case 'line':
        newElement = {
          type: 'line',
          x1: -50,
          y1: 0,
          z1: 0,
          x2: 50,
          y2: 0,
          z2: 0,
          color: '#1e88e5',
          linewidth: 2
        };
        break;
      case 'sphere':
        newElement = {
          type: 'sphere',
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          color: '#1e88e5',
          wireframe: false
        };
        break;
      case 'cylinder':
        newElement = {
          type: 'cylinder',
          x: 0,
          y: 0,
          z: 0,
          radius: 30,
          height: 100,
          color: '#1e88e5',
          wireframe: false
        };
        break;
      case 'cone':
        newElement = {
          type: 'cone',
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          height: 100,
          color: '#1e88e5',
          wireframe: false
        };
        break;
      case 'torus':
        newElement = {
          type: 'torus',
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          tubeRadius: 10,
          color: '#1e88e5',
          wireframe: false
        };
        break;
      case 'text':
        newElement = {
          type: 'text',
          x: 0,
          y: 0,
          z: 0,
          text: 'Text',
          size: 20,
          color: '#1e88e5'
        };
        break;
      case 'polygon':
        newElement = {
          type: 'polygon',
          x: 0,
          y: 0,
          z: 0,
          sides: 6,
          radius: 50,
          color: '#1e88e5',
          linewidth: 1
        };
        break;
      case 'extrude':
        newElement = {
          type: 'extrude',
          x: 0,
          y: 0,
          z: 0,
          shape: [
            { x: -25, y: -25 },
            { x: 25, y: -25 },
            { x: 25, y: 25 },
            { x: -25, y: 25 }
          ],
          depth: 50,
          color: '#1e88e5'
        };
        break;
      case 'triangle':
        newElement = { type: 'triangle', x: 0, y: 0, z: 0, points: [{ x: 0, y: 50 }, { x: -50, y: -25 }, { x: 50, y: -25 }], color: '#1e88e5', linewidth: 1 };
        break;
      case 'pyramid':
        newElement = { type: 'pyramid', x: 0, y: 0, z: 0, baseWidth: 100, baseDepth: 100, height: 150, color: '#E91E63', wireframe: false };
        break;
      case 'prism':
        newElement = { type: 'prism', x: 0, y: 0, z: 0, radius: 50, height: 100, sides: 6, color: '#3F51B5', wireframe: false };
        break;
      case 'hemisphere':
        newElement = { type: 'hemisphere', x: 0, y: 0, z: 0, radius: 50, segments: 32, direction: 'up', color: '#00BCD4', wireframe: false };
        break;
      case 'ellipsoid':
        newElement = { type: 'ellipsoid', x: 0, y: 0, z: 0, radiusX: 50, radiusY: 35, radiusZ: 25, segments: 32, color: '#8BC34A', wireframe: false };
        break;
      case 'capsule':
        newElement = { type: 'capsule', x: 0, y: 0, z: 0, radius: 25, height: 100, direction: 'y', color: '#673AB7', wireframe: false };
        break;
      case 'ellipse':
        newElement = { type: 'ellipse', x: 0, y: 0, z: 0, radiusX: 50, radiusY: 25, segments: 32, color: '#1e88e5', linewidth: 1 };
        break;
      case 'arc':
        newElement = { type: 'arc', x: 0, y: 0, z: 0, radius: 50, startAngle: 0, endAngle: Math.PI, segments: 32, color: '#1e88e5', linewidth: 1 };
        break;
      case 'spline':
        newElement = { type: 'spline', points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 70, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }], divisions: 50, color: '#1e88e5', linewidth: 1 };
        break;
      case 'bezier':
        newElement = { type: 'bezier', points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 100, z: 0 }, { x: 70, y: 100, z: 0 }, { x: 100, y: 0, z: 0 }], divisions: 50, color: '#1e88e5', linewidth: 1 };
        break;
      case 'nurbs':
        newElement = { type: 'nurbs', points: [{ x: 0, y: 0, z: 0 }, { x: 30, y: 50, z: 0 }, { x: 60, y: -20, z: 0 }, { x: 100, y: 0, z: 0 }], degree: 3, divisions: 100, color: '#1e88e5', linewidth: 1 };
        break;
      case 'boolean-union':
        newElement = { type: 'boolean-union', operands: [], x: 0, y: 0, z: 0, color: '#4CAF50' };
        break;
      case 'boolean-subtract':
        newElement = { type: 'boolean-subtract', operands: [], x: 0, y: 0, z: 0, color: '#F44336' };
        break;
      case 'boolean-intersect':
        newElement = { type: 'boolean-intersect', operands: [], x: 0, y: 0, z: 0, color: '#2196F3' };
        break;
      case 'revolution':
        newElement = { type: 'revolution', x: 0, y: 0, z: 0, profile: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 25, y: 30 }, { x: 10, y: 50 }], segments: 32, angle: 6.28, axis: 'y', color: '#FF5722' };
        break;
      case 'sweep':
        newElement = { type: 'sweep', profile: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }], path: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 50, z: 50 }, { x: 100, y: 0, z: 0 }], radius: 10, segments: 64, color: '#2196F3' };
        break;
      case 'loft':
        newElement = { type: 'loft', profiles: [{ radius: 20 }, { radius: 40 }, { radius: 10 }], positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 50 }, { x: 0, y: 0, z: 100 }], closed: false, color: '#9C27B0' };
        break;
      case 'thread':
        newElement = { type: 'thread', x: 0, y: 0, z: 0, diameter: 20, pitch: 2, length: 50, handedness: 'right', standard: 'metric', color: '#B0BEC5' };
        break;
      case 'chamfer':
        newElement = { type: 'chamfer', x: 0, y: 0, z: 0, width: 100, height: 100, depth: 100, distance: 10, edges: [], color: '#607D8B' };
        break;
      case 'fillet':
        newElement = { type: 'fillet', x: 0, y: 0, z: 0, width: 100, height: 100, depth: 100, radius: 10, edges: [], color: '#607D8B' };
        break;
      case 'gear':
        newElement = { type: 'gear', x: 0, y: 0, z: 0, moduleValue: 2, teeth: 20, thickness: 10, pressureAngle: 20, holeDiameter: 10, color: '#B0BEC5' };
        break;
      case 'spring':
        newElement = { type: 'spring', x: 0, y: 0, z: 0, radius: 30, wireRadius: 5, turns: 5, height: 100, color: '#9E9E9E' };
        break;
      case 'screw':
        newElement = { type: 'screw', x: 0, y: 0, z: 0, size: 'M8', length: 40, thread: 'M8x1.25', grade: '8.8', color: '#9E9E9E' };
        break;
      case 'nut':
        newElement = { type: 'nut', x: 0, y: 0, z: 0, size: 'M8', thread: 'M8x1.25', style: 'hex', color: '#9E9E9E' };
        break;
      case 'bolt':
        newElement = { type: 'bolt', x: 0, y: 0, z: 0, size: 'M8', length: 50, thread: 'M8x1.25', grade: '8.8', color: '#9E9E9E' };
        break;
      case 'washer':
        newElement = { type: 'washer', x: 0, y: 0, z: 0, size: 'M8', outerDiameter: 16, thickness: 1.5, color: '#9E9E9E' };
        break;
      case 'rivet':
        newElement = { type: 'rivet', x: 0, y: 0, z: 0, diameter: 8, length: 20, color: '#9E9E9E' };
        break;
      case 'wall':
        newElement = { type: 'wall', x: 0, y: 0, z: 0, length: 300, height: 100, thickness: 20, openings: [], color: '#E0E0E0' };
        break;
      case 'floor':
        newElement = { type: 'floor', x: 0, y: 0, z: 0, width: 400, length: 400, thickness: 10, color: '#BCAAA4' };
        break;
      case 'roof':
        newElement = { type: 'roof', x: 0, y: 100, z: 0, width: 400, length: 400, height: 50, style: 'pitched', color: '#795548' };
        break;
      case 'window':
        newElement = { type: 'window', x: 0, y: 0, z: 0, width: 50, height: 80, thickness: 5, style: 'simple', frameColor: '#8D6E63', color: '#B3E5FC' };
        break;
      case 'door':
        newElement = { type: 'door', x: 0, y: 0, z: 0, width: 36, height: 80, thickness: 2, style: 'simple', color: '#8D6E63' };
        break;
      case 'stair':
        newElement = { type: 'stair', x: 0, y: 0, z: 0, width: 100, height: 150, depth: 200, steps: 10, color: '#BCAAA4' };
        break;
      case 'column':
        newElement = { type: 'column', x: 0, y: 0, z: 0, radius: 20, height: 200, style: 'simple', color: '#E0E0E0' };
        break;
      case 'text3d':
        newElement = { type: 'text3d', x: 0, y: 0, z: 0, text: 'Hello', height: 10, depth: 2, font: 'Arial', color: '#4285F4' };
        break;
      case 'path3d':
        newElement = { type: 'path3d', x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 50, z: 20 }, { x: 100, y: 0, z: 40 }], color: '#4285F4' };
        break;
      case 'point-cloud':
        newElement = { type: 'point-cloud', x: 0, y: 0, z: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 10, z: 20 }, { x: 20, y: 50, z: 30 }, { x: 80, y: 30, z: 10 }, { x: 40, y: 70, z: 50 }], pointSize: 5, color: '#4285F4' };
        break;
      case 'mesh':
        newElement = { type: 'mesh', x: 0, y: 0, z: 0, vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }, { x: 0, y: 100, z: 0 }, { x: 50, y: 50, z: 50 }], faces: [[0,1,2],[0,2,3],[0,1,4],[1,2,4],[2,3,4],[3,0,4]], color: '#4285F4' };
        break;
      case 'group':
        newElement = { type: 'group', x: 0, y: 0, z: 0, elements: [] };
        break;
      case 'grid':
        newElement = { type: 'grid', x: 0, y: 0, z: 0, size: 100, divisions: 10, colorCenterLine: '#444444', colorGrid: '#888888', plane: 'xy' };
        break;
      case 'workpiece':
        newElement = { type: 'workpiece', x: 0, y: 0, z: 0, width: 100, height: 100, depth: 20, color: '#3080FF', wireframe: false };
        break;
      case 'tube':
        newElement = { type: 'tube', x: 0, y: 0, z: 0, path: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 20, z: 0 }, { x: 100, y: 0, z: 0 }], radius: 5, tubularSegments: 64, radialSegments: 8, closed: false, color: '#2196F3', wireframe: false };
        break;
      case 'lathe':
        newElement = { type: 'lathe', x: 0, y: 0, z: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 40 }], segments: 12, phiLength: 6.28, color: '#607D8B', wireframe: false };
        break;
      default:
        return;
    }
    
    addElement(newElement);
  };

  // Add component from library to the workspace
  const addComponentToWorkspace = (component: any) => {
    if (isLayerLocked) {
      alert('Cannot add components to a locked layer. Please unlock the layer first.');
      return;
    }

    // For components, we need to handle their specific structure
    // This assumes components have a 'data.geometry.elements' structure
    if (component.data && component.data.geometry && component.data.geometry.elements) {
      addElements(component.data.geometry.elements);
    } else {
      console.error('Invalid component structure:', component);
    }
  };
  const handleComponentSelection = useCallback((component: ComponentLibraryItem) => {
    console.log("Selected component:", component);
    setSelectedLibraryComponent(component.id);
    // Show selection notification
    toast.success(`Component '${component.name}' selected. Place it on the canvas.`);
    setShowUnifiedLibrary(false);
    // Optionally, switch to 'tools' tab if not already active
    setActiveSidebarTab('tools');
  }, []);

  // Handle component placement in canvas
  const handleComponentPlacement = useCallback((component: string, position: {x: number, y: number, z: number}) => {
    // Logic to place the component on the canvas would go here
    console.log(`Component ${component} placed at:`, position);
    toast.success('Component placed successfully!');
    // Reset selection after placement
    setSelectedLibraryComponent(null);
  }, []);

  // Add handler for tool selection from unified library
  const handleToolSelection = (tool: ToolLibraryItem) => {
    // Handle tool selection if needed
    console.log("Selected tool:", tool);
    setShowUnifiedLibrary(false);
  };

  // Reset component selection when closing library
  useEffect(() => {
    if (!showUnifiedLibrary && !showLibraryView) {
      setSelectedLibraryComponent(null);
    }
  }, [showUnifiedLibrary, showLibraryView]);

  // Custom Icon for Cylinder
  const CylinderIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <line x1="4" y1="6" x2="4" y2="18" />
      <line x1="20" y1="6" x2="20" y2="18" />
      <ellipse cx="12" cy="18" rx="8" ry="3" />
    </svg>
  );

  // Custom Icon for Torus
  const TorusIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  // Custom Icon for Extrude
  const ExtrudeIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,5 19,12 12,19 5,12" />
      <line x1="12" y1="5" x2="12" y2="2" />
    </svg>
  );

  // Custom Icon for Polygon
  const PolygonIcon = () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,4 20,10 17,19 7,19 4,10" />
    </svg>
  );

  // Render the appropriate tool panel based on selected mode
  const renderToolPanel = () => {
    switch (mode) {
      case 'create':
        return (
          <div className="p-2 grid  gap-2">
            <ToolPanel />
          </div>
        );
      case 'transform':
        return (
          <div className="p-2 flex flex-col gap-2">
            <button 
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              disabled={!selectedElement || isLayerLocked}
              title={!selectedElement ? "No element selected" : isLayerLocked ? "Layer is locked" : "Move Element"}
            >
              <Move size={16} className="mb-1" />
              <span>Move</span>
            </button>
            <button 
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              disabled={!selectedElement || isLayerLocked}
              title={!selectedElement ? "No element selected" : isLayerLocked ? "Layer is locked" : "Rotate Element"}
            >
              <RotateCcw size={16} className="mb-1" />
              <span>Rotate</span>
            </button>
            <button 
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              disabled={!selectedElement || isLayerLocked}
              title={!selectedElement ? "No element selected" : isLayerLocked ? "Layer is locked" : "Scale Element"}
            >
              <Maximize2 size={16} className="mb-1" />
              <span>Scale</span>
            </button>
            <button 
              onClick={() => selectedElement && duplicateElement(selectedElement.id)}
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              disabled={!selectedElement || isLayerLocked}
              title={!selectedElement ? "No element selected" : isLayerLocked ? "Layer is locked" : "Duplicate Element"}
            >
              <Copy size={16} className="mb-1" />
              <span>Copy</span>
            </button>
            <button 
              onClick={() => selectedElement && deleteElement(selectedElement.id)}
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              disabled={!selectedElement || isLayerLocked}
              title={!selectedElement ? "No element selected" : isLayerLocked ? "Layer is locked" : "Delete Element"}
            >
              <Trash2 size={16} className="mb-1" />
              <span>Delete</span>
            </button>
            <button 
              onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')}
              className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-100 rounded-md shadow-sm flex flex-col items-center justify-center text-xs"
              title={`Switch to ${viewMode === '2d' ? '3D' : '2D'} View`}
            >
              <Sliders size={16} className="mb-1" />
              <span>{viewMode === '2d' ? '3D' : '2D'}</span>
            </button>
          </div>
        );
      case 'library':
        return (
          <div className="p-2 flex flex-col">
            <LibraryMenu onSelectComponent={(component) => {
            setSelectedLibraryComponent(component);
            // Se la prop onSelectComponent esiste, chiamala
            if (selectedElement) {
              (component);
            }
          }} />
          </div>
        );
        case 'drawing':
        return (
          <div className="p-2 flex  h-full">
            <DrawingToolbar
             
             onSelectTool={setActiveTool}
             activeTool={toolState.activeTool}
             color={toolState.color}
             onColorChange={setColor}
             penSize={toolState.penSize}
             onPenSizeChange={setPenSize}
             eraserSize={toolState.eraserSize}
             onEraserSizeChange={setEraserSize}
             highlighterSize={toolState.highlighterSize}
             onHighlighterSizeChange={setHighlighterSize}
             textSize={toolState.textSize}
             onTextSizeChange={setTextSize}
             dimensionStyle={toolState.dimensionStyle}
             onDimensionStyleChange={setDimensionStyle}
           /> 
          </div>
        );
      case 'ai':
        return (
          <div className="p-2">
            <AIHub />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      ref={toolbarRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        touchAction: 'none',
        zIndex: 1000
      }}
      drag
      dragMomentum={false}
      dragConstraints={{ left: 0, right: window.innerWidth - 300, top: 0, bottom: window.innerHeight - 100 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      variants={toolbarVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg backdrop-blur-lg bg-opacity-90 dark:bg-opacity-90 border border-gray-200 dark:border-gray-700"
    >
      {/* Toolbar Header */}
      <motion.div 
        className="p-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700"
        whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
      >
        <div className="flex items-center space-x-2">
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </motion.button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">CAD Tools</span>
        </div>
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X size={16} />
        </motion.button>
      </motion.div>

      {/* Toolbar Content */}
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.div
            key={mode}
            variants={modeContentVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="p-3"
          >
            {/* Mode Tabs */}
            <div className="flex space-x-1 mb-4 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              {TOOLBAR_MODES.map((tabMode) => (
                <motion.button
                  key={tabMode}
                  onClick={() => setMode(tabMode)}
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                  className={`
                    flex-1 px-3 py-1.5 text-xs font-medium rounded-md
                    ${mode === tabMode 
                      ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white'
                    }
                  `}
                >
                  {tabMode.charAt(0).toUpperCase() + tabMode.slice(1)}
                </motion.button>
              ))}
            </div>

            {/* Mode Content */}
            {renderToolPanel()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FloatingToolbar;