import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { useCADStore } from "src/store/cadStore";
import { useElementsStore } from "src/store/elementsStore";
import { useLayerStore } from "src/store/layerStore";
import { HelpCircle, Layers, Maximize, Maximize2, Minimize2, Move, RotateCw, Sliders } from "react-feather";
import { predefinedComponents } from "@/src/lib/predefinedLibraries";
import { transformLibraryItemToCADElement, createComponentPreview } from "@/src/lib/libraryTransform";

import SnapIndicator from "./SnapIndicator";
import { useSnap } from "@/src/hooks/useSnap";
import { useLOD } from "src/hooks/canvas/useLod";
import { useThreePerformance } from "src/hooks/canvas/useThreePerformance";
import { useCADKeyboardShortcuts } from "src/hooks/useCADKeyboardShortcuts";
import DragDropIndicator from "./DragDropIndicator";

import ShortcutsDialog, { ShortcutCategory } from "../ShortcutsDialog";
import { CSG } from "three-csg-ts";
// WASM Integration imports
// Replaced with useUnifiedWasmOptimizer
import { getWasmWorkerManager } from "@/src/lib/wasm/workerManager";

// Importazioni per esportazione
import { STLExporter } from "three/examples/jsm/exporters/STLExporter";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import { useCursorContext } from "@/src/contexts/CursorContext";
import { InteractionState, ToolCursorType } from "@/src/lib/utils/cursorUtils";
import { updateCursorClasses } from "@/src/lib/utils/domUtils";
import SelectionControls from "./new-cad/SelectionControls";
import useCADSelection from "@/src/hooks/useCadSelection";
import { useSelectionStore } from "src/store/selectorStore";
import ElementsListPanel from "./new-cad/ElementsListPanel";
import ComponentCreationModal from "./new-cad/ComponentCreationModal";
import ElementInfo from "./new-cad/ElementInfo";
import { debounce } from "lodash";
import BoxSelection from "./new-cad/BoxSelection";
import { useCADShortcuts } from "src/hooks/useCADShortcuts";
import { useTransformControls } from "src/hooks/useTransformControls";
import router from "next/router";
import toast from "react-hot-toast";
import SmartRenderer from "@/src/lib/canvas/SmartRenderer";
import CanvasPool from "@/src/lib/canvas/CanvasPool";
import { useConstraints } from "@/src/contexts/ConstraintContext";
import { useCADUpscaler } from "@/src/hooks/canvas/useCADUpscaler";
import UpscalerControls from "./UpscalerControls";
import {
  optimizeMesh,
  performCSGOperation,
  calculateSnapPoints,
  detectFeatures,
  initWasmOptimizer
} from "../../lib/wasm/enhanced/wasmOptimizer";
import { useWasmOptimizer } from "@/src/hooks/useWasmOptimizer";
import { CADEventSystem } from "@/src/lib/cad/events";
import { createThreeObject } from "@/src/lib/cad/factories/createThreeObject";
import TransformGizmo from "../TransformGizmo";
import TransformControlPanel from "../TransformControlPanel";
import SimulationManager from "../simulation/SimulationManager";
import SimulationToolbar from "../simulation/SimulationToolbar";
import { useSimulation, useSimulationEffects } from "../../hooks/useSimulation";
import { CogIcon } from "lucide-react";

