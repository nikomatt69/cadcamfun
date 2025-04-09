// src/lib/canvas/view-cube.ts - ViewCube controller for 3D navigation
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// Define cube face constants
export const CUBE_FACES = {
  FRONT: 'front',
  BACK: 'back',
  LEFT: 'left',
  RIGHT: 'right',
  TOP: 'top',
  BOTTOM: 'bottom',
  FRONT_TOP_LEFT: 'front-top-left',
  FRONT_TOP_RIGHT: 'front-top-right',
  FRONT_BOTTOM_LEFT: 'front-bottom-left',
  FRONT_BOTTOM_RIGHT: 'front-bottom-right',
  BACK_TOP_LEFT: 'back-top-left',
  BACK_TOP_RIGHT: 'back-top-right',
  BACK_BOTTOM_LEFT: 'back-bottom-left',
  BACK_BOTTOM_RIGHT: 'back-bottom-right'
};

type CubeFace = keyof typeof CUBE_FACES;

// ViewCube configuration options
interface ViewCubeOptions {
  size?: number;
  padding?: number;
  opacity?: number;
  fontColor?: string;
  fontFace?: string;
  textureSize?: number;
  enableCornerSelection?: boolean;
  enableEdgeSelection?: boolean;
  darkMode?: boolean;
}

