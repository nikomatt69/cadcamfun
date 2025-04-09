// src/lib/canvas/selection-manager.ts - Advanced selection management
import * as THREE from 'three';
import { Element } from 'src/store/elementsStore';

export interface SelectionHighlight {
  object: THREE.Object3D;
  originalMaterial?: THREE.Material | THREE.Material[];
  highlightMaterial?: THREE.Material | THREE.Material[];
  wireframe?: THREE.LineSegments;
  boundingBox?: THREE.Box3Helper;
}

export interface SelectionOptions {
  highlightColor?: THREE.Color | string;
  hoverColor?: THREE.Color | string;
  wireframeColor?: THREE.Color | string;
  showBoundingBox?: boolean;
  highlightOpacity?: number;
  wireframeOpacity?: number;
  boundingBoxColor?: THREE.Color | string;
}

export class SelectionManager {
  private scene: THREE.Scene;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.Camera;
  
  private selectedObjects: Map<string, SelectionHighlight> = new Map();
  private hoveredObject: SelectionHighlight | null = null;
  private options: SelectionOptions;
  private boxSelection: {
    active: boolean,
    startPoint: THREE.Vector2,
    currentPoint: THREE.Vector2,
    helper: THREE.LineSegments | null
  } = {
    active: false,
    startPoint: new THREE.Vector2(),
    currentPoint: new THREE.Vector2(),
    helper: null
  };
  
  // Transformation controls
  private transformGizmo: THREE.Group | null = null;
  private transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private transformSpace: 'local' | 'world' = 'world';
  private isTransforming: boolean = false;
  
  private elementMap: Map<string, THREE.Object3D> = new Map();
  private objectMap: Map<THREE.Object3D, string> = new Map();

  constructor(
    scene: THREE.Scene, 
    camera: THREE.Camera,
    options: SelectionOptions = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Set default options
    this.options = {
      highlightColor: options.highlightColor || new THREE.Color(0x2196f3), // Blue
      hoverColor: options.hoverColor || new THREE.Color(0x4caf50), // Green  
      wireframeColor: options.wireframeColor || new THREE.Color(0xffffff), // White
      showBoundingBox: options.showBoundingBox !== undefined ? options.showBoundingBox : true,
      highlightOpacity: options.highlightOpacity || 0.3,
      wireframeOpacity: options.wireframeOpacity || 0.5,
      boundingBoxColor: options.boundingBoxColor || new THREE.Color(0xffff00) // Yellow
    };
    
    // Initialize the transform gizmo
    this.initTransformGizmo();
  }

  // Initialize transform gizmo
  private initTransformGizmo(): void {
    this.transformGizmo = new THREE.Group();
    this.transformGizmo.visible = false;
    this.scene.add(this.transformGizmo);
    
    // Create translate gizmo
    this.createTranslateGizmo();
  }

  // Create translate gizmo
  private createTranslateGizmo(): void {
    if (!this.transformGizmo) return;
    
    // Clear existing gizmo
    while (this.transformGizmo.children.length > 0) {
      this.transformGizmo.remove(this.transformGizmo.children[0]);
    }
    
    // X axis (red)
    const xAxis = this.createAxisArrow(
      new THREE.Vector3(1, 0, 0),
      0xff0000
    );
    
    // Y axis (green)
    const yAxis = this.createAxisArrow(
      new THREE.Vector3(0, 1, 0),
      0x00ff00
    );
    
    // Z axis (blue)
    const zAxis = this.createAxisArrow(
      new THREE.Vector3(0, 0, 1),
      0x0000ff
    );
    
    // Add axes to gizmo
    this.transformGizmo.add(xAxis);
    this.transformGizmo.add(yAxis);
    this.transformGizmo.add(zAxis);
  }

