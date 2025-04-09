import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import { HelpCircle, Layers, Maximize, Maximize2, Minimize2, Move, RotateCw, Sliders } from 'react-feather';
import { predefinedComponents } from '@/src/lib/predefinedLibraries';
import { transformLibraryItemToCADElement, createComponentPreview } from '@/src/lib/libraryTransform';
import SnapIndicator from './SnapIndicator';
import { useSnap } from '@/src/hooks/useSnap';
import { useLOD } from 'src/hooks/canvas/useLod';
import { useThreePerformance } from 'src/hooks/canvas/useThreePerformance';
import { useCADKeyboardShortcuts } from 'src/hooks/useCADKeyboardShortcuts';
import DragDropIndicator from './DragDropIndicator';
import KeyboardShortcutsDialog from './KeyboardShortcutsDialog';
import ShortcutsDialog, { ShortcutCategory } from '../ShortcutsDialog';
import { CSG } from 'three-csg-ts';
// Importazioni per esportazione
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { useCursorContext } from '@/src/contexts/CursorContext';
import { InteractionState, ToolCursorType } from '@/src/lib/utils/cursorUtils';
import { updateCursorClasses } from '@/src/lib/utils/domUtils';
import SelectionControls from './new-cad/SelectionControls';
import useCADSelection from '@/src/hooks/useCadSelection';
import { useSelectionStore } from 'src/store/selectorStore';
import ElementsListPanel from './new-cad/ElementsListPanel';
import ComponentCreationModal from './new-cad/ComponentCreationModal';
import ElementInfo from './new-cad/ElementInfo';
import { debounce } from 'lodash';
import BoxSelection from './new-cad/BoxSelection';
import { useCADShortcuts } from 'src/hooks/useCADShortcuts';
import router from 'next/router';
import toast from 'react-hot-toast';
import SmartRenderer from '@/src/lib/canvas/SmartRenderer';
import CanvasPool from '@/src/lib/canvas/CanvasPool';

interface CADCanvasProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: {x: number, y: number, z: number}) => void;
  allowDragDrop?: boolean; // Nuova prop per abilitare il drag & drop
}

interface CommandHistory {
  undo: () => void;
  redo: () => void;
  description: string;
}

// Add this interface declaration somewhere near the other interface declarations
interface Window {
  cadCanvasScene?: THREE.Scene;
  cadCanvasCamera?: THREE.Camera;
  exposeCADCanvasAPI?: boolean;
  cadExporter?: {
    exportSTEP: (scene: THREE.Scene | null, filename: string) => void;
  };
}

const CADCanvas: React.FC<CADCanvasProps> = ({ 
  width = '100%', 
  height = '100%',
  previewComponent = null,
  onComponentPlaced,
  allowDragDrop = true 
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const controlPointsRef = useRef<THREE.Object3D[]>([]);
  const { snapToPoint, snapIndicator, snapSettings } = useSnap();
  const [previewObject, setPreviewObject] = useState<THREE.Object3D | null>(null);
  const { viewMode, gridVisible, axisVisible, originOffset } = useCADStore();
  const { elements, selectedElement, setMousePosition, updateElement, addElement ,selectElement} = useElementsStore();
  const { layers } = useLayerStore();
  const selectedObjectsRef = useRef<THREE.Object3D[]>([]);
  // Nuovo stato per tracciare l'anteprima del componente e il suo posizionamento
  const [isPlacingComponent, setIsPlacingComponent] = useState<boolean>(false);
  const [previewPosition, setPreviewPosition] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});
  const previewRef = useRef<THREE.Object3D | null>(null);
  
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [hoveredControlPoint, setHoveredControlPoint] = useState<{elementId: string, pointIndex: number} | null>(null);
  const [activeDragPoint, setActiveDragPoint] = useState<{elementId: string, pointIndex: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  // Riferimenti per controlli di trasformazione avanzati
  const transformControlsRef = useRef<TransformControls | null>(null);
  
  // Nuovi stati per ottimizzazioni e migliori UX
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [isDraggingComponent, setIsDraggingComponent] = useState(false);
  const [draggedComponent, setDraggedComponent] = useState<any>(null);
  const [dropPosition, setDropPosition] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});
  const [showPerformanceStats, setShowPerformanceStats] = useState(false);
  const [dropScreenPosition, setDropScreenPosition] = useState<{ x: number, y: number } | undefined>(undefined);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Riferimenti per operazioni booleane
  const booleanOperationsObjectsRef = useRef<THREE.Object3D[]>([]);
  const selection = useCADSelection(sceneRef, cameraRef, canvasRef);
  const [showElementsList, setShowElementsList] = useState(false);
const [showComponentModal, setShowComponentModal] = useState(false);
const [showElementInfo, setShowElementInfo] = useState(false);
const [isModifying, setIsModifying] = useState<boolean>(false);
// Usa i selector dallo store
const { 
  selectedElementIds, 
  isBoxSelecting, 
  startBoxSelection, 
  updateBoxSelection, 
  endBoxSelection,

  clearSelection
} = useSelectionStore();

// Per la box selection
const [isSelectionMode, setSelectionMode] = useState(false);
const [isMultiSelectMode, setMultiSelectMode] = useState(false);
const handleSelectionModeChange = useCallback((active: boolean) => {
  setSelectionMode(active);
  if (active) {
    // Quando si attiva la modalità selezione, imposta il tool su "select"
    useCADStore.getState().setActiveTool('select');
  }
}, []);

const toggleMultiSelectMode = useCallback(() => {
  setMultiSelectMode(prev => !prev);
}, []);
// Attiva gli shortcut
useCADShortcuts();
const worldToScreen = useCallback((position: { x: number, y: number, z: number }) => {
  if (!canvasRef.current || !cameraRef.current) return null;
  
  const vector = new THREE.Vector3(position.x, position.y, position.z);
  vector.project(cameraRef.current);
  
  const rect = canvasRef.current.getBoundingClientRect();
  const x = ((vector.x + 1) / 2) * rect.width;
  const y = ((-vector.y + 1) / 2) * rect.height;
  
  return { x, y };
}, [canvasRef, cameraRef]);

