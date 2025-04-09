// src/lib/canvas/cad-tools.ts - CAD Tools implementation
import * as THREE from 'three';
import { Element } from 'src/store/elementsStore';
import { Layer } from 'src/store/layerStore';

// Tool types
export type ToolType = 
  'select' | 
  'line' | 
  'rectangle' | 
  'circle' | 
  'arc' | 
  'polygon' | 
  'text' |
  'dimension' |
  'cube' |
  'sphere' |
  'cylinder' |
  'cone' |
  'torus' |
  'extrude' |
  'revolve' |
  'measure' |
  'fillet' |
  'chamfer' |
  'pattern' |
  'mirror';

// Tool category
export type ToolCategory = 
  '2d' | 
  '3d' | 
  'modify' | 
  'measure' | 
  'pattern';

// Tool definition
export interface CADToolDefinition {
  id: ToolType;
  name: string;
  icon: string | JSX.Element;
  category: ToolCategory;
  description: string;
  shortcut?: string;
  useSnap?: boolean;
  requiresSelection?: boolean;
  create?: (params: any) => Element;
}

// Tool state interface
export interface CADToolState {
  active: boolean;
  points: THREE.Vector3[];
  tempPoints: THREE.Vector3[];
  params: Record<string, any>;
}

// CAD Tool class
export class CADTool {
  private definition: CADToolDefinition;
  private state: CADToolState;
  private scene: THREE.Scene | null = null;
  private previewObject: THREE.Object3D | null = null;
  private originOffset: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
  private activeLayer: Layer | null = null;
  
  constructor(definition: CADToolDefinition) {
    this.definition = definition;
    this.state = {
      active: false,
      points: [],
      tempPoints: [],
      params: {}
    };
  }
  
  // Initialize the tool
  public initialize(scene: THREE.Scene, originOffset: { x: number, y: number, z: number }, activeLayer: Layer): void {
    this.scene = scene;
    this.originOffset = originOffset;
    this.activeLayer = activeLayer;
  }
  
  // Activate the tool
  public activate(): void {
    this.state.active = true;
    this.state.points = [];
    this.state.tempPoints = [];
    this.state.params = {};
    
    // Create preview object if needed
    this.createPreviewObject();
  }
  
  // Deactivate the tool
  public deactivate(): void {
    this.state.active = false;
    
    // Remove preview object
    this.removePreviewObject();
  }
  
  // Handle mouse move
  public handleMouseMove(position: THREE.Vector3): void {
    if (!this.state.active) return;
    
    // Update temp points with current mouse position
    if (this.state.points.length > 0) {
      this.state.tempPoints = [this.state.points[0], position];
    } else {
      this.state.tempPoints = [position];
    }
    
    // Update preview
    this.updatePreviewObject();
  }
  
  // Handle mouse click
  public handleClick(position: THREE.Vector3): Element | null {
    if (!this.state.active) return null;
    
    // Add point
    this.state.points.push(position.clone());
    
    // Check if we have enough points to create the element
    if (this.isComplete()) {
      // Create element
      const element = this.createElement();
      
      // Reset state
      this.state.points = [];
      this.state.tempPoints = [];
      
      // Remove preview object
      this.removePreviewObject();
      
      // Create new preview for next element
      this.createPreviewObject();
      
      return element;
    }
    
    // Update preview
    this.updatePreviewObject();
    
    return null;
  }
  
  // Set parameter
  public setParameter(name: string, value: any): void {
    this.state.params[name] = value;
    
    // Update preview
    this.updatePreviewObject();
  }
  
  // Check if we have enough points to create the element
  private isComplete(): boolean {
    const { id } = this.definition;
    
    switch (id) {
      case 'line':
        return this.state.points.length >= 2;
      
      case 'rectangle':
        return this.state.points.length >= 2;
      
      case 'circle':
        // For center-radius mode
        if (this.state.params.mode === 'center-radius') {
          return this.state.points.length >= 2;
        }
        // For 3-point mode
        return this.state.points.length >= 3;
      
      case 'arc':
        return this.state.points.length >= 3;
      
      case 'polygon':
        if (this.state.params.sides) {
          // Regular polygon (center + radius)
          return this.state.points.length >= 2;
        }
        // Irregular polygon
        return this.state.params.closePath === true && this.state.points.length >= 3;
      
      case 'text':
        return this.state.points.length >= 1 && this.state.params.text;
      
      case 'dimension':
        return this.state.points.length >= 3;
      
      case 'cube':
        return this.state.points.length >= 2;
      
      case 'sphere':
        return this.state.points.length >= 2;
      
      case 'cylinder':
        return this.state.points.length >= 2 && this.state.params.height !== undefined;
      
      case 'cone':
        return this.state.points.length >= 2 && this.state.params.height !== undefined;
      
      case 'torus':
        return this.state.points.length >= 2 && this.state.params.tubeRadius !== undefined;
      
      case 'extrude':
        return this.state.params.shape && this.state.params.depth !== undefined;
      
      case 'revolve':
        return this.state.params.profile && this.state.params.angle !== undefined;
      
      case 'fillet':
        return this.state.points.length >= 1 && this.state.params.radius !== undefined;
      
      case 'chamfer':
        return this.state.points.length >= 1 && this.state.params.distance !== undefined;
      
      case 'pattern':
        return this.state.params.sourceElement && 
               (this.state.params.count !== undefined || 
                (this.state.params.countX !== undefined && this.state.params.countY !== undefined));
      
      case 'mirror':
        return this.state.params.sourceElement && this.state.points.length >= 2;
      
      default:
        return false;
    }
  }
  
