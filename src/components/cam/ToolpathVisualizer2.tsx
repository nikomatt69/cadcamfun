import React, { useState, useRef, useEffect, useCallback, FC } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useCADStore } from 'src/store/cadStore';
import { predefinedTools } from '@/src/lib/predefinedLibraries';
import { useLOD } from 'src/hooks/canvas/useLod';
import { useThreePerformanceVisualizer } from 'src/hooks/useThreePerformanceVisualizer';
import {
  Eye, EyeOff, Grid, Home, Download, Maximize2, Play, Pause, 
  SkipBack, ChevronLeft, ChevronRight, FastForward, 
  Tool, Box, Layers, Globe, Sun, Square, Menu, Info, Settings, X
} from 'react-feather';

import { 
  createToolpathVisualization, 
  createToolpathPointMarkers,
  setToolGlow 
} from '@/src/components/cam/toolpathUtils/toolpathUtils';
import { ViewCube as EnhancedViewCube } from '@/src/components/cam/toolpath-viewer/ViewCube';
import { createToolFromLibrary, animateToolRotation, addCuttingGlow, applyRealisticMaterial } from '@/src/lib/toolVisualization';
import { useFixedCyclesProcessor } from 'src/hooks/useFixedCyclesProcessor';
import { FixedCycleType, FixedCycleParams } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';
import { FixedCycleInfoPanel } from 'src/components/cam/FixedCyclesUIRenderer';

interface ToolpathVisualizerProps {
  width: string;
  height: string;
  gcode: string;
  isSimulating: boolean;
  selectedTool?: string | null;
  showWorkpiece?: boolean;
  onSimulationComplete?: () => void;
  onSimulationProgress?: (progress: number) => void;
  onToolChange?: (toolName: string) => void;
}

interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate?: number;
  type?: string;
  isRapid?: boolean;
  // Arc properties
  i?: number;
  j?: number;
  k?: number;
  r?: number;
  isArc?: boolean;
  arcCenter?: { x: number; y: number; z?: number };
  arcRadius?: number;
  arcStartAngle?: number;
  arcEndAngle?: number;
  isClockwise?: boolean;
  // Shape properties
  isShape?: boolean;
  shapeType?: 'circle' | 'sphere' | 'cone' | 'extrude';
  shapeParams?: any;
  // Fixed cycle properties
  isFixedCycle?: boolean;
  cycleType?: string;
  cycleParams?: any;
}

interface Statistics {
  triangleCount: number;
  objectCount: number;
  fps: number;
  memory: number;
  timeRemaining: string;
}

interface ViewCubeProps {
  currentView: string;
  onViewChange: (view: string) => void;
  size?: number;
}

