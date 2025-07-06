/**
 * Assembly Factory - Elementi di assemblaggio e componenti
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import type { CADElement } from '../utils/geometryUtils';

export interface AssemblyElement extends CADElement {
  componentId?: string;
  children?: string[];
  elements?: CADElement[];
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  visible?: boolean;
  locked?: boolean;
  instanceCount?: number;
  spacing?: { x: number; y: number; z: number };
}

export class AssemblyFactory {
  /**
   * Crea un componente - IDENTICO all'originale
   */
  static createComponent(element: AssemblyElement, originOffset: THREE.Vector3): THREE.Object3D {
    // Create a group to represent the component
    const componentGroup = new THREE.Group();

    // Basic placeholder geometry for component
    // In a real implementation, this would load the actual component geometry
    const componentGeometry = new THREE.BoxGeometry(1, 1, 1);
    const componentMaterial = new THREE.MeshStandardMaterial({
      color: element.color || 0x4caf50,
      wireframe: element.wireframe || false,
      transparent: true,
      opacity: 0.8
    });

    const componentMesh = new THREE.Mesh(componentGeometry, componentMaterial);
    componentGroup.add(componentMesh);

    // Add a visual indicator that this is a component
    const outlineGeometry = new THREE.EdgesGeometry(componentGeometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0x2196f3,
      linewidth: 2
    });
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    componentGroup.add(outline);

    // Position the component
    componentGroup.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Apply transforms if specified
    if (element.rotation) {
      componentGroup.rotation.set(
        element.rotation.x || 0,
        element.rotation.y || 0,
        element.rotation.z || 0
      );
    }

    if (element.scale) {
      componentGroup.scale.set(
        element.scale.x || 1,
        element.scale.y || 1,
        element.scale.z || 1
      );
    }

    // Visibility and interaction
    componentGroup.visible = element.visible !== false;

    // Metadata per compatibilità
    componentGroup.userData.isCADElement = true;
    componentGroup.userData.elementId = element.id;
    componentGroup.userData.elementType = 'component';
    componentGroup.userData.componentId = element.componentId;
    componentGroup.userData.locked = element.locked || false;

    return componentGroup;
  }

  /**
   * Crea un gruppo - IDENTICO all'originale
   */
  static createGroup(element: AssemblyElement, originOffset: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();

    // Position the group
    group.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Apply transforms if specified
    if (element.rotation) {
      group.rotation.set(
        element.rotation.x || 0,
        element.rotation.y || 0,
        element.rotation.z || 0
      );
    }

    if (element.scale) {
      group.scale.set(
        element.scale.x || 1,
        element.scale.y || 1,
        element.scale.z || 1
      );
    }

    // Visibility
    group.visible = element.visible !== false;

    // If group has child elements, they would be added here
    // This would require a recursive factory system
    if (element.elements && element.elements.length > 0) {
      console.log(`Group ${element.id} contains ${element.elements.length} child elements`);
      // Child elements would be processed by the main factory registry
    }

    // Visual indicator for groups (optional bounding box)
    if (element.children && element.children.length > 0) {
      const boundingBoxHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('0xffff00'));
      boundingBoxHelper.visible = false; // Hidden by default
      group.add(boundingBoxHelper);
      group.userData.boundingBoxHelper = boundingBoxHelper;
    }

    // Metadata per compatibilità
    group.userData.isCADElement = true;
    group.userData.elementId = element.id;
    group.userData.elementType = 'group';
    group.userData.children = element.children || [];
    group.userData.locked = element.locked || false;

    return group;
  }

  /**
   * Crea un assemblaggio - IDENTICO all'originale
   */
  static createAssembly(element: AssemblyElement, originOffset: THREE.Vector3): THREE.Group {
    const assembly = new THREE.Group();

    // Position the assembly
    assembly.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Apply transforms if specified
    if (element.rotation) {
      assembly.rotation.set(
        element.rotation.x || 0,
        element.rotation.y || 0,
        element.rotation.z || 0
      );
    }

    if (element.scale) {
      assembly.scale.set(
        element.scale.x || 1,
        element.scale.y || 1,
        element.scale.z || 1
      );
    }

    // Visibility
    assembly.visible = element.visible !== false;

    // Create visual representation of assembly
    // This could be a complex structure with multiple components
    const assemblyIndicator = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshStandardMaterial({
        color: element.color || 0xff5722,
        wireframe: true,
        transparent: true,
        opacity: 0.6
      })
    );
    assembly.add(assemblyIndicator);

    // Add assembly constraints visualization (if any)
    if (element.children && element.children.length > 1) {
      // Create connection lines between assembly components
      for (let i = 0; i < element.children.length - 1; i++) {
        const connectionGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(i - element.children.length/2, 0, 0),
          new THREE.Vector3(i + 1 - element.children.length/2, 0, 0)
        ]);
        const connectionMaterial = new THREE.LineBasicMaterial({
          color: 0x607d8b,
          transparent: true,
          opacity: 0.5
        });
        const connection = new THREE.Line(connectionGeometry, connectionMaterial);
        assembly.add(connection);
      }
    }

    // Instance support for assemblies
    if (element.instanceCount && element.instanceCount > 1 && element.spacing) {
      const instancedGroup = new THREE.Group();
      
      for (let i = 0; i < element.instanceCount; i++) {
        const instance = assembly.clone();
        instance.position.set(
          i * (element.spacing.x || 2),
          i * (element.spacing.y || 0),
          i * (element.spacing.z || 0)
        );
        instancedGroup.add(instance);
      }

      // Metadata per compatibilità
      instancedGroup.userData.isCADElement = true;
      instancedGroup.userData.elementId = element.id;
      instancedGroup.userData.elementType = 'assembly';
      instancedGroup.userData.isInstanced = true;
      instancedGroup.userData.instanceCount = element.instanceCount;
      instancedGroup.userData.children = element.children || [];
      instancedGroup.userData.locked = element.locked || false;

      return instancedGroup;
    }

    // Metadata per compatibilità
    assembly.userData.isCADElement = true;
    assembly.userData.elementId = element.id;
    assembly.userData.elementType = 'assembly';
    assembly.userData.children = element.children || [];
    assembly.userData.locked = element.locked || false;

    return assembly;
  }

  /**
   * Factory method principale - router per tutti i tipi di assemblaggio
   */
  static create(element: AssemblyElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'component':
          return this.createComponent(element, originOffset);
        case 'group':
          return this.createGroup(element, originOffset);
        case 'assembly':
          return this.createAssembly(element, originOffset);
        default:
          console.warn(`AssemblyFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione dell'elemento di assemblaggio ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['component', 'group', 'assembly'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['component', 'group', 'assembly'];
  }
}
