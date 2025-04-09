import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useLOD } from './canvas/useLod';
import { useThreePerformance } from './canvas/useThreePerformance';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { predefinedTools } from '@/src/lib/predefinedLibraries';
import { useCADStore } from '@/src/store/cadStore';

export type ViewType = 'perspective' | 'top' | 'front' | 'right' | 'isometric';
export type TimelineMode = 'play' | 'pause' | 'rewind' | 'forward' | 'stop';

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate?: number;
  type?: string; // G0, G1, G2, G3, etc.
  isRapid?: boolean;
  toolCompensation?: 'left' | 'right' | 'none';
  command?: string; // Original G-code command
}

export interface ToolType {
  type: string;
  diameter: number;
  length?: number;
  flutes?: number;
  material?: string;
  angle?: number; // For V-bits, chamfer tools
  name?: string;
}

export interface ToolpathVisualizerOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  gridSize?: number;
  gridDivisions?: number;
  axisEnabled?: boolean;
  showShadows?: boolean;
  defaultView?: ViewType;
  workpieceVisible?: boolean;
  highQualityRendering?: boolean;
}

export interface ToolpathSegment {
  points: ToolpathPoint[];
  color?: string;
  operation?: string;
  depth?: number;
  tool?: ToolType;
}

export const useToolpathVisualization = (
  containerRef: React.RefObject<HTMLDivElement>,
  options: ToolpathVisualizerOptions
) => {
  // State for scene elements
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const mainCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const topCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const frontCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rightCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const activeCameraRef = useRef<THREE.Camera | null>(null);
  const toolMeshRef = useRef<THREE.Object3D | null>(null);
  const toolpathRef = useRef<THREE.Line | null>(null);
  const workpieceRef = useRef<THREE.Mesh | null>(null);
  const toolpathPointsRef = useRef<ToolpathPoint[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  // State
  const [currentView, setCurrentView] = useState<ViewType>(options.defaultView || 'perspective');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [toolpathSegments, setToolpathSegments] = useState<ToolpathSegment[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('stop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [statistics, setStatistics] = useState({
    triangleCount: 0,
    objectCount: 0,
    fps: 0,
    memoryUsage: 0,
    timeRemaining: '00:00'
  });
  
  // Get workpiece data from CAD store
  const { workpiece, viewMode, gridVisible, axisVisible } = useCADStore();
  
  // Use optimization hooks
  const sceneRefForHooks = sceneRef as React.RefObject<THREE.Scene>;
  const cameraRefForHooks = mainCameraRef as React.RefObject<THREE.Camera>;
  
  const { optimizeScene } = useThreePerformance(sceneRefForHooks);
  const { applyLOD, temporarilyRestoreFullDetail } = useLOD(
    sceneRefForHooks,
    cameraRefForHooks,
    {
      enabled: true,
      highDetailThreshold: 50,
      mediumDetailThreshold: 500,
      mediumDetailReduction: 0.5,
      lowDetailReduction: 0.2
    }
  );

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || isInitialized) return;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(options.backgroundColor || '#2A2A2A');
    sceneRef.current = scene;
    
    // Create renderer with advanced options
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(options.width, options.height);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Enable shadows if requested
    if (options.showShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    if (options.highQualityRendering) {
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Create main (perspective) camera
    const mainCamera = new THREE.PerspectiveCamera(
      45, // FOV
      options.width / options.height,
      0.1,
      2000
    );
    mainCamera.position.set(200, 200, 200);
    mainCamera.lookAt(0, 0, 0);
    mainCameraRef.current = mainCamera;
    activeCameraRef.current = mainCamera;
    
    // Create orthographic cameras for standard views
    const aspectRatio = options.width / options.height;
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
    
    // Create orbit controls
    const controls = new OrbitControls(mainCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.zoomSpeed = 0.5;
    controls.rotateSpeed = 0.5;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;
    
    // Add grid
    const gridSize = options.gridSize || 500;
    const gridDivisions = options.gridDivisions || 50;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
    gridHelper.rotation.x = Math.PI / 2; // XY plane
    gridHelper.visible = gridVisible;
    
    // Add a smaller, more detailed grid
    const detailedGridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
    detailedGridHelper.rotation.x = Math.PI / 2;
    detailedGridHelper.position.y = 0.1; // Slightly above the main grid
    detailedGridHelper.visible = gridVisible;
    
    scene.add(gridHelper);
    scene.add(detailedGridHelper);
    
    // Add axis helper
    const createCustomAxes = (size: number) => {
      // Create the axis arrows with labels
      const axesGroup = new THREE.Group();
      axesGroup.userData.isCustomAxes = true;
      
      // X axis
      const xAxis = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        size,
        0x0000ff,
        size * 0.1,
        size * 0.05
      );
      // Y axis
      const yAxis = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        size,
        0xff00ff,
        size * 0.1,
        size * 0.05
      );
      // Z axis
      const zAxis = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 0),
        size,
        0x00ff00,
        size * 0.1,
        size * 0.05
      );
      
      // Create labels
      const createLabel = (text: string, position: THREE.Vector3, color: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
          context.font = 'Bold 40px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(text, 32, 32);
          
          const texture = new THREE.CanvasTexture(canvas);
          const material = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(material);
          sprite.position.copy(position);
          sprite.scale.set(10, 10, 1);
          return sprite;
        }
        return null;
      };
      
      const xLabel = createLabel('X', new THREE.Vector3(size + 5, 0, 0), 0x0000ff);
      const yLabel = createLabel('Y', new THREE.Vector3(0, size + 5, 0), 0xff00ff);
      const zLabel = createLabel('Z', new THREE.Vector3(0, 0, size + 5), 0x00ff00);
      
      axesGroup.add(xAxis);
      axesGroup.add(yAxis);
      axesGroup.add(zAxis);
      
      if (xLabel) axesGroup.add(xLabel);
      if (yLabel) axesGroup.add(yLabel);
      if (zLabel) axesGroup.add(zLabel);
      
      return axesGroup;
    };
    
    const axesHelper = createCustomAxes(50);
    axesHelper.visible = axisVisible;
    scene.add(axesHelper);
    
    // Add ambient and directional lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = options.showShadows || false;
    
    // Improve shadow quality
    if (options.showShadows) {
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
      
      const d = 200;
      directionalLight.shadow.camera.left = -d;
      directionalLight.shadow.camera.right = d;
      directionalLight.shadow.camera.top = d;
      directionalLight.shadow.camera.bottom = -d;
    }
    
    scene.add(directionalLight);
    
    // Add hemisphere light for better environmental lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3);
    scene.add(hemisphereLight);
    
    // Initialize animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      // Handle animation of the tool along the toolpath
      if (isPlaying && toolpathPointsRef.current.length > 0 && toolMeshRef.current) {
        updateToolPosition();
      }
      
      // Render the scene
      if (rendererRef.current && activeCameraRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, activeCameraRef.current);
      }
      
      // Update statistics if enabled
      if (showStatistics) {
        updateStatistics();
      }
    };
    
    animate();
    
    // Add event listener for window resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      rendererRef.current.setSize(width, height);
      
      if (mainCameraRef.current) {
        mainCameraRef.current.aspect = width / height;
        mainCameraRef.current.updateProjectionMatrix();
      }
      
      // Update orthographic cameras
      const aspectRatio = width / height;
      
      if (topCameraRef.current) {
        topCameraRef.current.left = -viewSize * aspectRatio;
        topCameraRef.current.right = viewSize * aspectRatio;
        topCameraRef.current.top = viewSize;
        topCameraRef.current.bottom = -viewSize;
        topCameraRef.current.updateProjectionMatrix();
      }
      
      if (frontCameraRef.current) {
        frontCameraRef.current.left = -viewSize * aspectRatio;
        frontCameraRef.current.right = viewSize * aspectRatio;
        frontCameraRef.current.top = viewSize;
        frontCameraRef.current.bottom = -viewSize;
        frontCameraRef.current.updateProjectionMatrix();
      }
      
      if (rightCameraRef.current) {
        rightCameraRef.current.left = -viewSize * aspectRatio;
        rightCameraRef.current.right = viewSize * aspectRatio;
        rightCameraRef.current.top = viewSize;
        rightCameraRef.current.bottom = -viewSize;
        rightCameraRef.current.updateProjectionMatrix();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Mark initialization complete
    setIsInitialized(true);
    
    // Optimize scene on first render
    optimizeScene();
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      
      controlsRef.current?.dispose();
    };
  }, [containerRef, isInitialized, options, optimizeScene, gridVisible, axisVisible]);
  
  // Change active camera when view changes
  useEffect(() => {
    if (!isInitialized) return;
    
    let targetCamera: THREE.Camera | null = null;
    
    switch (currentView) {
      case 'perspective':
        targetCamera = mainCameraRef.current;
        break;
      case 'top':
        targetCamera = topCameraRef.current;
        break;
      case 'front':
        targetCamera = frontCameraRef.current;
        break;
      case 'right':
        targetCamera = rightCameraRef.current;
        break;
      case 'isometric':
        // Use main camera but move to isometric position
        if (mainCameraRef.current) {
          mainCameraRef.current.position.set(100, 100, 100);
          mainCameraRef.current.lookAt(0, 0, 0);
          targetCamera = mainCameraRef.current;
        }
        break;
    }
    
    if (targetCamera) {
      activeCameraRef.current = targetCamera;
      
      // Update controls target
      if (controlsRef.current && targetCamera === mainCameraRef.current) {
        controlsRef.current.enabled = true;
      } else if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
    }
  }, [currentView, isInitialized]);
  
  // Create and update workpiece mesh
  useEffect(() => {
    if (!isInitialized || !sceneRef.current || !options.workpieceVisible || !workpiece) return;
    
    if (workpieceRef.current) {
      sceneRef.current.remove(workpieceRef.current);
      workpieceRef.current = null;
    }
    
    // Function to create workpiece mesh
    const createWorkpieceMesh = () => {
      const geometry = new THREE.BoxGeometry(
        workpiece.width || 100,
        workpiece.height || 100,
        workpiece.depth || 20
      );
      
      // Create material based on workpiece material type
      let material: THREE.Material;
      
      switch (workpiece.material) {
        case 'aluminum':
          material = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.7,
            roughness: 0.4,
            transparent: true,
            opacity: 0.8
          });
          break;
        case 'steel':
          material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.8,
            roughness: 0.5,
            transparent: true,
            opacity: 0.8
          });
          break;
        case 'wood':
          material = new THREE.MeshStandardMaterial({
            color: 0xA0522D,
            metalness: 0.0,
            roughness: 0.9,
            transparent: true,
            opacity: 0.8
          });
          break;
        case 'plastic':
          material = new THREE.MeshStandardMaterial({
            color: 0x1E90FF,
            metalness: 0.1,
            roughness: 0.3,
            transparent: true,
            opacity: 0.7
          });
          break;
        default:
          material = new THREE.MeshStandardMaterial({
            color: 0xAAAAAA,
            transparent: true,
            opacity: 0.7
          });
      }
      
      const mesh = new THREE.Mesh(geometry, material);
      
      // Position the workpiece with proper center
      const { originOffset } = useCADStore.getState();
      mesh.position.set(originOffset.x, originOffset.y, originOffset.z);
      
      // Add edges for better visibility
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.4
      });
      const wireframe = new THREE.LineSegments(edges, lineMaterial);
      mesh.add(wireframe);
      
      // Enable shadows
      if (options.showShadows) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      
      return mesh;
    };
    
    // Create and add workpiece
    const workpieceMesh = createWorkpieceMesh();
    sceneRef.current.add(workpieceMesh);
    workpieceRef.current = workpieceMesh;
    
  }, [isInitialized, sceneRef, workpiece, options.workpieceVisible]);

  // Create tool mesh based on active tool
  const createToolMesh = useCallback((tool: ToolType) => {
    if (!isInitialized || !sceneRef.current) return null;
    
    // Remove existing tool
    if (toolMeshRef.current) {
      sceneRef.current.remove(toolMeshRef.current);
      toolMeshRef.current = null;
    }
    
    // Create a group for the tool
    const toolGroup = new THREE.Group();
    
    // Get tool properties
    const {
      type,
      diameter,
      length = diameter * 4,
      flutes = 2,
      material = 'hss',
      angle = 0
    } = tool;
    
    // Create the tool based on type
    switch (type) {
      case 'endmill': {
        // Create shank
        const shankHeight = length * 0.6;
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.4, 
          diameter * 0.4, 
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
        
        // Create cutting part
        const cuttingHeight = length * 0.4;
        const cuttingGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          cuttingHeight,
          24
        );
        const cuttingMaterial = new THREE.MeshStandardMaterial({
          color: material === 'hss' ? 0xCCCCCC : 0x333333,
          metalness: 0.8,
          roughness: 0.1
        });
        const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
        cutting.position.y = -cuttingHeight / 2;
        
        // Add flutes visualization for better realism
        if (flutes > 0) {
          for (let i = 0; i < flutes; i++) {
            const fluteAngle = (i / flutes) * Math.PI * 2;
            const fluteGeometry = new THREE.BoxGeometry(
              diameter * 0.05,
              cuttingHeight,
              diameter * 0.8
            );
            const fluteMaterial = new THREE.MeshStandardMaterial({
              color: 0x222222,
              metalness: 0.7,
              roughness: 0.3
            });
            const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
            flute.rotation.y = fluteAngle;
            flute.position.y = -cuttingHeight / 2;
            cutting.add(flute);
          }
        }
        
        toolGroup.add(shank);
        toolGroup.add(cutting);
        break;
      }
      
      case 'ballnose': {
        // Create shank
        const shankHeight = length * 0.6;
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.4, 
          diameter * 0.4, 
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
        
        // Create cutting part (cylinder + hemisphere)
        const cuttingHeight = length * 0.3;
        const cuttingGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          cuttingHeight,
          24
        );
        const cuttingMaterial = new THREE.MeshStandardMaterial({
          color: material === 'hss' ? 0xCCCCCC : 0x333333,
          metalness: 0.8,
          roughness: 0.1
        });
        const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
        cutting.position.y = -cuttingHeight / 2;
        
        // Add ball end
        const ballGeometry = new THREE.SphereGeometry(
          diameter / 2,
          24,
          24,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        );
        const ball = new THREE.Mesh(ballGeometry, cuttingMaterial);
        ball.position.y = -(cuttingHeight + diameter / 4);
        ball.rotation.x = Math.PI;
        
        toolGroup.add(shank);
        toolGroup.add(cutting);
        toolGroup.add(ball);
        break;
      }
      
      case 'vbit': {
        // Create shank
        const shankHeight = length * 0.7;
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.4, 
          diameter * 0.4, 
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
        
        // Create V shape
        const tipHeight = length * 0.3;
        const vGeometry = new THREE.ConeGeometry(
          diameter / 2,
          tipHeight,
          24
        );
        const vMaterial = new THREE.MeshStandardMaterial({
          color: material === 'hss' ? 0xCCCCCC : 0x333333,
          metalness: 0.8,
          roughness: 0.1
        });
        const vTip = new THREE.Mesh(vGeometry, vMaterial);
        vTip.position.y = -(tipHeight / 2);
        vTip.rotation.x = Math.PI;
        
        toolGroup.add(shank);
        toolGroup.add(vTip);
        break;
      }
      
      case 'drill': {
        // Create shank
        const shankHeight = length * 0.6;
        const shankGeometry = new THREE.CylinderGeometry(
          diameter * 0.4, 
          diameter * 0.4, 
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
        
        // Create main drill body
        const drillHeight = length * 0.3;
        const drillGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          drillHeight,
          24
        );
        const drillMaterial = new THREE.MeshStandardMaterial({
          color: material === 'hss' ? 0xCCCCCC : 0x333333,
          metalness: 0.8,
          roughness: 0.1
        });
        const drillBody = new THREE.Mesh(drillGeometry, drillMaterial);
        drillBody.position.y = -(drillHeight / 2);
        
        // Add drill tip
        const tipHeight = length * 0.1;
        const tipGeometry = new THREE.ConeGeometry(
          diameter / 2,
          tipHeight,
          24
        );
        const tip = new THREE.Mesh(tipGeometry, drillMaterial);
        tip.position.y = -(drillHeight + tipHeight / 2);
        tip.rotation.x = Math.PI;
        
        // Add flutes
        const fluteGeometry = new THREE.BoxGeometry(
          diameter * 0.7,
          drillHeight + tipHeight,
          diameter * 0.1
        );
        const fluteMaterial = new THREE.MeshStandardMaterial({
          color: 0x222222,
          metalness: 0.7,
          roughness: 0.3
        });
        const flute1 = new THREE.Mesh(fluteGeometry, fluteMaterial);
        flute1.position.y = -(drillHeight / 2 + tipHeight / 2);
        
        const flute2 = new THREE.Mesh(fluteGeometry, fluteMaterial);
        flute2.position.y = -(drillHeight / 2 + tipHeight / 2);
        flute2.rotation.y = Math.PI / 2;
        
        toolGroup.add(shank);
        toolGroup.add(drillBody);
        toolGroup.add(tip);
        toolGroup.add(flute1);
        toolGroup.add(flute2);
        break;
      }
      
      default: {
        // Generic tool for unsupported types
        const toolHeight = length;
        const toolGeometry = new THREE.CylinderGeometry(
          diameter / 2,
          diameter / 2,
          toolHeight,
          16
        );
        const toolMaterial = new THREE.MeshStandardMaterial({
          color: 0xAAAAAA,
          metalness: 0.5,
          roughness: 0.5
        });
        const toolMesh = new THREE.Mesh(toolGeometry, toolMaterial);
        
        toolGroup.add(toolMesh);
      }
    }
    
    // Set up shadows
    if (options.showShadows) {
      toolGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
        }
      });
    }
    
    // Orient tool to point downward (Z axis)
    toolGroup.rotation.x = Math.PI / 2;
    
    return toolGroup;
  }, [isInitialized]);
  
  // Set active tool
  const setTool = useCallback((tool: ToolType | string | null) => {
    // Handle case where tool is a string (tool name from library)
    let toolObject: ToolType | null = null;
    
    if (typeof tool === 'string') {
      // Find tool in predefined tools
      const foundTool = predefinedTools.find(t => t.name === tool);
      if (foundTool) {
        toolObject = {
          type: foundTool.type,
          diameter: foundTool.diameter || 6,
          flutes: foundTool.numberOfFlutes ? foundTool.numberOfFlutes : undefined
        };
      }
    } else {
      toolObject = tool;
    }
    
    // Update active tool state
    setActiveTool(toolObject);
    
    // Create tool mesh
    if (toolObject && isInitialized && sceneRef.current) {
      const toolMesh = createToolMesh(toolObject);
      if (toolMesh) {
        sceneRef.current.add(toolMesh);
        toolMeshRef.current = toolMesh;
      }
    }
  }, [isInitialized, createToolMesh]);
  
  // Parse G-code into toolpath points
  const parseGCode = useCallback((gcode: string): ToolpathPoint[] => {
    const points: ToolpathPoint[] = [];
    const lines = gcode.split('\n');
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let currentF = 0;
    let currentToolCompensation: 'left' | 'right' | 'none' = 'none';
    
    lines.forEach(line => {
      // Skip comments and empty lines
      if (!line.trim() || line.trim().startsWith(';')) return;
      
      // Extract command type
      const isG0 = line.includes('G0') || line.includes('G00');
      const isG1 = line.includes('G1') || line.includes('G01');
      const isG2 = line.includes('G2') || line.includes('G02');
      const isG3 = line.includes('G3') || line.includes('G03');
      const isG41 = line.includes('G41');
      const isG42 = line.includes('G42');
      const isG40 = line.includes('G40');
      
      // Handle tool compensation
      if (isG41) {
        currentToolCompensation = 'left';
      } else if (isG42) {
        currentToolCompensation = 'right';
      } else if (isG40) {
        currentToolCompensation = 'none';
      }
      
      // Extract coordinates
      if (isG0 || isG1 || isG2 || isG3) {
        // Extract X, Y, Z coordinates
        const xMatch = line.match(/X([+-]?\d*\.?\d+)/);
        const yMatch = line.match(/Y([+-]?\d*\.?\d+)/);
        const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);
        const fMatch = line.match(/F([+-]?\d*\.?\d+)/);
        
        // Update current position
        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        if (zMatch) currentZ = parseFloat(zMatch[1]);
        if (fMatch) currentF = parseFloat(fMatch[1]);
        
        // Add point to toolpath
        points.push({
          x: currentX,
          y: currentY,
          z: currentZ,
          feedrate: currentF,
          type: isG0 ? 'G0' : isG1 ? 'G1' : isG2 ? 'G2' : 'G3',
          isRapid: isG0,
          toolCompensation: currentToolCompensation,
          command: line.trim()
        });
        
        // For arcs (G2, G3), add intermediate points
        if (isG2 || isG3) {
          // Extract arc parameters
          const iMatch = line.match(/I([+-]?\d*\.?\d+)/);
          const jMatch = line.match(/J([+-]?\d*\.?\d+)/);
          
          if (iMatch && jMatch) {
            const i = parseFloat(iMatch[1]);
            const j = parseFloat(jMatch[1]);
            
            // Calculate center point
            const centerX = currentX - i;
            const centerY = currentY - j;
            
            // TODO: Add intermediate points for arcs
            // This is a complex calculation that could be added for smoother visualization
          }
        }
      }
    });
    
    return points;
  }, []);
  
  // Set toolpath from G-code
  const setToolpath = useCallback((gcode: string) => {
    if (!isInitialized || !sceneRef.current) return;
    
    // Parse G-code
    const points = parseGCode(gcode);
    toolpathPointsRef.current = points;
    
    // Remove existing toolpath
    if (toolpathRef.current) {
      sceneRef.current.remove(toolpathRef.current);
      toolpathRef.current = null;
    }
    
    // Create new toolpath visualization
    if (points.length > 1) {
      // Create geometry for the toolpath
      const geometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const colors: number[] = [];
      
      points.forEach((point, index) => {
        positions.push(point.x, point.y, point.z);
        
        // Add color based on move type (rapid vs. cutting)
        if (point.isRapid) {
          colors.push(1, 0, 0); // Red for rapid moves
        } else {
          colors.push(0, 1, 0); // Green for cutting moves
        }
      });
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      // Create material with vertex colors
      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2
      });
      
      // Create line
      const line = new THREE.Line(geometry, material);
      sceneRef.current.add(line);
      toolpathRef.current = line;
      
      // Reset current position
      setCurrentPointIndex(0);
      
      // Position tool at first point
      if (toolMeshRef.current && points.length > 0) {
        const firstPoint = points[0];
        toolMeshRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z);
      }
    }
    
    // Create separate segments for different operations (if needed)
    // This can be expanded to separate the toolpath by operations
    // based on comments or tool changes in the G-code
    const segments: ToolpathSegment[] = [{
      points: points,
      operation: 'default'
    }];
    
    setToolpathSegments(segments);
    
    // Update statistics display if enabled
    if (showStatistics) {
      updateStatistics();
    }
  }, [isInitialized, parseGCode]);
  
  // Update tool position during animation
  const updateToolPosition = useCallback(() => {
    if (!toolMeshRef.current || toolpathPointsRef.current.length === 0) return;
    
    // Get current point
    const currentPoint = toolpathPointsRef.current[currentPointIndex];
    
    // Update tool position
    toolMeshRef.current.position.set(currentPoint.x, currentPoint.y, currentPoint.z);
    
    // Move to next point based on playback speed
    const newIndex = currentPointIndex + playbackSpeed;
    
    // Check if we've reached the end of the toolpath
    if (newIndex >= toolpathPointsRef.current.length) {
      setIsPlaying(false);
      setTimelineMode('stop');
    } else {
      setCurrentPointIndex(Math.min(newIndex, toolpathPointsRef.current.length - 1));
    }
  }, [currentPointIndex, playbackSpeed]);
  
  // Update statistics display
  const updateStatistics = useCallback(() => {
    if (!sceneRef.current || !rendererRef.current) return;
    
    let triangleCount = 0;
    let objectCount = 0;
    
    // Count triangles and objects
    sceneRef.current.traverse((object) => {
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
    
    // Update statistics
    setStatistics({
      triangleCount: Math.floor(triangleCount),
      objectCount,
      fps: Math.round(rendererRef.current.info.render.frame), // Use frame instead of frames
      memoryUsage: 0, // Memory usage placeholder
      timeRemaining
    });
  }, [isPlaying, currentPointIndex, playbackSpeed]);
  
  // Control playback functions
  const playToolpath = useCallback(() => {
    setIsPlaying(true);
    setTimelineMode('play');
  }, []);
  
  const pauseToolpath = useCallback(() => {
    setIsPlaying(false);
    setTimelineMode('pause');
  }, []);
  
  const stopToolpath = useCallback(() => {
    setIsPlaying(false);
    setCurrentPointIndex(0);
    setTimelineMode('stop');
    
    // Position tool at first point
    if (toolMeshRef.current && toolpathPointsRef.current.length > 0) {
      const firstPoint = toolpathPointsRef.current[0];
      toolMeshRef.current.position.set(firstPoint.x, firstPoint.y, firstPoint.z);
    }
  }, []);
  
  const stepForward = useCallback(() => {
    if (toolpathPointsRef.current.length === 0) return;
    
    const newIndex = Math.min(currentPointIndex + 1, toolpathPointsRef.current.length - 1);
    setCurrentPointIndex(newIndex);
    setTimelineMode('forward');
    
    // Update tool position
    if (toolMeshRef.current && newIndex < toolpathPointsRef.current.length) {
      const point = toolpathPointsRef.current[newIndex];
      toolMeshRef.current.position.set(point.x, point.y, point.z);
    }
  }, [currentPointIndex]);
  
  const stepBackward = useCallback(() => {
    if (toolpathPointsRef.current.length === 0) return;
    
    const newIndex = Math.max(currentPointIndex - 1, 0);
    setCurrentPointIndex(newIndex);
    setTimelineMode('rewind');
    
    // Update tool position
    if (toolMeshRef.current && newIndex < toolpathPointsRef.current.length) {
      const point = toolpathPointsRef.current[newIndex];
      toolMeshRef.current.position.set(point.x, point.y, point.z);
    }
  }, [currentPointIndex]);
  
  // Get current toolpath progress percentage
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
    if (toolMeshRef.current && newIndex < toolpathPointsRef.current.length) {
      const point = toolpathPointsRef.current[newIndex];
      toolMeshRef.current.position.set(point.x, point.y, point.z);
    }
  }, []);
  
  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any).mozRequestFullScreen) {
        (containerRef.current as any).mozRequestFullScreen();
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      } else if ((containerRef.current as any).msRequestFullscreen) {
        (containerRef.current as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    }
    
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen, containerRef]);
  
  // Get current point info for display
  const getCurrentPointInfo = useCallback(() => {
    if (toolpathPointsRef.current.length === 0 || currentPointIndex >= toolpathPointsRef.current.length) {
      return { x: 0, y: 0, z: 0, feedrate: 0, type: '', command: '' };
    }
    
    return toolpathPointsRef.current[currentPointIndex];
  }, [currentPointIndex]);
  
  // Toggle statistics display
  const toggleStatistics = useCallback(() => {
    setShowStatistics(!showStatistics);
  }, [showStatistics]);
  
  // Take screenshot
  const takeScreenshot = useCallback(() => {
    if (!rendererRef.current) return null;
    
    // Temporarily restore full quality for screenshot
    const restoreFunc = temporarilyRestoreFullDetail();
    
    // Render the scene at high quality
    if (rendererRef.current && activeCameraRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, activeCameraRef.current);
    }
    
    // Get image data
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    
    // Restore normal quality
    if (restoreFunc) restoreFunc();
    
    return dataUrl;
  }, [temporarilyRestoreFullDetail]);
  
  // Export public interface
  return {
    // State
    currentView,
    isPlaying,
    currentPointIndex,
    playbackSpeed,
    toolpathSegments,
    activeTool,
    timelineMode,
    isFullscreen,
    statistics,
    showStatistics,
    
    // Methods
    setCurrentView,
    setTool,
    setToolpath,
    playToolpath,
    pauseToolpath,
    stopToolpath,
    stepForward,
    stepBackward,
    setPlaybackSpeed,
    getProgress,
    jumpToProgress,
    toggleFullscreen,
    getCurrentPointInfo,
    toggleStatistics,
    takeScreenshot
  };
};
