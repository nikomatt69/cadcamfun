/**
 * Complex Shapes Factory - Forme geometriche complesse
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import { degreesToRadians } from '../utils';
import type { CADElement } from '../utils/geometryUtils';

export interface ComplexShapeElement extends CADElement {
  shape?: string;
  width?: number;
  height?: number;
  radius?: number;
  depth?: number;
  points?: Array<{ x: number; y: number; z?: number }>;
  path?: Array<{ x: number; y: number; z?: number }>;
  segments?: number;
  phiStart?: number;
  phiLength?: number;
  thetaStart?: number;
  thetaLength?: number;
  profile?: Array<{ x: number; y: number }>;
  axis?: { x: number; y: number; z: number };
  steps?: number;
  curveSegments?: number;
  bevelEnabled?: boolean;
  bevelThickness?: number;
  bevelSize?: number;
  bevelOffset?: number;
  bevelSegments?: number;
}

export class ComplexShapesFactory {
  /**
   * Crea un'estrusione - PARZIALMENTE IDENTICO all'originale
   */
  static createExtrusion(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Object3D {
    const extrudeGroup = new THREE.Group();
    
    const depth = element.depth || 1;
    let shape: THREE.Shape;

    // Create shape based on specified type
    if (element.shape === "rect" && element.width && element.height) {
      // Rectangular extrusion
      shape = new THREE.Shape();
      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;
      
      shape.moveTo(-halfWidth, -halfHeight);
      shape.lineTo(halfWidth, -halfHeight);
      shape.lineTo(halfWidth, halfHeight);
      shape.lineTo(-halfWidth, halfHeight);
      shape.lineTo(-halfWidth, -halfHeight);
    } else if (element.shape === "circle" && element.radius) {
      // Circular extrusion
      shape = new THREE.Shape();
      const radius = element.radius;
      const segments = element.segments || 32;
      
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        
        if (i === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      }
    } else if (element.points && element.points.length >= 3) {
      // Custom shape from points
      shape = new THREE.Shape();
      
      shape.moveTo(element.points[0].x, element.points[0].y);
      for (let i = 1; i < element.points.length; i++) {
        shape.lineTo(element.points[i].x, element.points[i].y);
      }
      shape.closePath();
    } else {
      // Default square shape
      shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(0.5, 0.5);
      shape.lineTo(-0.5, 0.5);
      shape.lineTo(-0.5, -0.5);
    }

    // Create extrude geometry
    const extrudeSettings = {
      depth: depth,
      bevelEnabled: element.bevelEnabled || false,
      bevelThickness: element.bevelThickness || 0.1,
      bevelSize: element.bevelSize || 0.1,
      bevelOffset: element.bevelOffset || 0,
      bevelSegments: element.bevelSegments || 1,
      curveSegments: element.curveSegments || 12,
      steps: element.steps || 1
    };

    const extrudeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const extrudeMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x666666,
      wireframe: element.wireframe || false
    });

    const extrudeMesh = new THREE.Mesh(extrudeGeometry, extrudeMaterial);
    extrudeGeometry.center();
    
    extrudeGroup.add(extrudeMesh);
    
    extrudeGroup.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    extrudeGroup.userData.isCADElement = true;
    extrudeGroup.userData.elementId = element.id;
    extrudeGroup.userData.elementType = 'extrusion';

    return extrudeGroup;
  }

  /**
   * Crea un tubo - PARZIALMENTE IDENTICO all'originale
   */
  static createTube(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Mesh {
    if (!element.path || element.path.length < 2) {
      throw new Error('Tube requires a path with at least 2 points');
    }

    // Create curve from path points
    const pathVectors = element.path.map(
      point => new THREE.Vector3(point.x, point.y, point.z || 0)
    );

    // Create a spline curve from the path
    const curve = new THREE.CatmullRomCurve3(pathVectors);
    
    const radius = element.radius || 0.5;
    const tubularSegments = element.segments || 64;
    const radialSegments = 8;

    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      radius,
      radialSegments,
      false
    );

    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x8bc34a,
      wireframe: element.wireframe || false
    });

    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    
    tube.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    tube.userData.isCADElement = true;
    tube.userData.elementId = element.id;
    tube.userData.elementType = 'tube';

    return tube;
  }

  /**
   * Crea un oggetto di rivoluzione (lathe) - PARZIALMENTE IDENTICO all'originale
   */
  static createLathe(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Mesh {
    if (!element.points || element.points.length < 2) {
      throw new Error('Lathe requires profile points');
    }

    // Convert profile points to Vector2
    const profilePoints = element.points.map(
      point => new THREE.Vector2(Math.abs(point.x), point.y)
    );

    const segments = element.segments || 32;
    const phiStart = element.phiStart || 0;
    const phiLength = element.phiLength || Math.PI * 2;

    const latheGeometry = new THREE.LatheGeometry(
      profilePoints,
      segments,
      phiStart,
      phiLength
    );

    const latheMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0xff9800,
      wireframe: element.wireframe || false
    });

    const lathe = new THREE.Mesh(latheGeometry, latheMaterial);
    
    lathe.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    lathe.userData.isCADElement = true;
    lathe.userData.elementId = element.id;
    lathe.userData.elementType = 'lathe';

    return lathe;
  }

  /**
   * Crea una rivoluzione - SIMILE all'originale
   */
  static createRevolution(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Similar to lathe but with different parameters
    if (!element.profile || element.profile.length < 2) {
      throw new Error('Revolution requires profile points');
    }

    const profilePoints = element.profile.map(
      point => new THREE.Vector2(point.x, point.y)
    );

    const segments = element.segments || 32;
    const angle = element.phiLength || Math.PI * 2;

    const revolutionGeometry = new THREE.LatheGeometry(
      profilePoints,
      segments,
      0,
      angle
    );

    const revolutionMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x795548,
      wireframe: element.wireframe || false
    });

    const revolution = new THREE.Mesh(revolutionGeometry, revolutionMaterial);
    
    revolution.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    revolution.userData.isCADElement = true;
    revolution.userData.elementId = element.id;
    revolution.userData.elementType = 'revolution';

    return revolution;
  }

  /**
   * Crea un loft - PLACEHOLDER (implementazione complessa)
   */
  static createLoft(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Loft is complex and would require custom geometry creation
    // For now, create a simple placeholder
    
    console.warn('Loft geometry not fully implemented - using placeholder');
    
    const loftGeometry = new THREE.BoxGeometry(
      element.width || 1,
      element.height || 1,
      element.depth || 1
    );

    const loftMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x607d8b,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: 0.7
    });

    const loft = new THREE.Mesh(loftGeometry, loftMaterial);
    
    loft.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    loft.userData.isCADElement = true;
    loft.userData.elementId = element.id;
    loft.userData.elementType = 'loft';
    loft.userData.isPlaceholder = true;

    return loft;
  }

  /**
   * Crea uno sweep - PLACEHOLDER (implementazione complessa)
   */
  static createSweep(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Sweep is complex and would require custom geometry creation
    // For now, create a simple placeholder
    
    console.warn('Sweep geometry not fully implemented - using placeholder');
    
    const sweepGeometry = new THREE.CylinderGeometry(
      element.radius || 0.5,
      element.radius || 0.5,
      element.depth || 2,
      element.segments || 16
    );

    const sweepMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x9e9e9e,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: 0.7
    });

    const sweep = new THREE.Mesh(sweepGeometry, sweepMaterial);
    
    sweep.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    sweep.userData.isCADElement = true;
    sweep.userData.elementId = element.id;
    sweep.userData.elementType = 'sweep';
    sweep.userData.isPlaceholder = true;

    return sweep;
  }

  /**
   * Factory method principale - router per tutti i tipi di forme complesse
   */
  static create(element: ComplexShapeElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'extrusion':
          return this.createExtrusion(element, originOffset);
        case 'tube':
          return this.createTube(element, originOffset);
        case 'lathe':
          return this.createLathe(element, originOffset);
        case 'revolution':
          return this.createRevolution(element, originOffset);
        case 'loft':
          return this.createLoft(element, originOffset);
        case 'sweep':
          return this.createSweep(element, originOffset);
        default:
          console.warn(`ComplexShapesFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione della forma complessa ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['extrusion', 'tube', 'lathe', 'revolution', 'loft', 'sweep'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['extrusion', 'tube', 'lathe', 'revolution', 'loft', 'sweep'];
  }
}