// Aggiungi funzione per convertire coordinate schermo a mondo
const screenToWorld = useCallback((screenX: number, screenY: number) => {
  if (!canvasRef.current || !cameraRef.current) return null;
  
  const rect = canvasRef.current.getBoundingClientRect();
  const normalizedX = ((screenX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((screenY - rect.top) / rect.height) * 2 + 1;
  
  const vector = new THREE.Vector3(normalizedX, normalizedY, 0);
  vector.unproject(cameraRef.current);
  
  const direction = vector.sub(cameraRef.current.position).normalize();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  
  const result = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(cameraRef.current.position, direction);
  raycaster.ray.intersectPlane(plane, result);
  
  return result;
}, [canvasRef, cameraRef]);


  useEffect(() => {
    if (window.exposeCADCanvasAPI) {
      window.cadCanvasScene = sceneRef.current ?? undefined;
      window.cadCanvasCamera = cameraRef.current ?? undefined;
      
      return () => {
        window.cadCanvasScene = undefined;
        window.cadCanvasCamera = undefined;
      };
    }
  }, [sceneRef.current, cameraRef.current, window.exposeCADCanvasAPI]);

  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const selectionData = selection.createSelectionData();
  const selectionBounds = selection.getSelectionBounds();
  // Utilizzo dei nuovi hooks
  const { optimizeScene, sceneStatistics } = useThreePerformance(sceneRef);
  const { applyLOD } = useLOD(sceneRef, cameraRef);
  

   useCADKeyboardShortcuts ({
    onDelete: () => {
      if (selectedElement) {
        // Delete the selected element
        useElementsStore.getState().deleteElement(selectedElement.id);
        selectElement(null);
      }
    },
    onEscape: () => {
      // Cancel placement or deselect
      if (isPlacingComponent) {
        if (previewRef.current && sceneRef.current) {
          sceneRef.current.remove(previewRef.current);
          previewRef.current = null;
        }
        setIsPlacingComponent(false);
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
      } else if (selectedElement) {
        selectElement(null);
      }
    },
    onTransform: (mode: 'translate' | 'rotate' | 'scale') => {
      if (transformControlsRef.current && mode) {
        setTransformMode(mode);
        transformControlsRef.current.setMode(mode);
      }
    },
    onToggleFullscreen: () => {
      toggleFullscreen();
    },
    onToggleGrid: () => {
      useCADStore.getState().toggleGrid();
    },
    onToggleAxis: () => {
      useCADStore.getState().toggleAxis();
    },
    onViewModeToggle: (mode: '3d' | '2d') => {
      useCADStore.getState().setViewMode(mode);
    },
    onZoomIn: () => {
      if (cameraRef.current && controlsRef.current) {
        // Zoom in by moving the camera closer
        controlsRef.current.zoom0 = controlsRef.current.zoom0 * 1.2;
        controlsRef.current.update();
      }
    },
    onZoomOut: () => {
      if (cameraRef.current && controlsRef.current) {
        // Zoom out by moving the camera farther
        controlsRef.current.zoom0 = controlsRef.current.zoom0 / 1.2;
        controlsRef.current.update();
      }
    },
    onZoomToFit: () => {
      // Implement zoom to fit selected elements or all elements
      fitCameraToElements();
    },
    onShowShortcuts: () => {
      // Show keyboard shortcuts dialog
      setShowKeyboardShortcuts(true);
    },
    onToggleSnap: () => {
      // Toggle snap using local state
      setSnapEnabled(prev => !prev);
    },
    onUndo: () => {
      // Implement undo functionality
      console.log("Undo action");
    },
    onRedo: () => {
      // Implement redo functionality
      console.log("Redo action");
    },
    onSave: () => {
      // Implement save functionality
      console.log("Save action");
    }
  });

  // Clear control points and recreate them for selected element
  const updateControlPoints = useCallback(() => {
    // Remove existing control points
    if (sceneRef.current) {
      controlPointsRef.current.forEach(point => {
        sceneRef.current?.remove(point);
      });
      controlPointsRef.current = [];
    }

    // Add control points for selected element
    if (selectedElement && sceneRef.current) {
      const controlPoints = createControlPointsForElement(selectedElement);
      controlPoints.forEach(point => {
        sceneRef.current?.add(point);
        controlPointsRef.current.push(point);
      });
    }
  }, [selectedElement]);

  const fitCameraToElements = useCallback(() => {
    if (!cameraRef.current || !sceneRef.current) return;
    
    const elementsToFit = selectedElement 
      ? [sceneRef.current.children.find(child => child.userData?.elementId === selectedElement.id)]
      : sceneRef.current.children.filter(child => child.userData?.isCADElement);
      
    if (elementsToFit.length === 0) return;
    
    // Create a bounding box encompassing all elements
    const boundingBox = new THREE.Box3();
    
    elementsToFit.forEach(element => {
      if (element) {
        const elementBox = new THREE.Box3().setFromObject(element);
        boundingBox.union(elementBox);
      }
    });
    
    // Get bounding box dimensions and center
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    
    // Compute the distance needed to fit the box in view
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
    
    // Position the camera to look at the center of the bounding box
    const direction = cameraRef.current.position.clone()
      .sub(new THREE.Vector3(0, 0, 0)).normalize();
      
    cameraRef.current.position.copy(
      center.clone().add(direction.multiplyScalar(cameraDistance * 1.25))
    );
    
    cameraRef.current.lookAt(center);
    
    // Update controls
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [selectedElement]);

  const handleMouseMoveForPreview = useCallback((event: React.MouseEvent) => {
    if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !isPlacingComponent || !previewObject) return;
    
    // Calcola le coordinate normalizzate del mouse (-1 a +1)
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Calcola l'intersezione con un piano XY
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1)); // Piano XY
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseRef.current, cameraRef.current);
    
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    
    // Applica snapping se necessario
    let snapPosition = { x: intersection.x, y: intersection.y, z: intersection.z };
    if (snapSettings.enabled) {
      const snappedPoint = snapToPoint(snapPosition);
      if (snappedPoint) {
        snapPosition = snappedPoint;
      }
    }
    
    // Aggiorna la posizione dell'anteprima
    previewObject.position.set(snapPosition.x, snapPosition.y, snapPosition.z);
    setPreviewPosition(snapPosition);
    
    // Aggiorna la posizione del mouse per la barra di stato
    setMousePosition({
      x: Math.round(snapPosition.x * 100) / 100,
      y: Math.round(snapPosition.y * 100) / 100,
      z: Math.round(snapPosition.z * 100) / 100
    });
  }, [isPlacingComponent, previewObject, snapSettings.enabled, setMousePosition, snapToPoint]);

  const handleClickForPlacement = useCallback((event: React.MouseEvent) => {
    if (!isPlacingComponent || !previewComponent || !previewRef.current) return;
    
    // Posiziona effettivamente il componente
    const position = { ...previewPosition };
    
    // Crea un elemento CAD basato sul componente
    const newElement = {
      id: `component-${Date.now()}`,
      type: 'component',
      x: position.x,
      y: position.y,
      z: position.z,
      componentId: previewComponent,
      layerId: layers[0]?.id || 'default', // Usa il primo layer disponibile
      // Altre proprietà necessarie...
    };
    
    // Aggiungi l'elemento al canvas
    addElement(newElement);
    
    // Notifica il posizionamento attraverso il callback
    if (onComponentPlaced) {
      onComponentPlaced(previewComponent, position);
    }
    
    // Riabilita i controlli orbitali dopo il posizionamento
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }
    
    // Resetta lo stato di posizionamento
    setIsPlacingComponent(false);
  }, [isPlacingComponent, previewComponent, previewPosition, layers, addElement, onComponentPlaced]);

  useEffect(() => {
    if (!sceneRef.current || !previewComponent) {
      // Rimuovi l'anteprima se non c'è un componente selezionato
      if (previewRef.current && sceneRef.current) {
        sceneRef.current.remove(previewRef.current);
        previewRef.current = null;
      }
      setIsPlacingComponent(false);
      return;
    }
    
    // Rimuovi qualsiasi anteprima precedente
    if (previewRef.current) {
      sceneRef.current.remove(previewRef.current);
      previewRef.current = null;
    }
    
    // Trova il componente predefinito se è una stringa
    const component = typeof previewComponent === 'string' 
      ? predefinedComponents.find(c => c.data === previewComponent || c.name === previewComponent)
      : previewComponent;
      
    if (!component) return;
    
    // Crea un oggetto Three.js basato sul componente
    const threeObject = createComponentPreview(component);
    if (threeObject) {
     
      // Imposta l'oggetto come trasparente per indicare che è in anteprima
      if (threeObject instanceof THREE.Mesh) {
        const material = threeObject.material as THREE.MeshStandardMaterial;
        material.opacity = 0.7;
        material.color.set(0x4a90e2); // Colore blu per l'anteprima
      }
      
      // Posiziona l'oggetto all'origine o alla posizione del mouse
      threeObject.position.set(previewPosition.x, previewPosition.y, previewPosition.z);
      threeObject.userData.isPreview = true;
      threeObject.userData.componentId = previewComponent;
      
      sceneRef.current.add(threeObject);
      previewRef.current = threeObject;
      setIsPlacingComponent(true);
      
      // Disabilita i controlli orbitali durante il posizionamento
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
    }
  }, [previewComponent, previewPosition]);
  


  // Create control points for an element
  const createControlPointsForElement = (element: any): THREE.Object3D[] => {
    const controlPoints: THREE.Object3D[] = [];
    // Create smaller control points (reduced size from 5 to 3)
    const pointGeometry = new THREE.SphereGeometry(3, 12, 12);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    
    switch (element.type) {
      case 'line':
        // Create control points for line endpoints
        const point1 = new THREE.Mesh(pointGeometry, pointMaterial);
        point1.position.set(element.x1, element.y1, element.z1 || 0);
        point1.userData.isControlPoint = true;
        point1.userData.elementId = element.id;
        point1.userData.pointIndex = 0; // First endpoint
        point1.userData.controlFor = 'line';
        
        const point2 = new THREE.Mesh(pointGeometry, pointMaterial);
        point2.position.set(element.x2, element.y2, element.z2 || 0);
        point2.userData.isControlPoint = true;
        point2.userData.elementId = element.id;
        point2.userData.pointIndex = 1; // Second endpoint
        point2.userData.controlFor = 'line';
        
        controlPoints.push(point1, point2);
        break;
        
      case 'rectangle':
        // Create control points for rectangle corners and midpoints
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const rotationRad = (element.angle || 0) * Math.PI / 180;
        
        // Helper function to calculate rotated position
        const getRotatedPos = (x: number, y: number) => {
          const cos = Math.cos(rotationRad);
          const sin = Math.sin(rotationRad);
          const xRot = (x * cos - y * sin) + element.x;
          const yRot = (x * sin + y * cos) + element.y;
          return { x: xRot, y: yRot };
        };
        
        // Corner points
        const corners = [
          getRotatedPos(-halfWidth, -halfHeight), // Top-left
          getRotatedPos(halfWidth, -halfHeight),  // Top-right
          getRotatedPos(halfWidth, halfHeight),   // Bottom-right
          getRotatedPos(-halfWidth, halfHeight)   // Bottom-left
        ];
        
        corners.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx;
          point.userData.controlFor = 'rectangle';
          point.userData.isCorner = true;
          controlPoints.push(point);
        });
        
        // Midpoints
        const midpoints = [
          getRotatedPos(0, -halfHeight),  // Top
          getRotatedPos(halfWidth, 0),    // Right
          getRotatedPos(0, halfHeight),   // Bottom
          getRotatedPos(-halfWidth, 0)    // Left
        ];
        
        midpoints.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx + 4; // Offset after corners
          point.userData.controlFor = 'rectangle';
          point.userData.isMidpoint = true;
          controlPoints.push(point);
        });
        
        // Rotation handle - slightly smaller than in the previous implementation
        const rotationPoint = new THREE.Mesh(
          new THREE.CylinderGeometry(2, 2, 10, 12),
          new THREE.MeshBasicMaterial({ color: 0x00aaff })
        );
        const rotHandlePos = getRotatedPos(0, -halfHeight - 15);
        rotationPoint.position.set(rotHandlePos.x, rotHandlePos.y, element.z || 0);
        rotationPoint.userData.isControlPoint = true;
        rotationPoint.userData.elementId = element.id;
        rotationPoint.userData.pointIndex = 8;
        rotationPoint.userData.controlFor = 'rectangle';
        rotationPoint.userData.isRotationHandle = true;
        controlPoints.push(rotationPoint);
        break;
        
      case 'circle':
        // Create control points for circle - center and radius points
        const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        centerPoint.position.set(element.x, element.y, element.z || 0);
        centerPoint.userData.isControlPoint = true;
        centerPoint.userData.elementId = element.id;
        centerPoint.userData.pointIndex = 0;
        centerPoint.userData.controlFor = 'circle';
        centerPoint.userData.isCenter = true;
        
        // Points at cardinal directions for radius control
        const radiusPoints = [];
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2;
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + element.radius * Math.cos(angle),
            element.y + element.radius * Math.sin(angle),
            element.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = i + 1;
          radiusPoint.userData.controlFor = 'circle';
          radiusPoint.userData.isRadiusControl = true;
          radiusPoints.push(radiusPoint);
        }
        
        controlPoints.push(centerPoint, ...radiusPoints);
        break;
        
      case 'cube':
        // Create control points for cube - center and size controls
        const cubeCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cubeCenter.position.set(element.x, element.y, element.z || 0);
        cubeCenter.userData.isControlPoint = true;
        cubeCenter.userData.elementId = element.id;
        cubeCenter.userData.pointIndex = 0;
        cubeCenter.userData.controlFor = 'cube';
        cubeCenter.userData.isCenter = true;
        
        // Eight corners of the cube
        const corners3D = [];
        for (let i = 0; i < 8; i++) {
          const xSign = (i & 1) ? 1 : -1;
          const ySign = (i & 2) ? 1 : -1;
          const zSign = (i & 4) ? 1 : -1;
          
          const cornerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          cornerPoint.position.set(
            element.x + xSign * element.width / 2,
            element.y + ySign * element.height / 2,
            element.z + zSign * element.depth / 2
          );
          cornerPoint.userData.isControlPoint = true;
          cornerPoint.userData.elementId = element.id;
          cornerPoint.userData.pointIndex = i + 1;
          cornerPoint.userData.controlFor = 'cube';
          cornerPoint.userData.isCorner = true;
          corners3D.push(cornerPoint);
        }
        
        controlPoints.push(cubeCenter, ...corners3D);
        break;
        
      case 'sphere':
        // Create control points for sphere - center and radius controls
        const sphereCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        sphereCenter.position.set(element.x, element.y, element.z || 0);
        sphereCenter.userData.isControlPoint = true;
        sphereCenter.userData.elementId = element.id;
        sphereCenter.userData.pointIndex = 0;
        sphereCenter.userData.controlFor = 'sphere';
        sphereCenter.userData.isCenter = true;
        
        // Six direction controls for radius
        const directions = [
          [1, 0, 0], [-1, 0, 0],  // X axis
          [0, 1, 0], [0, -1, 0],  // Y axis
          [0, 0, 1], [0, 0, -1]   // Z axis
        ];
        
        const radiusControls = directions.map((dir, idx) => {
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + dir[0] * element.radius,
            element.y + dir[1] * element.radius,
            element.z + dir[2] * element.radius
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = idx + 1;
          radiusPoint.userData.controlFor = 'sphere';
          radiusPoint.userData.isRadiusControl = true;
          radiusPoint.userData.direction = dir;
          return radiusPoint;
        });
        
        controlPoints.push(sphereCenter, ...radiusControls);
        break;
        
      case 'cylinder':
        // Create control points for cylinder
        const cylinderCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderCenter.position.set(element.x, element.y, element.z || 0);
        cylinderCenter.userData.isControlPoint = true;
        cylinderCenter.userData.elementId = element.id;
        cylinderCenter.userData.pointIndex = 0;
        cylinderCenter.userData.controlFor = 'cylinder';
        
        // Radius control point
        const cylinderRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderRadiusPoint.position.set(
          element.x + element.radius, 
          element.y, 
          element.z || 0
        );
        cylinderRadiusPoint.userData.isControlPoint = true;
        cylinderRadiusPoint.userData.elementId = element.id;
        cylinderRadiusPoint.userData.pointIndex = 1;
        cylinderRadiusPoint.userData.controlFor = 'cylinder';
        
        // Height control points
        const topPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        topPoint.position.set(
          element.x,
          element.y,
          element.z + element.height / 2
        );
        topPoint.userData.isControlPoint = true;
        topPoint.userData.elementId = element.id;
        topPoint.userData.pointIndex = 2;
        topPoint.userData.controlFor = 'cylinder';
        
        const bottomPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        bottomPoint.position.set(
          element.x,
          element.y,
          element.z - element.height / 2
        );
        bottomPoint.userData.isControlPoint = true;
        bottomPoint.userData.elementId = element.id;
        bottomPoint.userData.pointIndex = 3;
        bottomPoint.userData.controlFor = 'cylinder';
        
        controlPoints.push(cylinderCenter, cylinderRadiusPoint, topPoint, bottomPoint);
        break;
        
      case 'cone':
        // Create control points for cone
        const coneBaseCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        coneBaseCenter.position.set(element.x, element.y, element.z || 0);
        coneBaseCenter.userData.isControlPoint = true;
        coneBaseCenter.userData.elementId = element.id;
        coneBaseCenter.userData.pointIndex = 0;
        coneBaseCenter.userData.controlFor = 'cone';
        
        // Base radius control point
        const coneRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneRadiusPoint.position.set(
          element.x + element.radius,
          element.y,
          element.z || 0
        );
        coneRadiusPoint.userData.isControlPoint = true;
        coneRadiusPoint.userData.elementId = element.id;
        coneRadiusPoint.userData.pointIndex = 1;
        coneRadiusPoint.userData.controlFor = 'cone';
        
        // Tip (height) control point
        const coneTipPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneTipPoint.position.set(
          element.x,
          element.y,
          element.z + element.height
        );
        coneTipPoint.userData.isControlPoint = true;
        coneTipPoint.userData.elementId = element.id;
        coneTipPoint.userData.pointIndex = 2;
        coneTipPoint.userData.controlFor = 'cone';
        
        controlPoints.push(coneBaseCenter, coneRadiusPoint, coneTipPoint);
        break;
        
      case 'torus':
        // Create control points for torus
        const torusCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        torusCenter.position.set(element.x, element.y, element.z || 0);
        torusCenter.userData.isControlPoint = true;
        torusCenter.userData.elementId = element.id;
        torusCenter.userData.pointIndex = 0;
        torusCenter.userData.controlFor = 'torus';
        
        // Main radius control point
        const mainRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        mainRadiusPoint.position.set(
          element.x + element.radius,
          element.y,
          element.z || 0
        );
        mainRadiusPoint.userData.isControlPoint = true;
        mainRadiusPoint.userData.elementId = element.id;
        mainRadiusPoint.userData.pointIndex = 1;
        mainRadiusPoint.userData.controlFor = 'torus';
        
        // Tube radius control point
        const tubeRadius = element.tube || element.radius / 4;
        const tubeRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        tubeRadiusPoint.position.set(
          element.x + element.radius + tubeRadius,
          element.y,
          element.z || 0
        );
        tubeRadiusPoint.userData.isControlPoint = true;
        tubeRadiusPoint.userData.elementId = element.id;
        tubeRadiusPoint.userData.pointIndex = 2;
        tubeRadiusPoint.userData.controlFor = 'torus';
        
        controlPoints.push(torusCenter, mainRadiusPoint, tubeRadiusPoint);
        break;
        
      case 'polygon':
        // Create control points for polygon
        const polygonCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        polygonCenter.position.set(element.x, element.y, element.z || 0);
        polygonCenter.userData.isControlPoint = true;
        polygonCenter.userData.elementId = element.id;
        polygonCenter.userData.pointIndex = 0;
        polygonCenter.userData.controlFor = 'polygon';
        
        const polygonPoints = [polygonCenter];
        
        // If it's a regular polygon with radius
        if (element.radius) {
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + element.radius,
            element.y,
            element.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = 1;
          radiusPoint.userData.controlFor = 'polygon';
          polygonPoints.push(radiusPoint);
        }
        
        // If it has custom points, add control points for each vertex
        if (element.points && element.points.length >= 3) {
          element.points.forEach((point: any, idx: number) => {
            const vertexPoint = new THREE.Mesh(pointGeometry, pointMaterial);
            vertexPoint.position.set(
              point.x || 0,
              point.y || 0,
              point.z || element.z || 0
            );
            vertexPoint.userData.isControlPoint = true;
            vertexPoint.userData.elementId = element.id;
            vertexPoint.userData.pointIndex = idx + 2; // Offset for center and radius points
            vertexPoint.userData.controlFor = 'polygon';
            polygonPoints.push(vertexPoint);
          });
        }
        
        controlPoints.push(...polygonPoints);
        break;
        
      case 'extrusion':
        // Create control points for extrusion
        const extrusionCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        extrusionCenter.position.set(element.x, element.y, element.z || 0);
        extrusionCenter.userData.isControlPoint = true;
        extrusionCenter.userData.elementId = element.id;
        extrusionCenter.userData.pointIndex = 0;
        extrusionCenter.userData.controlFor = 'extrusion';
        
        const extrusionPoints = [extrusionCenter];
        
        // Shape size control point
        const shapeControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        let controlX = element.x;
        let controlY = element.y;
        
        if (element.shape === 'rect' && element.width && element.height) {
          controlX = element.x + element.width / 2;
          controlY = element.y + element.height / 2;
        } else if (element.shape === 'circle' && element.radius) {
          controlX = element.x + element.radius;
        }
        
        shapeControlPoint.position.set(controlX, controlY, element.z || 0);
        shapeControlPoint.userData.isControlPoint = true;
        shapeControlPoint.userData.elementId = element.id;
        shapeControlPoint.userData.pointIndex = 1;
        shapeControlPoint.userData.controlFor = 'extrusion';
        extrusionPoints.push(shapeControlPoint);
        
        // Depth control point
        const depthControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        depthControlPoint.position.set(
          element.x,
          element.y,
          (element.z || 0) + element.depth
        );
        depthControlPoint.userData.isControlPoint = true;
        depthControlPoint.userData.elementId = element.id;
        depthControlPoint.userData.pointIndex = 2;
        depthControlPoint.userData.controlFor = 'extrusion';
        extrusionPoints.push(depthControlPoint);
        
        // Points for custom shapes
        if (element.points && element.points.length >= 3) {
          element.points.forEach((point: any, idx: number) => {
            const shapePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            shapePoint.position.set(
              element.x + (point.x || 0),
              element.y + (point.y || 0),
              element.z || 0
            );
            shapePoint.userData.isControlPoint = true;
            shapePoint.userData.elementId = element.id;
            shapePoint.userData.pointIndex = idx + 3; // Offset for center, shape, and depth
            shapePoint.userData.controlFor = 'extrusion';
            extrusionPoints.push(shapePoint);
          });
        }
        
        controlPoints.push(...extrusionPoints);
        break;
        
      case 'tube':
        // Create control points for tube
        const tubePoints = [];
        
        // Path points
        if (element.path && element.path.length >= 2) {
          element.path.forEach((point: any, idx: number) => {
            const pathPoint = new THREE.Mesh(pointGeometry, pointMaterial);
            pathPoint.position.set(
              point.x || 0,
              point.y || 0,
              point.z || 0
            );
            pathPoint.userData.isControlPoint = true;
            pathPoint.userData.elementId = element.id;
            pathPoint.userData.pointIndex = idx;
            pathPoint.userData.controlFor = 'tube';
            tubePoints.push(pathPoint);
          });
          
          // Radius control point - place it near the first path point
          const firstPoint = element.path[0];
          const secondPoint = element.path[1];
          
          // Calculate a direction perpendicular to the tube
          const dx = secondPoint.x - firstPoint.x;
          const dy = secondPoint.y - firstPoint.y;
          const length = Math.sqrt(dx*dx + dy*dy);
          
          // Normalize and get perpendicular direction
          const perpX = dy / length;
          const perpY = -dx / length;
          
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            firstPoint.x + perpX * element.radius,
            firstPoint.y + perpY * element.radius,
            firstPoint.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = element.path.length; // After all path points
          radiusPoint.userData.controlFor = 'tube';
          tubePoints.push(radiusPoint);
        }
        
        controlPoints.push(...tubePoints);
        break;
        
      case 'lathe':
        // Create control points for lathe
        const latheCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        latheCenter.position.set(element.x, element.y, element.z || 0);
        latheCenter.userData.isControlPoint = true;
        latheCenter.userData.elementId = element.id;
        latheCenter.userData.pointIndex = 0;
        latheCenter.userData.controlFor = 'lathe';
        
        const lathePoints = [latheCenter];
        
        // Profile points
        if (element.points && element.points.length >= 2) {
          element.points.forEach((point: any, idx: number) => {
            const profilePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            profilePoint.position.set(
              element.x + (point.x || 0),
              element.y + (point.y || 0),
              element.z || 0
            );
            profilePoint.userData.isControlPoint = true;
            profilePoint.userData.elementId = element.id;
            profilePoint.userData.pointIndex = idx + 1; // Offset for center
            profilePoint.userData.controlFor = 'lathe';
            lathePoints.push(profilePoint);
          });
        }
        
        controlPoints.push(...lathePoints);
        break;

      default:
        if ('x' in element && 'y' in element) {
          const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          centerPoint.position.set(element.x, element.y, element.z || 0);
          centerPoint.userData.isControlPoint = true;
          centerPoint.userData.elementId = element.id;
          centerPoint.userData.pointIndex = 0;
          centerPoint.userData.controlFor = element.type;
          centerPoint.userData.isCenter = true;
          controlPoints.push(centerPoint);
        }
        break;
    }
    useCADStore
    return controlPoints;
  };

  // Handle transforms when control points are dragged
  const handleControlPointDrag = useCallback((elementId: string, pointIndex: number, newX: number, newY: number, newZ: number = 0) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;
    
    let updates: any = {};
    
    switch (element.type) {
      case 'line':
        if (pointIndex === 0) {
          // First endpoint
          updates = { x1: newX, y1: newY, z1: newZ };
        } else if (pointIndex === 1) {
          // Second endpoint
          updates = { x2: newX, y2: newY, z2: newZ };
        }
        break;
        
      case 'rectangle':
        // Handle rectangle control points differently based on the point type
        if (pointIndex < 4) {
          // It's a corner - we need to recalculate dimensions
          const originalCenter = { x: element.x, y: element.y };
          const angle = (element.angle || 0) * Math.PI / 180;
          
          // Rotate the new position back to get aligned coordinates
          const cosAngle = Math.cos(-angle);
          const sinAngle = Math.sin(-angle);
          const alignedX = (newX - originalCenter.x) * cosAngle - (newY - originalCenter.y) * sinAngle;
          const alignedY = (newX - originalCenter.x) * sinAngle + (newY - originalCenter.y) * cosAngle;
          
          // Which corner is it?
          const isLeft = (pointIndex === 0 || pointIndex === 3);
          const isTop = (pointIndex === 0 || pointIndex === 1);
          
          // Get the opposite corner
          const oppCornerIdx = pointIndex < 2 ? pointIndex + 2 : pointIndex - 2;
          const oppCornerPoint = controlPointsRef.current.find(
            pt => pt.userData.elementId === elementId && pt.userData.pointIndex === oppCornerIdx
          );
          
          if (!oppCornerPoint) return;
          
          // Rotate the opposite corner position back too
          const oppX = (oppCornerPoint.position.x - originalCenter.x) * cosAngle - 
                      (oppCornerPoint.position.y - originalCenter.y) * sinAngle;
          const oppY = (oppCornerPoint.position.x - originalCenter.x) * sinAngle + 
                      (oppCornerPoint.position.y - originalCenter.y) * cosAngle;
          
          // Calculate new width, height and center
          const newWidth = Math.abs(alignedX - oppX);
          const newHeight = Math.abs(alignedY - oppY);
          const newCenterX = (alignedX + oppX) / 2;
          const newCenterY = (alignedY + oppY) / 2;
          
          // Rotate the center back to world coordinates
          const worldCenterX = originalCenter.x + newCenterX * Math.cos(angle) - newCenterY * Math.sin(angle);
          const worldCenterY = originalCenter.y + newCenterX * Math.sin(angle) + newCenterY * Math.cos(angle);
          
          updates = {
            width: newWidth,
            height: newHeight,
            x: worldCenterX,
            y: worldCenterY
          };
          
        } else if (pointIndex < 8) {
          // It's a midpoint - adjust one dimension
          const angle = (element.angle || 0) * Math.PI / 180;
          const direction = pointIndex - 4; // 0: top, 1: right, 2: bottom, 3: left
          
          // Get vector from center to new point
          const deltaX = newX - element.x;
          const deltaY = newY - element.y;
          
          // Rotate it to align with rectangle
          const rotDeltaX = deltaX * Math.cos(-angle) - deltaY * Math.sin(-angle);
          const rotDeltaY = deltaX * Math.sin(-angle) + deltaY * Math.cos(-angle);
          
          if (direction === 0 || direction === 2) {
            // Top or bottom - adjust height
            const newHeight = Math.abs(rotDeltaY) * 2;
            updates = { height: newHeight };
          } else {
            // Left or right - adjust width
            const newWidth = Math.abs(rotDeltaX) * 2;
            updates = { width: newWidth };
          }
          
        } else if (pointIndex === 8) {
          // Rotation handle
          // Calculate angle from center to current position
          const deltaX = newX - element.x;
          const deltaY = newY - element.y;
          const newAngle = (Math.atan2(deltaY, deltaX) * 180 / Math.PI) + 90;
          updates = { angle: newAngle };
        }
        break;
        
      case 'circle':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else {
          // Radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const newRadius = Math.sqrt(dx*dx + dy*dy);
          updates = { radius: newRadius };
        }
        break;
        
      case 'cube':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else {
          // Corner point - need to recalculate dimensions
          const i = pointIndex - 1;
          const xSign = (i & 1) ? 1 : -1;
          const ySign = (i & 2) ? 1 : -1;
          const zSign = (i & 4) ? 1 : -1;
          
          // Distance from corner to center along each axis
          const dx = Math.abs(newX - element.x);
          const dy = Math.abs(newY - element.y);
          const dz = Math.abs(newZ - element.z);
          
          updates = {
            width: dx * 2,
            height: dy * 2,
            depth: dz * 2
          };
        }
        break;
        
      case 'sphere':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else {
          // Radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const dz = newZ - element.z;
          const newRadius = Math.sqrt(dx*dx + dy*dy + dz*dz);
          updates = { radius: newRadius };
        }
        break;
        
      case 'cylinder':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else if (pointIndex === 1) {
          // Radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const newRadius = Math.sqrt(dx*dx + dy*dy);
          updates = { radius: newRadius };
        } else if (pointIndex === 2 || pointIndex === 3) {
          // Height control points
          const dz = Math.abs(newZ - element.z);
          updates = { height: dz * 2 };
        }
        break;
        
      case 'cone':
        if (pointIndex === 0) {
          // Center point (base center)
          updates = { x: newX, y: newY, z: newZ };
        } else if (pointIndex === 1) {
          // Base radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const newRadius = Math.sqrt(dx*dx + dy*dy);
          updates = { radius: newRadius };
        } else if (pointIndex === 2) {
          // Height control point (tip of cone)
          const dz = Math.abs(newZ - element.z);
          updates = { height: dz };
        }
        break;
        
      case 'torus':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else if (pointIndex === 1) {
          // Main radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const newRadius = Math.sqrt(dx*dx + dy*dy);
          updates = { radius: newRadius };
        } else if (pointIndex === 2) {
          // Tube radius control point
          const tubeRadius = element.tube || element.radius / 4;
          const mainRadius = element.radius;
          
          // Calculate new tube radius based on drag distance from torus ring
          const dx = newX - element.x;
          const dy = newY - element.y;
          const distanceFromCenter = Math.sqrt(dx*dx + dy*dy);
          const newTubeRadius = Math.abs(distanceFromCenter - mainRadius);
          
          updates = { tube: newTubeRadius };
        }
        break;
        
      case 'polygon':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else if (pointIndex === 1) {
          // Radius control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          const newRadius = Math.sqrt(dx*dx + dy*dy);
          updates = { radius: newRadius };
        } else if (pointIndex > 1 && element.points) {
          // Vertex control point
          const vertexIndex = pointIndex - 2;
          if (vertexIndex < element.points.length) {
            // Create a copy of points array
            const newPoints = [...element.points];
            // Update the point being dragged
            newPoints[vertexIndex] = { x: newX, y: newY, z: newZ };
            updates = { points: newPoints };
          }
        }
        break;
        
      case 'extrusion':
        if (pointIndex === 0) {
          // Center point
          updates = { x: newX, y: newY, z: newZ };
        } else if (pointIndex === 1) {
          // Width/height control point
          const dx = newX - element.x;
          const dy = newY - element.y;
          
          // For rectangular extrusions
          if (element.shape === 'rect') {
            const distance = Math.sqrt(dx*dx + dy*dy);
            updates = { width: distance * 2, height: distance * 1.5 };
          } 
          // For circular extrusions
          else if (element.shape === 'circle') {
            const newRadius = Math.sqrt(dx*dx + dy*dy);
            updates = { radius: newRadius };
          }
        } else if (pointIndex === 2) {
          // Depth control point
          const dz = Math.abs(newZ - element.z);
          updates = { depth: dz };
        } else if (pointIndex > 2 && element.points) {
          // Shape point control (for custom shapes)
          const adjustedPointIndex = pointIndex - 3;
          if (adjustedPointIndex < element.points.length) {
            // Create a copy of points array
            const newPoints = [...element.points];
            // Update the point being dragged
            newPoints[pointIndex] = { x: newX - element.x, y: newY - element.y };
            updates = { points: newPoints };
          }
        }
        break;
        
      case 'tube':
        if (element.path && pointIndex < element.path.length) {
          // Path point control
          const newPath = [...element.path];
          newPath[pointIndex] = { x: newX, y: newY, z: newZ };
          updates = { path: newPath };
        } else if (pointIndex === element.path?.length) {
          // Radius control point
          // First find the closest point on the path
          let minDist = Infinity;
          let closestPointIndex = 0;
          
          for (let i = 0; i < element.path.length; i++) {
            const point = element.path[i];
            const dist = Math.sqrt(
              Math.pow(point.x - newX, 2) + 
              Math.pow(point.y - newY, 2) + 
              Math.pow((point.z || 0) - newZ, 2)
            );
            
            if (dist < minDist) {
              minDist = dist;
              closestPointIndex = i;
            }
          }
          
          // Calculate new radius as distance from path point to drag position
          const pathPoint = element.path[closestPointIndex];
          const dx = newX - pathPoint.x;
          const dy = newY - pathPoint.y;
          const dz = newZ - (pathPoint.z || 0);
          const newRadius = Math.sqrt(dx*dx + dy*dy + dz*dz);
          
          updates = { radius: newRadius };
        }
        break;
        
      case 'lathe':
        if (pointIndex === 0) {
          // Center of rotation
          updates = { x: newX, y: newY, z: newZ };
        } else if (element.points && pointIndex - 1 < element.points.length) {
          // Profile point control
          const updatedPointIndex = pointIndex - 1;
          const newPoints = [...element.points];
          
          // Update relative to center of rotation
          newPoints[updatedPointIndex] = { 
            x: Math.abs(newX - element.x), // Keep x positive for lathe profile
            y: newY - element.y
          };
          
          updates = { points: newPoints };
        }
        break;
        
      case 'component':
        // For components, just update the position
        updates = { 
          x: newX, 
          y: newY, 
          z: newZ 
        };
        break;
        
      case 'group':
        // Group elements should be moved together
        updates = { 
          x: newX, 
          y: newY, 
          z: newZ 
        };
        break;
        
      default:
        if ('x' in element && 'y' in element) {
          // For center-based elements
          updates = { x: newX, y: newY, z: newZ };
        }
        break;
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updateElement(elementId, updates);
    }
  }, [elements, updateElement]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2A2A2A');
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.01,   // Near plane molto più vicino per zoom estremo (era 0.1)
      5000    // Far plane molto più lontano per vista distante (era 1000)
    );
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // Aumenta il range di zoom permettendo sia un livello molto ravvicinato che molto distante
    controls.minDistance = 0.1;  // Zoom ravvicinato molto più vicino (era 5)
    controls.maxDistance = 500;  // Zoom molto più lontano (era 100)
    // Aggiungi la velocità di zoom per un controllo più preciso
    controls.zoomSpeed = 1.5;
    // Attiva il pannello sensibile alla rotella del mouse per uno zoom più intuitivo
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controlsRef.current = controls;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Add grid
    const gridHelper = new THREE.GridHelper(500, 500);  // Griglia molto più ampia (era 100x100)
    gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
    gridHelper.visible = gridVisible;
    scene.add(gridHelper);

    // Create custom axes
    const createCustomAxes = (size: number) => {
      // Create materials for each axis with distinct colors
      const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // Blue for X axis
      const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Magenta for Y axis
      const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff7f }); // Green for Z axis

      // Create geometries for each axis - raddoppiata la lunghezza
      const xAxisGeometry = new THREE.BufferGeometry();
      xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-size*2, 0, 0, size*2, 0, 0], 3));
      const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
      
      const yAxisGeometry = new THREE.BufferGeometry();
      yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -size*2, 0, 0, size*2, 0], 3));
      const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
      
      const zAxisGeometry = new THREE.BufferGeometry();
      zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -size*2, 0, 0, size*2], 3));
      const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);

      // Add labels for axes
      const addAxisLabel = (text: string, position: [number, number, number], color: THREE.Color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
          context.font = 'Bold 48px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(text, 32, 32);
          
          const texture = new THREE.CanvasTexture(canvas);
          const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.position.set(...position);
          sprite.scale.set(2, 2, 2);
          return sprite;
        }
        return null;
      };

      // Create a group to contain all axis elements
      const axesGroup = new THREE.Group();
      axesGroup.add(xAxis);
      axesGroup.add(yAxis);
      axesGroup.add(zAxis);
      
      // Add labels
      const xLabel = addAxisLabel('X', [size + 1, 0, 0], new THREE.Color(0, 0, 1));
      const yLabel = addAxisLabel('Y', [0, size + 1, 0], new THREE.Color(1, 0, 1));
      const zLabel = addAxisLabel('Z', [0, 0, size + 1], new THREE.Color(0, 1, 0.5));
      
      if (xLabel) axesGroup.add(xLabel);
      if (yLabel) axesGroup.add(yLabel);
      if (zLabel) axesGroup.add(zLabel);
      
      return axesGroup;
    };

    // Create and add custom axes to the scene
    const customAxes = createCustomAxes(20);  // Assi più lunghi (era 10)
    customAxes.visible = axisVisible;
    customAxes.userData.isCustomAxes = true;
    scene.add(customAxes);

    // Store canvas dimensions
    setCanvasDimensions({
      width: canvasRef.current.clientWidth,
      height: canvasRef.current.clientHeight
    });

    

    // Animation loop
    const animateScene = () => {
      // Store animation frame ID so we can cancel it later
      const animationId = requestAnimationFrame(animateScene);
      
      // Check if TransformControls has a valid object
      if (transformControlsRef.current?.object) {
        const object = transformControlsRef.current.object;
        if (object.parent === null) {
          transformControlsRef.current.detach();
          console.warn("TransformControls: Detached object that lost scene connection");
        } else {
          object.updateMatrixWorld(true);
          object.parent.updateMatrixWorld(true);
        }
      }
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && cameraRef.current && sceneRef.current) {
        sceneRef.current.updateMatrixWorld(true);
        SmartRenderer.smartRender(
          sceneRef.current,
          cameraRef.current,
          rendererRef.current,
          {
            cullDistance: 1000,
            updateThreshold: 16,
            forceUpdate: isModifying // true durante trasformazioni attive
          }
        );
      }
      
      return animationId;
      
    };
    
    // Store the returned animation ID
    const animationId = animateScene();
    

    // Handle resize
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;
      
      setCanvasDimensions({ width, height });
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);

    // Add fullscreen change event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      
      if (rendererRef.current) {
        rendererRef.current.domElement.parentElement?.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [axisVisible, gridVisible, isModifying]);

  // Handle fullscreen change
  const handleFullscreenChange = () => {
    const isCurrentlyFullscreen = document.fullscreenElement;
    setIsFullscreen(!!isCurrentlyFullscreen);
    
    // Adjust renderer size after fullscreen change
    setTimeout(() => {
      if (canvasRef.current && rendererRef.current && cameraRef.current) {
        const width = canvasRef.current.clientWidth;
        const height = canvasRef.current.clientHeight;
        
        setCanvasDimensions({ width, height });
        
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        
        rendererRef.current.setSize(width, height);
      }
    }, 100);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!canvasRef.current) return;
    
    if (!isFullscreen) {
      if (canvasRef.current.requestFullscreen) {
        canvasRef.current.requestFullscreen();
      } else if ((canvasRef.current as any).webkitRequestFullscreen) {
        (canvasRef.current as any).webkitRequestFullscreen();
      } else if ((canvasRef.current as any).mozRequestFullScreen) {
        (canvasRef.current as any).mozRequestFullScreen();
      } else if ((canvasRef.current as any).msRequestFullscreen) {
        (canvasRef.current as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
  };

  const ensureObjectInScene = useCallback((object: THREE.Object3D<THREE.Event>) => {
    if (!object || !sceneRef.current) return false;
    
    // Check if object is directly in the scene
    if (sceneRef.current.children.includes(object)) {
      return true;
    }
    
    // Check if object is a child of any object in the scene
    let isInScene = false;
    sceneRef.current.traverse((child) => {
      if (child === object) {
        isInScene = true;
      }
    });
    
    return isInScene;
  }, []);
  // Handle mouse events to update cursor state


  // Update grid and axis visibility
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Update grid visibility
    const gridHelper = sceneRef.current.children.find(
      child => child instanceof THREE.GridHelper
    ) as THREE.GridHelper | undefined;
    
    if (gridHelper) {
      gridHelper.visible = gridVisible;
    }
    
    // Update custom axes visibility
    const customAxes = sceneRef.current.children.find(
      child => child.userData.isCustomAxes
    );
    
    if (customAxes) {
      customAxes.visible = axisVisible;
    }
  }, [gridVisible, axisVisible]);

  // Update camera and controls when view mode changes
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    switch (viewMode) {
      case '2d':
        // Position camera for top-down 2D view
        cameraRef.current.position.set(0, 0, 10);
        cameraRef.current.lookAt(0, 0, 0);
        controlsRef.current.enableRotate = false;
        controlsRef.current.enablePan = true;
        controlsRef.current.minDistance = 0.1;   // Ridotto per permettere uno zoom ravvicinato
        controlsRef.current.maxDistance = 1000;  // Aumentato per permettere una visione d'insieme più ampia
        break;
      case '3d':
        // Position camera for 3D view
        cameraRef.current.position.set(5, 5, 5);
        cameraRef.current.lookAt(0, 0, 0);
        controlsRef.current.enableRotate = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.minDistance = 0.1;   // Ridotto per permettere uno zoom ravvicinato
        controlsRef.current.maxDistance = 1000;  // Aumentato per permettere una visione d'insieme più ampia
        break;
      default:
        break;
    }
  }, [viewMode]);

  // Handle preview component changes
  useEffect(() => {
    if (!sceneRef.current || !previewComponent) {
      // Remove preview object if no component is selected
      if (previewObject && sceneRef.current) {
        sceneRef.current.remove(previewObject);
        setPreviewObject(null);
      }
      return;
    }
    
    // Remove any previous preview objects
    if (previewObject) {
      sceneRef.current.remove(previewObject);
      setPreviewObject(null);
    }
    
    // Find the predefined component if it's a string name
    const component = typeof previewComponent === 'string' 
      ? predefinedComponents.find(c => c.name === previewComponent)
      : previewComponent;
      
    if (!component) return;
    
    // Create a Three.js object based on the component
    const threeObject = createComponentPreview(component);
    if (threeObject) {
      threeObject.position.set(0, 0, 0); // Position at center of scene
      threeObject.userData.isPreview = true;
      sceneRef.current.add(threeObject);
      setPreviewObject(threeObject);
    }
  }, [previewComponent, previewObject]);

  // Create Three.js objects from CAD elements