// ViewCube controller class
export class ViewCubeController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  
  private cube: THREE.Mesh | null = null;
  private cubeCanvas: HTMLCanvasElement | null = null;
  private cubeRaycaster: THREE.Raycaster = new THREE.Raycaster();
  private cubeMouse: THREE.Vector2 = new THREE.Vector2();
  private cubeScene: THREE.Scene | null = null;
  private cubeCamera: THREE.PerspectiveCamera | null = null;
  private cubeRenderer: THREE.WebGLRenderer | null = null;
  private cubeControls: OrbitControls | null = null;
  private isVisible: boolean = true;
  private domElement: HTMLElement | null = null;
  private hoverFace: string | null = null;
  private clickedFace: string | null = null;
  private options: ViewCubeOptions;
  private _enabled: boolean = true;
  private _needsUpdate: boolean = true;

  // Create a view cube controller
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    container: HTMLElement,
    options: ViewCubeOptions = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.container = container;
    
    // Set default options
    this.options = {
      size: options.size || 100,
      padding: options.padding || 10,
      opacity: options.opacity || 0.9,
      fontColor: options.fontColor || '#ffffff',
      fontFace: options.fontFace || 'Arial',
      textureSize: options.textureSize || 256,
      enableCornerSelection: options.enableCornerSelection !== undefined ? options.enableCornerSelection : true,
      enableEdgeSelection: options.enableEdgeSelection !== undefined ? options.enableEdgeSelection : true,
      darkMode: options.darkMode !== undefined ? options.darkMode : false
    };
    
    this.initialize();
  }

  // Initialize the view cube
  private initialize(): void {
    this.createCubeRenderer();
    this.createCubeScene();
    this.createCube();
    this.createDOMElement();
    this.attachEventListeners();
  }

  // Create a renderer for the view cube
  private createCubeRenderer(): void {
    this.cubeRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    
    this.cubeRenderer.setSize(this.options.size!, this.options.size!);
    this.cubeRenderer.setClearColor(0x000000, 0);
  }

  // Create the scene for the view cube
  private createCubeScene(): void {
    this.cubeScene = new THREE.Scene();
    
    // Create camera for cube scene
    this.cubeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.cubeCamera.position.set(3, 3, 3);
    this.cubeCamera.lookAt(0, 0, 0);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.cubeScene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 2, 3);
    this.cubeScene.add(directionalLight);
  }

  // Create the cube geometry and materials
  private createCube(): void {
    if (!this.cubeScene) return;
    
    // Create cube textures
    const textureData = this.createCubeTextures();
    
    // Create cube materials
    const materials = [
      new THREE.MeshStandardMaterial({ map: textureData.right }),   // Right
      new THREE.MeshStandardMaterial({ map: textureData.left }),    // Left
      new THREE.MeshStandardMaterial({ map: textureData.top }),     // Top
      new THREE.MeshStandardMaterial({ map: textureData.bottom }),  // Bottom
      new THREE.MeshStandardMaterial({ map: textureData.front }),   // Front
      new THREE.MeshStandardMaterial({ map: textureData.back })     // Back
    ];
    
    // Set material properties
    materials.forEach(material => {
      material.transparent = true;
      material.opacity = 0.95;
      material.metalness = 0.1;
      material.roughness = 0.6;
    });
    
    // Create cube geometry and mesh
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.cube = new THREE.Mesh(cubeGeometry, materials);
    this.cubeScene.add(this.cube);
    
    // Add edges to the cube
    const edgesGeometry = new THREE.EdgesGeometry(cubeGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: this.options.darkMode ? 0xffffff : 0x000000,
      transparent: true,
      opacity: 0.5
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    this.cube.add(edges);
    
    // Add cube controls for rotation (optional)
    if (this.cubeCamera && this.cubeRenderer) {
      this.cubeControls = new OrbitControls(this.cubeCamera, this.cubeRenderer.domElement);
      this.cubeControls.enableZoom = false;
      this.cubeControls.enablePan = false;
      this.cubeControls.enableDamping = true;
      this.cubeControls.dampingFactor = 0.2;
      this.cubeControls.rotateSpeed = 0.5;
      this.cubeControls.enabled = false; // Disable by default
    }
  }

  // Create textures for each face of the cube
  private createCubeTextures(): Record<string, THREE.Texture> {
    // Create canvases for each face
    const textureSize = this.options.textureSize!;
    const textures: Record<string, THREE.Texture> = {};
    
    // Create texture for each face
    textures.front = this.createFaceTexture('FRONT', 'Z', textureSize);
    textures.back = this.createFaceTexture('BACK', '-Z', textureSize);
    textures.left = this.createFaceTexture('LEFT', '-X', textureSize);
    textures.right = this.createFaceTexture('RIGHT', 'X', textureSize);
    textures.top = this.createFaceTexture('TOP', 'Y', textureSize);
    textures.bottom = this.createFaceTexture('BOTTOM', '-Y', textureSize);
    
    return textures;
  }

  // Create a texture for a specific face
  private createFaceTexture(faceName: string, axisLabel: string, size: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Fill background
      context.fillStyle = this.options.darkMode ? '#444444' : '#dddddd';
      context.fillRect(0, 0, size, size);
      
      // Draw border
      context.strokeStyle = this.options.darkMode ? '#555555' : '#aaaaaa';
      context.lineWidth = 4;
      context.strokeRect(2, 2, size - 4, size - 4);
      
      // Draw label
      context.font = `bold ${size/4}px ${this.options.fontFace}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = this.options.fontColor!;
      context.fillText(axisLabel, size/2, size/2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Create DOM element container for the view cube
  private createDOMElement(): void {
    if (!this.cubeRenderer) return;
    
    // Create container element
    this.domElement = document.createElement('div');
    this.domElement.style.position = 'absolute';
    this.domElement.style.right = `${this.options.padding}px`;
    this.domElement.style.top = `${this.options.padding}px`;
    this.domElement.style.width = `${this.options.size}px`;
    this.domElement.style.height = `${this.options.size}px`;
    this.domElement.style.zIndex = '1000';
    this.domElement.style.pointerEvents = 'all';
    this.domElement.style.opacity = this.options.opacity!.toString();
    this.domElement.style.transition = 'opacity 0.3s ease-in-out';
    this.domElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.3)';
    this.domElement.style.borderRadius = '5px';
    this.domElement.style.overflow = 'hidden';
    
    // Add renderer's canvas to the container
    this.domElement.appendChild(this.cubeRenderer.domElement);
    
    // Add container to the main container
    this.container.appendChild(this.domElement);
  }

  // Attach event listeners for interaction
  private attachEventListeners(): void {
    if (!this.domElement) return;
    
    // Mouse move event for hover effects
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), false);
    
    // Mouse click event for face selection
    this.domElement.addEventListener('click', this.onMouseClick.bind(this), false);
    
    // Mouse enter/leave events for visibility control
    this.domElement.addEventListener('mouseenter', () => {
      if (this.domElement) {
        this.domElement.style.opacity = '1';
      }
    }, false);
    
    this.domElement.addEventListener('mouseleave', () => {
      if (this.domElement) {
        this.domElement.style.opacity = this.options.opacity!.toString();
        this.hoverFace = null;
        this._needsUpdate = true;
      }
    }, false);
  }

  // Handle mouse move event
  private onMouseMove(event: MouseEvent): void {
    event.preventDefault();
    
    if (!this.domElement || !this.cubeRenderer) return;
    
    // Calculate mouse position
    const rect = this.cubeRenderer.domElement.getBoundingClientRect();
    this.cubeMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.cubeMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to find intersected face
    this.checkIntersection();
  }

  // Handle mouse click event
  private onMouseClick(event: MouseEvent): void {
    event.preventDefault();
    
    if (!this.hoverFace || !this._enabled) return;
    
    this.clickedFace = this.hoverFace;
    this.navigateToFace(this.clickedFace);
  }

  // Check for intersection with the cube
  private checkIntersection(): void {
    if (!this.cubeCamera || !this.cube || !this.cubeScene) return;
    
    // Update raycaster
    this.cubeRaycaster.setFromCamera(this.cubeMouse, this.cubeCamera);
    
    // Find intersections
    const intersects = this.cubeRaycaster.intersectObject(this.cube, true);
    
    if (intersects.length > 0) {
      // Get the face index
      const faceIndex = Math.floor(intersects[0].faceIndex! / 2);
      
      // Map face index to face name
      const faceNames = ['right', 'left', 'top', 'bottom', 'front', 'back'];
      const newHoverFace = faceNames[faceIndex];
      
      // Update hover state if changed
      if (this.hoverFace !== newHoverFace) {
        this.hoverFace = newHoverFace;
        this._needsUpdate = true;
        
        // Change cursor style
        if (this.domElement) {
          this.domElement.style.cursor = 'pointer';
        }
      }
    } else {
      // Reset hover state if no intersection
      if (this.hoverFace !== null) {
        this.hoverFace = null;
        this._needsUpdate = true;
        
        // Reset cursor style
        if (this.domElement) {
          this.domElement.style.cursor = 'default';
        }
      }
    }
  }

  // Navigate the main camera to look at the selected face
  private navigateToFace(face: string): void {
    if (!this.controls) return;
    
    // Calculate target position based on face
    let targetPosition: THREE.Vector3;
    
    switch (face) {
      case 'front':
        targetPosition = new THREE.Vector3(0, 0, 200);
        break;
      case 'back':
        targetPosition = new THREE.Vector3(0, 0, -200);
        break;
      case 'left':
        targetPosition = new THREE.Vector3(-200, 0, 0);
        break;
      case 'right':
        targetPosition = new THREE.Vector3(200, 0, 0);
        break;
      case 'top':
        targetPosition = new THREE.Vector3(0, 200, 0);
        break;
      case 'bottom':
        targetPosition = new THREE.Vector3(0, -200, 0);
        break;
      default:
        return;
    }
    
    // Smoothly move camera to the target position
    this.animateCameraMove(targetPosition);
  }

  // Animate camera movement to the target position
  private animateCameraMove(targetPosition: THREE.Vector3): void {
    if (!this.camera || !this.controls) return;
    
    // Store current camera position and target
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endTarget = new THREE.Vector3(0, 0, 0); // Look at origin
    
    // Calculate unit vector for the target direction
    const direction = targetPosition.clone().normalize();
    
    // Set end position at the same distance from the target
    const distance = this.camera.position.distanceTo(this.controls.target);
    const endPosition = direction.multiplyScalar(distance);
    
    // Animation parameters
    const duration = 500; // ms
    const startTime = Date.now();
    
    // Animation function
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease function (ease-out quad)
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      
      // Interpolate position and target
      const currentPosition = new THREE.Vector3().lerpVectors(
        startPosition, endPosition, easeProgress
      );
      
      const currentTarget = new THREE.Vector3().lerpVectors(
        startTarget, endTarget, easeProgress
      );
      
      // Update camera and controls
      this.camera.position.copy(currentPosition);
      this.controls.target.copy(currentTarget);
      this.camera.lookAt(currentTarget);
      this.controls.update();
      
      // Continue animation if not completed
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    // Start animation
    animate();
  }

  // Update the view cube
  public update(): void {
    if (!this._enabled || !this.isVisible) return;
    
    // Only render if update is needed
    if (!this._needsUpdate) return;
    
    // Update cube rotation to match camera
    if (this.cube && this.camera && this.controls) {
      // Get the camera's quaternion
      const cameraQuaternion = this.camera.quaternion.clone();
      
      // Invert the quaternion to make the cube rotate in the opposite direction
      const inverseQuaternion = cameraQuaternion.invert();
      
      // Apply the inverse quaternion to the cube
      this.cube.quaternion.copy(inverseQuaternion);
      
      // Update cube controls if enabled
      if (this.cubeControls) {
        this.cubeControls.update();
      }
      
      // Render the view cube
      if (this.cubeRenderer && this.cubeScene && this.cubeCamera) {
        this.cubeRenderer.render(this.cubeScene, this.cubeCamera);
      }
      
      // Reset update flag
      this._needsUpdate = false;
    }
  }

  // Handle window resize
  public onResize(): void {
    // No need to resize the view cube as it has a fixed size
    // But we need to update
    this._needsUpdate = true;
  }

  // Show the view cube
  public show(): void {
    if (this.domElement) {
      this.domElement.style.display = 'block';
      this.isVisible = true;
      this._needsUpdate = true;
    }
  }

  // Hide the view cube
  public hide(): void {
    if (this.domElement) {
      this.domElement.style.display = 'none';
      this.isVisible = false;
    }
  }

  // Enable the view cube
  public enable(): void {
    this._enabled = true;
    if (this.cubeControls) {
      this.cubeControls.enabled = true;
    }
  }

  // Disable the view cube
  public disable(): void {
    this._enabled = false;
    if (this.cubeControls) {
      this.cubeControls.enabled = false;
    }
  }

  // Set view cube options
  public setOptions(options: Partial<ViewCubeOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Update DOM element
    if (this.domElement) {
      this.domElement.style.opacity = this.options.opacity!.toString();
      this.domElement.style.right = `${this.options.padding}px`;
      this.domElement.style.top = `${this.options.padding}px`;
      this.domElement.style.width = `${this.options.size}px`;
      this.domElement.style.height = `${this.options.size}px`;
    }
    
    // Force update
    this._needsUpdate = true;
  }

  // Dispose of resources
  public dispose(): void {
    // Remove event listeners
    if (this.domElement) {
      this.domElement.removeEventListener('mousemove', this.onMouseMove);
      this.domElement.removeEventListener('click', this.onMouseClick);
      
      // Remove from DOM
      if (this.domElement.parentNode) {
        this.domElement.parentNode.removeChild(this.domElement);
      }
    }
    
    // Dispose of Three.js resources
    if (this.cube) {
      if (Array.isArray(this.cube.material)) {
        this.cube.material.forEach(material => material.dispose());
      } else if (this.cube.material) {
        this.cube.material.dispose();
      }
      this.cube.geometry.dispose();
    }
    
    // Dispose of renderer
    if (this.cubeRenderer) {
      this.cubeRenderer.dispose();
    }
    
    // Dispose of controls
    if (this.cubeControls) {
      this.cubeControls.dispose();
    }
  }
}
