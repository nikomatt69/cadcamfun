// src/lib/canvas/cad-tool-controller.ts
import * as THREE from 'three';
import { ToolType, CADTool, CADToolsRegistry } from './cadTools';
import { Element } from 'src/store/elementsStore';
import { Layer } from 'src/store/layerStore';
import { useSnap } from '@/src/hooks/useSnap';

// Define SnapPoint interface
interface SnapPoint {
  position: THREE.Vector3;
  type: string;
  elementId?: string;
  objectId?: string;
}

interface ToolControllerOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  useSnap?: boolean;
  defaultLayer?: Layer;
  onToolChanged?: (tool: ToolType) => void;
  onElementCreated?: (element: Element) => void;
  onPreviewUpdated?: (preview: THREE.Object3D | null) => void;
  onToolStatusMessage?: (message: string) => void;
}

/**
 * Controller for CAD tools
 */
export class CADToolController {
  private registry: CADToolsRegistry;
  private activeTool: CADTool | null = null;
  private activeToolType: ToolType | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private options: ToolControllerOptions;
  private isActive: boolean = false;
  private points: THREE.Vector3[] = [];
  private tempPoints: THREE.Vector3[] = [];
  private previewObject: THREE.Object3D | null = null;
  private originOffset: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
  private snapPoints: SnapPoint[] = [];
  private parameters: Record<string, any> = {};
  private coordSystem: 'absolute' | 'relative' | 'polar' = 'absolute';
  private readonly DEFAULT_COLOR = 0x1e88e5;
  private readonly PREVIEW_COLOR = 0x4caf50;
  private readonly PREVIEW_OPACITY = 0.6;
  private undoStack: Element[][] = [[]];
  private redoStack: Element[][] = [];
  
  /**
   * Create a new CAD tool controller
   */
  constructor(options: ToolControllerOptions) {
    this.registry = new CADToolsRegistry();
    this.scene = options.scene;
    this.camera = options.camera;
    this.options = options;
    
    // Initialize with default tool (select)
    this.registerDefaultTools();
  }
  
  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Selection tool
    this.registry.registerTool({
      id: 'select',
      name: 'Select',
      icon: 'select',
      category: '2d',
      description: 'Select and manipulate elements',
      shortcut: 'S'
    });
    
