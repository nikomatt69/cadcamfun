

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { number } from 'zod';

/**
 * Configuration options for the LOD (Level of Detail) system
 */
export interface LODOptions {
  /** Enables or disables the LOD system */
  enabled?: boolean;
  
  /** Distance at which high-detail models switch to lower detail */
  highDetailThreshold?: number;
  
  /** Distance at which medium-detail models switch to lowest detail */
  mediumDetailThreshold?: number;
  
  /** Reduction factor for medium detail (0.0-1.0) */
  mediumDetailReduction?: number;
  
  /** Reduction factor for low detail (0.0-1.0) */
  lowDetailReduction?: number;
  
  /** Whether to show wireframes for distant objects */
  wireframeForDistant?: boolean;
  
  /** Distance beyond which objects should be hidden */
  cullingDistance?: number;
  
  /** How frequently to update LOD in milliseconds (0 = every frame) */
  updateFrequency?: number;
  
  /** Whether to optimize textures for distant objects */
  optimizeTextures?: boolean;
  
  /** Distance-based frustum culling multiplier (0 = disabled) */
  frustumCullingMultiplier?: number;
  
  /** Whether to optimize materials for distant objects */
  optimizeMaterials?: boolean;
  
  /** Whether to batch similar geometries to reduce draw calls */
  batchSimilarGeometries?: boolean;
  
  /** Whether to aggressively dispose unused geometries */
  disposeUnusedGeometries?: boolean;
}

/**
 * Default LOD options
 */
const DEFAULT_LOD_OPTIONS: LODOptions = {
  enabled: true,
  highDetailThreshold: 100,
  mediumDetailThreshold: 300,
  mediumDetailReduction: 0.5,
  lowDetailReduction: 0.2,
  wireframeForDistant: false,
  cullingDistance: 2000,
  updateFrequency: 0, // Every frame
  optimizeTextures: true,
  frustumCullingMultiplier: 1.2,
  optimizeMaterials: true,
  batchSimilarGeometries: false, // Advanced feature, disabled by default
  disposeUnusedGeometries: true,
};

/**
 * Statistics about the current LOD state
 */
export interface LODStatistics {
  /** Total number of objects being managed by LOD */
  totalObjects: number;
  
  /** Number of objects at highest detail level */
  highDetailObjects: number;
  
  /** Number of objects at medium detail level */
  mediumDetailObjects: number;
  
  /** Number of objects at lowest detail level */
  lowDetailObjects: number;
  
  /** Number of objects currently culled (hidden) */
  culledObjects: number;
  
  /** Estimated memory saved by LOD in MB */
  estimatedMemorySavedMB: number;
  
  /** Number of texture resolution reductions */
  textureReductions: number;
  
  /** Polygons removed from scene */
  polygonsRemoved: number;
  
  /** Last update timestamp */
  lastUpdateTime: number;
  
  /** Performance impact estimation (0-100, lower is better) */
  performanceImpact: number;
}

/** LodLevel type definition */
type LodLevel = 'high' | 'medium' | 'low' | 'culled';

/**
 * Custom hook for managing Level of Detail (LOD) in a Three.js scene
 * 
 * This hook intelligently reduces geometry detail for distant objects
 * to improve rendering performance while maintaining visual quality
 * for nearby objects that are more important to the user.
 * 
 * @param sceneRef - Reference to the Three.js scene
 * @param cameraRef - Reference to the Three.js camera
 * @param options - Configuration options for the LOD system
 */
