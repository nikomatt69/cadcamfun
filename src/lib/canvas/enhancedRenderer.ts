// src/lib/canvas/enhanced-renderer.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass';
import { ViewCubeController } from './viewCube';
import { Element } from 'src/store/elementsStore';
import { Layer } from 'src/store/layerStore';

export type ViewMode = '2d' | '3d' | 'isometric' | 'top' | 'front' | 'right';
export type RenderQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface RendererOptions {
  antialias?: boolean;
  shadows?: boolean;
  ambientOcclusion?: boolean;
  outlineSelection?: boolean;
  fxaa?: boolean;
  highDPI?: boolean;
  quality?: RenderQuality;
  backgroundColor?: string;
}

export interface SceneCallbacks {
  onSceneInitialized?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onSceneBeforeRender?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onSceneRender?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onViewModeChanged?: (mode: ViewMode) => void;
  onObjectSelected?: (object: THREE.Object3D | null) => void;
  onError?: (error: Error) => void;
}

interface LightSetup {
  ambient: THREE.AmbientLight;
  main: THREE.DirectionalLight;
  secondary: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  spotlights: THREE.SpotLight[];
}

/**
 * Enhanced renderer for professional CAD visualization
 */
export class EnhancedRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private mainCamera: THREE.PerspectiveCamera | null = null;
  private orthographicCamera: THREE.OrthographicCamera | null = null;
  private activeCamera: THREE.Camera | null = null;
  private controls: OrbitControls | null = null;
  private composer: EffectComposer | null = null;
  private outlinePass: OutlinePass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.Group | null = null;
  private originIndicator: THREE.Group | null = null;
  private viewCube: ViewCubeController | null = null;
  private lights: LightSetup | null = null;
  private frameId: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  private canvas: HTMLCanvasElement | null = null;
  private containerEl: HTMLElement | null = null;
  private options: RendererOptions = {
    antialias: true,
    shadows: true,
    ambientOcclusion: false,
    outlineSelection: true,
    fxaa: true,
    highDPI: true,
    quality: 'medium',
    backgroundColor: '#2A2A2A'
  };
  private callbacks: SceneCallbacks = {};
  private viewMode: ViewMode = '3d';
  private isDestroyed: boolean = false;
  private selectedObjects: THREE.Object3D[] = [];
  private hoveredObject: THREE.Object3D | null = null;
  private objectsCache: Map<string, THREE.Object3D> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();
  private boundHandleResize: () => void;
  private isDarkMode: boolean = false;
  private performanceStats: any = null;
  private originOffset: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };

  /**
   * Create a new enhanced renderer
   */
  constructor(options?: Partial<RendererOptions>, callbacks?: SceneCallbacks) {
    this.options = { ...this.options, ...options };
    this.callbacks = callbacks || {};
    this.boundHandleResize = this.handleResize.bind(this);
  }

  /**
   * Initialize the renderer with a container element
   */
  public initialize(container: HTMLElement): void {
    if (this.renderer) return;
    this.isDestroyed = false;
    this.containerEl = container;
    
    try {
      this.initializeRenderer();
      this.initializeScene();
      this.initializeCameras();
      this.initializeLights();
      this.initializePostProcessing();
      this.initializeHelpers();
      this.initializeControls();
      this.initializeViewCube();
      
      // Add event listener for resize
      window.addEventListener('resize', this.boundHandleResize);
      
      // Start animation loop
      this.animate();
      
      // Call onSceneInitialized callback
      if (this.callbacks.onSceneInitialized && this.scene && this.mainCamera) {
        this.callbacks.onSceneInitialized(this.scene, this.mainCamera);
      }
    } catch (error) {
      console.error('Failed to initialize renderer:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Initialize the WebGL renderer
   */
  private initializeRenderer(): void {
    // Create renderer with specified options
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.options.antialias,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    
    // Apply DPI scaling based on quality setting
    const pixelRatio = this.getPixelRatioForQuality();
    this.renderer.setPixelRatio(pixelRatio);
    
    // Setup shadow mapping
    if (this.options.shadows) {
      this.renderer.shadowMap.enabled = true;
      
      // Choose shadow map type based on quality
      if (this.options.quality === 'ultra' || this.options.quality === 'high') {
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      } else {
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
    }
    
    // Setup color space and tone mapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    // Configure renderer size
    if (this.containerEl) {
      this.renderer.setSize(this.containerEl.clientWidth, this.containerEl.clientHeight);
      this.canvas = this.renderer.domElement;
      this.containerEl.appendChild(this.canvas);
    }
  }

  /**
   * Initialize the scene
   */
  private initializeScene(): void {
    this.scene = new THREE.Scene();
    
    // Set background color based on theme mode
    const backgroundColor = this.isDarkMode 
      ? this.options.backgroundColor || '#1a1a1a'
      : '#f5f5f5';
    
    this.scene.background = new THREE.Color(backgroundColor);
    
    // Add fog for depth perception
    this.scene.fog = new THREE.Fog(
      backgroundColor, 
      2000, 
      8000
    );
  }

  /**
   * Initialize cameras (perspective and orthographic)
   */
  private initializeCameras(): void {
    if (!this.containerEl) return;
    
    // Create perspective camera for 3D view
    const aspect = this.containerEl.clientWidth / this.containerEl.clientHeight;
    this.mainCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
    this.mainCamera.position.set(200, 200, 200);
    this.mainCamera.lookAt(0, 0, 0);
    
    // Create orthographic camera for 2D views
    const width = this.containerEl.clientWidth;
    const height = this.containerEl.clientHeight;
    const frustumSize = 600;
    const aspectRatio = width / height;
    
    this.orthographicCamera = new THREE.OrthographicCamera(
      frustumSize * aspectRatio / -2,
      frustumSize * aspectRatio / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      10000
    );
    this.orthographicCamera.position.set(0, 0, 500);
    this.orthographicCamera.lookAt(0, 0, 0);
    
    // Set active camera
    this.activeCamera = this.mainCamera;
  }

  /**
   * Initialize scene lighting
   */
  private initializeLights(): void {
    if (!this.scene) return;
    
    const intensity = this.isDarkMode ? 0.4 : 0.6;
    
    // Create ambient light
    const ambient = new THREE.AmbientLight(0xffffff, intensity);
    
    // Create main directional light with shadows
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(100, 100, 100);
    
    if (this.options.shadows) {
      mainLight.castShadow = true;
      mainLight.shadow.camera.near = 0.5;
      mainLight.shadow.camera.far = 2000;
      mainLight.shadow.camera.left = -500;
      mainLight.shadow.camera.right = 500;
      mainLight.shadow.camera.top = 500;
      mainLight.shadow.camera.bottom = -500;
      mainLight.shadow.bias = -0.001;
      
      // Shadow quality based on render quality
      if (this.options.quality === 'high' || this.options.quality === 'ultra') {
        mainLight.shadow.mapSize.width = 4096;
        mainLight.shadow.mapSize.height = 4096;
      } else if (this.options.quality === 'medium') {
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
      } else {
        mainLight.shadow.mapSize.width = 1024;
        mainLight.shadow.mapSize.height = 1024;
      }
    }
    
    // Create secondary light from opposite direction
    const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.6);
    secondaryLight.position.set(-100, 50, -100);
    
    // Create hemisphere light for fill
    const fillLight = new THREE.HemisphereLight(
      0xffffbb, // Sky color
      0x080820, // Ground color
      0.6 // Intensity
    );
    
    // Create spotlights for additional definition
    const spotlights: THREE.SpotLight[] = [];
    
    if (this.options.quality === 'high' || this.options.quality === 'ultra') {
      // Only add these in high quality mode
      const spotlight1 = new THREE.SpotLight(0xffffff, 0.4);
      spotlight1.position.set(200, 200, 200);
      spotlight1.angle = Math.PI / 6;
      spotlight1.penumbra = 0.2;
      spotlight1.decay = 2;
      
      if (this.options.shadows) {
        spotlight1.castShadow = true;
        spotlight1.shadow.mapSize.width = 1024;
        spotlight1.shadow.mapSize.height = 1024;
      }
      
      const spotlight2 = new THREE.SpotLight(0xffffff, 0.3);
      spotlight2.position.set(-200, 100, -200);
      spotlight2.angle = Math.PI / 6;
      spotlight2.penumbra = 0.2;
      spotlight2.decay = 2;
      
      if (this.options.shadows) {
        spotlight2.castShadow = true;
        spotlight2.shadow.mapSize.width = 1024;
        spotlight2.shadow.mapSize.height = 1024;
      }
      
      spotlights.push(spotlight1, spotlight2);
    }
    
    // Add lights to scene
    this.scene.add(ambient);
    this.scene.add(mainLight);
    this.scene.add(secondaryLight);
    this.scene.add(fillLight);
    
    spotlights.forEach(spotlight => {
      this.scene!.add(spotlight);
    });
    
    // Store light references
    this.lights = {
      ambient,
      main: mainLight,
      secondary: secondaryLight,
      fill: fillLight,
      spotlights
    };
  }

  /**
   * Initialize post-processing effects
   */
  private initializePostProcessing(): void {
    if (!this.renderer || !this.scene || !this.activeCamera) return;
    
    // Create effect composer
    this.composer = new EffectComposer(this.renderer);
    
    // Add render pass
    const renderPass = new RenderPass(this.scene, this.activeCamera);
    this.composer.addPass(renderPass);
    
    // Add outline pass for selection highlighting
    if (this.options.outlineSelection) {
      this.outlinePass = new OutlinePass(
        new THREE.Vector2(this.containerEl!.clientWidth, this.containerEl!.clientHeight),
        this.scene,
        this.activeCamera
      );
      
      this.outlinePass.edgeStrength = 3.0;
      this.outlinePass.edgeGlow = 0.3;
      this.outlinePass.edgeThickness = 1.0;
      this.outlinePass.pulsePeriod = 0;
      this.outlinePass.visibleEdgeColor.set('#ff9900');
      this.outlinePass.hiddenEdgeColor.set('#190a05');
      
      this.composer.addPass(this.outlinePass);
    }
    
    // Add SSAO pass for ambient occlusion
    if (this.options.ambientOcclusion && 
        (this.options.quality === 'high' || this.options.quality === 'ultra')) {
      this.ssaoPass = new SSAOPass(
        this.scene,
        this.activeCamera,
        this.containerEl!.clientWidth,
        this.containerEl!.clientHeight
      );
      
      this.ssaoPass.output = SSAOPass.OUTPUT.valueOf();
      this.ssaoPass.kernelRadius = 16;
      this.ssaoPass.minDistance = 0.005;
      this.ssaoPass.maxDistance = 0.1;
      this.composer.addPass(this.ssaoPass);
    }
    
    // Add FXAA pass for anti-aliasing
    if (this.options.fxaa) {
      this.fxaaPass = new ShaderPass(FXAAShader);
      
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (
        this.containerEl!.clientWidth * pixelRatio
      );
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (
        this.containerEl!.clientHeight * pixelRatio
      );
      
      this.composer.addPass(this.fxaaPass);
    }
  }

  /**
   * Initialize grid and axes helpers
   */
  private initializeHelpers(): void {
    if (!this.scene) return;
    
    // Create grid helper
    const gridSize = 2000;
    const gridDivisions = 200;
    
    this.gridHelper = new THREE.GridHelper(
      gridSize,
      gridDivisions,
      0x888888, // Center line color
      0x444444  // Grid color
    );
    this.gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
    this.scene.add(this.gridHelper);
    
    // Create custom axes helper with labels
    this.axesHelper = this.createCustomAxes(100);
    this.scene.add(this.axesHelper);
    
    // Create origin indicator
    this.originIndicator = this.createOriginIndicator();
    this.scene.add(this.originIndicator);
  }

  /**
   * Create custom axes helper with labels and cones
   */
  private createCustomAxes(size: number): THREE.Group {
    const axesGroup = new THREE.Group();
    axesGroup.userData.isCustomAxes = true;
    
    // Create materials for each axis
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xe74c3c }); // Red for X
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x2ecc71 }); // Green for Y
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x3498db }); // Blue for Z
    
    // Create geometries for each axis
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([-size, 0, 0, size, 0, 0], 3)
    );
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([0, -size, 0, 0, size, 0], 3)
    );
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([0, 0, -size, 0, 0, size], 3)
    );
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    
    // Create axis cones for better visibility
    const createAxisCone = (
      position: [number, number, number], 
      rotation: [number, number, number], 
      color: THREE.Color
    ): THREE.Mesh => {
      const geometry = new THREE.ConeGeometry(4, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color });
      const cone = new THREE.Mesh(geometry, material);
      cone.position.set(...position);
      cone.rotation.set(...rotation);
      return cone;
    };
    
    // Create axis labels
    const createAxisLabel = (
      text: string, 
      position: [number, number, number], 
      color: THREE.Color
    ): THREE.Sprite => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      
      if (context) {
        context.fillStyle = 'transparent';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = 'Bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(...position);
        sprite.scale.set(0.05, 0.05, 0.05);
        return sprite;
      }
      
      // Fallback if context is null
      const geometry = new THREE.SphereGeometry(0.5);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      return mesh as unknown as THREE.Sprite;
    };
    
    // Add X axis elements
    axesGroup.add(xAxis);
    axesGroup.add(createAxisLabel('X', [size + 20, 0, 0], new THREE.Color(0xe74c3c)));
    axesGroup.add(createAxisCone([size, 0, 0], [0, 0, -Math.PI / 2], new THREE.Color(0xe74c3c)));
    
    // Add Y axis elements
    axesGroup.add(yAxis);
    axesGroup.add(createAxisLabel('Y', [0, size + 20, 0], new THREE.Color(0x2ecc71)));
    axesGroup.add(createAxisCone([0, size, 0], [0, 0, 0], new THREE.Color(0x2ecc71)));
    
    // Add Z axis elements
    axesGroup.add(zAxis);
    axesGroup.add(createAxisLabel('Z', [0, 0, size + 20], new THREE.Color(0x3498db)));
    axesGroup.add(createAxisCone([0, 0, size], [Math.PI / 2, 0, 0], new THREE.Color(0x3498db)));
    
    return axesGroup;
  }

  /**
   * Create origin indicator
   */
  private createOriginIndicator(): THREE.Group {
    const group = new THREE.Group();
    group.userData.isOriginIndicator = true;
    
    // Create center sphere
    const sphereGeometry = new THREE.SphereGeometry(3, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);
    
    // Create ring around origin
    const ringGeometry = new THREE.RingGeometry(5, 6, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    
    // Create rings for each plane
    const xyRing = new THREE.Mesh(ringGeometry, ringMaterial);
    xyRing.rotation.x = Math.PI / 2;
    
    const yzRing = new THREE.Mesh(ringGeometry, ringMaterial);
    yzRing.rotation.y = Math.PI / 2;
    
    const xzRing = new THREE.Mesh(ringGeometry, ringMaterial);
    xzRing.rotation.z = Math.PI / 2;
    
    group.add(xyRing);
    group.add(yzRing);
    group.add(xzRing);
    
    return group;
  }

  /**
   * Initialize camera controls
   */
  private initializeControls(): void {
    if (!this.mainCamera || !this.canvas) return;
    
    // Create orbit controls
    this.controls = new OrbitControls(this.mainCamera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.rotateSpeed = 0.7;
    this.controls.panSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 5000;
    this.controls.maxPolarAngle = Math.PI; // Allow camera to go below the ground plane
    this.controls.screenSpacePanning = true; // Pan parallel to the ground plane
    this.controls.keyPanSpeed = 50; // For keyboard controls
    this.controls.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown'
    };
  }

  /**
   * Initialize view cube for easy navigation
   */
  private initializeViewCube(): void {
    if (!this.scene || !this.mainCamera || !this.containerEl) return;
    
    this.viewCube = new ViewCubeController(
      this.scene, 
      this.mainCamera, 
      this.controls!, 
      this.containerEl
    );
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (this.isDestroyed) return;
    
    this.frameId = requestAnimationFrame(this.animate);
    
    // Update controls if available
    if (this.controls) {
      this.controls.update();
    }
    
    // Update view cube if available
    if (this.viewCube) {
      this.viewCube.update();
    }
    
    // Call before render callback
    if (this.callbacks.onSceneBeforeRender && this.scene && this.activeCamera) {
      this.callbacks.onSceneBeforeRender(
        this.scene, 
        this.activeCamera as THREE.PerspectiveCamera
      );
    }
    
    // Render scene using effect composer if available, otherwise use renderer
    if (this.composer && this.scene && this.activeCamera) {
      this.composer.render();
    } else if (this.renderer && this.scene && this.activeCamera) {
      this.renderer.render(this.scene, this.activeCamera);
    }
    
    // Call render callback
    if (this.callbacks.onSceneRender && this.scene && this.activeCamera) {
      this.callbacks.onSceneRender(
        this.scene, 
        this.activeCamera as THREE.PerspectiveCamera
      );
    }
    
    // Update stats if available
    if (this.performanceStats) {
      this.performanceStats.update();
    }
  };

  /**
   * Handle window resize
   */
  private handleResize(): void {
    if (!this.renderer || !this.mainCamera || !this.orthographicCamera || !this.containerEl) return;
    
    const width = this.containerEl.clientWidth;
    const height = this.containerEl.clientHeight;
    
    // Update renderer size
    this.renderer.setSize(width, height);
    
    // Update perspective camera aspect ratio
    this.mainCamera.aspect = width / height;
    this.mainCamera.updateProjectionMatrix();
    
    // Update orthographic camera frustum
    const frustumSize = 600;
    const aspect = width / height;
    
    this.orthographicCamera.left = frustumSize * aspect / -2;
    this.orthographicCamera.right = frustumSize * aspect / 2;
    this.orthographicCamera.top = frustumSize / 2;
    this.orthographicCamera.bottom = frustumSize / -2;
    this.orthographicCamera.updateProjectionMatrix();
    
    // Update post-processing if available
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    
    // Update FXAA pass resolution
    if (this.fxaaPass) {
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
    
    // Update view cube if available
    if (this.viewCube) {
      this.viewCube.onResize();
    }
  }

  /**
   * Select objects for highlighting
   */
  public selectObjects(objects: THREE.Object3D[]): void {
    this.selectedObjects = objects;
    
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = objects;
    }
    
    if (objects.length > 0 && this.callbacks.onObjectSelected) {
      this.callbacks.onObjectSelected(objects[0]);
    } else if (this.callbacks.onObjectSelected) {
      this.callbacks.onObjectSelected(null);
    }
  }

  /**
   * Set hover object
   */
  public setHoverObject(object: THREE.Object3D | null): void {
    this.hoveredObject = object;
  }

  /**
   * Set view mode (2D or 3D)
   */
  public setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    
    this.viewMode = mode;
    
    if (!this.scene || !this.mainCamera || !this.orthographicCamera || !this.controls) return;
    
    switch (mode) {
      case '2d':
        // Switch to orthographic camera for 2D view
        this.activeCamera = this.orthographicCamera;
        this.orthographicCamera.position.set(0, 0, 500);
        this.orthographicCamera.lookAt(0, 0, 0);
        this.orthographicCamera.up.set(0, 1, 0);
        
        // Limit controls for 2D view
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = 0;
        
        // Update grid and axes for 2D view
        if (this.gridHelper) {
          this.gridHelper.rotation.x = 0; // XY plane in 2D view
        }
        
        if (this.axesHelper) {
          // Hide Z axis in 2D view
          this.axesHelper.children.forEach((child, index) => {
            if (index % 3 === 2) { // Z-axis elements (every third element)
              child.visible = false;
            }
          });
        }
        
        // Hide view cube in 2D mode
        if (this.viewCube) {
          this.viewCube.hide();
        }
        break;
        
      case 'isometric':
        // Use perspective camera for isometric view
        this.activeCamera = this.mainCamera;
        
        // Set isometric view (45° rotation around Y, then 35.264° around X)
        this.mainCamera.position.set(500, 500, 500);
        this.mainCamera.lookAt(0, 0, 0);
        
        // Enable controls for isometric view
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.minPolarAngle = Math.PI / 4; // 45 degrees
        this.controls.maxPolarAngle = Math.PI / 3; // 60 degrees
        
        // Update grid and axes
        if (this.gridHelper) {
          this.gridHelper.rotation.x = Math.PI / 2;
        }
        
        if (this.axesHelper) {
          this.axesHelper.children.forEach(child => {
            child.visible = true;
          });
        }
        
        // Show view cube
        if (this.viewCube) {
          this.viewCube.show();
        }
        break;
        
      case 'top':
        // Use orthographic camera for top view
        this.activeCamera = this.orthographicCamera;
        this.orthographicCamera.position.set(0, 0, 500);
        this.orthographicCamera.lookAt(0, 0, 0);
        this.orthographicCamera.up.set(0, 1, 0);
        
        // Enable limited controls
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        
        // Update grid and axes
        if (this.gridHelper) {
          this.gridHelper.rotation.x = 0;
        }
        
        if (this.viewCube) {
          this.viewCube.show();
        }
        break;
        
      case 'front':
        // Use orthographic camera for front view
        this.activeCamera = this.orthographicCamera;
        this.orthographicCamera.position.set(0, -500, 0);
        this.orthographicCamera.lookAt(0, 0, 0);
        this.orthographicCamera.up.set(0, 0, 1);
        
        // Enable limited controls
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        
        if (this.viewCube) {
          this.viewCube.show();
        }
        break;
        
      case 'right':
        // Use orthographic camera for right view
        this.activeCamera = this.orthographicCamera;
        this.orthographicCamera.position.set(500, 0, 0);
        this.orthographicCamera.lookAt(0, 0, 0);
        this.orthographicCamera.up.set(0, 0, 1);
        
        // Enable limited controls
        this.controls.enableRotate = false;
        this.controls.enablePan = true;
        
        if (this.viewCube) {
          this.viewCube.show();
        }
        break;
        
      case '3d':
      default:
        // Switch to perspective camera for 3D view
        this.activeCamera = this.mainCamera;
        
        // Reset camera position if needed
        if (this.mainCamera.position.z > 1000) {
          this.mainCamera.position.set(200, 200, 200);
          this.mainCamera.lookAt(0, 0, 0);
        }
        
        // Enable full controls for 3D view
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = Math.PI;
        
        // Update grid and axes for 3D view
        if (this.gridHelper) {
          this.gridHelper.rotation.x = Math.PI / 2; // XZ plane in 3D view
        }
        
        if (this.axesHelper) {
          // Show all axes in 3D view
          this.axesHelper.children.forEach(child => {
            child.visible = true;
          });
        }
        
        // Show view cube in 3D mode
        if (this.viewCube) {
          this.viewCube.show();
        }
        break;
    }
    
    // Update post-processing passes with new camera
    this.updatePostProcessingPasses();
    
    // Call view mode changed callback
    if (this.callbacks.onViewModeChanged) {
      this.callbacks.onViewModeChanged(mode);
    }
  }

  /**
   * Update post-processing passes with current camera
   */
  private updatePostProcessingPasses(): void {
    if (!this.activeCamera || !this.scene) return;
    
    if (this.composer) {
      // Update render pass
      const renderPass = this.composer.passes[0] as RenderPass;
      renderPass.camera = this.activeCamera;
      
      // Update outline pass
      if (this.outlinePass) {
        this.outlinePass.renderCamera = this.activeCamera;
      }
      
      // Update SSAO pass
      if (this.ssaoPass) {
        this.ssaoPass.camera = this.activeCamera;
      }
    }
  }

  /**
   * Set grid visibility
   */
  public setGridVisible(visible: boolean): void {
    if (this.gridHelper) {
      this.gridHelper.visible = visible;
    }
  }

  /**
   * Set axes visibility
   */
  public setAxesVisible(visible: boolean): void {
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }

  /**
   * Set origin offset
   */
  public setOriginOffset(offset: { x: number, y: number, z: number }): void {
    this.originOffset = { ...offset };
    
    if (this.gridHelper) {
      this.gridHelper.position.set(offset.x, offset.y, offset.z);
    }
    
    if (this.originIndicator) {
      this.originIndicator.position.set(offset.x, offset.y, offset.z);
    }
  }

  /**
   * Get current scene
   */
  public getScene(): THREE.Scene | null {
    return this.scene;
  }

  /**
   * Get current camera
   */
  public getCamera(): THREE.Camera | null {
    return this.activeCamera;
  }

  /**
   * Get perspective camera
   */
  public getPerspectiveCamera(): THREE.PerspectiveCamera | null {
    return this.mainCamera;
  }

  /**
   * Get orthographic camera
   */
  public getOrthographicCamera(): THREE.OrthographicCamera | null {
    return this.orthographicCamera;
  }

  /**
   * Get controls
   */
  public getControls(): OrbitControls | null {
    return this.controls;
  }

  /**
   * Get renderer
   */
  public getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  /**
   * Get canvas element
   */
  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /**
   * Set camera position
   */
  public setCameraPosition(position: { x: number, y: number, z: number }): void {
    if (this.mainCamera) {
      this.mainCamera.position.set(position.x, position.y, position.z);
    }
  }

  /**
   * Set camera look at
   */
  public setCameraLookAt(target: { x: number, y: number, z: number }): void {
    if (this.mainCamera) {
      this.mainCamera.lookAt(target.x, target.y, target.z);
    }
  }

  /**
   * Set camera zoom
   */
  public setCameraZoom(zoom: number): void {
    if (this.activeCamera) {
      if (this.activeCamera instanceof THREE.PerspectiveCamera) {
        // For perspective camera, adjust FOV
        this.activeCamera.fov = 45 / zoom;
        this.activeCamera.updateProjectionMatrix();
      } else if (this.activeCamera instanceof THREE.OrthographicCamera) {
        // For orthographic camera, adjust zoom directly
        this.activeCamera.zoom = zoom;
        this.activeCamera.updateProjectionMatrix();
      }
    }
  }

  /**
   * Take a screenshot
   */
  public takeScreenshot(): string | null {
    if (!this.renderer) return null;
    
    // Render scene
    if (this.scene && this.activeCamera) {
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.activeCamera);
      }
    }
    
    // Get data URL
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * Calculate appropriate pixel ratio based on quality setting
   */
  private getPixelRatioForQuality(): number {
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    if (!this.options.highDPI) {
      return 1;
    }
    
    switch (this.options.quality) {
      case 'ultra':
        return devicePixelRatio;
      case 'high':
        return Math.min(devicePixelRatio, 2);
      case 'medium':
        return Math.min(devicePixelRatio, 1.5);
      case 'low':
      default:
        return 1;
    }
  }

  /**
   * Set theme mode
   */
  public setThemeMode(isDark: boolean): void {
    this.isDarkMode = isDark;
    
    if (this.scene) {
      // Update background color
      const backgroundColor = isDark 
        ? this.options.backgroundColor || '#1a1a1a'
        : '#f5f5f5';
      
      this.scene.background = new THREE.Color(backgroundColor);
      
      // Update fog color
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color = new THREE.Color(backgroundColor);
      }
    }
    
    // Update light intensities
    if (this.lights) {
      this.lights.ambient.intensity = isDark ? 0.3 : 0.5;
    }
  }

  /**
   * Set render quality
   */
  public setRenderQuality(quality: RenderQuality): void {
    this.options.quality = quality;
    
    if (this.renderer) {
      // Update pixel ratio
      this.renderer.setPixelRatio(this.getPixelRatioForQuality());
    }
    
    // Update shadow quality
    this.updateShadowQuality();
    
    // Enable/disable SSAO based on quality
    if (this.ssaoPass) {
      this.ssaoPass.enabled = Boolean(
        this.options.ambientOcclusion && 
        (quality === 'high' || quality === 'ultra')
      );
    }
    
    // Reinitialize post-processing
    this.initializePostProcessing();
  }

  /**
   * Update shadow quality based on current quality setting
   */
  private updateShadowQuality(): void {
    if (!this.lights || !this.options.shadows) return;
    
    // Update main directional light shadow quality
    if (this.options.quality === 'high' || this.options.quality === 'ultra') {
      this.lights.main.shadow.mapSize.width = 4096;
      this.lights.main.shadow.mapSize.height = 4096;
    } else if (this.options.quality === 'medium') {
      this.lights.main.shadow.mapSize.width = 2048;
      this.lights.main.shadow.mapSize.height = 2048;
    } else {
      this.lights.main.shadow.mapSize.width = 1024;
      this.lights.main.shadow.mapSize.height = 1024;
    }
    
    // Update spotlight shadow quality
    this.lights.spotlights.forEach(spotlight => {
      if (this.options.quality === 'high' || this.options.quality === 'ultra') {
        spotlight.shadow.mapSize.width = 1024;
        spotlight.shadow.mapSize.height = 1024;
      } else {
        spotlight.shadow.mapSize.width = 512;
        spotlight.shadow.mapSize.height = 512;
      }
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.isDestroyed = true;
    
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
    
    // Remove window event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    
    // Dispose of Three.js resources
    if (this.scene) {
      this.disposeScene(this.scene);
    }
    
    // Dispose of post-processing passes
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    
    // Remove DOM elements
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    
    // Clear material cache
    this.materialCache.clear();
    
    // Clear object cache
    this.objectsCache.clear();
    
    // Clear references
    this.renderer = null;
    this.scene = null;
    this.mainCamera = null;
    this.orthographicCamera = null;
    this.activeCamera = null;
    this.controls = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.originIndicator = null;
    this.viewCube = null;
    this.lights = null;
    this.composer = null;
    this.outlinePass = null;
    this.ssaoPass = null;
    this.fxaaPass = null;
    this.performanceStats = null;
    this.canvas = null;
    this.containerEl = null;
    this.selectedObjects = [];
    this.hoveredObject = null;
  }

  /**
   * Dispose of scene objects recursively
   */
  private disposeScene(scene: THREE.Scene): void {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          object.geometry.dispose();
        }
        
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => this.disposeMaterial(material));
          } else {
            this.disposeMaterial(object.material);
          }
        }
      }
    });
  }

  /**
   * Dispose of material resources
   */
  private disposeMaterial(material: THREE.Material): void {
    // Dispose of material
    material.dispose();
    
    // Dispose of material textures
    const stdMaterial = material as THREE.MeshStandardMaterial;
    if (stdMaterial.map) stdMaterial.map.dispose();
    if (stdMaterial.normalMap) stdMaterial.normalMap.dispose();
    if (stdMaterial.roughnessMap) stdMaterial.roughnessMap.dispose();
    if (stdMaterial.metalnessMap) stdMaterial.metalnessMap.dispose();
    if (stdMaterial.emissiveMap) stdMaterial.emissiveMap.dispose();
    if (stdMaterial.alphaMap) stdMaterial.alphaMap.dispose();
    if (stdMaterial.bumpMap) stdMaterial.bumpMap.dispose();
    if (stdMaterial.displacementMap) stdMaterial.displacementMap.dispose();
    if (stdMaterial.aoMap) stdMaterial.aoMap.dispose();
    if (stdMaterial.lightMap) stdMaterial.lightMap.dispose();
    if (stdMaterial.envMap) stdMaterial.envMap.dispose();
  }

  /**
   * Create a scene element from element data
   */
  public createSceneElement(
    element: Element, 
    layers: Layer[], 
    originOffset: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 }
  ): THREE.Object3D | null {
    // Find the layer for this element
    const layer = layers.find(l => l.id === element.layerId);
    
    // Skip if layer is not found or not visible
    if (!layer || !layer.visible) return null;
    
    // Create different Three.js objects based on element type
    const elementId = element.id;
    const objectCacheKey = `${elementId}_${layer.id}`;
    
    // Check if we already have this element in cache
    if (this.objectsCache.has(objectCacheKey)) {
      const cachedObject = this.objectsCache.get(objectCacheKey)!;
      this.updateElementPosition(cachedObject, element, originOffset);
      return cachedObject;
    }
    
    // Create a new object
    let object: THREE.Object3D | null = null;
    
    try {
      switch (element.type) {
        case 'line':
          object = this.createLine(element, layer, originOffset);
          break;
        case 'circle':
          object = this.createCircle(element, layer, originOffset);
          break;
        case 'rectangle':
          object = this.createRectangle(element, layer, originOffset);
          break;
        case 'cube':
          object = this.createCube(element, layer, originOffset);
          break;
        case 'sphere':
          object = this.createSphere(element, layer, originOffset);
          break;
        case 'cylinder':
          object = this.createCylinder(element, layer, originOffset);
          break;
        case 'cone':
          object = this.createCone(element, layer, originOffset);
          break;
        case 'torus':
          object = this.createTorus(element, layer, originOffset);
          break;
        case 'text':
          object = this.createText(element, layer, originOffset);
          break;
        case 'group':
          object = this.createGroup(element, layer, originOffset);
          break;
        case 'workpiece':
          object = this.createWorkpiece(element, layer, originOffset);
          break;
        default:
          console.warn(`Unsupported element type: ${element.type}`);
          return null;
      }
      
      // Cache the object for future reference
      if (object) {
        this.objectsCache.set(objectCacheKey, object);
      }
      
      return object;
    } catch (error) {
      console.error(`Error creating element ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Update element position and rotation
   */
  private updateElementPosition(
    object: THREE.Object3D, 
    element: any, 
    originOffset: { x: number, y: number, z: number }
  ): void {
    if (element.x !== undefined && element.y !== undefined) {
      object.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );
    }
    
    // Update rotation if available
    if (element.angleX || element.angleY || element.angleZ || element.angle) {
      object.rotation.set(
        (element.angleX || 0) * Math.PI / 180,
        (element.angleY || 0) * Math.PI / 180,
        ((element.angleZ || element.angle || 0) * Math.PI / 180)
      );
    }
    
    // Update line endpoints
    if (element.type === 'line' && object instanceof THREE.Line) {
      const positions = object.geometry.getAttribute('position');
      
      positions.setXYZ(
        0,
        element.x1 + originOffset.x,
        element.y1 + originOffset.y,
        (element.z1 || 0) + originOffset.z
      );
      
      positions.setXYZ(
        1,
        element.x2 + originOffset.x,
        element.y2 + originOffset.y,
        (element.z2 || 0) + originOffset.z
      );
      
      positions.needsUpdate = true;
    }
  }

  /**
   * Create line element
   */
  private createLine(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Line {
    const materialKey = `line_${element.color || layer.color}_${element.linewidth || 1}`;
    let lineMaterial: THREE.LineBasicMaterial;
    
    if (this.materialCache.has(materialKey)) {
      lineMaterial = this.materialCache.get(materialKey) as THREE.LineBasicMaterial;
    } else {
      lineMaterial = new THREE.LineBasicMaterial({
        color: element.color || layer.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      this.materialCache.set(materialKey, lineMaterial);
    }
    
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
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.userData.elementId = element.id;
    line.userData.isCADElement = true;
    line.userData.elementType = 'line';
    line.castShadow = false;
    line.receiveShadow = false;
    
    return line;
  }

  /**
   * Create circle element
   */
  private createCircle(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'circle';
    
    // Material keys for caching
    const fillMaterialKey = `circle_fill_${element.color || layer.color}_${element.wireframe || false}`;
    const outlineMaterialKey = `circle_outline_${element.color || layer.color}_${element.linewidth || 1}`;
    
    // Get or create fill material
    let circleMaterial: THREE.MeshBasicMaterial;
    
    if (this.materialCache.has(fillMaterialKey)) {
      circleMaterial = this.materialCache.get(fillMaterialKey) as THREE.MeshBasicMaterial;
    } else {
      circleMaterial = new THREE.MeshBasicMaterial({
        color: element.color || layer.color || 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
        wireframe: element.wireframe || false
      });
      this.materialCache.set(fillMaterialKey, circleMaterial);
    }
    
    // Get or create outline material
    let outlineMaterial: THREE.LineBasicMaterial;
    
    if (this.materialCache.has(outlineMaterialKey)) {
      outlineMaterial = this.materialCache.get(outlineMaterialKey) as THREE.LineBasicMaterial;
    } else {
      outlineMaterial = new THREE.LineBasicMaterial({
        color: element.color || layer.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      this.materialCache.set(outlineMaterialKey, outlineMaterial);
    }
    
    // Create circle mesh
    const circleGeometry = new THREE.CircleGeometry(element.radius, 64);
    const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
    circleMesh.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    circleMesh.rotation.x = Math.PI / 2; // Align with XY plane
    
    // Create circle outline
    const outlineGeometry = new THREE.BufferGeometry();
    const points = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(theta) * element.radius,
          Math.sin(theta) * element.radius,
          0
        )
      );
    }
    outlineGeometry.setFromPoints(points);
    
    const outline = new THREE.Line(outlineGeometry, outlineMaterial);
    outline.position.copy(circleMesh.position);
    outline.rotation.copy(circleMesh.rotation);
    
    group.add(circleMesh);
    group.add(outline);
    
    return group;
  }

  /**
   * Create rectangle element
   */
  private createRectangle(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'rectangle';
    
    // Material keys for caching
    const fillMaterialKey = `rect_fill_${element.color || layer.color}_${element.wireframe || false}`;
    const outlineMaterialKey = `rect_outline_${element.color || layer.color}_${element.linewidth || 1}`;
    
    // Get or create fill material
    let rectMaterial: THREE.MeshBasicMaterial;
    
    if (this.materialCache.has(fillMaterialKey)) {
      rectMaterial = this.materialCache.get(fillMaterialKey) as THREE.MeshBasicMaterial;
    } else {
      rectMaterial = new THREE.MeshBasicMaterial({
        color: element.color || layer.color || 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
        wireframe: element.wireframe || false
      });
      this.materialCache.set(fillMaterialKey, rectMaterial);
    }
    
    // Get or create outline material
    let outlineMaterial: THREE.LineBasicMaterial;
    
    if (this.materialCache.has(outlineMaterialKey)) {
      outlineMaterial = this.materialCache.get(outlineMaterialKey) as THREE.LineBasicMaterial;
    } else {
      outlineMaterial = new THREE.LineBasicMaterial({
        color: element.color || layer.color || 0x000000,
        linewidth: element.linewidth || 1
      });
      this.materialCache.set(outlineMaterialKey, outlineMaterial);
    }
    
    // Create rectangle mesh
    const rectGeometry = new THREE.PlaneGeometry(element.width, element.height);
    const rectMesh = new THREE.Mesh(rectGeometry, rectMaterial);
    rectMesh.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angle || element.angleZ) {
      const angle = (element.angle || element.angleZ || 0) * Math.PI / 180;
      rectMesh.rotation.z = angle;
    }
    
    if (element.angleX) {
      rectMesh.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      rectMesh.rotation.y = element.angleY * Math.PI / 180;
    }
    
    // Create rectangle outline
    const outlineGeometry = new THREE.BufferGeometry();
    const halfWidth = element.width / 2;
    const halfHeight = element.height / 2;
    const points = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, -halfHeight, 0)
    ];
    outlineGeometry.setFromPoints(points);
    
    const outline = new THREE.Line(outlineGeometry, outlineMaterial);
    outline.position.copy(rectMesh.position);
    outline.rotation.copy(rectMesh.rotation);
    
    group.add(rectMesh);
    group.add(outline);
    
    return group;
  }

  /**
   * Create cube element
   */
  private createCube(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'cube';
    
    // Material key for caching
    const materialKey = `cube_${element.color || layer.color}_${element.wireframe || false}`;
    
    // Get or create material
    let cubeMaterial: THREE.MeshStandardMaterial;
    
    if (this.materialCache.has(materialKey)) {
      cubeMaterial = this.materialCache.get(materialKey) as THREE.MeshStandardMaterial;
    } else {
      cubeMaterial = new THREE.MeshStandardMaterial({
        color: element.color || layer.color || 0x1e88e5,
        wireframe: element.wireframe || false,
        transparent: true,
        opacity: element.wireframe ? 1.0 : 0.8,
        roughness: 0.7,
        metalness: 0.2
      });
      this.materialCache.set(materialKey, cubeMaterial);
    }
    
    // Create cube geometry
    const cubeGeometry = new THREE.BoxGeometry(
      element.width,
      element.height,
      element.depth
    );
    
    // Create cube mesh
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angleX) {
      cube.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      cube.rotation.y = element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      cube.rotation.z = (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    cube.castShadow = this.options.shadows ?? false;
    cube.receiveShadow = this.options.shadows ?? false;
    
    group.add(cube);
    // Add wireframe if not already wireframe
    if (!element.wireframe) {
      const edgesGeometry = new THREE.EdgesGeometry(cubeGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edges.position.copy(cube.position);
      edges.rotation.copy(cube.rotation);
      group.add(edges);
    }
    
    return group;
  }

  /**
   * Create sphere element
   */
  private createSphere(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'sphere';
    
    // Material key for caching
    const materialKey = `sphere_${element.color || layer.color}_${element.wireframe || false}`;
    
    // Get or create material
    let sphereMaterial: THREE.MeshStandardMaterial;
    
    if (this.materialCache.has(materialKey)) {
      sphereMaterial = this.materialCache.get(materialKey) as THREE.MeshStandardMaterial;
    } else {
      sphereMaterial = new THREE.MeshStandardMaterial({
        color: element.color || layer.color || 0x1e88e5,
        wireframe: element.wireframe || false,
        transparent: true,
        opacity: element.wireframe ? 1.0 : 0.8,
        roughness: 0.7,
        metalness: 0.2
      });
      this.materialCache.set(materialKey, sphereMaterial);
    }
    
    // Create sphere geometry with appropriate level of detail
    const segments = this.getDetailLevel(32);
    const sphereGeometry = new THREE.SphereGeometry(
      element.radius,
      segments,
      segments
    );
    
    // Create sphere mesh
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    sphere.castShadow = this.options.shadows ?? false;
    sphere.receiveShadow = this.options.shadows ?? false;
    
    group.add(sphere);
    // Add wireframe if not already wireframe
    if (!element.wireframe) {
      const wireframeGeometry = new THREE.WireframeGeometry(sphereGeometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      wireframe.position.copy(sphere.position);
      group.add(wireframe);
    }
    
    return group;
  }

  /**
   * Create cylinder element
   */
  private createCylinder(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'cylinder';
    
    // Material key for caching
    const materialKey = `cylinder_${element.color || layer.color}_${element.wireframe || false}`;
    
    // Get or create material
    let cylinderMaterial: THREE.MeshStandardMaterial;
    
    if (this.materialCache.has(materialKey)) {
      cylinderMaterial = this.materialCache.get(materialKey) as THREE.MeshStandardMaterial;
    } else {
      cylinderMaterial = new THREE.MeshStandardMaterial({
        color: element.color || layer.color || 0xFFC107,
        wireframe: element.wireframe || false,
        transparent: true,
        opacity: element.wireframe ? 1.0 : 0.8,
        roughness: 0.7,
        metalness: 0.2
      });
      this.materialCache.set(materialKey, cylinderMaterial);
    }
    
    // Create cylinder geometry with appropriate level of detail
    const segments = this.getDetailLevel(32);
    const cylinderGeometry = new THREE.CylinderGeometry(
      element.radius,
      element.radius,
      element.height,
      segments
    );
    
    // Create cylinder mesh
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Rotate to make height along Z axis
    cylinder.rotation.x = Math.PI / 2;
    
    // Apply additional rotation
    if (element.angleX) {
      cylinder.rotation.x += element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      cylinder.rotation.y += element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      cylinder.rotation.z += (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    cylinder.castShadow = this.options.shadows ?? false;
    cylinder.receiveShadow = this.options.shadows ?? false;
    
    group.add(cylinder);
    // Add wireframe if not already wireframe
    if (!element.wireframe) {
      const edgesGeometry = new THREE.EdgesGeometry(cylinderGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edges.position.copy(cylinder.position);
      edges.rotation.copy(cylinder.rotation);
      group.add(edges);
    }
    
    return group;
  }

  /**
   * Create cone element
   */
  private createCone(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'cone';
    
    // Material key for caching
    const materialKey = `cone_${element.color || layer.color}_${element.wireframe || false}`;
    
    // Get or create material
    let coneMaterial: THREE.MeshStandardMaterial;
    
    if (this.materialCache.has(materialKey)) {
      coneMaterial = this.materialCache.get(materialKey) as THREE.MeshStandardMaterial;
    } else {
      coneMaterial = new THREE.MeshStandardMaterial({
        color: element.color || layer.color || 0x9C27B0,
        wireframe: element.wireframe || false,
        transparent: true,
        opacity: element.wireframe ? 1.0 : 0.8,
        roughness: 0.7,
        metalness: 0.2
      });
      this.materialCache.set(materialKey, coneMaterial);
    }
    
    // Create cone geometry with appropriate level of detail
    const segments = this.getDetailLevel(32);
    const coneGeometry = new THREE.ConeGeometry(
      element.radius,
      element.height,
      segments
    );
    
    // Create cone mesh
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Rotate to make height along Z axis
    cone.rotation.x = Math.PI / 2;
    
    // Apply additional rotation
    if (element.angleX) {
      cone.rotation.x += element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      cone.rotation.y += element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      cone.rotation.z += (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    cone.castShadow = this.options.shadows || false;
    cone.receiveShadow = this.options.shadows || false;
    
    group.add(cone);
    
    // Add wireframe if not already wireframe
    if (!element.wireframe) {
      const edgesGeometry = new THREE.EdgesGeometry(coneGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edges.position.copy(cone.position);
      edges.rotation.copy(cone.rotation);
      group.add(edges);
    }
    
    return group;
  }

  /**
   * Create torus element
   */
  private createTorus(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'torus';
    
    // Material key for caching
    const materialKey = `torus_${element.color || layer.color}_${element.wireframe || false}`;
    
    // Get or create material
    let torusMaterial: THREE.MeshStandardMaterial;
    
    if (this.materialCache.has(materialKey)) {
      torusMaterial = this.materialCache.get(materialKey) as THREE.MeshStandardMaterial;
    } else {
      torusMaterial = new THREE.MeshStandardMaterial({
        color: element.color || layer.color || 0xFF9800,
        wireframe: element.wireframe || false,
        transparent: true,
        opacity: element.wireframe ? 1.0 : 0.8,
        roughness: 0.7,
        metalness: 0.2
      });
      this.materialCache.set(materialKey, torusMaterial);
    }
    
    // Set appropriate detail level based on quality
    const radialSegments = this.getDetailLevel(16);
    const tubularSegments = this.getDetailLevel(100);
    
    // Create torus geometry
    const torusGeometry = new THREE.TorusGeometry(
      element.radius,
      element.tubeRadius || element.radius / 4,
      radialSegments,
      tubularSegments
    );
    
    // Create torus mesh
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angleX) {
      torus.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      torus.rotation.y = element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      torus.rotation.z = (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    torus.castShadow = this.options.shadows ?? false;
    torus.receiveShadow = this.options.shadows ?? false;
    
    group.add(torus);
    // Add wireframe if not already wireframe
    if (!element.wireframe) {
      const wireframeGeometry = new THREE.WireframeGeometry(torusGeometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      wireframe.position.copy(torus.position);
      wireframe.rotation.copy(torus.rotation);
      group.add(wireframe);
    }
    
    return group;
  }

  /**
   * Create text element
   */
  private createText(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'text';
    group.userData.text = element.text;
    
    // Create a colored plane as a background
    const planeGeometry = new THREE.PlaneGeometry(
      element.text.length * (element.size || 5),
      element.size || 10
    );
    
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    
    // Create text sprite
    const textSprite = this.createTextSprite(
      element.text,
      element.color || layer.color || '#000000',
      element.size || 10
    );
    
    // Add to group
    group.add(plane);
    group.add(textSprite);
    
    // Position group
    group.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angleX) {
      group.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      group.rotation.y = element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      group.rotation.z = (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    return group;
  }

  /**
   * Create a text sprite for text rendering
   */
  private createTextSprite(text: string, color: string, size: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const scale = 2; // Scale for better resolution
    canvas.width = text.length * size * scale;
    canvas.height = size * 2 * scale;
    
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas context');
    }
    
    // Draw background
    context.fillStyle = 'rgba(255,255,255,0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.font = `Bold ${size * scale}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(size * text.length / 10, size / 5, 1);
    
    return sprite;
  }

  /**
   * Create group element
   */
  private createGroup(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'group';
    
    // Position the group
    group.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angleX) {
      group.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      group.rotation.y = element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      group.rotation.z = (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    // Create and add child elements
    if (element.elements && Array.isArray(element.elements)) {
      element.elements.forEach((childElement: any) => {
        const child = this.createSceneElement(
          childElement,
          [layer],
          { x: 0, y: 0, z: 0 } // Children are relative to group
        );
        
        if (child) {
          group.add(child);
        }
      });
    }
    
    return group;
  }

  /**
   * Create workpiece element
   */
  private createWorkpiece(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'workpiece';
    
    // Material for workpiece
    const workpieceMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0xaaaaaa,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: 0.5,
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide
    });
    
    // Create workpiece mesh
    const workpieceGeometry = new THREE.BoxGeometry(
      element.width,
      element.height,
      element.depth
    );
    
    const workpieceMesh = new THREE.Mesh(workpieceGeometry, workpieceMaterial);
    workpieceMesh.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    workpieceMesh.castShadow = this.options.shadows ?? false;
    workpieceMesh.receiveShadow = this.options.shadows ?? false;
    
    // Create workpiece edges
    const edgesGeometry = new THREE.EdgesGeometry(workpieceGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1
    });
    
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(workpieceMesh.position);
    
    // Add coordinate system at workpiece origin
    const coordinateSystem = new THREE.Group();
    coordinateSystem.position.copy(workpieceMesh.position);
    
    // X axis (red)
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([-element.width/2, 0, 0, element.width/2, 0, 0], 3)
    );
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xe74c3c });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    coordinateSystem.add(xAxis);
    
    // Y axis (green)
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([0, -element.height/2, 0, 0, element.height/2, 0], 3)
    );
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x2ecc71 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    coordinateSystem.add(yAxis);
    
    // Z axis (blue)
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', 
      new THREE.Float32BufferAttribute([0, 0, -element.depth/2, 0, 0, element.depth/2], 3)
    );
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x3498db });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    coordinateSystem.add(zAxis);
    
    // Add material legend
    const materialIndicator = this.createMaterialIndicator(element.material || 'unknown');
    materialIndicator.position.set(element.width / 2 - 20, element.height / 2 - 20, element.depth / 2);
    
    group.add(workpieceMesh);
    group.add(edges);
    group.add(coordinateSystem);
    group.add(materialIndicator);
    
    return group;
  }

  /**
   * Create a material indicator
   */
  private createMaterialIndicator(material: string): THREE.Group {
    const group = new THREE.Group();
    
    // Color based on material
    let color: number;
    switch (material.toLowerCase()) {
      case 'aluminum':
        color = 0xD1D1D1;
        break;
      case 'steel':
        color = 0x808080;
        break;
      case 'wood':
        color = 0x8B4513;
        break;
      case 'plastic':
        color = 0x6BAED6;
        break;
      case 'brass':
        color = 0xFFD700;
        break;
      case 'titanium':
        color = 0xB6B6B6;
        break;
      default:
        color = 0xCCCCCC;
    }
    
    // Create a small cube with the material color
    const cubeGeometry = new THREE.BoxGeometry(10, 10, 10);
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.7
    });
    
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    
    // Create text label
    const textSprite = this.createTextSprite(
      material.toUpperCase(),
      '#FFFFFF',
      5
    );
    textSprite.position.set(0, 0, 5);
    
    group.add(cube);
    group.add(textSprite);
    
    return group;
  }

  /**
   * Get appropriate detail level based on quality setting
   */
  private getDetailLevel(baseLevel: number): number {
    switch (this.options.quality) {
      case 'ultra':
        return baseLevel * 1.5;
      case 'high':
        return baseLevel;
      case 'medium':
        return Math.floor(baseLevel * 0.75);
      case 'low':
      default:
        return Math.floor(baseLevel * 0.5);
    }
  }

  /**
   * Enable/disable ambient occlusion
   */
  public setAmbientOcclusion(enabled: boolean): void {
    this.options.ambientOcclusion = enabled;
    
    if (this.ssaoPass) {
      this.ssaoPass.enabled = enabled;
    } else if (enabled) {
      // Need to initialize post-processing if not already done
      this.initializePostProcessing();
    }
  }

  /**
   * Enable/disable shadows
   */
  public setShadows(enabled: boolean): void {
    this.options.shadows = enabled;
    
    if (this.renderer) {
      this.renderer.shadowMap.enabled = enabled;
    }
    
    // Update shadow casting for objects
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = enabled;
          object.receiveShadow = enabled;
        }
      });
    }
    
    // Update lights
    if (this.lights) {
      this.lights.main.castShadow = enabled;
      this.lights.spotlights.forEach(spotlight => {
        spotlight.castShadow = enabled;
      });
    }
  }

  /**
   * Set anti-aliasing
   */
  public setAntiAliasing(enabled: boolean): void {
    this.options.fxaa = enabled;
    
    if (this.fxaaPass) {
      this.fxaaPass.enabled = enabled;
    } else if (enabled) {
      // Need to initialize post-processing if not already done
      this.initializePostProcessing();
    }
  }

  /**
   * Set high DPI rendering
   */
  public setHighDPI(enabled: boolean): void {
    this.options.highDPI = enabled;
    
    if (this.renderer) {
      this.renderer.setPixelRatio(this.getPixelRatioForQuality());
    }
  }
}