/**
 * Advanced Primitives Factory - Elementi primitivi avanzati
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import { degreesToRadians } from '../utils';
import type { CADElement } from '../utils/geometryUtils';

export interface AdvancedPrimitiveElement extends CADElement {
  segments?: number;
  radius?: number;
  width?: number;
  height?: number;
  depth?: number;
  baseWidth?: number;
  baseDepth?: number;
  sides?: number;
  direction?: string;
  radiusX?: number;
  radiusY?: number;
  radiusZ?: number;
  capSegments?: number;
  radialSegments?: number;
}

export class AdvancedPrimitivesFactory {
  /**
   * Crea una piramide - IDENTICO all'originale
   */
  static createPyramid(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Create pyramid geometry using BufferGeometry - IDENTICO all'originale
    const pyramidGeometry = new THREE.BufferGeometry();

    // Define vertices for a square-based pyramid
    const baseWidth = element.baseWidth || 1;
    const baseDepth = element.baseDepth || 1;
    const pyramidHeight = element.height || 1;

    const vertices = new Float32Array([
      // Base
      -baseWidth / 2, -pyramidHeight / 2, -baseDepth / 2,
      baseWidth / 2, -pyramidHeight / 2, -baseDepth / 2,
      baseWidth / 2, -pyramidHeight / 2, baseDepth / 2,
      -baseWidth / 2, -pyramidHeight / 2, baseDepth / 2,
      // Apex
      0, pyramidHeight / 2, 0
    ]);

    // Define faces using indices
    const indices = [
      // Base
      0, 1, 2, 0, 2, 3,
      // Sides
      0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0
    ];

    pyramidGeometry.setIndex(indices);
    pyramidGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    pyramidGeometry.computeVertexNormals();

    const pyramidMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0xe91e63,
      wireframe: element.wireframe || false
    });

    const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
    pyramid.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    pyramid.userData.isCADElement = true;
    pyramid.userData.elementId = element.id;
    pyramid.userData.elementType = 'pyramid';

    return pyramid;
  }

  /**
   * Crea un prisma - IDENTICO all'originale
   */
  static createPrism(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Create prism geometry (like a cylinder with polygon base)
    const sides = element.sides || 6;
    const prismGeometry = new THREE.CylinderGeometry(element.radius, element.radius, element.height, sides);

    const prismMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x3f51b5,
      wireframe: element.wireframe || false
    });

    const prism = new THREE.Mesh(prismGeometry, prismMaterial);
    prism.position.set(
      element.x + originOffset.x, 
      element.y + originOffset.y, 
      (element.z || 0) + originOffset.z
    );

    // Rotation for standard orientation - IDENTICO all'originale
    prism.rotation.x = Math.PI / 2;

    // Metadata per compatibilità
    prism.userData.isCADElement = true;
    prism.userData.elementId = element.id;
    prism.userData.elementType = 'prism';

    return prism;
  }

  /**
   * Crea un emisfero - IDENTICO all'originale
   */
  static createHemisphere(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    const hemisphereGeometry = new THREE.SphereGeometry(
      element.radius,
      element.segments || 32,
      element.segments || 32,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    );

    const hemisphereMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x00bcd4,
      wireframe: element.wireframe || false
    });

    const hemisphere = new THREE.Mesh(hemisphereGeometry, hemisphereMaterial);
    hemisphere.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Rotate based on direction - IDENTICO all'originale
    if (element.direction === "down") {
      hemisphere.rotation.x = Math.PI;
    }

    // Metadata per compatibilità
    hemisphere.userData.isCADElement = true;
    hemisphere.userData.elementId = element.id;
    hemisphere.userData.elementType = 'hemisphere';

    return hemisphere;
  }

  /**
   * Crea un ellissoide - IDENTICO all'originale
   */
  static createEllipsoid(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Create sphere and scale it to make an ellipsoid
    const ellipsoidGeometry = new THREE.SphereGeometry(
      1, // We'll scale it
      element.segments || 32,
      element.segments || 32
    );

    const ellipsoidMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x8bc34a,
      wireframe: element.wireframe || false
    });

    const ellipsoid = new THREE.Mesh(ellipsoidGeometry, ellipsoidMaterial);
    ellipsoid.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Scale to create ellipsoid shape - IDENTICO all'originale
    ellipsoid.scale.set(
      element.radiusX || 1, 
      element.radiusY || 0.75, 
      element.radiusZ || 0.5
    );

    // Metadata per compatibilità
    ellipsoid.userData.isCADElement = true;
    ellipsoid.userData.elementId = element.id;
    ellipsoid.userData.elementType = 'ellipsoid';

    return ellipsoid;
  }

  /**
   * Crea una capsula - IDENTICO all'originale con fallback
   */
  static createCapsule(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Object3D {
    let capsuleGeometry;

    try {
      // Try to use CapsuleGeometry if available - IDENTICO all'originale
      capsuleGeometry = new THREE.CapsuleGeometry(
        element.radius || 0.5,
        element.height || 2,
        element.capSegments || 8,
        element.radialSegments || 16
      );

      // If CapsuleGeometry is available
      const capsuleMaterial = new THREE.MeshStandardMaterial({
        color: element.color || 0x673ab7,
        wireframe: element.wireframe || false
      });

      const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
      capsule.position.set(
        element.x + originOffset.x, 
        element.y + originOffset.y, 
        (element.z || 0) + originOffset.z
      );

      // Set rotation based on direction - IDENTICO all'originale
      if (element.direction === "x") {
        capsule.rotation.z = Math.PI / 2;
      } else if (element.direction === "z") {
        capsule.rotation.x = Math.PI / 2;
      }

      // Metadata per compatibilità
      capsule.userData.isCADElement = true;
      capsule.userData.elementId = element.id;
      capsule.userData.elementType = 'capsule';

      return capsule;
    } catch (e) {
      // Fallback: Create a group with cylinder and two hemispheres - IDENTICO all'originale
      const capsuleGroup = new THREE.Group();

      const radius = element.radius || 0.5;
      const height = element.height || 2;

      // Cylinder for body
      const bodyCylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 32),
        new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
      );
      capsuleGroup.add(bodyCylinder);

      // Top hemisphere
      const topHemisphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
      );
      topHemisphere.position.y = height / 2;
      topHemisphere.rotation.x = Math.PI;
      capsuleGroup.add(topHemisphere);

      // Bottom hemisphere
      const bottomHemisphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
      );
      bottomHemisphere.position.y = -height / 2;
      capsuleGroup.add(bottomHemisphere);

      capsuleGroup.position.set(
        element.x + originOffset.x,
        element.y + originOffset.y,
        (element.z || 0) + originOffset.z
      );

      // Set rotation based on direction - IDENTICO all'originale
      if (element.direction === "x") {
        capsuleGroup.rotation.z = Math.PI / 2;
      } else if (element.direction === "z") {
        capsuleGroup.rotation.x = Math.PI / 2;
      }

      // Metadata per compatibilità
      capsuleGroup.userData.isCADElement = true;
      capsuleGroup.userData.elementId = element.id;
      capsuleGroup.userData.elementType = 'capsule';

      return capsuleGroup;
    }
  }

  /**
   * Factory method principale - router per tutti i tipi avanzati
   */
  static create(element: AdvancedPrimitiveElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'pyramid':
          return this.createPyramid(element, originOffset);
        case 'prism':
          return this.createPrism(element, originOffset);
        case 'hemisphere':
          return this.createHemisphere(element, originOffset);
        case 'ellipsoid':
          return this.createEllipsoid(element, originOffset);
        case 'capsule':
          return this.createCapsule(element, originOffset);
        default:
          console.warn(`AdvancedPrimitivesFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione del primitivo avanzato ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['pyramid', 'prism', 'hemisphere', 'ellipsoid', 'capsule'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['pyramid', 'prism', 'hemisphere', 'ellipsoid', 'capsule'];
  }
}