// Simple ViewCube component for 3D orientation
const ViewCube: React.FC<ViewCubeProps> = ({ currentView, onViewChange, size = 70 }) => {
  const cubeRef = useRef<HTMLDivElement>(null);
  
  const views = [
    { id: 'perspective', label: '3D' },
    { id: 'top', label: 'Top' },
    { id: 'front', label: 'Front' },
    { id: 'right', label: 'Right' },
    { id: 'isometric', label: 'ISO' }
  ];
  
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  
  return (
    <div 
      ref={cubeRef}
      className="relative cursor-pointer bg-gray-800 bg-opacity-50 rounded-md overflow-hidden"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Top face */}
        <div 
          className={`h-1/3 flex justify-center items-center border border-gray-700 ${
            currentView === 'top' ? 'bg-blue-500' : hoveredFace === 'top' ? 'bg-gray-600' : ''
          }`}
          onMouseEnter={() => setHoveredFace('top')}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => onViewChange('top')}
        >
          <span className="text-xs text-white font-bold">Top</span>
        </div>
        
        {/* Middle section with Front/Right/Back/Left */}
        <div className="h-1/3 flex">
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'left' ? 'bg-blue-500' : hoveredFace === 'left' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('left')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onViewChange('left')}
          >
            <span className="text-xs text-white font-bold">L</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'front' ? 'bg-blue-500' : hoveredFace === 'front' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('front')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onViewChange('front')}
          >
            <span className="text-xs text-white font-bold">F</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'right' ? 'bg-blue-500' : hoveredFace === 'right' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('right')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onViewChange('right')}
          >
            <span className="text-xs text-white font-bold">R</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'back' ? 'bg-blue-500' : hoveredFace === 'back' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('back')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => onViewChange('back')}
          >
            <span className="text-xs text-white font-bold">B</span>
          </div>
        </div>
        
        {/* Bottom face */}
        <div 
          className={`h-1/3 flex justify-center items-center border border-gray-700 ${
            currentView === 'bottom' ? 'bg-blue-500' : hoveredFace === 'bottom' ? 'bg-gray-600' : ''
          }`}
          onMouseEnter={() => setHoveredFace('bottom')}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => onViewChange('bottom')}
        >
          <span className="text-xs text-white font-bold">Bottom</span>
        </div>
      </div>
      
      {/* Center 3D button */}
      <div 
        className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                    w-1/2 h-1/2 flex justify-center items-center rounded-full
                    ${currentView === 'perspective' || currentView === 'isometric' 
                      ? 'bg-blue-500' 
                      : 'bg-gray-700 bg-opacity-80'}`}
        onClick={() => onViewChange('isometric')}
      >
        <span className="text-xs text-white font-bold">ISO</span>
      </div>
    </div>
  );
};

interface ToolpathVisualizerState {
  lastView: string;
  lastStatsUpdate: number;
}

const ToolpathVisualizer: FC<ToolpathVisualizerProps> = ({
  width,
  height,
  gcode,
  isSimulating,
  selectedTool = null,
  showWorkpiece: initialShowWorkpiece = true,
  onSimulationComplete,
  onSimulationProgress,
  onToolChange
}: ToolpathVisualizerProps) => {
  // Refs for Three.js elements
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const topCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const frontCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rightCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const toolRef = useRef<THREE.Object3D | null>(null);
  const toolpathRef = useRef<THREE.Object3D | null>(null);
  const workpieceRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const toolpathPointsRef = useRef<ToolpathPoint[]>([]);
  const animateToolRef = useRef<(() => void) | null>(null);
  const [internalSelectedTool, setInternalSelectedTool] = useState<string | null>(selectedTool);
  const [currentGCode, setCurrentGCode] = useState<string[]>([]);
  const [showFixedCyclesInfo, setShowFixedCyclesInfo] = useState<boolean>(true);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(-1);
  // State for UI and visualization
  const [currentView, setCurrentView] = useState<string>('isometric');
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'realistic' | 'shaded' | 'wireframe' | 'xray'>('shaded');
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showTool, setShowTool] = useState(true);
  const [showToolpath, setShowToolpath] = useState(true);
  const [isWorkpieceVisible, setIsWorkpieceVisible] = useState(initialShowWorkpiece);
  const [showStats, setShowStats] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'info' | 'settings' | 'tools'>('info');
  const [highlightMode, setHighlightMode] = useState<'none' | 'rapid' | 'cut' | 'depth'>('none');
  const [showCycleDetails, setShowCycleDetails] = useState<boolean>(false);
  const [currentLine, setCurrentLine] = useState(0);
  const [statistics, setStatistics] = useState<Statistics>({
    triangleCount: 0,
    objectCount: 0,
    fps: 0,
    memory: 0,
    timeRemaining: '00:00'
  });
  
  // Enhanced visualization options
  const [showDebugPoints, setShowDebugPoints] = useState(false);
  const [showArcs, setShowArcs] = useState(true);
  const [showShapes, setShowShapes] = useState(true);
  const [arcResolution, setArcResolution] = useState(10); // mm per segment
  const simulationSpeedRef = useRef(1);
  // Get workpiece data from CAD store
  const { workpiece, viewMode: cadViewMode, gridVisible, axisVisible } = useCADStore();
  const [showPointLabels, setShowPointLabels] = useState(false);
  // Use optimization hooks
  const sceneRefForHooks = sceneRef as React.RefObject<THREE.Scene>;
  const cameraRefForHooks = cameraRef as React.RefObject<THREE.Camera>;
  const { 
    processedToolpath, 
    detectedCycles, 
    isProcessing: isProcessingCycles 
  } = useFixedCyclesProcessor({
    gcode: currentGCode,
    enabled: true,
    onToolpathUpdate: useCallback((toolpath: ToolpathPoint[]) => {
      // Aggiorna solo se il numero di punti è effettivamente cambiato
      if (toolpath.length !== toolpathPointsRef.current.length) {
        toolpathPointsRef.current = toolpath;
        console.log('Toolpath aggiornato con cicli fissi:', toolpath.length, 'punti');
      }
    }, []) // Empty dependency array since we're using ref
  });

  const lastViewRef = useRef<string>('');
  const lastStatsUpdateRef = useRef<number>(Date.now());

  // Sposta l'effetto che gestisce il rendering del toolpath fuori dal componente principale
  const renderToolpath = useCallback(() => {
    if (!toolpathRef.current || !sceneRef.current || !rendererRef.current || !cameraRef.current) return;

    // Pulizia di oggetti esistenti
    while (toolpathRef.current.children.length > 0) {
      toolpathRef.current.remove(toolpathRef.current.children[0]);
    }
    
    // Utilizza processedToolpath se disponibile, altrimenti utilizza il percorso originale
    const pointsToRender = processedToolpath.length > 0 ? processedToolpath : toolpathPointsRef.current;
    
    if (pointsToRender.length > 0) {
      let lastPoint = null;
      
      // Renderizza il percorso
      for (let i = 0; i < pointsToRender.length; i++) {
        const point = pointsToRender[i];
        
        if (lastPoint) {
          // Scegli il colore in base al tipo di movimento
          const color = point.type === 'rapid' ? 0xff0000 : 
                       point.type === 'dwell' ? 0x0000ff :
                       0x00ff00;
          
          // Crea una linea tra i punti
          const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(lastPoint.x, lastPoint.y, lastPoint.z),
            new THREE.Vector3(point.x, point.y, point.z)
          ]);
          
          const line = new THREE.Line(geometry, material);
          toolpathRef.current?.add(line);
          
          // Per i punti di sosta (dwell), aggiungi un indicatore visivo
          if (point.type === 'dwell') {
            const sphereGeom = new THREE.SphereGeometry(0.5);
            const sphereMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.set(point.x, point.y, point.z);
            toolpathRef.current?.add(sphere);
          }
        }
        
        lastPoint = point;
      }
    }
    
    // Aggiorna la scena solo una volta dopo aver completato il rendering
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [processedToolpath]);

  // Usa un effetto separato per il rendering del toolpath
  useEffect(() => {
    if (processedToolpath.length > 0) {
      renderToolpath();
    }
  }, [processedToolpath, renderToolpath]);

  const renderFixedCycleVisualization = (cycle: any) => {
    if (!sceneRef.current || !cycle || !cycle.params) return;
    
    // Crea un nuovo gruppo per la visualizzazione
    const cycleGroup = new THREE.Group();
    cycleGroup.name = 'fixedCycleVisualization';
    
    // Ottieni i parametri del ciclo
    const { x = 0, y = 0, z = 0, r = 0 } = cycle.params;
    
    // Aggiungi cerchio per indicare l'area del ciclo
    const circleGeom = new THREE.CircleGeometry(5, 32);
    const circleMat = new THREE.MeshBasicMaterial({ 
      color: 0x4287f5,
      opacity: 0.3,
      transparent: true,
      side: THREE.DoubleSide
    });
    const circle = new THREE.Mesh(circleGeom, circleMat);
    circle.position.set(x, y, r);
    circle.rotation.x = -Math.PI / 2; // Ruota per renderlo orizzontale
    cycleGroup.add(circle);
    
    // Aggiungi linea verticale per indicare la profondità
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4287f5 });
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, r),
      new THREE.Vector3(x, y, z)
    ]);
    const line = new THREE.Line(lineGeom, lineMat);
    cycleGroup.add(line);
    
    // Aggiungi sfera alla profondità finale
    const sphereGeom = new THREE.SphereGeometry(1);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.set(x, y, z);
    cycleGroup.add(sphere);
    
    // Aggiungi testo per il tipo di ciclo
    // Nota: In Three.js, il testo richiede risorse aggiuntive, per semplicità
    // qui usiamo solo geometrie primitive
    
    // Rimuovi visualizzazioni precedenti
    const previousVis = sceneRef.current.getObjectByName('fixedCycleVisualization');
    if (previousVis) sceneRef.current.remove(previousVis);
    
    // Aggiungi il nuovo gruppo alla scena
    sceneRef.current.add(cycleGroup);
    
    // Aggiorna la visualizzazione
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useEffect(() => {
    if (selectedCycleIndex >= 0 && detectedCycles[selectedCycleIndex]) {
      renderFixedCycleVisualization(detectedCycles[selectedCycleIndex]);
    } else {
      // Rimuovi la visualizzazione se nessun ciclo è selezionato
      if (sceneRef.current) {
        const previousVis = sceneRef.current.getObjectByName('fixedCycleVisualization');
        if (previousVis) sceneRef.current.remove(previousVis);
        
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
    }
  }, [selectedCycleIndex, detectedCycles]);


  const focusCameraOnPosition = useCallback((position: {x: number, y: number, z: number}) => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    if (controlsRef.current.target) {
      controlsRef.current.target.set(position.x, position.y, position.z);
      
      const cameraDistance = 50;
      const cameraPosition = new THREE.Vector3(
        position.x + cameraDistance,
        position.y + cameraDistance,
        position.z + cameraDistance
      );
      cameraRef.current.position.copy(cameraPosition);
      
      controlsRef.current.update();
      
      if (rendererRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
  }, []);
  
 
    const { optimizeScene, 
     
      memoryWarning,
      disposeUnusedResources  } = useThreePerformanceVisualizer(sceneRefForHooks);
      const {
        applyLOD,
        statistics: lodStatistics,
        temporarilyRestoreFullDetail
      } = useLOD(sceneRefForHooks, cameraRefForHooks, {
        highDetailThreshold: 150,          // Distanza per alta qualità
        mediumDetailThreshold: 500,        // Distanza per qualità media
        lowDetailReduction: 0.2,           // Riduzione geometria per oggetti lontani
        mediumDetailReduction: 0.5,        // Riduzione geometria per oggetti a media distanza
       // Aggiorna ogni frame se in simulazione, altrimenti ogni 100ms
        optimizeTextures: true,            // Ottimizza texture per oggetti distanti
            // Libera memoria automaticamente
             // Più ampio del frustum normale per evitare popping
      });

    useEffect(() => {
      if (gcode) {
        // Dividi il G-code in righe
        const lines = gcode.split('\n').map(line => line.trim());
        setCurrentGCode(lines);
      }
    }, [gcode]);
    
  useEffect(() => {
    if (memoryWarning) {
      console.warn('Alta memoria utilizzata: considera di eseguire disposeUnusedResources()');
    }
  }, [memoryWarning]);
 
  // Pulizia periodica (opzionale, solo per scene molto complesse)
  useEffect(() => {
    const interval = setInterval(() => {
      disposeUnusedResources();
    }, 60000); // Ogni minuto
    
    return () => clearInterval(interval);
  }, [disposeUnusedResources]);
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    console.log("Initializing Three.js scene");
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'default'
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setClearColor(0x2A2A2A);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Enable shadows if using realistic mode
    if (viewMode === 'realistic') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    if (viewMode === 'realistic') {
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2A2A2A);
    sceneRef.current = scene;
    
    // Create cameras
    const aspectRatio = containerRef.current.clientWidth / containerRef.current.clientHeight;
    
    // Main perspective camera
    const camera = new THREE.PerspectiveCamera(
      45, // FOV
      aspectRatio,
      0.1,
      2000
    );
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Orthographic cameras for standard views
    const viewSize = 200;
    
    // Top view (looking down Y axis)
    const topCamera = new THREE.OrthographicCamera(
      -viewSize * aspectRatio, viewSize * aspectRatio,
      viewSize, -viewSize,
      0.1, 2000
    );
    topCamera.position.set(0, 400, 0);
    topCamera.lookAt(0, 0, 0);
    topCamera.up.set(0, 0, 1);
    topCameraRef.current = topCamera;
    
    // Front view (looking along Z axis)
    const frontCamera = new THREE.OrthographicCamera(
      -viewSize * aspectRatio, viewSize * aspectRatio,
      viewSize, -viewSize,
      0.1, 2000
    );
    frontCamera.position.set(0, 0, 400);
    frontCamera.lookAt(0, 0, 0);
    frontCameraRef.current = frontCamera;
    
    // Right view (looking along X axis)
    const rightCamera = new THREE.OrthographicCamera(
      -viewSize * aspectRatio, viewSize * aspectRatio,
      viewSize, -viewSize,
      0.1, 2000
    );
    rightCamera.position.set(400, 0, 0);
    rightCamera.lookAt(0, 0, 0);
    rightCamera.up.set(0, 1, 0);
    rightCameraRef.current = rightCamera;
    
    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;
    
    // Add grid
    const gridHelper = new THREE.GridHelper(500, 50);
    gridHelper.rotation.x = Math.PI / 2; // XY plane
    gridHelper.visible = gridVisible;
    scene.add(gridHelper);
    
    // Add axes
    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.visible = axisVisible;
    scene.add(axesHelper);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = viewMode === 'realistic';
    scene.add(directionalLight);
    
    // Animation loop
    const animate = () => {
      if (!isPlaying && !controlsRef.current?.enabled) {
        return; // Stop animation if not playing and controls are not being used
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      // Only update tool if playing and necessary
      if (isPlaying && toolpathPointsRef.current.length > 0 && toolRef.current) {
        updateToolPosition();
      }
     
      // Render with active camera
      let activeCamera: THREE.Camera | null = cameraRef.current;
      
      // Only update camera if view has changed
      if (lastViewRef.current !== currentView) {
        switch (currentView) {
          case 'top':
            activeCamera = topCameraRef.current;
            break;
          case 'front':
            activeCamera = frontCameraRef.current;
            break;
          case 'right':
            activeCamera = rightCameraRef.current;
            break;
          default:
            activeCamera = cameraRef.current;
        }
        lastViewRef.current = currentView;
      }
      
      // Only render if necessary
      if (rendererRef.current && activeCamera && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, activeCamera);
      }
      
      // Update statistics less frequently
      if (Date.now() - lastStatsUpdateRef.current > 1000) { // Update every second
        updateStatistics();
        lastStatsUpdateRef.current = Date.now();
      }
    };
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const aspect = width / height;
      
      // Update perspective camera
      cameraRef.current.aspect = aspect;
      cameraRef.current.updateProjectionMatrix();
      
      // Update orthographic cameras
      if (topCameraRef.current) {
        topCameraRef.current.left = -viewSize * aspect;
        topCameraRef.current.right = viewSize * aspect;
        topCameraRef.current.updateProjectionMatrix();
      }
      
      if (frontCameraRef.current) {
        frontCameraRef.current.left = -viewSize * aspect;
        frontCameraRef.current.right = viewSize * aspect;
        frontCameraRef.current.updateProjectionMatrix();
      }
      
      if (rightCameraRef.current) {
        rightCameraRef.current.left = -viewSize * aspect;
        rightCameraRef.current.right = viewSize * aspect;
        rightCameraRef.current.updateProjectionMatrix();
      }
      
      rendererRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Apply optimizations
    optimizeScene();
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        if (rendererRef.current.domElement.parentNode) {
          rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current = null;
      }

      // Clear all refs
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      toolRef.current = null;
      topCameraRef.current = null;
      frontCameraRef.current = null;
      rightCameraRef.current = null;
      
      // Clear memory
      if (typeof window !== 'undefined' && window.gc) {
        window.gc();
      }
    };
  }, [optimizeScene, gridVisible, axisVisible, viewMode]);
  
  // Update tool position during animation
  const updateToolPosition = useCallback(() => {
    if (!toolRef.current || toolpathPointsRef.current.length === 0) return;
    
    // Ottieni il punto corrente
    const currentPoint = toolpathPointsRef.current[currentPointIndex];
    
    // Aggiorna il feedback visivo in base al tipo di movimento
    if (currentPoint.isRapid || currentPoint.type === 'G0') {
      setToolGlow(toolRef.current, 0); // Nessuna incandescenza per i movimenti rapidi
    } else if (currentPoint.isArc) {
      setToolGlow(toolRef.current, 0.7); // Incandescenza più forte per gli archi
    } else if (currentPoint.isFixedCycle) {
      // Effetto pulsante per le operazioni di foratura
      const pulseValue = (Math.sin(Date.now() / 200) + 1) / 2;
      setToolGlow(toolRef.current, 0.3 + pulseValue * 0.5);
    } else if (currentPoint.isShape) {
      // Effetto speciale per le forme
      const hue = Date.now() / 5000;
      const color = new THREE.Color().setHSL(hue % 1, 0.8, 0.5);
      setToolGlow(toolRef.current, 0.6);
    } else {
      // Taglio normale
      setToolGlow(toolRef.current, 0.5);
    }
    
    // Aggiorna la posizione dell'utensile con offset verticale corretto
    if (currentPoint) {
      // La coordinata Z del G-code si riferisce alla punta dell'utensile
      // Aggiungi un offset significativo alla Z per sollevare l'utensile
      toolRef.current.position.set(
        currentPoint.x,
        currentPoint.y,
        currentPoint.z + 10 // Aggiungiamo un offset fisso di 10 unità per sollevare l'utensile
      );
      
      // Assicurati che l'utensile sia visibile
      if (!toolRef.current.visible && showTool) {
        toolRef.current.visible = true;
      }
    }
    
    // Passa al punto successivo in base alla velocità di riproduzione
    const newIndex = currentPointIndex + playbackSpeed;
    
    // Verifica se abbiamo raggiunto la fine del percorso
    if (newIndex >= toolpathPointsRef.current.length) {
      setIsPlaying(false);
      if (onSimulationComplete) {
        onSimulationComplete();
      }
    } else {
      setCurrentPointIndex(Math.min(newIndex, toolpathPointsRef.current.length - 1));
      
      // Aggiorna il callback di avanzamento se fornito
      if (onSimulationProgress) {
        const progress = (currentPointIndex / (toolpathPointsRef.current.length - 1)) * 100;
        onSimulationProgress(progress);
      }
    }
  }, [currentPointIndex, playbackSpeed, showTool, onSimulationComplete, onSimulationProgress]);

  // Update statistics
  const updateStatistics = useCallback(() => {
    if (!sceneRef.current || !rendererRef.current) return;
    
    let triangleCount = 0;
    let objectCount = 0;
    
    // Count triangles and objects
    sceneRef.current?.traverse((object) => {
      objectCount++;
      
      if (object instanceof THREE.Mesh) {
        const geometry = object.geometry;
        if (geometry.index) {
          triangleCount += geometry.index.count / 3;
        } else if (geometry.attributes.position) {
          triangleCount += geometry.attributes.position.count / 3;
        }
      }
    });
    
    // Calculate time remaining
    let timeRemaining = '00:00';
    if (isPlaying && toolpathPointsRef.current.length > 0) {
      const remainingPoints = toolpathPointsRef.current.length - currentPointIndex;
      const secondsRemaining = Math.floor(remainingPoints / playbackSpeed / 60);
      const minutes = Math.floor(secondsRemaining / 60);
      const seconds = secondsRemaining % 60;
      timeRemaining = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Get renderer info
    const memory = Math.round(
      window.performance && window.performance.memory
        ? window.performance.memory.usedJSHeapSize / 1048576
        : 0
    );
    
    setStatistics({
      triangleCount: Math.floor(triangleCount),
      objectCount,
      fps: Math.round(rendererRef.current.info.render.frame || 0),
      memory,
      timeRemaining
    });
  }, [isPlaying, currentPointIndex, playbackSpeed]);

  // Create tool mesh based on selected tool
  const createToolMesh = useCallback((toolName: string): THREE.Object3D | null => {
    // Find tool in predefined tools
    const toolData = predefinedTools.find(tool => tool.name === toolName);
    if (!toolData) {
      console.warn("Tool not found in predefined tools:", toolName);
      return null;
    }
    
    console.log("Creating tool mesh for:", toolData);
    
    // Create tool based on type
    const toolGroup = new THREE.Group();
    toolGroup.name = `Tool-${toolName}`;
    
    const { diameter = 6, type = 'endmill' } = toolData;
    
    // Offset to position the tip of the tool at the actual coordinate
    const toolOffset = new THREE.Vector3(0, 0, 0);
    let toolLength = 0;
    
    switch (type) {
      case 'endmill': {
        // Create shank - make it more visible by scaling up a bit
        const shankHeight = diameter * 6; // Increased length for visibility
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.6,
          diameter * 0.6,
          shankHeight,
          16
        );
        const shankMaterial = new THREE.MeshStandardMaterial({
          color: 0x999999,
          metalness: 0.7,
          roughness: 0.2,
          // Make sure it's not transparent
          transparent: false
        });
        const shank = new THREE.Mesh(shankGeometry, shankMaterial);
        shank.position.set(0, 0, -(toolData.cuttingLength || 20) - (shankHeight / 2));
        
        // Create cutting part - with bright color for visibility
        const cuttingHeight = diameter * 3;
        toolLength = cuttingHeight; // Save for offset calculation
        const cuttingGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          cuttingHeight,
          24
        );
        const cuttingMaterial = new THREE.MeshStandardMaterial({
          color: 0x3399FF, // Bright blue for better visibility
          metalness: 0.8,
          roughness: 0.1,
          emissive: 0x0066cc, // Add some glow
          emissiveIntensity: 0.5,
          // Make sure it's not transparent
          transparent: false
        });
        const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
        cutting.position.set(0, 0, -(toolData.cuttingLength || 20) - (shankHeight / 2));
        
        // Add flutes
        const flutes = toolData.numberOfFlutes || 2;
        for (let i = 0; i < flutes; i++) {
          const angle = (i / flutes) * Math.PI * 2;
          const fluteGeometry = new THREE.BoxGeometry(
            diameter * 0.05,
            cuttingHeight,
            diameter * 0.4
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          });
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          flute.position.y = -cuttingHeight / 2;
          flute.rotation.y = angle;
          cutting.add(flute);
        }
        
        toolGroup.add(shank);
        toolGroup.add(cutting);
        break;
      }
      
      case 'ballendmill': {
        // Create shank
        const shankHeight = diameter * 4;
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.6,
          diameter * 0.6,
          shankHeight,
          16
        );
        const shankMaterial = new THREE.MeshStandardMaterial({
          color: 0x999999,
          metalness: 0.7,
          roughness: 0.2
        });
        const shank = new THREE.Mesh(shankGeometry, shankMaterial);
        shank.position.y = shankHeight / 2;
        
        // Create stem
        const stemHeight = diameter * 2;
        const stemGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          stemHeight,
          24
        );
        const stemMaterial = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC,
          metalness: 0.8,
          roughness: 0.1
        });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = -stemHeight / 2;
        
        // Create ball end
        const ballGeometry = new THREE.SphereGeometry(
          diameter / 2,
          24,
          24,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        );
        const ballMaterial = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC,
          metalness: 0.8,
          roughness: 0.1
        });
        const ball = new THREE.Mesh(ballGeometry, ballMaterial);
        ball.position.y = -stemHeight - (diameter / 4);
        ball.rotation.x = Math.PI;
        
        toolLength = stemHeight + diameter / 2; // Total length for ball endmill
        
        toolGroup.add(shank);
        toolGroup.add(stem);
        toolGroup.add(ball);
        break;
        
      }
      default: {
        // Generic tool for unsupported types
        const toolHeight = diameter * 7;
        toolLength = toolHeight;
        const toolGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          toolHeight,
          16
        );
        const toolMaterial = new THREE.MeshStandardMaterial({
          color: 0xCCCCCC,
          metalness: 0.5,
          roughness: 0.5
        });
        const toolMesh = new THREE.Mesh(toolGeometry, toolMaterial);
        toolMesh.position.y = -toolHeight / 2;
        
        toolGroup.add(toolMesh);
      }
    }
    
    // Orient tool to point downward (Z axis) and scale up for visibility
    toolGroup.rotation.x = Math.PI / 2;
    
    // Add a helper arrow to make the tool more visible
    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),  // Direction pointing down
      new THREE.Vector3(0, 0, 0),   // Origin at tool center
      diameter * 2,                 // Length
      0xFF0000,                     // Color
      diameter * 0.5,               // Head length
      diameter * 0.3                // Head width
    );
    toolGroup.add(arrowHelper);
    
    // Make tool more visible by scaling up slightly
    const toolScale = 1;
    toolGroup.scale.set(toolScale, toolScale, toolScale);
    
    // Set additional properties for debugging
    toolGroup.userData.isToolMesh = true;
    toolGroup.userData.toolName = toolName;
    toolGroup.userData.toolLength = toolLength * toolScale; // Save scaled length for offset
    
    console.log("Tool created successfully:", toolGroup);
    
    return toolGroup;
  }, []);

  // Enhanced G-code parser with support for arcs and shapes
  const parseGCode = useCallback((gcode: string, arcResolution = 10): ToolpathPoint[] => {
    const points: ToolpathPoint[] = [];
    const lines = gcode.split('\n');
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let currentF = 0;
    
    // For modal state tracking
    let isAbsoluteMode = true; // G90 is default
    let currentPlane = 'XY'; // G17 is default (XY-plane)
    
    lines.forEach(line => {
      // Skip comments and empty lines
      if (!line.trim() || line.trim().startsWith(';')) return;
      
      // Normalize the line for easier parsing
      const normalizedLine = line.trim();
      
      // Check for modal commands
      if (normalizedLine.includes('G90')) isAbsoluteMode = true;
      if (normalizedLine.includes('G91')) isAbsoluteMode = false;
      if (normalizedLine.includes('G17')) currentPlane = 'XY';
      if (normalizedLine.includes('G18')) currentPlane = 'ZX';
      if (normalizedLine.includes('G19')) currentPlane = 'YZ';
      
      // Extract command type
      const isG0 = normalizedLine.includes('G0') || normalizedLine.includes('G00');
      const isG1 = normalizedLine.includes('G1') || normalizedLine.includes('G01');
      const isG2 = normalizedLine.includes('G2') || normalizedLine.includes('G02'); // Clockwise arc
      const isG3 = normalizedLine.includes('G3') || normalizedLine.includes('G03'); // Counter-clockwise arc
      
      // Extract coordinates and parameters
      const xMatch = normalizedLine.match(/X([+-]?\d*\.?\d+)/);
      const yMatch = normalizedLine.match(/Y([+-]?\d*\.?\d+)/);
      const zMatch = normalizedLine.match(/Z([+-]?\d*\.?\d+)/);
      const fMatch = normalizedLine.match(/F([+-]?\d*\.?\d+)/);
      const iMatch = normalizedLine.match(/I([+-]?\d*\.?\d+)/);
      const jMatch = normalizedLine.match(/J([+-]?\d*\.?\d+)/);
      const kMatch = normalizedLine.match(/K([+-]?\d*\.?\d+)/);
      const rMatch = normalizedLine.match(/R([+-]?\d*\.?\d+)/);
      
      // Parse coordinate values
      let newX = xMatch ? parseFloat(xMatch[1]) : currentX;
      let newY = yMatch ? parseFloat(yMatch[1]) : currentY;
      let newZ = zMatch ? parseFloat(zMatch[1]) : currentZ;
      
      // Apply relative mode if active
      if (!isAbsoluteMode) {
        newX = currentX + (xMatch ? parseFloat(xMatch[1]) : 0);
        newY = currentY + (yMatch ? parseFloat(yMatch[1]) : 0);
        newZ = currentZ + (zMatch ? parseFloat(zMatch[1]) : 0);
      }
      
      // Update feedrate if specified
      if (fMatch) {
        currentF = parseFloat(fMatch[1]);
      }
      
      // Linear moves (G0/G1)
      if (isG0 || isG1) {
        points.push({
          x: newX,
          y: newY,
          z: newZ,
          feedrate: currentF,
          type: isG0 ? 'G0' : 'G1',
          isRapid: isG0
        });
      } 
      
      // Arc moves (G2/G3)
      else if ((isG2 || isG3) && (iMatch || jMatch || rMatch)) {
        // Determine arc center and radius
        let centerX: number;
        let centerY: number;
        let centerZ: number = currentZ; // For helical moves
        let radius: number;
        
        // Arc center using I, J, K offsets
        if (iMatch || jMatch || kMatch) {
          const i = iMatch ? parseFloat(iMatch[1]) : 0;
          const j = jMatch ? parseFloat(jMatch[1]) : 0;
          const k = kMatch ? parseFloat(kMatch[1]) : 0;
          
          // IJK are always relative to current position 
          // regardless of G90/G91 mode in most controllers
          centerX = currentX + i;
          centerY = currentY + j;
          centerZ = currentZ + k;
          
          // Calculate radius based on the distance from current position to center
          radius = Math.sqrt(i*i + j*j);
        } 
        // Arc center using radius (R word)
        else if (rMatch) {
          radius = Math.abs(parseFloat(rMatch[1]));
          
          // Calculate the center point based on radius
          // This is a complex calculation and may need adjustment
          const dx = newX - currentX;
          const dy = newY - currentY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          // Check if the move is valid with the given radius
          if (dist > 2 * radius) {
            console.warn('Arc radius too small for the given points, adjusting');
            radius = dist / 2 + 0.001; // Adjust slightly to avoid errors
          }
          
          // Determine which side of the line the center is on
          // G2 (CW) is on one side, G3 (CCW) is on the other
          const h = Math.sqrt(radius*radius - (dist*dist/4));
          const dirFactor = isG2 ? -1 : 1;
          
          // Calculate center
          const nx = dx / dist;
          const ny = dy / dist;
          
          centerX = currentX + dx/2 - dirFactor * h * ny;
          centerY = currentY + dy/2 + dirFactor * h * nx;
        } else {
          console.warn('Invalid arc command - missing center or radius');
          return points;
        }
        
        // Add the start point with arc metadata
        points.push({
          x: currentX,
          y: currentY,
          z: currentZ,
          feedrate: currentF,
          type: isG2 ? 'G2' : 'G3',
          isArc: true,
          arcCenter: { x: centerX, y: centerY, z: centerZ },
          arcRadius: radius,
          isClockwise: isG2,
          i: iMatch ? parseFloat(iMatch[1]) : undefined,
          j: jMatch ? parseFloat(jMatch[1]) : undefined,
          k: kMatch ? parseFloat(kMatch[1]) : undefined,
          r: rMatch ? parseFloat(rMatch[1]) : undefined
        });
        
        // Calculate start and end angles
        let startAngle = Math.atan2(currentY - centerY, currentX - centerX);
        let endAngle = Math.atan2(newY - centerY, newX - centerX);
        
        // Adjust for full circles
        if (Math.abs(startAngle - endAngle) < 0.01 && (iMatch || jMatch)) {
          endAngle = startAngle + (isG2 ? -2*Math.PI : 2*Math.PI);
        }
        // Adjust based on clockwise/counterclockwise direction
        else if (isG2 && endAngle > startAngle) {
          endAngle = endAngle - 2*Math.PI;
        } else if (!isG2 && startAngle > endAngle) {
          endAngle = endAngle + 2*Math.PI;
        }
        
        // Calculate arc length to determine number of segments
        const arcAngle = Math.abs(endAngle - startAngle);
        const arcLength = radius * arcAngle;
        const segments = Math.max(4, Math.ceil(arcLength / arcResolution));
        
        // Generate intermediate points along the arc
        for (let i = 1; i <= segments; i++) {
          const fraction = i / segments;
          const angle = startAngle + (endAngle - startAngle) * fraction;
          
          // Calculate position on arc
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          
          // For helical moves, interpolate Z
          const z = currentZ + (newZ - currentZ) * fraction;
          
          points.push({
            x: x,
            y: y,
            z: z,
            feedrate: currentF,
            type: isG2 ? 'G2' : 'G3',
            isArc: true
          });
        }
      }
      
      // Circle command (custom M-code or G12/G13)
      else if (normalizedLine.includes('G12') || normalizedLine.includes('G13')) {
        const isClockwise = normalizedLine.includes('G12');
        
        // Extract circle parameters
        const dMatch = normalizedLine.match(/D([+-]?\d*\.?\d+)/); // Diameter
        const pMatch = normalizedLine.match(/P([+-]?\d*\.?\d+)/); // Number of passes
        
        if (dMatch) {
          const diameter = parseFloat(dMatch[1]);
          const radius = diameter / 2;
          const passes = pMatch ? parseInt(pMatch[1]) : 1;
          
          // Add a shape marker point
          points.push({
            x: currentX,
            y: currentY,
            z: currentZ,
            feedrate: currentF,
            type: isClockwise ? 'G12' : 'G13',
            isShape: true,
            shapeType: 'circle',
            shapeParams: {
              diameter,
              radius,
              passes
            }
          });
          
          // Generate points for circle
          const segments = Math.max(16, Math.ceil((2 * Math.PI * radius) / arcResolution));
          const angleStep = (2 * Math.PI) / segments;
          
          for (let pass = 0; pass < passes; pass++) {
            const passRadius = radius * (1 - pass / passes);
            
            for (let i = 0; i <= segments; i++) {
              const angle = isClockwise ? -i * angleStep : i * angleStep;
              
              points.push({
                x: currentX + passRadius * Math.cos(angle),
                y: currentY + passRadius * Math.sin(angle),
                z: currentZ,
                feedrate: currentF,
                type: isClockwise ? 'G12' : 'G13',
                isShape: true
              });
            }
          }
        }
      }
      
      // Sphere milling (custom code)
      else if (normalizedLine.includes('G13.1')) {
        const dMatch = normalizedLine.match(/D([+-]?\d*\.?\d+)/); // Diameter
        const hMatch = normalizedLine.match(/H([+-]?\d*\.?\d+)/); // Height (partial sphere)
        
        if (dMatch) {
          const diameter = parseFloat(dMatch[1]);
          const radius = diameter / 2;
          const height = hMatch ? parseFloat(hMatch[1]) : radius;
          const maxLayers = Math.ceil(height / (arcResolution / 2));
          
          // Add a shape marker point
          points.push({
            x: currentX,
            y: currentY,
            z: currentZ,
            feedrate: currentF,
            type: 'G13.1',
            isShape: true,
            shapeType: 'sphere',
            shapeParams: {
              diameter,
              radius,
              height
            }
          });
          
          // Generate points for sphere using latitude/longitude approach
          const latitudeSteps = maxLayers;
          const longitudeSteps = Math.max(16, Math.ceil((2 * Math.PI * radius) / arcResolution));
          
          for (let lat = 0; lat < latitudeSteps; lat++) {
            const phi = (lat / latitudeSteps) * Math.PI * 0.5;
            const circleRadius = radius * Math.cos(phi);
            const z = currentZ - radius + radius * Math.sin(phi);
            
            // Skip if we're going beyond the requested height
            if (z < currentZ - height) continue;
            
            // Generate circle at this latitude
            for (let lon = 0; lon <= longitudeSteps; lon++) {
              const theta = (lon / longitudeSteps) * 2 * Math.PI;
              
              points.push({
                x: currentX + circleRadius * Math.cos(theta),
                y: currentY + circleRadius * Math.sin(theta),
                z: z,
                feedrate: currentF,
                type: 'G13.1',
                isShape: true
              });
            }
          }
        }
      }
      
      // Cone milling (custom code)
      else if (normalizedLine.includes('G13.2')) {
        const dMatch = normalizedLine.match(/D([+-]?\d*\.?\d+)/); // Base diameter
        const hMatch = normalizedLine.match(/H([+-]?\d*\.?\d+)/); // Height
        const aMatch = normalizedLine.match(/A([+-]?\d*\.?\d+)/); // Angle (alternative to height)
        
        if (dMatch) {
          const baseDiameter = parseFloat(dMatch[1]);
          const baseRadius = baseDiameter / 2;
          
          let height: number;
          if (hMatch) {
            height = parseFloat(hMatch[1]);
          } else if (aMatch) {
            const angle = parseFloat(aMatch[1]) * (Math.PI / 180); // Convert to radians
            height = baseRadius / Math.tan(angle);
          } else {
            height = baseRadius; // Default to 45 degrees
          }
          
          // Add a shape marker point
          points.push({
            x: currentX,
            y: currentY,
            z: currentZ,
            feedrate: currentF,
            type: 'G13.2',
            isShape: true,
            shapeType: 'cone',
            shapeParams: {
              baseDiameter,
              baseRadius,
              height
            }
          });
          
          // Generate points for cone
          const layers = Math.max(4, Math.ceil(height / (arcResolution / 2)));
          
          for (let layer = 0; layer <= layers; layer++) {
            const layerZ = currentZ - layer * (height / layers);
            const layerRadius = baseRadius * (1 - layer / layers);
            
            const segments = Math.max(16, Math.ceil((2 * Math.PI * layerRadius) / arcResolution));
            
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * 2 * Math.PI;
              
              points.push({
                x: currentX + layerRadius * Math.cos(angle),
                y: currentY + layerRadius * Math.sin(angle),
                z: layerZ,
                feedrate: currentF,
                type: 'G13.2',
                isShape: true
              });
            }
          }
        }
      }
      
      // Extrusion (custom code for 3D printing-like operations)
      else if (normalizedLine.includes('G13.3')) {
        const wMatch = normalizedLine.match(/W([+-]?\d*\.?\d+)/); // Width
        const hMatch = normalizedLine.match(/H([+-]?\d*\.?\d+)/); // Height
        const lMatch = normalizedLine.match(/L([+-]?\d*\.?\d+)/); // Length
        
        if (wMatch && hMatch && xMatch && yMatch) {
          const width = parseFloat(wMatch[1]);
          const height = parseFloat(hMatch[1]);
          const length = lMatch ? parseFloat(lMatch[1]) : Math.hypot(newX - currentX, newY - currentY);
          
          // Add shape marker point
          points.push({
            x: currentX,
            y: currentY,
            z: currentZ,
            feedrate: currentF,
            type: 'G13.3',
            isShape: true,
            shapeType: 'extrude',
            shapeParams: {
              width,
              height,
              length
            }
          });
          
          // Calculate direction vector
          const dx = newX - currentX;
          const dy = newY - currentY;
          const distance = Math.sqrt(dx*dx + dy*dy);
          
          if (distance > 0) {
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Perpendicular vector
            const px = -ny;
            const py = nx;
            
            // Generate rectangle corners at both ends
            const corners = [
              // Start point corners
              {
                x: currentX + (px * width/2),
                y: currentY + (py * width/2),
                z: currentZ
              },
              {
                x: currentX - (px * width/2),
                y: currentY - (py * width/2),
                z: currentZ
              },
              // End point corners
              {
                x: newX - (px * width/2),
                y: newY - (py * width/2),
                z: newZ
              },
              {
                x: newX + (px * width/2),
                y: newY + (py * width/2),
                z: newZ
              }
            ];
            
            // Add points to form the rectangle
            for (const corner of corners) {
              points.push({
                x: corner.x,
                y: corner.y,
                z: corner.z,
                feedrate: currentF,
                type: 'G13.3',
                isShape: true
              });
            }
            
            // Add point to close the shape
            points.push({
              x: corners[0].x,
              y: corners[0].y,
              z: corners[0].z,
              feedrate: currentF,
              type: 'G13.3',
              isShape: true
            });
          }
        }
      }
      
      // Update current position for next command
      currentX = newX;
      currentY = newY;
      currentZ = newZ;
    });
    
    return points;
  }, []);

  // Update toolpath when gcode changes
  useEffect(() => {
    if (!gcode || !sceneRef.current) return;
    
    // Parse G-code with the enhanced parser
    const points = parseGCode(gcode, arcResolution);
    toolpathPointsRef.current = points;
    
    // Remove existing toolpath
    if (toolpathRef.current) {
      sceneRef.current.remove(toolpathRef.current);
      toolpathRef.current = null;
    }
    
    // Remove any existing debug point markers
    const existingMarkers = sceneRef.current.getObjectByName('PointMarkers');
    if (existingMarkers) {
      sceneRef.current.remove(existingMarkers);
    }
    
    // Create toolpath visualization
    if (points.length > 1) {
      // Determine if we should use the enhanced visualization
      const hasAdvancedFeatures = points.some(p => p.isArc || p.isShape);
      
      if (hasAdvancedFeatures) {
        // Create enhanced visualization
        const toolpathGroup = createEnhancedToolpathVisualization(
          points,
          sceneRef.current,
          {
            showArcs,
            showShapes
          }
        );
        
        if (toolpathGroup) {
          toolpathGroup.visible = showToolpath;
          toolpathRef.current = toolpathGroup;
        }
      } else {
        // Create simple visualization (for compatibility)
        const positions: number[] = [];
        const colors: number[] = [];
        
        points.forEach(point => {
          positions.push(point.x, point.y, point.z);
          
          // Color based on move type
          if (point.isRapid) {
            colors.push(1, 0, 0); // Red for rapid moves
          } else {
            colors.push(0, 1, 0); // Green for cutting moves
          }
        });
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          linewidth: 2
        });
        
        const line = new THREE.Line(geometry, material);
        line.visible = showToolpath;
        sceneRef.current.add(line);
        toolpathRef.current = line;
      }
      
      // Add debug point markers if enabled
      if (showDebugPoints) {
        const markersGroup = createDebugPointMarkers(points);
        markersGroup.visible = showToolpath;
        sceneRef.current.add(markersGroup);
      }
    }
    
    // Reset current position
    setCurrentPointIndex(0);
    
    // Set tool at initial position
    if (toolRef.current && points.length > 0) {
      const firstPoint = points[0];
      toolRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z );
    }
  }, [gcode, parseGCode, showToolpath, showDebugPoints, showArcs, showShapes, arcResolution]);
  useEffect(() => {
    if (!gcode || !sceneRef.current) return;

    // Analizza il G-code per estrarre i punti del percorso
    const toolPathPoints: ToolpathPoint[] = [];
    const lines = gcode.split('\n');
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(';')) return; // Salta commenti e linee vuote
      
      const isG0 = trimmedLine.includes('G0') || trimmedLine.includes('G00');
      const isG1 = trimmedLine.includes('G1') || trimmedLine.includes('G01');
      
      if (isG0 || isG1) {
        // Estrai le coordinate
        const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
        const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
        const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);
        
        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        if (zMatch) currentZ = parseFloat(zMatch[1]);
        
        toolPathPoints.push({ x: currentX, y: currentY, z: currentZ });
      }
    });
    
    // Salva i punti per l'animazione
    const points = parseGCode(gcode, arcResolution);
    
    // Rimuovi il percorso utensile esistente, se presente
    if (toolpathRef.current) {
      sceneRef.current.remove(toolpathRef.current);
      toolpathRef.current = null;
    }
    
    // Crea un nuovo percorso utensile
    if (toolPathPoints.length > 1) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(toolPathPoints.length * 3);
      
      toolPathPoints.forEach((point, i) => {
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
      });
      
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      const material = new THREE.LineBasicMaterial({ 
        color: 0x00ff00,
        linewidth: 2
      });
      
      const line = new THREE.Line(geometry, material);
      sceneRef.current.add(line);
      toolpathRef.current = line;
      
      // Resetta la posizione del tool all'inizio del percorso
      if (toolRef.current && toolPathPoints.length > 0) {
        const startPoint = toolPathPoints[0];
        toolRef.current.position.set(startPoint.x, startPoint.y, startPoint.z);
      }
    }
    
    setCurrentLine(0);
  }, [gcode]);

  // Effetto per gestire l'animazione del percorso utensile
  

  useEffect(() => {
    if (!isSimulating || !toolRef.current || toolpathPointsRef.current.length <= 1) return;
    
    let startTime = 0;
    const animationDuration = (point: ToolpathPoint) => {
      // G0 (rapid) movements remain fast - 1 second
      if (point.type === 'G0' || point.type === 'rapid' || point.isRapid) {
        return 5000;
      }
      if( THREE.Points ){return 5000}
      // G1 (cutting) movements are extremely slow - 10 seconds
      else if (point.type === 'G1' || point.type === 'cutting') {
        return 10000;
      }
      
      // Default duration for other movements
      return 5000;
    };
    
    const animateToolPath = (timestamp: number) => {
      if (!toolpathPointsRef.current || currentLine >= toolpathPointsRef.current.length - 1) {
        // We've reached the end of the toolpath - stop the simulation
        
        // Reset tool to starting position
        if (toolRef.current && toolpathPointsRef.current && toolpathPointsRef.current.length > 0) {
          const firstPoint = toolpathPointsRef.current[0];
          toolRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z);
        }
        
        // Reset current line index
        setCurrentLine(0);
        
        // Call the completion callback
        if (onSimulationComplete) {
          onSimulationComplete();
        }
        return;
      }
      
      // Ensure we have valid points to work with
      const startPoint = toolpathPointsRef.current[currentLine];
      const endPoint = toolpathPointsRef.current[currentLine + 1];
      
      if (!startPoint || !endPoint) return;
      
      if (!startTime) startTime = timestamp;
      
      // Determine animation duration based on the move type
      const moveDuration = animationDuration(startPoint);
      const elapsedTime = timestamp - startTime;
      const progress = Math.min(elapsedTime / moveDuration, 1);
      
      if (toolRef.current) {
        // Interpolate position between start and end points
        toolRef.current.position.set(
          startPoint.x + (endPoint.x - startPoint.x) * progress,
          startPoint.y + (endPoint.y - startPoint.y) * progress,
          startPoint.z + (endPoint.z - startPoint.z) * progress
        );
        
        // Change tool color or add effect based on movement type
        if (startPoint.type === 'G1' || startPoint.type === 'cutting') {
          // Add intense visual feedback for cutting operations
          if (toolRef.current.children.length > 0) {
            const cuttingPart = toolRef.current.children[0];
            if (cuttingPart && cuttingPart instanceof THREE.Mesh) {
              const material = cuttingPart.material as THREE.MeshStandardMaterial;
              if (material) {
                material.emissive = new THREE.Color(0x00ff00);
                material.emissiveIntensity = 0.8;
              }
            }
          }
        } else {
          // Reset visual feedback for rapid movements
          if (toolRef.current.children.length > 0) {
            const cuttingPart = toolRef.current.children[0];
            if (cuttingPart && cuttingPart instanceof THREE.Mesh) {
              const material = cuttingPart.material as THREE.MeshStandardMaterial;
              if (material) {
                material.emissive = new THREE.Color(0x000000);
                material.emissiveIntensity = 0;
              }
            }
          }
        }
      }
      
      // Move to next line segment when current animation completes
      if (progress === 1) {
        if (currentLine < toolpathPointsRef.current.length - 2) {
          setCurrentLine(prev => prev + 1);
          startTime = timestamp;
        } else {
          // We've reached the end of the toolpath - stop the simulation
          
          // Reset tool to starting position
          if (toolRef.current && toolpathPointsRef.current && toolpathPointsRef.current.length > 0) {
            const firstPoint = toolpathPointsRef.current[0];
            toolRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z);
          }
          
          // Reset current line index
          setCurrentLine(0);
          
          // Call the completion callback
          if (onSimulationComplete) {
            onSimulationComplete();
          }
          return;
        }
      }
      
      if (isSimulating) {
        applyLOD(); // Apply level of detail optimizations
        requestAnimationFrame(animateToolPath);
      }
    };
    
    const animationId = requestAnimationFrame(animateToolPath);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isSimulating, currentLine, onSimulationComplete]);

  // Create the enhanced toolpath visualization
  const createEnhancedToolpathVisualization = (
    points: ToolpathPoint[],
    scene: THREE.Scene,
    options: {
      showArcs?: boolean,
      showShapes?: boolean
    } = {}
  ): THREE.Object3D | null => {
    const { showArcs = true, showShapes = true } = options;
    
    // Create the main group to hold all elements
    const toolpathGroup = new THREE.Group();
    toolpathGroup.name = 'ToolpathVisualization';
    
    // Create separate groups for different types of moves
    const rapidGroup = new THREE.Group();
    rapidGroup.name = 'RapidMoves';
    
    const cutGroup = new THREE.Group();
    cutGroup.name = 'CuttingMoves';
    
    const arcGroup = new THREE.Group();
    arcGroup.name = 'ArcMoves';
    arcGroup.visible = showArcs;
    
    const shapeGroup = new THREE.Group();
    shapeGroup.name = 'Shapes';
    shapeGroup.visible = showShapes;
    
    // Process points to create visualization
    let linearPoints: THREE.Vector3[] = [];
    let rapidPoints: THREE.Vector3[] = [];
    let currentType = '';
    
    // Process points
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      
      // Handle arc start points
      if (point.isArc && point.arcCenter) {
        // Finalize current line if needed
        if (linearPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(linearPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0x00FF00, // Green for cutting
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          cutGroup.add(line);
          linearPoints = [];
        }
        
        if (rapidPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(rapidPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0xFF0000, // Red for rapid
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          rapidGroup.add(line);
          rapidPoints = [];
        }
        
        // Create arc visualization if enabled
        if (showArcs) {
          createArcVisualization(point, points, i, arcGroup);
        }
        
        // Skip ahead to end of arc
        while (i + 1 < points.length && 
               points[i + 1].isArc && 
               !points[i + 1].arcCenter) {
          i++;
        }
        
        continue;
      }
      
      // Handle shape start points
      if (point.isShape && point.shapeParams) {
        // Finalize current line if needed
        if (linearPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(linearPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0x00FF00, 
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          cutGroup.add(line);
          linearPoints = [];
        }
        
        if (rapidPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(rapidPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0xFF0000, 
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          rapidGroup.add(line);
          rapidPoints = [];
        }
        
        // Create shape visualization if enabled
        if (showShapes) {
          createShapeVisualization(point, points, i, shapeGroup);
        }
        
        // Skip ahead to the end of shape points
        while (i + 1 < points.length && 
               points[i + 1].isShape && 
               !points[i + 1].shapeParams) {
          i++;
        }
        
        continue;
      }
      
      // Handle normal points (rapid or cutting)
      if (point.isRapid) {
        // If we were in cutting mode, finalize the cutting line
        if (currentType === 'cut' && linearPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(linearPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0x00FF00, 
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          cutGroup.add(line);
          linearPoints = [];
        }
        
        rapidPoints.push(new THREE.Vector3(point.x, point.y, point.z));
        currentType = 'rapid';
      } else {
        // If we were in rapid mode, finalize the rapid line
        if (currentType === 'rapid' && rapidPoints.length > 1) {
          const geometry = new THREE.BufferGeometry().setFromPoints(rapidPoints);
          const material = new THREE.LineBasicMaterial({ 
            color: 0xFF0000, 
            linewidth: 2 
          });
          const line = new THREE.Line(geometry, material);
          rapidGroup.add(line);
          rapidPoints = [];
        }
        
        linearPoints.push(new THREE.Vector3(point.x, point.y, point.z));
        currentType = 'cut';
      }
    }
    
    // Add any remaining lines
    if (linearPoints.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(linearPoints);
      const material = new THREE.LineBasicMaterial({ 
        color: 0x00FF00, 
        linewidth: 2 
      });
      const line = new THREE.Line(geometry, material);
      cutGroup.add(line);
    }
    
    if (rapidPoints.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(rapidPoints);
      const material = new THREE.LineBasicMaterial({ 
        color: 0xFF00f0, 
        linewidth: 2 
      });
      const line = new THREE.Line(geometry, material);
      rapidGroup.add(line);
    }
    
    // Add all groups to main toolpath group
    toolpathGroup.add(rapidGroup);
    toolpathGroup.add(cutGroup);
    toolpathGroup.add(arcGroup);
    toolpathGroup.add(shapeGroup);
    
    return toolpathGroup;
  };

  // Create visualization for an arc
  const createArcVisualization = (
    arcPoint: ToolpathPoint,
    allPoints: ToolpathPoint[],
    startIndex: number,
    parent: THREE.Object3D
  ): THREE.Object3D | null => {
    if (!arcPoint.arcCenter || !arcPoint.isArc) return null;
    
    // Create points for the arc
    const arcPoints: THREE.Vector3[] = [];
    
    // Add start point
    arcPoints.push(new THREE.Vector3(arcPoint.x, arcPoint.y, arcPoint.z));
    
    // Find all related arc points
    let i = startIndex + 1;
    while (i < allPoints.length && 
           allPoints[i].isArc && 
           !allPoints[i].arcCenter) {
      const p = allPoints[i];
      arcPoints.push(new THREE.Vector3(p.x, p.y, p.z));
      i++;
    }
    
    // Create arc geometry and material
    const arcGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00AAFF, // Blue for arcs
      linewidth: 3 
    });
    
    // Create arc line
    const arcLine = new THREE.Line(arcGeometry, arcMaterial);
    arcLine.name = 'Arc';
    parent.add(arcLine);
    
    // Add center point visualization
    const centerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ 
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.7
      })
    );
    centerSphere.position.set(
      arcPoint.arcCenter.x,
      arcPoint.arcCenter.y,
      arcPoint.arcCenter.z || arcPoint.z
    );
    centerSphere.name = 'ArcCenter';
    
    // Add radius line
    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(
        arcPoint.arcCenter.x,
        arcPoint.arcCenter.y,
        arcPoint.arcCenter.z || arcPoint.z
      ),
      new THREE.Vector3(arcPoint.x, arcPoint.y, arcPoint.z)
    ]);
    
    const radiusMaterial = new THREE.LineBasicMaterial({ 
      color: 0xFFFF00,
      transparent: true,
      opacity: 0.5
    });
    
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
    radiusLine.name = 'ArcRadius';
    
    // Create a group for this arc and its helpers
    const arcGroup = new THREE.Group();
    arcGroup.name = 'ArcGroup';
    arcGroup.add(arcLine);
    arcGroup.add(centerSphere);
    arcGroup.add(radiusLine);
    
    parent.add(arcGroup);
    return arcGroup;
  };

  // Create visualization for shapes
  const createShapeVisualization = (
    shapePoint: ToolpathPoint,
    allPoints: ToolpathPoint[],
    startIndex: number,
    parent: THREE.Object3D
  ): THREE.Object3D | null => {
    if (!shapePoint.isShape || !shapePoint.shapeParams) return null;
    
    // Create a group for this shape
    const shapeGroup = new THREE.Group();
    shapeGroup.name = `Shape-${shapePoint.shapeType}`;
    
    // Handle different shape types
    switch (shapePoint.shapeType) {
      case 'circle':
        createCircleVisualization(shapePoint, shapeGroup);
        break;
      case 'sphere':
        createSphereVisualization(shapePoint, shapeGroup);
        break;
      case 'cone':
        createConeVisualization(shapePoint, shapeGroup);
        break;
      case 'extrude':
        createExtrudeVisualization(shapePoint, shapeGroup);
        break;
    }
    
    // Find all points for this shape
    const shapePoints: THREE.Vector3[] = [];
    let i = startIndex;
    
    // Add the first point
    shapePoints.push(new THREE.Vector3(shapePoint.x, shapePoint.y, shapePoint.z));
    
    // Add remaining points that belong to this shape
    i++;
    while (i < allPoints.length && 
           allPoints[i].isShape && 
           !allPoints[i].shapeParams) {
      const p = allPoints[i];
      shapePoints.push(new THREE.Vector3(p.x, p.y, p.z));
      i++;
    }
    
    // Create a line for the toolpath of this shape
    if (shapePoints.length > 1) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(shapePoints);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: getShapeColor(shapePoint.shapeType),
        linewidth: 2
      });
      const shapeLine = new THREE.Line(lineGeometry, lineMaterial);
      shapeLine.name = 'ShapePath';
      shapeGroup.add(shapeLine);
    }
    
    parent.add(shapeGroup);
    return shapeGroup;
  };

  // Get color for different shapes
  const getShapeColor = (shapeType?: string): number => {
    switch (shapeType) {
      case 'circle': return 0x00AAFF; // Blue
      case 'sphere': return 0xAA00FF; // Purple
      case 'cone': return 0xFF00AA; // Pink
      case 'extrude': return 0xFFAA00; // Orange
      default: return 0x00AAFF; // Default blue
    }
  };

  // Create circle visualization
  const createCircleVisualization = (circlePoint: ToolpathPoint, parent: THREE.Object3D) => {
    if (!circlePoint.shapeParams) return;
    
    const { radius, passes = 1 } = circlePoint.shapeParams;
    
    // Create mesh for circle shape
    const circleGeometry = new THREE.RingGeometry(
      radius * (1 - (passes - 1) / passes), // Inner radius
      radius, // Outer radius
      32 // Segments
    );
    
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00AAFF,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    
    const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
    circleMesh.rotation.x = Math.PI / 2; // Rotate to lay flat on XY plane
    circleMesh.position.set(circlePoint.x, circlePoint.y, circlePoint.z);
    circleMesh.name = 'CircleMesh';
    
    // Add circle outline
    const outlineGeometry = new THREE.EdgesGeometry(circleGeometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0x0066CC,
      linewidth: 2
    });
    
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.rotation.x = Math.PI / 2;
    outline.position.set(circlePoint.x, circlePoint.y, circlePoint.z);
    outline.name = 'CircleOutline';
    
    parent.add(circleMesh);
    parent.add(outline);
  };

  // Create sphere visualization
  const createSphereVisualization = (spherePoint: ToolpathPoint, parent: THREE.Object3D) => {
    if (!spherePoint.shapeParams) return;
    
    const { radius, height = radius } = spherePoint.shapeParams;
    
    // Create mesh for sphere shape
    const sphereGeometry = new THREE.SphereGeometry(
      radius,
      16, // Width segments
      16, // Height segments
      0, 
      Math.PI * 2,
      0,
      Math.min(Math.PI/2, Math.asin(height/radius))
    );
    
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xAA00FF,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereMesh.position.set(spherePoint.x, spherePoint.y, spherePoint.z);
    sphereMesh.name = 'SphereMesh';
    
    // Add outline circles for better visualization
    // Equator circle
    const equatorGeometry = new THREE.CircleGeometry(radius, 32);
    const equatorMaterial = new THREE.LineBasicMaterial({
      color: 0x6600CC,
      linewidth: 1
    });
    
    const equator = new THREE.Line(
      new THREE.EdgesGeometry(equatorGeometry),
      equatorMaterial
    );
    equator.rotation.x = Math.PI / 2;
    equator.position.set(spherePoint.x, spherePoint.y, spherePoint.z);
    equator.name = 'SphereEquator';
    
    parent.add(sphereMesh);
    parent.add(equator);
    
    // Add a few latitude circles
    const latitudes = 3;
    for (let i = 1; i <= latitudes; i++) {
      const latHeight = (i / latitudes) * height;
      if (latHeight >= radius) continue;
      
      const latRadius = Math.sqrt(radius*radius - latHeight*latHeight);
      const latGeometry = new THREE.CircleGeometry(latRadius, 32);
      const lat = new THREE.Line(
        new THREE.EdgesGeometry(latGeometry),
        equatorMaterial
      );
      lat.rotation.x = Math.PI / 2;
      lat.position.set(spherePoint.x, spherePoint.y, spherePoint.z - latHeight);
      lat.name = `SphereLatitude-${i}`;
      parent.add(lat);
    }
  };

  // Create cone visualization
  const createConeVisualization = (conePoint: ToolpathPoint, parent: THREE.Object3D) => {
    if (!conePoint.shapeParams) return;
    
    const { baseRadius, height } = conePoint.shapeParams;
    
    // Create mesh for cone shape
    const coneGeometry = new THREE.ConeGeometry(
      baseRadius,
      height,
      32, // Radial segments
      1, // Height segments
      true // Open ended at base
    );
    
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF00AA,
      transparent: true,
      opacity: 0.3,
      wireframe: true,
      side: THREE.DoubleSide
    });
    
    const coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);
    coneMesh.rotation.x = Math.PI; // Flip cone to point downward
    coneMesh.position.set(conePoint.x, conePoint.y, conePoint.z + height/2);
    coneMesh.name = 'ConeMesh';
    
    // Add base circle
    const baseGeometry = new THREE.CircleGeometry(baseRadius, 32);
    const baseMaterial = new THREE.LineBasicMaterial({
      color: 0xCC0066,
      linewidth: 2
    });
    
    const baseCircle = new THREE.Line(
      new THREE.EdgesGeometry(baseGeometry),
      baseMaterial
    );
    baseCircle.rotation.x = Math.PI / 2;
    baseCircle.position.set(conePoint.x, conePoint.y, conePoint.z);
    baseCircle.name = 'ConeBase';
    
    parent.add(coneMesh);
    parent.add(baseCircle);
  };

  // Create extrusion visualization
  const createExtrudeVisualization = (extrudePoint: ToolpathPoint, parent: THREE.Object3D) => {
    if (!extrudePoint.shapeParams) return;
    
    const { width, height, length } = extrudePoint.shapeParams;
    
    // Create a simple box representation
    const boxGeometry = new THREE.BoxGeometry(width, length, height);
    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFAA00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    boxMesh.position.set(extrudePoint.x, extrudePoint.y, extrudePoint.z - height/2);
    boxMesh.name = 'ExtrudeMesh';
    
    // Add wireframe outline
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0xCC6600,
      linewidth: 2
    });
    
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.set(extrudePoint.x, extrudePoint.y, extrudePoint.z - height/2);
    edges.name = 'ExtrudeEdges';
    
    parent.add(boxMesh);
    parent.add(edges);
  };

  // Create debug point markers for visualization
  const createDebugPointMarkers = (points: ToolpathPoint[]): THREE.Group => {
    const markersGroup = new THREE.Group();
    markersGroup.name = 'PointMarkers';
    
    points.forEach((point, index) => {
      // Create different shapes based on point type
      let markerGeometry: THREE.BufferGeometry;
      let markerColor: number;
      let markerSize = 1;
      
      if (point.isArc && point.arcCenter) {
        // Arc start points
        markerGeometry = new THREE.SphereGeometry(1.5, 8, 8);
        markerColor = 0x00AAFF; // Blue
      } else if (point.isArc) {
        // Arc intermediate points
        markerGeometry = new THREE.SphereGeometry(0.8, 8, 8);
        markerColor = 0x00AAFF; // Blue
      } else if (point.isShape && point.shapeParams) {
        // Shape start points
        markerGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        markerColor = getShapeColor(point.shapeType);
      } else if (point.isShape) {
        // Shape intermediate points
        markerGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        markerColor = getShapeColor(point.shapeType);
      } else if (point.isRapid) {
        // Rapid move points
        markerGeometry = new THREE.TetrahedronGeometry(1.2);
        markerColor = 0xFF0000; // Red
      } else {
        // Normal cutting move points
        markerGeometry = new THREE.SphereGeometry(0.6, 8, 8);
        markerColor = 0x00FF00; // Green
      }
      
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.7
      });
      
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(point.x, point.y, point.z);
      marker.userData.pointIndex = index;
      marker.userData.pointType = point.type;
      marker.userData.isArc = point.isArc;
      marker.userData.isShape = point.isShape;
      
      markersGroup.add(marker);
    });
    
    return markersGroup;
  };

  // Create/update tool when selected tool changes
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Remove existing tool
    if (toolRef.current) {
      sceneRef.current.remove(toolRef.current);
      toolRef.current = null;
    }
    
    // Create new tool if tool is selected
    if (selectedTool) {
      console.log("Creating tool for:", selectedTool);
      const toolMesh = createToolMesh(selectedTool);
      if (toolMesh) {
        // Imposta la visibilità dell'utensile sempre a true all'inizio
        toolMesh.visible = true;
        setShowTool(true);
        
        // Posiziona l'utensile in posizione più visibile se non ci sono punti del percorso
        if (toolpathPointsRef.current.length > 0) {
          const firstPoint = toolpathPointsRef.current[0];
          toolMesh.position.set(firstPoint.x, firstPoint.y, firstPoint.z + 10);
        } else {
          // Posiziona in una posizione centrale visibile se non ci sono punti
          toolMesh.position.set(0, 0, 50);
        }
        
        const toolData = predefinedTools.find(t => t.name === selectedTool);
        if (toolData) {
          // Applica materiale realistico in base al tipo di utensile
          applyRealisticMaterial(toolMesh, toolData.material || 'carbide');
        }
        
        // Aggiungi l'utensile alla scena
        sceneRef.current.add(toolMesh);
        toolRef.current = toolMesh;
      }
    } else {
      // Create a default tool if none is selected
      const defaultTool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 5, 32), 
        new THREE.MeshStandardMaterial({ 
          color: 0xFF4500,  // Colore arancione brillante
          emissive: 0xFF0000,
          emissiveIntensity: 0.5
        })
      );
      defaultTool.rotation.x = Math.PI / 2;
      
      if (toolpathPointsRef.current.length > 0) {
        const firstPoint = toolpathPointsRef.current[0];
        defaultTool.position.set(firstPoint.x, firstPoint.y, firstPoint.z + 50);
      } else {
        defaultTool.position.set(0, 0, 50);
      }
      
      // Rendi sempre visibile all'inizio
      defaultTool.visible = true;
      setShowTool(true);
      
      // Usa una scala coerente
      defaultTool.scale.set(1.5, 1.5, 1.5);
      
      sceneRef.current.add(defaultTool);
      toolRef.current = defaultTool;
    }
  }, [selectedTool, createToolMesh]);
  
  // Create/update workpiece when workpiece visibility changes
  useEffect(() => {
    if (!sceneRef.current || !workpiece) return;
    
    // Remove existing workpiece
    if (workpieceRef.current) {
      sceneRef.current.remove(workpieceRef.current);
      workpieceRef.current = null;
    }
    
    // Create workpiece if visible
    if (isWorkpieceVisible) {
      // Determine material color based on workpiece material type
      let materialColor = 0xAAAAAA; // Default color
      
      switch (workpiece.material) {
        case 'aluminum':
          materialColor = 0xD4D4D4;
          break;
        case 'steel':
          materialColor = 0x888888;
          break;
        case 'wood':
          materialColor = 0xA0522D;
          break;
        case 'plastic':
          materialColor = 0x1E90FF;
          break;
        case 'brass':
          materialColor = 0xDAA520;
          break;
      }
      
      // Create workpiece geometry
      const geometry = new THREE.BoxGeometry(
        workpiece.width || 100,
        workpiece.height || 100,
        workpiece.depth || 20
      );    
      
      // Create material
      const material = new THREE.MeshStandardMaterial({
        color: materialColor,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      
      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      
      // Add wireframe outline
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.4
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      mesh.add(wireframe);
      
      // Position the workpiece
      const { originOffset } = useCADStore.getState();
      mesh.position.set(
        originOffset.x,
        originOffset.y,
        originOffset.z
      );
      
      // Add to scene
      sceneRef.current.add(mesh);
      workpieceRef.current = mesh;
    }
  }, [isWorkpieceVisible, workpiece]);
  
  // Effect to start/stop simulation based on isSimulating prop
  useEffect(() => {
    if (isSimulating && !isPlaying) {
      setIsPlaying(true);
    } else if (!isSimulating && isPlaying) {
      setIsPlaying(false);
    }
  }, [isSimulating, isPlaying]);
  
  // Play/pause simulation
  const playToolpath = useCallback(() => {
    setIsPlaying(true);
  }, []);
  
  const pauseToolpath = useCallback(() => {
    setIsPlaying(false);
  }, []);
  const toggleSimulation = () => {
    setIsPlaying(!isSimulating);
  };
  const stopSimulation = () => {
    if (isSimulating) {
      setIsPlaying(false);
    }
    }

  
  const stopToolpath = useCallback(() => {
    setIsPlaying(false);
    setCurrentPointIndex(0);
    
    // Reset tool position
    if (toolRef.current && toolpathPointsRef.current.length > 0) {
      const firstPoint = toolpathPointsRef.current[0];
      toolRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z);
    }
  }, []);
  
  const stepForward = useCallback(() => {
    if (toolpathPointsRef.current.length === 0) return;
    
    const newIndex = Math.min(currentPointIndex + 1, toolpathPointsRef.current.length - 1);
    setCurrentPointIndex(newIndex);
    
    // Update tool position
    if (toolRef.current) {
      const point = toolpathPointsRef.current[newIndex];
      toolRef.current.position.set(point.x, point.y, point.z);
    }
  }, [currentPointIndex]);
  
  const stepBackward = useCallback(() => {
    if (toolpathPointsRef.current.length === 0) return;
    
    const newIndex = Math.max(currentPointIndex - 1, 0);
    setCurrentPointIndex(newIndex);
    
    // Update tool position
    if (toolRef.current) {
      const point = toolpathPointsRef.current[newIndex];
      toolRef.current.position.set(point.x, point.y, point.z);
    }
  }, [currentPointIndex]);
  
  // Calculate progress percentage
  const getProgress = useCallback(() => {
    if (toolpathPointsRef.current.length === 0) return 0;
    
    return (currentPointIndex / (toolpathPointsRef.current.length - 1)) * 100;
  }, [currentPointIndex]);
  
  // Jump to specific progress percentage
  const jumpToProgress = useCallback((percent: number) => {
    if (toolpathPointsRef.current.length === 0) return;
    
    const newIndex = Math.floor((percent / 100) * (toolpathPointsRef.current.length - 1));
    setCurrentPointIndex(newIndex);
    
    // Update tool position
    if (toolRef.current) {
      const point = toolpathPointsRef.current[newIndex];
      toolRef.current.position.set(point.x, point.y, point.z);
    }
  }, []);
  
  // Get current point info
  const getCurrentPointInfo = useCallback(() => {
    if (toolpathPointsRef.current.length === 0 || currentPointIndex >= toolpathPointsRef.current.length) {
      return { x: 0, y: 0, z: 0, feedrate: 0, type: '' };
    }
    
    return toolpathPointsRef.current[currentPointIndex];
  }, [currentPointIndex]);
  
  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      } else if ((containerRef.current as any)?.msRequestFullscreen) {
        (containerRef.current as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);
  
  // Reset view
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    
    // Position camera
    cameraRef.current.position.set(200, 200, 200);
    cameraRef.current.lookAt(0, 0, 0);
    
    // Reset controls
    controlsRef.current.reset();
  }, []);
  
  // Take screenshot
  const takeScreenshot = useCallback(() => {
    if (!rendererRef.current) return;
    
    // Temporarily restore full detail for better quality
    const restore = temporarilyRestoreFullDetail && temporarilyRestoreFullDetail();
    
    // Render the scene at high quality
    if (rendererRef.current && cameraRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
    // Get image data
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    
    // Create download link
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `toolpath-screenshot-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Restore normal detail
    if (restore) restore();
  }, [temporarilyRestoreFullDetail]);
  // Toggle panel
  const togglePanel = (panel: 'info' | 'settings' | 'tools') => {
    if (activePanel === panel && isPanelOpen) {
      setIsPanelOpen(false);
    } else {
      setActivePanel(panel);
      setIsPanelOpen(true);
    }
  };

  const onSelectTool = useCallback((toolName: string) => {
    // Aggiorna lo stato interno
    setInternalSelectedTool(toolName);
    // If selectedTool is controlled externally, call the onToolChange callback
    if (onToolChange) {
      onToolChange(toolName);
    }
    
    // Create rotation animation
    if (toolRef.current) {
      // Ruota l'utensile di 360 gradi per mostrare che è stato selezionato
      const startRotation = toolRef.current.rotation.y;
      const endRotation = startRotation + Math.PI * 2;
      
      let startTime: number | null = null;
      const animateDuration = 1000; // ms
      
      const animateToolSelection = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / animateDuration, 1);
        
        if (toolRef.current) {
          toolRef.current.rotation.y = startRotation + (endRotation - startRotation) * progress;
        }
        
        if (progress < 1) {
          requestAnimationFrame(animateToolSelection);
        }
      };
      
      requestAnimationFrame(animateToolSelection);
    }
  }, [onToolChange]);

  // Effetto per sincronizzare lo stato interno con la prop selectedTool
  useEffect(() => {
    if (selectedTool !== internalSelectedTool) {
      setInternalSelectedTool(selectedTool);
    }
  }, [selectedTool]);
  
  // Get current point
  const currentPoint = getCurrentPointInfo();
  
  // Funzioni specifiche per visualizzare tutti i toolpath points
  
  // Visualizza tutti i punti nel percorso
  const showAllToolpathPoints = useCallback(() => {
    if (!sceneRef.current || toolpathPointsRef.current.length === 0) return;
    
    // Rimuovi eventuali marker esistenti
    const existingMarkers = sceneRef.current.getObjectByName('AllPointsMarkers');
    if (existingMarkers) {
      sceneRef.current.remove(existingMarkers);
    }
    
    // Crea un nuovo gruppo per contenere tutti i marker dei punti
    const allPointsGroup = new THREE.Group();
    allPointsGroup.name = 'AllPointsMarkers';
    
    // Aggiungi un marker per ogni punto
    toolpathPointsRef.current.forEach((point, index) => {
      // Crea una sfera per rappresentare il punto
      const markerGeometry = new THREE.SphereGeometry(0.7, 8, 8);
      
      // Colore basato sul tipo di punto
      let markerColor: number;
      if (point.isRapid || point.type === 'G0') {
        markerColor = 0xFF0000; // Rosso per movimenti rapidi
      } else if (point.isArc) {
        markerColor = 0x0000FF; // Blu per archi
      } else if (point.isFixedCycle) {
        markerColor = 0xFF00FF; // Magenta per cicli fissi
      } else if (point.isShape) {
        markerColor = 0x00FFFF; // Ciano per forme
      } else {
        markerColor = 0x00FF00; // Verde per tagli normali
      }
      
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.8
      });
      
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(point.x, point.y, point.z);
      
      // Aggiungi metadati al marker per identificazione
      marker.userData = {
        pointIndex: index,
        pointType: point.type || 'unknown',
        isRapid: point.isRapid,
        isArc: point.isArc,
        isFixedCycle: point.isFixedCycle,
        isShape: point.isShape,
        coordinates: { x: point.x, y: point.y, z: point.z },
        feedrate: point.feedrate
      };
      
      // Aggiungi etichetta con il numero del punto
      if (showPointLabels) {
        addPointLabel(marker, index, point);
      }
      
      allPointsGroup.add(marker);
    });
    
    // Aggiungi il gruppo alla scena
    sceneRef.current.add(allPointsGroup);
    
    // Aggiorna la visualizzazione
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [showPointLabels]);
  
  // Stato per mostrare/nascondere le etichette dei punti

  
  // Aggiunge un'etichetta a un punto
  const addPointLabel = (marker: THREE.Mesh, index: number, point: ToolpathPoint) => {
    // Crea un canvas per l'etichetta
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Imposta dimensioni e stile
    canvas.width = 64;
    canvas.height = 32;
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(index.toString(), canvas.width / 2, canvas.height / 2);
    
    // Crea texture e sprite
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(5, 2.5, 1);
    sprite.position.set(0, 3, 0); // Posiziona sopra il marker
    
    // Aggiungi lo sprite al marker
    marker.add(sprite);
  };
  
  // Toggle per mostrare/nascondere tutti i punti
  const [showAllPoints, setShowAllPoints] = useState(false);
  
  // Effetto per gestire la visualizzazione di tutti i punti
  useEffect(() => {
    if (showAllPoints) {
      showAllToolpathPoints();
    } else {
      // Rimuovi i marker quando non devono essere visualizzati
      if (sceneRef.current) {
        const markers = sceneRef.current.getObjectByName('AllPointsMarkers');
        if (markers) {
          sceneRef.current.remove(markers);
        }
      }
    }
  }, [showAllPoints, showAllToolpathPoints, toolpathPointsRef.current, showPointLabels]);
  
  // Seleziona un punto specifico per l'analisi
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(-1);
  
  // Focus su un punto specifico
  const focusOnPoint = useCallback((index: number) => {
    if (index < 0 || index >= toolpathPointsRef.current.length || !toolpathPointsRef.current[index]) return;
    
    setSelectedPointIndex(index);
    
    const point = toolpathPointsRef.current[index];
    focusCameraOnPosition({
      x: point.x,
      y: point.y,
      z: point.z
    });
    
    // Mostra informazioni sul punto
    console.log(`Point ${index}:`, point);
  }, [focusCameraOnPosition]);

  return (
    <div 
      className="relative w-full h-full bg-gray-900 overflow-hidden"
      style={{ width, height }}
    >
      {/* Main container */}
      <div 
        ref={containerRef}
        className="absolute top-0 left-0 w-full h-full"
        tabIndex={0} // Make div focusable for keyboard events
      />
      
      {/* View Cube */}
      <div className="absolute bottom-10 right-10 z-10">
        <EnhancedViewCube 
          currentView={currentView}
          onViewChange={setCurrentView}
          camera={cameraRef.current}
          controls={controlsRef.current}
        />
      </div>
      
      {/* Top Toolbar */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 bg-gray-800 bg-opacity-75 text-white p-2 flex justify-between items-center z-10">
          <div className="flex items-center space-x-2">
            {/* Menu button to toggle controls */}
            <button 
              className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
              onClick={() => setShowControls(false)}
              title="Hide Controls"
            >
              <Menu size={18} />
            </button>
            
            <div className="h-5 border-l border-gray-600 mx-1" />
            
            {/* View buttons */}
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                currentView === 'perspective' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => setCurrentView('perspective')}
              title="Perspective View"
            >
              <Globe size={18} />
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                currentView === 'top' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => setCurrentView('top')}
              title="Top View"
            >
              T
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                currentView === 'front' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => setCurrentView('front')}
              title="Front View"
            >
              F
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                currentView === 'right' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => setCurrentView('right')}
              title="Right View"
            >
              R
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                currentView === 'isometric' ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
              onClick={() => setCurrentView('isometric')}
              title="Isometric View"
            >
              ISO
            </button>
            
            <div className="h-5 border-l border-gray-600 mx-1" />
            
            {/* Display options */}
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showGrid ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => setShowGrid(!showGrid)}
              title={showGrid ? "Hide Grid" : "Show Grid"}
            >
              <Grid size={18} />
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showAxes ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => setShowAxes(!showAxes)}
              title={showAxes ? "Hide Axes" : "Show Axes"}
            >
              <span className="font-mono text-sm">XYZ</span>
            </button>
          </div>
          
          {/* View mode selection */}
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <button 
                className={`p-1.5 rounded-md focus:outline-none hover:bg-gray-700`}
                title="View Mode"
              >
                {viewMode === 'realistic' && <Sun size={18} />}
                {viewMode === 'shaded' && <Globe size={18} />}
                {viewMode === 'wireframe' && <Square size={18} />}
                {viewMode === 'xray' && <Eye size={18} />}
              </button>
              
              <div className="absolute hidden group-hover:block right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 py-1">
                <button 
                  className={`block w-full text-left px-4 py-1 text-sm ${
                    viewMode === 'realistic' ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                  onClick={() => setViewMode('realistic')}
                >
                  Realistic
                </button>
                <button 
                  className={`block w-full text-left px-4 py-1 text-sm ${
                    viewMode === 'shaded' ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                  onClick={() => setViewMode('shaded')}
                >
                  Shaded
                </button>
                <button 
                  className={`block w-full text-left px-4 py-1 text-sm ${
                    viewMode === 'wireframe' ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                  onClick={() => setViewMode('wireframe')}
                >
                  Wireframe
                </button>
                <button 
                  className={`block w-full text-left px-4 py-1 text-sm ${
                    viewMode === 'xray' ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                  onClick={() => setViewMode('xray')}
                >
                  X-Ray
                </button>
              </div>
            </div>
            
            <div className="h-5 border-l border-gray-600 mx-1" />
            
            {/* Element toggle buttons */}
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showTool ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => {
                setShowTool(!showTool);
                // Update tool visibility immediately
                if (toolRef.current) {
                  toolRef.current.visible = !showTool;
                  console.log("Tool visibility toggled to:", !showTool);
                }
              }}
              title={showTool ? "Hide Tool" : "Show Tool"}
            >
              <Tool size={18} />
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                isWorkpieceVisible ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => setIsWorkpieceVisible(!isWorkpieceVisible)}
              title={isWorkpieceVisible ? "Hide Workpiece" : "Show Workpiece"}
            >
              <Box size={18} />
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showToolpath ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => setShowToolpath(!showToolpath)}
              title={showToolpath ? "Hide Toolpath" : "Show Toolpath"}
            >
              <Layers size={18} />
            </button>
            
            {/* Button to show all points */}
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showAllPoints ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
              }`}
              onClick={() => setShowAllPoints(!showAllPoints)}
              title={showAllPoints ? "Hide All Points" : "Show All Points"}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="8" cy="8" r="3"></circle>
                <circle cx="16" cy="16" r="3"></circle>
                <line x1="3" y1="3" x2="21" y2="21"></line>
              </svg>
            </button>
  
            {/* Only show this when all points are visible */}
            {showAllPoints && (
              <button 
                className={`p-1.5 rounded-md focus:outline-none ${
                  showPointLabels ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
                }`}
                onClick={() => setShowPointLabels(!showPointLabels)}
                title={showPointLabels ? "Hide Point Labels" : "Show Point Labels"}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <text x="8" y="15" style={{ font: '9px sans-serif', fill: 'currentColor' }}>123</text>
                </svg>
              </button>
            )}
  
  <button 
    className={`px-3 py-1 rounded text-sm ${
      showFixedCyclesInfo ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
    }`}
    onClick={() => setShowFixedCyclesInfo(!showFixedCyclesInfo)}
    title={showFixedCyclesInfo ? 'Nascondi pannello cicli fissi' : 'Mostra pannello cicli fissi'}
  >
    Cicli Fissi
  </button>
  
  <button 
    className="px-3 py-1 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300"
    onClick={() => {
      // Resetta la selezione e la vista
      setSelectedCycleIndex(-1);
      
      // Ripristina la vista della camera
      if (controlsRef.current) {
        controlsRef.current.reset();
      }
    }}
    title="Reimposta vista"
  >
    Reset Vista
  </button>
  <button 
  className="ml-2 px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
  onClick={() => {
    setSelectedCycleIndex(0);
    setShowCycleDetails(true);
  }}
>
  Dettagli
</button>
            <div className="h-5 border-l border-gray-600 mx-1" />
            
            {/* Utility buttons */}
            <button 
              className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <Maximize2 size={18} />
            </button>
            
            <button 
              className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
              onClick={takeScreenshot}
              title="Take Screenshot"
            >
              <Download size={18} />
            </button>
            
            <button 
              className={`p-1.5 rounded-md focus:outline-none ${
                showInfo ? 'text-blue-400' : 'text-gray-400'
              } hover:bg-gray-700`}
              onClick={() => setShowInfo(!showInfo)}
              title={showInfo ? "Hide Info" : "Show Info"}
            >
              <Info size={18} />
            </button>
          </div>
        </div>
      )}
      
      {/* Bottom playback controls */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-800 bg-opacity-75 text-white p-2 z-10">
          <div className="w-full space-y-2">
            {/* Progress bar */}
            <div 
              className="h-2 bg-gray-700 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const percent = (offsetX / rect.width) * 100;
                jumpToProgress(percent);
              }}
            >
              <div 
                className="h-full bg-blue-500 rounded-full relative"
                style={{ width: `${getProgress()}%` }}
              >
                <div 
                  className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full cursor-pointer"
                ></div>
              </div>
            </div>
            
            {/* Controls and info */}
            <div className="flex items-center justify-between">
              {/* Time / progress display */}
              <div className="text-xs font-mono">
                {currentPointIndex + 1} / {toolpathPointsRef.current.length || 0}
              </div>
              
              {/* Control buttons */}
              <div className="flex items-center space-x-2">
                <button
                  className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
                  onClick={stopToolpath}
                  title="Go to Start"
                >
                  <SkipBack size={16} />
                </button>
                
                <button
                  className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
                  onClick={stepBackward}
                  title="Step Backward"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <button
                  className="p-2 bg-blue-600 rounded-full hover:bg-blue-700 focus:outline-none"
                  onClick={isPlaying ? stopSimulation : toggleSimulation}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                
                <button
                  className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
                  onClick={stepForward}
                  title="Step Forward"
                >
                  <ChevronRight size={16} />
                </button>
                
                {/* Playback speed */}
                <div className="relative group">
                  <button
                    className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none flex items-center"
                    title="Playback Speed"
                  >
                    <FastForward size={16} />
                    <span className="ml-1 text-xs">{playbackSpeed}×</span>
                  </button>
                  
                  <div className="absolute hidden group-hover:block right-0 bottom-full mb-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 py-1">
                    {[0.25, 0.5, 1, 2, 4, 8].map((speed) => (
                      <button
                        key={speed}
                        className={`block w-full text-left px-4 py-1 text-xs ${
                          playbackSpeed === speed ? 'bg-blue-600' : 'hover:bg-gray-700'
                        }`}
                        onClick={() => setPlaybackSpeed(speed)}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Remaining time */}
              <div className="text-xs font-mono">
                {statistics.timeRemaining}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Information overlay */}
      {showInfo && (
        <div className="absolute top-16 left-4 bg-gray-800 bg-opacity-75 text-white p-3 rounded-md z-10 max-w-xs text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="text-gray-400">Position:</div>
            <div className="font-mono">
              X:{currentPoint.x.toFixed(3)} Y:{currentPoint.y.toFixed(3)} Z:{currentPoint.z.toFixed(3)}
            </div>
            
            <div className="text-gray-400">Current Line:</div>
            <div className="font-mono">{currentPointIndex + 1} / {toolpathPointsRef.current.length || 0}</div>
            
            <div className="text-gray-400">Feedrate:</div>
            <div className="font-mono">{currentPoint.feedrate || 0} mm/min</div>
            
            <div className="text-gray-400">Move Type:</div>
            <div className="font-mono">{currentPoint.type || 'N/A'}</div>
            
            {currentPoint.isArc && (
              <>
                <div className="text-gray-400">Arc Type:</div>
                <div className="font-mono">
                  {currentPoint.isClockwise ? 'Clockwise' : 'Counter-Clockwise'}
                </div>
              </>
            )}
            
            {currentPoint.isShape && (
              <>
                <div className="text-gray-400">Shape:</div>
                <div className="font-mono capitalize">{currentPoint.shapeType || 'Unknown'}</div>
              </>
            )}
            
            {selectedTool && (
              <>
                <div className="text-gray-400">Tool:</div>
                <div className="font-mono">{selectedTool}</div>
              </>
            )}
          </div>

          {/* Solo se è stato selezionato un punto */}
          {selectedPointIndex >= 0 && selectedPointIndex < toolpathPointsRef.current.length && (
            <div className="mt-4 border-t border-gray-600 pt-2">
              <div className="font-medium mb-1">Selected Point #{selectedPointIndex}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="text-gray-400">X:</div>
                <div className="font-mono">{toolpathPointsRef.current[selectedPointIndex].x.toFixed(3)}</div>
                
                <div className="text-gray-400">Y:</div>
                <div className="font-mono">{toolpathPointsRef.current[selectedPointIndex].y.toFixed(3)}</div>
                
                <div className="text-gray-400">Z:</div>
                <div className="font-mono">{toolpathPointsRef.current[selectedPointIndex].z.toFixed(3)}</div>
                
                <div className="text-gray-400">Type:</div>
                <div className="font-mono">{toolpathPointsRef.current[selectedPointIndex].type || 'N/A'}</div>
                
                {toolpathPointsRef.current[selectedPointIndex].feedrate && (
                  <>
                    <div className="text-gray-400">Feedrate:</div>
                    <div className="font-mono">{toolpathPointsRef.current[selectedPointIndex].feedrate} mm/min</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Right side panel */}
      {isPanelOpen && (
        <div className="absolute top-16 right-4 w-72 bg-gray-800 bg-opacity-90 text-white p-3 rounded-md z-10 max-h-[calc(100%-200px)] overflow-y-auto">
          {/* Info panel */}
          {activePanel === 'info' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Toolpath Information</h3>
                <button 
                  className="p-1 rounded-md hover:bg-gray-700"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Toolpath stats */}
                <div>
                  <h4 className="text-sm font-medium text-blue-400 mb-2">Toolpath Overview</h4>
                  <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Total Points:</span>
                      <span className="font-medium">{toolpathPointsRef.current.length}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-300">Arc Moves:</span>
                      <span className="font-medium">
                        {toolpathPointsRef.current.filter(p => p.isArc).length}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-300">Shapes:</span>
                      <span className="font-medium">
                        {toolpathPointsRef.current.filter(p => p.isShape).length}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-gray-300">Fixed Cycles:</span>
                      <span className="font-medium">
                        {toolpathPointsRef.current.filter(p => p.isFixedCycle).length}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-300">Rapid Moves:</span>
                      <span className="font-medium">
                        {toolpathPointsRef.current.filter(p => p.isRapid).length}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-300">Cutting Moves:</span>
                      <span className="font-medium">
                        {toolpathPointsRef.current.filter(p => !p.isRapid && !p.isArc && !p.isShape && !p.isFixedCycle).length}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Tool info */}
                {selectedTool ? (
                  <div className="bg-gray-700 p-2 rounded">
                    <div className="text-sm font-medium mb-1">{selectedTool}</div>
                    {/* Mostra dettagli specifici dell'utensile */}
                    {predefinedTools.find(t => t.name === selectedTool) && (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="text-gray-400">Type:</div>
                        <div>{predefinedTools.find(t => t.name === selectedTool)?.type}</div>
                        
                        <div className="text-gray-400">Diameter:</div>
                        <div>{predefinedTools.find(t => t.name === selectedTool)?.diameter} mm</div>
                        
                        <div className="text-gray-400">Material:</div>
                        <div>{predefinedTools.find(t => t.name === selectedTool)?.material || 'Carbide'}</div>
                        
                        <div className="text-gray-400">Flutes:</div>
                        <div>{predefinedTools.find(t => t.name === selectedTool)?.numberOfFlutes || '2'}</div>
                        
                        {/* Pulsante per visualizzare l'utensile */}
                        <div className="col-span-2 mt-2">
                          <button
                            className="w-full py-1 px-2 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                            onClick={() => {
                              // Centra la vista sull'utensile
                              if (toolRef.current && cameraRef.current && controlsRef.current) {
                                const position = toolRef.current.position.clone();
                                controlsRef.current.target.copy(position);
                                cameraRef.current.position.set(
                                  position.x + 20,
                                  position.y + 20,
                                  position.z + 20
                                );
                                cameraRef.current.lookAt(position);
                                controlsRef.current.update();
                              }
                            }}
                          >
                            Focus on Tool
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">No tool selected</div>
                )}
                
                {/* Workpiece info */}
                {workpiece && (
                  <div>
                    <h4 className="text-sm font-medium text-blue-400 mb-2">Workpiece</h4>
                    <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Material:</span>
                        <span className="font-medium capitalize">{workpiece.material || 'Unknown'}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-gray-300">Dimensions:</span>
                        <span className="font-medium">
                          {workpiece.width} × {workpiece.height} × {workpiece.depth} {workpiece.units}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Settings panel */}
          {activePanel === 'settings' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Visualization Settings</h3>
                <button 
                  className="p-1 rounded-md hover:bg-gray-700"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm">Show Statistics</label>
                  <div className="relative inline-block w-10 align-middle select-none">
                    <input
                      type="checkbox"
                      checked={showStats}
                      onChange={() => setShowStats(!showStats)}
                      className="sr-only"
                      id="stats-toggle"
                    />
                    <label
                      htmlFor="stats-toggle"
                      className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                        showStats ? 'bg-blue-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                          showStats ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </label>
                  </div>
                </div>
                
                {/* Toolpath Points Visualization Settings */}
                <div className="space-y-2 border-t border-gray-700 pt-3 mt-2">
                  <h4 className="text-sm font-medium text-blue-400 mb-2">Toolpath Points</h4>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show All Points</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={showAllPoints}
                        onChange={() => setShowAllPoints(!showAllPoints)}
                        className="sr-only"
                        id="all-points-toggle"
                      />
                      <label
                        htmlFor="all-points-toggle"
                        className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                          showAllPoints ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            showAllPoints ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                  
                  {showAllPoints && (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-sm">Show Point Labels</label>
                        <div className="relative inline-block w-10 align-middle select-none">
                          <input
                            type="checkbox"
                            checked={showPointLabels}
                            onChange={() => setShowPointLabels(!showPointLabels)}
                            className="sr-only"
                            id="labels-toggle"
                          />
                          <label
                            htmlFor="labels-toggle"
                            className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                              showPointLabels ? 'bg-blue-600' : 'bg-gray-600'
                            }`}
                          >
                            <span
                              className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                                showPointLabels ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </label>
                        </div>
                      </div>
                      
                      <div className="text-sm mt-2">Filter Points:</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button 
                          className="bg-red-500 text-white p-1 rounded hover:bg-red-600"
                          onClick={() => console.log('Showing only rapid moves')}
                        >
                          Rapid Moves
                        </button>
                        <button 
                          className="bg-green-500 text-white p-1 rounded hover:bg-green-600"
                          onClick={() => console.log('Showing only cutting moves')}
                        >
                          Cutting Moves
                        </button>
                        <button 
                          className="bg-blue-500 text-white p-1 rounded hover:bg-blue-600"
                          onClick={() => console.log('Showing only arcs')}
                        >
                          Arcs
                        </button>
                        <button 
                          className="bg-purple-500 text-white p-1 rounded hover:bg-purple-600"
                          onClick={() => console.log('Showing only fixed cycles')}
                        >
                          Fixed Cycles
                        </button>
                      </div>
                      
                      {selectedPointIndex >= 0 && (
                        <div className="bg-gray-700 p-2 rounded mt-3">
                          <div className="text-sm font-medium">Selected Point #{selectedPointIndex}</div>
                          <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
                            <div className="text-gray-400">X:</div>
                            <div>{toolpathPointsRef.current[selectedPointIndex]?.x.toFixed(3) || 'N/A'}</div>
                            <div className="text-gray-400">Y:</div>
                            <div>{toolpathPointsRef.current[selectedPointIndex]?.y.toFixed(3) || 'N/A'}</div>
                            <div className="text-gray-400">Z:</div>
                            <div>{toolpathPointsRef.current[selectedPointIndex]?.z.toFixed(3) || 'N/A'}</div>
                          </div>
                          <div className="mt-2 flex justify-between">
                            <button
                              className="text-xs bg-gray-600 hover:bg-gray-500 text-white p-1 rounded"
                              onClick={() => focusOnPoint(selectedPointIndex - 1)}
                              disabled={selectedPointIndex <= 0}
                            >
                              Previous
                            </button>
                            <button
                              className="text-xs bg-gray-600 hover:bg-gray-500 text-white p-1 rounded"
                              onClick={() => focusOnPoint(selectedPointIndex + 1)}
                              disabled={selectedPointIndex >= toolpathPointsRef.current.length - 1}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-2">
                        <button
                          className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded"
                          onClick={() => {
                            // Implementa la navigazione Jump to Point
                            const pointIndex = prompt('Enter point number (0-' + (toolpathPointsRef.current.length - 1) + '):');
                            if (pointIndex && !isNaN(parseInt(pointIndex))) {
                              const index = parseInt(pointIndex);
                              if (index >= 0 && index < toolpathPointsRef.current.length) {
                                focusOnPoint(index);
                              }
                            }
                          }}
                        >
                          Jump to Point...
                        </button>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm block">Highlight Mode</label>
                  <select 
                    value={highlightMode}
                    onChange={(e) => setHighlightMode(e.target.value as any)}
                    className="bg-gray-700 rounded w-full p-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="rapid">Rapid Moves</option>
                    <option value="cut">Cutting Moves</option>
                    <option value="depth">By Depth</option>
                  </select>
                </div>
                
                {/* Advanced visualization settings */}
                <div className="space-y-2 mt-4 border-t border-gray-700 pt-2">
                  <h4 className="text-sm font-medium text-blue-400 mb-2">Advanced Options</h4>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show Arcs</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={showArcs}
                        onChange={() => setShowArcs(!showArcs)}
                        className="sr-only"
                        id="arcs-toggle"
                      />
                      <label
                        htmlFor="arcs-toggle"
                        className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                          showArcs ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            showArcs ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show Shapes</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={showShapes}
                        onChange={() => setShowShapes(!showShapes)}
                        className="sr-only"
                        id="shapes-toggle"
                      />
                      <label
                        htmlFor="shapes-toggle"
                        className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                          showShapes ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            showShapes ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-sm">Arc Resolution</label>
                      <span className="text-xs text-gray-400">{arcResolution} mm</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={arcResolution}
                      onChange={(e) => setArcResolution(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer"
                    />
                    <div className="text-xs text-gray-400 mt-1">
                      Lower values = smoother arcs, higher values = better performance
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Debug Points</label>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input
                        type="checkbox"
                        checked={showDebugPoints}
                        onChange={() => setShowDebugPoints(!showDebugPoints)}
                        className="sr-only"
                        id="debug-toggle"
                      />
                      <label
                        htmlFor="debug-toggle"
                        className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                          showDebugPoints ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            showDebugPoints ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                
                {workpiece && (
                  <div className="space-y-1 border-t border-gray-700 pt-3">
                    <h4 className="text-sm font-medium mb-2">Workpiece</h4>
                    
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm">Show Workpiece</label>
                      <div className="relative inline-block w-10 align-middle select-none">
                        <input
                          type="checkbox"
                          checked={isWorkpieceVisible}
                          onChange={() => setIsWorkpieceVisible(!isWorkpieceVisible)}
                          className="sr-only"
                          id="workpiece-toggle"
                        />
                        <label
                          htmlFor="workpiece-toggle"
                          className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                            isWorkpieceVisible ? 'bg-blue-600' : 'bg-gray-600'
                          }`}
                        >
                          <span
                            className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                              isWorkpieceVisible ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </label>
                      </div>
                    </div>
                    
                    {isWorkpieceVisible && (
                      <div className="space-y-1 mt-3">
                        <label className="text-sm flex items-center justify-between">
                          <span>Opacity</span>
                          <span className="text-xs">70%</span>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value="0.7"
                          className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {showCycleDetails && selectedCycleIndex >= 0 && detectedCycles[selectedCycleIndex] && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-150">
    <div className="bg-white rounded-lg p-6 max-w-md w-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Dettagli Ciclo Fisso</h3>
        <button 
          className="text-gray-500 hover:text-gray-800"
          onClick={() => setShowCycleDetails(false)}
        >
          &times;
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <span className="font-medium">Type:</span> {detectedCycles[selectedCycleIndex].type}
        </div>
        <div>
          <span className="font-medium">G-code:</span> 
          <pre className="mt-1 bg-gray-100 p-2 rounded text-sm overflow-x-auto">
            {detectedCycles[selectedCycleIndex].gCode}
          </pre>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="font-medium">Position X:</span> {detectedCycles[selectedCycleIndex].params.x}
          </div>
          <div>
            <span className="font-medium">Position Y:</span> {detectedCycles[selectedCycleIndex].params.y}
          </div>
          <div>
            <span className="font-medium">Depth Z:</span> {detectedCycles[selectedCycleIndex].params.z}
          </div>
          <div>
            <span className="font-medium">Plane R:</span> {detectedCycles[selectedCycleIndex].params.r}
          </div>
          {detectedCycles[selectedCycleIndex].params.q && (
            <div>
              <span className="font-medium">Increment Q:</span> {detectedCycles[selectedCycleIndex].params.q}
            </div>
          )}
          {detectedCycles[selectedCycleIndex].params.p && (
            <div>
              <span className="font-medium">Time P:</span> {detectedCycles[selectedCycleIndex].params.p}s
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-6 flex justify-end">
        <button 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setShowCycleDetails(false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
          {/* Tools panel */}
          {activePanel === 'tools' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Tool Library</h3>
                <button 
                  className="p-1 rounded-md hover:bg-gray-700"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-2">
                {predefinedTools.slice(0, 10).map(tool => (
                  <div
                    key={tool.name}
                    className={`p-2 rounded cursor-pointer ${
                      internalSelectedTool === tool.type ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    onClick={() => onSelectTool(tool.type)}
                  >
                    <div className="text-sm font-medium">{tool.type}</div>
                    <div className="flex text-xs text-gray-300 mt-1">
                      <span className="mr-3">{tool.type}</span>
                      <span>Ø {tool.diameter}mm</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Side control buttons */}
      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex flex-col space-y-2 z-10">
        <button 
          className={`p-2 rounded-md bg-gray-800 bg-opacity-75 hover:bg-opacity-100 focus:outline-none ${
            activePanel === 'info' && isPanelOpen ? 'text-blue-400' : 'text-white'
          }`}
          onClick={() => togglePanel('info')}
          title="Information"
        >
          <Info size={20} />
        </button>
        
        <button 
          className={`p-2 rounded-md bg-gray-800 bg-opacity-75 hover:bg-opacity-100 focus:outline-none ${
            activePanel === 'settings' && isPanelOpen ? 'text-blue-400' : 'text-white'
          }`}
          onClick={() => togglePanel('settings')}
          title="Settings"
        >
          <Settings size={20} />
        </button>
        
        <button 
          className={`p-2 rounded-md bg-gray-800 bg-opacity-75 hover:bg-opacity-100 focus:outline-none ${
            activePanel === 'tools' && isPanelOpen ? 'text-blue-400' : 'text-white'
          }`}
          onClick={() => togglePanel('tools')}
          title="Tool Library"
        >
          <Tool size={20} />
        </button>
        
        <div className="border-t border-gray-600 pt-2"></div>
        
        <button 
          className="p-2 rounded-md bg-gray-800 bg-opacity-75 hover:bg-opacity-100 focus:outline-none text-white"
          onClick={resetView}
          title="Reset View"
        >
          <Home size={20} />
        </button>
      </div>
      
      {/* Show controls button when controls are hidden */}
      {!showControls && (
        <button 
          className="absolute top-2 left-2 p-2 rounded-md bg-gray-800 bg-opacity-75 text-white hover:bg-opacity-100 focus:outline-none z-10"
          onClick={() => setShowControls(true)}
          title="Show Controls"
        >
          <Menu size={20} />
        </button>
      )}
      
      {/* Performance stats */}
      {showStats && (
        <div className="absolute bottom-16 left-4 bg-gray-800 bg-opacity-75 text-white p-2 rounded-md text-xs font-mono z-10">
          <div>FPS: {statistics.fps}</div>
          <div>Triangles: {statistics.triangleCount.toLocaleString()}</div>
          <div>Objects: {statistics.objectCount}</div>
          <div>Memory: {statistics.memory}MB</div>
        </div>
      )}

      {/* Toolpath Points quick info */}
      {showAllPoints && (
        <div className="absolute bottom-16 right-4 bg-gray-800 bg-opacity-90 text-white p-3 rounded-md text-xs z-10">
          <div className="flex items-center mb-2">
            <span className="font-medium">Toolpath Points Legend</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
              <span>Rapid Moves</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              <span>Cutting Moves</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
              <span>Arc Moves</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
              <span>Fixed Cycles</span>
            </div>
          </div>
          
          <div className="mt-2 text-right">
            <span className="mr-2">Total Points: {toolpathPointsRef.current.length}</span>
            <button 
              className="bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded text-xs inline-flex items-center"
              onClick={() => {
                // Jump to point dialog
                const pointIndex = prompt('Enter point number (0-' + (toolpathPointsRef.current.length - 1) + '):');
                if (pointIndex && !isNaN(parseInt(pointIndex))) {
                  const index = parseInt(pointIndex);
                  if (index >= 0 && index < toolpathPointsRef.current.length) {
                    focusOnPoint(index);
                  }
                }
              }}
            >
              Jump to Point
            </button>
          </div>
        </div>
      )}

      {/* Point selection tooltip */}
      {selectedPointIndex >= 0 && showAllPoints && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-75 text-white px-3 py-2 rounded-md text-xs z-20 pointer-events-none">
          <div className="font-medium">Point #{selectedPointIndex}</div>
          <div>X: {toolpathPointsRef.current[selectedPointIndex]?.x.toFixed(3)}</div>
          <div>Y: {toolpathPointsRef.current[selectedPointIndex]?.y.toFixed(3)}</div>
          <div>Z: {toolpathPointsRef.current[selectedPointIndex]?.z.toFixed(3)}</div>
          <div>Type: {toolpathPointsRef.current[selectedPointIndex]?.type || 'Unknown'}</div>
        </div>
      )}
    </div>
  );
};

export default ToolpathVisualizer;