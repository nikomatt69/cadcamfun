/**
 * CAD Scene Manager - Centralizes Three.js scene operations
 * Eliminates multiple useEffect dependencies and object recreation
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import CanvasPool from "@/src/lib/canvas/CanvasPool";
import SmartRenderer from "@/src/lib/canvas/SmartRenderer";

interface SceneConfig {
  canvasElement: HTMLDivElement;
  onResize?: (width: number, height: number) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

interface ViewSettings {
  gridVisible: boolean;
  axisVisible: boolean;
  viewMode: "2d" | "3d";
  originOffset: { x: number; y: number; z: number };
}

interface SceneElements {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  transformControls: TransformControls;
}

interface SceneOperation {
  type: "add" | "remove" | "update";
  object: THREE.Object3D;
  elementId?: string;
}

// Canvas and texture pooling helper functions
const getTemporaryCanvas = (key: string, width: number, height: number): HTMLCanvasElement => {
  return CanvasPool.getCanvas(key, width, height);
};

const getTextureFromPool = (key: string, width: number, height: number): THREE.Texture => {
  const canvas = getTemporaryCanvas(key, width, height);
  return new THREE.CanvasTexture(canvas);
};

export class CADSceneManager {
  private sceneElements: SceneElements;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  // Pre-created reusable objects to avoid recreation
  private gridHelper!: THREE.GridHelper;
  private customAxes!: THREE.Group;
  private objectPool: Map<string, THREE.Object3D[]> = new Map();

  // Settings cache to avoid unnecessary updates
  private lastViewSettings: ViewSettings | null = null;
  private lastCanvasDimensions = { width: 0, height: 0 };

  constructor(config: SceneConfig) {
    this.sceneElements = this.initializeScene(config.canvasElement);
    this.setupReusableObjects();
    this.setupEventHandling(config);
    this.startRenderLoop();
  }

  private initializeScene(canvasElement: HTMLDivElement): SceneElements {
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#2A2A2A");

    // Create camera
    const camera = new THREE.PerspectiveCamera(75, canvasElement.clientWidth / canvasElement.clientHeight, 0.01, 5000);
    camera.position.set(0, 0, 5);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasElement.appendChild(renderer.domElement);

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.01;
    controls.maxDistance = 5000;
    controls.zoomSpeed = 1.5;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // Create transform controls
    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    return { scene, camera, renderer, controls, transformControls };
  }

  private setupReusableObjects(): void {
    // Create grid helper (reusable)
    this.gridHelper = new THREE.GridHelper(500, 500);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.sceneElements.scene.add(this.gridHelper);

    // Create custom axes (reusable)
    this.customAxes = this.createCustomAxes(30);
    this.customAxes.userData.isCustomAxes = true;
    this.sceneElements.scene.add(this.customAxes);
  }

  private createCustomAxes(size: number): THREE.Group {
    const axesGroup = new THREE.Group();

    // X, Y, Z axis lines
    const axisData = [
      { color: 0x0000ff, points: [-size * 2, 0, 0, size * 2, 0, 0] }, // X - Blue
      { color: 0xff00ff, points: [0, -size * 2, 0, 0, size * 2, 0] }, // Y - Magenta
      { color: 0x00ff7f, points: [0, 0, -size * 2, 0, 0, size * 2] } // Z - Green
    ];

    axisData.forEach(axis => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(axis.points, 3));
      const material = new THREE.LineBasicMaterial({ color: axis.color });
      const line = new THREE.Line(geometry, material);
      axesGroup.add(line);
    });

    // Add axis labels
    const labels = [
      { text: "X", pos: [size + 1, 0, 0] as [number, number, number], color: new THREE.Color(0, 0, 1) },
      { text: "Y", pos: [0, size + 1, 0] as [number, number, number], color: new THREE.Color(1, 0, 1) },
      { text: "Z", pos: [0, 0, size + 1] as [number, number, number], color: new THREE.Color(0, 1, 0.5) }
    ];

    labels.forEach(label => {
      const sprite = this.createAxisLabel(label.text, label.pos, label.color);
      if (sprite) axesGroup.add(sprite);
    });

    return axesGroup;
  }

  private createAxisLabel(text: string, position: [number, number, number], color: THREE.Color): THREE.Sprite | null {
    const canvasWidth = 64;
    const canvasHeight = 64;

    try {
      const canvas = getTemporaryCanvas(`axisLabel-${text}`, canvasWidth, canvasHeight);
      const context = canvas.getContext("2d");

      if (!context) return null;

      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = `rgb(${Math.floor(color.r * 255)}, ${Math.floor(color.g * 255)}, ${Math.floor(color.b * 255)})`;
      context.font = "Bold 48px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 32, 32);

      const texture = getTextureFromPool(`axisLabelTexture-${text}`, canvasWidth, canvasHeight);
      texture.image = canvas;
      texture.needsUpdate = true;

      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(...position);
      sprite.scale.set(2, 2, 2);

      return sprite;
    } catch (error) {
      console.warn("Failed to create axis label:", error);
      return null;
    }
  }

  private setupEventHandling(config: SceneConfig): void {
    // Setup resize observer instead of window event
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width !== this.lastCanvasDimensions.width || height !== this.lastCanvasDimensions.height) {
          this.handleResize(width, height);
          this.lastCanvasDimensions = { width, height };
          config.onResize?.(width, height);
        }
      }
    });
    this.resizeObserver.observe(config.canvasElement);

    // Setup fullscreen events (batched)
    const fullscreenEvents = [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange"
    ];

    const handleFullscreen = () => {
      const isFullscreen = !!document.fullscreenElement;
      config.onFullscreenChange?.(isFullscreen);
      // Trigger resize after fullscreen change
      setTimeout(() => {
        const rect = config.canvasElement.getBoundingClientRect();
        this.handleResize(rect.width, rect.height);
      }, 100);
    };

    fullscreenEvents.forEach(event => {
      document.addEventListener(event, handleFullscreen);
    });

    // Store cleanup functions
    this.addEventListener("cleanup", () => {
      fullscreenEvents.forEach(event => {
        document.removeEventListener(event, handleFullscreen);
      });
    });
  }

  private handleResize(width: number, height: number): void {
    const { camera, renderer } = this.sceneElements;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  private startRenderLoop(): void {
    const animate = () => {
      // Check transform controls validity
      const { transformControls, controls, scene, camera, renderer } = this.sceneElements;

      if (transformControls.object) {
        const object = transformControls.object;
        if (object.parent === null) {
          transformControls.detach();
          console.warn("TransformControls: Detached object that lost scene connection");
        } else {
          object.updateMatrixWorld(true);
          object.parent.updateMatrixWorld(true);
        }
      }

      if (controls) {
        controls.update();
      }

      if (renderer && camera && scene) {
        scene.updateMatrixWorld(true);
        SmartRenderer.smartRender(scene, camera, renderer, {
          cullDistance: 1000,
          updateThreshold: 16,
          forceUpdate: false
        });
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  // Optimized update methods - only update what changed
  public updateViewSettings(settings: ViewSettings): void {
    // Skip if settings haven't changed
    if (this.lastViewSettings && JSON.stringify(this.lastViewSettings) === JSON.stringify(settings)) {
      return;
    }

    // Update grid visibility
    if (!this.lastViewSettings || this.lastViewSettings.gridVisible !== settings.gridVisible) {
      this.gridHelper.visible = settings.gridVisible;
    }

    // Update axes visibility
    if (!this.lastViewSettings || this.lastViewSettings.axisVisible !== settings.axisVisible) {
      this.customAxes.visible = settings.axisVisible;
    }

    // Update view mode
    if (!this.lastViewSettings || this.lastViewSettings.viewMode !== settings.viewMode) {
      this.updateViewMode(settings.viewMode, settings.axisVisible);
    }

    this.lastViewSettings = { ...settings };
  }

  private updateViewMode(viewMode: "2d" | "3d", axisVisible: boolean): void {
    const { camera, controls, scene } = this.sceneElements;

    switch (viewMode) {
      case "2d":
        scene.background = new THREE.Color("#2A2A2A");
        camera.position.set(0, 0, 50);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);

        this.gridHelper.material.opacity = 0.2;
        this.gridHelper.material.transparent = true;
        this.gridHelper.rotation.x = Math.PI / 2;

        controls.enableRotate = false;
        controls.enablePan = true;

        // Show only X and Y axes in 2D mode
        this.customAxes.visible = axisVisible;
        this.customAxes.children.forEach((child, index) => {
          child.visible = index !== 2; // Hide Z axis (index 2)
        });
        break;

      case "3d":
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.minDistance = 0.01;
        controls.maxDistance = 5000;

        // Show all axes in 3D mode
        this.customAxes.visible = axisVisible;
        this.customAxes.children.forEach(child => {
          child.visible = true;
        });
        break;
    }
  }

  // Batch object operations for better performance
  public batchUpdateObjects(operations: SceneOperation[]): void {
    const { scene } = this.sceneElements;

    operations.forEach(op => {
      switch (op.type) {
        case "add":
          scene.add(op.object);
          break;
        case "remove":
          scene.remove(op.object);
          break;
        case "update":
          // Object is already in scene, just ensure it's updated
          op.object.updateMatrixWorld(true);
          break;
      }
    });

    // Single matrix world update after all operations
    scene.updateMatrixWorld(true);
  }

  // Object pooling for frequently created/destroyed objects
  public getPooledObject(type: string): THREE.Object3D | null {
    const pool = this.objectPool.get(type) || [];
    return pool.pop() || null;
  }

  public releasePooledObject(type: string, object: THREE.Object3D): void {
    const pool = this.objectPool.get(type) || [];
    pool.push(object);
    this.objectPool.set(type, pool);
  }

  // Event system for decoupled communication
  public addEventListener(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  public removeEventListener(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  public emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(listener => listener(...args));
  }

  // Getters for external access
  get scene(): THREE.Scene {
    return this.sceneElements.scene;
  }
  get camera(): THREE.PerspectiveCamera {
    return this.sceneElements.camera;
  }
  get renderer(): THREE.WebGLRenderer {
    return this.sceneElements.renderer;
  }
  get controls(): OrbitControls {
    return this.sceneElements.controls;
  }
  get transformControls(): TransformControls {
    return this.sceneElements.transformControls;
  }

  // Cleanup
  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.resizeObserver?.disconnect();
    this.emit("cleanup");

    this.sceneElements.renderer.dispose();
    this.sceneElements.renderer.domElement.remove();

    // Clear object pools
    this.objectPool.clear();
    this.eventListeners.clear();
  }
}