  // Create the element
  private createElement(): Element {
    if (!this.activeLayer) throw new Error('No active layer');
    
    // Base element with required properties
    const baseElement: Partial<Element> = {
      type: this.definition.id,
      layerId: this.activeLayer.id,
    };
    
    // Create element based on tool type
    switch (this.definition.id) {
      case 'line': {
        const [start, end] = this.state.points;
        return {
          ...baseElement,
          type: 'line',
          x1: start.x - this.originOffset.x,
          y1: start.y - this.originOffset.y,
          z1: start.z - this.originOffset.z,
          x2: end.x - this.originOffset.x,
          y2: end.y - this.originOffset.y,
          z2: end.z - this.originOffset.z,
          color: this.activeLayer.color,
          linewidth: this.state.params.linewidth || 1
        } as Element;
      }
      
      case 'rectangle': {
        const [start, end] = this.state.points;
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        const centerX = (start.x + end.x) / 2 - this.originOffset.x;
        const centerY = (start.y + end.y) / 2 - this.originOffset.y;
        
        return {
          ...baseElement,
          type: 'rectangle',
          x: centerX,
          y: centerY,
          z: start.z - this.originOffset.z,
          width,
          height,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false,
          angle: this.state.params.angle || 0
        } as Element;
      }
      
      case 'circle': {
        if (this.state.params.mode === 'center-radius') {
          const [center, radiusPoint] = this.state.points;
          const radius = center.distanceTo(radiusPoint);
          
          return {
            ...baseElement,
            type: 'circle',
            x: center.x - this.originOffset.x,
            y: center.y - this.originOffset.y,
            z: center.z - this.originOffset.z,
            radius,
            color: this.activeLayer.color,
            wireframe: this.state.params.wireframe || false
          } as Element;
        } else {
          // 3-point circle
          const [p1, p2, p3] = this.state.points;
          
          // Calculate circle from 3 points
          const temp1 = new THREE.Vector2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
          const temp2 = new THREE.Vector2(-1 * (p2.y - p1.y), p2.x - p1.x);
          
          const temp3 = new THREE.Vector2((p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
          const temp4 = new THREE.Vector2(-1 * (p3.y - p2.y), p3.x - p2.x);
          
          // Find intersection of perpendicular bisectors
          const a = temp2.y;
          const b = -temp4.y;
          const c = temp4.x;
          const d = -temp2.x;
          const e = temp2.y * temp1.x - temp2.x * temp1.y;
          const f = temp4.y * temp3.x - temp4.x * temp3.y;
          
          const det = a * d - b * c;
          if (Math.abs(det) < 0.001) {
            // Points are collinear
            return this.createLineElement(p1, p3) as Element;
          }
          
          const center = new THREE.Vector2(
            (d * e - b * f) / det,
            (a * f - c * e) / det
          );
          
          const radius = center.distanceTo(new THREE.Vector2(p1.x, p1.y));
          
          return {
            ...baseElement,
            type: 'circle',
            x: center.x - this.originOffset.x,
            y: center.y - this.originOffset.y,
            z: p1.z - this.originOffset.z,
            radius,
            color: this.activeLayer.color,
            wireframe: this.state.params.wireframe || false
          } as Element;
        }
      }
      
      case 'arc': {
        const [center, startPoint, endPoint] = this.state.points;
        
        // Calculate radius
        const radius = center.distanceTo(startPoint);
        
        // Calculate angles
        const startVector = new THREE.Vector2(
          startPoint.x - center.x,
          startPoint.y - center.y
        );
        
        const endVector = new THREE.Vector2(
          endPoint.x - center.x,
          endPoint.y - center.y
        );
        
        const startAngle = Math.atan2(startVector.y, startVector.x);
        const endAngle = Math.atan2(endVector.y, endVector.x);
        
        return {
          ...baseElement,
          type: 'arc',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: center.z - this.originOffset.z,
          radius,
          startAngle: startAngle * (180 / Math.PI),
          endAngle: endAngle * (180 / Math.PI),
          color: this.activeLayer.color,
          linewidth: this.state.params.linewidth || 1
        } as Element;
      }
      
      case 'polygon': {
        if (this.state.params.sides) {
          // Regular polygon
          const [center, firstPoint] = this.state.points;
          const radius = center.distanceTo(firstPoint);
          
          return {
            ...baseElement,
            type: 'polygon',
            x: center.x - this.originOffset.x,
            y: center.y - this.originOffset.y,
            z: center.z - this.originOffset.z,
            sides: this.state.params.sides,
            radius,
            color: this.activeLayer.color,
            wireframe: this.state.params.wireframe || false,
            angle: this.state.params.angle || 0
          } as Element;
        } else {
          // Irregular polygon (path)
          const points = this.state.points.map(p => ({
            x: p.x - this.originOffset.x,
            y: p.y - this.originOffset.y,
            z: p.z - this.originOffset.z
          }));
          
          // Calculate center as average of points
          const center = points.reduce(
            (acc, p) => ({
              x: acc.x + p.x / points.length,
              y: acc.y + p.y / points.length,
              z: acc.z + p.z / points.length
            }),
            { x: 0, y: 0, z: 0 }
          );
          
          return {
            ...baseElement,
            type: 'polygon',
            x: center.x,
            y: center.y,
            z: center.z,
            points,
            color: this.activeLayer.color,
            wireframe: this.state.params.wireframe || false,
            closed: this.state.params.closePath || true
          } as Element;
        }
      }
      
      case 'text': {
        const [position] = this.state.points;
        
        return {
          ...baseElement,
          type: 'text',
          x: position.x - this.originOffset.x,
          y: position.y - this.originOffset.y,
          z: position.z - this.originOffset.z,
          text: this.state.params.text || 'Text',
          size: this.state.params.size || 10,
          color: this.activeLayer.color,
          font: this.state.params.font || 'Arial',
          angle: this.state.params.angle || 0
        } as Element;
      }
      
      case 'cube': {
        const [start, end] = this.state.points;
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        const depth = this.state.params.depth || Math.min(width, height);
        const centerX = (start.x + end.x) / 2 - this.originOffset.x;
        const centerY = (start.y + end.y) / 2 - this.originOffset.y;
        
        return {
          ...baseElement,
          type: 'cube',
          x: centerX,
          y: centerY,
          z: start.z - this.originOffset.z,
          width,
          height,
          depth,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false,
          angleX: this.state.params.angleX || 0,
          angleY: this.state.params.angleY || 0,
          angleZ: this.state.params.angleZ || 0
        } as Element;
      }
      
      case 'sphere': {
        const [center, radiusPoint] = this.state.points;
        const radius = center.distanceTo(radiusPoint);
        
        return {
          ...baseElement,
          type: 'sphere',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: center.z - this.originOffset.z,
          radius,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false
        } as Element;
      }
      
      case 'cylinder': {
        const [center, radiusPoint] = this.state.points;
        const radius = center.distanceTo(radiusPoint);
        const height = this.state.params.height || radius * 2;
        
        return {
          ...baseElement,
          type: 'cylinder',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: center.z - this.originOffset.z,
          radius,
          height,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false,
          angleX: this.state.params.angleX || 0,
          angleY: this.state.params.angleY || 0,
          angleZ: this.state.params.angleZ || 0
        } as Element;
      }
      
      case 'cone': {
        const [center, radiusPoint] = this.state.points;
        const radius = center.distanceTo(radiusPoint);
        const height = this.state.params.height || radius * 2;
        
        return {
          ...baseElement,
          type: 'cone',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: center.z - this.originOffset.z,
          radius,
          height,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false,
          angleX: this.state.params.angleX || 0,
          angleY: this.state.params.angleY || 0,
          angleZ: this.state.params.angleZ || 0
        } as Element;
      }
      
      case 'torus': {
        const [center, radiusPoint] = this.state.points;
        const radius = center.distanceTo(radiusPoint);
        const tubeRadius = this.state.params.tubeRadius || radius / 4;
        
        return {
          ...baseElement,
          type: 'torus',
          x: center.x - this.originOffset.x,
          y: center.y - this.originOffset.y,
          z: center.z - this.originOffset.z,
          radius,
          tubeRadius,
          color: this.activeLayer.color,
          wireframe: this.state.params.wireframe || false,
          angleX: this.state.params.angleX || 0,
          angleY: this.state.params.angleY || 0,
          angleZ: this.state.params.angleZ || 0
        } as Element;
      }
      
      default:
        throw new Error(`Tool type ${this.definition.id} not implemented`);
    }
  }
  
  // Create a line element (helper for fallback cases)
  private createLineElement(start: THREE.Vector3, end: THREE.Vector3): Partial<Element> {
    return {
      type: 'line',
      layerId: this.activeLayer!.id,
      x1: start.x - this.originOffset.x,
      y1: start.y - this.originOffset.y,
      z1: start.z - this.originOffset.z,
      x2: end.x - this.originOffset.x,
      y2: end.y - this.originOffset.y,
      z2: end.z - this.originOffset.z,
      color: this.activeLayer!.color,
      linewidth: 1
    };
  }
  
  // Create preview object
  private createPreviewObject(): void {
    if (!this.scene) return;
    
    // Remove existing preview
    this.removePreviewObject();
    
    switch (this.definition.id) {
      case 'line':
        this.createLinePreview();
        break;
      
      case 'rectangle':
        this.createRectanglePreview();
        break;
      
      case 'circle':
        this.createCirclePreview();
        break;
      
      case 'arc':
        this.createArcPreview();
        break;
      
      case 'polygon':
        this.createPolygonPreview();
        break;
      
      case 'cube':
        this.createCubePreview();
        break;
      
      case 'sphere':
        this.createSpherePreview();
        break;
      
      case 'cylinder':
        this.createCylinderPreview();
        break;
      
      case 'cone':
        this.createConePreview();
        break;
      
      case 'torus':
        this.createTorusPreview();
        break;
    }
  }
  
  // Update preview object
  private updatePreviewObject(): void {
    if (!this.previewObject || !this.scene) return;
    
    // Re-create preview object with updated points
    this.removePreviewObject();
    this.createPreviewObject();
  }
  
  // Remove preview object
  private removePreviewObject(): void {
    if (!this.previewObject || !this.scene) return;
    
    this.scene.remove(this.previewObject);
    this.previewObject = null;
  }
  
  // Create line preview
  private createLinePreview(): void {
    if (!this.scene) return;
    
    // Create points for the line
    let points: THREE.Vector3[] = [];
    if (this.state.points.length > 0) {
      // We have the start point
      if (this.state.tempPoints.length > 0) {
        // We have a temp end point (from mouse)
        points = [this.state.points[0], this.state.tempPoints[0]];
      } else {
        // Just show the start point
        points = [this.state.points[0], this.state.points[0]];
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      points = [this.state.tempPoints[0], this.state.tempPoints[0]];
    }
    
    if (points.length < 2) return;
    
    // Create line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Create line material
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
      linewidth: 2
    });
    
    // Create line
    const line = new THREE.Line(geometry, material);
    line.userData.isPreview = true;
    
    this.previewObject = line;
    this.scene.add(this.previewObject);
  }
  
  // Create rectangle preview
  private createRectanglePreview(): void {
    if (!this.scene) return;
    
    // Create points for the rectangle
    let start: THREE.Vector3;
    let end: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the start point
      start = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the end point
        end = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp end point (from mouse)
        end = this.state.tempPoints[0];
      } else {
        // Just show the start point
        end = this.state.points[0];
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      start = this.state.tempPoints[0];
      end = this.state.tempPoints[0];
    } else {
      // No points yet
      return;
    }
    
    // Create rectangle vertices
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const z = start.z;
    
    const vertices = [
      new THREE.Vector3(minX, minY, z),
      new THREE.Vector3(maxX, minY, z),
      new THREE.Vector3(maxX, maxY, z),
      new THREE.Vector3(minX, maxY, z),
      new THREE.Vector3(minX, minY, z) // Close the loop
    ];
    
    // Create geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    
    // Create material
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
      linewidth: 2
    });
    
    // Create line
    const rectangle = new THREE.Line(geometry, material);
    rectangle.userData.isPreview = true;
    
    // Add fill
    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setFromPoints([
      vertices[0], vertices[1], vertices[2],
      vertices[0], vertices[2], vertices[3]
    ]);
    
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });
    
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(rectangle);
    group.add(fill);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create circle preview
  private createCirclePreview(): void {
    if (!this.scene) return;
    
    // For center-radius mode
    if (this.state.params.mode === 'center-radius' || !this.state.params.mode) {
      let center: THREE.Vector3;
      let radiusPoint: THREE.Vector3;
      
      if (this.state.points.length > 0) {
        // We have the center point
        center = this.state.points[0];
        if (this.state.points.length > 1) {
          // We have the radius point
          radiusPoint = this.state.points[1];
        } else if (this.state.tempPoints.length > 0) {
          // We have a temp radius point (from mouse)
          radiusPoint = this.state.tempPoints[0];
        } else {
          // Just show the center point
          radiusPoint = this.state.points[0];
        }
      } else if (this.state.tempPoints.length > 0) {
        // Only have temp point
        center = this.state.tempPoints[0];
        radiusPoint = this.state.tempPoints[0];
      } else {
        // No points yet
        return;
      }
      
      // Calculate radius
      const radius = center.distanceTo(radiusPoint);
      if (radius <= 0) return;
      
      // Create circle
      const geometry = new THREE.BufferGeometry();
      const segments = 64;
      const vertices: THREE.Vector3[] = [];
      
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = center.x + radius * Math.cos(theta);
        const y = center.y + radius * Math.sin(theta);
        vertices.push(new THREE.Vector3(x, y, center.z));
      }
      
      geometry.setFromPoints(vertices);
      
      // Create material
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
        linewidth: 2
      });
      
      // Create line
      const circle = new THREE.Line(geometry, material);
      circle.userData.isPreview = true;
      
      // Add fill
      const fillGeometry = new THREE.CircleGeometry(radius, segments);
      fillGeometry.translate(center.x, center.y, center.z);
      
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      
      const fill = new THREE.Mesh(fillGeometry, fillMaterial);
      fill.userData.isPreview = true;
      
      // Create group
      const group = new THREE.Group();
      group.add(circle);
      group.add(fill);
      group.userData.isPreview = true;
      
      this.previewObject = group;
      this.scene.add(this.previewObject);
    } else {
      // For 3-point mode
      if (this.state.points.length + this.state.tempPoints.length < 3) {
        // Not enough points
        return;
      }
      
      const points: THREE.Vector3[] = [...this.state.points];
      if (this.state.tempPoints.length > 0) {
        points.push(this.state.tempPoints[0]);
      }
      
      if (points.length < 3) return;
      
      // Calculate circle from 3 points
      const p1 = points[0];
      const p2 = points[1];
      const p3 = points[2];
      
      const temp1 = new THREE.Vector2((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const temp2 = new THREE.Vector2(-1 * (p2.y - p1.y), p2.x - p1.x);
      
      const temp3 = new THREE.Vector2((p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
      const temp4 = new THREE.Vector2(-1 * (p3.y - p2.y), p3.x - p2.x);
      
      // Find intersection of perpendicular bisectors
      const a = temp2.y;
      const b = -temp4.y;
      const c = temp4.x;
      const d = -temp2.x;
      const e = temp2.y * temp1.x - temp2.x * temp1.y;
      const f = temp4.y * temp3.x - temp4.x * temp3.y;
      
      const det = a * d - b * c;
      if (Math.abs(det) < 0.001) {
        // Points are collinear, just draw a line
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2, p3]);
        const material = new THREE.LineBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.7,
          linewidth: 2
        });
        
        const line = new THREE.Line(geometry, material);
        line.userData.isPreview = true;
        
        this.previewObject = line;
        this.scene.add(this.previewObject);
        return;
      }
      
      const center = new THREE.Vector2(
        (d * e - b * f) / det,
        (a * f - c * e) / det
      );
      
      const radius = center.distanceTo(new THREE.Vector2(p1.x, p1.y));
      
      // Create circle
      const geometry = new THREE.BufferGeometry();
      const segments = 64;
      const vertices: THREE.Vector3[] = [];
      
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = center.x + radius * Math.cos(theta);
        const y = center.y + radius * Math.sin(theta);
        vertices.push(new THREE.Vector3(x, y, p1.z));
      }
      
      geometry.setFromPoints(vertices);
      
      // Create material
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
        linewidth: 2
      });
      
      // Create line
      const circle = new THREE.Line(geometry, material);
      circle.userData.isPreview = true;
      
      // Add fill
      const fillGeometry = new THREE.CircleGeometry(radius, segments);
      fillGeometry.translate(center.x, center.y, p1.z);
      
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      
      const fill = new THREE.Mesh(fillGeometry, fillMaterial);
      fill.userData.isPreview = true;
      
      // Show the three points
      const pointsGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const pointsMaterial = new THREE.PointsMaterial({
        color: 0xff0000,
        size: 5,
        sizeAttenuation: false
      });
      
      const pointsObj = new THREE.Points(pointsGeometry, pointsMaterial);
      pointsObj.userData.isPreview = true;
      
      // Create group
      const group = new THREE.Group();
      group.add(circle);
      group.add(fill);
      group.add(pointsObj);
      group.userData.isPreview = true;
      
      this.previewObject = group;
      this.scene.add(this.previewObject);
    }
  }
  
  // Create arc preview
  private createArcPreview(): void {
    if (!this.scene) return;
    
    const points: THREE.Vector3[] = [...this.state.points];
    if (this.state.tempPoints.length > 0) {
      points.push(this.state.tempPoints[0]);
    }
    
    if (points.length < 2) return;
    
    if (points.length === 2) {
      // Just show the center and a line to the first point
      const [center, startPoint] = points;
      
      const geometry = new THREE.BufferGeometry().setFromPoints([center, startPoint]);
      
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
        linewidth: 2
      });
      
      const line = new THREE.Line(geometry, material);
      line.userData.isPreview = true;
      
      this.previewObject = line;
      this.scene.add(this.previewObject);
      return;
    }
    
    const [center, startPoint, endPoint] = points;
    
    // Calculate radius
    const radius = center.distanceTo(startPoint);
    
    // Calculate angles
    const startVector = new THREE.Vector2(
      startPoint.x - center.x,
      startPoint.y - center.y
    );
    
    const endVector = new THREE.Vector2(
      endPoint.x - center.x,
      endPoint.y - center.y
    );
    
    const startAngle = Math.atan2(startVector.y, startVector.x);
    const endAngle = Math.atan2(endVector.y, endVector.x);
    
    // Handle wraparound for angle calculation
    let angleDiff = endAngle - startAngle;
    if (angleDiff < 0) angleDiff += Math.PI * 2;
    
    // Create arc
    const geometry = new THREE.BufferGeometry();
    const segments = 64;
    const vertices: THREE.Vector3[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + t * angleDiff;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      vertices.push(new THREE.Vector3(x, y, center.z));
    }
    
    geometry.setFromPoints(vertices);
    
    // Create material
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
      linewidth: 2
    });
    
    // Create line
    const arc = new THREE.Line(geometry, material);
    arc.userData.isPreview = true;
    
    // Show the center and radius lines
    const radiiGeometry = new THREE.BufferGeometry().setFromPoints([center, startPoint, center, endPoint]);
    const radiiMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    const radii = new THREE.LineSegments(radiiGeometry, radiiMaterial);
    radii.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(arc);
    group.add(radii);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create polygon preview
  private createPolygonPreview(): void {
    if (!this.scene) return;
    
    // If we're creating a regular polygon
    if (this.state.params.sides && this.state.params.sides > 2) {
      let center: THREE.Vector3;
      let radiusPoint: THREE.Vector3;
      
      if (this.state.points.length > 0) {
        // We have the center point
        center = this.state.points[0];
        if (this.state.points.length > 1) {
          // We have the radius point
          radiusPoint = this.state.points[1];
        } else if (this.state.tempPoints.length > 0) {
          // We have a temp radius point (from mouse)
          radiusPoint = this.state.tempPoints[0];
        } else {
          // Just show the center point
          radiusPoint = this.state.points[0];
        }
      } else if (this.state.tempPoints.length > 0) {
        // Only have temp point
        center = this.state.tempPoints[0];
        radiusPoint = this.state.tempPoints[0];
      } else {
        // No points yet
        return;
      }
      
      // Calculate radius
      const radius = center.distanceTo(radiusPoint);
      if (radius <= 0) return;
      
      // Calculate initial angle (from center to radiusPoint)
      const initialAngle = Math.atan2(
        radiusPoint.y - center.y,
        radiusPoint.x - center.x
      );
      
      // Create polygon
      const sides = this.state.params.sides;
      const vertices: THREE.Vector3[] = [];
      
      for (let i = 0; i <= sides; i++) {
        const angle = initialAngle + (i / sides) * Math.PI * 2;
        const x = center.x + radius * Math.cos(angle);
        const y = center.y + radius * Math.sin(angle);
        vertices.push(new THREE.Vector3(x, y, center.z));
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
      
      // Create material
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
        linewidth: 2
      });
      
      // Create line
      const polygon = new THREE.Line(geometry, material);
      polygon.userData.isPreview = true;
      
      // Show radius
      const radiusGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
      const radiusMaterial = new THREE.LineBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.5,
        linewidth: 1
      });
      
      const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
      radiusLine.userData.isPreview = true;
      
      // Create group
      const group = new THREE.Group();
      group.add(polygon);
      group.add(radiusLine);
      group.userData.isPreview = true;
      
      this.previewObject = group;
      this.scene.add(this.previewObject);
      
    } else {
      // Free-form polygon
      const allPoints = [...this.state.points];
      if (this.state.tempPoints.length > 0) {
        allPoints.push(this.state.tempPoints[0]);
      }
      
      if (allPoints.length < 2) return;
      
      // Create geometry
      const geometry = new THREE.BufferGeometry().setFromPoints(allPoints);
      
      // Create material
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
        linewidth: 2
      });
      
      // Create line
      const polygon = new THREE.Line(geometry, material);
      polygon.userData.isPreview = true;
      
      // If we want a closed polygon, add a line from last to first point
      if (this.state.params.closePath && allPoints.length > 2) {
        const closeGeometry = new THREE.BufferGeometry().setFromPoints([
          allPoints[allPoints.length - 1],
          allPoints[0]
        ]);
        
        const closeMaterial = new THREE.LineDashedMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.4,
          linewidth: 1,
          dashSize: 3,
          gapSize: 1
        });
        
        const closeLine = new THREE.Line(closeGeometry, closeMaterial);
        closeLine.computeLineDistances(); // Required for dashed lines
        closeLine.userData.isPreview = true;
        
        // Create group
        const group = new THREE.Group();
        group.add(polygon);
        group.add(closeLine);
        group.userData.isPreview = true;
        
        this.previewObject = group;
      } else {
        this.previewObject = polygon;
      }
      
      this.scene.add(this.previewObject);
    }
  }
  
  // Create cube preview
  private createCubePreview(): void {
    if (!this.scene) return;
    
    // Create points for the cube
    let start: THREE.Vector3;
    let end: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the start point
      start = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the end point
        end = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp end point (from mouse)
        end = this.state.tempPoints[0];
      } else {
        // Just show the start point
        end = this.state.points[0];
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      start = this.state.tempPoints[0];
      end = this.state.tempPoints[0];
    } else {
      // No points yet
      return;
    }
    
    // Calculate dimensions
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const depth = this.state.params.depth || Math.min(width, height);
    
    // Calculate center
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const centerZ = start.z + depth / 2;
    
    // Create cube
    const geometry = new THREE.BoxGeometry(width, height, depth);
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    // Create mesh
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(centerX, centerY, centerZ);
    
    // Apply rotation if specified
    if (this.state.params.angleX) {
      cube.rotation.x = this.state.params.angleX * Math.PI / 180;
    }
    
    if (this.state.params.angleY) {
      cube.rotation.y = this.state.params.angleY * Math.PI / 180;
    }
    
    if (this.state.params.angleZ) {
      cube.rotation.z = this.state.params.angleZ * Math.PI / 180;
    }
    
    cube.userData.isPreview = true;
    
    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: false,
      linewidth: 1
    });
    
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(cube.position);
    edges.rotation.copy(cube.rotation);
    edges.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(cube);
    group.add(edges);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create sphere preview
  private createSpherePreview(): void {
    if (!this.scene) return;
    
    // Create points for the sphere
    let center: THREE.Vector3;
    let radiusPoint: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the center point
      center = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the radius point
        radiusPoint = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp radius point (from mouse)
        radiusPoint = this.state.tempPoints[0];
      } else {
        // Just show the center point
        radiusPoint = center.clone();
        radiusPoint.x += 1; // Arbitrary small radius
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      center = this.state.tempPoints[0];
      radiusPoint = center.clone();
      radiusPoint.x += 1; // Arbitrary small radius
    } else {
      // No points yet
      return;
    }
    
    // Calculate radius
    const radius = center.distanceTo(radiusPoint);
    if (radius <= 0) return;
    
    // Create sphere
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    // Create mesh
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(center);
    sphere.userData.isPreview = true;
    
    // Create wireframe
    const wireframeGeometry = new THREE.WireframeGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: false,
      linewidth: 1
    });
    
    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    wireframe.position.copy(center);
    wireframe.userData.isPreview = true;
    
    // Create radius line
    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
    const radiusMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
    radiusLine.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(sphere);
    group.add(wireframe);
    group.add(radiusLine);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create cylinder preview
  private createCylinderPreview(): void {
    if (!this.scene) return;
    
    // Create points for the cylinder
    let center: THREE.Vector3;
    let radiusPoint: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the center point
      center = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the radius point
        radiusPoint = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp radius point (from mouse)
        radiusPoint = this.state.tempPoints[0];
      } else {
        // Just show the center point
        radiusPoint = center.clone();
        radiusPoint.x += 1; // Arbitrary small radius
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      center = this.state.tempPoints[0];
      radiusPoint = center.clone();
      radiusPoint.x += 1; // Arbitrary small radius
    } else {
      // No points yet
      return;
    }
    
    // Calculate radius
    const radius = center.distanceTo(radiusPoint);
    if (radius <= 0) return;
    
    // Calculate height
    const height = this.state.params.height || radius * 2;
    
    // Create cylinder
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    // Create mesh
    const cylinder = new THREE.Mesh(geometry, material);
    
    // Position the cylinder
    cylinder.position.copy(center);
    
    // Rotate the cylinder so height is in Z direction
    cylinder.rotation.x = Math.PI / 2;
    
    // Apply additional rotation if specified
    if (this.state.params.angleX) {
      cylinder.rotation.x += this.state.params.angleX * Math.PI / 180;
    }
    
    if (this.state.params.angleY) {
      cylinder.rotation.y = this.state.params.angleY * Math.PI / 180;
    }
    
    if (this.state.params.angleZ) {
      cylinder.rotation.z = this.state.params.angleZ * Math.PI / 180;
    }
    
    cylinder.userData.isPreview = true;
    
    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: false,
      linewidth: 1
    });
    
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(cylinder.position);
    edges.rotation.copy(cylinder.rotation);
    edges.userData.isPreview = true;
    
    // Create radius line
    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
    const radiusMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
    radiusLine.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(cylinder);
    group.add(edges);
    group.add(radiusLine);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create cone preview
  private createConePreview(): void {
    if (!this.scene) return;
    
    // Create points for the cone
    let center: THREE.Vector3;
    let radiusPoint: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the center point
      center = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the radius point
        radiusPoint = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp radius point (from mouse)
        radiusPoint = this.state.tempPoints[0];
      } else {
        // Just show the center point
        radiusPoint = center.clone();
        radiusPoint.x += 1; // Arbitrary small radius
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      center = this.state.tempPoints[0];
      radiusPoint = center.clone();
      radiusPoint.x += 1; // Arbitrary small radius
    } else {
      // No points yet
      return;
    }
    
    // Calculate radius
    const radius = center.distanceTo(radiusPoint);
    if (radius <= 0) return;
    
    // Calculate height
    const height = this.state.params.height || radius * 2;
    
    // Create cone
    const geometry = new THREE.ConeGeometry(radius, height, 16);
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    // Create mesh
    const cone = new THREE.Mesh(geometry, material);
    
    // Position the cone
    cone.position.copy(center);
    
    // Rotate the cone so height is in Z direction
    cone.rotation.x = Math.PI / 2;
    
    // Apply additional rotation if specified
    if (this.state.params.angleX) {
      cone.rotation.x += this.state.params.angleX * Math.PI / 180;
    }
    
    if (this.state.params.angleY) {
      cone.rotation.y = this.state.params.angleY * Math.PI / 180;
    }
    
    if (this.state.params.angleZ) {
      cone.rotation.z = this.state.params.angleZ * Math.PI / 180;
    }
    
    cone.userData.isPreview = true;
    
    // Create edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: false,
      linewidth: 1
    });
    
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.copy(cone.position);
    edges.rotation.copy(cone.rotation);
    edges.userData.isPreview = true;
    
    // Create radius line
    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
    const radiusMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
    radiusLine.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(cone);
    group.add(edges);
    group.add(radiusLine);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Create torus preview
  private createTorusPreview(): void {
    if (!this.scene) return;
    
    // Create points for the torus
    let center: THREE.Vector3;
    let radiusPoint: THREE.Vector3;
    
    if (this.state.points.length > 0) {
      // We have the center point
      center = this.state.points[0];
      if (this.state.points.length > 1) {
        // We have the radius point
        radiusPoint = this.state.points[1];
      } else if (this.state.tempPoints.length > 0) {
        // We have a temp radius point (from mouse)
        radiusPoint = this.state.tempPoints[0];
      } else {
        // Just show the center point
        radiusPoint = center.clone();
        radiusPoint.x += 1; // Arbitrary small radius
      }
    } else if (this.state.tempPoints.length > 0) {
      // Only have temp point
      center = this.state.tempPoints[0];
      radiusPoint = center.clone();
      radiusPoint.x += 1; // Arbitrary small radius
    } else {
      // No points yet
      return;
    }
    
    // Calculate radius
    const radius = center.distanceTo(radiusPoint);
    if (radius <= 0) return;
    
    // Calculate tube radius
    const tubeRadius = this.state.params.tubeRadius || radius / 4;
    
    // Create torus
    const geometry = new THREE.TorusGeometry(radius, tubeRadius, 8, 24);
    
    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    // Create mesh
    const torus = new THREE.Mesh(geometry, material);
    torus.position.copy(center);
    
    // Apply rotation if specified
    if (this.state.params.angleX) {
      torus.rotation.x = this.state.params.angleX * Math.PI / 180;
    }
    
    if (this.state.params.angleY) {
      torus.rotation.y = this.state.params.angleY * Math.PI / 180;
    }
    
    if (this.state.params.angleZ) {
      torus.rotation.z = this.state.params.angleZ * Math.PI / 180;
    }
    
    torus.userData.isPreview = true;
    
    // Create wireframe
    const wireframeGeometry = new THREE.WireframeGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: false,
      linewidth: 1
    });
    
    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    wireframe.position.copy(center);
    wireframe.rotation.copy(torus.rotation);
    wireframe.userData.isPreview = true;
    
    // Create radius line
    const radiusGeometry = new THREE.BufferGeometry().setFromPoints([center, radiusPoint]);
    const radiusMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
      linewidth: 1
    });
    
    const radiusLine = new THREE.Line(radiusGeometry, radiusMaterial);
    radiusLine.userData.isPreview = true;
    
    // Create group
    const group = new THREE.Group();
    group.add(torus);
    group.add(wireframe);
    group.add(radiusLine);
    group.userData.isPreview = true;
    
    this.previewObject = group;
    this.scene.add(this.previewObject);
  }
  
  // Get the tool definition
  public getDefinition(): CADToolDefinition {
    return this.definition;
  }
  
  // Get the tool state
  public getState(): CADToolState {
    return this.state;
  }
  
  // Reset the tool state
  public reset(): void {
    this.state.points = [];
    this.state.tempPoints = [];
    this.state.params = {};
    
    // Remove preview object
    this.removePreviewObject();
    
    // Create new preview object
    this.createPreviewObject();
  }
}

// CAD Tools registry
export class CADToolsRegistry {
  private tools: Map<ToolType, CADTool> = new Map();
  private definitions: Map<ToolType, CADToolDefinition> = new Map();
  
  // Register a tool
  public registerTool(definition: CADToolDefinition): void {
    this.definitions.set(definition.id, definition);
    this.tools.set(definition.id, new CADTool(definition));
  }
  
  // Get a tool by ID
  public getTool(id: ToolType): CADTool | undefined {
    return this.tools.get(id);
  }
  
  // Get all tool definitions
  public getAllDefinitions(): CADToolDefinition[] {
    return Array.from(this.definitions.values());
  }
  
  // Get tool definitions by category
  public getDefinitionsByCategory(category: ToolCategory): CADToolDefinition[] {
    return Array.from(this.definitions.values())
      .filter(def => def.category === category);
  }
  
  // Get a tool definition by ID
  public getDefinition(id: ToolType): CADToolDefinition | undefined {
    return this.definitions.get(id);
  }
}