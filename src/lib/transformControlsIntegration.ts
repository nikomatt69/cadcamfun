// src/lib/transformControlsIntegration.ts
import * as THREE from "three";
import { Element } from "../store/elementsStore";
import { transformControlsUtils } from "../store/transformControlsStore";

/**
 * Utility functions per l'integrazione dei Transform Controls nel CADCanvas
 */

export interface TransformIntegrationConfig {
  enableWasmOptimization: boolean;
  enableRealTimePreview: boolean;
  enableConstraintIntegration: boolean;
  enablePerformanceMonitoring: boolean;
  snapThreshold: number;
  transformPrecision: number;
}

export const defaultTransformConfig: TransformIntegrationConfig = {
  enableWasmOptimization: true,
  enableRealTimePreview: true,
  enableConstraintIntegration: true,
  enablePerformanceMonitoring: false,
  snapThreshold: 10,
  transformPrecision: 0.01
};

/**
 * Converte un elemento CAD in un oggetto Three.js transformabile
 */
export const createTransformableObject = (element: Element): THREE.Object3D | null => {
  let object: THREE.Object3D | null = null;

  switch (element.type) {
    case "rectangle":
      const rectGeometry = new THREE.PlaneGeometry(element.width || 10, element.height || 10);
      const rectMaterial = new THREE.MeshStandardMaterial({ 
        color: element.color || 0x00ff00,
        transparent: true,
        opacity: 0.8
      });
      object = new THREE.Mesh(rectGeometry, rectMaterial);
      break;

    case "circle":
      const circleGeometry = new THREE.CircleGeometry(element.radius || 5, 32);
      const circleMaterial = new THREE.MeshStandardMaterial({ 
        color: element.color || 0x00ff00,
        transparent: true,
        opacity: 0.8
      });
      object = new THREE.Mesh(circleGeometry, circleMaterial);
      break;

    case "cube":
      const cubeGeometry = new THREE.BoxGeometry(
        element.width || 10, 
        element.height || 10, 
        element.depth || 10
      );
      const cubeMaterial = new THREE.MeshStandardMaterial({ 
        color: element.color || 0x00ff00,
        transparent: true,
        opacity: 0.8
      });
      object = new THREE.Mesh(cubeGeometry, cubeMaterial);
      break;

    case "sphere":
      const sphereGeometry = new THREE.SphereGeometry(element.radius || 5, 32, 16);
      const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color: element.color || 0x00ff00,
        transparent: true,
        opacity: 0.8
      });
      object = new THREE.Mesh(sphereGeometry, sphereMaterial);
      break;

    case "line":
      const lineGeometry = new THREE.BufferGeometry();
      const points = [
        new THREE.Vector3(element.x1 || 0, element.y1 || 0, element.z1 || 0),
        new THREE.Vector3(element.x2 || 0, element.y2 || 0, element.z2 || 0)
      ];
      lineGeometry.setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({ color: element.color || 0x00ff00 });
      object = new THREE.Line(lineGeometry, lineMaterial);
      break;

    default:
      // Fallback per tipi non riconosciuti
      const defaultGeometry = new THREE.BoxGeometry(1, 1, 1);
      const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      object = new THREE.Mesh(defaultGeometry, defaultMaterial);
  }

  if (object) {
    // Imposta posizione e metadata
    object.position.set(element.x || 0, element.y || 0, element.z || 0);
    object.userData.elementId = element.id;
    object.userData.elementType = element.type;
    object.userData.isCADElement = true;
    object.userData.isTransformable = true;

    // Applica rotazioni se presenti
    if (element.angleX) object.rotation.x = (element.angleX * Math.PI) / 180;
    if (element.angleY) object.rotation.y = (element.angleY * Math.PI) / 180;
    if (element.angleZ) object.rotation.z = (element.angleZ * Math.PI) / 180;
  }

  return object;
};

/**
 * Aggiorna un oggetto Three.js basato sui cambiamenti dell'elemento CAD
 */
export const updateTransformableObject = (object: THREE.Object3D, element: Element): void => {
  if (!object || !object.userData.elementId || object.userData.elementId !== element.id) {
    return;
  }

  // Aggiorna posizione
  object.position.set(element.x || 0, element.y || 0, element.z || 0);

  // Aggiorna rotazioni
  object.rotation.set(
    element.angleX ? (element.angleX * Math.PI) / 180 : 0,
    element.angleY ? (element.angleY * Math.PI) / 180 : 0,
    element.angleZ ? (element.angleZ * Math.PI) / 180 : 0
  );

  // Aggiorna geometria per tipi che supportano il ridimensionamento
  if (object instanceof THREE.Mesh) {
    const mesh = object as THREE.Mesh;
    
    switch (element.type) {
      case "rectangle":
        if (mesh.geometry instanceof THREE.PlaneGeometry) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(element.width || 10, element.height || 10);
        }
        break;

      case "circle":
        if (mesh.geometry instanceof THREE.CircleGeometry) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.CircleGeometry(element.radius || 5, 32);
        }
        break;

      case "cube":
        if (mesh.geometry instanceof THREE.BoxGeometry) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.BoxGeometry(
            element.width || 10,
            element.height || 10,
            element.depth || 10
          );
        }
        break;

      case "sphere":
        if (mesh.geometry instanceof THREE.SphereGeometry) {
          mesh.geometry.dispose();
          mesh.geometry = new THREE.SphereGeometry(element.radius || 5, 32, 16);
        }
        break;
    }
  }

  // Aggiorna colore se specificato
  if (element.color && object instanceof THREE.Mesh) {
    const mesh = object as THREE.Mesh;
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.setHex(element.color);
    }
  }
};