    // Line tool
    this.registry.registerTool({
      id: 'line',
      name: 'Line',
      icon: 'line',
      category: '2d',
      description: 'Create a line between two points',
      useSnap: true,
      shortcut: 'L',
      create: (params) => {
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'line',
          x1: params.points[0].x - this.originOffset.x,
          y1: params.points[0].y - this.originOffset.y,
          z1: params.points[0].z - this.originOffset.z,
          x2: params.points[1].x - this.originOffset.x,
          y2: params.points[1].y - this.originOffset.y,
          z2: params.points[1].z - this.originOffset.z,
          color: params.color || this.DEFAULT_COLOR,
          linewidth: params.linewidth || 1
        } as Element;
      }
    });
    
    // Rectangle tool
    this.registry.registerTool({
      id: 'rectangle',
      name: 'Rectangle',
      icon: 'rectangle',
      category: '2d',
      description: 'Create a rectangle by defining two corners',
      useSnap: true,
      shortcut: 'R',
      create: (params) => {
        const [p1, p2] = params.points;
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        const centerX = (p1.x + p2.x) / 2 - this.originOffset.x;
        const centerY = (p1.y + p2.y) / 2 - this.originOffset.y;
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'rectangle',
          x: centerX,
          y: centerY,
          z: (p1.z - this.originOffset.z) || 0,
          width,
          height,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false,
          angle: params.angle || 0
        } as Element;
      }
    });
    
    // Circle tool
    this.registry.registerTool({
      id: 'circle',
      name: 'Circle',
      icon: 'circle',
      category: '2d',
      description: 'Create a circle by defining center and radius',
      useSnap: true,
      shortcut: 'C',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'circle',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Arc tool
    this.registry.registerTool({
      id: 'arc',
      name: 'Arc',
      icon: 'arc',
      category: '2d',
      description: 'Create an arc by defining center, start and end points',
      useSnap: true,
      shortcut: 'A',
      create: (params) => {
        const [center, startPoint, endPoint] = params.points;
        
        // Calculate radius
        const dx1 = startPoint.x - center.x;
        const dy1 = startPoint.y - center.y;
        const radius = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        
        // Calculate angles
        const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
        const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'arc',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          startAngle: (startAngle * 180) / Math.PI,
          endAngle: (endAngle * 180) / Math.PI,
          color: params.color || this.DEFAULT_COLOR,
          linewidth: params.linewidth || 1
        } as Element;
      }
    });
    
    // Polygon tool
    this.registry.registerTool({
      id: 'polygon',
      name: 'Polygon',
      icon: 'polygon',
      category: '2d',
      description: 'Create a regular polygon',
      useSnap: true,
      shortcut: 'P',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'polygon',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          sides: params.sides || 6,
          radius,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Cube tool
    this.registry.registerTool({
      id: 'cube',
      name: 'Cube',
      icon: 'cube',
      category: '3d',
      description: 'Create a cube',
      useSnap: true,
      shortcut: 'Alt+C',
      create: (params) => {
        const [p1, p2] = params.points;
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        const depth = params.depth || Math.min(width, height);
        const centerX = (p1.x + p2.x) / 2 - this.originOffset.x;
        const centerY = (p1.y + p2.y) / 2 - this.originOffset.y;
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'cube',
          x: centerX,
          y: centerY,
          z: (p1.z - this.originOffset.z) || 0,
          width,
          height,
          depth,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Sphere tool
    this.registry.registerTool({
      id: 'sphere',
      name: 'Sphere',
      icon: 'sphere',
      category: '3d',
      description: 'Create a sphere',
      useSnap: true,
      shortcut: 'Alt+S',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const dz = (radiusPoint.z - center.z) || 0;
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'sphere', 
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Cylinder tool
    this.registry.registerTool({
      id: 'cylinder',
      name: 'Cylinder',
      icon: 'cylinder',
      category: '3d',
      description: 'Create a cylinder',
      useSnap: true,
      shortcut: 'Alt+Y',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const height = params.height || radius * 2;
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'cylinder',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          height,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Cone tool
    this.registry.registerTool({
      id: 'cone',
      name: 'Cone',
      icon: 'cone',
      category: '3d',
      description: 'Create a cone',
      useSnap: true,
      shortcut: 'Alt+O',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const height = params.height || radius * 2;
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'cone',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          height,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Torus tool
    this.registry.registerTool({
      id: 'torus',
      name: 'Torus',
      icon: 'torus',
      category: '3d',
      description: 'Create a torus',
      useSnap: true,
      shortcut: 'Alt+T',
      create: (params) => {
        const [center, radiusPoint] = params.points;
        const dx = radiusPoint.x - center.x;
        const dy = radiusPoint.y - center.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const tubeRadius = params.tubeRadius || radius / 4;
        
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'torus',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: (center.z - this.originOffset.z) || 0,
          radius,
          tubeRadius,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Extrusion tool
    this.registry.registerTool({
      id: 'extrude',
      name: 'Extrude',
      icon: 'extrude',
      category: '3d',
      description: 'Extrude a 2D shape into a 3D object',
      useSnap: true,
      shortcut: 'Alt+E',
      create: (params) => {
        // This would depend on the shape being extruded
        return {
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          type: 'extrude',
          x: params.x - this.originOffset.x,
          y: params.y - this.originOffset.y,
          z: params.z - this.originOffset.z,
          shape: params.shape || 'rect',
          width: params.width || 50,
          height: params.height || 30,
          depth: params.depth || 20,
          color: params.color || this.DEFAULT_COLOR,
          wireframe: params.wireframe || false
        } as Element;
      }
    });
    
    // Fillet tool
    this.registry.registerTool({
      id: 'fillet',
      name: 'Fillet',
      icon: 'fillet',
      category: 'modify',
      description: 'Create a fillet between two edges',
      requiresSelection: true,
      shortcut: 'F',
    });
    
    // Chamfer tool
    this.registry.registerTool({
      id: 'chamfer',
      name: 'Chamfer',
      icon: 'chamfer',
      category: 'modify',
      description: 'Create a chamfer between two edges',
      requiresSelection: true,
      shortcut: 'Alt+F',
    });
    
    // Measure tool
    this.registry.registerTool({
      id: 'measure',
      name: 'Measure',
      icon: 'measure',
      category: 'measure',
      description: 'Measure distance between points',
      useSnap: true,
      shortcut: 'M',
    });
    
    // Text tool
    this.registry.registerTool({
      id: 'text',
      name: 'Text',
      icon: 'text',
      category: '2d',
      description: 'Add text',
      shortcut: 'T',
      create: (params) => {
        const [position] = params.points;
        
        return {
          type: 'text',
          id: crypto.randomUUID(),
          layerId: params.layerId || 'default',
          x: position.x - this.originOffset.x,
          y: position.y - this.originOffset.y,
          z: (position.z - this.originOffset.z) || 0,
          text: params.text || 'Text',
          size: params.size || 10,
          color: params.color || this.DEFAULT_COLOR,
          font: params.font || 'Arial'
        } as Element;
      }
    });
  }
  /**
   * Get all available tools
   */
  public getTools(): { category: string, tools: any[] }[] {
    const tools = this.registry.getAllDefinitions();
    const toolsByCategory: Record<string, any[]> = {};
    
    tools.forEach(tool => {
      if (!toolsByCategory[tool.category]) {
        toolsByCategory[tool.category] = [];
      }
      toolsByCategory[tool.category].push(tool);
    });
    
    // Convert to array format
    return Object.entries(toolsByCategory).map(([category, tools]) => ({
      category,
      tools
    }));
  }
  
  /**
   * Activate a tool
   */
  public activateTool(toolType: ToolType): void {
    if (this.activeToolType === toolType) return;
    
    const tool = this.registry.getTool(toolType);
    if (!tool) return;
    
    // Deactivate current tool
    this.deactivateTool();
    
    // Activate new tool
    this.activeTool = tool;
    this.activeToolType = toolType;
    this.isActive = true;
    this.points = [];
    this.tempPoints = [];
    this.parameters = {};
    this.updateToolStatusMessage();
    
    // Notify listeners
    if (this.options.onToolChanged) {
      this.options.onToolChanged(toolType);
    }
  }
  
  /**
   * Deactivate the current tool
   */
  public deactivateTool(): void {
    if (!this.activeTool) return;
    
    this.removePreview();
    this.activeTool = null;
    this.activeToolType = null;
    this.isActive = false;
    this.points = [];
    this.tempPoints = [];
    this.parameters = {};
  }
  
  /**
   * Set origin offset
   */
  public setOriginOffset(offset: { x: number, y: number, z: number }): void {
    this.originOffset = offset;
  }
  
  /**
   * Set snap points
   */
  public setSnapPoints(points: SnapPoint[]): void {
    this.snapPoints = points;
  }
  
  /**
   * Handle mouse move event
   */
  public handleMouseMove(position: THREE.Vector3, snapPosition?: THREE.Vector3): void {
    if (!this.isActive || !this.activeTool) return;
    
    // Use snapped position if available
    const finalPosition = snapPosition || position;
    
    // Update temporary points
    this.tempPoints = [...this.points, finalPosition];
    
    // Update preview
    this.updatePreview();
  }
  
  /**
   * Handle mouse click event
   */
  public handleClick(position: THREE.Vector3, snapPosition?: THREE.Vector3): Element | null {
    if (!this.isActive || !this.activeTool || !this.activeToolType) return null;
    
    const finalPosition = snapPosition || position;
    
    // Skip if this is the same as the last point (double click prevention)
    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      const distance = lastPoint.distanceTo(finalPosition);
      if (distance < 0.001) return null;
    }
    
    // Add point
    this.points.push(finalPosition.clone());
    
    // Update preview
    this.updatePreview();
    
    // Check if we have enough points to create the element
    const toolDefinition = this.registry.getDefinition(this.activeToolType);
    if (!toolDefinition || !toolDefinition.create) return null;
    
    let element: Element | null = null;
    
    // Check if tool has a specific requirement for points
    if (this.activeToolType === 'line' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'rectangle' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'circle' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'arc' && this.points.length === 3) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'polygon' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'cube' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'sphere' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'cylinder' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'cone' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'torus' && this.points.length === 2) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    } else if (this.activeToolType === 'text' && this.points.length === 1) {
      element = toolDefinition.create({
        points: this.points,
        ...this.parameters
      });
    }
    
    // If element created, notify listeners and reset tool state
    if (element) {
      // Add default layer ID if not specified
      if (!element.layerId && this.options.defaultLayer) {
        element.layerId = this.options.defaultLayer.id;
      }
      
      // Add element to the document
      if (this.options.onElementCreated) {
        this.options.onElementCreated(element);
      }
      
      // Reset points for next element
      this.points = [];
      this.tempPoints = [];
      this.updatePreview();
      this.updateToolStatusMessage();
      
      return element;
    }
    
    // Update status message
    this.updateToolStatusMessage();
    
    return null;
  }
  
  /**
   * Set a parameter for the current tool
   */
  public setParameter(name: string, value: any): void {
    this.parameters[name] = value;
    this.updatePreview();
  }
  
  /**
   * Set coordinate system mode
   */
  public setCoordSystem(mode: 'absolute' | 'relative' | 'polar'): void {
    this.coordSystem = mode;
  }
  
  /**
   * Cancel the current operation
   */
  public cancelOperation(): void {
    this.points = [];
    this.tempPoints = [];
    this.removePreview();
    this.updateToolStatusMessage();
  }
  
  /**
   * Update the preview object
   */
  private updatePreview(): void {
    // Remove existing preview
    this.removePreview();
    
    if (!this.activeTool || !this.activeToolType) return;
    
    const allPoints = [...this.points, ...this.tempPoints];
    if (allPoints.length === 0) return;
    
    // Create preview based on tool type
    switch (this.activeToolType) {
      case 'line':
        this.createLinePreview(allPoints);
        break;
      case 'rectangle':
        this.createRectanglePreview(allPoints);
        break;
      case 'circle':
        this.createCirclePreview(allPoints);
        break;
      case 'arc':
        this.createArcPreview(allPoints);
        break;
      case 'polygon':
        this.createPolygonPreview(allPoints);
        break;
      case 'cube':
        this.createCubePreview(allPoints);
        break;
      case 'sphere':
        this.createSpherePreview(allPoints);
        break;
      case 'cylinder':
        this.createCylinderPreview(allPoints);
        break;
      case 'cone':
        this.createConePreview(allPoints);
        break;
      case 'torus':
        this.createTorusPreview(allPoints);
        break;
      case 'text':
        this.createTextPreview(allPoints);
        break;
      // Add other tool previews as needed
    }
    
    // Notify listeners
    if (this.options.onPreviewUpdated && this.previewObject) {
      this.options.onPreviewUpdated(this.previewObject);
    }
  }
  
  /**
   * Remove the preview object
   */
  private removePreview(): void {
    if (this.previewObject && this.scene) {
      this.scene.remove(this.previewObject);
      this.previewObject = null;
      
      // Notify listeners
      if (this.options.onPreviewUpdated) {
        this.options.onPreviewUpdated(null);
      }
    }
  }
  
  /**
   * Create line preview
   */
  private createLinePreview(points: THREE.Vector3[]): void {
    if (points.length < 2) return;
    
    const lineMaterial = new THREE.LineBasicMaterial({
      color: this.PREVIEW_COLOR,
      transparent: true,
      opacity: this.PREVIEW_OPACITY,
      linewidth: this.parameters.linewidth || 1
    });
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(lineGeometry, lineMaterial);
    
    line.userData.isPreview = true;
    this.previewObject = line;
    this.scene.add(line);
  }
  
  /**
   * Create rectangle preview
   */
  private createRectanglePreview(points: THREE.Vector3[]): void {
    if (points.length < 2) return;
    
    const [p1, p2] = points;
    
    const vertices = [
      new THREE.Vector3(p1.x, p1.y, p1.z),
      new THREE.Vector3(p2.x, p1.y, p1.z),
      new THREE.Vector3(p2.x, p2.y, p1.z),
      new THREE.Vector3(p1.x, p2.y, p1.z),
      new THREE.Vector3(p1.x, p1.y, p1.z),
    ];
    
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: this.PREVIEW_COLOR,
      transparent: true,
      opacity: this.PREVIEW_OPACITY,
      linewidth: 1
    });
    
    const outline = new THREE.Line(outlineGeometry, outlineMaterial);
    
    // Add fill
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);
    const fillGeometry = new THREE.PlaneGeometry(width, height);
    
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: this.PREVIEW_COLOR,
      transparent: true,
      opacity: this.PREVIEW_OPACITY / 2,
      side: THREE.DoubleSide
    });
    
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.position.set(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      p1.z
    );
    
    // Create group
    const group = new THREE.Group();
    group.add(outline);
    group.add(fill);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(group);
  }
  
  /**
   * Create circle preview
   */
  private createCirclePreview(points: THREE.Vector3[]): void {
    if (points.length < 2) return;
    
    const [center, radiusPoint] = points;
    
    const dx = radiusPoint.x - center.x;
    const dy = radiusPoint.y - center.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    const circleSegments = 64;
    const circleGeometry = new THREE.BufferGeometry();
    const circleVertices = [];
    
    for (let i = 0; i <= circleSegments; i++) {
      const theta = (i / circleSegments) * Math.PI * 2;
      const x = center.x + Math.cos(theta) * radius;
      const y = center.y + Math.sin(theta) * radius;
      circleVertices.push(new THREE.Vector3(x, y, center.z));
    }
    
    circleGeometry.setFromPoints(circleVertices);
    
    const circleMaterial = new THREE.LineBasicMaterial({
      color: this.PREVIEW_COLOR,
      transparent: true,
      opacity: this.PREVIEW_OPACITY,
      linewidth: 1
    });
    
    const circle = new THREE.Line(circleGeometry, circleMaterial);
    
    // Create fill
    const fillGeometry = new THREE.CircleGeometry(radius, circleSegments);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: this.PREVIEW_COLOR,
      transparent: true,
      opacity: this.PREVIEW_OPACITY / 2,
      side: THREE.DoubleSide
    });
    
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.position.copy(center);
    fill.rotation.x = -Math.PI / 2; // Orient horizontally
    
    // Create radius line
    const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
    const radiusLineMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(circle);
   group.add(fill);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create arc preview
  */
 private createArcPreview(points: THREE.Vector3[]): void {
   if (points.length < 2) {
     // Just show center and radius line if only 2 points
     if (points.length === 2) {
       const [center, radiusPoint] = points;
       
       const lineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
       const lineMaterial = new THREE.LineBasicMaterial({
         color: this.PREVIEW_COLOR,
         transparent: true,
         opacity: this.PREVIEW_OPACITY,
         linewidth: 1
       });
       
       const line = new THREE.Line(lineGeometry, lineMaterial);
       line.userData.isPreview = true;
       
       this.previewObject = line;
       this.scene.add(line);
     }
     return;
   }
   
   const [center, startPoint, endPoint] = points;
   
   // Calculate radius
   const dx1 = startPoint.x - center.x;
   const dy1 = startPoint.y - center.y;
   const radius = Math.sqrt(dx1 * dx1 + dy1 * dy1);
   
   // Calculate angles
   const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
   let endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
   
   // Ensure endAngle > startAngle
   if (endAngle < startAngle) {
     endAngle += Math.PI * 2;
   }
   
   // Create arc geometry
   const arcSegments = 64;
   const arcGeometry = new THREE.BufferGeometry();
   const arcVertices = [];
   
   const angleDelta = (endAngle - startAngle) / arcSegments;
   
   for (let i = 0; i <= arcSegments; i++) {
     const angle = startAngle + i * angleDelta;
     const x = center.x + Math.cos(angle) * radius;
     const y = center.y + Math.sin(angle) * radius;
     arcVertices.push(new THREE.Vector3(x, y, center.z));
   }
   
   arcGeometry.setFromPoints(arcVertices);
   
   const arcMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY,
     linewidth: 1
   });
   
   const arc = new THREE.Line(arcGeometry, arcMaterial);
   
   // Create radii lines
   const radiiGeometry = new THREE.BufferGeometry().setFromPoints([
     center, startPoint, center, endPoint
   ]);
   
   const radiiMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radii = new THREE.LineSegments(radiiGeometry, radiiMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(arc);
   group.add(radii);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create polygon preview
  */
 private createPolygonPreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [center, radiusPoint] = points;
   
   const dx = radiusPoint.x - center.x;
   const dy = radiusPoint.y - center.y;
   const radius = Math.sqrt(dx * dx + dy * dy);
   
   const sides = this.parameters.sides || 6;
   const polygonGeometry = new THREE.BufferGeometry();
   const polygonVertices = [];
   
   // Create vertices for regular polygon
   for (let i = 0; i <= sides; i++) {
     const angle = (i / sides) * Math.PI * 2;
     const x = center.x + Math.cos(angle) * radius;
     const y = center.y + Math.sin(angle) * radius;
     polygonVertices.push(new THREE.Vector3(x, y, center.z));
   }
   
   polygonGeometry.setFromPoints(polygonVertices);
   
   const polygonMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY,
     linewidth: 1
   });
   
   const polygon = new THREE.Line(polygonGeometry, polygonMaterial);
   
   // Create fill
   const shape = new THREE.Shape();
   
   for (let i = 0; i < sides; i++) {
     const angle = (i / sides) * Math.PI * 2;
     const x = Math.cos(angle) * radius;
     const y = Math.sin(angle) * radius;
     
     if (i === 0) {
       shape.moveTo(x, y);
     } else {
       shape.lineTo(x, y);
     }
   }
   
   shape.closePath();
   
   const fillGeometry = new THREE.ShapeGeometry(shape);
   const fillMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     side: THREE.DoubleSide
   });
   
   const fill = new THREE.Mesh(fillGeometry, fillMaterial);
   fill.position.copy(center);
   
   // Create radius line
   const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
   const radiusLineMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(polygon);
   group.add(fill);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create cube preview
  */
 private createCubePreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [p1, p2] = points;
   
   const width = Math.abs(p2.x - p1.x);
   const height = Math.abs(p2.y - p1.y);
   const depth = this.parameters.depth || Math.min(width, height);
   
   const cubeGeometry = new THREE.BoxGeometry(width, height, depth);
   const cubeMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     wireframe: true
   });
   
   const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
   cube.position.set(
     (p1.x + p2.x) / 2,
     (p1.y + p2.y) / 2,
     p1.z + depth / 2
   );
   
   // Create edges
   const edgesGeometry = new THREE.EdgesGeometry(cubeGeometry);
   const edgesMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY
   });
   
   const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
   edges.position.copy(cube.position);
   
   // Create group
   const group = new THREE.Group();
   group.add(cube);
   group.add(edges);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create sphere preview
  */
 private createSpherePreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [center, radiusPoint] = points;
   
   const dx = radiusPoint.x - center.x;
   const dy = radiusPoint.y - center.y;
   const dz = (radiusPoint.z - center.z) || 0;
   const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
   
   const sphereGeometry = new THREE.SphereGeometry(radius, 16, 16);
   const sphereMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     wireframe: true
   });
   
   const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
   sphere.position.copy(center);
   
   // Create wireframe
   const wireframeGeometry = new THREE.EdgesGeometry(sphereGeometry);
   const wireframeMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY
   });
   
   const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
   wireframe.position.copy(center);
   
   // Create radius line
   const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
   const radiusLineMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(sphere);
   group.add(wireframe);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create cylinder preview
  */
 private createCylinderPreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [center, radiusPoint] = points;
   
   const dx = radiusPoint.x - center.x;
   const dy = radiusPoint.y - center.y;
   const radius = Math.sqrt(dx * dx + dy * dy);
   const height = this.parameters.height || radius * 2;
   
   const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, height, 16);
   const cylinderMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     wireframe: true
   });
   
   const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
   cylinder.position.copy(center);
   cylinder.position.z += height / 2;
   
   // Rotate to align with Z axis
   cylinder.rotation.x = Math.PI / 2;
   
   // Create edges
   const edgesGeometry = new THREE.EdgesGeometry(cylinderGeometry);
   const edgesMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY
   });
   
   const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
   edges.position.copy(cylinder.position);
   edges.rotation.copy(cylinder.rotation);
   
   // Create radius line
   const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
   const radiusLineMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(cylinder);
   group.add(edges);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create cone preview
  */
 private createConePreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [center, radiusPoint] = points;
   
   const dx = radiusPoint.x - center.x;
   const dy = radiusPoint.y - center.y;
   const radius = Math.sqrt(dx * dx + dy * dy);
   const height = this.parameters.height || radius * 2;
   
   const coneGeometry = new THREE.ConeGeometry(radius, height, 16);
   const coneMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     wireframe: true
   });
   
   const cone = new THREE.Mesh(coneGeometry, coneMaterial);
   cone.position.copy(center);
   cone.position.z += height / 2;
   
   // Rotate to align with Z axis
   cone.rotation.x = Math.PI / 2;
   
   // Create edges
   const edgesGeometry = new THREE.EdgesGeometry(coneGeometry);
   const edgesMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY
   });
   
   const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
   edges.position.copy(cone.position);
   edges.rotation.copy(cone.rotation);
   
   // Create radius line
   const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
   const radiusLineMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(cone);
   group.add(edges);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create torus preview
  */
 private createTorusPreview(points: THREE.Vector3[]): void {
   if (points.length < 2) return;
   
   const [center, radiusPoint] = points;
   
   const dx = radiusPoint.x - center.x;
   const dy = radiusPoint.y - center.y;
   const radius = Math.sqrt(dx * dx + dy * dy);
   const tubeRadius = this.parameters.tubeRadius || radius / 4;
   
   const torusGeometry = new THREE.TorusGeometry(radius, tubeRadius, 16, 48);
   const torusMaterial = new THREE.MeshBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY / 2,
     wireframe: true
   });
   
   const torus = new THREE.Mesh(torusGeometry, torusMaterial);
   torus.position.copy(center);
   
   // Rotate to align with Z axis
   torus.rotation.x = Math.PI / 2;
   
   // Create edges
   const edgesGeometry = new THREE.EdgesGeometry(torusGeometry);
   const edgesMaterial = new THREE.LineBasicMaterial({
     color: this.PREVIEW_COLOR,
     transparent: true,
     opacity: this.PREVIEW_OPACITY
   });
   
   const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
   edges.position.copy(torus.position);
   edges.rotation.copy(torus.rotation);
   
   // Create radius line
   const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
   const radiusLineMaterial = new THREE.LineBasicMaterial({
     color: 0x888888,
     transparent: true,
     opacity: 0.5,
     linewidth: 1
   });
   
   const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
   
   // Create group
   const group = new THREE.Group();
   group.add(torus);
   group.add(edges);
   group.add(radiusLine);
   group.userData.isPreview = true;
   
   this.previewObject = group;
   this.scene.add(group);
 }
 
 /**
  * Create text preview
  */
 private createTextPreview(points: THREE.Vector3[]): void {
   if (points.length < 1) return;
   
   const [position] = points;
   const text = this.parameters.text || 'Text';
   const size = this.parameters.size || 10;
   
   // Create a canvas to render text
   const canvas = document.createElement('canvas');
   canvas.width = 256;
   canvas.height = 64;
   const context = canvas.getContext('2d');
   
   if (context) {
     context.fillStyle = '#ffffff';
     context.fillRect(0, 0, canvas.width, canvas.height);
     context.font = `${size * 2}px Arial`;
     context.textAlign = 'center';
     context.textBaseline = 'middle';
     context.fillStyle = '#00aa00';
     context.fillText(text, canvas.width / 2, canvas.height / 2);
     
     const texture = new THREE.CanvasTexture(canvas);
     
     const material = new THREE.SpriteMaterial({
       map: texture,
       transparent: true,
       opacity: this.PREVIEW_OPACITY
     });
     
     const sprite = new THREE.Sprite(material);
     sprite.position.copy(position);
     sprite.scale.set(size * text.length / 2, size, 1);
     
     sprite.userData.isPreview = true;
     this.previewObject = sprite;
     this.scene.add(sprite);
   }
 }
 
 /**
  * Update tool status message
  */
 private updateToolStatusMessage(): void {
   if (!this.activeTool || !this.activeToolType) return;
   
   const toolDefinition = this.registry.getDefinition(this.activeToolType);
   if (!toolDefinition) return;
   
   let message = '';
   
   switch (this.activeToolType) {
     case 'line':
       if (this.points.length === 0) {
         message = 'Click to set start point';
       } else {
         message = 'Click to set end point';
       }
       break;
     case 'rectangle':
       if (this.points.length === 0) {
         message = 'Click to set first corner';
       } else {
         message = 'Click to set opposite corner';
       }
       break;
     case 'circle':
       if (this.points.length === 0) {
         message = 'Click to set center point';
       } else {
         message = 'Click to set radius point';
       }
       break;
     case 'arc':
       if (this.points.length === 0) {
         message = 'Click to set center point';
       } else if (this.points.length === 1) {
         message = 'Click to set start point';
       } else {
         message = 'Click to set end point';
       }
       break;
     case 'polygon':
       if (this.points.length === 0) {
         message = 'Click to set center point';
       } else {
         message = 'Click to set radius point';
       }
       break;
     case 'cube':
       if (this.points.length === 0) {
         message = 'Click to set first corner';
       } else {
         message = 'Click to set opposite corner';
       }
       break;
     case 'sphere':
       if (this.points.length === 0) {
         message = 'Click to set center point';
       } else {
         message = 'Click to set radius point';
       }
       break;
     case 'cylinder':
     case 'cone':
     case 'torus':
       if (this.points.length === 0) {
         message = 'Click to set base center';
       } else {
         message = 'Click to set radius point';
       }
       break;
     case 'text':
       message = 'Click to place text';
       break;
     case 'measure':
       if (this.points.length === 0) {
         message = 'Click to set first point';
       } else {
         message = 'Click to set second point';
       }
       break;
     default:
       message = toolDefinition.description || '';
   }
   
   if (this.options.onToolStatusMessage) {
     this.options.onToolStatusMessage(message);
   }
 }
 
 /**
  * Get the active tool type
  */
 public getActiveToolType(): ToolType | null {
   return this.activeToolType;
 }
 
 /**
  * Get the current tool points
  */
 public getPoints(): THREE.Vector3[] {
   return [...this.points];
 }
 
 /**
  * Get temporary points
  */
 public getTempPoints(): THREE.Vector3[] {
   return [...this.tempPoints];
 }
 
 /**
  * Set points directly
  */
 public setPoints(points: THREE.Vector3[]): void {
   this.points = [...points];
   this.updatePreview();
   this.updateToolStatusMessage();
 }
}