const createThreeObject = (element: any): THREE.Object3D | null => {
  const { originOffset } = useCADStore.getState();
   // Check if element is on a visible layer
  
   
  

  switch (element.type) {
    // ======= BASIC PRIMITIVES =======
    case 'cube':
      const cubeGeometry = new THREE.BoxGeometry(
        element.width,
        element.height,
        element.depth
      );
      
      const cubeMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x1e88e5,
        wireframe: element.wireframe || false
      });
      
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return cube;
      
    case 'sphere':
      const sphereGeometry = new THREE.SphereGeometry(
        element.radius,
        element.segments || 32,
        element.segments || 32
      );
      
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x1e88e5,
        wireframe: element.wireframe || false
      });
      
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return sphere;
      
    case 'cylinder':
      const cylinderGeometry = new THREE.CylinderGeometry(
        element.radius,
        element.radius,
        element.height,
        element.segments || 32
      );
      
      const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0xFFC107,
        wireframe: element.wireframe || false
      });
      
      const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
      cylinder.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Rotation for standard orientation
      cylinder.rotation.x = Math.PI / 2;
      return cylinder;
    
    case 'cone':
      const coneGeometry = new THREE.ConeGeometry(
        element.radius,
        element.height,
        element.segments || 32
      );
      
      const coneMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x9C27B0,
        wireframe: element.wireframe || false
      });
      
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      cone.rotation.x = Math.PI / 2;
      return cone;
    
    case 'torus':
      const torusGeometry = new THREE.TorusGeometry(
        element.radius,
        element.tubeRadius || element.radius / 4,
        element.radialSegments || 16,
        element.tubularSegments || 100
      );
      
      const torusMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0xFF9800,
        wireframe: element.wireframe || false
      });
      
      const torus = new THREE.Mesh(torusGeometry, torusMaterial);
      torus.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return torus;
      
    // ======= ADVANCED PRIMITIVES =======
    case 'pyramid':
      // Create pyramid geometry using BufferGeometry
      const pyramidGeometry = new THREE.BufferGeometry();
      
      // Define vertices for a square-based pyramid
      const baseWidth = element.baseWidth || 1;
      const baseDepth = element.baseDepth || 1;
      const pyramidHeight = element.height || 1;
      
      const vertices = new Float32Array([
        // Base
        -baseWidth/2, -pyramidHeight/2, -baseDepth/2,
        baseWidth/2, -pyramidHeight/2, -baseDepth/2,
        baseWidth/2, -pyramidHeight/2, baseDepth/2,
        -baseWidth/2, -pyramidHeight/2, baseDepth/2,
        // Apex
        0, pyramidHeight/2, 0
      ]);
      
      // Define faces using indices
      const indices = [
        // Base
        0, 1, 2,
        0, 2, 3,
        // Sides
        0, 4, 1,
        1, 4, 2,
        2, 4, 3,
        3, 4, 0
      ];
      
      pyramidGeometry.setIndex(indices);
      pyramidGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      pyramidGeometry.computeVertexNormals();
      
      const pyramidMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0xE91E63,
        wireframe: element.wireframe || false
      });
      
      const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
      pyramid.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return pyramid;
      
    case 'prism':
      // Create prism geometry (like a cylinder with polygon base)
      const sides = element.sides || 6;
      const prismGeometry = new THREE.CylinderGeometry(
        element.radius,
        element.radius,
        element.height,
        sides
      );
      
      const prismMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x3F51B5,
        wireframe: element.wireframe || false
      });
      
      const prism = new THREE.Mesh(prismGeometry, prismMaterial);
      prism.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      prism.rotation.x = Math.PI / 2;
      return prism;
      
    case 'hemisphere':
      const hemisphereGeometry = new THREE.SphereGeometry(
        element.radius,
        element.segments || 32,
        element.segments || 32,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );
      
      const hemisphereMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x00BCD4,
        wireframe: element.wireframe || false
      });
      
      const hemisphere = new THREE.Mesh(hemisphereGeometry, hemisphereMaterial);
      hemisphere.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Rotate based on direction
      if (element.direction === "down") {
        hemisphere.rotation.x = Math.PI;
      }
      
      return hemisphere;
      
    case 'ellipsoid':
      // Create sphere and scale it to make an ellipsoid
      const ellipsoidGeometry = new THREE.SphereGeometry(
        1, // We'll scale it
        element.segments || 32,
        element.segments || 32
      );
      
      const ellipsoidMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x8BC34A,
        wireframe: element.wireframe || false
      });
      
      const ellipsoid = new THREE.Mesh(ellipsoidGeometry, ellipsoidMaterial);
      ellipsoid.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Scale to create ellipsoid shape
      ellipsoid.scale.set(
        element.radiusX || 1,
        element.radiusY || 0.75,
        element.radiusZ || 0.5
      );
      
      return ellipsoid;
      
    case 'capsule':
      // Three.js doesn't have a built-in capsule, so use CapsuleGeometry from three/examples
      // Fallback to cylinder with hemisphere caps if not available
      let capsuleGeometry;
      
      try {
        // Try to use CapsuleGeometry if available
        capsuleGeometry = new THREE.CapsuleGeometry(
          element.radius || 0.5,
          element.height || 2,
          element.capSegments || 8,
          element.radialSegments || 16
        );
      } catch (e) {
        // Fallback: Create a group with cylinder and two hemispheres
        const capsuleGroup = new THREE.Group();
        
        const radius = element.radius || 0.5;
        const height = element.height || 2;
        
        // Cylinder for body
        const bodyCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, height, 32),
          new THREE.MeshStandardMaterial({ color: element.color || 0x673AB7 })
        );
        capsuleGroup.add(bodyCylinder);
        
        // Top hemisphere
        const topHemisphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: element.color || 0x673AB7 })
        );
        topHemisphere.position.y = height / 2;
        topHemisphere.rotation.x = Math.PI;
        capsuleGroup.add(topHemisphere);
        
        // Bottom hemisphere
        const bottomHemisphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: element.color || 0x673AB7 })
        );
        bottomHemisphere.position.y = -height / 2;
        capsuleGroup.add(bottomHemisphere);
        
        capsuleGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Set rotation based on direction
        if (element.direction === "x") {
          capsuleGroup.rotation.z = Math.PI / 2;
        } else if (element.direction === "z") {
          capsuleGroup.rotation.x = Math.PI / 2;
        }
        
        return capsuleGroup;
      }
      
      // If CapsuleGeometry is available
      const capsuleMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x673AB7,
        wireframe: element.wireframe || false
      });
      
      const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
      capsule.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Set rotation based on direction
      if (element.direction === "x") {
        capsule.rotation.z = Math.PI / 2;
      } else if (element.direction === "z") {
        capsule.rotation.x = Math.PI / 2;
      }
      
      return capsule;


       // ======= MEASUREMENT ELEMENTS =======
    case 'linear-dimension':
      // Create a linear dimension between two points
      if (!element.startPoint || !element.endPoint) return null;
      
      const dimensionGroup = new THREE.Group();
      
      // Start and end points
      const startPoint2 = new THREE.Vector3(
        element.startPoint2.x + originOffset.x,
        element.startPoint2.y + originOffset.y,
        (element.startPoint2.z || 0) + originOffset.z
      );
      
      const endPoint2 = new THREE.Vector3(
        element.endPoint2.x + originOffset.x,
        element.endPoint2.y + originOffset.y,
        (element.endPoint2.z || 0) + originOffset.z
      );
      
      // Calculate dimension line offset
      const offsetDirection = element.offsetDirection || 'y';
      const offsetAmount = element.offsetAmount || 10;
      
      // Create dimension line
      const directionVector = new THREE.Vector3().subVectors(endPoint2, startPoint2);
      const length = directionVector.length();
      
      const dimensionLineMaterial = new THREE.LineBasicMaterial({ 
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      // Create offset points for dimension line
      const startOffset = startPoint2.clone();
      const endOffset = endPoint2.clone();
      
      if (offsetDirection === 'y') {
        startOffset.y += offsetAmount;
        endOffset.y += offsetAmount;
      } else if (offsetDirection === 'x') {
        startOffset.x += offsetAmount;
        endOffset.x += offsetAmount;
      } else if (offsetDirection === 'z') {
        startOffset.z += offsetAmount;
        endOffset.z += offsetAmount;
      }
      
      // Main dimension line
      const dimensionLineGeometry = new THREE.BufferGeometry().setFromPoints([
        startOffset,
        endOffset
      ]);
      const dimensionLine = new THREE.Line(dimensionLineGeometry, dimensionLineMaterial);
      dimensionGroup.add(dimensionLine);
      
      // Extension lines
      const extensionLine1Geometry = new THREE.BufferGeometry().setFromPoints([
        startPoint2,
        startOffset
      ]);
      const extensionLine2Geometry = new THREE.BufferGeometry().setFromPoints([
        endPoint2,
        endOffset
      ]);
      
      const extensionLine1 = new THREE.Line(extensionLine1Geometry, dimensionLineMaterial);
      const extensionLine2 = new THREE.Line(extensionLine2Geometry, dimensionLineMaterial);
      
      dimensionGroup.add(extensionLine1);
      dimensionGroup.add(extensionLine2);
      
      // Add dimension text (requires TextGeometry which needs font loading)
      // For now, we'll create a placeholder for the text
      const textPosition = new THREE.Vector3(
        (startOffset.x + endOffset.x) / 2,
        (startOffset.y + endOffset.y) / 2,
        (startOffset.z + endOffset.z) / 2
      );
      
      // Format display value
      const dimensionValue = element.value || length.toFixed(2);
      const dimensionUnit = element.unit || 'mm';
      const dimensionText = `${dimensionValue} ${dimensionUnit}`;
      
      // Create text placeholder as a small plane
      const textPlaceholder2 = new THREE.Mesh(
        new THREE.PlaneGeometry(dimensionText.length * 0.8, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.7
        })
      );
      
      textPlaceholder2.position.copy(textPosition);
      textPlaceholder2.userData.text = dimensionText;
      textPlaceholder2.userData.isDimensionText = true;
      
      dimensionGroup.add(textPlaceholder2);
      
      // Add arrows at the ends of the dimension line
      // This would require custom geometry for proper arrows
      
      dimensionGroup.userData.isDimension = true;
      dimensionGroup.userData.dimensionType = 'linear';
      dimensionGroup.userData.dimensionValue = dimensionValue;
      dimensionGroup.userData.dimensionUnit = dimensionUnit;
      
      return dimensionGroup;
      
    case 'angular-dimension':
      if (!element.vertex || !element.startPoint || !element.endPoint) return null;
      
      const angularDimensionGroup = new THREE.Group();
      
      // Points
      const vertex = new THREE.Vector3(
        element.vertex.x + originOffset.x,
        element.vertex.y + originOffset.y,
        (element.vertex.z || 0) + originOffset.z
      );
      
      const angularStartPoint = new THREE.Vector3(
        element.startPoint.x + originOffset.x,
        element.startPoint.y + originOffset.y,
        (element.startPoint.z || 0) + originOffset.z
      );
      
      const angularEndPoint = new THREE.Vector3(
        element.endPoint.x + originOffset.x,
        element.endPoint.y + originOffset.y,
        (element.endPoint.z || 0) + originOffset.z
      );
      
      // Calculate vectors
      const v1 = new THREE.Vector3().subVectors(angularStartPoint, vertex);
      const v2 = new THREE.Vector3().subVectors(angularEndPoint, vertex);
      
      // Calculate angle
      const angle = v1.angleTo(v2);
      const radius = element.radius || 5;
      
      // Create circular arc for the angle
      const arcCurve = new THREE.EllipseCurve(
        vertex.x, vertex.y,
        radius, radius,
        0, angle,
        false,
        0
      );
      
      const arcPoints = arcCurve.getPoints(50);
      const arcGeometry2 = new THREE.BufferGeometry().setFromPoints(arcPoints);
      
      const arcMaterial2 = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      const arc2 = new THREE.Line(arcGeometry2, arcMaterial2);
      arc2.position.z = vertex.z;
      angularDimensionGroup.add(arc2);
      
      // Extension lines from vertex to start/end points
      const angularLine1Geometry = new THREE.BufferGeometry().setFromPoints([
        vertex,
        angularStartPoint
      ]);
      
      const angularLine2Geometry = new THREE.BufferGeometry().setFromPoints([
        vertex,
        angularEndPoint
      ]);
      
      const angularLine1 = new THREE.Line(angularLine1Geometry, arcMaterial2);
      const angularLine2 = new THREE.Line(angularLine2Geometry, arcMaterial2);
      
      angularDimensionGroup.add(angularLine1);
      angularDimensionGroup.add(angularLine2);
      
      // Add angular text
      const angleInDegrees = (angle * 180 / Math.PI).toFixed(1);
      const midAngle = angle / 2;
      
      const textX = vertex.x + (radius * 1.2) * Math.cos(midAngle);
      const textY = vertex.y + (radius * 1.2) * Math.sin(midAngle);
      
      const angularTextPlaceholder = new THREE.Mesh(
        new THREE.PlaneGeometry(angleInDegrees.length + 2, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.7
        })
      );
      
      angularTextPlaceholder.position.set(textX, textY, vertex.z);
      angularTextPlaceholder.userData.text = `${angleInDegrees}°`;
      angularTextPlaceholder.userData.isAngularDimensionText = true;
      
      angularDimensionGroup.add(angularTextPlaceholder);
      
      angularDimensionGroup.userData.isDimension = true;
      angularDimensionGroup.userData.dimensionType = 'angular';
      angularDimensionGroup.userData.dimensionValue = angleInDegrees;
      
      return angularDimensionGroup;
      
    case 'radius-dimension':
      if (!element.center || !element.pointOnCircle) return null;
      
      const radiusDimensionGroup = new THREE.Group();
      
      // Points
      const center = new THREE.Vector3(
        element.center.x + originOffset.x,
        element.center.y + originOffset.y,
        (element.center.z || 0) + originOffset.z
      );
      
      const pointOnCircle = new THREE.Vector3(
        element.pointOnCircle.x + originOffset.x,
        element.pointOnCircle.y + originOffset.y,
        (element.pointOnCircle.z || 0) + originOffset.z
      );
      
      // Calculate radius
      const radiusVector = new THREE.Vector3().subVectors(pointOnCircle, center);
      const radiusLength = radiusVector.length();
      
      // Create line from center to point
      const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([
        center,
        pointOnCircle
      ]);
      
      const radiusLineMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
      radiusDimensionGroup.add(radiusLine);
      
      // Add radius text
      const radiusText = `R${radiusLength.toFixed(2)}`;
      const radiusTextPosition = new THREE.Vector3().addVectors(
        center,
        radiusVector.clone().multiplyScalar(0.5)
      );
      
      const radiusTextPlaceholder = new THREE.Mesh(
        new THREE.PlaneGeometry(radiusText.length * 0.8, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.7
        })
      );
      
      radiusTextPlaceholder.position.copy(radiusTextPosition);
      radiusTextPlaceholder.userData.text = radiusText;
      radiusTextPlaceholder.userData.isRadiusDimensionText = true;
      
      radiusDimensionGroup.add(radiusTextPlaceholder);
      
      radiusDimensionGroup.userData.isDimension = true;
      radiusDimensionGroup.userData.dimensionType = 'radius';
      radiusDimensionGroup.userData.dimensionValue = radiusLength.toFixed(2);
      
      return radiusDimensionGroup;
      
    case 'diameter-dimension':
      if (!element.center || !element.pointOnCircle) return null;
      
      const diameterDimensionGroup = new THREE.Group();
      
      // Points
      const diameterCenter = new THREE.Vector3(
        element.center.x + originOffset.x,
        element.center.y + originOffset.y,
        (element.center.z || 0) + originOffset.z
      );
      
      const diameterPoint = new THREE.Vector3(
        element.pointOnCircle.x + originOffset.x,
        element.pointOnCircle.y + originOffset.y,
        (element.pointOnCircle.z || 0) + originOffset.z
      );
      
      // Calculate diameter vector and extend to opposite side
      const diameterVector = new THREE.Vector3().subVectors(diameterPoint, diameterCenter);
      const diameterLength = diameterVector.length() * 2;
      
      const oppositePoint = diameterCenter.clone().sub(diameterVector);
      
      // Create line from one side to the other
      const diameterLineGeometry = new THREE.BufferGeometry().setFromPoints([
        diameterPoint,
        oppositePoint
      ]);
      
      const diameterLineMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1,
      
      });
      
      const diameterLine = new THREE.Line(diameterLineGeometry, diameterLineMaterial);
      diameterDimensionGroup.add(diameterLine);
      
      // Add diameter text
      const diameterText = `Ø${diameterLength.toFixed(2)}`;
      
      const diameterTextPlaceholder = new THREE.Mesh(
        new THREE.PlaneGeometry(diameterText.length * 0.8, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.7
        })
      );
      
      diameterTextPlaceholder.position.copy(diameterCenter);
      diameterTextPlaceholder.userData.text = diameterText;
      diameterTextPlaceholder.userData.isDiameterDimensionText = true;
      
      diameterDimensionGroup.add(diameterTextPlaceholder);
      
      diameterDimensionGroup.userData.isDimension = true;
      diameterDimensionGroup.userData.dimensionType = 'diameter';
      diameterDimensionGroup.userData.dimensionValue = diameterLength.toFixed(2);
      
      return diameterDimensionGroup;
    
    // ======= DRAWING ELEMENTS =======
    case 'drawing-pen':
      if (!element.points || element.points.length < 2) return null;
      
      // Convert points to Vector3 and apply offset
      const penPoints = element.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      const penGeometry = new THREE.BufferGeometry().setFromPoints(penPoints);
      const penMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.penSize || 1
      });
      
      const penLine = new THREE.Line(penGeometry, penMaterial);
      penLine.userData.isDrawingElement = true;
      penLine.userData.drawingType = 'pen';
      
      return penLine;
      
    case 'drawing-highlighter':
      if (!element.points || element.points.length < 2) return null;
      
      // Convert points to Vector3 and apply offset
      const highlighterPoints = element.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // For highlighter, use wider line with transparency
      const highlighterGeometry = new THREE.BufferGeometry().setFromPoints(highlighterPoints);
      const highlighterMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0xffff00,
        linewidth: element.highlighterSize || 5,
        transparent: true,
        opacity: element.opacity || 0.5
      });
      
      const highlighterLine = new THREE.Line(highlighterGeometry, highlighterMaterial);
      highlighterLine.userData.isDrawingElement = true;
      highlighterLine.userData.drawingType = 'highlighter';
      
      return highlighterLine;
      
    case 'drawing-text':
      if (!element.position || !element.text) return null;
      
      // Create a placeholder for the text
      // In a real implementation, you would use TextGeometry with loaded fonts
      const drawingTextMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        transparent: true,
        opacity: 0.9
      });
      
      // Create a simple plane as placeholder
      const textWidth2 = element.text.length * (element.textSize || 12) * 0.05;
      const textHeight2= (element.textSize || 12) * 0.1;
      
      const drawingTextGeometry = new THREE.PlaneGeometry(textWidth2, textHeight2);
      const drawingTextMesh = new THREE.Mesh(drawingTextGeometry, drawingTextMaterial);
      
      drawingTextMesh.position.set(
        element.position.x + originOffset.x,
        element.position.y + originOffset.y,
        (element.position.z || 0) + originOffset.z
      );
      
      drawingTextMesh.userData.isDrawingElement = true;
      drawingTextMesh.userData.drawingType = 'text';
      drawingTextMesh.userData.text = element.text;
      drawingTextMesh.userData.textSize = element.textSize || 12;
      drawingTextMesh.userData.font = element.font || 'Arial';
      
      return drawingTextMesh;
      
    case 'drawing-eraser':
      // Eraser itself doesn't create visual elements
      // It's an operation that removes other elements
      // For debugging purposes, we could visualize the eraser path
      if (element.showEraserPath && element.points && element.points.length >= 2) {
        const eraserPoints = element.points.map((point: any) => 
          new THREE.Vector3(
            point.x + originOffset.x,
            point.y + originOffset.y,
            (point.z || 0) + originOffset.z
          )
        );
        
        const eraserGeometry = new THREE.BufferGeometry().setFromPoints(eraserPoints);
        const eraserMaterial = new THREE.LineBasicMaterial({
          color: 0xff0000,
          linewidth: 1,
          transparent: true,
          opacity: 0.5,
          
         
        });
        
        const eraserLine = new THREE.Line(eraserGeometry, eraserMaterial);
        eraserLine.userData.isDrawingElement = true;
        eraserLine.userData.drawingType = 'eraser';
        
        return eraserLine;
      }
      return null;
      
    case 'drawing-screenshot-area':
      // Visualize screenshot selection area
      if (!element.startPoint || !element.endPoint) return null;
      
      const startPoint = new THREE.Vector3(
        element.startPoint.x + originOffset.x,
        element.startPoint.y + originOffset.y,
        (element.startPoint.z || 0) + originOffset.z
      );
      
      const endPoint = new THREE.Vector3(
        element.endPoint.x + originOffset.x,
        element.endPoint.y + originOffset.y,
        (element.endPoint.z || 0) + originOffset.z
      );
      
      // Calculate width and height
      const width = Math.abs(endPoint.x - startPoint.x);
      const height2 = Math.abs(endPoint.y - startPoint.y);
      
      // Create rectangle shape
      const screenshotGeometry = new THREE.PlaneGeometry(width, height2);
      const screenshotMaterial = new THREE.MeshBasicMaterial({
        color: 0x2196f3,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      
      const screenshotMesh = new THREE.Mesh(screenshotGeometry, screenshotMaterial);
      
      // Position at center of rectangle
      screenshotMesh.position.set(
        (startPoint.x + endPoint.x) / 2,
        (startPoint.y + endPoint.y) / 2,
        startPoint.z
      );
      
      // Add border
      const borderGeometry = new THREE.EdgesGeometry(screenshotGeometry);
      const borderMaterial = new THREE.LineBasicMaterial({
        color: 0x2196f3,
        linewidth: 2
      });
      
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      screenshotMesh.add(border);
      
      screenshotMesh.userData.isDrawingElement = true;
      screenshotMesh.userData.drawingType = 'screenshot-area';
      
      return screenshotMesh;
    
    // ======= 2D ELEMENTS =======
    case 'circle':
      const circleGeometry = new THREE.CircleGeometry(
        element.radius,
        element.segments || 32
      );
      
      const circleMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const circle = new THREE.Mesh(circleGeometry, circleMaterial);
      circle.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return circle;
      
    case 'rectangle':
      const rectGeometry = new THREE.PlaneGeometry(
        element.width,
        element.height
      );
      
      const rectMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const rect = new THREE.Mesh(rectGeometry, rectMaterial);
      rect.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      if (element.angle) {
        rect.rotation.z = element.angle * Math.PI / 180;
      }
      
      return rect;
      
    case 'triangle':
      const triangleShape = new THREE.Shape();
      
      // If points are provided, use them
      if (element.points && element.points.length >= 3) {
        triangleShape.moveTo(element.points[0].x, element.points[0].y);
        triangleShape.lineTo(element.points[1].x, element.points[1].y);
        triangleShape.lineTo(element.points[2].x, element.points[2].y);
      } else {
        // Otherwise, create an equilateral triangle
        const size = element.size || 1;
        triangleShape.moveTo(0, size);
        triangleShape.lineTo(-size * Math.sqrt(3) / 2, -size / 2);
        triangleShape.lineTo(size * Math.sqrt(3) / 2, -size / 2);
      }
      
      triangleShape.closePath();
      
      const triangleGeometry = new THREE.ShapeGeometry(triangleShape);
      const triangleMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
      triangle.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return triangle;
      
    case 'polygon':
      const polygonShape = new THREE.Shape();
      
      if (element.points && element.points.length >= 3) {
        // Use provided points
        polygonShape.moveTo(element.points[0].x, element.points[0].y);
        
        for (let i = 1; i < element.points.length; i++) {
          polygonShape.lineTo(element.points[i].x, element.points[i].y);
        }
      } else if (element.sides && element.radius) {
        // Create regular polygon
        const sides = element.sides || 6;
        const radius = element.radius || 1;
        
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2;
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          
          if (i === 0) {
            polygonShape.moveTo(x, y);
          } else {
            polygonShape.lineTo(x, y);
          }
        }
      }
      
      polygonShape.closePath();
      
      const polygonGeometry = new THREE.ShapeGeometry(polygonShape);
      const polygonMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x795548,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const polygon = new THREE.Mesh(polygonGeometry, polygonMaterial);
      polygon.position.set(
        (element.x || 0) + originOffset.x,
        (element.y || 0) + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return polygon;
      
    case 'ellipse':
      const ellipseShape = new THREE.Shape();
      const rx = element.radiusX || 1;
      const ry = element.radiusY || 0.5;
      
      // Create ellipse shape
      ellipseShape.ellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
      
      const ellipseGeometry = new THREE.ShapeGeometry(ellipseShape);
      const ellipseMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const ellipseMesh = new THREE.Mesh(ellipseGeometry, ellipseMaterial);
      ellipseMesh.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return ellipseMesh;
      
    case 'arc':
      const arcShape = new THREE.Shape();
      const arcRadius = element.radius || 1;
      const startAngle = element.startAngle || 0;
      const endAngle = element.endAngle || Math.PI;
      
      // Create arc shape
      arcShape.moveTo(0, 0);
      arcShape.lineTo(
        arcRadius * Math.cos(startAngle),
        arcRadius * Math.sin(startAngle)
      );
      arcShape.absarc(0, 0, arcRadius, startAngle, endAngle, false);
      arcShape.lineTo(0, 0);
      
      const arcGeometry = new THREE.ShapeGeometry(arcShape);
      const arcMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x000000,
        wireframe: element.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const arc = new THREE.Mesh(arcGeometry, arcMaterial);
      arc.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return arc;
    
    // ======= CURVE ELEMENTS =======
    case 'line':
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          element.x1 + originOffset.x,
          element.y1 + originOffset.y,
          (element.z1 || 0) + originOffset.z
        ),
        new THREE.Vector3(
          element.x2 + originOffset.x,
          element.y2 + originOffset.y,
          (element.z2 || 0) + originOffset.z
        )
      ]);
      
      return new THREE.Line(lineGeometry, lineMaterial);
      
    case 'spline':
      if (!element.points || element.points.length < 2) return null;
      
      // Convert points to Vector3 and apply offset
      const splinePoints = element.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // Create curve
      const splineCurve = new THREE.CatmullRomCurve3(splinePoints);
      
      // Sample points along the curve for the line geometry
      const splineDivisions = element.divisions || 50;
      const splineGeometry = new THREE.BufferGeometry().setFromPoints(
        splineCurve.getPoints(splineDivisions)
      );
      
      const splineMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      return new THREE.Line(splineGeometry, splineMaterial);
      
    case 'bezier':
      if (!element.points || element.points.length < 4) return null;
      
      // For a cubic bezier, we need at least 4 points (start, 2 control points, end)
      const bezierPoints = element.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // Create cubic bezier curve
      const bezierCurve = new THREE.CubicBezierCurve3(
        bezierPoints[0],
        bezierPoints[1],
        bezierPoints[2],
        bezierPoints[3]
      );
      
      // Sample points along the curve for the line geometry
      const bezierDivisions = element.divisions || 50;
      const bezierGeometry = new THREE.BufferGeometry().setFromPoints(
        bezierCurve.getPoints(bezierDivisions)
      );
      
      const bezierMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      return new THREE.Line(bezierGeometry, bezierMaterial);
      
    case 'nurbs':
      if (!element.points || element.points.length < 4) return null;
      
      // This is a simplified NURBS implementation using SplineCurve3
      // For a full NURBS implementation, you'd need additional libraries
      
      // Convert points to Vector3 and apply offset
      const nurbsPoints = element.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // Create curve
      const nurbsCurve = new THREE.CatmullRomCurve3(nurbsPoints, false, "centripetal");
      
      // Sample points along the curve for the line geometry
      const nurbsDivisions = element.divisions || 100;
      const nurbsGeometry = new THREE.BufferGeometry().setFromPoints(
        nurbsCurve.getPoints(nurbsDivisions)
      );
      
      const nurbsMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      
      return new THREE.Line(nurbsGeometry, nurbsMaterial);
    
    // ======= TRANSFORMATION OPERATIONS =======
    case 'extrusion':
      if (!element.shape && !element.profile) return null;
      
      const extrudeShape = new THREE.Shape();
      
      if (element.shape === 'rect') {
        const width = element.width || 50;
        const height = element.height || 30;
        extrudeShape.moveTo(-width/2, -height/2);
        extrudeShape.lineTo(width/2, -height/2);
        extrudeShape.lineTo(width/2, height/2);
        extrudeShape.lineTo(-width/2, height/2);
        extrudeShape.closePath();
      } else if (element.shape === 'circle') {
        const radius = element.radius || 25;
        extrudeShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      } else if (element.profile && element.profile.length >= 3) {
        const firstPoint = element.profile[0];
        extrudeShape.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < element.profile.length; i++) {
          extrudeShape.lineTo(element.profile[i].x, element.profile[i].y);
        }
        
        extrudeShape.closePath();
      }
      
      const extrudeSettings = {
        depth: element.depth || 10,
        bevelEnabled: element.bevel || false,
        bevelThickness: element.bevelThickness || 1,
        bevelSize: element.bevelSize || 1,
        bevelSegments: element.bevelSegments || 1
      };
      
      const extrudeGeometry = new THREE.ExtrudeGeometry(extrudeShape, extrudeSettings);
      const extrudeMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x4CAF50,
        wireframe: element.wireframe || false
      });
      
      const extrusion = new THREE.Mesh(extrudeGeometry, extrudeMaterial);
      extrusion.position.set(
        (element.x || 0) + originOffset.x,
        (element.y || 0) + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      return extrusion;
      
    case 'revolution':
      if (!element.profile || element.profile.length < 2) return null;
      
      // Create a shape from the profile points
      const revolutionPoints = element.profile.map((point: any) => 
        new THREE.Vector2(point.x, point.y)
      );
      
      // LatheGeometry revolves a shape around an axis
      const revolutionGeometry = new THREE.LatheGeometry(
        revolutionPoints,
        element.segments || 32,
        element.phiStart || 0,
        element.angle || Math.PI * 2
      );
      
      const revolutionMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0xFF5722,
        wireframe: element.wireframe || false
      });
      
      const revolution = new THREE.Mesh(revolutionGeometry, revolutionMaterial);
      revolution.position.set(
        (element.x || 0) + originOffset.x,
        (element.y || 0) + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Rotate based on the specified axis
      if (element.axis === 'x') {
        revolution.rotation.y = Math.PI / 2;
      } else if (element.axis === 'y') {
        revolution.rotation.x = Math.PI / 2;
      }
      
      return revolution;
      
    case 'sweep':
      if (!element.profile || !element.path) return null;
      
      // This requires the three-csg library or similar for advanced operations
      // Simplified implementation using TubeGeometry
      
      // Create a shape from the profile
      const sweepShape = new THREE.Shape();
      if (element.profile.length >= 3) {
        sweepShape.moveTo(element.profile[0].x, element.profile[0].y);
        for (let i = 1; i < element.profile.length; i++) {
          sweepShape.lineTo(element.profile[i].x, element.profile[i].y);
        }
        sweepShape.closePath();
      } else {
        // Default to circle if profile not provided properly
        sweepShape.absarc(0, 0, element.radius || 0.5, 0, Math.PI * 2, false);
      }
      
      // Create a path for the sweep
      const pathPoints = element.path.map((point: any) => 
        new THREE.Vector3(point.x, point.y, point.z || 0)
      );
      
      const sweepPath = new THREE.CatmullRomCurve3(pathPoints);
      
      // Create a tube along the path with the shape as cross-section
      // Note: This is a simplification; full sweep would need custom geometry
      const tubeGeometry = new THREE.TubeGeometry(
        sweepPath,
        element.segments || 64,
        element.radius || 0.5,
        element.radialSegments || 8,
        element.closed || false
      );
      
      const sweepMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x2196F3,
        wireframe: element.wireframe || false
      });
      
      const sweep = new THREE.Mesh(tubeGeometry, sweepMaterial);
      sweep.position.set(
        originOffset.x,
        originOffset.y,
        originOffset.z
      );
      
      return sweep;
      
      case 'loft':
        if (!element.profiles || !element.positions || element.profiles.length < 2) return null;
        
        // Create a group to hold all sections
        const loftGroup = new THREE.Group();
        loftGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Create meshes between consecutive profile sections
        for (let i = 0; i < element.profiles.length - 1; i++) {
          const profileA = element.profiles[i];
          const profileB = element.profiles[i + 1];
          
          const posA = element.positions[i];
          const posB = element.positions[i + 1];
          
          // Create simple representation for now (would need custom geometry for proper loft)
          const sectionGeometry = new THREE.CylinderGeometry(
            profileA.radius || 1,
            profileB.radius || 1,
            Math.sqrt(
              Math.pow(posB.x - posA.x, 2) +
              Math.pow(posB.y - posA.y, 2) +
              Math.pow(posB.z - posA.z, 2)
            ),
            32
          );
          
          const sectionMesh = new THREE.Mesh(
            sectionGeometry,
            new THREE.MeshStandardMaterial({
              color: element.color || 0x9C27B0,
              wireframe: element.wireframe || false
            })
          );
          
          // Position and orient the section
          const midPoint = {
            x: (posA.x + posB.x) / 2,
            y: (posA.y + posB.y) / 2,
            z: (posA.z + posB.z) / 2
          };
          
          sectionMesh.position.set(midPoint.x, midPoint.y, midPoint.z);
          
          // Orient section to point from A to B
          sectionMesh.lookAt(new THREE.Vector3(posB.x, posB.y, posB.z));
          sectionMesh.rotateX(Math.PI / 2);
          
          loftGroup.add(sectionMesh);
        }
        
        return loftGroup;
      
      // ======= BOOLEAN OPERATIONS =======
      case 'boolean-union':
      case 'boolean-subtract':
      case 'boolean-intersect':
        if (!element.operands || element.operands.length < 2) return null;
        
        // This requires the three-csg library for CSG operations
        // For now, we'll just render a placeholder or the first operand
        
        // Create a placeholder for boolean operation result
        const booleanPlaceholder = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 16),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x4CAF50,
            wireframe: true,
            opacity: 0.7,
            transparent: true
          })
        );
        
        booleanPlaceholder.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        booleanPlaceholder.userData.isBooleanOperation = true;
        booleanPlaceholder.userData.operationType = element.type;
        booleanPlaceholder.userData.operandIds = element.operands;
        
        return booleanPlaceholder;
      
      // ======= INDUSTRIAL ELEMENTS =======
      case 'thread':
        // Create a simplified thread representation
        const threadGroup = new THREE.Group();
        
        // Base cylinder
        const threadBase = new THREE.Mesh(
          new THREE.CylinderGeometry(element.diameter / 2, element.diameter / 2, element.length, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0xB0BEC5,
            wireframe: element.wireframe || false
          })
        );
        
        // Thread helix (simplified representation)
        const helixSegments = Math.ceil(element.length / element.pitch) * 8;
        const threadCurvePoints = [];
        
        for (let i = 0; i <= helixSegments; i++) {
          const t = i / helixSegments;
          const angle = t * (element.length / element.pitch) * Math.PI * 2;
          const radius = element.diameter / 2 + element.pitch * 0.1; // Slightly larger than base
          const x = radius * Math.cos(angle);
          const y = -element.length / 2 + t * element.length;
          const z = radius * Math.sin(angle);
          
          threadCurvePoints.push(new THREE.Vector3(x, y, z));
        }
        
        const threadCurve = new THREE.CatmullRomCurve3(threadCurvePoints);
        const threadGeometry = new THREE.TubeGeometry(
          threadCurve,
          helixSegments,
          element.pitch * 0.1, // Thread thickness
          8,
          false
        );
        
        const threadMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9E9E9E,
          wireframe: element.wireframe || false
        });
        
        const threadHelix = new THREE.Mesh(threadGeometry, threadMaterial);
        
        threadGroup.add(threadBase);
        threadGroup.add(threadHelix);
        
        // Set handedness rotation
        if (element.handedness === 'left') {
          threadHelix.rotation.y = Math.PI;
        }
        
        threadGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Rotate to standard orientation
        threadGroup.rotation.x = Math.PI / 2;
        
        return threadGroup;
        
      case 'chamfer':
        // Chamfer would normally modify an existing edge
        // For standalone visualization, create a placeholder
        const chamferGroup = new THREE.Group();
        
        // Create a box with chamfered edges (simplified representation)
        const chamferBaseGeometry = new THREE.BoxGeometry(
          element.width || 1,
          element.height || 1, 
          element.depth || 1
        );
        
        const chamferBaseMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x607D8B,
          wireframe: element.wireframe || false
        });
        
        const chamferBase = new THREE.Mesh(chamferBaseGeometry, chamferBaseMaterial);
        chamferGroup.add(chamferBase);
        
        // Highlight the chamfered edges
        if (element.edges && element.edges.length > 0) {
          const edgesMaterial = new THREE.LineBasicMaterial({ 
            color: 0xFF5722,
            linewidth: 3
          });
          
          // Here we'd create proper chamfer visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(chamferBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          chamferGroup.add(edges);
        }
        
        chamferGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return chamferGroup;
        
      case 'fillet':
        // Similar to chamfer, fillets modify existing edges
        // Create a simplified representation
        const filletGroup = new THREE.Group();
        
        // Create a base geometry
        const filletBaseGeometry = new THREE.BoxGeometry(
          element.width || 1,
          element.height || 1,
          element.depth || 1
        );
        
        const filletBaseMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x607D8B,
          wireframe: element.wireframe || false
        });
        
        const filletBase = new THREE.Mesh(filletBaseGeometry, filletBaseMaterial);
        filletGroup.add(filletBase);
        
        // Highlight the filleted edges
        if (element.edges && element.edges.length > 0) {
          const filletedEdgesMaterial = new THREE.LineBasicMaterial({ 
            color: 0x4CAF50,
            linewidth: 3
          });
          
          // Here we'd create proper fillet visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(filletBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, filletedEdgesMaterial);
          filletGroup.add(edges);
        }
        
        filletGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return filletGroup;
        
      case 'gear':
        // Create a simplified gear visualization
        const gearGroup = new THREE.Group();
        
        // Basic parameters
        const moduleValue = element.moduleValue || 1; // Module in mm
        const teeth = element.teeth || 20;
        const thickness = element.thickness || 5;
        const pressureAngle = (element.pressureAngle || 20) * Math.PI / 180;
        
        // Derived parameters
        const pitchDiameter = moduleValue * teeth;
        const pitchRadius = pitchDiameter / 2;
        const baseRadius = pitchRadius * Math.cos(pressureAngle);
        const addendum = moduleValue;
        const dedendum = 1.25 * moduleValue;
        const outerRadius = pitchRadius + addendum;
        const rootRadius = pitchRadius - dedendum;
        
        // Create the base cylinder
        const gearCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(pitchRadius, pitchRadius, thickness, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0xB0BEC5,
            wireframe: element.wireframe || false
          })
        );
        gearGroup.add(gearCylinder);
        
        // Create teeth (simplified as cylinders)
        for (let i = 0; i < teeth; i++) {
          const angle = (i / teeth) * Math.PI * 2;
          const x = (outerRadius + moduleValue * 0.25) * Math.cos(angle);
          const z = (outerRadius + moduleValue * 0.25) * Math.sin(angle);
          
          const tooth = new THREE.Mesh(
            new THREE.CylinderGeometry(
              moduleValue * 0.8, 
              moduleValue * 0.8, 
              thickness, 
              8
            ),
            new THREE.MeshStandardMaterial({
              color: element.color || 0xB0BEC5
            })
          );
          
          tooth.position.set(x, 0, z);
          gearGroup.add(tooth);
        }
        
        // Create center hole if specified
        if (element.holeDiameter) {
          const hole = new THREE.Mesh(
            new THREE.CylinderGeometry(element.holeDiameter / 2, element.holeDiameter / 2, thickness + 1, 32),
            new THREE.MeshStandardMaterial({
              color: 0x212121
            })
          );
          gearGroup.add(hole);
        }
        
        gearGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Rotate to standard orientation
        gearGroup.rotation.x = Math.PI / 2;
        
        return gearGroup;
        
      case 'spring':
        // Create a helical spring
        const springRadius = element.radius || 1;
        const wireRadius = element.wireRadius || 0.1;
        const turns = element.turns || 5;
        const height = element.height || 5;
        
        const springCurvePoints = [];
        const segments = turns * 16;
        
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = t * turns * Math.PI * 2;
          const x = springRadius * Math.cos(angle);
          const y = -height / 2 + t * height;
          const z = springRadius * Math.sin(angle);
          
          springCurvePoints.push(new THREE.Vector3(x, y, z));
        }
        
        const springCurve = new THREE.CatmullRomCurve3(springCurvePoints);
        const springGeometry = new THREE.TubeGeometry(
          springCurve,
          segments,
          wireRadius,
          8,
          false
        );
        
        const springMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9E9E9E,
          wireframe: element.wireframe || false
        });
        
        const spring = new THREE.Mesh(springGeometry, springMaterial);
        spring.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return spring;
      
      // ======= ASSEMBLY ELEMENTS =======
      case 'screw':
      case 'bolt':
        // Create a simplified screw or bolt
        const screwGroup = new THREE.Group();
        
        // Parse size
        let diameter = 5; // Default 5mm
        if (element.size && typeof element.size === 'string') {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            diameter = parseInt(match[1], 10);
          }
        }
        
        // Create head
        const headDiameter = diameter * 1.8;
        const headHeight = diameter * 0.8;
        const screwHead = new THREE.Mesh(
          new THREE.CylinderGeometry(headDiameter / 2, headDiameter / 2, headHeight, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9E9E9E,
            wireframe: element.wireframe || false
          })
        );
        screwHead.position.y = (element.length || 20) / 2 - headHeight / 2;
        screwGroup.add(screwHead);
        
        // Create shaft
        const shaftLength2 = (element.length || 20) - headHeight;
        const shaft2 = new THREE.Mesh(
          new THREE.CylinderGeometry(diameter / 2, diameter / 2, shaftLength2, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9E9E9E,
            wireframe: element.wireframe || false
          })
        );
        shaft2.position.y = -shaftLength2 / 2;
        screwGroup.add(shaft2);
        
        // Add thread detail
        const threadHelixPoints = [];
        const threadSegments = Math.ceil(shaftLength2 / (diameter * 0.2)) * 8;
        
        for (let i = 0; i <= threadSegments; i++) {
          const t = i / threadSegments;
          const angle = t * (shaftLength2 / (diameter * 0.2)) * Math.PI * 2;
          const radius = diameter / 2 + 0.05;
          const x = radius * Math.cos(angle);
          const y = -shaftLength2 + t * shaftLength2;
          const z = radius * Math.sin(angle);
          
          threadHelixPoints.push(new THREE.Vector3(x, y, z));
        }
        
        const threadCurve2 = new THREE.CatmullRomCurve3(threadHelixPoints);
        const threadGeometry2 = new THREE.TubeGeometry(
          threadCurve2,
          threadSegments,
          diameter * 0.05,
          8,
          false
        );
        
        const threadMaterial2 = new THREE.MeshStandardMaterial({
          color: element.color || 0x9E9E9E,
          wireframe: element.wireframe || false
        });
        
        const thread = new THREE.Mesh(threadGeometry2, threadMaterial2);
        screwGroup.add(thread);
        
        screwGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Apply rotation if specified
        if (element.rotation) {
          screwGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          screwGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          screwGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        } else {
          // Default orientation
          screwGroup.rotation.x = Math.PI;
        }
        
        return screwGroup;
        
      case 'nut':
        // Create a simplified nut
        const nutGroup = new THREE.Group();
        
        // Parse size
        let nutDiameter = 5; // Default 5mm
        if (element.size && typeof element.size === 'string') {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            nutDiameter = parseInt(match[1], 10);
          }
        }
        
        // Derived dimensions
        const nutThickness = nutDiameter * 0.8;
        const nutWidth = nutDiameter * 1.8;
        
        // Create hexagonal prism
        const nutShape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const x = (nutWidth / 2) * Math.cos(angle);
          const y = (nutWidth / 2) * Math.sin(angle);
          
          if (i === 0) {
            nutShape.moveTo(x, y);
          } else {
            nutShape.lineTo(x, y);
          }
        }
        nutShape.closePath();
        
        const extrudeSettings2 = {
          depth: nutThickness,
          bevelEnabled: false
        };
        
        const nutGeometry = new THREE.ExtrudeGeometry(nutShape, extrudeSettings2);
        const nutMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9E9E9E,
          wireframe: element.wireframe || false
        });
        
        const nutBody = new THREE.Mesh(nutGeometry, nutMaterial);
        nutBody.rotation.x = Math.PI / 2;
        nutGroup.add(nutBody);
        
        // Create center hole
        const holeGeometry = new THREE.CylinderGeometry(
          nutDiameter / 2,
          nutDiameter / 2,
          nutThickness + 0.2,
          32
        );
        
        const holeMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000
        });
        
        const hole = new THREE.Mesh(holeGeometry, holeMaterial);
        nutGroup.add(hole);
        
        nutGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Apply rotation if specified
        if (element.rotation) {
          nutGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          nutGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          nutGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        }
        
        return nutGroup;
        
      case 'washer':
        // Create a washer
        let washerDiameter = 5; // Default 5mm
        if (element.size && typeof element.size === 'string') {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            washerDiameter = parseInt(match[1], 10);
          }
        }
        
        // Derived dimensions
        const outerDiameter = washerDiameter * 2.2;
        const washerThickness = washerDiameter * 0.2;
        
        // Create washer geometry (toroidal shape)
        const washerGeometry = new THREE.RingGeometry(
          washerDiameter / 2,
          outerDiameter / 2,
          32,
          1
        );
        
        const washerMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9E9E9E,
          wireframe: element.wireframe || false
        });
        
        const washer = new THREE.Mesh(washerGeometry, washerMaterial);
        washer.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Give it thickness
        washer.scale.set(1, 1, washerThickness);
        
        // Apply rotation if specified
        if (element.rotation) {
          washer.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          washer.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          washer.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        }
        
        return washer;
        
      case 'rivet':
        // Create a simplified rivet
        const rivetGroup = new THREE.Group();
        
        const rivetDiameter = element.diameter || 3;
        const rivetLength = element.length || 10;
        
        // Create head
        const rivetHeadDiameter = rivetDiameter * 2;
        const rivetHeadHeight = rivetDiameter * 0.6;
        
        const rivetHead = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetHeadDiameter / 2, rivetHeadDiameter / 2, rivetHeadHeight, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9E9E9E,
            wireframe: element.wireframe || false
          })
        );
        rivetHead.position.y = rivetLength / 2 - rivetHeadHeight / 2;
        rivetGroup.add(rivetHead);
        
        // Create shaft
        const shaftLength = rivetLength - rivetHeadHeight;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetDiameter / 2, rivetDiameter / 2, shaftLength, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9E9E9E,
            wireframe: element.wireframe || false
          })
        );
        shaft.position.y = -shaftLength / 2;
        rivetGroup.add(shaft);
        
        rivetGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Apply rotation if specified
        if (element.rotation) {
          rivetGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          rivetGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          rivetGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        } else {
          // Default orientation
          rivetGroup.rotation.x = Math.PI;
        }
        
        return rivetGroup;
      
      // ======= ARCHITECTURAL ELEMENTS =======
      case 'wall':
        const wallLength = element.length || 100;
        const wallHeight = element.height || 30;
        const wallThickness = element.thickness || 5;
        
        const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
        const wallMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xE0E0E0,
          wireframe: element.wireframe || false
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall with bottom at y=0 by default
        wall.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || (wallHeight / 2)) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Add openings if specified
        if (element.openings && Array.isArray(element.openings)) {
          // This would require CSG operations for proper holes
          // For now, we'll just add visual markers for the openings
          element.openings.forEach((opening: any) => {
            const openingMaterial = new THREE.MeshBasicMaterial({
              color: 0x000000,
              wireframe: true
            });
            
            const openingGeometry = new THREE.BoxGeometry(
              opening.width || 10,
              opening.height || 20,
              wallThickness + 0.2
            );
            
            const openingMesh = new THREE.Mesh(openingGeometry, openingMaterial);
            
            openingMesh.position.set(
              opening.x || 0,
              opening.y || 0,
              0
            );
            
            wall.add(openingMesh);
          });
        }
        
        return wall;
        
      case 'floor':
        const floorWidth = element.width || 100;
        const floorLength = element.length || 100;
        const floorThickness = element.thickness || 2;
        
        const floorGeometry = new THREE.BoxGeometry(floorWidth, floorThickness, floorLength);
        const floorMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xBCAAA4,
          wireframe: element.wireframe || false
        });
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return floor;
        
      case 'roof':
        const roofWidth = element.width || 100;
        const roofLength = element.length || 100;
        const roofHeight = element.height || 20;
        const roofStyle = element.style || 'pitched';
        
        const roofGroup = new THREE.Group();
        roofGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        if (roofStyle === 'flat') {
          // Flat roof is just a box
          const flatRoofGeometry = new THREE.BoxGeometry(roofWidth, roofHeight / 4, roofLength);
          const flatRoofMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0x795548,
            wireframe: element.wireframe || false
          });
          
          const flatRoof = new THREE.Mesh(flatRoofGeometry, flatRoofMaterial);
          roofGroup.add(flatRoof);
        } else if (roofStyle === 'pitched') {
          // Create a pitched roof (triangle extrusion)
          const pitchedRoofShape = new THREE.Shape();
          pitchedRoofShape.moveTo(-roofWidth / 2, 0);
          pitchedRoofShape.lineTo(roofWidth / 2, 0);
          pitchedRoofShape.lineTo(0, roofHeight);
          pitchedRoofShape.closePath();
          
          const extrudeSettings = {
            depth: roofLength,
            bevelEnabled: false
          };
          
          const pitchedRoofGeometry = new THREE.ExtrudeGeometry(pitchedRoofShape, extrudeSettings);
          const pitchedRoofMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0x795548,
            wireframe: element.wireframe || false
          });
          
          const pitchedRoof = new THREE.Mesh(pitchedRoofGeometry, pitchedRoofMaterial);
          pitchedRoof.rotation.x = -Math.PI / 2;
          pitchedRoof.position.z = -roofLength / 2;
          roofGroup.add(pitchedRoof);
        }
        
        return roofGroup;
        
      case 'window':
        const windowWidth = element.width || 10;
        const windowHeight = element.height || 15;
        const windowThickness = element.thickness || 0.5;
        const windowStyle = element.style || 'simple';
        
        const windowGroup = new THREE.Group();
        
        // Create window frame
        const frameGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, windowThickness);
        const frameMaterial = new THREE.MeshStandardMaterial({
          color: element.frameColor || 0x8D6E63,
          wireframe: element.wireframe || false
        });
        
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        windowGroup.add(frame);
        
        // Create glass
        const glassWidth = windowWidth * 0.8;
        const glassHeight = windowHeight * 0.8;
        
        const glassGeometry = new THREE.BoxGeometry(glassWidth, glassHeight, windowThickness * 0.2);
        const glassMaterial = new THREE.MeshStandardMaterial({
          color: 0xB3E5FC,
          transparent: true,
          opacity: 0.6,
          wireframe: element.wireframe || false
        });
        
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = windowThickness * 0.3;
        windowGroup.add(glass);
        
        // Add window details based on style
        if (windowStyle === 'divided') {
          // Add dividers
          const dividerWidth = windowWidth * 0.05;
          const horizontalDivider = new THREE.Mesh(
            new THREE.BoxGeometry(glassWidth + dividerWidth, dividerWidth, windowThickness * 0.4),
            frameMaterial
          );
          horizontalDivider.position.z = windowThickness * 0.3;
          windowGroup.add(horizontalDivider);
          const verticalDivider = new THREE.Mesh(
            new THREE.BoxGeometry(dividerWidth, glassHeight + dividerWidth, windowThickness * 0.4),
            frameMaterial
          );
          verticalDivider.position.z = windowThickness * 0.3;
          windowGroup.add(verticalDivider);
        }
        
        windowGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return windowGroup;
        
      case 'door':
        const doorWidth = element.width || 10;
        const doorHeight = element.height || 20;
        const doorThickness = element.thickness || 1;
        const doorStyle = element.style || 'simple';
        
        const doorGroup = new THREE.Group();
        
        // Create door panel
        const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        const doorMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x8D6E63,
          wireframe: element.wireframe || false
        });
        
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        doorGroup.add(door);
        
        // Add details based on style
        if (doorStyle === 'paneled') {
          // Add panels
          const panelDepth = doorThickness * 0.3;
          const panelWidth = doorWidth * 0.7;
          const panelHeight = doorHeight * 0.25;
          
          const topPanel = new THREE.Mesh(
            new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
            doorMaterial
          );
          topPanel.position.y = doorHeight * 0.25;
          topPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(topPanel);
          
          const bottomPanel = new THREE.Mesh(
            new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
            doorMaterial
          );
          bottomPanel.position.y = -doorHeight * 0.25;
          bottomPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(bottomPanel);
        }
        
        // Add doorknob
        const doorknob = new THREE.Mesh(
          new THREE.SphereGeometry(doorWidth * 0.08, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xFFD700,
            wireframe: element.wireframe || false
          })
        );
        doorknob.position.x = doorWidth * 0.4;
        doorknob.position.z = doorThickness * 0.6;
        doorGroup.add(doorknob);
        
        doorGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return doorGroup;
        
      case 'stair':
        const stairWidth = element.width || 10;
        const stairHeight = element.height || 20;
        const stairDepth = element.depth || 30;
        const stepsCount = element.steps || 10;
        
        const stairGroup = new THREE.Group();
        
        // Create individual steps
        const stepWidth = stairWidth;
        const stepHeight = stairHeight / stepsCount;
        const stepDepth = stairDepth / stepsCount;
        
        for (let i = 0; i < stepsCount; i++) {
          const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
          const stepMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0xBCAAA4,
            wireframe: element.wireframe || false
          });
          
          const step = new THREE.Mesh(stepGeometry, stepMaterial);
          step.position.y = i * stepHeight + stepHeight / 2;
          step.position.z = i * stepDepth + stepDepth / 2;
          
          stairGroup.add(step);
        }
        
        stairGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return stairGroup;
        
      case 'column':
        const columnRadius = element.radius || 5;
        const columnHeight = element.height || 30;
        const columnStyle = element.style || 'simple';
        
        const columnGroup = new THREE.Group();
        
        // Create base column
        const columnGeometry = new THREE.CylinderGeometry(
          columnRadius,
          columnRadius,
          columnHeight,
          20
        );
        const columnMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xE0E0E0,
          wireframe: element.wireframe || false
        });
        
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        columnGroup.add(column);
        
        // Add details based on style
        if (columnStyle === 'doric' || columnStyle === 'ionic' || columnStyle === 'corinthian') {
          // Add base
          const baseHeight = columnHeight * 0.05;
          const baseRadius = columnRadius * 1.2;
          
          const base = new THREE.Mesh(
            new THREE.CylinderGeometry(baseRadius, baseRadius, baseHeight, 20),
            columnMaterial
          );
          base.position.y = -columnHeight / 2 + baseHeight / 2;
          columnGroup.add(base);
          
          // Add capital
          const capitalHeight = columnHeight * 0.05;
          const capitalRadius = columnRadius * 1.2;
          
          const capital = new THREE.Mesh(
            new THREE.CylinderGeometry(capitalRadius, capitalRadius, capitalHeight, 20),
            columnMaterial
          );
          capital.position.y = columnHeight / 2 - capitalHeight / 2;
          columnGroup.add(capital);
          
          // For more elaborate styles, add fluting (vertical grooves)
          if (columnStyle === 'ionic' || columnStyle === 'corinthian') {
            // Add simplified decoration to capital
            const decorationRadius = capitalRadius * 1.1;
            const decoration = new THREE.Mesh(
              new THREE.CylinderGeometry(decorationRadius, capitalRadius, capitalHeight * 0.5, 20),
              columnMaterial
            );
            decoration.position.y = columnHeight / 2 + capitalHeight * 0.25;
            columnGroup.add(decoration);
          }
        }
        
        columnGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        return columnGroup;
      
      // ======= SPECIAL ELEMENTS =======
      case 'text3d':
        // Three.js requires loading fonts for proper TextGeometry
        // For a placeholder, we'll create a plane with the text content
        const textWidth = element.text ? element.text.length * element.height * 0.6 : 10;
        const textHeight = element.height || 5;
        const textDepth = element.depth || 2;
        
        const textPlaceholder = new THREE.Mesh(
          new THREE.BoxGeometry(textWidth, textHeight, textDepth),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x4285F4,
            wireframe: element.wireframe || false
          })
        );
        
        textPlaceholder.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        textPlaceholder.userData.text = element.text;
        textPlaceholder.userData.isTextPlaceholder = true;
        
        return textPlaceholder;
        
      case 'path3d':
        if (!element.points || element.points.length < 2) return null;
        
        // Create a path from the points
       
        const path = new THREE.CatmullRomCurve3();
        
        // Create geometry and material
        const pathGeometry = new THREE.TubeGeometry(
          path,
          element.segments || 64,
          element.radius || 0.5,
          element.radialSegments || 8,
          element.closed || false
        );
        
        const pathMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x4285F4,
          wireframe: element.wireframe || false
        });
        
        const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
        
        return pathMesh;
        
      case 'point-cloud':
        if (!element.points || !Array.isArray(element.points)) return null;
        
        // Create a point cloud from the points
        const pointPositions = new Float32Array(element.points.length * 3);
        
        element.points.forEach((point: any, i: number) => {
          pointPositions[i * 3] = point.x + originOffset.x;
          pointPositions[i * 3 + 1] = point.y + originOffset.y;
          pointPositions[i * 3 + 2] = (point.z || 0) + originOffset.z;
        });
        
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
        
        // If color data is provided, use it
        if (element.colors && Array.isArray(element.colors)) {
          const colors = new Float32Array(element.colors.length * 3);
          
          element.colors.forEach((color: any, i: number) => {
            colors[i * 3] = color.r || 0.5;
            colors[i * 3 + 1] = color.g || 0.5;
            colors[i * 3 + 2] = color.b || 0.5;
          });
          
          pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        
        const pointMaterial = new THREE.PointsMaterial({
          color: element.color || 0x4285F4,
          size: element.pointSize || 0.5,
          sizeAttenuation: true,
          vertexColors: element.colors ? true : false
        });
        
        const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
        
        return pointCloud;
        
      case 'mesh':
        // For a custom mesh, we need vertices and faces data
        if (!element.vertices || !element.faces) return null;
        
        const meshGeometry = new THREE.BufferGeometry();
        
        // Convert vertices to Float32Array
        const vertices2 = new Float32Array(element.vertices.length * 3);
        element.vertices.forEach((vertex: any, i: number) => {
          vertices[i * 3] = vertex.x + originOffset.x;
          vertices[i * 3 + 1] = vertex.y + originOffset.y;
          vertices[i * 3 + 2] = (vertex.z || 0) + originOffset.z;
        });
        
        // Convert faces to indices
        const indices2: number[] = [];
        element.faces.forEach((face: any) => {
          if (Array.isArray(face) && face.length >= 3) {
            // Basic triangles
            indices.push(face[0], face[1], face[2]);
            
            // If more than 3 vertices (quad or n-gon), triangulate
            for (let i = 3; i < face.length; i++) {
              indices.push(face[0], face[i - 1], face[i]);
            }
          }
        });
        
        meshGeometry.setIndex(indices2);
        meshGeometry.setAttribute('position', new THREE.BufferAttribute(vertices2, 3));
        meshGeometry.computeVertexNormals();
        
        const meshMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x4285F4,
          wireframe: element.wireframe || false
        });
        
        const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
        ensureObjectMetadata(mesh, element.id);
        return mesh;
        
        
        
      case 'group':
        const group = new THREE.Group();
        group.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Add child elements if provided
        if (element.elements && Array.isArray(element.elements)) {
          element.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset
            const childThreeObject = createThreeObject({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });
            
            if (childThreeObject) {
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = childElement.id;
              group.add(childThreeObject);
            }
          });
        }
        
        return group;
        
        
      case 'workpiece':
        // Create a transparent cube to represent the raw workpiece
        const workpieceGeometry = new THREE.BoxGeometry(
          element.width,
          element.height,
          element.depth
        );
        
        const workpieceMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xaaaaaa,
          wireframe: element.wireframe || false,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        
        const workpiece = new THREE.Mesh(workpieceGeometry, workpieceMaterial);
        workpiece.position.set(
          (element.x || 0) + originOffset.x, 
          (element.y || 0) + originOffset.y, 
          (element.z || 0) + originOffset.z
        );
        
        if (!element.wireframe) {
          const edgesGeometry = new THREE.EdgesGeometry(workpieceGeometry);
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          workpiece.add(edges);
        }
        
        return workpiece;
      
      case 'component':
        const componentThreeGroup = new THREE.Group();
        componentThreeGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        
        // Ensure main group has proper metadata for selection
        componentThreeGroup.userData.isCADElement = true;
        componentThreeGroup.userData.elementId = element.id;
        componentThreeGroup.userData.isComponent = true;
        
        // Add child elements if provided
        if (element.elements && Array.isArray(element.elements)) {
          element.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset
            const childThreeObject = createThreeObject({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });
            
            if (childThreeObject) {
              // Ensure children have the component's ID for selection
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = element.id;
              childThreeObject.userData.isComponentChild = true;
              childThreeObject.userData.parentComponentId = element.id;
              componentThreeGroup.add(childThreeObject);
            }
          });
        } else {
          // If no elements are provided or array is empty, create a visual placeholder
          const placeholderGeometry = new THREE.BoxGeometry(
            element.width || 1,
            element.height || 1,
            element.depth || 1
          );
          
          const placeholderMaterial = new THREE.MeshBasicMaterial({
            color: element.color || 0x3f51b5,
            wireframe: true,
            opacity: 0.7,
            transparent: true
          });
          
          const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
          placeholder.userData.isCADElement = true;
          placeholder.userData.elementId = element.id;
          placeholder.userData.isComponentPlaceholder = true;
          componentThreeGroup.add(placeholder);
        }
        
        return componentThreeGroup;
      
      default:
        console.warn(`Unknown element type: ${element.type}`);
        return null;
    }
    
  };