/**
 * Crea handle di controllo per la trasformazione
 */
export const createTransformHandles = (
  bounds: { centerX: number; centerY: number; centerZ: number; width: number; height: number; depth: number },
  mode: "translate" | "rotate" | "scale"
): THREE.Group => {
  const handlesGroup = new THREE.Group();
  const handleSize = 0.5;

  switch (mode) {
    case "translate":
      // Frecce per gli assi X, Y, Z
      const arrowX = createArrowHelper(new THREE.Vector3(1, 0, 0), handleSize, 0xff0000);
      const arrowY = createArrowHelper(new THREE.Vector3(0, 1, 0), handleSize, 0x00ff00);
      const arrowZ = createArrowHelper(new THREE.Vector3(0, 0, 1), handleSize, 0x0000ff);

      handlesGroup.add(arrowX, arrowY, arrowZ);
      break;

    case "rotate":
      // Anelli per la rotazione
      const ringX = createRotationRing("x", handleSize, 0xff0000);
      const ringY = createRotationRing("y", handleSize, 0x00ff00);
      const ringZ = createRotationRing("z", handleSize, 0x0000ff);

      handlesGroup.add(ringX, ringY, ringZ);
      break;

    case "scale":
      // Cubi per il ridimensionamento
      const scaleHandles = createScaleHandles(bounds, handleSize);
      handlesGroup.add(...scaleHandles);
      break;
  }

  handlesGroup.position.set(bounds.centerX, bounds.centerY, bounds.centerZ);
  handlesGroup.userData.isTransformHandle = true;

  return handlesGroup;
};

/**
 * Helper per creare frecce direzionali
 */
const createArrowHelper = (direction: THREE.Vector3, size: number, color: number): THREE.ArrowHelper => {
  const origin = new THREE.Vector3(0, 0, 0);
  const arrow = new THREE.ArrowHelper(direction, origin, size * 2, color, size * 0.5, size * 0.3);
  arrow.userData.isTransformHandle = true;
  arrow.userData.handleType = "translate";
  arrow.userData.axis = direction;
  return arrow;
};

/**
 * Helper per creare anelli di rotazione
 */
const createRotationRing = (axis: string, size: number, color: number): THREE.Mesh => {
  const geometry = new THREE.TorusGeometry(size, size * 0.1, 8, 32);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
  const ring = new THREE.Mesh(geometry, material);

  switch (axis) {
    case "x":
      ring.rotation.y = Math.PI / 2;
      break;
    case "y":
      ring.rotation.x = Math.PI / 2;
      break;
    case "z":
      // Nessuna rotazione per l'asse Z
      break;
  }

  ring.userData.isTransformHandle = true;
  ring.userData.handleType = "rotate";
  ring.userData.axis = axis;

  return ring;
};

/**
 * Helper per creare handle di ridimensionamento
 */
const createScaleHandles = (bounds: any, size: number): THREE.Mesh[] => {
  const handles: THREE.Mesh[] = [];
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });

  // Crea handle agli angoli del bounding box
  const positions = [
    [-bounds.width/2, -bounds.height/2, -bounds.depth/2],
    [bounds.width/2, -bounds.height/2, -bounds.depth/2],
    [-bounds.width/2, bounds.height/2, -bounds.depth/2],
    [bounds.width/2, bounds.height/2, -bounds.depth/2],
    [-bounds.width/2, -bounds.height/2, bounds.depth/2],
    [bounds.width/2, -bounds.height/2, bounds.depth/2],
    [-bounds.width/2, bounds.height/2, bounds.depth/2],
    [bounds.width/2, bounds.height/2, bounds.depth/2]
  ];

  positions.forEach((pos, index) => {
    const handle = new THREE.Mesh(geometry.clone(), material.clone());
    handle.position.set(pos[0], pos[1], pos[2]);
    handle.userData.isTransformHandle = true;
    handle.userData.handleType = "scale";
    handle.userData.cornerIndex = index;
    handles.push(handle);
  });

  return handles;
};

/**
 * Performance monitor per le operazioni di transform
 */
export class TransformPerformanceMonitor {
  private startTime: number = 0;
  private operationCount: number = 0;
  private totalTime: number = 0;

  startOperation(): void {
    this.startTime = performance.now();
  }

  endOperation(): void {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    this.totalTime += duration;
    this.operationCount++;
  }

  getAverageTime(): number {
    return this.operationCount > 0 ? this.totalTime / this.operationCount : 0;
  }

  getStats(): { operations: number; totalTime: number; avgTime: number } {
    return {
      operations: this.operationCount,
      totalTime: this.totalTime,
      avgTime: this.getAverageTime()
    };
  }

  reset(): void {
    this.operationCount = 0;
    this.totalTime = 0;
    this.startTime = 0;
  }
}

export const createPerformanceMonitor = (): TransformPerformanceMonitor => {
  return new TransformPerformanceMonitor();
};