  // Create an arrow for an axis
  private createAxisArrow(direction: THREE.Vector3, color: number): THREE.Group {
    const group = new THREE.Group();
    
    // Line material
    const lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 2,
      transparent: true,
      opacity: 0.7
    });
    
    // Line geometry
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      direction.clone().multiplyScalar(20)
    ]);
    
    // Create line
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
    
    // Create cone at the end
    const coneGeometry = new THREE.ConeGeometry(2, 8, 16);
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.7
    });
    
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.copy(direction.clone().multiplyScalar(20));
    cone.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    );
    
    group.add(cone);
    
    // Set user data for interaction
    group.userData.axis = direction.clone().normalize();
    group.userData.color = color;
    
    return group;
  }

  // Update the mouse position
  public updateMouse(x: number, y: number): void {
    this.mouse.x = x;
    this.mouse.y = y;
  }

  // Raycast to find intersected objects
  public raycast(selectableObjects: THREE.Object3D[], multiSelect: boolean = false): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(selectableObjects, true);
  }

  // Handle click to select object
  public handleClick(
    intersects: THREE.Intersection[],
    multiSelect: boolean = false
  ): string | null {
    // Check if we're clicking on a transform gizmo
    if (this.transformGizmo && this.transformGizmo.visible) {
      const gizmoIntersects = this.raycaster.intersectObject(this.transformGizmo, true);
      if (gizmoIntersects.length > 0) {
        // Handle gizmo interaction
        this.handleGizmoInteraction(gizmoIntersects[0]);
        return null;
      }
    }
    
    // No intersections, clear selection if not multi-select
    if (intersects.length === 0) {
      if (!multiSelect) {
        this.clearSelection();
      }
      return null;
    }
    
    // Get the first intersected object
    const intersect = intersects[0];
    let object = intersect.object;
    
    // Find the parent object with elementId
    while (object && !object.userData.elementId) {
      object = object.parent!;
    }
    
    // If no object with elementId was found, return
    if (!object || !object.userData.elementId) return null;
    
    const elementId = object.userData.elementId;
    
    // Handle multi-selection (Ctrl key pressed)
    if (multiSelect) {
      if (this.selectedObjects.has(elementId)) {
        this.deselectObject(elementId);
      } else {
        this.selectObject(elementId, object);
      }
    }
    // Handle single selection
    else {
      // If this is the same object already selected, do nothing
      if (this.selectedObjects.size === 1 && this.selectedObjects.has(elementId)) {
        return elementId;
      }
      
      // Clear current selection and select the new object
      this.clearSelection();
      this.selectObject(elementId, object);
    }
    
    return elementId;
  }

  // Handle hover effect
  public handleHover(intersects: THREE.Intersection[]): string | null {
    // Clear previous hover effect
    this.clearHover();
    
    // No intersections
    if (intersects.length === 0) return null;
    
    // Get the first intersected object
    const intersect = intersects[0];
    let object = intersect.object;
    
    // Find the parent object with elementId
    while (object && !object.userData.elementId) {
      object = object.parent!;
    }
    
    // If no object with elementId was found or object is already selected, return
    if (!object || !object.userData.elementId) return null;
    
    const elementId = object.userData.elementId;
    
    // If already selected, don't add hover effect
    if (this.selectedObjects.has(elementId)) return elementId;
    
    // Add hover effect
    this.hoveredObject = this.highlightObject(
      object,
      this.options.hoverColor!,
      this.options.highlightOpacity!,
      false
    );
    
    return elementId;
  }

  // Handle box selection start
  public startBoxSelection(x: number, y: number): void {
    this.boxSelection.active = true;
    this.boxSelection.startPoint.set(x, y);
    this.boxSelection.currentPoint.set(x, y);
    
    // Create helper line for box selection
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    this.boxSelection.helper = new THREE.LineSegments(geometry, material);
    this.scene.add(this.boxSelection.helper);
  }

  // Handle box selection update
  public updateBoxSelection(x: number, y: number): void {
    if (!this.boxSelection.active) return;
    
    this.boxSelection.currentPoint.set(x, y);
    this.updateBoxSelectionHelper();
  }

  // Update the box selection helper
  private updateBoxSelectionHelper(): void {
    if (!this.boxSelection.helper) return;
    
    // Calculate corners in screen space
    const minX = Math.min(this.boxSelection.startPoint.x, this.boxSelection.currentPoint.x);
    const maxX = Math.max(this.boxSelection.startPoint.x, this.boxSelection.currentPoint.x);
    const minY = Math.min(this.boxSelection.startPoint.y, this.boxSelection.currentPoint.y);
    const maxY = Math.max(this.boxSelection.startPoint.y, this.boxSelection.currentPoint.y);
    
    // Create points for the box
    const points = [
      new THREE.Vector3(minX, minY, 0),
      new THREE.Vector3(maxX, minY, 0),
      new THREE.Vector3(maxX, maxY, 0),
      new THREE.Vector3(minX, maxY, 0),
      new THREE.Vector3(minX, minY, 0)
    ];
    
    // Convert to 3D points in screen space
    const worldPoints = points.map(point => {
      // Convert to normalized device coordinates
      const ndc = new THREE.Vector3(
        (point.x / window.innerWidth) * 2 - 1,
        -(point.y / window.innerHeight) * 2 + 1,
        0
      );
      
      // Project to world space
      ndc.unproject(this.camera);
      ndc.z = 0;
      return ndc;
    });
    
    // Update helper geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(worldPoints);
    this.boxSelection.helper.geometry.dispose();
    this.boxSelection.helper.geometry = geometry;
  }

  // Finish box selection and select objects within the box
  public endBoxSelection(selectableObjects: THREE.Object3D[]): string[] {
    if (!this.boxSelection.active) return [];
    
    // Calculate box in screen space
    const minX = Math.min(this.boxSelection.startPoint.x, this.boxSelection.currentPoint.x);
    const maxX = Math.max(this.boxSelection.startPoint.x, this.boxSelection.currentPoint.x);
    const minY = Math.min(this.boxSelection.startPoint.y, this.boxSelection.currentPoint.y);
    const maxY = Math.max(this.boxSelection.startPoint.y, this.boxSelection.currentPoint.y);
    
    // Find objects within the box
    const selectedElementIds: string[] = [];
    
    selectableObjects.forEach(object => {
      if (!object.userData.elementId) return;
      
      // Get screen position of object
      const position = new THREE.Vector3();
      object.getWorldPosition(position);
      
      // Project to screen space
      position.project(this.camera);
      
      // Convert to pixel coordinates
      const screenX = (position.x + 1) * window.innerWidth / 2;
      const screenY = (-position.y + 1) * window.innerHeight / 2;
      
      // Check if within box
      if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
        const elementId = object.userData.elementId;
        selectedElementIds.push(elementId);
        this.selectObject(elementId, object);
      }
    });
    
    // Clean up
    if (this.boxSelection.helper) {
      this.scene.remove(this.boxSelection.helper);
      this.boxSelection.helper = null;
    }
    
    this.boxSelection.active = false;
    
    return selectedElementIds;
  }

  // Handle gizmo interaction
  private handleGizmoInteraction(intersect: THREE.Intersection): void {
    if (!intersect.object) return;
    
    // Find the axis group
    let axisGroup = intersect.object;
    while (axisGroup && !axisGroup.userData.axis) {
      axisGroup = axisGroup.parent!;
    }
    
    if (!axisGroup || !axisGroup.userData.axis) return;
    
    // Get the axis direction
    const axis = axisGroup.userData.axis as THREE.Vector3;
    
    // Start transformation based on mode
    this.startTransformation(axis);
  }

  // Start transformation
  private startTransformation(axis: THREE.Vector3): void {
    this.isTransforming = true;
    
    // Implementation depends on the transform mode
    // For simplicity, just log the axis
    console.log(`Starting ${this.transformMode} on axis:`, axis);
  }

  // Update transformation
  public updateTransformation(dx: number, dy: number): void {
    if (!this.isTransforming) return;
    
    // Implementation depends on the transform mode
    console.log(`Updating ${this.transformMode} by:`, dx, dy);
  }

  // End transformation
  public endTransformation(): void {
    this.isTransforming = false;
    
    // Implementation depends on the transform mode
    console.log(`Ended ${this.transformMode}`);
  }

  // Set transform mode
  public setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformMode = mode;
    
    // Update gizmo based on mode
    if (mode === 'translate') {
      this.createTranslateGizmo();
    }
    // Implement rotate and scale gizmos as needed
  }

  // Set transform space
  public setTransformSpace(space: 'local' | 'world'): void {
    this.transformSpace = space;
  }

  // Select an object
  public selectObject(elementId: string, object: THREE.Object3D): void {
    // Skip if already selected
    if (this.selectedObjects.has(elementId)) return;
    
    // Add highlight
    const highlight = this.highlightObject(
      object,
      this.options.highlightColor!,
      this.options.highlightOpacity!,
      this.options.showBoundingBox
    );
    
    // Add to selection
    this.selectedObjects.set(elementId, highlight);
    
    // Update transform gizmo position
    this.updateTransformGizmo();
  }

  // Deselect an object
  public deselectObject(elementId: string): void {
    const highlight = this.selectedObjects.get(elementId);
    if (!highlight) return;
    
    // Remove highlight
    this.removeHighlight(highlight);
    
    // Remove from selection
    this.selectedObjects.delete(elementId);
    
    // Update transform gizmo
    this.updateTransformGizmo();
  }

  // Clear all selection
  public clearSelection(): void {
    // Remove all highlights
    this.selectedObjects.forEach(highlight => {
      this.removeHighlight(highlight);
    });
    
    // Clear selection map
    this.selectedObjects.clear();
    
    // Hide transform gizmo
    if (this.transformGizmo) {
      this.transformGizmo.visible = false;
    }
  }

  // Clear hover effect
  public clearHover(): void {
    if (this.hoveredObject) {
      this.removeHighlight(this.hoveredObject);
      this.hoveredObject = null;
    }
  }

  // Highlight an object
  private highlightObject(
    object: THREE.Object3D,
    color: THREE.Color | string,
    opacity: number,
    showBoundingBox: boolean = false
  ): SelectionHighlight {
    const highlight: SelectionHighlight = {
      object: object
    };
    
    // Store original materials
    if (object instanceof THREE.Mesh) {
      highlight.originalMaterial = object.material;
      
      // Create highlight material
      const highlightMaterial = this.createHighlightMaterial(
        object.material,
        color,
        opacity
      );
      
      // Apply highlight material
      object.material = highlightMaterial;
      highlight.highlightMaterial = highlightMaterial;
      
      // Add wireframe if needed
      if (!object.userData.hasWireframe) {
        const wireframe = this.createWireframe(
          object,
          this.options.wireframeColor!,
          this.options.wireframeOpacity!
        );
        
        if (wireframe) {
          object.add(wireframe);
          highlight.wireframe = wireframe;
        }
      }
    }
    
    // Add bounding box if needed
    if (showBoundingBox) {
      const boundingBox = this.createBoundingBox(object);
      if (boundingBox) {
        this.scene.add(boundingBox);
        highlight.boundingBox = boundingBox;
      }
    }
    
    return highlight;
  }

  // Create a highlight material
  private createHighlightMaterial(
    originalMaterial: THREE.Material | THREE.Material[],
    color: THREE.Color | string,
    opacity: number
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(originalMaterial)) {
      // Handle multi-material objects
      return originalMaterial.map(mat => 
        this.createSingleHighlightMaterial(mat, color, opacity)
      );
    } else {
      // Handle single-material objects
      return this.createSingleHighlightMaterial(originalMaterial, color, opacity);
    }
  }

  // Create a single highlight material
  private createSingleHighlightMaterial(
    originalMaterial: THREE.Material,
    color: THREE.Color | string,
    opacity: number
  ): THREE.Material {
    // Create a highlight material based on original type
    if (originalMaterial instanceof THREE.MeshStandardMaterial) {
      return new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        roughness: 0.8,
        metalness: 0.2,
        emissive: new THREE.Color(color).multiplyScalar(0.4),
        wireframe: originalMaterial.wireframe,
        side: THREE.DoubleSide
      });
    } else if (originalMaterial instanceof THREE.MeshBasicMaterial) {
      return new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        wireframe: originalMaterial.wireframe,
        side: THREE.DoubleSide
      });
    } else if (originalMaterial instanceof THREE.LineBasicMaterial) {
      return new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        linewidth: (originalMaterial as THREE.LineBasicMaterial).linewidth
      });
    } else {
      // Fallback for other material types
      return new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide
      });
    }
  }

  // Create a wireframe for an object
  private createWireframe(
    object: THREE.Mesh,
    color: THREE.Color | string,
    opacity: number
  ): THREE.LineSegments | undefined {
    try {
      // Create wireframe geometry
      const wireframeGeometry = new THREE.WireframeGeometry(object.geometry);
      
      // Create wireframe material
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        linewidth: 1
      });
      
      // Create wireframe mesh
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      wireframe.userData.isWireframe = true;
      
      // Mark object as having wireframe
      object.userData.hasWireframe = true;
      
      return wireframe;
    } catch (error) {
      console.error('Error creating wireframe:', error);
      return undefined;
    }
  }

  // Create a bounding box for an object
  private createBoundingBox(object: THREE.Object3D): THREE.Box3Helper | undefined {
    try {
      // Calculate bounding box
      const boundingBox = new THREE.Box3().setFromObject(object);
      
      // Create helper
      const helper = new THREE.Box3Helper(
        boundingBox,
        typeof this.options.boundingBoxColor === 'string'
          ? new THREE.Color(this.options.boundingBoxColor)
          : this.options.boundingBoxColor as THREE.Color
      );
      
      helper.userData.isBoundingBox = true;
      
      return helper;
    } catch (error) {
      console.error('Error creating bounding box:', error);
      return undefined;
    }
  }

  // Remove highlight from an object
  private removeHighlight(highlight: SelectionHighlight): void {
    // Restore original material
    if (highlight.originalMaterial && highlight.object instanceof THREE.Mesh) {
      highlight.object.material = highlight.originalMaterial;
    }
    
    // Remove wireframe
    if (highlight.wireframe && highlight.object) {
      highlight.object.remove(highlight.wireframe);
      highlight.wireframe.geometry.dispose();
      if (highlight.wireframe.material instanceof THREE.Material) {
        highlight.wireframe.material.dispose();
      }
      highlight.object.userData.hasWireframe = false;
    }
    
    // Remove bounding box
    if (highlight.boundingBox) {
      this.scene.remove(highlight.boundingBox);
      if (highlight.boundingBox.material instanceof THREE.Material) {
        highlight.boundingBox.material.dispose();
      }
    }
  }

  // Update transform gizmo position
  private updateTransformGizmo(): void {
    if (!this.transformGizmo) return;
    
    // If no selection, hide gizmo
    if (this.selectedObjects.size === 0) {
      this.transformGizmo.visible = false;
      return;
    }
    
    // Calculate center of selection
    const center = new THREE.Vector3();
    let count = 0;
    
    this.selectedObjects.forEach(highlight => {
      const position = new THREE.Vector3();
      highlight.object.getWorldPosition(position);
      center.add(position);
      count++;
    });
    
    if (count > 0) {
      center.divideScalar(count);
    }
    
    // Position the gizmo
    this.transformGizmo.position.copy(center);
    this.transformGizmo.visible = true;
  }

  // Map element to object
  public mapElementToObject(element: Element, object: THREE.Object3D): void {
    this.elementMap.set(element.id, object);
    this.objectMap.set(object, element.id);
    
    // Set element ID on object
    object.userData.elementId = element.id;
    object.userData.isCADElement = true;
  }

  // Update element mapping
  public clearElementMapping(): void {
    this.elementMap.clear();
    this.objectMap.clear();
  }

  // Get object by element ID
  public getObjectByElementId(elementId: string): THREE.Object3D | undefined {
    return this.elementMap.get(elementId);
  }

  // Get element ID by object
  public getElementIdByObject(object: THREE.Object3D): string | undefined {
    return this.objectMap.get(object);
  }

  // Get selected element IDs
  public getSelectedElementIds(): string[] {
    return Array.from(this.selectedObjects.keys());
  }

  // Check if element is selected
  public isElementSelected(elementId: string): boolean {
    return this.selectedObjects.has(elementId);
  }

  // Select element by ID
  public selectElementById(elementId: string): boolean {
    const object = this.elementMap.get(elementId);
    if (!object) return false;
    
    this.selectObject(elementId, object);
    return true;
  }

  // Deselect element by ID
  public deselectElementById(elementId: string): boolean {
    if (!this.selectedObjects.has(elementId)) return false;
    
    this.deselectObject(elementId);
    return true;
  }

  // Set selection from element IDs
  public setSelectionFromElementIds(elementIds: string[]): void {
    // Clear current selection
    this.clearSelection();
    
    // Select each element
    elementIds.forEach(elementId => {
      this.selectElementById(elementId);
    });
  }

  // Dispose resources
  public dispose(): void {
    // Clear selection
    this.clearSelection();
    
    // Clear hover
    this.clearHover();
    
    // Remove transform gizmo
    if (this.transformGizmo) {
      this.scene.remove(this.transformGizmo);
      this.disposeObject(this.transformGizmo);
      this.transformGizmo = null;
    }
    
    // Clear box selection
    if (this.boxSelection.helper) {
      this.scene.remove(this.boxSelection.helper);
      if (this.boxSelection.helper.geometry) {
        this.boxSelection.helper.geometry.dispose();
      }
      if (this.boxSelection.helper.material instanceof THREE.Material) {
        this.boxSelection.helper.material.dispose();
      }
      this.boxSelection.helper = null;
    }
    
    // Clear maps
    this.elementMap.clear();
    this.objectMap.clear();
  }

  // Dispose Three.js object
  private disposeObject(object: THREE.Object3D): void {
    // Dispose of geometry and materials
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      if (object.geometry) {
        object.geometry.dispose();
      }
      
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
    
    // Dispose of children recursively
    while (object.children.length > 0) {
      this.disposeObject(object.children[0]);
      object.remove(object.children[0]);
    }
  }
}
