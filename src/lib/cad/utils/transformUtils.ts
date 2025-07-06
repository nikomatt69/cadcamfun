/**
 * Transform Utilities - Estratte da CADCanvas.tsx
 * Funzioni pure per trasformazioni coordinate - ZERO RISCHIO
 */

import * as THREE from 'three';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

/**
 * Converte coordinate world a coordinate schermo
 * ESTRATTA DA: CADCanvas.tsx worldToScreen useCallback
 */
export const worldToScreen = (
  position: Position3D,
  camera: THREE.Camera,
  container: HTMLElement
): Position2D | null => {
  if (!container || !camera) return null;

  const vector = new THREE.Vector3(position.x, position.y, position.z);
  vector.project(camera);

  const rect = container.getBoundingClientRect();
  const x = ((vector.x + 1) / 2) * rect.width;
  const y = ((-vector.y + 1) / 2) * rect.height;

  return { x, y };
};

/**
 * Converte coordinate schermo a coordinate world
 * ESTRATTA DA: CADCanvas.tsx screenToWorld useCallback
 */
export const screenToWorld = (
  screenX: number,
  screenY: number,
  camera: THREE.PerspectiveCamera,
  container: HTMLElement
): THREE.Vector3 | null => {
  if (!container || !camera) return null;

  const rect = container.getBoundingClientRect();
  const normalizedX = ((screenX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((screenY - rect.top) / rect.height) * 2 + 1;

  const vector = new THREE.Vector3(normalizedX, normalizedY, 0);
  vector.unproject(camera);

  const direction = vector.sub(camera.position).normalize();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  const result = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(camera.position, direction);
  raycaster.ray.intersectPlane(plane, result);

  return result;
};

/**
 * Calcola la bounding box di un insieme di elementi
 * NUOVA UTILITY per supportare fitCameraToElements
 */
export const calculateElementsBoundingBox = (
  elements: THREE.Object3D[]
): THREE.Box3 | null => {
  if (elements.length === 0) return null;

  const boundingBox = new THREE.Box3();

  elements.forEach(element => {
    if (element) {
      const elementBox = new THREE.Box3().setFromObject(element);
      boundingBox.union(elementBox);
    }
  });

  return boundingBox;
};

/**
 * Calcola la posizione ottimale della camera per vedere tutti gli elementi
 * ESTRATTA DA: CADCanvas.tsx fitCameraToElements
 */
export const calculateOptimalCameraPosition = (
  elements: THREE.Object3D[],
  camera: THREE.PerspectiveCamera,
  currentPosition: THREE.Vector3
): {
  position: THREE.Vector3;
  target: THREE.Vector3;
} | null => {
  if (elements.length === 0) return null;

  const boundingBox = calculateElementsBoundingBox(elements);
  if (!boundingBox) return null;

  // Get bounding box dimensions and center
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  const size = new THREE.Vector3();
  boundingBox.getSize(size);

  // Compute the distance needed to fit the box in view
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

  // Position the camera to look at the center of the bounding box
  const direction = currentPosition
    .clone()
    .sub(new THREE.Vector3(0, 0, 0))
    .normalize();

  const newPosition = center.clone().add(direction.multiplyScalar(cameraDistance * 1.25));

  return {
    position: newPosition,
    target: center
  };
};

/**
 * Applica trasformazione con matrice
 * UTILITY per supportare trasformazioni complesse
 */
export const applyTransformation = (
  object: THREE.Object3D,
  matrix: THREE.Matrix4
): void => {
  object.applyMatrix4(matrix);
  object.updateMatrixWorld(true);
};

/**
 * Calcola la distanza tra due punti 3D
 * UTILITY pura per calcoli geometrici
 */
export const distance3D = (a: Position3D, b: Position3D): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Calcola l'angolo tra due vettori
 * UTILITY pura per calcoli angolari
 */
export const angleBetweenVectors = (
  v1: THREE.Vector3,
  v2: THREE.Vector3
): number => {
  return v1.angleTo(v2);
};

/**
 * Normalizza un angolo in radianti
 * UTILITY pura per normalizzazione angoli
 */
export const normalizeAngle = (angle: number): number => {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
};

/**
 * Converte gradi in radianti
 */
export const degreesToRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * Converte radianti in gradi
 */
export const radiansToDegrees = (radians: number): number => {
  return radians * (180 / Math.PI);
};