const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
const [snapMode, setSnapMode] = useState<'point' | 'line' | 'face' | 'grid' | 'center'>('point');


// ... resto del codice esistente

// Funzione per aggiungere comando allo storico
const addCommandToHistory = useCallback((command: CommandHistory) => {
  // Rimuovi comandi che sono stati sovrascritti (in caso di undo seguito da nuova azione)
  const newHistory = commandHistory.slice(0, historyIndex + 1);
  setCommandHistory([...newHistory, command]);
  setHistoryIndex(newHistory.length);
}, [commandHistory, historyIndex]);

// Funzione undo
const undo = useCallback(() => {
  if (historyIndex >= 0) {
    commandHistory[historyIndex].undo();
    setHistoryIndex(historyIndex - 1);
  }
}, [commandHistory, historyIndex]);

// Funzione redo
const redo = useCallback(() => {
  if (historyIndex < commandHistory.length - 1) {
    commandHistory[historyIndex + 1].redo();
    setHistoryIndex(historyIndex + 1);
  }
}, [commandHistory, historyIndex]);

// Sistema avanzato di snap


// Operazioni booleane
const performBooleanOperation = useCallback((operation: 'union' | 'subtract' | 'intersect') => {
  if (booleanOperationsObjectsRef.current.length < 2) {
    console.warn('Need at least two objects for boolean operation');
    return;
  }
  
  let result: THREE.Mesh | null = null;
  const objects = booleanOperationsObjectsRef.current.filter(obj => obj instanceof THREE.Mesh) as THREE.Mesh[];
  
  // Memorizza lo stato precedente per undo/redo
  const previousState = objects.map(obj => ({
    id: obj.id,
    position: obj.position.clone(),
    rotation: obj.rotation.clone(),
    scale: obj.scale.clone(),
    geometry: obj.geometry.clone(),
    material: obj.material,
    visible: obj.visible
  }));
  
  if (operation === 'union') {
    // Unione di oggetti
    result = objects.reduce((acc: THREE.Mesh | null, obj) => {
      if (!acc) return obj;
      return CSG.union(acc, obj);
    }, null);
  } else if (operation === 'subtract') {
    // Sottrazione del primo oggetto con tutti gli altri
    result = objects.slice(1).reduce((acc, obj) => {
      return CSG.subtract(acc, obj);
    }, objects[0]);
  } else if (operation === 'intersect') {
    // Intersezione di tutti gli oggetti
    result = objects.reduce((acc: THREE.Mesh | null, obj) => {
      if (!acc) return obj;
      return CSG.intersect(acc, obj);
    }, null);
  }
  
  if (result && sceneRef.current) {
    // Rimuovi oggetti originali dalla scena
    for (const obj of objects) {
      sceneRef.current.remove(obj);
    }
    
    // Imposta posizione e materiale per il risultato
    result.position.set(0, 0, 0);
    result.material = objects[0].material;
    
    // Aggiungi il risultato alla scena
    sceneRef.current.add(result);
    
    // Memorizza il nuovo oggetto per operazioni future
    const resultId = result.id;
    
    // Aggiungi comando alla storia per undo/redo
    const command: CommandHistory = {
      undo: () => {
        if (sceneRef.current) {
          // Rimuovi il risultato
          const resultObject = sceneRef.current.getObjectById(resultId);
          if (resultObject) sceneRef.current.remove(resultObject);
          
          // Ripristina gli oggetti originali
          for (const obj of previousState) {
            const mesh = new THREE.Mesh(obj.geometry, obj.material);
            mesh.position.copy(obj.position);
            mesh.rotation.copy(obj.rotation);
            mesh.scale.copy(obj.scale);
            mesh.visible = obj.visible;
            sceneRef.current.add(mesh);
          }
        }
      },
      redo: () => {
        if (sceneRef.current) {
          // Rimuovi gli oggetti originali
          for (const obj of previousState) {
            const originalObject = sceneRef.current.getObjectById(obj.id);
            if (originalObject) sceneRef.current.remove(originalObject);
          }
          
          // Aggiungi il risultato
          sceneRef.current.add(result!);
        }
      },
      description: `Boolean ${operation} operation`
    };
    
    addCommandToHistory(command);
  }
}, [addCommandToHistory]);

