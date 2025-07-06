/**
 * Basic Primitives Factory - Elementi primitivi di base
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import { degreesToRadians } from '../utils';
import type { CADElement } from '../utils/geometryUtils';

export interface BasicPrimitiveElement extends CADElement {
  segments?: number;
  radius?: number;
  width?: number;
  height?: number;
  depth?: number;
  tubeRadius?: number;
  radialSegments?: number;
  tubularSegments?: number;
}

export class BasicPrimitivesFactory {
  /**
   * Crea un cubo - IDENTICO all'originale
   */
  static createCube(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const cubeGeometry = new THREE.BoxGeometry(element.width, element.height, element.depth);

    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x1e88e5,
      wireframe: element.wireframe || false
    });

    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    cube.userData.isCADElement = true;
    cube.userData.elementId = element.id;
    cube.userData.elementType = 'cube';

    return cube;
  }

  /**
   * Crea una sfera - IDENTICO all'originale
   */
  static createSphere(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const sphereGeometry = new THREE.SphereGeometry(
      element.radius, 
      element.segments || 32, 
      element.segments || 32
    );

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x1e88e5,
      wireframe: element.wireframe || false
    });

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    sphere.userData.isCADElement = true;
    sphere.userData.elementId = element.id;
    sphere.userData.elementType = 'sphere';

    return sphere;
  }

  /**
   * Crea un cilindro - IDENTICO all'originale
   */
  static createCylinder(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const cylinderGeometry = new THREE.CylinderGeometry(
      element.radius,
      element.radius,
      element.height,
      element.segments || 32
    );

    const cylinderMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0xffc107,
      wireframe: element.wireframe || false
    });

    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Rotation for standard orientation - IDENTICO all'originale
    cylinder.rotation.x = Math.PI / 2;
    
    // Metadata per compatibilità
    cylinder.userData.isCADElement = true;
    cylinder.userData.elementId = element.id;
    cylinder.userData.elementType = 'cylinder';

    return cylinder;
  }

  /**
   * Crea un cono - IDENTICO all'originale
   */
  static createCone(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const coneGeometry = new THREE.ConeGeometry(element.radius, element.height, element.segments || 32);

    const coneMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x9c27b0,
      wireframe: element.wireframe || false
    });

    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Rotation for standard orientation - IDENTICO all'originale
    cone.rotation.x = Math.PI / 2;

    // Metadata per compatibilità
    cone.userData.isCADElement = true;
    cone.userData.elementId = element.id;
    cone.userData.elementType = 'cone';

    return cone;
  }

  /**
   * Crea un torus - IDENTICO all'originale
   */
  static createTorus(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const torusGeometry = new THREE.TorusGeometry(
      element.radius,
      element.tubeRadius || element.radius! / 4,
      element.radialSegments || 16,
      element.tubularSegments || 100
    );

    const torusMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0xff9800,
      wireframe: element.wireframe || false
    });

    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    torus.userData.isCADElement = true;
    torus.userData.elementId = element.id;
    torus.userData.elementType = 'torus';

    return torus;
  }

  /**
   * Factory method principale - router per tutti i tipi basic
   */
  static create(element: BasicPrimitiveElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'cube':
          return this.createCube(element, originOffset);
        case 'sphere':
          return this.createSphere(element, originOffset);
        case 'cylinder':
          return this.createCylinder(element, originOffset);
        case 'cone':
          return this.createCone(element, originOffset);
        case 'torus':
          return this.createTorus(element, originOffset);
        default:
          console.warn(`BasicPrimitivesFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione del primitivo ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['cube', 'sphere', 'cylinder', 'cone', 'torus'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['cube', 'sphere', 'cylinder', 'cone', 'torus'];
  }
}
