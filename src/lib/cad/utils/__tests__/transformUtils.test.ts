/**
 * Transform Utils Tests
 * Verifica comportamento identico alle funzioni originali in CADCanvas.tsx
 */

import * as THREE from 'three';
import {
  worldToScreen,
  screenToWorld,
  calculateElementsBoundingBox,
  calculateOptimalCameraPosition,
  distance3D,
  angleBetweenVectors,
  normalizeAngle,
  degreesToRadians,
  radiansToDegrees
} from '../transformUtils';

describe('Transform Utils', () => {
  let camera: THREE.PerspectiveCamera;
  let container: HTMLElement;

  beforeEach(() => {
    // Setup camera come in CADCanvas.tsx
    camera = new THREE.PerspectiveCamera(75, 1, 0.01, 5000);
    camera.position.set(0, 0, 5);

    // Mock container element
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
  });

  describe('worldToScreen', () => {
    it('should convert world coordinates to screen coordinates', () => {
      const worldPos = { x: 0, y: 0, z: 0 };
      const result = worldToScreen(worldPos, camera, container);
      
      expect(result).not.toBeNull();
      expect(result!.x).toBe(400); // Centro X dello schermo
      expect(result!.y).toBe(300); // Centro Y dello schermo
    });

    it('should return null for invalid inputs', () => {
      expect(worldToScreen({ x: 0, y: 0, z: 0 }, camera, null as any)).toBeNull();
      expect(worldToScreen({ x: 0, y: 0, z: 0 }, null as any, container)).toBeNull();
    });

    it('should handle edge coordinates correctly', () => {
      // Test coordinate agli estremi
      const leftEdge = worldToScreen({ x: -10, y: 0, z: 0 }, camera, container);
      const rightEdge = worldToScreen({ x: 10, y: 0, z: 0 }, camera, container);
      
      expect(leftEdge!.x).toBeLessThan(rightEdge!.x);
    });
  });

  describe('screenToWorld', () => {
    it('should convert screen coordinates to world coordinates', () => {
      const result = screenToWorld(400, 300, camera, container);
      
      expect(result).not.toBeNull();
      expect(result!.x).toBeCloseTo(0, 1);
      expect(result!.y).toBeCloseTo(0, 1);
    });

    it('should return null for invalid inputs', () => {
      expect(screenToWorld(400, 300, null as any, container)).toBeNull();
      expect(screenToWorld(400, 300, camera, null as any)).toBeNull();
    });

    it('should be inverse of worldToScreen for points on plane', () => {
      const originalPoint = { x: 2, y: 3, z: 0 };
      
      // World -> Screen -> World
      const screenCoords = worldToScreen(originalPoint, camera, container);
      expect(screenCoords).not.toBeNull();
      
      const backToWorld = screenToWorld(screenCoords!.x, screenCoords!.y, camera, container);
      expect(backToWorld).not.toBeNull();
      
      expect(backToWorld!.x).toBeCloseTo(originalPoint.x, 1);
      expect(backToWorld!.y).toBeCloseTo(originalPoint.y, 1);
    });
  });

  describe('calculateElementsBoundingBox', () => {
    it('should calculate bounding box for multiple elements', () => {
      const mesh1 = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial()
      );
      mesh1.position.set(0, 0, 0);

      const mesh2 = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      );
      mesh2.position.set(5, 5, 5);

      const boundingBox = calculateElementsBoundingBox([mesh1, mesh2]);
      
      expect(boundingBox).not.toBeNull();
      
      const size = new THREE.Vector3();
      boundingBox!.getSize(size);
      
      expect(size.x).toBeGreaterThan(5);
      expect(size.y).toBeGreaterThan(5);
      expect(size.z).toBeGreaterThan(5);
    });

    it('should return null for empty elements array', () => {
      const result = calculateElementsBoundingBox([]);
      expect(result).toBeNull();
    });

    it('should handle single element', () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial()
      );
      
      const boundingBox = calculateElementsBoundingBox([mesh]);
      expect(boundingBox).not.toBeNull();
      
      const size = new THREE.Vector3();
      boundingBox!.getSize(size);
      
      expect(size.x).toBeCloseTo(2, 1);
      expect(size.y).toBeCloseTo(2, 1);
      expect(size.z).toBeCloseTo(2, 1);
    });
  });

  describe('calculateOptimalCameraPosition', () => {
    it('should calculate optimal camera position for elements', () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial()
      );
      mesh.position.set(0, 0, 0);

      const currentPosition = new THREE.Vector3(5, 5, 5);
      const result = calculateOptimalCameraPosition([mesh], camera, currentPosition);
      
      expect(result).not.toBeNull();
      expect(result!.target.x).toBeCloseTo(0, 1);
      expect(result!.target.y).toBeCloseTo(0, 1);
      expect(result!.target.z).toBeCloseTo(0, 1);
      
      // La posizione dovrebbe essere diversa da quella originale
      expect(result!.position.distanceTo(currentPosition)).toBeGreaterThan(0);
    });

    it('should return null for empty elements', () => {
      const currentPosition = new THREE.Vector3(5, 5, 5);
      const result = calculateOptimalCameraPosition([], camera, currentPosition);
      expect(result).toBeNull();
    });
  });

  describe('distance3D', () => {
    it('should calculate distance between two 3D points', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      
      const distance = distance3D(a, b);
      expect(distance).toBe(5); // 3-4-5 triangle
    });

    it('should handle 3D distances', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 1, y: 1, z: 1 };
      
      const distance = distance3D(a, b);
      expect(distance).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('should return 0 for same points', () => {
      const point = { x: 1, y: 2, z: 3 };
      expect(distance3D(point, point)).toBe(0);
    });
  });

  describe('angleBetweenVectors', () => {
    it('should calculate angle between parallel vectors', () => {
      const v1 = new THREE.Vector3(1, 0, 0);
      const v2 = new THREE.Vector3(2, 0, 0);
      
      const angle = angleBetweenVectors(v1, v2);
      expect(angle).toBeCloseTo(0, 5);
    });

    it('should calculate angle between perpendicular vectors', () => {
      const v1 = new THREE.Vector3(1, 0, 0);
      const v2 = new THREE.Vector3(0, 1, 0);
      
      const angle = angleBetweenVectors(v1, v2);
      expect(angle).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should calculate angle between opposite vectors', () => {
      const v1 = new THREE.Vector3(1, 0, 0);
      const v2 = new THREE.Vector3(-1, 0, 0);
      
      const angle = angleBetweenVectors(v1, v2);
      expect(angle).toBeCloseTo(Math.PI, 5);
    });
  });

  describe('angle conversion functions', () => {
    it('should convert degrees to radians', () => {
      expect(degreesToRadians(0)).toBe(0);
      expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 5);
      expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 5);
      expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI, 5);
    });

    it('should convert radians to degrees', () => {
      expect(radiansToDegrees(0)).toBe(0);
      expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 5);
      expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 5);
      expect(radiansToDegrees(2 * Math.PI)).toBeCloseTo(360, 5);
    });

    it('should be inverse operations', () => {
      const degrees = 45;
      expect(radiansToDegrees(degreesToRadians(degrees))).toBeCloseTo(degrees, 5);
      
      const radians = Math.PI / 3;
      expect(degreesToRadians(radiansToDegrees(radians))).toBeCloseTo(radians, 5);
    });
  });

  describe('normalizeAngle', () => {
    it('should normalize angles to [-π, π] range', () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 5);
      expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI, 5);
    });

    it('should handle angles outside the range', () => {
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 5);
      expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 5);
      expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI, 5);
    });

    it('should handle multiple rotations', () => {
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 5);
      expect(normalizeAngle(4 * Math.PI)).toBeCloseTo(0, 5);
      expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 5);
    });
  });
});