export const useLOD = (
  sceneRef: React.RefObject<THREE.Scene>,
  cameraRef: React.RefObject<THREE.Camera>,
  options: LODOptions = {}
) => {
  // Merge options with defaults
  const config = { ...DEFAULT_LOD_OPTIONS, ...options };
  
  // Animation frame reference for cleanup
  const frameIdRef = useRef<number>(0);
  
  // Track whether component is mounted
  const isMountedRef = useRef<boolean>(true);
  
  // Cache original geometries for restoration using WeakMap for better memory management
  const originalGeometriesRef = useRef<WeakMap<THREE.Mesh, THREE.BufferGeometry>>(new WeakMap());
  
  // Cache simplified geometries to avoid recreating them
  const simplifiedGeometriesRef = useRef<Map<string, Record<string, THREE.BufferGeometry>>>(new Map());
  
  // Store current LOD level for each object using WeakMap for better memory management
  const currentLODLevelRef = useRef<WeakMap<THREE.Mesh, LodLevel>>(new WeakMap());
  
  // Cache for material simplifications
  const simplifiedMaterialsRef = useRef<WeakMap<THREE.Material, THREE.Material>>(new WeakMap());
  
  // Cache for original material properties
  const originalMaterialPropsRef = useRef<WeakMap<THREE.Material, Record<string, any>>>(new WeakMap());
  
  // Store last update timestamp
  const lastUpdateRef = useRef<number>(0);
  
  // Store objects to update in next frame (for throttling)
  const updateQueueRef = useRef<Set<THREE.Mesh>>(new Set());
  
  // Cache for bounding spheres to avoid recalculations
  const boundingSpheresRef = useRef<WeakMap<THREE.Object3D, THREE.Sphere>>(new WeakMap());
  
  // Track LOD statistics
  const [statistics, setStatistics] = useState<LODStatistics>({
    totalObjects: 0,
    highDetailObjects: 0,
    mediumDetailObjects: 0,
    lowDetailObjects: 0,
    culledObjects: 0,
    estimatedMemorySavedMB: 0,
    textureReductions: 0,
    polygonsRemoved: 0,
    lastUpdateTime: 0,
    performanceImpact: 0,
  });
  
  // Helper to create a unique ID for a mesh - optimized version
  const getMeshId = useCallback((mesh: THREE.Mesh): string => {
    return mesh.uuid;
  }, []);
  
  // Calculate an optimized hash for a geometry to identify similar geometries for caching
  const getGeometryHash = useCallback((geometry: THREE.BufferGeometry): string => {
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) return 'no-position';
    
    const vertexCount = positionAttr.count;
    const indexCount = geometry.index ? geometry.index.count : 0;
    const normalCount = geometry.getAttribute('normal') ? geometry.getAttribute('normal').count : 0;
    const uvCount = geometry.getAttribute('uv') ? geometry.getAttribute('uv').count : 0;
    
    // Include more attributes in the hash for better identification
    return `v${vertexCount}-i${indexCount}-n${normalCount}-uv${uvCount}`;
  }, []);
  
  // Get or calculate a bounding sphere for an object with caching
  const getBoundingSphere = useCallback((object: THREE.Object3D): THREE.Sphere => {
    if (boundingSpheresRef.current.has(object)) {
      return boundingSpheresRef.current.get(object)!;
    }
    
    // Calculate new bounding sphere
    const sphere = new THREE.Sphere();
    
    if (object instanceof THREE.Mesh && object.geometry) {
      // Use geometry's bounding sphere if available
      if (!object.geometry.boundingSphere) {
        object.geometry.computeBoundingSphere();
      }
      
      if (object.geometry.boundingSphere) {
        // Clone the sphere and apply world transform
        sphere.copy(object.geometry.boundingSphere);
        const matrix = object.matrixWorld;
        const scaling = new THREE.Vector3();
        matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scaling);
        
        // Apply scaling to radius
        const maxScale = Math.max(scaling.x, scaling.y, scaling.z);
        sphere.radius *= maxScale;
        
        // Apply position
        const center = new THREE.Vector3();
        object.getWorldPosition(center);
        sphere.center.copy(center);
      } else {
        // Fallback: create a basic sphere at object's position
        object.getWorldPosition(sphere.center);
        sphere.radius = 1; // Default radius
      }
    } else {
      // Non-mesh objects - create a basic sphere at object's position
      object.getWorldPosition(sphere.center);
      sphere.radius = 1; // Default radius
    }
    
    // Cache the result
    boundingSpheresRef.current.set(object, sphere);
    return sphere;
  }, []);
  
  // Perform distance-based checks using bounding sphere overlap for better accuracy
  const isTooFarForDetail = useCallback((
    cameraPosition: THREE.Vector3,
    object: THREE.Object3D,
    threshold: number
  ): boolean => {
    const sphere = getBoundingSphere(object);
    
    // Use distance from camera to sphere center, adjusted by radius
    const distance = cameraPosition.distanceTo(sphere.center) - sphere.radius;
    
    return distance > threshold;
  }, [getBoundingSphere]);
  
  // Initialize LOD system with optimized traversal
  const initializeLOD = useCallback(() => {
    if (!sceneRef.current || !config.enabled) return;
    
    // Use a more efficient method to iterate through meshes
    const meshes: THREE.Mesh[] = [];
    
    // Collect all relevant meshes first
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.excludeFromLOD) {
        meshes.push(object);
      }
    });
    
    // Process collected meshes
    for (const mesh of meshes) {
      // Skip if we've already stored this geometry
      if (originalGeometriesRef.current.has(mesh)) continue;
      
      // Store original geometry with deep clone for safety
      const originalGeometry = mesh.geometry.clone();
      
      // Add metadata to help with simplification
      if (mesh.geometry.type === 'BoxGeometry') {
        originalGeometry.userData.isBox = true;
        // Try to gather parameters from the original mesh
        if ((mesh.geometry as any).parameters) {
          originalGeometry.userData.parameters = { ...(mesh.geometry as any).parameters };
        }
      } else if (mesh.geometry.type === 'SphereGeometry') {
        originalGeometry.userData.isSphere = true;
        if ((mesh.geometry as any).parameters) {
          originalGeometry.userData.parameters = { ...(mesh.geometry as any).parameters };
        }
      } else if (mesh.geometry.type === 'CylinderGeometry') {
        originalGeometry.userData.isCylinder = true;
        if ((mesh.geometry as any).parameters) {
          originalGeometry.userData.parameters = { ...(mesh.geometry as any).parameters };
        }
      } else if (mesh.geometry.type === 'CircleGeometry') {
        originalGeometry.userData.isCircle = true;
        if ((mesh.geometry as any).parameters) {
          originalGeometry.userData.parameters = { ...(mesh.geometry as any).parameters };
        }
      }
      
      // Store original geometry
      originalGeometriesRef.current.set(mesh, originalGeometry);
      
      // Initialize LOD level
      currentLODLevelRef.current.set(mesh, 'high');
      
      // Store material properties if needed
      if (config.optimizeMaterials) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => {
            if (!originalMaterialPropsRef.current.has(material)) {
              storeMaterialProperties(material);
            }
          });
        } else if (mesh.material && !originalMaterialPropsRef.current.has(mesh.material)) {
          storeMaterialProperties(mesh.material);
        }
      }
    }
    
    // Recalculate statistics
    updateStatistics();
  }, [sceneRef, config.enabled, config.optimizeMaterials]);
  
  // Store original material properties for later restoration
  const storeMaterialProperties = useCallback((material: THREE.Material) => {
    const props: Record<string, any> = {};
    
    // Common properties to save
    if ('map' in material) props.map = (material as any).map;
    if ('normalMap' in material) props.normalMap = (material as any).normalMap;
    if ('roughnessMap' in material) props.roughnessMap = (material as any).roughnessMap;
    if ('metalnessMap' in material) props.metalnessMap = (material as any).metalnessMap;
    if ('emissiveMap' in material) props.emissiveMap = (material as any).emissiveMap;
    if ('aoMap' in material) props.aoMap = (material as any).aoMap;
    if ('displacementMap' in material) props.displacementMap = (material as any).displacementMap;
    if ('envMap' in material) props.envMap = (material as any).envMap;
    
    // Quality settings
    if ('wireframe' in material) props.wireframe = (material as any).wireframe;
    if ('flatShading' in material) props.flatShading = (material as any).flatShading;
    if ('side' in material) props.side = material.side;
    if ('vertexColors' in material) props.vertexColors = (material as any).vertexColors;
    
    // Store the properties
    originalMaterialPropsRef.current.set(material, props);
  }, []);
  
  // Simplify a material based on distance for better performance
  const simplifyMaterial = useCallback((
    originalMaterial: THREE.Material, 
    distanceRatio: number // 0-1, where 1 is farthest
  ): THREE.Material => {
    // Check if we already have a simplified version
    if (simplifiedMaterialsRef.current.has(originalMaterial)) {
      return simplifiedMaterialsRef.current.get(originalMaterial)!;
    }
    
    // Different simplification strategies depending on material type
    let simplifiedMaterial: THREE.Material;
    
    // Use cheaper material for distant objects
    if (distanceRatio > 0.8 && (
        originalMaterial instanceof THREE.MeshStandardMaterial || 
        originalMaterial instanceof THREE.MeshPhysicalMaterial
    )) {
      // For very distant objects, use MeshBasicMaterial to save on lighting calculations
      simplifiedMaterial = new THREE.MeshBasicMaterial({
        color: (originalMaterial as THREE.MeshStandardMaterial).color,
        map: (originalMaterial as THREE.MeshStandardMaterial).map,
        transparent: originalMaterial.transparent,
        opacity: originalMaterial.opacity,
        side: originalMaterial.side,
        wireframe: (originalMaterial as THREE.MeshStandardMaterial).wireframe,
      });
    }
    // For medium distance, use a lighter material but still with lighting
    else if (distanceRatio > 0.5 && (
        originalMaterial instanceof THREE.MeshStandardMaterial || 
        originalMaterial instanceof THREE.MeshPhysicalMaterial
    )) {
      simplifiedMaterial = new THREE.MeshLambertMaterial({
        color: (originalMaterial as THREE.MeshStandardMaterial).color,
        map: (originalMaterial as THREE.MeshStandardMaterial).map,
        transparent: originalMaterial.transparent,
        opacity: originalMaterial.opacity,
        side: originalMaterial.side,
        wireframe: (originalMaterial as THREE.MeshStandardMaterial).wireframe,
      });
    } 
    // For closer objects, keep material type but simplify properties
    else {
      // Clone the original material
      simplifiedMaterial = originalMaterial.clone();
      
      // Remove high-quality features based on distance
      if (simplifiedMaterial instanceof THREE.MeshStandardMaterial) {
        if (distanceRatio > 0.3) {
          // Medium distance - reduce map resolutions if possible
          // This is handled separately in optimizeTexture method
          
          // Reduce material quality
          simplifiedMaterial.envMapIntensity *= 0.5;
          simplifiedMaterial.metalness *= 0.8;
          simplifiedMaterial.roughness = Math.min(1, simplifiedMaterial.roughness * 1.2);
        }
      }
    }
    
    // Cache the simplified material
    simplifiedMaterialsRef.current.set(originalMaterial, simplifiedMaterial);
    
    return simplifiedMaterial;
  }, []);
  
  // Optimize a texture by using a reduced resolution version
  const optimizeTexture = useCallback((
    texture: THREE.Texture | null, 
    distanceRatio: number // 0-1, where 1 is farthest
  ): THREE.Texture | null => {
    if (!texture || !config.optimizeTextures) return texture;
    
    // Keep original texture for close objects
    if (distanceRatio < 0.3) return texture;
    
    // Get or create reduced-resolution version
    const cachedKey = `${texture.uuid}-${Math.round(distanceRatio * 10)}`;
    
    // For medium and far objects, create lower-resolution versions
    // This would require creating a lower-resolution texture on the fly,
    // which is complex in Three.js. In a real application, you would
    // build a mipmap chain or provide pre-built low-res textures.
    
    // Instead, we'll just adjust the texture settings for distant objects
    texture.minFilter = THREE.LinearFilter;
    texture.anisotropy = 1;
    
    // For very distant objects, further simplify
    if (distanceRatio > 0.7) {
      texture.generateMipmaps = false;
    }
    
    return texture;
  }, [config.optimizeTextures]);
  
  // Optimize textures for a material based on distance
  const optimizeMaterialTextures = useCallback((
    material: THREE.Material, 
    distanceRatio: number
  ): void => {
    if (!config.optimizeTextures) return;
    
    // Handle different material types
    if (material instanceof THREE.MeshStandardMaterial) {
      material.map = optimizeTexture(material.map, distanceRatio);
      material.normalMap = optimizeTexture(material.normalMap, distanceRatio);
      material.roughnessMap = optimizeTexture(material.roughnessMap, distanceRatio);
      material.metalnessMap = optimizeTexture(material.metalnessMap, distanceRatio);
      material.emissiveMap = optimizeTexture(material.emissiveMap, distanceRatio);
      material.aoMap = optimizeTexture(material.aoMap, distanceRatio);
      material.displacementMap = optimizeTexture(material.displacementMap, distanceRatio);
      material.envMap = optimizeTexture(material.envMap, distanceRatio);
    }
    else if (material instanceof THREE.MeshPhysicalMaterial) {
      material.map = optimizeTexture(material.map, distanceRatio);
      material.normalMap = optimizeTexture(material.normalMap, distanceRatio);
      material.roughnessMap = optimizeTexture(material.roughnessMap, distanceRatio);
      material.metalnessMap = optimizeTexture(material.metalnessMap, distanceRatio);
      material.emissiveMap = optimizeTexture(material.emissiveMap, distanceRatio);
      material.aoMap = optimizeTexture(material.aoMap, distanceRatio);
      material.displacementMap = optimizeTexture(material.displacementMap, distanceRatio);
      material.envMap = optimizeTexture(material.envMap, distanceRatio);
      material.clearcoatMap = optimizeTexture(material.clearcoatMap, distanceRatio);
      material.clearcoatRoughnessMap = optimizeTexture(material.clearcoatRoughnessMap, distanceRatio);
      material.clearcoatNormalMap = optimizeTexture(material.clearcoatNormalMap, distanceRatio);
    }
    else if (material instanceof THREE.MeshLambertMaterial || 
             material instanceof THREE.MeshPhongMaterial ||
             material instanceof THREE.MeshBasicMaterial) {
      material.map = optimizeTexture(material.map, distanceRatio);
      if ('normalMap' in material) (material as any).normalMap = optimizeTexture((material as any).normalMap, distanceRatio);
      if ('emissiveMap' in material) (material as any).emissiveMap = optimizeTexture((material as any).emissiveMap, distanceRatio);
      if ('aoMap' in material) (material as any).aoMap = optimizeTexture((material as any).aoMap, distanceRatio);
      if ('displacementMap' in material) (material as any).displacementMap = optimizeTexture((material as any).displacementMap, distanceRatio);
      if ('envMap' in material) (material as any).envMap = optimizeTexture((material as any).envMap, distanceRatio);
    }
  }, [config.optimizeTextures, optimizeTexture]);
  
  // Optimize all textures for a mesh based on distance
  const optimizeMeshTextures = useCallback((
    mesh: THREE.Mesh,
    distanceRatio: number
  ): void => {
    if (!config.optimizeTextures) return;
    
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(material => {
        optimizeMaterialTextures(material, distanceRatio);
      });
    } else if (mesh.material) {
      optimizeMaterialTextures(mesh.material, distanceRatio);
    }
  }, [config.optimizeTextures, optimizeMaterialTextures]);
  
  // Restore original material properties
  const restoreMaterial = useCallback((
    mesh: THREE.Mesh
  ): void => {
    if (!config.optimizeMaterials) return;
    
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(material => {
        const props = originalMaterialPropsRef.current.get(material);
        if (props) {
          // Restore saved properties
          Object.entries(props).forEach(([key, value]) => {
            if (value !== undefined) {
              (material as any)[key] = value;
            }
          });
        }
      });
    } else if (mesh.material) {
      const props = originalMaterialPropsRef.current.get(mesh.material);
      if (props) {
        // Restore saved properties
        Object.entries(props).forEach(([key, value]) => {
          if (value !== undefined) {
            (mesh.material as any)[key] = value;
          }
        });
      }
    }
  }, [config.optimizeMaterials]);
  
  // Simplify a geometry to a given detail level with improved decimation
  const simplifyGeometry = useCallback((
    originalGeometry: THREE.BufferGeometry, 
    detailLevel: number
  ): THREE.BufferGeometry => {
    // Create a simplified geometry based on the original type
    const geometryHash = getGeometryHash(originalGeometry);
    
    // Check cache first
    const levelKey = `level-${detailLevel.toFixed(2)}`;
    if (
      simplifiedGeometriesRef.current.has(geometryHash) && 
      simplifiedGeometriesRef.current.get(geometryHash)![levelKey]
    ) {
      return simplifiedGeometriesRef.current.get(geometryHash)![levelKey];
    }
    
    // For known primitive types, we can create new geometries with fewer segments
    if (originalGeometry.userData.isBox) {
      const params = originalGeometry.userData.parameters || {};
      const width = params.width || 1;
      const height = params.height || 1;
      const depth = params.depth || 1;
      
      // Calculate new segments based on detail level
      const widthSegments = Math.max(1, Math.floor((params.widthSegments || 1) * detailLevel));
      const heightSegments = Math.max(1, Math.floor((params.heightSegments || 1) * detailLevel));
      const depthSegments = Math.max(1, Math.floor((params.depthSegments || 1) * detailLevel));
      
      const simplified = new THREE.BoxGeometry(
        width, height, depth, 
        widthSegments, heightSegments, depthSegments
      );
      
      // Cache and return
      if (!simplifiedGeometriesRef.current.has(geometryHash)) {
        simplifiedGeometriesRef.current.set(geometryHash, {});
      }
      simplifiedGeometriesRef.current.get(geometryHash)![levelKey] = simplified;
      return simplified;
    } 
    else if (originalGeometry.userData.isSphere) {
      const params = originalGeometry.userData.parameters || {};
      const radius = params.radius || 1;
      
      // Calculate new segments based on detail level
      const widthSegments = Math.max(4, Math.floor((params.widthSegments || 32) * detailLevel));
      const heightSegments = Math.max(3, Math.floor((params.heightSegments || 16) * detailLevel));
      
      const simplified = new THREE.SphereGeometry(
        radius, widthSegments, heightSegments
      );
      
      // Cache and return
      if (!simplifiedGeometriesRef.current.has(geometryHash)) {
        simplifiedGeometriesRef.current.set(geometryHash, {});
      }
      simplifiedGeometriesRef.current.get(geometryHash)![levelKey] = simplified;
      return simplified;
    }
    else if (originalGeometry.userData.isCylinder) {
      const params = originalGeometry.userData.parameters || {};
      const radiusTop = params.radiusTop || 1;
      const radiusBottom = params.radiusBottom || 1;
      const height = params.height || 1;
      
      // Calculate new segments based on detail level
      const radialSegments = Math.max(4, Math.floor((params.radialSegments || 32) * detailLevel));
      const heightSegments = Math.max(1, Math.floor((params.heightSegments || 1) * detailLevel));
      
      const simplified = new THREE.CylinderGeometry(
        radiusTop, radiusBottom, height, 
        radialSegments, heightSegments
      );
      
      // Cache and return
      if (!simplifiedGeometriesRef.current.has(geometryHash)) {
        simplifiedGeometriesRef.current.set(geometryHash, {});
      }
      simplifiedGeometriesRef.current.get(geometryHash)![levelKey] = simplified;
      return simplified;
    }
    else if (originalGeometry.userData.isCircle) {
      const params = originalGeometry.userData.parameters || {};
      const radius = params.radius || 1;
      
      // Calculate new segments based on detail level
      const segments = Math.max(4, Math.floor((params.segments || 32) * detailLevel));
      
      const simplified = new THREE.CircleGeometry(radius, segments);
      
      // Cache and return
      if (!simplifiedGeometriesRef.current.has(geometryHash)) {
        simplifiedGeometriesRef.current.set(geometryHash, {});
      }
      simplifiedGeometriesRef.current.get(geometryHash)![levelKey] = simplified;
      return simplified;
    }
    
    // For other geometries, create a custom simplified version
    let simplified: THREE.BufferGeometry;
    
    // Clone the original geometry as base
    simplified = originalGeometry.clone();
    
    // For complex geometries, perform a simplified decimation
    // by removing vertices based on the detail level
    if (detailLevel < 0.99 && originalGeometry.attributes.position) {
      const positions = originalGeometry.attributes.position;
      const indices = originalGeometry.index;
      
      // For indexed geometries, we can do a simplified decimation
      if (indices) {
        // Create a new index buffer with fewer indices
        const oldIndices = Array.from(indices.array);
        const indexCount = indices.count;
        const newIndexCount = Math.max(3, Math.floor(indexCount * detailLevel));
        const step = Math.max(1, Math.floor(indexCount / newIndexCount));
        
        // Create a new array with reduced indices
        const newIndices = [];
        for (let i = 0; i < indexCount; i += step) {
          newIndices.push(oldIndices[i]);
        }
        
        // Create a new index buffer and update the geometry
        const newIndex = new THREE.BufferAttribute(
          new Uint32Array(newIndices), 
          1
        );
        simplified.setIndex(newIndex);
      }
      // For non-indexed geometries, we can reduce vertex count
      else if (positions) {
        const vertexCount = positions.count;
        const newVertexCount = Math.max(3, Math.floor(vertexCount * detailLevel));
        const step = Math.max(1, Math.floor(vertexCount / newVertexCount));
        
        // Create new attribute arrays
        const newPositions = [];
        
        // Collect reduced vertices
        for (let i = 0; i < vertexCount; i += step) {
          const baseIndex = i * 3;
          newPositions.push(
            positions.array[baseIndex],
            positions.array[baseIndex + 1],
            positions.array[baseIndex + 2]
          );
        }
        
        // Update position attribute
        simplified.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(newPositions), 3)
        );
        
        // Remove other attributes that would now be misaligned
        const attributesToKeep = ['position'];
        for (const key in simplified.attributes) {
          if (!attributesToKeep.includes(key)) {
            simplified.deleteAttribute(key);
          }
        }
        
        // Compute normals for the simplified geometry
        simplified.computeVertexNormals();
      }
    }
    
    // Add a user data flag to track the detail level
    simplified.userData.detailLevel = detailLevel;
    
    // Make sure bounding information is up to date
    simplified.computeBoundingSphere();
    
    // Cache and return
    if (!simplifiedGeometriesRef.current.has(geometryHash)) {
      simplifiedGeometriesRef.current.set(geometryHash, {});
    }
    simplifiedGeometriesRef.current.get(geometryHash)![levelKey] = simplified;
    
    return simplified;
  }, [getGeometryHash]);
  
  // Updated statistics calculation
  const updateStatistics = useCallback(() => {
    if (!sceneRef.current || !isMountedRef.current) return;
    
    let highDetailCount = 0;
    let mediumDetailCount = 0;
    let lowDetailCount = 0;
    let culledCount = 0;
    let totalObjects = 0;
    let memorySaved = 0;
    let textureReductions = 0;
    let polygonsRemoved = 0;
    
    // Get all meshes to calculate statistics
    const meshes: THREE.Mesh[] = [];
    
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper) {
        totalObjects++;
        meshes.push(object);
        
        // Check current LOD level
        const currentLevel = currentLODLevelRef.current.get(object);
        
        if (currentLevel === 'high') {
          highDetailCount++;
        } else if (currentLevel === 'medium') {
          mediumDetailCount++;
          
          // Calculate polygon reduction
          const originalGeometry = originalGeometriesRef.current.get(object);
          if (originalGeometry && object.geometry) {
            const originalTriangles = getTriangleCount(originalGeometry);
            const currentTriangles = getTriangleCount(object.geometry);
            const reduced = Math.max(0, originalTriangles - currentTriangles);
            
            polygonsRemoved += reduced;
            memorySaved += reduced * 3 * 4; // 3 vertices per triangle, 4 bytes per vertex
          }
        } else if (currentLevel === 'low') {
          lowDetailCount++;
          
          // Calculate polygon reduction
          const originalGeometry = originalGeometriesRef.current.get(object);
          if (originalGeometry && object.geometry) {
            const originalTriangles = getTriangleCount(originalGeometry);
            const currentTriangles = getTriangleCount(object.geometry);
            const reduced = Math.max(0, originalTriangles - currentTriangles);
            
            polygonsRemoved += reduced;
            memorySaved += reduced * 3 * 4; // 3 vertices per triangle, 4 bytes per vertex
          }
          
          // Check for texture reductions
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => {
                if (material.userData.textureReduced) {
                  textureReductions++;
                }
              });
            } else if (object.material.userData.textureReduced) {
              textureReductions++;
            }
          }
        } else if (currentLevel === 'culled') {
          culledCount++;
          
          // Add full memory savings for culled objects
          const originalGeometry = originalGeometriesRef.current.get(object);
          if (originalGeometry) {
            const originalTriangles = getTriangleCount(originalGeometry);
            polygonsRemoved += originalTriangles;
            memorySaved += originalTriangles * 3 * 4; // Full savings
          }
        }
      }
    });
    
    // Calculate performance impact (rough estimate)
    const performanceImpact = Math.max(0, Math.min(100, 
      (highDetailCount * 1.0 + mediumDetailCount * 0.5 + lowDetailCount * 0.2) / 
      Math.max(1, totalObjects) * 100
    ));
    
    // Only update if significant changes or first update
    const lastStats = statistics;
    const hasSignificantChange = 
      Math.abs(highDetailCount - lastStats.highDetailObjects) > 2 ||
      Math.abs(mediumDetailCount - lastStats.mediumDetailObjects) > 2 ||
      Math.abs(lowDetailCount - lastStats.lowDetailObjects) > 2 ||
      Math.abs(culledCount - lastStats.culledObjects) > 2 ||
      Math.abs(memorySaved - lastStats.estimatedMemorySavedMB * 1024 * 1024) > 1024 * 1024;
    
    if (hasSignificantChange || lastStats.totalObjects === 0) {
      setStatistics({
        totalObjects,
        highDetailObjects: highDetailCount,
        mediumDetailObjects: mediumDetailCount,
        lowDetailObjects: lowDetailCount,
        culledObjects: culledCount,
        estimatedMemorySavedMB: memorySaved / (1024 * 1024),
        textureReductions,
        polygonsRemoved,
        lastUpdateTime: Date.now(),
        performanceImpact
      });
    }
  }, [sceneRef]);
  
  // Helper to count triangles in a geometry
  const getTriangleCount = useCallback((geometry: THREE.BufferGeometry): number => {
    if (!geometry) return 0;
    
    if (geometry.index) {
      return geometry.index.count / 3;
    } else if (geometry.attributes.position) {
      return geometry.attributes.position.count / 3;
    }
    
    return 0;
  }, []);
  
  // Update the LOD level of a mesh based on its distance from the camera
  const updateMeshLOD = useCallback((
    mesh: THREE.Mesh, 
    distance: number,
    distanceRatio: number // 0-1, normalized distance
  ): LodLevel => {
    // Skip meshes excluded from LOD
    if (mesh.userData.excludeFromLOD) {
      return 'high';
    }
    
    // Get the original geometry
    const originalGeometry = originalGeometriesRef.current.get(mesh);
    if (!originalGeometry) {
      return 'high';
    }
    
    // Current LOD level
    const currentLevel = currentLODLevelRef.current.get(mesh) || 'high';
    
    // Determine appropriate LOD level based on distance
    let newLevel: LodLevel;
    
    if (distance > config.cullingDistance!) {
      newLevel = 'culled';
      
      // Only update if level changed (reduces unnecessary operations)
      if (currentLevel !== 'culled') {
        mesh.visible = false;
      }
    } 
    else if (distance > config.mediumDetailThreshold!) {
      newLevel = 'low';
      
      // Only update if level changed or mesh was hidden
      if (currentLevel !== 'low' || !mesh.visible) {
        mesh.visible = true;
        
        // Apply low detail geometry
        const lowDetailGeometry = simplifyGeometry(originalGeometry, config.lowDetailReduction!);
        mesh.geometry = lowDetailGeometry;
        
        // Apply material optimizations
        if (config.optimizeMaterials) {
          // For very distant objects, simplify materials
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(mat => 
              simplifyMaterial(mat, distanceRatio)
            );
          } else if (mesh.material) {
            mesh.material = simplifyMaterial(mesh.material, distanceRatio);
          }
        }
        
        // Optimize textures
        if (config.optimizeTextures) {
          optimizeMeshTextures(mesh, distanceRatio);
        }
        
        // Apply wireframe if configured
        if (config.wireframeForDistant && mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if ('wireframe' in mat) (mat as THREE.MeshBasicMaterial).wireframe = true;
            });
          } else if ('wireframe' in mesh.material) {
            (mesh.material as THREE.MeshBasicMaterial).wireframe = true;
          }
        }
      }
    }
    else if (distance > config.highDetailThreshold!) {
      newLevel = 'medium';
      
      // Only update if level changed or mesh was hidden
      if (currentLevel !== 'medium' || !mesh.visible) {
        mesh.visible = true;
        
        // Apply medium detail geometry
        const mediumDetailGeometry = simplifyGeometry(originalGeometry, config.mediumDetailReduction!);
        mesh.geometry = mediumDetailGeometry;
        
        // Apply medium-level material optimizations if needed
        if (config.optimizeMaterials && distanceRatio > 0.3) {
          // For medium-distance objects, apply milder optimizations
          if (Array.isArray(mesh.material)) {
            // Just optimize textures for array materials
            if (config.optimizeTextures) {
              mesh.material.forEach(mat => {
                optimizeMaterialTextures(mat, distanceRatio * 0.7); // Less aggressive
              });
            }
          } else if (mesh.material) {
            if (config.optimizeTextures) {
              optimizeMaterialTextures(mesh.material, distanceRatio * 0.7);
            }
          }
        }
        
        // Remove wireframe if it was applied previously
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if ('wireframe' in mat) (mat as THREE.MeshBasicMaterial).wireframe = false;
            });
          } else if ('wireframe' in mesh.material) {
            (mesh.material as THREE.MeshBasicMaterial).wireframe = false;
          }
        }
      }
    }
    else {
      newLevel = 'high';
      
      // Only update if level changed or mesh was hidden
      if (currentLevel !== 'high' || !mesh.visible) {
        mesh.visible = true;
        
        // Restore original geometry
        mesh.geometry = originalGeometry;
        
        // Restore original material properties if needed
        if (config.optimizeMaterials || config.optimizeTextures) {
          restoreMaterial(mesh);
        }
      }
    }
    
    // Only update the current LOD level if it changed (reduces unnecessary updates)
    if (currentLevel !== newLevel) {
      currentLODLevelRef.current.set(mesh, newLevel);
    }
    
    return newLevel;
  }, [
    config.cullingDistance,
    config.mediumDetailThreshold,
    config.highDetailThreshold, 
    config.lowDetailReduction, 
    config.mediumDetailReduction, 
    config.wireframeForDistant,
    config.optimizeMaterials,
    config.optimizeTextures,
    simplifyGeometry,
    simplifyMaterial,
    optimizeMeshTextures,
    optimizeMaterialTextures,
    restoreMaterial
  ]);
  
  // Apply LOD to all objects in the scene with optimized distance calculation
  const applyLOD = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !config.enabled || !isMountedRef.current) return;
    
    const now = performance.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    // Skip update if we're updating too frequently and no forced update
    if (config.updateFrequency !== 0 && timeSinceLastUpdate < (config?.updateFrequency as unknown as number)) {
      return;
    }
    
    lastUpdateRef.current = now;
    
    const camera = cameraRef.current;
    const cameraPosition = camera.position.clone();
    const frustumCulling = config.frustumCullingMultiplier !== 0;
    
    // Use frustum culling if enabled
    let frustum: THREE.Frustum | null = null;
    if (frustumCulling) {
      // Create frustum from camera
      frustum = new THREE.Frustum();
      const projScreenMatrix = new THREE.Matrix4();
      projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      
      // Expand frustum slightly to avoid popping at edges
      if (config.frustumCullingMultiplier !== 1) {
        // Calculate a expanded frustum (approximate)
        // This is a simplified approach
        const matrix = projScreenMatrix.clone();
        const scalar = config.frustumCullingMultiplier!;
        matrix.elements[0] /= scalar;
        matrix.elements[5] /= scalar;
        frustum.setFromProjectionMatrix(matrix);
      } else {
        frustum.setFromProjectionMatrix(projScreenMatrix);
      }
    }
    
    // Get all meshes that need LOD updates
    const meshesToUpdate: THREE.Mesh[] = [];
    
    // Process all meshes in the scene
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper) {
        // Skip if object explicitly excludes LOD
        if (object.userData.excludeFromLOD) return;
        
        // Skip if not in frustum (broad-phase culling)
        if (frustum && frustumCulling) {
          const boundingSphere = getBoundingSphere(object);
          if (!frustum.intersectsSphere(boundingSphere)) {
            // Only update if currently visible
            if (object.visible) {
              object.visible = false;
              currentLODLevelRef.current.set(object, 'culled');
            }
            return;
          }
        }
        
        meshesToUpdate.push(object);
      }
    });
    
    // Process the meshes needing updates
    for (const mesh of meshesToUpdate) {
      // Calculate distance to camera - use center of bounding sphere for better accuracy
      const boundingSphere = getBoundingSphere(mesh);
      const distance = cameraPosition.distanceTo(boundingSphere.center) - boundingSphere.radius;
      
      // Calculate normalized distance ratio for gradual effects
      // 0 = closest (high detail), 1 = farthest (culled)
      const distanceRatio = Math.min(1, Math.max(0, 
        distance / Math.max(1, config.cullingDistance || 2000)
      ));
      
      // Update LOD for this mesh
      updateMeshLOD(mesh, distance, distanceRatio);
    }
    
    // Update statistics periodically (not every frame)
    if (now - statistics.lastUpdateTime > 1000) {
      updateStatistics();
    }
  }, [
    sceneRef, 
    cameraRef, 
    config.enabled,
    config.updateFrequency,
    config.frustumCullingMultiplier,
    config.cullingDistance,
    getBoundingSphere,
    updateMeshLOD,
    updateStatistics
  ]);
  
  // Clean up unused geometries to free memory
  const cleanupUnusedGeometries = useCallback(() => {
    if (!config.disposeUnusedGeometries) return;
    
    // This is an optimization to free memory periodically
    // Gather all geometries currently in use
    const usedGeometries = new Set<THREE.BufferGeometry>();
    
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          usedGeometries.add(object.geometry);
        }
      });
    }
    
    // Check simplified geometries cache and dispose unused ones
    for (const [hash, levelMap] of Array.from(simplifiedGeometriesRef.current.entries())) {
      for (const [level, geometry] of Object.entries(levelMap)) {
        if (!usedGeometries.has(geometry as THREE.BufferGeometry)) {
          (geometry as THREE.BufferGeometry).dispose();
          delete levelMap[level];
        }
      }
      
      // Remove empty hash entries
      if (Object.keys(levelMap).length === 0) {
        simplifiedGeometriesRef.current.delete(hash);
      }
    }
    
    // Free other caches of unused objects
    // Note: WeakMaps automatically handle this via garbage collection
  }, [config.disposeUnusedGeometries, sceneRef]);
  
  // Schedule LOD updates with optimized timer handling
  useEffect(() => {
    if (!config.enabled) return;
    
    isMountedRef.current = true;
    
    // Initialize LOD system
    initializeLOD();
    
    // Function to handle LOD update with RAF handling
    const updateLOD = () => {
      if (!isMountedRef.current) return;
      
      // Apply LOD
      applyLOD();
      
      // Schedule next update
      if (config.updateFrequency === 0) {
        // Update every frame
        frameIdRef.current = requestAnimationFrame(updateLOD);
      } else {
        // Update at specified interval using more efficient setTimeout + RAF
        // This approach reduces CPU usage when frequent updates aren't needed
        setTimeout(() => {
          if (isMountedRef.current) {
            frameIdRef.current = requestAnimationFrame(updateLOD);
          }
        }, config.updateFrequency);
      }
    };
    
    // Start updates
    frameIdRef.current = requestAnimationFrame(updateLOD);
    
    // Set up periodic cleanup for memory
    let cleanupInterval: NodeJS.Timeout | null = null;
    if (config.disposeUnusedGeometries) {
      cleanupInterval = setInterval(() => {
        if (isMountedRef.current) {
          cleanupUnusedGeometries();
        }
      }, 30000); // Clean every 30 seconds
    }
    
    // Clean up on unmount
    return () => {
      isMountedRef.current = false;
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
      
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
      
      // Restore original geometries to avoid memory leaks
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            const originalGeometry = originalGeometriesRef.current.get(object);
            if (originalGeometry) {
              // Only swap geometry if they're different to avoid unnecessary work
              if (object.geometry !== originalGeometry) {
                object.geometry = originalGeometry;
              }
              
              // Restore material properties
              if (config.optimizeMaterials || config.optimizeTextures) {
                restoreMaterial(object);
              }
            }
          }
        });
      }
      
      // Clean up caches
      // WeakMaps will be garbage collected automatically
      simplifiedGeometriesRef.current.clear();
      
      // Final cleanup of unused resources
      cleanupUnusedGeometries();
    };
  }, [
    config.enabled, 
    config.updateFrequency,
    config.disposeUnusedGeometries,
    config.optimizeMaterials,
    config.optimizeTextures,
    initializeLOD, 
    applyLOD,
    cleanupUnusedGeometries,
    restoreMaterial,
    sceneRef
  ]);
  
  // Handle visibility change (tab switching) with more efficient event handling
  useEffect(() => {
    let visibilityTimeout: NodeJS.Timeout | null = null;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Cancel animation frame when hidden
        if (frameIdRef.current) {
          cancelAnimationFrame(frameIdRef.current);
          frameIdRef.current = 0;
        }
        
        // Clear any pending visibility timeout
        if (visibilityTimeout) {
          clearTimeout(visibilityTimeout);
          visibilityTimeout = null;
        }
      } else {
        // Small delay to avoid rapid visibility changes causing issues
        visibilityTimeout = setTimeout(() => {
          // Resume updates when visible again
          if (!frameIdRef.current && isMountedRef.current && config.enabled) {
            const updateLOD = () => {
              if (!isMountedRef.current) return;
              
              applyLOD();
              
              // Schedule next update
              if (config.updateFrequency === 0) {
                frameIdRef.current = requestAnimationFrame(updateLOD);
              } else {
                setTimeout(() => {
                  if (isMountedRef.current) {
                    frameIdRef.current = requestAnimationFrame(updateLOD);
                  }
                }, config.updateFrequency);
              }
            };
            
            frameIdRef.current = requestAnimationFrame(updateLOD);
          }
          
          visibilityTimeout = null;
        }, 100); // Small delay to debounce visibility changes
      }
    };
    
    // Use the Page Visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
    };
  }, [config.enabled, config.updateFrequency, applyLOD]);
  
  // Force an immediate LOD update with debouncing
  const updateLODNow = useCallback(() => {
    if (config.enabled) {
      // Cancel any pending animation frame
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      
      // Schedule immediate update
      frameIdRef.current = requestAnimationFrame(() => {
        applyLOD();
        
        // Resume normal updates
        const resumeUpdates = () => {
          if (!isMountedRef.current) return;
          
          applyLOD();
          
          // Schedule next update based on config
          if (config.updateFrequency === 0) {
            frameIdRef.current = requestAnimationFrame(resumeUpdates);
          } else {
            setTimeout(() => {
              if (isMountedRef.current) {
                frameIdRef.current = requestAnimationFrame(resumeUpdates);
              }
            }, config.updateFrequency);
          }
        };
        
        frameIdRef.current = requestAnimationFrame(resumeUpdates);
      });
    }
  }, [config.enabled, config.updateFrequency, applyLOD]);
  
  // Restore all objects to high detail temporarily with optimized memory handling
  const temporarilyRestoreFullDetail = useCallback(() => {
    if (!sceneRef.current) return null;
    
    // Store current state more efficiently using WeakMap
    const previousStates = new WeakMap<THREE.Mesh, LodLevel>();
    
    // Gather meshes that need restoration
    const meshesToRestore: THREE.Mesh[] = [];
    
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.excludeFromLOD) {
        const currentLevel = currentLODLevelRef.current.get(object);
        if (currentLevel && currentLevel !== 'high') {
          previousStates.set(object, currentLevel);
          meshesToRestore.push(object);
        }
      }
    });
    
    // Restore all objects to high detail
    for (const mesh of meshesToRestore) {
      const originalGeometry = originalGeometriesRef.current.get(mesh);
      if (originalGeometry) {
        mesh.geometry = originalGeometry;
        mesh.visible = true;
        
        // Remove wireframe if it was applied
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if ('wireframe' in mat) (mat as THREE.MeshBasicMaterial).wireframe = false;
            });
          } else if ('wireframe' in mesh.material) {
            (mesh.material as THREE.MeshBasicMaterial).wireframe = false;
          }
        }
        
        // Restore original material properties
        if (config.optimizeMaterials || config.optimizeTextures) {
          restoreMaterial(mesh);
        }
        
        // Update LOD level tracking
        currentLODLevelRef.current.set(mesh, 'high');
      }
    }
    
    // Return function to restore previous LOD state
    return () => {
      if (!sceneRef.current || !isMountedRef.current) return;
      
      // Only restore meshes that were previously changed
      for (const mesh of meshesToRestore) {
        if (!previousStates.has(mesh)) continue;
        
        const previousLevel = previousStates.get(mesh)!;
        const originalGeometry = originalGeometriesRef.current.get(mesh);
        
        if (originalGeometry) {
          // Apply previous LOD level
          switch (previousLevel) {
            case 'medium':
              const mediumDetailGeometry = simplifyGeometry(originalGeometry, config.mediumDetailReduction!);
              mesh.geometry = mediumDetailGeometry;
              mesh.visible = true;
              break;
            case 'low':
              const lowDetailGeometry = simplifyGeometry(originalGeometry, config.lowDetailReduction!);
              mesh.geometry = lowDetailGeometry;
              
              // Apply wireframe if configured
              if (config.wireframeForDistant && mesh.material) {
                if (Array.isArray(mesh.material)) {
                  mesh.material.forEach(mat => {
                    if ('wireframe' in mat) (mat as THREE.MeshBasicMaterial).wireframe = true;
                  });
                } else if ('wireframe' in mesh.material) {
                  (mesh.material as THREE.MeshBasicMaterial).wireframe = true;
                }
              }
              
              mesh.visible = true;
              break;
            case 'culled':
              mesh.visible = false;
              break;
          }
          
          // Restore LOD level tracking
          currentLODLevelRef.current.set(mesh, previousLevel);
        }
      }
      
      // Force a statistics update
      setTimeout(() => {
        if (isMountedRef.current) {
          updateStatistics();
        }
      }, 0);
    };
  }, [
    sceneRef, 
    simplifyGeometry, 
    config.mediumDetailReduction, 
    config.lowDetailReduction, 
    config.wireframeForDistant,
    config.optimizeMaterials,
    config.optimizeTextures,
    restoreMaterial,
    updateStatistics
  ]);
  
  return {
    applyLOD: updateLODNow,
    statistics,
    temporarilyRestoreFullDetail,
  };
};

export default useLOD;