// Funzioni di esportazione
const exportToSTL = useCallback(() => {
  if (!sceneRef.current) return;
  
  const exporter = new STLExporter();
  const result = exporter.parse(sceneRef.current);
  
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'model.stl';
  link.click();
}, []);

const exportToOBJ = useCallback(() => {
  if (!sceneRef.current) return;
  
  const exporter = new OBJExporter();
  const result = exporter.parse(sceneRef.current);
  
  const blob = new Blob([result], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'model.obj';
  link.click();
}, []);

const exportToStep = useCallback(() => {
  // STEP export richiede librerie più specializzate come OpenCascade.js
  console.warn('STEP export requires additional libraries');
  // Implementazione di esempio usando una libreria esterna
  if (window.cadExporter && window.cadExporter.exportSTEP) {
    window.cadExporter.exportSTEP(sceneRef.current, 'model.step');
  } else {
    alert('STEP export is not available. Please install the required libraries.');
  }
}, []);

// ... resto del codice esistente

// Aggiungi il supporto per scorciatoie da tastiera
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Scorciatoie per undo/redo
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
      e.preventDefault();
      redo();
    }
    
    // Scorciatoie per modalità di snap
    if (e.key === 'p') setSnapMode('point');
    if (e.key === 'l') setSnapMode('line');
    if (e.key === 'f') setSnapMode('face');
    if (e.key === 'g') setSnapMode('grid');
    
    // Scorciatoie per operazioni booleane
    if (e.ctrlKey && e.key === 'u') performBooleanOperation('union');
    if (e.ctrlKey && e.key === 's') performBooleanOperation('subtract');
    if (e.ctrlKey && e.key === 'i') performBooleanOperation('intersect');
    
    // Scorciatoie per esportazione
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      const format = prompt('Export format (stl, obj, step):', 'stl');
      if (format === 'stl') exportToSTL();
      else if (format === 'obj') exportToOBJ();
      else if (format === 'step') exportToStep();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [undo, redo, exportToSTL, exportToOBJ, exportToStep, performBooleanOperation])

  // Handle mouse move for hover effects and control points
  
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    
      // Se stiamo posizionando un componente, usa la logica di anteprima
      if (isPlacingComponent) {
        handleMouseMoveForPreview(event);
        return;
      }
      
      if (!canvasRef.current || !sceneRef.current || !cameraRef.current) return;
      
      // Box selection update
      if (isBoxSelecting) {
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        // Convert screen to world coordinates
        const worldPosition = screenToWorld(mouseX, mouseY);
        if (worldPosition) {
          const position = { x: worldPosition.x, y: worldPosition.y };
          updateBoxSelection(position);
        }
        return;
      }
      
    
    // Don't process hover effects during camera movement
    if (controlsRef.current?.enabled && controlsRef.current?.enablePan && event.buttons > 0) {
      return;
    }
    
    // Calculate normalized device coordinates (-1 to +1)
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // If we're actively dragging a control point
    if (activeDragPoint) {
      // Calculate the intersection point with a plane
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1)); // XY plane
      const planeIntersection = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(plane, planeIntersection);
      
      // Update the control point position
      handleControlPointDrag(
        activeDragPoint.elementId,
        activeDragPoint.pointIndex,
        planeIntersection.x,
        planeIntersection.y,
        planeIntersection.z
      );
      
      // Update the control points visual positions
      updateControlPoints();
      return;
    }
    
    // Check for control point intersections first
    const controlPointIntersects = raycasterRef.current.intersectObjects(
      controlPointsRef.current
    );
    
    if (controlPointIntersects.length > 0) {
      const intersectedPoint = controlPointIntersects[0].object;
      if (intersectedPoint.userData.isControlPoint) {
        setHoveredControlPoint({
          elementId: intersectedPoint.userData.elementId,
          pointIndex: intersectedPoint.userData.pointIndex
        });
        canvasRef.current.style.cursor = 'pointer';
        return;
      }
    } else {
      setHoveredControlPoint(null);
    }
    
    // Check for element intersections
    const selectableObjects = sceneRef.current.children.filter(
      child => child.userData && child.userData.isCADElement
    );
    
    if (selectableObjects.length > 0) {
      const intersectedObject = selectableObjects[0];
      const elementId = intersectedObject.userData.elementId;
      
      if (elementId) {
        setHoveredElementId(elementId);
        canvasRef.current.style.cursor = 'pointer';
      }
    } else {
      setHoveredElementId(null);
      canvasRef.current.style.cursor = 'default';
    }
    
    // Update mouse position in 3D space for status bar
    // Convert screen coordinates to 3D world coordinates
    const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const mouse3D = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0);
    mouse3D.unproject(cameraRef.current);
    
    const raycaster = new THREE.Raycaster(cameraRef.current.position, 
      mouse3D.sub(cameraRef.current.position).normalize());
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, intersection);
    
    // Update store with mouse position
    setMousePosition({
      x: Math.round(intersection.x * 100) / 100,
      y: Math.round(intersection.y * 100) / 100,
      z: Math.round(intersection.z * 100) / 100
    });
  }, [activeDragPoint, handleControlPointDrag, setMousePosition, updateControlPoints, isPlacingComponent, handleMouseMoveForPreview, canvasRef, sceneRef, cameraRef,
    isBoxSelecting, screenToWorld, updateBoxSelection,]);

  // Handle mouse down for element selection or control point dragging
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (isPlacingComponent) {
      handleClickForPlacement(event);
      return;
    }
    
    if (!canvasRef.current || !sceneRef.current || !cameraRef.current) return;
    
    // Only handle left clicks
    if (event.button !== 0) return;
    
    // Box selection
    if (isSelectionMode) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      // Convert screen to world coordinates
      const worldPosition = screenToWorld(mouseX, mouseY);
      if (worldPosition) {
        const position = { x: worldPosition.x, y: worldPosition.y };
        startBoxSelection(position);
        
        // Disable orbit controls while box selecting
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }
        
        event.preventDefault();
        return;
      }
    }
    
    
    // Calculate normalized device coordinates
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    
    // Check for control point intersections first
    const controlPointIntersects = raycasterRef.current.intersectObjects(
      controlPointsRef.current
    );
    
    if (controlPointIntersects.length > 0) {
      const intersectedPoint = controlPointIntersects[0].object;
      if (intersectedPoint.userData.isControlPoint) {
        // Starting a control point drag
        event.stopPropagation();
        setActiveDragPoint({
          elementId: intersectedPoint.userData.elementId,
          pointIndex: intersectedPoint.userData.pointIndex
        });
        setIsDragging(true);
        
        // Disable orbit controls while dragging
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }
        return;
      }
    }
      // Trova tutti gli oggetti selezionabili
  const selectableObjects = sceneRef.current.children.filter(
    child => child.userData && child.userData.isCADElement
  );

    // If not clicking on a control point, check for element intersections
    const intersects = raycasterRef.current.intersectObjects(selectableObjects, true);
  
    if (intersects.length > 0) {
      // Ottieni l'elemento ID, considerando sia l'oggetto che i suoi genitori
      let elementId = null;
      let currentObj: THREE.Object3D | null = intersects[0].object;
      
      // Risali nella gerarchia per trovare l'ID dell'elemento
      while (currentObj && !elementId) {
        if (currentObj.userData && currentObj.userData.elementId) {
          elementId = currentObj.userData.elementId;
        }
        currentObj = currentObj.parent;
      }
      
      if (elementId) {
        selectElement(elementId);
        console.log("Elemento selezionato:", elementId);
      } else {
        console.log("Oggetto trovato ma nessun elementId:", intersects[0].object);
      }
    } else {
      // Cliccato su spazio vuoto, deseleziona
      selectElement(null);
    }
  }, [ isPlacingComponent, handleClickForPlacement, canvasRef, sceneRef, cameraRef, 
    isSelectionMode, screenToWorld, startBoxSelection, selectElement]);



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPlacingComponent) {
        // Annulla il posizionamento
        if (previewRef.current && sceneRef.current) {
          sceneRef.current.remove(previewRef.current);
          previewRef.current = null;
        }
        setIsPlacingComponent(false);
        
        // Riabilita i controlli orbitali
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        
        // Notifica che l'utente ha annullato
        if (onComponentPlaced) {
          onComponentPlaced(previewComponent || '', { x: 0, y: 0, z: 0 });
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlacingComponent, previewComponent, onComponentPlaced]);

  // Handle mouse up to finish dragging
  const handleMouseUp = useCallback(() => {
   
    if (activeDragPoint) {
      setActiveDragPoint(null);
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    }
    setIsDragging(false);
    if (isBoxSelecting) {
      endBoxSelection();
      
      // Re-enable orbit controls after box selection
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
      
      return;
    }
  }, [activeDragPoint,isBoxSelecting, endBoxSelection, ]);

  // Update control points when selected element changes
  useEffect(() => {
    updateControlPoints();
  }, [selectedElement, updateControlPoints]);

  // Update camera and controls when view mode changes
  
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !sceneRef.current) return;
    
    switch (viewMode) {
      case '2d':
        // Set dark background for 2D mode
        sceneRef.current.background = new THREE.Color('#2A2A2A');
        
        // Position camera to look at XZ plane (from Y axis)
        cameraRef.current.position.set(0, 50, 0);
        cameraRef.current.up.set(0, 1, 0); // Set Z as the up direction
        cameraRef.current.lookAt(0, 0, 0);
        
        // Update grid for XZ plane view
        const gridHelper = sceneRef.current.children.find(
          child => child instanceof THREE.GridHelper
        ) as THREE.GridHelper | undefined;
        
        if (gridHelper) {
          gridHelper.material.opacity = 0.2;
          gridHelper.material.transparent = true;
          // Align grid with XZ plane
          gridHelper.rotation.x = 0;
        }
        
        // Disable rotation in 2D mode
        controlsRef.current.enableRotate = false;
        controlsRef.current.enablePan = true;
        
        // Show only X and Z axes in 2D mode
        const customAxes = sceneRef.current.children.find(
          child => child.userData.isCustomAxes
        );
        
        if (customAxes) {
          customAxes.visible = axisVisible;
          customAxes.children.forEach((child, index) => {
            // Show X (index 0) and Y (index 1), hide Z (index 2)
            if (index === 2) {
              child.visible = false;
            } else {
              child.visible = true;
            }
          });
        }
        break;
        
      case '3d':
        // Restore original background color for 3D mode
        sceneRef.current.background = new THREE.Color('#2A2A2A');
        
        // Reset camera for 3D view
        cameraRef.current.position.set(5, 5, 5);
        cameraRef.current.up.set(0, 1, 0); // Reset up vector to Y
        cameraRef.current.lookAt(0, 0, 0);
        
        // Enable all controls for 3D mode
        controlsRef.current.enableRotate = true;
        controlsRef.current.enablePan = true;
        
        // Show all axes in 3D mode
        const axes3D = sceneRef.current.children.find(
          child => child.userData.isCustomAxes
        );
        
        if (axes3D) {
          axes3D.visible = axisVisible;
          axes3D.children.forEach(child => {
            child.visible = true;
          });
        }
        break;
        
      default:
        break;
    }
  }, [viewMode, axisVisible]);

  useEffect(() => {
    if (!sceneRef.current) return;
    
    const { originOffset } = useCADStore.getState();
    
    // Aggiornare posizione griglia
    const gridHelper = sceneRef.current.children.find(
      child => child instanceof THREE.GridHelper
    ) as THREE.GridHelper | undefined;
    
    if (gridHelper) {
      gridHelper.visible = gridVisible;
      // Sposta la griglia per compensare l'offset dell'origine
      gridHelper.position.set(originOffset.x, originOffset.y, originOffset.z);
    }
    
    // Aggiornare posizione assi
    const customAxes = sceneRef.current.children.find(
      child => child.userData.isCustomAxes
    );
    
    if (customAxes) {
      customAxes.visible = axisVisible;
      customAxes.position.set(originOffset.x, originOffset.y, originOffset.z);
    }
    
    // Aggiungi indicatore visuale dell'origine
    addOriginIndicator();
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridVisible, axisVisible, useCADStore.getState().originOffset]);
  
  // Funzione per aggiungere l'indicatore dell'origine
  const addOriginIndicator = () => {
    if (!sceneRef.current) return;
    
    // Rimuovi indicatore esistente se presente
    const existingIndicator = sceneRef.current.children.find(
      child => child.userData.isOriginIndicator
    );
    
    if (existingIndicator) {
      sceneRef.current.remove(existingIndicator);
    }
    
    // Crea nuovo indicatore
    const originIndicator = new THREE.Group();
    originIndicator.userData.isOriginIndicator = true;
    
    // Piccolo punto all'origine
    const pointGeometry = new THREE.SphereGeometry(2, 16, 16);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const point = new THREE.Mesh(pointGeometry, pointMaterial);
    originIndicator.add(point);
    
    sceneRef.current.add(originIndicator);
  };
  // Render elements when they change
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Remove existing elements
    const elementsToRemove = sceneRef.current.children.filter(
      child => child.userData.isCADElement
    );
    
    elementsToRemove.forEach(element => {
      sceneRef.current?.remove(element);
    });
    
    // Aggrega elementi per tipo per potenziale instanziazione
    const elementsByType: Record<string, any[]> = {};
    
    elements.forEach(element => {
      const layer = layers.find(l => l.id === element.layerId);
      if (!layer || !layer.visible) return;
      
      const type = element.type;
      if (!elementsByType[type]) {
        elementsByType[type] = [];
      }
      elementsByType[type].push(element);
    });
    
    // Per ogni tipo di elemento, determina se usare instanziazione o renderizzazione individuale
    Object.entries(elementsByType).forEach(([type, elements]) => {
      if (elements.length > 20 && ['cube', 'sphere', 'cylinder'].includes(type)) {
        // Usa InstancedMesh per tipi semplici con molte istanze
        createInstancedMesh(type, elements);
      } else {
        // Renderizza individualmente
        elements.forEach(element => {
          const threeObject = createThreeObject(element);
          if (threeObject) {
            threeObject.userData.isCADElement = true;
            threeObject.userData.elementId = element.id;
            
            // Evidenziazione e selezione
            highlightElement(threeObject, element);
            
            sceneRef.current?.add(threeObject);
          }
        });
      }
    });
    
    // Applica LOD dopo aver aggiunto tutti gli elementi
    if (typeof applyLOD === 'function') {
      applyLOD();
    }
    
    // Ottimizza la scena (merge di geometrie, etc)
    if (typeof optimizeScene === 'function') {
      optimizeScene();
    }
    
    // Aggiorna i punti di controllo
    if (typeof updateControlPoints === 'function') {
      updateControlPoints();
    }
  }, [elements, layers, hoveredElementId, selectedElement, applyLOD, optimizeScene, updateControlPoints, createThreeObject]);

  // Funzione ottimizzata per gestire il drag & drop dalla libreria
  const handleComponentDragOver = useCallback((event: React.DragEvent) => {
    if (!allowDragDrop) return;
    
    event.preventDefault();
    setIsDraggingComponent(true);
    
    if (!canvasRef.current || !cameraRef.current || !sceneRef.current) return;
    
    try {
      // Calcola le coordinate normalizzate del mouse
      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Calcola l'intersezione con un piano XY
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouseRef.current, cameraRef.current);
      
      // Verifica intersezione con oggetti esistenti o usa un piano di base
      const intersects = raycaster.intersectObjects(
        sceneRef.current.children.filter(child => 
          child.userData?.isCADElement && 
          child.visible
        ),
        true
      );
      
      let targetPosition: { x: number, y: number, z: number };
      
      if (intersects.length > 0) {
        // Usa il punto di intersezione più vicino
        const point = intersects[0].point;
        targetPosition = { x: point.x, y: point.y, z: point.z };
      } else {
        // Calcola intersezione con il piano XY
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersection)) {
          targetPosition = { 
            x: intersection.x - originOffset.x, 
            y: intersection.y - originOffset.y, 
            z: intersection.z - originOffset.z 
          };
        } else {
          // Fallback
          targetPosition = { x: 0, y: 0, z: 0 };
        }
      }
      
      // Applica snapping se necessario
      if (snapSettings.enabled) {
        const snappedPoint = snapToPoint(targetPosition);
        if (snappedPoint) {
          targetPosition = snappedPoint;
        }
      }
      
      // Calcola posizione sullo schermo per l'indicatore
      const worldPos = new THREE.Vector3(
        targetPosition.x + originOffset.x,
        targetPosition.y + originOffset.y,
        targetPosition.z + originOffset.z
      );
      const screenPos = worldToScreen(worldPos);
      
      setDropPosition(targetPosition);
      setDropScreenPosition(screenPos || undefined);
      
    } catch (error) {
      console.error("Error during drag over:", error);
    }
  }, [allowDragDrop, snapSettings.enabled, originOffset.x, originOffset.y, originOffset.z, worldToScreen, snapToPoint]);

  const handleComponentDrop = useCallback((event: React.DragEvent) => {
    if (!allowDragDrop) return;
    
    event.preventDefault();
    const componentId = event.dataTransfer.getData('component/id');
    
    if (!componentId) return;
    
    // Recupera il componente dalla libreria
    const component = predefinedComponents.find(c => c.data === componentId || c.name === componentId);
    
    if (!component) return;
    
    // Crea un nuovo elemento CAD basato sul componente
    const newElement = transformLibraryItemToCADElement(component, dropPosition);
    
    // Aggiungi l'elemento al canvas
    addElement(newElement);
    
    // Resetta gli stati del drag & drop
    setIsDraggingComponent(false);
    setDraggedComponent(null);
  }, [allowDragDrop, dropPosition, addElement]);

  const handleComponentDragLeave = useCallback(() => {
    setIsDraggingComponent(false);
  }, []);

  // Hook per ottimizzare la renderizzazione degli elementi con useMemo
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Rimuovi elementi CAD esistenti dalla scena
    const elementsToRemove = sceneRef.current.children
      .filter(child => child.userData && child.userData.isCADElement)
      .slice();
    
    elementsToRemove.forEach(element => {
      sceneRef.current?.remove(element);
    });
    
    // Aggrega elementi per tipo per potenziale instanziazione
    const elementsByType: Record<string, any[]> = {};
    
    elements.forEach(element => {
      const layer = layers.find(l => l.id === element.layerId);
      if (!layer || !layer.visible) return;
      
      const type = element.type;
      if (!elementsByType[type]) {
        elementsByType[type] = [];
      }
      elementsByType[type].push(element);
    });
    
    // Per ogni tipo di elemento, determina se usare instanziazione o renderizzazione individuale
    Object.entries(elementsByType).forEach(([type, elements]) => {
      if (elements.length > 20 && ['cube', 'sphere', 'cylinder'].includes(type)) {
        // Usa InstancedMesh per tipi semplici con molte istanze
        createInstancedMesh(type, elements);
      } else {
        // Renderizza individualmente
        elements.forEach(element => {
          const threeObject = createThreeObject(element);
          if (threeObject) {
            threeObject.userData.isCADElement = true;
            threeObject.userData.elementId = element.id;
            
            // Evidenziazione e selezione
            highlightElement(threeObject, element);
            
            sceneRef.current?.add(threeObject);
          }
        });
      }
    });
    
    // Applica LOD dopo aver aggiunto tutti gli elementi
    if (typeof applyLOD === 'function') {
      applyLOD();
    }
    
    // Ottimizza la scena (merge di geometrie, etc)
    if (typeof optimizeScene === 'function') {
      optimizeScene();
    }
    
    // Aggiorna i punti di controllo
    if (typeof updateControlPoints === 'function') {
      updateControlPoints();
    }
    
  }, [elements, layers, hoveredElementId, selectedElement, applyLOD, optimizeScene, updateControlPoints, createThreeObject]);

  // Funzione per creare mesh istanziati per elementi simili
  const createInstancedMesh = useCallback((type: string, elements: any[]) => {
    if (!sceneRef.current) return;
    
    // Crea geometria in base al tipo
    let geometry: THREE.BufferGeometry;
    
    switch (type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(1, 16, 16);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(1, 1, 1, 16);
        break;
      default:
        return;
    }
    
    // Crea materiale
    const material = new THREE.MeshStandardMaterial();
    
    // Crea InstancedMesh
    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      elements.length
    );
    instancedMesh.userData.isCADElement = true;
    instancedMesh.userData.isInstanced = true;
    instancedMesh.userData.instanceMap = new Map();
    
    // Configura ogni istanza
    elements.forEach((element, index) => {
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
      
      // Applica scala in base al tipo
      let scale: THREE.Vector3;
      
      switch (type) {
        case 'cube':
          scale = new THREE.Vector3(element.width, element.height, element.depth);
          break;
        case 'sphere':
          scale = new THREE.Vector3(element.radius * 2, element.radius * 2, element.radius * 2);
          break;
        case 'cylinder':
          scale = new THREE.Vector3(element.radius * 2, element.height, element.radius * 2);
          break;
        default:
          scale = new THREE.Vector3(1, 1, 1);
      }
      
      // Imposta matrice di trasformazione
      matrix.compose(position, new THREE.Quaternion(), scale);
      instancedMesh.setMatrixAt(index, matrix);
      
      // Imposta colore
      const color = new THREE.Color(element.color || 0x1e88e5);
      instancedMesh.setColorAt(index, color);
      
      // Mappa l'elemento all'indice
      instancedMesh.userData.instanceMap.set(element.id, index);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    
    sceneRef.current.add(instancedMesh);
  }, [originOffset]);

  // Funzione per evidenziare elementi
  const highlightElement = useCallback((threeObject: THREE.Object3D, element: any) => {
    if (element.id === hoveredElementId) {
      if (threeObject instanceof THREE.Line) {
        (threeObject.material as THREE.LineBasicMaterial).color.set(0x4a90e2);
        (threeObject.material as THREE.LineBasicMaterial).linewidth = (element.linewidth || 1) + 1;
      } else if (threeObject instanceof THREE.Mesh) {
        if ((threeObject.material as THREE.MeshBasicMaterial).wireframe) {
          (threeObject.material as THREE.MeshBasicMaterial).color.set(0x4a90e2);
        } else {
          const material = threeObject.material as THREE.MeshStandardMaterial;
          material.emissive.set(0x4a90e2);
          material.emissiveIntensity = 0.3;
        }
      }
    }
    
    if (selectedElement && element.id === selectedElement.id) {
      if (threeObject instanceof THREE.Line) {
        (threeObject.material as THREE.LineBasicMaterial).color.set(0xff3366);
        (threeObject.material as THREE.LineBasicMaterial).linewidth = (element.linewidth || 1) + 2;
      } else if (threeObject instanceof THREE.Mesh) {
        if ((threeObject.material as THREE.MeshBasicMaterial).wireframe) {
          (threeObject.material as THREE.MeshBasicMaterial).color.set(0xff3366);
        } else {
          const material = threeObject.material as THREE.MeshStandardMaterial;
          material.emissive?.set(0xff3366);
          material.emissiveIntensity = 0.5;
        }
      }
    }
  }, [hoveredElementId, selectedElement]);

  // Inizializzazione dei TransformControls
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // Crea transform controls per manipolazione diretta
    const transformControls = new TransformControls(
      cameraRef.current,
      rendererRef.current.domElement
    );
    transformControls.size = 0.8; // Dimensione ridotta per non intralciare
    transformControls.addEventListener('dragging-changed', (event: THREE.Event) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !(event as any).value;
      }
    });
    
    sceneRef.current.add(transformControls);
    transformControlsRef.current = transformControls;
    
    transformControlsRef.current?.addEventListener('mouseDown', () => setIsModifying(true));
    transformControlsRef.current?.addEventListener('mouseUp', () => setIsModifying(false));
    
    return () => {
      if (transformControls && sceneRef.current) {
        sceneRef.current.remove(transformControls);
      }
    };
  }, []);
  const ensureObjectMetadata = (object: THREE.Object3D, elementId: string) => {
    // Imposta i metadata sull'oggetto principale
    object.userData.isCADElement = true;
    object.userData.elementId = elementId;
    
    // Propaga i metadata a tutti i figli
    object.traverse((child) => {
      if (child !== object) {
        child.userData.isCADElement = true;
        child.userData.elementId = elementId;
        child.userData.isChild = true; // Opzionale: per distinguere i figli
      }
    });
  };

  useEffect(() => {
    // Controlla se c'è un parametro loadComponent nella query string
    if (router.query.loadComponent) {
      const componentId = String(router.query.loadComponent);
      const storedComponentJSON = localStorage.getItem('componentToLoadInCAD');
      
      console.log('Tentativo di caricamento componente ID:', componentId);
      console.log('Dati in localStorage:', storedComponentJSON?.substring(0, 100) + '...');
      
      if (storedComponentJSON) {
        try {
          const componentData = JSON.parse(storedComponentJSON);
          
          // Verifica che l'ID corrisponda esattamente
          if (componentData && componentData.id && componentData.id === componentId) {
            console.log('Componente trovato, preparazione al caricamento');
            
            // Crea un nuovo elemento CAD dal componente
            const newElement = {
              id: `component-${Date.now()}`, // ID univoco per il nuovo elemento CAD
              type: 'component',
              x: 0,
              y: 0,
              z: 0,
              name: componentData.name || 'Componente',
              componentId: componentData.id,
              data: componentData.data,
              layerId: layers.length > 0 ? layers[0].id : 'default'
            };
            
            // Aggiungi l'elemento al canvas
            addElement(newElement);
            toast.success(`Componente ${componentData.name} caricato con successo`);
            
            // Pulisci localStorage dopo il caricamento
            localStorage.removeItem('componentToLoadInCAD');
            localStorage.removeItem('componentToLoadInCAD_timestamp');
            
            // Rimuovi i parametri query dall'URL
            const { loadComponent, ts, ...otherParams } = router.query;
            router.replace({
              pathname: router.pathname,
              query: otherParams
            }, undefined, { shallow: true });
          } else {
            console.error('ID componente non corrisponde:', {
              idFromURL: componentId, 
              idFromStorage: componentData?.id
            });
            toast.error('ID componente non corrisponde');
          }
        } catch (error) {
          console.error('Errore parsing dati componente:', error);
          toast.error('Errore formato dati componente');
        }
      } else {
        console.error('Nessun dato componente trovato in localStorage');
        toast.error('Dati componente non trovati');
      }
    }
  }, [layers, addElement]);
  
  // Aggiorna transform controls quando cambia l'elemento selezionato
  useEffect(() => {
    if (!transformControlsRef.current) return;
    
    if (selectedElement) {
      // Find the object threejs corresponding to the selected element
      const selectedObject = sceneRef.current?.children.find(
        child => child.userData?.isCADElement && child.userData?.elementId === selectedElement.id
      );
      
      if (selectedObject) {
        try {
          // If it's a group or complex object, find the first mesh child or use the group itself
          let targetObject = selectedObject;
          
          // For components, use the group directly for transformations
          if (selectedObject.userData.isComponent) {
            targetObject = selectedObject;
          }
          // For other groups, find an appropriate mesh child if the selected object is a group
          else if (selectedObject instanceof THREE.Group && !selectedObject.userData.isComponent) {
            let foundMesh = false;
            selectedObject.traverse(child => {
              if (child instanceof THREE.Mesh && !foundMesh) {
                targetObject = child;
                foundMesh = true;
              }
            });
          }
          
          // Make sure the object is in the scene before attaching
          if (ensureObjectInScene(targetObject)) {
            transformControlsRef.current.attach(targetObject);
            transformControlsRef.current.setMode(transformMode);
            transformControlsRef.current.visible = true;
            
            // Make sure controls are at the top of the scene hierarchy
            if (sceneRef.current) {
              sceneRef.current.remove(transformControlsRef.current);
              sceneRef.current.add(transformControlsRef.current);
              sceneRef.current.getObjectById(transformControlsRef.current.id)
            }
          } else {
            console.warn("Cannot attach TransformControls: object is not in the scene graph");
            transformControlsRef.current.detach();
            transformControlsRef.current.visible = false;
          }
        } catch (error) {
          console.error("Error attaching transform controls:", error);
          transformControlsRef.current.detach();
          transformControlsRef.current.visible = false;
        }
      } else {
        transformControlsRef.current.detach();
        transformControlsRef.current.visible = false;
      }
    } else {
      transformControlsRef.current.detach();
      transformControlsRef.current.visible = false;
    }
  }, [selectedElement, transformMode, ensureObjectInScene]);

  // Gestisci aggiornamenti quando un elemento viene modificato tramite transform controls
  useEffect(() => {
    if (!transformControlsRef.current) return;
    
    const handleObjectChange = debounce(
      debounce(() => {
        if (!selectedElement) return;
        
        const object = transformControlsRef.current?.object;
        if (!object) return;
        
        // Extract position, rotation and scale
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();
        
        object.getWorldPosition(position);
        rotation.copy(object.rotation);
        scale.copy(object.scale);
        
        // Aggiorna l'elemento nel store
        const updates: any = {
          x: position.x - originOffset.x,
          y: position.y - originOffset.y,
          z: position.z - originOffset.z
        };
        
        // Aggiungi rotazione in gradi
        if (transformMode === 'rotate') {
          updates.rotationX = THREE.MathUtils.radToDeg(rotation.x);
          updates.rotationY = THREE.MathUtils.radToDeg(rotation.y);
          updates.rotationZ = THREE.MathUtils.radToDeg(rotation.z);
        }
        
        // Aggiungi scala
        if (transformMode === 'scale') {
          updates.scaleX = scale.x;
          updates.scaleY = scale.y;
          updates.scaleZ = scale.z;
        }
        
        updateElement(selectedElement.id, updates);
        
        // Force matrix updates
        object.updateMatrix();
        object.updateMatrixWorld(true);
        if (object.parent) {
          object.parent.updateMatrixWorld(true);
        }
      }, 16),
      
    );
    
    transformControlsRef.current?.addEventListener('objectChange', handleObjectChange);
    
    return () => {
      transformControlsRef.current?.removeEventListener('objectChange', handleObjectChange);
    };
}, [selectedElement, updateElement, originOffset, transformMode]);

  // Aggiungi questa funzione ausiliaria per implementare la conversione da 3D a 2D
  
  // Aggiungi questa funzione all'interno del componente CADCanvas
  const getScreenPosition = (position3D: THREE.Vector3): { x: number, y: number } | null => {
    if (!cameraRef.current || !rendererRef.current) return null;
    
    const vector = position3D.clone();
    const canvas = rendererRef.current.domElement;
    
    vector.project(cameraRef.current);
    
    return { 
      x: (vector.x * 0.5 + 0.5) * canvas.width,
      y: (vector.y * -0.5 + 0.5) * canvas.height
    };
  };
  const allShortcuts: ShortcutCategory[] = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["Left Click + Drag"], description: "Rotate camera (3D mode)" },
        { keys: ["Middle Click + Drag"], description: "Pan view" },
        { keys: ["Right Click + Drag"], description: "Orbit around selection" },
        { keys: ["Scroll"], description: "Zoom in/out" },
        { keys: ["+", "="], description: "Zoom in" },
        { keys: ["-", "_"], description: "Zoom out" },
        { keys: ["F"], description: "Zoom to fit/focus on selection" },
        { keys: ["Ctrl + 1"], description: "Switch to 3D view" },
        { keys: ["Ctrl + 2"], description: "Switch to top view (2D)" },
      ]
    },
    {
      title: "Selection & Editing",
      shortcuts: [
        { keys: ["Click"], description: "Select object" },
        { keys: ["Shift + Click"], description: "Add to selection" },
        { keys: ["Ctrl + Click"], description: "Remove from selection" },
        { keys: ["Escape"], description: "Deselect all / Cancel current operation" },
        { keys: ["Delete", "Backspace"], description: "Delete selected objects" },
        { keys: ["G"], description: "Move (Translate) mode" },
        { keys: ["R"], description: "Rotate mode" },
        { keys: ["S"], description: "Scale mode" },
        { keys: ["X"], description: "Constrain to X axis" },
        { keys: ["Y"], description: "Constrain to Y axis" },
        { keys: ["Z"], description: "Constrain to Z axis" },
      ]
    },
    {
      title: "Tools & Creation",
      shortcuts: [
        { keys: ["L"], description: "Line tool" },
        { keys: ["C"], description: "Circle tool" },
        { keys: ["R"], description: "Rectangle tool" },
        { keys: ["P"], description: "Polygon tool" },
        { keys: ["B"], description: "Box/Cube tool" },
        { keys: ["O"], description: "Sphere tool" },
        { keys: ["Y"], description: "Cylinder tool" },
        { keys: ["T"], description: "Text tool" },
        { keys: ["D"], description: "Dimension tool" },
        { keys: ["M"], description: "Measurement tool" },
      ]
    },
    {
      title: "View Controls",
      shortcuts: [
        { keys: ["Ctrl + G"], description: "Toggle grid visibility" },
        { keys: ["Ctrl + A"], description: "Toggle axes visibility" },
        { keys: ["F11", "Alt + F"], description: "Toggle fullscreen" },
        { keys: ["H"], description: "Hide selected objects" },
        { keys: ["Alt + H"], description: "Show all objects" },
        { keys: ["W"], description: "Toggle wireframe mode" },
        { keys: ["Alt + Z"], description: "Toggle X-ray mode" },
      ]
    },
    {
      title: "Snapping & Precision",
      shortcuts: [
        { keys: ["Ctrl + X"], description: "Toggle snap mode" },
        { keys: ["Alt + G"], description: "Toggle grid snap" },
        { keys: ["Alt + P"], description: "Toggle point snap" },
        { keys: ["Alt + M"], description: "Toggle midpoint snap" },
        { keys: ["Alt + I"], description: "Toggle intersection snap" },
        { keys: ["Alt + C"], description: "Toggle center snap" },
      ]
    },
    {
      title: "History & File Operations",
      shortcuts: [
        { keys: ["Ctrl + Z"], description: "Undo" },
        { keys: ["Ctrl + Y", "Ctrl + Shift + Z"], description: "Redo" },
        { keys: ["Ctrl + S"], description: "Save" },
        { keys: ["Ctrl + O"], description: "Open" },
        { keys: ["Ctrl + N"], description: "New" },
        { keys: ["Ctrl + E"], description: "Export" },
        { keys: ["Ctrl + I"], description: "Import" },
      ]
    },
    {
      title: "Layers & Organization",
      shortcuts: [
        { keys: ["Ctrl + L"], description: "Toggle layers panel" },
        { keys: ["Ctrl + Shift + N"], description: "New layer" },
        { keys: ["Ctrl + G"], description: "Group selected objects" },
        { keys: ["Ctrl + Shift + G"], description: "Ungroup" },
        { keys: ["Alt + L"], description: "Lock selected objects" },
        { keys: ["Alt + Shift + L"], description: "Unlock all objects" },
      ]
    },
    {
      title: "Help & UI",
      shortcuts: [
        { keys: ["?", "Shift + /"], description: "Show keyboard shortcuts (this dialog)" },
        { keys: ["F1"], description: "Help" },
        { keys: ["Ctrl + ,"], description: "Preferences" },
        { keys: ["Tab"], description: "Toggle sidebar" },
        { keys: ["Ctrl + B"], description: "Toggle properties panel" },
        { keys: ["Ctrl + Space"], description: "Command palette" },
        { keys: ["Ctrl + F"], description: "Search" },
      ]
    },
  ];


  const getTemporaryCanvas = (key: string, width: number, height: number) => {
    return CanvasPool.getCanvas(`temp-${key}`, width, height);
  };
  
  const getTextureFromPool = (key: string, width: number, height: number) => {
    return CanvasPool.getTexture(`texture-${key}`, width, height);
  };
  
  // Cleanup function per il componente
  useEffect(() => {
    return () => {
      // Pulisci il pool quando il componente viene smontato
      CanvasPool.clearPool();
    };
  }, []);

  return (
    <div 
      ref={canvasRef} 
      style={{ 
        width: width,
        height: height
      }}
      className={`relative bg-gray-200 overflow-hidden ${isPlacingComponent || isDraggingComponent ? 'cursor-cell' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDragOver={handleComponentDragOver}
      onDrop={handleComponentDrop}
      onDragLeave={handleComponentDragLeave}
    >
      <SnapIndicator 
        x={snapIndicator.x} 
        y={snapIndicator.y}
        type={snapIndicator.type} 
        visible={snapIndicator.visible} 
      />
       <div className="absolute top-4 left-4 z-10">
        <SelectionControls
          isSelectionMode={isSelectionMode}
          isMultiSelectMode={isMultiSelectMode}
          onSelectionModeChange={handleSelectionModeChange}
          onMultiSelectModeToggle={toggleMultiSelectMode}
          onDeleteSelected={useSelectionStore.getState().deleteSelection}
          onDuplicateSelected={useSelectionStore.getState().duplicateSelection}
          onMoveToLayer={useSelectionStore.getState().moveSelectionToLayer}
          onCreateComponent={() => setShowComponentModal(true)}
          bounds={useSelectionStore.getState().getSelectionBounds()}
        />
      </div>

      <BoxSelection worldToScreen={worldToScreen} />

{showElementsList && (
  <div className="absolute top-16 right-4 bottom-16 z-10">
    <ElementsListPanel onClose={() => setShowElementsList(false)} />
  </div>
)}
      {selectedElementIds.length === 1 && showElementInfo && (
  <div className="absolute top-16 right-4 z-10 w-80">
    <ElementInfo 
      elementId={selectedElementIds[0]} 
      onClose={() => setShowElementInfo(false)}
    />
  </div>
)}


<ComponentCreationModal 
  isOpen={showComponentModal}
  onClose={() => setShowComponentModal(false)}
/>

<button
  onClick={() => setShowElementsList(!showElementsList)}
  className="absolute top-4 right-4 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10"
  title="Toggle Elements List"
>
  <Layers size={18} />
</button>

{selectedElementIds.length === 1 && (
  <button
    onClick={() => setShowElementInfo(!showElementInfo)}
    className="absolute top-4 right-16 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10"
    title="Show Element Properties"
  >
    <Sliders size={18} />
  </button>
)}
      {/* Istruzioni per il posizionamento */}
      {isPlacingComponent && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md shadow-lg z-100">
          <p className="text-sm font-medium">Click per posizionare il componente o premere ESC per annullare</p>
        </div>
      )}
      
      {/* Indicatore per drag & drop */}
      {isDraggingComponent && (
        <DragDropIndicator 
          position={dropPosition} 
          screenPosition={dropScreenPosition}
        />
      )}
      
      {/* Pannello degli strumenti di trasformazione */}
      {selectedElement && (
        <div className="absolute top-4 right-4 flex space-x-2 bg-[#F8FBFF] dark:bg-gray-800 p-2 rounded-md shadow-md z-10">
          <button 
            onClick={() => {
              setTransformMode('translate');
              transformControlsRef.current?.setMode('translate');
            }}
            className={`p-2 rounded ${transformMode === 'translate' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            title="Move (G)"
          >
            <Move size={16} />
          </button>
          <button 
            onClick={() => {
              setTransformMode('rotate');
              transformControlsRef.current?.setMode('rotate');
            }}
            className={`p-2 rounded ${transformMode === 'rotate' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            title="Rotate (R)"
          >
            <RotateCw size={16} />
          </button>
          <button 
            onClick={() => {
              setTransformMode('scale');
              transformControlsRef.current?.setMode('scale');
            }}
            className={`p-2 rounded ${transformMode === 'scale' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            title="Scale (S)"
          >
            <Maximize size={16} />
          </button>
          <button
          onClick={() => performBooleanOperation('union')}
          className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
          title="Boolean Union (Ctrl+U)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"></circle><circle cx="16" cy="16" r="6"></circle></svg>
        </button>
        
        <button
          onClick={() => performBooleanOperation('subtract')}
          className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
          title="Boolean Subtract (Ctrl+S)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"></circle><circle cx="16" cy="16" r="6"></circle><path d="M2 2l20 20"></path></svg>
        </button>
        
        <button
          onClick={() => performBooleanOperation('intersect')}
          className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
          title="Boolean Intersect (Ctrl+I)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"></circle><circle cx="16" cy="16" r="6"></circle><path d="M8 14a6 6 0 0 0 8-8"></path></svg>
        </button>
        </div>
      )}
      {/* Pannello performance */}
      
      
      {/* Fullscreen button */}
      <div className="absolute bottom-4 right-4 flex space-x-2">
       
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-[#F8FBFF] dark:bg-black dark:text-white bg-opacity-80 rounded-md shadow-md hover:bg-opacity-100 z-10 transition-all duration-200"
          title={isFullscreen ? "Exit fullscreen mode" : "Fullscreen view"}
        >
          {isFullscreen ? (
            <Minimize2 size={20} className="text-gray-700" />
          ) : (
            <Maximize2 size={20} className="text-gray-700" />
          )}
        </button>
      </div>
      
      {/* Keyboard shortcuts info - attivato con ? */}
      <div className="absolute bottom-4 left-4">
        
      <button 
        onClick={() => setShowKeyboardShortcuts(true)}
        className="p-2 bg-[#F8FBFF] dark:bg-gray-800 bg-opacity-80 rounded-full text-gray-700 dark:text-gray-200 hover:bg-opacity-100 shadow-md hover:shadow-lg transition-all duration-200"
        title="Show keyboard shortcuts (? or F2)"
      >
        <HelpCircle size={18} />
      </button>
    </div>
    
    {/* Keyboard shortcuts dialog - positioned outside the button for proper z-index/overlay */}
    <ShortcutsDialog 
      isOpen={showKeyboardShortcuts} 
      onClose={() => setShowKeyboardShortcuts(false)} 
      shortcuts={allShortcuts}
    />
  
    </div>
  );
};

export default CADCanvas;
declare global {
  interface Window {
    cadCanvasScene?: THREE.Scene;
    cadCanvasCamera?: THREE.Camera;
    exposeCADCanvasAPI?: boolean;
    cadExporter?: {
      exportSTEP: (scene: THREE.Scene | null, filename: string) => void;
    };
  }
}