interface CADCanvasProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: { x: number; y: number; z: number }) => void;
  allowDragDrop?: boolean; // Nuova prop per abilitare il drag & drop
  onElementsChange?: (elements: any[]) => void; // New prop to notify when elements change
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
  width = "100%",
  height = "100%",
  previewComponent = null,
  onComponentPlaced,
  allowDragDrop = true,
  onElementsChange
}) => {
  // WASM Integration for performance optimization
  const wasmOptimizer = useWasmOptimizer();
  const [wasmWorkerManager] = useState(() => getWasmWorkerManager());
  const [isWasmEnabled, setIsWasmEnabled] = useState(false);
  const [wasmPerformanceStats, setWasmPerformanceStats] = useState({
    meshOptimizations: 0,
    csgOperations: 0,
    frustumCulls: 0,
    snapCalculations: 0,
    totalTimeMS: 0
  });
  const [showPerformanceSettings, setShowPerformanceSettings] = useState(false);

  // Performance optimization settings
  const [performanceSettings, setPerformanceSettings] = useState({
    enableWasmCSG: true,
    enableWasmMeshOptimization: true,
    enableWasmFrustumCulling: true,
    enableWasmSnapCalculation: true,
    meshReductionFactor: 0.1,
    lodThreshold: 100,
    maxVisibleObjects: 1000
  });
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
  // WASM functions are now imported directly
  const { elements, selectedElement, setMousePosition, updateElement, addElement, selectElement } = useElementsStore();
  const { layers } = useLayerStore();
  const selectedObjectsRef = useRef<THREE.Object3D[]>([]);
  // New state to track component preview and its positioning
  const [isPlacingComponent, setIsPlacingComponent] = useState<boolean>(false);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const previewRef = useRef<THREE.Object3D | null>(null);
  const [cadEventSystem, setCadEventSystem] = useState<CADEventSystem | null>(null);
  const [unifiedEventsEnabled, setUnifiedEventsEnabled] = useState(true);
  // Stato per WASM
  const [isWasmReady, setIsWasmReady] = useState(false);

  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [hoveredControlPoint, setHoveredControlPoint] = useState<{ elementId: string; pointIndex: number } | null>(
    null
  );
  const [activeDragPoint, setActiveDragPoint] = useState<{ elementId: string; pointIndex: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  // References for advanced transformation controls
  const transformControlsRef = useRef<TransformControls | null>(null);
  const [activeRightPanel, setActiveRightPanel] = useState<"proprieties" | "trasform" | "constraints">("proprieties");
  // Nuovi stati per ottimizzazioni e migliori UX
  const [transformMode, setTransformMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [isDraggingComponent, setIsDraggingComponent] = useState(false);
  const [draggedComponent, setDraggedComponent] = useState<any>(null);
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [showPerformanceStats, setShowPerformanceStats] = useState(false);
  const [dropScreenPosition, setDropScreenPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Riferimenti per operazioni booleane
  const booleanOperationsObjectsRef = useRef<THREE.Object3D[]>([]);
  const selection = useCADSelection(sceneRef, cameraRef, canvasRef);
  const [showElementsList, setShowElementsList] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [showElementInfo, setShowElementInfo] = useState(false);
  const [isModifying, setIsModifying] = useState<boolean>(false);
  const [eventMetricsCleanup, setEventMetricsCleanup] = useState<(() => void) | null>(null);
  // Usa i selector dallo store
  const {
    selectedElementIds,
    isBoxSelecting,
    startBoxSelection,
    updateBoxSelection,
    endBoxSelection,

    clearSelection
  } = useSelectionStore();

  // Add a ref for the animation frame ID
  const animationFrameIdRef = useRef<number | null>(null);

  // Per la box selection
  const [isSelectionMode, setSelectionMode] = useState(false);
  const [isMultiSelectMode, setMultiSelectMode] = useState(false);
  const handleSelectionModeChange = useCallback((active: boolean) => {
    setSelectionMode(active);
    if (active) {
      // Quando si attiva la modalità selezione, imposta il tool su "select"
      useCADStore.getState().setActiveTool("select");
    }
  }, []);

  const toggleMultiSelectMode = useCallback(() => {
    setMultiSelectMode(prev => !prev);
  }, []);

  // Simulation integration
  const simulation = useSimulation();
  const simulationEffects = useSimulationEffects();
  // Attiva gli shortcut
  useCADShortcuts();

  // Transform controls hook
  const transformControls = useTransformControls();
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [transformPanelCollapsed, setTransformPanelCollapsed] = useState(false);

  const { getConstraintsForEntity } = useConstraints();

  // Effect to notify parent of element changes
  useEffect(() => {
    const elements = useElementsStore.getState().elements;
    onElementsChange?.(elements);
  }, [useElementsStore.getState().elements, onElementsChange]);

  // Find the existing object selection handler in your code
  // For example, modify the existing selection handler:

  const handleObjectSelection = (object: THREE.Object3D, multiSelect: boolean = false) => {
    // Your existing object selection code

    // After selecting an object, check if it has constraints
    if (object.userData?.elementId) {
      const elementId = object.userData.elementId;
      const constraints = getConstraintsForEntity(elementId);

      // Optionally highlight or visualize constrained objects
      if (constraints.length > 0) {
        console.log(`Selected object has ${constraints.length} constraints`);
        // You might want to highlight related objects or show constraint indicators
      }
    }
  };

  useEffect(() => {
    const connectSelectionToConstraints = () => {
      // Every time selectedElementIds changes, we could potentially
      // update the constraint system or UI to highlight constraints
      if (selectedElementIds.length > 0) {
        // Example: if you want to auto-select these elements for constraints
        // when in parametric mode
        if (activeRightPanel === "constraints") {
          // You could trigger some action or update state here
          console.log("Connecting elements to parametric system:", selectedElementIds);
        }
      }
    };

    connectSelectionToConstraints();
  }, [selectedElementIds, activeRightPanel]);

  const worldToScreen = useCallback(
    (position: { x: number; y: number; z: number }) => {
      if (!canvasRef.current || !cameraRef.current) return null;

      const vector = new THREE.Vector3(position.x, position.y, position.z);
      vector.project(cameraRef.current);

      const rect = canvasRef.current.getBoundingClientRect();
      const x = ((vector.x + 1) / 2) * rect.width;
      const y = ((-vector.y + 1) / 2) * rect.height;

      return { x, y };
    },
    [canvasRef, cameraRef]
  );

  // Aggiungi funzione per convertire coordinate schermo a mondo
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
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
    },
    [canvasRef, cameraRef]
  );

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
  const [eventSystemMetrics, setEventSystemMetrics] = useState({
    totalEvents: 0,
    eventsPerSecond: 0,
    averageProcessingTime: 0
  });
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const selectionData = selection.createSelectionData();
  const selectionBounds = selection.getSelectionBounds();
  // Utilizzo dei nuovi hooks
  const { optimizeScene, sceneStatistics } = useThreePerformance(sceneRef);
  const { applyLOD } = useLOD(sceneRef, cameraRef);

  // Upscaler integration
  const upscaler = useCADUpscaler({
    renderer: rendererRef.current,
    scene: sceneRef.current,
    camera: cameraRef.current,
    enabled: true,
    options: {
      scaleFactor: 1.5,
      useEdgeDetection: true,
      enableFSR: true,
      adaptiveQuality: true
    }
  });

  useCADKeyboardShortcuts({
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
    onTransform: (mode: "translate" | "rotate" | "scale") => {
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
    onViewModeToggle: (mode: "3d" | "2d") => {
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
    const direction = cameraRef.current.position
      .clone()
      .sub(new THREE.Vector3(0, 0, 0))
      .normalize();

    cameraRef.current.position.copy(center.clone().add(direction.multiplyScalar(cameraDistance * 1.25)));

    cameraRef.current.lookAt(center);

    // Update controls
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [selectedElement]);

  const handleMouseMoveForPreview = useCallback(
    (event: React.MouseEvent) => {
      if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !isPlacingComponent || !previewObject)
        return;

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
    },
    [isPlacingComponent, previewObject, snapSettings.enabled, setMousePosition, snapToPoint]
  );

  const handleClickForPlacement = useCallback(
    (event: React.MouseEvent) => {
      if (!isPlacingComponent || !previewComponent || !previewRef.current) return;

      // Actually position the component
      const position = { ...previewPosition };

      // Create a CAD element based on the component
      const newElement = {
        id: `component-${Date.now()}`,
        type: "component",
        x: position.x,
        y: position.y,
        z: position.z,
        componentId: previewComponent,
        layerId: layers[0]?.id || "default" // Usa il primo layer disponibile
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
    },
    [isPlacingComponent, previewComponent, previewPosition, layers, addElement, onComponentPlaced]
  );

  useEffect(() => {
    if (!sceneRef.current || !previewComponent) {
      // Remove preview if no component is selected
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

    // Find the default component if it's a string
    const component =
      typeof previewComponent === "string"
        ? predefinedComponents.find(c => c.data === previewComponent || c.name === previewComponent)
        : previewComponent;

    if (!component) return;

    // Create a Three.js object based on the component
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
      case "line":
        // Create control points for line endpoints
        const point1 = new THREE.Mesh(pointGeometry, pointMaterial);
        point1.position.set(element.x1, element.y1, element.z1 || 0);
        point1.userData.isControlPoint = true;
        point1.userData.elementId = element.id;
        point1.userData.pointIndex = 0; // First endpoint
        point1.userData.controlFor = "line";

        const point2 = new THREE.Mesh(pointGeometry, pointMaterial);
        point2.position.set(element.x2, element.y2, element.z2 || 0);
        point2.userData.isControlPoint = true;
        point2.userData.elementId = element.id;
        point2.userData.pointIndex = 1; // Second endpoint
        point2.userData.controlFor = "line";

        controlPoints.push(point1, point2);
        break;

      case "rectangle":
        // Create control points for rectangle corners and midpoints
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const rotationRad = ((element.angle || 0) * Math.PI) / 180;

        // Helper function to calculate rotated position
        const getRotatedPos = (x: number, y: number) => {
          const cos = Math.cos(rotationRad);
          const sin = Math.sin(rotationRad);
          const xRot = x * cos - y * sin + element.x;
          const yRot = x * sin + y * cos + element.y;
          return { x: xRot, y: yRot };
        };

        // Corner points
        const corners = [
          getRotatedPos(-halfWidth, -halfHeight), // Top-left
          getRotatedPos(halfWidth, -halfHeight), // Top-right
          getRotatedPos(halfWidth, halfHeight), // Bottom-right
          getRotatedPos(-halfWidth, halfHeight) // Bottom-left
        ];

        corners.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx;
          point.userData.controlFor = "rectangle";
          point.userData.isCorner = true;
          controlPoints.push(point);
        });

        // Midpoints
        const midpoints = [
          getRotatedPos(0, -halfHeight), // Top
          getRotatedPos(halfWidth, 0), // Right
          getRotatedPos(0, halfHeight), // Bottom
          getRotatedPos(-halfWidth, 0) // Left
        ];

        midpoints.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx + 4; // Offset after corners
          point.userData.controlFor = "rectangle";
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
        rotationPoint.userData.controlFor = "rectangle";
        rotationPoint.userData.isRotationHandle = true;
        controlPoints.push(rotationPoint);
        break;

      case "circle":
        // Create control points for circle - center and radius points
        const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        centerPoint.position.set(element.x, element.y, element.z || 0);
        centerPoint.userData.isControlPoint = true;
        centerPoint.userData.elementId = element.id;
        centerPoint.userData.pointIndex = 0;
        centerPoint.userData.controlFor = "circle";
        centerPoint.userData.isCenter = true;

        // Points at cardinal directions for radius control
        const radiusPoints = [];
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + element.radius * Math.cos(angle),
            element.y + element.radius * Math.sin(angle),
            element.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = i + 1;
          radiusPoint.userData.controlFor = "circle";
          radiusPoint.userData.isRadiusControl = true;
          radiusPoints.push(radiusPoint);
        }

        controlPoints.push(centerPoint, ...radiusPoints);
        break;

      case "cube":
        // Create control points for cube - center and size controls
        const cubeCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cubeCenter.position.set(element.x, element.y, element.z || 0);
        cubeCenter.userData.isControlPoint = true;
        cubeCenter.userData.elementId = element.id;
        cubeCenter.userData.pointIndex = 0;
        cubeCenter.userData.controlFor = "cube";
        cubeCenter.userData.isCenter = true;

        // Eight corners of the cube
        const corners3D = [];
        for (let i = 0; i < 8; i++) {
          const xSign = i & 1 ? 1 : -1;
          const ySign = i & 2 ? 1 : -1;
          const zSign = i & 4 ? 1 : -1;

          const cornerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          cornerPoint.position.set(
            element.x + (xSign * element.width) / 2,
            element.y + (ySign * element.height) / 2,
            element.z + (zSign * element.depth) / 2
          );
          cornerPoint.userData.isControlPoint = true;
          cornerPoint.userData.elementId = element.id;
          cornerPoint.userData.pointIndex = i + 1;
          cornerPoint.userData.controlFor = "cube";
          cornerPoint.userData.isCorner = true;
          corners3D.push(cornerPoint);
        }

        controlPoints.push(cubeCenter, ...corners3D);
        break;

      case "sphere":
        // Create control points for sphere - center and radius controls
        const sphereCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        sphereCenter.position.set(element.x, element.y, element.z || 0);
        sphereCenter.userData.isControlPoint = true;
        sphereCenter.userData.elementId = element.id;
        sphereCenter.userData.pointIndex = 0;
        sphereCenter.userData.controlFor = "sphere";
        sphereCenter.userData.isCenter = true;

        // Six direction controls for radius
        const directions = [
          [1, 0, 0],
          [-1, 0, 0], // X axis
          [0, 1, 0],
          [0, -1, 0], // Y axis
          [0, 0, 1],
          [0, 0, -1] // Z axis
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
          radiusPoint.userData.controlFor = "sphere";
          radiusPoint.userData.isRadiusControl = true;
          radiusPoint.userData.direction = dir;
          return radiusPoint;
        });

        controlPoints.push(sphereCenter, ...radiusControls);
        break;

      case "cylinder":
        // Create control points for cylinder
        const cylinderCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderCenter.position.set(element.x, element.y, element.z || 0);
        cylinderCenter.userData.isControlPoint = true;
        cylinderCenter.userData.elementId = element.id;
        cylinderCenter.userData.pointIndex = 0;
        cylinderCenter.userData.controlFor = "cylinder";

        // Radius control point
        const cylinderRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        cylinderRadiusPoint.userData.isControlPoint = true;
        cylinderRadiusPoint.userData.elementId = element.id;
        cylinderRadiusPoint.userData.pointIndex = 1;
        cylinderRadiusPoint.userData.controlFor = "cylinder";

        // Height control points
        const topPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        topPoint.position.set(element.x, element.y, element.z + element.height / 2);
        topPoint.userData.isControlPoint = true;
        topPoint.userData.elementId = element.id;
        topPoint.userData.pointIndex = 2;
        topPoint.userData.controlFor = "cylinder";

        const bottomPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        bottomPoint.position.set(element.x, element.y, element.z - element.height / 2);
        bottomPoint.userData.isControlPoint = true;
        bottomPoint.userData.elementId = element.id;
        bottomPoint.userData.pointIndex = 3;
        bottomPoint.userData.controlFor = "cylinder";

        controlPoints.push(cylinderCenter, cylinderRadiusPoint, topPoint, bottomPoint);
        break;

      case "cone":
        // Create control points for cone
        const coneBaseCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        coneBaseCenter.position.set(element.x, element.y, element.z || 0);
        coneBaseCenter.userData.isControlPoint = true;
        coneBaseCenter.userData.elementId = element.id;
        coneBaseCenter.userData.pointIndex = 0;
        coneBaseCenter.userData.controlFor = "cone";

        // Base radius control point
        const coneRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        coneRadiusPoint.userData.isControlPoint = true;
        coneRadiusPoint.userData.elementId = element.id;
        coneRadiusPoint.userData.pointIndex = 1;
        coneRadiusPoint.userData.controlFor = "cone";

        // Tip (height) control point
        const coneTipPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneTipPoint.position.set(element.x, element.y, element.z + element.height);
        coneTipPoint.userData.isControlPoint = true;
        coneTipPoint.userData.elementId = element.id;
        coneTipPoint.userData.pointIndex = 2;
        coneTipPoint.userData.controlFor = "cone";

        controlPoints.push(coneBaseCenter, coneRadiusPoint, coneTipPoint);
        break;

      case "torus":
        // Create control points for torus
        const torusCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        torusCenter.position.set(element.x, element.y, element.z || 0);
        torusCenter.userData.isControlPoint = true;
        torusCenter.userData.elementId = element.id;
        torusCenter.userData.pointIndex = 0;
        torusCenter.userData.controlFor = "torus";

        // Main radius control point
        const mainRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        mainRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        mainRadiusPoint.userData.isControlPoint = true;
        mainRadiusPoint.userData.elementId = element.id;
        mainRadiusPoint.userData.pointIndex = 1;
        mainRadiusPoint.userData.controlFor = "torus";

        // Tube radius control point
        const tubeRadius = element.tube || element.radius / 4;
        const tubeRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        tubeRadiusPoint.position.set(element.x + element.radius + tubeRadius, element.y, element.z || 0);
        tubeRadiusPoint.userData.isControlPoint = true;
        tubeRadiusPoint.userData.elementId = element.id;
        tubeRadiusPoint.userData.pointIndex = 2;
        tubeRadiusPoint.userData.controlFor = "torus";

        controlPoints.push(torusCenter, mainRadiusPoint, tubeRadiusPoint);
        break;

      case "polygon":
        // Create control points for polygon
        const polygonCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        polygonCenter.position.set(element.x, element.y, element.z || 0);
        polygonCenter.userData.isControlPoint = true;
        polygonCenter.userData.elementId = element.id;
        polygonCenter.userData.pointIndex = 0;
        polygonCenter.userData.controlFor = "polygon";

        const polygonShape = new THREE.Shape();

        if (element.points && element.points.length > 0) {
          // Create polygon from points
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
        // This is called even if neither 'if' nor 'else if' ran
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

        controlPoints.push(polygonCenter, polygon);
        break;

      case "extrusion":
        // Create control points for extrusion
        const extrusionCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        extrusionCenter.position.set(element.x, element.y, element.z || 0);
        extrusionCenter.userData.isControlPoint = true;
        extrusionCenter.userData.elementId = element.id;
        extrusionCenter.userData.pointIndex = 0;
        extrusionCenter.userData.controlFor = "extrusion";

        const extrusionPoints = [extrusionCenter];

        // Shape size control point
        const shapeControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        let controlX = element.x;
        let controlY = element.y;

        if (element.shape === "rect" && element.width && element.height) {
          controlX = element.x + element.width / 2;
          controlY = element.y + element.height / 2;
        } else if (element.shape === "circle" && element.radius) {
          controlX = element.x + element.radius;
        }

        shapeControlPoint.position.set(controlX, controlY, element.z || 0);
        shapeControlPoint.userData.isControlPoint = true;
        shapeControlPoint.userData.elementId = element.id;
        shapeControlPoint.userData.pointIndex = 1;
        shapeControlPoint.userData.controlFor = "extrusion";
        extrusionPoints.push(shapeControlPoint);

        // Depth control point
        const depthControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        depthControlPoint.position.set(element.x, element.y, (element.z || 0) + element.depth);
        depthControlPoint.userData.isControlPoint = true;
        depthControlPoint.userData.elementId = element.id;
        depthControlPoint.userData.pointIndex = 2;
        depthControlPoint.userData.controlFor = "extrusion";
        extrusionPoints.push(depthControlPoint);

        // Points for custom shapes
        if (element.points && element.points.length >= 3) {
          element.points.forEach((point: any, idx: number) => {
            const shapePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            shapePoint.position.set(element.x + (point.x || 0), element.y + (point.y || 0), element.z || 0);
            shapePoint.userData.isControlPoint = true;
            shapePoint.userData.elementId = element.id;
            shapePoint.userData.pointIndex = idx + 3; // Offset for center, shape, and depth
            shapePoint.userData.controlFor = "extrusion";
            extrusionPoints.push(shapePoint);
          });
        }

        controlPoints.push(...extrusionPoints);
        break;

      case "tube":
        // Create control points for tube
        const tubePoints = [];

        // Path points
        if (element.path && element.path.length >= 2) {
          element.path.forEach((point: any, idx: number) => {
            const pathPoint = new THREE.Mesh(pointGeometry, pointMaterial);
            pathPoint.position.set(point.x || 0, point.y || 0, point.z || 0);
            pathPoint.userData.isControlPoint = true;
            pathPoint.userData.elementId = element.id;
            pathPoint.userData.pointIndex = idx;
            pathPoint.userData.controlFor = "tube";
            tubePoints.push(pathPoint);
          });

          // Radius control point - place it near the first path point
          const firstPoint = element.path[0];
          const secondPoint = element.path[1];

          // Calculate a direction perpendicular to the tube
          const dx = secondPoint.x - firstPoint.x;
          const dy = secondPoint.y - firstPoint.y;
          const length = Math.sqrt(dx * dx + dy * dy);

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
          radiusPoint.userData.controlFor = "tube";
          tubePoints.push(radiusPoint);
        }

        controlPoints.push(...tubePoints);
        break;

      case "lathe":
        // Create control points for lathe
        const latheCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        latheCenter.position.set(element.x, element.y, element.z || 0);
        latheCenter.userData.isControlPoint = true;
        latheCenter.userData.elementId = element.id;
        latheCenter.userData.pointIndex = 0;
        latheCenter.userData.controlFor = "lathe";

        const lathePoints = [latheCenter];

        // Profile points
        if (element.points && element.points.length >= 2) {
          element.points.forEach((point: any, idx: number) => {
            const profilePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            profilePoint.position.set(element.x + (point.x || 0), element.y + (point.y || 0), element.z || 0);
            profilePoint.userData.isControlPoint = true;
            profilePoint.userData.elementId = element.id;
            profilePoint.userData.pointIndex = idx + 1; // Offset for center
            profilePoint.userData.controlFor = "lathe";
            lathePoints.push(profilePoint);
          });
        }

        controlPoints.push(...lathePoints);
        break;

      default:
        if ("x" in element && "y" in element) {
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
    useCADStore;
    return controlPoints;
  };

  // Handle transforms when control points are dragged
  const handleControlPointDrag = useCallback(
    (elementId: string, pointIndex: number, newX: number, newY: number, newZ: number = 0) => {
      const element = elements.find(el => el.id === elementId);
      if (!element) return;

      let updates: any = {};

      switch (element.type) {
        case "line":
          if (pointIndex === 0) {
            // First endpoint
            updates = { x1: newX, y1: newY, z1: newZ };
          } else if (pointIndex === 1) {
            // Second endpoint
            updates = { x2: newX, y2: newY, z2: newZ };
          }
          break;

        case "rectangle":
          // Handle rectangle control points differently based on the point type
          if (pointIndex < 4) {
            // It's a corner - we need to recalculate dimensions
            const originalCenter = { x: element.x, y: element.y };
            const angle = ((element.angle || 0) * Math.PI) / 180;

            // Rotate the new position back to get aligned coordinates
            const cosAngle = Math.cos(-angle);
            const sinAngle = Math.sin(-angle);
            const alignedX = (newX - originalCenter.x) * cosAngle - (newY - originalCenter.y) * sinAngle;
            const alignedY = (newX - originalCenter.x) * sinAngle + (newY - originalCenter.y) * cosAngle;

            // Which corner is it?
            const isLeft = pointIndex === 0 || pointIndex === 3;
            const isTop = pointIndex === 0 || pointIndex === 1;

            // Get the opposite corner
            const oppCornerIdx = pointIndex < 2 ? pointIndex + 2 : pointIndex - 2;
            const oppCornerPoint = controlPointsRef.current.find(
              pt => pt.userData.elementId === elementId && pt.userData.pointIndex === oppCornerIdx
            );

            if (!oppCornerPoint) return;

            // Rotate the opposite corner position back too
            const oppX =
              (oppCornerPoint.position.x - originalCenter.x) * cosAngle -
              (oppCornerPoint.position.y - originalCenter.y) * sinAngle;
            const oppY =
              (oppCornerPoint.position.x - originalCenter.x) * sinAngle +
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
            const angle = ((element.angle || 0) * Math.PI) / 180;
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
            const newAngle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90;
            updates = { angle: newAngle };
          }
          break;

        case "circle":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          }
          break;

        case "cube":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Corner point - need to recalculate dimensions
            const i = pointIndex - 1;
            const xSign = i & 1 ? 1 : -1;
            const ySign = i & 2 ? 1 : -1;
            const zSign = i & 4 ? 1 : -1;

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

        case "sphere":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const dz = newZ - element.z;
            const newRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);
            updates = { radius: newRadius };
          }
          break;

        case "cylinder":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2 || pointIndex === 3) {
            // Height control points
            const dz = Math.abs(newZ - element.z);
            updates = { height: dz * 2 };
          }
          break;

        case "cone":
          if (pointIndex === 0) {
            // Center point (base center)
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Base radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2) {
            // Height control point (tip of cone)
            const dz = Math.abs(newZ - element.z);
            updates = { height: dz };
          }
          break;

        case "torus":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Main radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2) {
            // Tube radius control point
            const tubeRadius = element.tube || element.radius / 4;
            const mainRadius = element.radius;

            // Calculate new tube radius based on drag distance from torus ring
            const dx = newX - element.x;
            const dy = newY - element.y;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            const newTubeRadius = Math.abs(distanceFromCenter - mainRadius);

            updates = { tube: newTubeRadius };
          }
          break;

        case "polygon":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
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

        case "extrusion":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Width/height control point
            const dx = newX - element.x;
            const dy = newY - element.y;

            // For rectangular extrusions
            if (element.shape === "rect") {
              const distance = Math.sqrt(dx * dx + dy * dy);
              updates = { width: distance * 2, height: distance * 1.5 };
            }
            // For circular extrusions
            else if (element.shape === "circle") {
              const newRadius = Math.sqrt(dx * dx + dy * dy);
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

        case "tube":
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
                Math.pow(point.x - newX, 2) + Math.pow(point.y - newY, 2) + Math.pow((point.z || 0) - newZ, 2)
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
            const newRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);

            updates = { radius: newRadius };
          }
          break;

        case "lathe":
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

        case "component":
          // For components, just update the position
          updates = {
            x: newX,
            y: newY,
            z: newZ
          };
          break;

        case "group":
          // Group elements should be moved together
          updates = {
            x: newX,
            y: newY,
            z: newZ
          };
          break;

        default:
          if ("x" in element && "y" in element) {
            // For center-based elements
            updates = { x: newX, y: newY, z: newZ };
          }
          break;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        updateElement(elementId, updates);
      }
    },
    [elements, updateElement]
  );

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize WASM optimizer
    const initWasm = async () => {
      try {
        await initWasmOptimizer();
        console.log("✅ WASM optimizer initialized in CADCanvas");
      } catch (error) {
        console.error("❌ Failed to initialize WASM:", error);
      }
    };
    initWasm();

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#2A2A2A");
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.01, // Near plane molto più vicino per zoom estremo (era 0.1)
      5000 // Far plane molto più lontano per vista distante (era 1000)
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
    controls.minDistance = 0.01; // Zoom ravvicinato molto più vicino (era 5)
    controls.maxDistance = 5000; // Zoom molto più lontano (era 100)
    // Aggiungi la velocità di zoom per un controllo più preciso
    controls.zoomSpeed = 1.5;
    // Enable mouse wheel sensitive panel for more intuitive zoom
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
    const gridHelper = new THREE.GridHelper(500, 500); // Griglia molto più ampia (era 100x100)
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
      xAxisGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-size * 2, 0, 0, size * 2, 0, 0], 3));
      const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);

      const yAxisGeometry = new THREE.BufferGeometry();
      yAxisGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, -size * 2, 0, 0, size * 2, 0], 3));
      const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);

      const zAxisGeometry = new THREE.BufferGeometry();
      zAxisGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -size * 2, 0, 0, size * 2], 3));
      const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);

      // Add labels for axes
      const addAxisLabel = (text: string, position: [number, number, number], color: THREE.Color) => {
        const canvasWidth = 64;
        const canvasHeight = 64;
        // Use pooled canvas
        const canvas = getTemporaryCanvas(`axisLabel-${text}`, canvasWidth, canvasHeight);
        const context = canvas.getContext("2d");

        if (context) {
          // Clear canvas before drawing
          context.clearRect(0, 0, canvasWidth, canvasHeight);
          context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
          context.font = "Bold 48px Arial";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(text, 32, 32);

          // Use pooled texture
          const texture = getTextureFromPool(`axisLabelTexture-${text}`, canvasWidth, canvasHeight);
          texture.image = canvas; // Assign the drawn canvas to the texture
          texture.needsUpdate = true; // Mark texture for update

          const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.position.set(...position);
          sprite.scale.set(2, 2, 2);

          // Release canvas back to pool (optional, pool manages reuse)
          // CanvasPool.releaseCanvas(canvas);

          return sprite;
        }
        // Release canvas if context failed or sprite wasn't created
        const canvasKey = `temp-axisLabel-${text}`;
        CanvasPool.releaseCanvas(canvasKey);
        return null;
      };

      // Create a group to contain all axis elements
      const axesGroup = new THREE.Group();
      axesGroup.add(xAxis);
      axesGroup.add(yAxis);
      axesGroup.add(zAxis);

      // Add labels
      const xLabel = addAxisLabel("X", [size + 1, 0, 0], new THREE.Color(0, 0, 1));
      const yLabel = addAxisLabel("Y", [0, size + 1, 0], new THREE.Color(1, 0, 1));
      const zLabel = addAxisLabel("Z", [0, 0, size + 1], new THREE.Color(0, 1, 0.5));

      if (xLabel) axesGroup.add(xLabel);
      if (yLabel) axesGroup.add(yLabel);
      if (zLabel) axesGroup.add(zLabel);

      return axesGroup;
    };

    // Create and add custom axes to the scene
    const customAxes = createCustomAxes(30); // Assi più lunghi (era 10)
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
        SmartRenderer.smartRender(sceneRef.current, cameraRef.current, rendererRef.current, {
          cullDistance: 1000,
          updateThreshold: 16,
          forceUpdate: isModifying // true durante trasformazioni attive
        });
      }

      animationFrameIdRef.current = requestAnimationFrame(animateScene);
    };

    // Start the animation loop
    animateScene();

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

    window.addEventListener("resize", handleResize);

    // Add fullscreen change event listeners
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    // Cleanup function
    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);

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
    sceneRef.current.traverse(child => {
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
    const gridHelper = sceneRef.current.children.find(child => child instanceof THREE.GridHelper) as
      | THREE.GridHelper
      | undefined;

    if (gridHelper) {
      gridHelper.visible = gridVisible;
    }

    // Update custom axes visibility
    const customAxes = sceneRef.current.children.find(child => child.userData.isCustomAxes);

    if (customAxes) {
      customAxes.visible = axisVisible;
    }
  }, [gridVisible, axisVisible]);

  // Update camera and controls when view mode changes
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    switch (viewMode) {
      case "2d":
        // Set dark background for 2D mode
        if (sceneRef.current) {
          sceneRef.current.background = new THREE.Color("#2A2A2A");
        }

        // Position camera to look at XY plane (from Z axis)
        cameraRef.current.position.set(0, 0, 50);
        cameraRef.current.up.set(0, 1, 0); // Set Y as the up direction
        cameraRef.current.lookAt(0, 0, 0);

        // Update grid for XY plane view
        const gridHelper = sceneRef?.current?.children.find(child => child instanceof THREE.GridHelper) as
          | THREE.GridHelper
          | undefined;

        if (gridHelper) {
          gridHelper.material.opacity = 0.2;
          gridHelper.material.transparent = true;
          // Align grid with XY plane (flat on the ground)
          gridHelper.rotation.x = Math.PI / 2;
        }

        // Disable rotation in 2D mode
        controlsRef.current.enableRotate = false;
        controlsRef.current.enablePan = true;

        // Show only X and Y axes in 2D mode
        const customAxes = sceneRef?.current?.children.find(child => child.userData.isCustomAxes);

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
      case "3d":
        // Position camera for 3D view
        cameraRef.current.position.set(5, 5, 5);
        cameraRef.current.lookAt(0, 0, 0);
        controlsRef.current.enableRotate = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.minDistance = 0.01; // Ridotto per permettere uno zoom ravvicinato
        controlsRef.current.maxDistance = 5000; // Aumentato per permettere una visione d'insieme più ampia
        break;
      default:
        break;
    }
  }, [viewMode, axisVisible]);

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
    const component =
      typeof previewComponent === "string"
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


  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapMode, setSnapMode] = useState<"point" | "line" | "face" | "grid" | "center">("point");

  // ... resto del codice esistente

  // Funzione per aggiungere comando allo storico
  const addCommandToHistory = useCallback(
    (command: CommandHistory) => {
      // Rimuovi comandi che sono stati sovrascritti (in caso di undo seguito da nuova azione)
      const newHistory = commandHistory.slice(0, historyIndex + 1);
      setCommandHistory([...newHistory, command]);
      setHistoryIndex(newHistory.length);
    },
    [commandHistory, historyIndex]
  );

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

  // Advanced snap system

  // Operazioni booleane WASM-ottimizzate
  const performBooleanOperation = useCallback(
    async (operation: "union" | "subtract" | "intersect") => {
      if (booleanOperationsObjectsRef.current.length < 2) {
        console.warn("Need at least two objects for boolean operation");
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

      try {
        // Usa WASM per operazioni CSG se disponibile e abilitato
        if (performanceSettings.enableWasmCSG) {
          console.log(`🚀 Using WASM-optimized ${operation} operation`);

          if (operation === "union") {
            // Unione WASM-ottimizzata
            result = await objects.reduce(async (accPromise: Promise<THREE.Mesh | null>, obj) => {
              const acc = await accPromise;
              if (!acc) return obj;
              const meshDataA = {
                vertices: (acc.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((acc.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };
              const meshDataB = {
                vertices: (obj.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((obj.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };

              const result = await performCSGOperation("union", meshDataA, meshDataB);

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute("position", new THREE.BufferAttribute(result.vertices, 3));
              if (result.indices.length > 0) {
                geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
              }
              if (result.normals) {
                geometry.setAttribute("normal", new THREE.BufferAttribute(result.normals, 3));
              } else {
                geometry.computeVertexNormals();
              }
              return new THREE.Mesh(geometry, acc.material);
            }, Promise.resolve(null));
          } else if (operation === "subtract") {
            // Sottrazione WASM-ottimizzata
            result = await objects.slice(1).reduce(async (accPromise, obj) => {
              const acc = await accPromise;
              const meshDataA = {
                vertices: (acc.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((acc.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };
              const meshDataB = {
                vertices: (obj.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((obj.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };

              const result = await performCSGOperation("subtract", meshDataA, meshDataB);

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute("position", new THREE.BufferAttribute(result.vertices, 3));
              if (result.indices.length > 0) {
                geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
              }
              if (result.normals) {
                geometry.setAttribute("normal", new THREE.BufferAttribute(result.normals, 3));
              } else {
                geometry.computeVertexNormals();
              }
              return new THREE.Mesh(geometry, acc.material);
            }, Promise.resolve(objects[0]));
          } else if (operation === "intersect") {
            // Intersezione WASM-ottimizzata
            result = await objects.reduce(async (accPromise: Promise<THREE.Mesh | null>, obj) => {
              const acc = await accPromise;
              if (!acc) return obj;
              const meshDataA = {
                vertices: (acc.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((acc.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };
              const meshDataB = {
                vertices: (obj.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array,
                indices: ((obj.geometry as THREE.BufferGeometry).index?.array as Uint32Array) || new Uint32Array()
              };

              const result = await performCSGOperation("intersect", meshDataA, meshDataB);

              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute("position", new THREE.BufferAttribute(result.vertices, 3));
              if (result.indices.length > 0) {
                geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
              }
              if (result.normals) {
                geometry.setAttribute("normal", new THREE.BufferAttribute(result.normals, 3));
              } else {
                geometry.computeVertexNormals();
              }
              return new THREE.Mesh(geometry, acc.material);
            }, Promise.resolve(null));
          }

          // Update performance statistics
          setWasmPerformanceStats(prev => ({
            ...prev,
            csgOperations: prev.csgOperations + 1
          }));
        } else {
          // Fallback to three-csg-ts
          console.log(`📦 Using fallback ${operation} operation`);

          if (operation === "union") {
            result = objects.reduce((acc: THREE.Mesh | null, obj) => {
              if (!acc) return obj;
              return CSG.union(acc, obj);
            }, null);
          } else if (operation === "subtract") {
            result = objects.slice(1).reduce((acc, obj) => {
              return CSG.subtract(acc, obj);
            }, objects[0]);
          } else if (operation === "intersect") {
            result = objects.reduce((acc: THREE.Mesh | null, obj) => {
              if (!acc) return obj;
              return CSG.intersect(acc, obj);
            }, null);
          }
        }
      } catch (error) {
        console.error("❌ CSG operation failed, using fallback:", error);

        // Fallback to three-csg-ts on error
        if (operation === "union") {
          result = objects.reduce((acc: THREE.Mesh | null, obj) => {
            if (!acc) return obj;
            return CSG.union(acc, obj);
          }, null);
        } else if (operation === "subtract") {
          result = objects.slice(1).reduce((acc, obj) => {
            return CSG.subtract(acc, obj);
          }, objects[0]);
        } else if (operation === "intersect") {
          result = objects.reduce((acc: THREE.Mesh | null, obj) => {
            if (!acc) return obj;
            return CSG.intersect(acc, obj);
          }, null);
        }
      }

      const finalResult = await result;
      if (finalResult && sceneRef.current) {
        // Rimuovi oggetti originali dalla scena
        for (const obj of objects) {
          sceneRef.current.remove(obj);
        }

        // Imposta posizione e materiale per il risultato
        finalResult.position.set(0, 0, 0);
        finalResult.material = objects[0].material;

        // Aggiungi il risultato alla scena
        sceneRef.current.add(finalResult);

        // Memorizza il nuovo oggetto per operazioni future
        const resultId = finalResult.id;

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
              sceneRef.current.add(finalResult!);
            }
          },
          description: `Boolean ${operation} operation`
        };

        addCommandToHistory(command);
      }
    },
    [addCommandToHistory, performanceSettings.enableWasmCSG]
  );

  // WASM Mesh Optimization Function
  const optimizeThreeObject = useCallback(
    async (object: THREE.Object3D) => {
      if (!performanceSettings.enableWasmMeshOptimization) {
        return object;
      }

      try {
        object.traverse(async child => {
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
            const vertices = child.geometry.attributes.position?.array as Float32Array;
            const indices = (child.geometry.index?.array as Uint32Array) || new Uint32Array();

            if (vertices && vertices.length > 30000) {
              // Only optimize large meshes
              console.log("🚀 Optimizing large mesh with WASM");

              const result = await optimizeMesh(vertices, indices, 0.5);

              // Create new optimized geometry
              const optimizedGeometry = new THREE.BufferGeometry();
              optimizedGeometry.setAttribute("position", new THREE.BufferAttribute(result.vertices, 3));
              if (result.indices.length > 0) {
                optimizedGeometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
              }
              if (result.normals) {
                optimizedGeometry.setAttribute("normal", new THREE.BufferAttribute(result.normals, 3));
              } else {
                optimizedGeometry.computeVertexNormals();
              }

              child.geometry.dispose(); // Clean up old geometry
              child.geometry = optimizedGeometry;

              // Update performance stats
              setWasmPerformanceStats(prev => ({
                ...prev,
                meshOptimizations: prev.meshOptimizations + 1
              }));
            }
          }
        });

        return object;
      } catch (error) {
        console.error("❌ Mesh optimization failed:", error);
        return object;
      }
    },
    [performanceSettings.enableWasmMeshOptimization]
  );

  // Enhanced snap calculation with WASM
  const calculateSnapPointsForObject = useCallback(
    async (object: THREE.Object3D): Promise<THREE.Vector3[]> => {
      if (!performanceSettings.enableWasmSnapCalculation) {
        return [];
      }

      try {
        const snapPoints: THREE.Vector3[] = [];

        object.traverse(async child => {
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
            const vertices = child.geometry.attributes.position?.array as Float32Array;
            if (vertices) {
              const wasmSnapPointsArray = await calculateSnapPoints(vertices, 0.1);
              // Convert Float32Array to Vector3 array
              for (let i = 0; i < wasmSnapPointsArray.length; i += 3) {
                snapPoints.push(
                  new THREE.Vector3(wasmSnapPointsArray[i], wasmSnapPointsArray[i + 1], wasmSnapPointsArray[i + 2])
                );
              }
            }
          }
        });

        // Update performance stats
        setWasmPerformanceStats(prev => ({
          ...prev,
          snapCalculations: prev.snapCalculations + 1
        }));

        return snapPoints;
      } catch (error) {
        console.error("❌ Snap points calculation failed:", error);
        return [];
      }
    },
    [performanceSettings.enableWasmSnapCalculation]
  );

  // Funzioni di esportazione
  const exportToSTL = useCallback(() => {
    if (!sceneRef.current) return;

    const exporter = new STLExporter();
    const result = exporter.parse(sceneRef.current);

    const blob = new Blob([result], { type: "application/octet-stream" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "model.stl";
    link.click();
  }, []);

  const exportToOBJ = useCallback(() => {
    if (!sceneRef.current) return;

    const exporter = new OBJExporter();
    const result = exporter.parse(sceneRef.current);

    const blob = new Blob([result], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "model.obj";
    link.click();
  }, []);

  const exportToStep = useCallback(() => {
    // STEP export richiede librerie più specializzate come OpenCascade.js
    console.warn("STEP export requires additional libraries");
    // Implementazione di esempio usando una libreria esterna
    if (window.cadExporter && window.cadExporter.exportSTEP) {
      window.cadExporter.exportSTEP(sceneRef.current, "model.step");
    } else {
      alert("STEP export is not available. Please install the required libraries.");
    }
  }, []);

  // ... resto del codice esistente

  // Aggiungi il supporto per scorciatoie da tastiera
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Scorciatoie per undo/redo
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        redo();
      }

      // Scorciatoie per modalità di snap
      if (e.key === "p") setSnapMode("point");
      if (e.key === "l") setSnapMode("line");
      if (e.key === "f") setSnapMode("face");
      if (e.key === "g") setSnapMode("grid");

      // Scorciatoie per operazioni booleane
      if (e.ctrlKey && e.key === "u") performBooleanOperation("union");
      if (e.ctrlKey && e.key === "s") performBooleanOperation("subtract");
      if (e.ctrlKey && e.key === "i") performBooleanOperation("intersect");

      // Scorciatoie per esportazione
      if (e.ctrlKey && e.key === "e") {
        e.preventDefault();
        const format = prompt("Export format (stl, obj, step):", "stl");
        if (format === "stl") exportToSTL();
        else if (format === "obj") exportToOBJ();
        else if (format === "step") exportToStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo, exportToSTL, exportToOBJ, exportToStep, performBooleanOperation]);

  // Handle mouse move for hover effects and control points

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      // If we're positioning a component, use preview logic
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
      const controlPointIntersects = raycasterRef.current.intersectObjects(controlPointsRef.current);

      if (controlPointIntersects.length > 0) {
        const intersectedPoint = controlPointIntersects[0].object;
        if (intersectedPoint.userData.isControlPoint) {
          setHoveredControlPoint({
            elementId: intersectedPoint.userData.elementId,
            pointIndex: intersectedPoint.userData.pointIndex
          });
          canvasRef.current.style.cursor = "pointer";
          return;
        }
      } else {
        setHoveredControlPoint({
          elementId: "null",
          pointIndex: 0
        });
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
          canvasRef.current.style.cursor = "pointer";
        }
      } else {
        setHoveredElementId(null);
        canvasRef.current.style.cursor = "default";
      }

      // Update mouse position in 3D space for status bar
      // Convert screen coordinates to 3D world coordinates
      const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const mouse3D = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0);
      mouse3D.unproject(cameraRef.current);

      const raycaster = new THREE.Raycaster(
        cameraRef.current.position,
        mouse3D.sub(cameraRef.current.position).normalize()
      );
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeZ, intersection);

      // Update store with mouse position
      setMousePosition({
        x: Math.round(intersection.x * 100) / 100,
        y: Math.round(intersection.y * 100) / 100,
        z: Math.round(intersection.z * 100) / 100
      });
    },
    [
      activeDragPoint,
      handleControlPointDrag,
      setMousePosition,
      updateControlPoints,
      isPlacingComponent,
      handleMouseMoveForPreview,
      canvasRef,
      sceneRef,
      cameraRef,
      isBoxSelecting,
      screenToWorld,
      updateBoxSelection
    ]
  );

  // Handle mouse down for element selection or control point dragging
  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
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
      const controlPointIntersects = raycasterRef.current.intersectObjects(controlPointsRef.current);

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
    },
    [
      isPlacingComponent,
      handleClickForPlacement,
      canvasRef,
      sceneRef,
      cameraRef,
      isSelectionMode,
      screenToWorld,
      startBoxSelection,
      selectElement
    ]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPlacingComponent) {
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
          onComponentPlaced(previewComponent || "", { x: 0, y: 0, z: 0 });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
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
  }, [activeDragPoint, isBoxSelecting, endBoxSelection]);

  // Update control points when selected element changes
  useEffect(() => {
    updateControlPoints();
  }, [selectedElement, updateControlPoints]);

  // Update camera and controls when view mode changes

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !sceneRef.current) return;

    switch (viewMode) {
      case "2d":
        // Set dark background for 2D mode
        sceneRef.current.background = new THREE.Color("#2A2A2A");

        // Position camera to look at XY plane (from Z axis)
        cameraRef.current.position.set(0, 0, 50);
        cameraRef.current.up.set(0, 1, 0); // Set Y as the up direction
        cameraRef.current.lookAt(0, 0, 0);

        // Update grid for XY plane view
        const gridHelper = sceneRef.current.children.find(child => child instanceof THREE.GridHelper) as
          | THREE.GridHelper
          | undefined;

        if (gridHelper) {
          gridHelper.material.opacity = 0.2;
          gridHelper.material.transparent = true;
          // Align grid with XY plane (flat on the ground)
          gridHelper.rotation.x = Math.PI / 2;
        }

        // Disable rotation in 2D mode
        controlsRef.current.enableRotate = false;
        controlsRef.current.enablePan = true;

        // Show only X and Y axes in 2D mode
        const customAxes = sceneRef.current.children.find(child => child.userData.isCustomAxes);

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

      case "3d":
        // Restore original background color for 3D mode
        sceneRef.current.background = new THREE.Color("#2A2A2A");

        // Reset camera for 3D view
        cameraRef.current.position.set(5, 5, 5);
        cameraRef.current.up.set(0, 1, 0); // Reset up vector to Y
        cameraRef.current.lookAt(0, 0, 0);

        // Enable all controls for 3D mode
        controlsRef.current.enableRotate = true;
        controlsRef.current.enablePan = true;

        // Show all axes in 3D mode
        const axes3D = sceneRef.current.children.find(child => child.userData.isCustomAxes);

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
    const gridHelper = sceneRef.current.children.find(child => child instanceof THREE.GridHelper) as
      | THREE.GridHelper
      | undefined;

    if (gridHelper) {
      gridHelper.visible = gridVisible;
      // Sposta la griglia per compensare l'offset dell'origine
      gridHelper.position.set(originOffset.x, originOffset.y, originOffset.z);
    }

    // Aggiornare posizione assi
    const customAxes = sceneRef.current.children.find(child => child.userData.isCustomAxes);

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
    const existingIndicator = sceneRef.current.children.find(child => child.userData.isOriginIndicator);

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
    const elementsToRemove = sceneRef.current.children.filter(child => child.userData.isCADElement);

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
      if (elements.length > 20 && ["cube", "sphere", "cylinder"].includes(type)) {
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
    if (typeof applyLOD === "function") {
      applyLOD();
    }

    // Ottimizza la scena (merge di geometrie, etc)
    if (typeof optimizeScene === "function") {
      optimizeScene();
    }

    // Aggiorna i punti di controllo
    if (typeof updateControlPoints === "function") {
      updateControlPoints();
    }
  }, [
    elements,
    layers,
    hoveredElementId,
    selectedElement,
    applyLOD,
    optimizeScene,
    updateControlPoints,
    createThreeObject
  ]);

  // Funzione ottimizzata per gestire il drag & drop dalla libreria
  const handleComponentDragOver = useCallback(
    (event: React.DragEvent) => {
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
          sceneRef.current.children.filter(child => child.userData?.isCADElement && child.visible),
          true
        );

        let targetPosition: { x: number; y: number; z: number };

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
    },
    [allowDragDrop, snapSettings.enabled, originOffset.x, originOffset.y, originOffset.z, worldToScreen, snapToPoint]
  );

  const handleComponentDrop = useCallback(
    (event: React.DragEvent) => {
      if (!allowDragDrop) return;

      event.preventDefault();
      const componentId = event.dataTransfer.getData("component/id");

      if (!componentId) return;

      // Retrieve component from library
      const component = predefinedComponents.find(c => c.data === componentId || c.name === componentId);

      if (!component) return;

      // Create a new CAD element based on the component
      const newElement = transformLibraryItemToCADElement(component, dropPosition);

      // Aggiungi l'elemento al canvas
      addElement(newElement);

      // Resetta gli stati del drag & drop
      setIsDraggingComponent(false);
      setDraggedComponent(null);
    },
    [allowDragDrop, dropPosition, addElement]
  );

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
      if (elements.length > 20 && ["cube", "sphere", "cylinder"].includes(type)) {
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
    if (typeof applyLOD === "function") {
      applyLOD();
    }

    // Ottimizza la scena (merge di geometrie, etc)
    if (typeof optimizeScene === "function") {
      optimizeScene();
    }

    // Aggiorna i punti di controllo
    if (typeof updateControlPoints === "function") {
      updateControlPoints();
    }
  }, [
    elements,
    layers,
    hoveredElementId,
    selectedElement,
    applyLOD,
    optimizeScene,
    updateControlPoints,
    createThreeObject
  ]);

  // Funzione per creare mesh istanziati per elementi simili
  const createInstancedMesh = useCallback(
    (type: string, elements: any[]) => {
      if (!sceneRef.current) return;

      // Crea geometria in base al tipo
      let geometry: THREE.BufferGeometry;

      switch (type) {
        case "cube":
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
        case "sphere":
          geometry = new THREE.SphereGeometry(1, 16, 16);
          break;
        case "cylinder":
          geometry = new THREE.CylinderGeometry(1, 1, 1, 16);
          break;
        default:
          return;
      }

      // Crea materiale
      const material = new THREE.MeshStandardMaterial();

      // Crea InstancedMesh
      const instancedMesh = new THREE.InstancedMesh(geometry, material, elements.length);
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
          case "cube":
            scale = new THREE.Vector3(element.width, element.height, element.depth);
            break;
          case "sphere":
            scale = new THREE.Vector3(element.radius * 2, element.radius * 2, element.radius * 2);
            break;
          case "cylinder":
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
    },
    [originOffset]
  );

  // Funzione per evidenziare elementi
  const highlightElement = useCallback(
    (threeObject: THREE.Object3D, element: any) => {
      // Hover Highlight
      if (element.id === hoveredElementId) {
        if (threeObject instanceof THREE.Line) {
          const material = threeObject.material as THREE.LineBasicMaterial;
          material.color.setHex(0x4a90e2);
          material.linewidth = (element.linewidth || 1) + 1;
        } else if (threeObject instanceof THREE.Mesh) {
          const material = threeObject.material as THREE.Material;
          if (material instanceof THREE.MeshStandardMaterial && !material.wireframe) {
            material.emissive.setHex(0x4a90e2);
            material.emissiveIntensity = 0.3;
          } else if ("color" in material && material.color instanceof THREE.Color) {
            material.color.setHex(0x4a90e2);
          }
        }
      }

      // Selection Highlight
      if (selectedElement && element.id === selectedElement.id) {
        if (threeObject instanceof THREE.Line) {
          const material = threeObject.material as THREE.LineBasicMaterial;
          material.color.setHex(0xff3366);
          material.linewidth = (element.linewidth || 1) + 2;
        } else if (threeObject instanceof THREE.Mesh) {
          const material = threeObject.material as THREE.Material;
          if (material instanceof THREE.MeshStandardMaterial && !material.wireframe) {
            material.emissive?.setHex(0xff3366); // Use optional chaining for safety
            material.emissiveIntensity = 0.5;
          } else if ("color" in material && material.color instanceof THREE.Color) {
            material.color.setHex(0xff3366);
          }
        }
      }

      // Reset if not hovered or selected (This part needs careful implementation)
      // Consider storing original material properties if complex highlighting is needed
    },
    [hoveredElementId, selectedElement]
  );

  // Inizializzazione dei TransformControls
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    // Crea transform controls per manipolazione diretta
    const transformControls = new TransformControls(cameraRef.current, rendererRef.current.domElement);
    transformControls.size = 0.8; // Dimensione ridotta per non intralciare
    transformControls.addEventListener("dragging-changed", (event: THREE.Event) => {
      if (controlsRef.current) {
        controlsRef.current.enabled = !(event as any).value;
      }
    });

    sceneRef.current.add(transformControls);
    transformControlsRef.current = transformControls;

    transformControlsRef.current?.addEventListener("mouseDown", () => setIsModifying(true));
    transformControlsRef.current?.addEventListener("mouseUp", () => setIsModifying(false));

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
    object.traverse(child => {
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
      const storedComponentJSON = localStorage.getItem("componentToLoadInCAD");

      console.log("Tentativo di caricamento componente ID:", componentId);
      console.log("Dati in localStorage:", storedComponentJSON?.substring(0, 100) + "...");

      if (storedComponentJSON) {
        try {
          const componentData = JSON.parse(storedComponentJSON);

          // Verifica che l'ID corrisponda esattamente
          if (componentData && componentData.id && componentData.id === componentId) {
            console.log("Componente trovato, preparazione al caricamento");

            // Crea un nuovo elemento CAD dal componente
            const newElement = {
              id: `component-${Date.now()}`, // ID univoco per il nuovo elemento CAD
              type: "component",
              x: 0,
              y: 0,
              z: 0,
              name: componentData.name || "Componente",
              componentId: componentData.id,
              data: componentData.data,
              layerId: layers.length > 0 ? layers[0].id : "default"
            };

            // Aggiungi l'elemento al canvas
            addElement(newElement);
            toast.success(`Componente ${componentData.name} caricato con successo`);

            // Pulisci localStorage dopo il caricamento
            localStorage.removeItem("componentToLoadInCAD");
            localStorage.removeItem("componentToLoadInCAD_timestamp");

            // Rimuovi i parametri query dall'URL
            const { loadComponent, ts, ...otherParams } = router.query;
            router.replace(
              {
                pathname: router.pathname,
                query: otherParams
              },
              undefined,
              { shallow: true }
            );
          } else {
            console.error("ID componente non corrisponde:", {
              idFromURL: componentId,
              idFromStorage: componentData?.id
            });
            toast.error("ID componente non corrisponde");
          }
        } catch (error) {
          console.error("Errore parsing dati componente:", error);
          toast.error("Errore formato dati componente");
        }
      } else {
        console.error("Nessun dato componente trovato in localStorage");
        toast.error("Dati componente non trovati");
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
              sceneRef.current.getObjectById(transformControlsRef.current.id);
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
        if (transformMode === "rotate") {
          updates.rotationX = THREE.MathUtils.radToDeg(rotation.x);
          updates.rotationY = THREE.MathUtils.radToDeg(rotation.y);
          updates.rotationZ = THREE.MathUtils.radToDeg(rotation.z);
        }

        // Aggiungi scala
        if (transformMode === "scale") {
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
      }, 16)
    );

    transformControlsRef.current?.addEventListener("objectChange", handleObjectChange);

    return () => {
      transformControlsRef.current?.removeEventListener("objectChange", handleObjectChange);
    };
  }, [selectedElement, updateElement, originOffset, transformMode]);

  // Aggiungi questa funzione ausiliaria per implementare la conversione da 3D a 2D

  // Aggiungi questa funzione all'interno del componente CADCanvas
  const getScreenPosition = (position3D: THREE.Vector3): { x: number; y: number } | null => {
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
        { keys: ["Ctrl + 2"], description: "Switch to top view (2D)" }
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
        { keys: ["Z"], description: "Constrain to Z axis" }
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
        { keys: ["M"], description: "Measurement tool" }
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
        { keys: ["Alt + Z"], description: "Toggle X-ray mode" }
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
        { keys: ["Alt + C"], description: "Toggle center snap" }
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
        { keys: ["Ctrl + I"], description: "Import" }
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
        { keys: ["Alt + Shift + L"], description: "Unlock all objects" }
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
        { keys: ["Ctrl + F"], description: "Search" }
      ]
    }
  ];

  const getTemporaryCanvas = (key: string, width: number, height: number) => {
    return CanvasPool.getCanvas(`temp-${key}`, width, height);
  };

  const performMemoryCleanup = useCallback(() => {
    // Force garbage collection if available
    if ('gc' in window && typeof window.gc === 'function') {
      window.gc();
    }

    // Clear Three.js cache periodically
    if (Object.keys(THREE.Cache.files || {}).length > 100) {
      THREE.Cache.clear();
      console.log("🧹 Three.js cache cleared");
    }

    // Clear canvas pool if too many canvases
    try {
      CanvasPool.clearPool();
    } catch (error) {
      console.warn("Canvas pool optimization not available");
    }
  }, []);

  const monitorMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const geometriesCount = sceneRef.current ?
        [...sceneRef.current.children].reduce((count, child) => {
          if (child instanceof THREE.Mesh && child.geometry) count++;
          return count;
        }, 0) : 0;

      setMemoryStats({
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        geometriesCount,
        texturesCount: Object.keys(THREE.Cache.files || {}).length
      });
    }
  }, [sceneRef.current]);
  const getTextureFromPool = (key: string, width: number, height: number) => {
    return CanvasPool.getTexture(`texture-${key}`, width, height);
  };
  useEffect(() => {
    // Start memory monitoring
    const memoryInterval = setInterval(() => {
      monitorMemoryUsage();
    }, 5000); // Monitor every 5 seconds

    // Periodic cleanup every 30 seconds
    const cleanupInterval = setInterval(() => {
      performMemoryCleanup();
    }, 30000);

    return () => {
      clearInterval(memoryInterval);
      clearInterval(cleanupInterval);
    };
  }, [monitorMemoryUsage, performMemoryCleanup]);
  const [memoryStats, setMemoryStats] = useState({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
    geometriesCount: 0,
    texturesCount: 0
  });

  // Cleanup function per il componente
  useEffect(() => {
    return () => {
      // Pulisci il pool quando il componente viene smontato
      CanvasPool.clearPool();
    };
  }, []);
  const handleMouseDownWithTransforms = useCallback(
    (event: React.MouseEvent) => {
      // Se stiamo posizionando un componente, usa la logica esistente
      if (isPlacingComponent) {
        handleClickForPlacement(event);
        return;
      }

      // Se siamo in modalità transform, gestisci tramite il sistema di transform controls
      if (transformControls.mode !== "none" && selectedElementIds.length > 0) {
        transformControls.onMouseDown(event.nativeEvent);
        return;
      }

      // Altrimenti usa i gestori esistenti
      handleMouseDown(event);
    },
    [isPlacingComponent, transformControls.mode, selectedElementIds.length, transformControls, handleClickForPlacement]
  );

  const handleMouseMoveWithTransforms = useCallback(
    (event: React.MouseEvent) => {
      // Se stiamo posizionando un componente, usa la logica esistente
      if (isPlacingComponent) {
        handleMouseMoveForPreview(event);
        return;
      }

      // Se siamo in modalità transform, gestisci tramite il sistema di transform controls
      if (transformControls.isTransforming) {
        transformControls.onMouseMove(event.nativeEvent);
        return;
      }

      // Altrimenti usa i gestori esistenti
      handleMouseMove(event);
    },
    [isPlacingComponent, transformControls.isTransforming, transformControls, handleMouseMoveForPreview, handleMouseMove]
  );

  const handleMouseUpWithTransforms = useCallback(
    (event: React.MouseEvent) => {
      // Se siamo in modalità transform, gestisci tramite il sistema di transform controls
      if (transformControls.isTransforming) {
        transformControls.onMouseUp(event.nativeEvent);
        return;
      }

      // Altrimenti usa i gestori esistenti
      handleMouseUp();
    },
    [transformControls.isTransforming, transformControls]
  );

  // Integrazione con keyboard shortcuts esistenti
  const handleKeyboardWithTransforms = useCallback(
    (event: KeyboardEvent) => {
      // Shortcuts specifici per transform controls
      switch (event.key.toLowerCase()) {
        case "g": // Move mode
          if (!event.ctrlKey && !event.shiftKey && selectedElementIds.length > 0) {
            event.preventDefault();
            transformControls.setMode("translate");
          }
          break;
        case "r": // Rotate mode
          if (!event.ctrlKey && !event.shiftKey && selectedElementIds.length > 0) {
            event.preventDefault();
            transformControls.setMode("rotate");
          }
          break;
        case "s": // Scale mode
          if (!event.ctrlKey && !event.shiftKey && selectedElementIds.length > 0) {
            event.preventDefault();
            transformControls.setMode("scale");
          }
          break;
        case "escape":
          // Cancel transform or reset mode
          if (transformControls.isTransforming) {
            event.preventDefault();
            transformControls.cancelTransform();
          } else if (transformControls.mode !== "none") {
            event.preventDefault();
            transformControls.setMode("none");
          }
          break;
        case "enter":
          // Commit transform
          if (transformControls.isTransforming) {
            event.preventDefault();
            transformControls.commitTransform();
          }
          break;
        case "t": // Toggle transform panel
          if (event.ctrlKey) {
            event.preventDefault();
            setShowTransformPanel(!showTransformPanel);
          }
          break;
      }
    },
    [selectedElementIds.length, transformControls, transformControls.mode, showTransformPanel]
  );

  // Registra i keyboard shortcuts per i transform controls
  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardWithTransforms);
    return () => {
      window.removeEventListener("keydown", handleKeyboardWithTransforms);
    };
  }, [handleKeyboardWithTransforms]);

  // Quick transform functions
  const quickTransforms = {
    resetPosition: () => transformControls.resetToOrigin(),
    alignToGrid: () => transformControls.alignToGrid(),
    duplicate: () => transformControls.duplicateInPlace(),
    center: () => transformControls.centerOnOrigin(),
    distributeX: () => transformControls.distributeEvenly("x"),
    distributeY: () => transformControls.distributeEvenly("y"),
    distributeZ: () => transformControls.distributeEvenly("z")
  };

  // Integrazione con il sistema di constraint esistente
  useEffect(() => {
    if (selectedElementIds.length > 0 && activeRightPanel === "constraints") {
      // Sincronizza i constraints del transform system con il constraint context
      selectedElementIds.forEach(elementId => {
        const constraints = getConstraintsForEntity(elementId);
        if (constraints.length > 0) {
          // Applica i constraints ai transform controls
          const hasXConstraint = constraints.some(c => c.type === "distance" && c.parameters?.axis === "x");
          const hasYConstraint = constraints.some(c => c.type === "distance" && c.parameters?.axis === "y");
          const hasZConstraint = constraints.some(c => c.type === "distance" && c.parameters?.axis === "z");
          console.log(hasXConstraint, hasYConstraint, hasZConstraint);

          transformControls.setConstraints({
            lockX: hasXConstraint,
            lockY: hasYConstraint,
            lockZ: hasZConstraint
          });
        }
      });
    }
  }, [selectedElementIds, activeRightPanel, getConstraintsForEntity, transformControlsRef.current]);

  // Funzione per cambiare modalità di transform
  const setTransformModeEnhanced = useCallback((mode: "translate" | "rotate" | "scale" | "none") => {
    transformControls.setMode(mode);
    setTransformMode(mode as "translate" | "rotate" | "scale");

    // Aggiorna il tool attivo nel CAD store
    if (mode !== "none") {
      useCADStore.getState().setActiveTool(mode);
    }
  }, [transformControlsRef.current]);

  // Funzione per ottenere le informazioni di trasformazione correnti
  const getTransformInfo = useCallback(() => {
    if (selectedElementIds.length === 0) return null;

    const bounds = useSelectionStore.getState().getSelectionBounds();
    if (!bounds) return null;

    return {
      elementCount: selectedElementIds.length,
      bounds,
      center: { x: bounds.centerX, y: bounds.centerY, z: bounds.centerZ },
      size: { width: bounds.width, height: bounds.height, depth: bounds.depth },
      mode: transformControlsRef.current?.mode,
      isTransforming: transformControlsRef.current?.addEventListener,
    };
  }, [selectedElementIds, transformControlsRef.current]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const componentType = e.dataTransfer.getData("text/plain");
    if (componentType && onComponentPlaced) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        onComponentPlaced(componentType, { x, y, z: 0 });
      }
    }
  }, [onComponentPlaced]);
  return (
    <div
      ref={canvasRef}
      style={{
        width: width,
        height: height
      }}
      className={`relative bg-gradient-to-b rounded-xl from-[#2A2A2A] to-[#303030] overflow-hidden ${isPlacingComponent || isDraggingComponent ? "cursor-cell" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDragOver={handleComponentDragOver}
      onDrop={handleComponentDrop}
      onDragLeave={handleComponentDragLeave}
    >

      <div className="absolute top-4 right-40 z-50">
        <SimulationToolbar />
      </div>

      {/* Simulation Manager Modal */}
      <SimulationManager
        isOpen={simulation?.isSimulationOpen || false}
        onClose={simulation?.closeSimulation || (() => { })}
        selectedMeshIds={simulation?.selectedElementsForSimulation || []}
      />


      {selectedElementIds.length > 0 && transformControls.mode !== "none" && (
        <div className="absolute bottom-36 left-4 z-10">
          <TransformGizmo
            canvasRef={canvasRef as unknown as React.RefObject<HTMLCanvasElement>}
            camera={cameraRef.current || undefined}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "auto",
              zIndex: 1000
            }}
          />
        </div>
      )}

      {/* Transform Control Panel */}
      {showTransformPanel && (
        <TransformControlPanel
          collapsed={transformPanelCollapsed}
          onToggleCollapse={() => setTransformPanelCollapsed(!transformPanelCollapsed)}
          className="transform-controls-panel"
        />
      )}

      {/* Quick Transform Toolbar */}
      {selectedElementIds.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: "8px",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: "8px 12px",
            borderRadius: "8px",
            zIndex: 1001
          }}
        >
          {/* Mode Selection Buttons */}
          <button
            onClick={() => setTransformModeEnhanced("translate")}
            style={{
              padding: "6px 12px",
              backgroundColor: transformControlsRef.current?.mode === "translate" ? "#3b82f6" : "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            <Move size={14} style={{ marginRight: "4px" }} />
            Move (G)
          </button>

          <button
            onClick={() => setTransformModeEnhanced("rotate")}
            style={{
              padding: "6px 12px",
              backgroundColor: transformControlsRef.current?.mode === "rotate" ? "#3b82f6" : "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            <RotateCw size={14} style={{ marginRight: "4px" }} />
            Rotate (R)
          </button>

          <button
            onClick={() => setTransformModeEnhanced("scale")}
            style={{
              padding: "6px 12px",
              backgroundColor: transformControlsRef.current?.mode === "scale" ? "#3b82f6" : "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            <Maximize2 size={14} style={{ marginRight: "4px" }} />
            Scale (S)
          </button>

          {/* Divider */}
          <div style={{ width: "1px", backgroundColor: "#6b7280", margin: "0 4px" }} />

          {/* Quick Actions */}
          <button
            onClick={quickTransforms.resetPosition}
            style={{
              padding: "6px 8px",
              backgroundColor: "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px"
            }}
            title="Reset Position"
          >
            Reset
          </button>

          <button
            onClick={quickTransforms.alignToGrid}
            style={{
              padding: "6px 8px",
              backgroundColor: "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px"
            }}
            title="Align to Grid"
          >
            Grid
          </button>

          <button
            onClick={quickTransforms.duplicate}
            style={{
              padding: "6px 8px",
              backgroundColor: "#374151",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px"
            }}
            title="Duplicate"
          >
            Dup
          </button>
        </div>
      )}

      {/* Transform Info Display */}
      {transformControls.isTransforming && (
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            color: "white",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "monospace",
            zIndex: 1002
          }}
        >
          <div>Mode: {transformControls.mode.toUpperCase()}</div>
          <div>Elements: {selectedElementIds.length}</div>
          <div style={{ fontSize: "10px", marginTop: "4px", color: "#9ca3af" }}>
            Press ENTER to confirm, ESC to cancel
          </div>
        </div>
      )}


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
        <div className="absolute top-16 cursor-pointer right-4 bottom-16 z-10">
          <ElementsListPanel onClose={() => setShowElementsList(false)} />
        </div>
      )}
      {selectedElementIds.length === 1 && showElementInfo && (
        <div className="absolute cursor-pointer top-16 right-4 z-10 w-80">
          <ElementInfo elementId={selectedElementIds[0]} onClose={() => setShowElementInfo(false)} />
        </div>
      )}

      <ComponentCreationModal isOpen={showComponentModal} onClose={() => setShowComponentModal(false)} />

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
      {/* Instructions for positioning */}
      {isPlacingComponent && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md shadow-lg z-100">
          <p className="text-sm font-medium">Click to place the component or press ESC to cancel</p>
        </div>
      )}

      {/* Indicatore per drag & drop */}
      {isDraggingComponent && <DragDropIndicator position={dropPosition} screenPosition={dropScreenPosition} />}

      {/* Transformation tools panel */}
      {selectedElement && (
        <div className="absolute top-14 right-4 flex space-x-2 bg-[#F8FBFF] dark:bg-gray-800 p-2 rounded-md shadow-md z-10">
          <button
            onClick={() => {
              setTransformMode("translate");
              transformControlsRef.current?.setMode("translate");
            }}
            className={`p-2 rounded ${transformMode === "translate" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`}
            title="Move (G)"
          >
            <Move size={16} />
          </button>
          <button
            onClick={() => {
              setTransformMode("rotate");
              transformControlsRef.current?.setMode("rotate");
            }}
            className={`p-2 rounded ${transformMode === "rotate" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`}
            title="Rotate (R)"
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={() => {
              setTransformMode("scale");
              transformControlsRef.current?.setMode("scale");
            }}
            className={`p-2 rounded ${transformMode === "scale" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700"}`}
            title="Scale (S)"
          >
            <Maximize size={16} />
          </button>
          <button
            onClick={() => performBooleanOperation("union")}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
            title="Boolean Union (Ctrl+U)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="6"></circle>
              <circle cx="16" cy="16" r="6"></circle>
            </svg>
          </button>

          <button
            onClick={() => performBooleanOperation("subtract")}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
            title="Boolean Subtract (Ctrl+S)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="6"></circle>
              <circle cx="16" cy="16" r="6"></circle>
              <path d="M2 2l20 20"></path>
            </svg>
          </button>

          <button
            onClick={() => performBooleanOperation("intersect")}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-800"
            title="Boolean Intersect (Ctrl+I)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="6"></circle>
              <circle cx="16" cy="16" r="6"></circle>
              <path d="M8 14a6 6 0 0 0 8-8"></path>
            </svg>
          </button>
        </div>
      )}
      {/* Performance panel and unified event system */}
      {showPerformanceSettings && (
        <div className="absolute top-16 right-40 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-10 w-80">
          <h3 className="text-lg font-semibold mb-3">Performance & Events</h3>

          {/* Unified Events Toggle */}
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={unifiedEventsEnabled}
                onChange={(e) => setUnifiedEventsEnabled(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Enable Unified Events</span>
            </label>
          </div>

          {/* Event System Metrics */}
          {cadEventSystem && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Event Metrics</h4>
              <div className="text-xs space-y-1 text-gray-600 dark:text-gray-300">
                <div>Total Events: {eventSystemMetrics.totalEvents}</div>
                <div>Events/sec: {eventSystemMetrics.eventsPerSecond}</div>
                <div>Avg Processing: {eventSystemMetrics.averageProcessingTime.toFixed(2)}ms</div>
              </div>
            </div>
          )}

          {/* FIXED: Memory Usage Monitoring */}
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Memory Usage</h4>
            <div className="text-xs space-y-1 text-gray-600 dark:text-gray-300">
              <div>JS Heap: {(memoryStats.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
              <div>Total Heap: {(memoryStats.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
              <div>Geometries: {memoryStats.geometriesCount}</div>
              <div>Textures: {memoryStats.texturesCount}</div>
            </div>
            <div className="mt-2 space-x-2">
              <button
                onClick={() => {
                  monitorMemoryUsage();
                  performMemoryCleanup();
                }}
                className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
              >
                Cleanup Memory
              </button>
              <button
                onClick={monitorMemoryUsage}
                className="text-xs bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* WASM Performance Settings */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={performanceSettings.enableWasmCSG}
                onChange={(e) => setPerformanceSettings(prev => ({
                  ...prev,
                  enableWasmCSG: e.target.checked
                }))}
                className="rounded"
              />
              <span className="text-sm">WASM CSG Operations</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={performanceSettings.enableWasmMeshOptimization}
                onChange={(e) => setPerformanceSettings(prev => ({
                  ...prev,
                  enableWasmMeshOptimization: e.target.checked
                }))}
                className="rounded"
              />
              <span className="text-sm">WASM Mesh Optimization</span>
            </label>

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={performanceSettings.enableWasmSnapCalculation}
                onChange={(e) => setPerformanceSettings(prev => ({
                  ...prev,
                  enableWasmSnapCalculation: e.target.checked
                }))}
                className="rounded"
              />
              <span className="text-sm">WASM Snap Calculation</span>
            </label>
          </div>

          <button
            onClick={() => setShowPerformanceSettings(false)}
            className="mt-4 w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      )}

      {/* Performance Settings Toggle Button */}
      <button
        onClick={() => setShowPerformanceSettings(!showPerformanceSettings)}
        className="absolute top-4 right-28 p-2 bg-white dark:bg-gray-800 rounded-md shadow-md hover:bg-gray-100 z-10"
        title="Performance Settings"
      >
        <CogIcon size={18} />
      </button>

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
