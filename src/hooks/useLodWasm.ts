// src/hooks/canvas/useLOD.ts
import { useState, useEffect, useCallback, useRef } from "react";
import * as THREE from "three";

interface UseLODOptions {
  highDetailThreshold?: number; // Distance for high detail
  mediumDetailThreshold?: number; // Distance for medium detail
  lowDetailReduction?: number; // Geometry reduction factor for low detail
  mediumDetailReduction?: number; // Geometry reduction factor for medium detail
  updateInterval?: number; // How often to update LOD in ms
  optimizeTextures?: boolean; // Whether to reduce texture quality for distant objects
  disposeUnused?: boolean; // Whether to automatically dispose unused geometries
  frustumMargin?: number; // Extra margin around the view frustum
}

interface LODStatistics {
  highDetailCount: number;
  mediumDetailCount: number;
  lowDetailCount: number;
  culledCount: number;
  memoryReduction: number;
}

interface UseLODResult {
  applyLOD: () => void;
  statistics: LODStatistics;
  temporarilyRestoreFullDetail: () => () => void;
}

/**
 * A hook that manages Level of Detail (LOD) for Three.js scenes
 * to improve performance with complex scenes.
 */
export function useLOD(
  sceneRef: React.RefObject<THREE.Scene | null>,
  cameraRef: React.RefObject<THREE.Camera | null>,
  options: UseLODOptions = {}
): UseLODResult {
  // Default options
  const isSimulating = options.updateInterval === 0;

  const {
    highDetailThreshold = 100, // Objects closer than this use high detail
    mediumDetailThreshold = 300, // Objects closer than this use medium detail
    lowDetailReduction = 0.2, // Low detail geometry uses 20% of vertices
    mediumDetailReduction = 0.5, // Medium detail geometry uses 50% of vertices
    updateInterval = isSimulating ? 0 : 100, // Update every frame if simulating, otherwise every 100ms
    optimizeTextures = true, // Reduce texture resolution for distant objects
    disposeUnused = true, // Automatically dispose unused geometries
    frustumMargin = 1.2 // 20% extra margin around the view frustum
  } = options;

  // Statistics about LOD optimization
  const [statistics, setStatistics] = useState<LODStatistics>({
    highDetailCount: 0,
    mediumDetailCount: 0,
    lowDetailCount: 0,
    culledCount: 0,
    memoryReduction: 0
  });

  // Map to store original and simplified geometries
  const geometryCache = useRef<
    Map<
      string,
      {
        original: THREE.BufferGeometry;
        medium: THREE.BufferGeometry | null;
        low: THREE.BufferGeometry | null;
      }
    >
  >(new Map());

  // Track objects that have been modified
  const modifiedObjects = useRef<
    Map<
      string,
      {
        originalGeometry: THREE.BufferGeometry;
        originalScale: THREE.Vector3;
        originalVisible: boolean;
        detailLevel: "high" | "medium" | "low" | "culled";
      }
    >
  >(new Map());

  // Flag to temporarily disable LOD
  const disableLOD = useRef<boolean>(false);

  // Last time LOD was updated
  const lastUpdateTime = useRef<number>(0);

  // Create a simplified version of a geometry
  const simplifyGeometry = useCallback((geometry: THREE.BufferGeometry, detailRatio: number): THREE.BufferGeometry => {
    // Create a simplified version - in a real implementation, we'd use the WASM module for this
    // This is a very basic simplification method for demonstration
    const simplified = geometry.clone();

    // Skip if the geometry is already very simple
    if (!simplified.index || simplified.index.count < 100) {
      return simplified;
    }

    // Reduce the number of indices
    const originalIndices = simplified.index.array;
    const targetIndexCount = Math.max(24, Math.floor(originalIndices.length * detailRatio));

    // Create strided indices (simple but not great quality)
    const stride = Math.max(1, Math.floor(originalIndices.length / targetIndexCount));
    const newIndices = new Uint32Array(targetIndexCount * 3);

    let writeIndex = 0;
    for (let i = 0; i < originalIndices.length; i += stride * 3) {
      if (i + 2 < originalIndices.length && writeIndex + 2 < newIndices.length) {
        newIndices[writeIndex] = originalIndices[i];
        newIndices[writeIndex + 1] = originalIndices[i + 1];
        newIndices[writeIndex + 2] = originalIndices[i + 2];
        writeIndex += 3;
      }
    }

    simplified.setIndex(new THREE.BufferAttribute(newIndices.subarray(0, writeIndex), 1));

    // Compute the bounding box and sphere
    simplified.computeBoundingBox();
    simplified.computeBoundingSphere();

    return simplified;
  }, []);

  // Get the appropriate geometry based on distance
  const getGeometryForDistance = useCallback(
    (
      object: THREE.Mesh,
      distance: number,
      originalGeometry: THREE.BufferGeometry
    ): { geometry: THREE.BufferGeometry; detailLevel: "high" | "medium" | "low" } => {
      // Determine detail level based on distance
      let detailLevel: "high" | "medium" | "low" = "high";
      let geometry = originalGeometry;

      if (distance > mediumDetailThreshold) {
        detailLevel = "low";

        // Get or create low detail version
        const cacheKey = originalGeometry.uuid;

        if (!geometryCache.current.has(cacheKey)) {
          geometryCache.current.set(cacheKey, {
            original: originalGeometry,
            medium: null,
            low: null
          });
        }

        const cachedGeometries = geometryCache.current.get(cacheKey)!;

        if (!cachedGeometries.low) {
          cachedGeometries.low = simplifyGeometry(originalGeometry, lowDetailReduction);
        }

        geometry = cachedGeometries.low;
      } else if (distance > highDetailThreshold) {
        detailLevel = "medium";

        // Get or create medium detail version
        const cacheKey = originalGeometry.uuid;

        if (!geometryCache.current.has(cacheKey)) {
          geometryCache.current.set(cacheKey, {
            original: originalGeometry,
            medium: null,
            low: null
          });
        }

        const cachedGeometries = geometryCache.current.get(cacheKey)!;

        if (!cachedGeometries.medium) {
          cachedGeometries.medium = simplifyGeometry(originalGeometry, mediumDetailReduction);
        }

        geometry = cachedGeometries.medium;
      }

      return { geometry, detailLevel };
    },
    [highDetailThreshold, mediumDetailThreshold, lowDetailReduction, mediumDetailReduction, simplifyGeometry]
  );

  // Apply texture optimization based on distance
  const optimizeTextureForDistance = useCallback(
    (material: THREE.Material, distance: number) => {
      if (!optimizeTextures) return;

      // Skip non-texture materials
      if (
        !(material instanceof THREE.MeshStandardMaterial) &&
        !(material instanceof THREE.MeshPhongMaterial) &&
        !(material instanceof THREE.MeshBasicMaterial)
      ) {
        return;
      }

      // Set anisotropy based on distance
      const textures: THREE.Texture[] = [];

      if ("map" in material && material.map) textures.push(material.map);
      if ("normalMap" in material && material.normalMap) textures.push(material.normalMap);
      if ("bumpMap" in material && material.bumpMap) textures.push(material.bumpMap);
      if ("roughnessMap" in material && material.roughnessMap) textures.push(material.roughnessMap);
      if ("metalnessMap" in material && material.metalnessMap) textures.push(material.metalnessMap);

      textures.forEach(texture => {
        if (!texture) return;

        // For close objects, use high anisotropy
        if (distance < highDetailThreshold) {
          texture.anisotropy = 16;
        }
        // For medium distance, use medium anisotropy
        else if (distance < mediumDetailThreshold) {
          texture.anisotropy = 4;
        }
        // For far objects, use no anisotropy
        else {
          texture.anisotropy = 1;
        }

        texture.needsUpdate = true;
      });
    },
    [optimizeTextures, highDetailThreshold, mediumDetailThreshold]
  );

  // Check if an object is in the camera frustum
  const isInFrustum = useCallback(
    (object: THREE.Object3D, camera: THREE.Camera, margin: number = frustumMargin): boolean => {
      // Only check meshes with geometry
      if (!(object instanceof THREE.Mesh) || !object.geometry) return true;

      // Create a frustum from the camera
      const frustum = new THREE.Frustum();
      const projScreenMatrix = new THREE.Matrix4();

      // Get the camera's projection matrix
      if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
        projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreenMatrix);

        // Compute object's bounding sphere if needed
        if (!object.geometry.boundingSphere) {
          object.geometry.computeBoundingSphere();
        }

        // Check if the object's bounding sphere is in the frustum
        if (object.geometry.boundingSphere) {
          const boundingSphere = object.geometry.boundingSphere.clone();

          // Scale the sphere by the frustum margin
          boundingSphere.radius *= margin;

          // Transform the sphere to world space
          const worldMatrix = object.matrixWorld;
          const center = boundingSphere.center.clone().applyMatrix4(worldMatrix);
          const worldRadius =
            boundingSphere.radius *
            Math.max(
              Math.abs(worldMatrix.elements[0]), // Scale X
              Math.abs(worldMatrix.elements[5]), // Scale Y
              Math.abs(worldMatrix.elements[10]) // Scale Z
            );

          const worldBoundingSphere = new THREE.Sphere(center, worldRadius);

          return frustum.intersectsSphere(worldBoundingSphere);
        }
      }

      // If we can't determine, assume it's visible
      return true;
    },
    [frustumMargin]
  );

  // Apply LOD to the scene
  const applyLOD = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || disableLOD.current) return;

    const camera = cameraRef.current;
    const scene = sceneRef.current;

    // Track statistics
    let highDetailCount = 0;
    let mediumDetailCount = 0;
    let lowDetailCount = 0;
    let culledCount = 0;

    // Calculate memory saved (very rough approximation)
    let originalVertexCount = 0;
    let optimizedVertexCount = 0;

    // Process all meshes in the scene
    scene.traverse(object => {
      // Only process visible meshes with geometry
      if (!(object instanceof THREE.Mesh) || !object.visible) return;

      const mesh = object as THREE.Mesh;

      // Skip objects that shouldn't be optimized (like helpers)
      if (object.userData.skipLOD) return;

      // Store original state if not already stored
      if (!modifiedObjects.current.has(mesh.uuid)) {
        modifiedObjects.current.set(mesh.uuid, {
          originalGeometry: mesh.geometry,
          originalScale: mesh.scale.clone(),
          originalVisible: mesh.visible,
          detailLevel: "high"
        });
      }

      // Get distance to camera
      const cameraPosition = new THREE.Vector3();
      camera.getWorldPosition(cameraPosition);

      const objectPosition = new THREE.Vector3();
      mesh.getWorldPosition(objectPosition);

      const distance = cameraPosition.distanceTo(objectPosition);

      // Check if object is in frustum
      const inFrustum = isInFrustum(mesh, camera);

      // If out of frustum, cull the object
      if (!inFrustum) {
        mesh.visible = false;
        modifiedObjects.current.get(mesh.uuid)!.detailLevel = "culled";
        culledCount++;
        return;
      }

      // Restore visibility if previously culled
      if (modifiedObjects.current.get(mesh.uuid)!.detailLevel === "culled") {
        mesh.visible = modifiedObjects.current.get(mesh.uuid)!.originalVisible;
      }

      // Get the original geometry
      const originalGeometry = modifiedObjects.current.get(mesh.uuid)!.originalGeometry;

      // Count original vertices for memory calculation
      originalVertexCount += originalGeometry.attributes.position ? originalGeometry.attributes.position.count : 0;

      // Get appropriate geometry for this distance
      const { geometry, detailLevel } = getGeometryForDistance(mesh, distance, originalGeometry);

      // Update mesh with new geometry if changed
      if (mesh.geometry !== geometry) {
        mesh.geometry = geometry;
      }

      // Update detail level tracking
      modifiedObjects.current.get(mesh.uuid)!.detailLevel = detailLevel;

      // Count optimized vertices for memory calculation
      optimizedVertexCount += geometry.attributes.position ? geometry.attributes.position.count : 0;

      // Update statistics counters
      if (detailLevel === "high") {
        highDetailCount++;
      } else if (detailLevel === "medium") {
        mediumDetailCount++;
      } else if (detailLevel === "low") {
        lowDetailCount++;
      }

      // Optimize textures if enabled
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => optimizeTextureForDistance(mat, distance));
        } else {
          optimizeTextureForDistance(mesh.material, distance);
        }
      }
    });

    // Update statistics
    setStatistics({
      highDetailCount,
      mediumDetailCount,
      lowDetailCount,
      culledCount,
      memoryReduction: originalVertexCount > 0 ? 1 - optimizedVertexCount / originalVertexCount : 0
    });

    // Dispose unused geometries if enabled
    if (disposeUnused) {
      // In a real implementation, we would track which geometries are no longer used
      // and dispose them here. This requires more complex tracking than this example provides.
    }
  }, [sceneRef, cameraRef, getGeometryForDistance, optimizeTextureForDistance, isInFrustum, disposeUnused]);

  // Effect to run LOD updates on interval
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current) return;

    let animationFrameId: number | null = null;

    const updateLOD = (timestamp: number) => {
      // Skip if not enough time has passed and we're not simulating
      if (!isSimulating && updateInterval > 0 && timestamp - lastUpdateTime.current < updateInterval) {
        animationFrameId = requestAnimationFrame(updateLOD);
        return;
      }

      // Update the timestamp
      lastUpdateTime.current = timestamp;

      // Apply LOD
      applyLOD();

      // Schedule next update
      animationFrameId = requestAnimationFrame(updateLOD);
    };

    // Start the update loop
    animationFrameId = requestAnimationFrame(updateLOD);

    // Cleanup
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sceneRef, cameraRef, updateInterval, isSimulating, applyLOD]);

  // Function to temporarily restore full detail (e.g., for screenshots)
  const temporarilyRestoreFullDetail = useCallback(() => {
    if (!sceneRef.current) return () => {};

    // Disable LOD
    disableLOD.current = true;

    // Restore all objects to original state
    modifiedObjects.current.forEach((data, uuid) => {
      const object = sceneRef.current!.getObjectByProperty("uuid", uuid) as THREE.Mesh;
      if (object && object instanceof THREE.Mesh) {
        object.geometry = data.originalGeometry;
        object.scale.copy(data.originalScale);
        object.visible = data.originalVisible;
      }
    });

    // Return a function to restore LOD
    return () => {
      disableLOD.current = false;
      applyLOD();
    };
  }, [sceneRef, applyLOD]);

  // Cleanup when unmounting
  useEffect(() => {
    return () => {
      // Restore original geometries to avoid memory leaks
      modifiedObjects.current.forEach((data, uuid) => {
        const object = sceneRef.current?.getObjectByProperty("uuid", uuid) as THREE.Mesh;
        if (object && object instanceof THREE.Mesh) {
          object.geometry = data.originalGeometry;
        }
      });

      // Clear caches
      geometryCache.current.clear();
      modifiedObjects.current.clear();
    };
  }, [sceneRef]);

  return {
    applyLOD,
    statistics,
    temporarilyRestoreFullDetail
  };
}
