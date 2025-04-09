// src/lib/canvas/renderer.ts - Canvas rendering service
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ViewCubeController } from './viewCube';
import { Element } from 'src/store/elementsStore';
import { Layer } from 'src/store/layerStore';

type ViewMode = '2d' | '3d';
type SceneCallbacks = {
  onSceneInitialized?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onSceneBeforeRender?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onSceneRender?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
  onViewModeChanged?: (mode: ViewMode) => void;
}

type LightSetup = {
  ambient: THREE.AmbientLight;
  main: THREE.DirectionalLight;
  secondary: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
}

// Class to handle all rendering-related operations
export class CanvasRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private mainCamera: THREE.PerspectiveCamera | null = null;
  private orthographicCamera: THREE.OrthographicCamera | null = null;
  private activeCamera: THREE.Camera | null = null;
  private controls: OrbitControls | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.Group | null = null;
  private originIndicator: THREE.Group | null = null;
  private viewCube: ViewCubeController | null = null;
  private frameId: number = 0;
  private viewMode: ViewMode = '3d';
  private callbacks: SceneCallbacks = {};
  private lights: LightSetup | null = null;
  private stats: any = null;
  private clock: THREE.Clock = new THREE.Clock();
  private canvas: HTMLCanvasElement | null = null;
  private rendererParams: THREE.WebGLRendererParameters = {};
  private containerEl: HTMLElement | null = null;
  private isDestroyed: boolean = false;
  private boundHandleResize: () => void;
  private isDarkMode: boolean = false;

  constructor(callbacks?: SceneCallbacks) {
    this.callbacks = callbacks || {};
    this.boundHandleResize = this.handleResize.bind(this);
  }

  // Initialize the renderer with a container element
  public initialize(container: HTMLElement, params?: THREE.WebGLRendererParameters): void {
    if (this.renderer) return;
    this.isDestroyed = false;
    this.containerEl = container;
    this.rendererParams = params || {};
    
    this.initializeRenderer();
    this.initializeScene();
    this.initializeCameras();
    this.initializeLights();
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
  }

  // Initialize the WebGL renderer
  private initializeRenderer(): void {
    // Create renderer with antialiasing and better shadows
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      ...this.rendererParams
    });
    
    // Set renderer properties
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  // Initialize the scene
  private initializeScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = this.isDarkMode 
      ? new THREE.Color(0x1a1a1a) 
      : new THREE.Color(0xf5f5f5);
    this.scene.fog = new THREE.Fog(
      this.isDarkMode ? 0x1a1a1a : 0xf5f5f5, 
      1000, 
      5000
    );
  }

  // Initialize cameras (perspective and orthographic)
  private initializeCameras(): void {
    if (!this.containerEl) return;
    
    // Create perspective camera for 3D view
    const aspect = this.containerEl.clientWidth / this.containerEl.clientHeight;
    this.mainCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
    this.mainCamera.position.set(200, 200, 200);
    this.mainCamera.lookAt(0, 0, 0);
    
    // Create orthographic camera for 2D view
    const width = this.containerEl.clientWidth;
    const height = this.containerEl.clientHeight;
    this.orthographicCamera = new THREE.OrthographicCamera(
      width / -2, width / 2, height / 2, height / -2, 0.1, 5000
    );
    this.orthographicCamera.position.set(0, 0, 500);
    this.orthographicCamera.lookAt(0, 0, 0);
    
    // Set active camera
    this.activeCamera = this.mainCamera;
  }

  // Initialize scene lighting
  private initializeLights(): void {
    if (!this.scene) return;
    
    // Create ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    
    // Create main directional light with shadows
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(100, 100, 100);
    mainLight.castShadow = true;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 500;
    mainLight.shadow.camera.left = -100;
    mainLight.shadow.camera.right = 100;
    mainLight.shadow.camera.top = 100;
    mainLight.shadow.camera.bottom = -100;
    mainLight.shadow.bias = -0.001;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    
    // Create secondary light
    const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.6);
    secondaryLight.position.set(-100, 50, -100);
    
    // Create hemisphere light for fill
    const fillLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6);
    
    // Add lights to scene
    this.scene.add(ambient);
    this.scene.add(mainLight);
    this.scene.add(secondaryLight);
    this.scene.add(fillLight);
    
    // Store light references
    this.lights = {
      ambient,
      main: mainLight,
      secondary: secondaryLight,
      fill: fillLight
    };
  }

  // Initialize grid and axes helpers
  private initializeHelpers(): void {
    if (!this.scene) return;
    
    // Create grid helper
    this.gridHelper = new THREE.GridHelper(1000, 100, 0x888888, 0x444444);
    this.gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
    this.scene.add(this.gridHelper);
    
    // Create custom axes helper
    this.axesHelper = this.createCustomAxes(50);
    this.scene.add(this.axesHelper);
    
    // Create origin indicator
    this.originIndicator = this.createOriginIndicator();
    this.scene.add(this.originIndicator);
  }

  // Create custom axes helper with labels
  private createCustomAxes(size: number): THREE.Group {
    const axesGroup = new THREE.Group();
    axesGroup.userData.isCustomAxes = true;
    
    // Create materials for each axis
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xe74c3c }); // Red for X
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x2ecc71 }); // Green for Y
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x3498db }); // Blue for Z
    
    // Create geometries for each axis
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-size, 0, 0, size, 0, 0], 3));
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -size, 0, 0, size, 0], 3));
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -size, 0, 0, size], 3));
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    
    // Create axis labels
    const createAxisLabel = (text: string, position: [number, number, number], color: THREE.Color): THREE.Sprite => {
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
        sprite.scale.set(5, 5, 1);
        return sprite;
      }
      
      // Fallback if context is null
      const geometry = new THREE.SphereGeometry(0.5);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      return mesh as unknown as THREE.Sprite;
    };
    
    // Create axis cones for better visibility
    const createAxisCone = (position: [number, number, number], rotation: [number, number, number], color: THREE.Color): THREE.Mesh => {
      const geometry = new THREE.ConeGeometry(2, 8, 16);
      const material = new THREE.MeshBasicMaterial({ color });
      const cone = new THREE.Mesh(geometry, material);
      cone.position.set(...position);
      cone.rotation.set(...rotation);
      return cone;
    };
    
    // Add X axis elements
    axesGroup.add(xAxis);
    axesGroup.add(createAxisLabel('X', [size + 10, 0, 0], new THREE.Color(0xe74c3c)));
    axesGroup.add(createAxisCone([size, 0, 0], [0, 0, -Math.PI / 2], new THREE.Color(0xe74c3c)));
    
    // Add Y axis elements
    axesGroup.add(yAxis);
    axesGroup.add(createAxisLabel('Y', [0, size + 10, 0], new THREE.Color(0x2ecc71)));
    axesGroup.add(createAxisCone([0, size, 0], [0, 0, 0], new THREE.Color(0x2ecc71)));
    
    // Add Z axis elements
    axesGroup.add(zAxis);
    axesGroup.add(createAxisLabel('Z', [0, 0, size + 10], new THREE.Color(0x3498db)));
    axesGroup.add(createAxisCone([0, 0, size], [Math.PI / 2, 0, 0], new THREE.Color(0x3498db)));
    
    return axesGroup;
  }

  // Create origin indicator
  private createOriginIndicator(): THREE.Group {
    const group = new THREE.Group();
    group.userData.isOriginIndicator = true;
    
    // Create center sphere
    const sphereGeometry = new THREE.SphereGeometry(2, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);
    
    // Create small ring
    const ringGeometry = new THREE.RingGeometry(3, 4, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    
    return group;
  }

  // Initialize camera controls
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
    this.controls.maxDistance = 2000;
    this.controls.maxPolarAngle = Math.PI; // Allow camera to go below the ground plane
    this.controls.screenSpacePanning = true; // Pan parallel to the ground plane
  }

  // Initialize view cube for easy navigation
  private initializeViewCube(): void {
    if (!this.scene || !this.mainCamera || !this.containerEl) return;
    
    this.viewCube = new ViewCubeController(
      this.scene, 
      this.mainCamera, 
      this.controls!, 
      this.containerEl
    );
  }

  // Animation loop
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
    
    // Render scene
    if (this.renderer && this.scene && this.activeCamera) {
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
    if (this.stats) {
      this.stats.update();
    }
  };

  // Handle window resize
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
    this.orthographicCamera.left = width / -2;
    this.orthographicCamera.right = width / 2;
    this.orthographicCamera.top = height / 2;
    this.orthographicCamera.bottom = height / -2;
    this.orthographicCamera.updateProjectionMatrix();
    
    // Update view cube if available
    if (this.viewCube) {
      this.viewCube.onResize();
    }
  }

  // Set view mode (2D or 3D)
  public setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    
    this.viewMode = mode;
    
    if (!this.scene || !this.mainCamera || !this.orthographicCamera || !this.controls) return;
    
    if (mode === '2d') {
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
    } else {
      // Switch to perspective camera for 3D view
      this.activeCamera = this.mainCamera;
      
      // Reset camera position if needed
      if (this.mainCamera.position.z > 1000) { // If camera is very far away in Z
        this.mainCamera.position.set(200, 200, 200);
        this.mainCamera.lookAt(0, 0, 0);
      }
      
      // Re-enable full controls for 3D view
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
    }
    
    // Call view mode changed callback
    if (this.callbacks.onViewModeChanged) {
      this.callbacks.onViewModeChanged(mode);
    }
  }

  // Set grid visibility
  public setGridVisible(visible: boolean): void {
    if (this.gridHelper) {
      this.gridHelper.visible = visible;
    }
  }

  // Set axes visibility
  public setAxesVisible(visible: boolean): void {
    if (this.axesHelper) {
      this.axesHelper.visible = visible;
    }
  }

  // Set origin offset
  public setOriginOffset(offset: { x: number, y: number, z: number }): void {
    if (this.gridHelper) {
      this.gridHelper.position.set(offset.x, offset.y, offset.z);
    }
    
    if (this.originIndicator) {
      this.originIndicator.position.set(offset.x, offset.y, offset.z);
    }
  }

  // Get current scene
  public getScene(): THREE.Scene | null {
    return this.scene;
  }

  // Get current camera
  public getCamera(): THREE.Camera | null {
    return this.activeCamera;
  }

  // Get perspective camera
  public getPerspectiveCamera(): THREE.PerspectiveCamera | null {
    return this.mainCamera;
  }

  // Get orthographic camera
  public getOrthographicCamera(): THREE.OrthographicCamera | null {
    return this.orthographicCamera;
  }

  // Get controls
  public getControls(): OrbitControls | null {
    return this.controls;
  }

  // Get renderer
  public getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  // Get canvas element
  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  // Set camera position
  public setCameraPosition(position: { x: number, y: number, z: number }): void {
    if (this.mainCamera) {
      this.mainCamera.position.set(position.x, position.y, position.z);
    }
  }

  // Set camera look at
  public setCameraLookAt(target: { x: number, y: number, z: number }): void {
    if (this.mainCamera) {
      this.mainCamera.lookAt(target.x, target.y, target.z);
    }
  }

  // Set camera zoom
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

  // Take a screenshot
  public takeScreenshot(): string | null {
    if (!this.renderer) return null;
    
    // Render scene
    if (this.scene && this.activeCamera) {
      this.renderer.render(this.scene, this.activeCamera);
    }
    
    // Get data URL
    return this.renderer.domElement.toDataURL('image/png');
  }

  // Clean up resources
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
    
    // Remove DOM elements
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    
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
    this.stats = null;
    this.canvas = null;
    this.containerEl = null;
  }

  // Dispose of scene objects recursively
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

  // Dispose of material resources
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

  // Set theme mode
  public setThemeMode(isDark: boolean): void {
    this.isDarkMode = isDark;
    
    if (this.scene) {
      this.scene.background = isDark 
        ? new THREE.Color(0x1a1a1a) 
        : new THREE.Color(0xf5f5f5);
      
      this.scene.fog = new THREE.Fog(
        isDark ? 0x1a1a1a : 0xf5f5f5, 
        1000, 
        5000
      );
    }
  }

  // Create a scene element from element data
  public createSceneElement(element: Element, layers: Layer[], originOffset: { x: number, y: number, z: number }): THREE.Object3D | null {
    // Find the layer for this element
    const layer = layers.find(l => l.id === element.layerId);
    
    // Skip if layer is not found or not visible
    if (!layer || !layer.visible) return null;
    
    // Create different Three.js objects based on element type
    switch (element.type) {
      case 'line':
        return this.createLine(element, layer, originOffset);
      case 'circle':
        return this.createCircle(element, layer, originOffset);
      case 'rectangle':
        return this.createRectangle(element, layer, originOffset);
      case 'cube':
        return this.createCube(element, layer, originOffset);
      case 'sphere':
        return this.createSphere(element, layer, originOffset);
      case 'cylinder':
        return this.createCylinder(element, layer, originOffset);
      case 'cone':
        return this.createCone(element, layer, originOffset);
      case 'torus':
        return this.createTorus(element, layer, originOffset);
      case 'text':
        return this.createText(element, layer, originOffset);
      case 'group':
        return this.createGroup(element, layer, originOffset);
      case 'workpiece':
        return this.createWorkpiece(element, layer, originOffset);
      default:
        console.warn(`Unsupported element type: ${element.type}`);
        return null;
    }
  }

  // Create line element
  private createLine(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Line {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: element.color || layer.color || 0x000000,
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
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.userData.elementId = element.id;
    line.userData.isCADElement = true;
    line.userData.elementType = 'line';
    line.castShadow = false;
    line.receiveShadow = false;
    
    return line;
  }

  // Create circle element
  private createCircle(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'circle';
    
    // Create circle mesh
    const circleGeometry = new THREE.CircleGeometry(element.radius, 64);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: element.color || layer.color || 0x000000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
      wireframe: element.wireframe || false
    });
    
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
    
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: element.color || layer.color || 0x000000,
      linewidth: element.linewidth || 1
    });
    
    const outline = new THREE.Line(outlineGeometry, outlineMaterial);
    outline.position.copy(circleMesh.position);
    outline.rotation.copy(circleMesh.rotation);
    
    group.add(circleMesh);
    group.add(outline);
    
    return group;
  }

  // Create rectangle element
  private createRectangle(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'rectangle';
    
    // Create rectangle mesh
    const rectGeometry = new THREE.PlaneGeometry(element.width, element.height);
    const rectMaterial = new THREE.MeshBasicMaterial({
      color: element.color || layer.color || 0x000000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2,
      wireframe: element.wireframe || false
    });
    
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
    
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: element.color || layer.color || 0x000000,
      linewidth: element.linewidth || 1
    });
    
    const outline = new THREE.Line(outlineGeometry, outlineMaterial);
    outline.position.copy(rectMesh.position);
    outline.rotation.copy(rectMesh.rotation);
    
    group.add(rectMesh);
    group.add(outline);
    
    return group;
  }

  // Create cube element
  private createCube(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    const cubeGeometry = new THREE.BoxGeometry(
      element.width,
      element.height,
      element.depth
    );
    
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: element.color || layer.color || 0x1e88e5,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: element.wireframe ? 1.0 : 0.8,
      roughness: 0.7,
      metalness: 0.2
    });
    
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
    
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.userData.elementId = element.id;
    cube.userData.isCADElement = true;
    cube.userData.elementType = 'cube';
    
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
      cube.add(edges);
    }
    
    return cube;
  }

  // Create sphere element
  private createSphere(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    const sphereGeometry = new THREE.SphereGeometry(
      element.radius,
      32,
      32
    );
    
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: element.color || layer.color || 0x1e88e5,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: element.wireframe ? 1.0 : 0.8,
      roughness: 0.7,
      metalness: 0.2
    });
    
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.userData.elementId = element.id;
    sphere.userData.isCADElement = true;
    sphere.userData.elementType = 'sphere';
    
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
      sphere.add(wireframe);
    }
    
    return sphere;
  }

  // Create cylinder element
  private createCylinder(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    const cylinderGeometry = new THREE.CylinderGeometry(
      element.radius,
      element.radius,
      element.height,
      32
    );
    
    const cylinderMaterial = new THREE.MeshStandardMaterial({
      color: element.color || layer.color || 0xFFC107,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: element.wireframe ? 1.0 : 0.8,
      roughness: 0.7,
      metalness: 0.2
    });
    
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
    
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    cylinder.userData.elementId = element.id;
    cylinder.userData.isCADElement = true;
    cylinder.userData.elementType = 'cylinder';
    
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
      cylinder.add(edges);
    }
    
    return cylinder;
  }

  // Create cone element
  private createCone(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    const coneGeometry = new THREE.ConeGeometry(
      element.radius,
      element.height,
      32
    );
    
    const coneMaterial = new THREE.MeshStandardMaterial({
      color: element.color || layer.color || 0x9C27B0,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: element.wireframe ? 1.0 : 0.8,
      roughness: 0.7,
      metalness: 0.2
    });
    
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
    
    cone.castShadow = true;
    cone.receiveShadow = true;
    cone.userData.elementId = element.id;
    cone.userData.isCADElement = true;
    cone.userData.elementType = 'cone';
    
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
      cone.add(edges);
    }
    
    return cone;
  }

  // Create torus element
  private createTorus(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    const torusGeometry = new THREE.TorusGeometry(
      element.radius,
      element.tubeRadius || element.radius / 4,
      16,
      100
    );
    
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: element.color || layer.color || 0xFF9800,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: element.wireframe ? 1.0 : 0.8,
      roughness: 0.7,
      metalness: 0.2
    });
    
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
    
    torus.castShadow = true;
    torus.receiveShadow = true;
    torus.userData.elementId = element.id;
    torus.userData.isCADElement = true;
    torus.userData.elementType = 'torus';
    
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
      torus.add(wireframe);
    }
    
    return torus;
  }

  // Create text element
  private createText(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Mesh {
    // Create a placeholder for text (since TextGeometry requires font loading)
    const textGeometry = new THREE.PlaneGeometry(
      element.text.length * (element.size || 5),
      element.size || 10
    );
    
    const textMaterial = new THREE.MeshBasicMaterial({
      color: element.color || layer.color || 0x000000,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    
    const text = new THREE.Mesh(textGeometry, textMaterial);
    text.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    // Apply rotation
    if (element.angleX) {
      text.rotation.x = element.angleX * Math.PI / 180;
    }
    
    if (element.angleY) {
      text.rotation.y = element.angleY * Math.PI / 180;
    }
    
    if (element.angleZ || element.angle) {
      text.rotation.z = (element.angleZ || element.angle || 0) * Math.PI / 180;
    }
    
    text.userData.elementId = element.id;
    text.userData.isCADElement = true;
    text.userData.elementType = 'text';
    text.userData.text = element.text;
    
    // Add text label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    if (context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = 'Bold 40px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = element.color || layer.color || '#000000';
      context.fillText(element.text, canvas.width / 2, canvas.height / 2);
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      
      const labelMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9
      });
      
      const label = new THREE.Sprite(labelMaterial);
      label.scale.set(element.text.length * (element.size || 5), element.size || 10, 1);
      text.add(label);
    }
    
    return text;
  }

  // Create group element
  private createGroup(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
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
    
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'group';
    
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

  // Create workpiece element
  private createWorkpiece(element: any, layer: Layer, originOffset: { x: number, y: number, z: number }): THREE.Group {
    const group = new THREE.Group();
    group.userData.elementId = element.id;
    group.userData.isCADElement = true;
    group.userData.elementType = 'workpiece';
    
    // Create workpiece mesh
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
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    
    const workpieceMesh = new THREE.Mesh(workpieceGeometry, workpieceMaterial);
    workpieceMesh.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );
    
    workpieceMesh.castShadow = true;
    workpieceMesh.receiveShadow = true;
    
    // Create workpiece edges
    const edgesGeometry = new THREE.EdgesGeometry(workpieceGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.7
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
    
    group.add(workpieceMesh);
    group.add(edges);
    group.add(coordinateSystem);
    
    return group;
  }
}
