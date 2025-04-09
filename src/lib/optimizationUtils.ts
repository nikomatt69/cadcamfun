import * as THREE from 'three';

/**
 * Utility functions for optimizing Three.js rendering performance
 * These optimizations are crucial for CAD applications with complex scenes
 */

/**
 * Performance settings that can be adjusted based on hardware capabilities
 */
export interface PerformanceSettings {
  simplificationThreshold: number;     // Distance threshold for LOD
  maxDetailDistance: number;           // Maximum distance to show high detail 
  frustumCullingEnabled: boolean;      // Enable/disable frustum culling
  instancedMeshEnabled: boolean;       // Use instanced meshes for repeated objects
  maxTextureSize: number;              // Maximum texture size
  disableShadowsDistance: number;      // Distance at which to disable shadows
  mergeGeometryThreshold: number;      // Threshold for merging similar geometries
  mergeMaterialThreshold: number;      // Threshold for merging similar materials
  useCompressedGeometries: boolean;    // Use compressed geometries where possible
  maxPolygonsPerObject: number;        // Maximum polygons per object before LOD
}

// Default performance settings
export const defaultPerformanceSettings: PerformanceSettings = {
  simplificationThreshold: 100,
  maxDetailDistance: 500,
  frustumCullingEnabled: true,
  instancedMeshEnabled: true,
  maxTextureSize: 2048,
  disableShadowsDistance: 500,
  mergeGeometryThreshold: 1000,
  mergeMaterialThreshold: 20,
  useCompressedGeometries: true,
  maxPolygonsPerObject: 50000
};

/**
 * Optimize a Three.js scene for better performance
 */
export function optimizeScene(
  scene: THREE.Scene, 
  settings: Partial<PerformanceSettings> = {}
): void {
  // Merge settings with defaults
  const mergedSettings = { ...defaultPerformanceSettings, ...settings };
  
  // Apply optimizations
  applyFrustumCulling(scene, mergedSettings.frustumCullingEnabled);
  consolidateMaterials(scene, mergedSettings.mergeMaterialThreshold);
  analyzeAndOptimizeGeometries(scene, mergedSettings);
  setupLOD(scene, mergedSettings);
  optimizeTextures(scene, mergedSettings.maxTextureSize);
  setupShadowOptimizations(scene, mergedSettings.disableShadowsDistance);
}

/**
 * Dispose of Three.js resources to prevent memory leaks
 */
export function disposeObject(object: THREE.Object3D): void {
  // Dispose of geometry
  if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
    if (object.geometry) {
      object.geometry.dispose();
    }
    
    // Dispose of material(s)
    if (object.material) {
      disposeMaterial(object.material);
    }
  }
  
  // Recursively dispose of children
  const children = [...object.children];
  for (const child of children) {
    disposeObject(child);
  }
}

/**
 * Dispose of material and its textures
 */
export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  
  // Dispose of material
  material.dispose();
  
  // Dispose of textures
  for (const propertyName in material) {
    const propertyValue = (material as any)[propertyName];
    
    if (propertyValue instanceof THREE.Texture) {
      propertyValue.dispose();
    }
  }
}

/**
 * Apply frustum culling to all objects in the scene
 */
function applyFrustumCulling(scene: THREE.Scene, enabled: boolean): void {
  scene.traverse((object) => {
    object.frustumCulled = enabled;
  });
}

/**
 * Consolidate similar materials to reduce draw calls
 */
function consolidateMaterials(scene: THREE.Scene, threshold: number): void {
  // Material cache
  const materialCache: Map<string, THREE.Material> = new Map();
  
  // Helper to generate a material key based on properties
  function getMaterialKey(material: THREE.Material): string {
    if (material instanceof THREE.MeshStandardMaterial) {
      return `standard_${material.color.getHex()}_${material.roughness}_${material.metalness}_${material.wireframe}`;
    } else if (material instanceof THREE.MeshBasicMaterial) {
      return `basic_${material.color.getHex()}_${material.wireframe}`;
    } else if (material instanceof THREE.LineBasicMaterial) {
      return `line_${material.color.getHex()}_${material.linewidth}`;
    } else {
      // Fallback for other material types
      return material.type + '_' + material.uuid;
    }
  }
  
  // Track material reduction
  let materialsBefore = 0;
  let materialsAfter = 0;
  
  // Process the scene
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      materialsBefore++;
      
      // Handle array of materials
      if (Array.isArray(object.material)) {
        materialsBefore += object.material.length - 1;
        
        object.material = object.material.map(mat => {
          const key = getMaterialKey(mat);
          
          if (!materialCache.has(key)) {
            materialCache.set(key, mat);
            materialsAfter++;
            return mat;
          } else {
            return materialCache.get(key)!;
          }
        });
      } 
      // Handle single material
      else if (object.material) {
        const key = getMaterialKey(object.material);
        
        if (!materialCache.has(key)) {
          materialCache.set(key, object.material);
          materialsAfter++;
        } else {
          object.material = materialCache.get(key)!;
        }
      }
    }
  });
  
  // Log the reduction if it meets the threshold
  if (materialsBefore - materialsAfter >= threshold) {
    console.log(`Material optimization: Reduced from ${materialsBefore} to ${materialsAfter} materials`);
  }
}

/**
 * Analyze and optimize geometries in the scene
 */
function analyzeAndOptimizeGeometries(
  scene: THREE.Scene, 
  settings: PerformanceSettings
): void {
  const geometryCache: Map<string, THREE.BufferGeometry> = new Map();
  const geometryCounts: Map<string, number> = new Map();
  const highPolyObjects: THREE.Mesh[] = [];
  
  // First pass: analyze geometries
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry as THREE.BufferGeometry;
      
      // Skip non-buffer geometries
      if (!(geometry instanceof THREE.BufferGeometry)) return;
      
      // Count triangles
      let triangleCount = 0;
      if (geometry.index) {
        triangleCount = geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangleCount = geometry.attributes.position.count / 3;
      }
      
      // Identify high-poly objects for LOD
      if (triangleCount > settings.maxPolygonsPerObject) {
        highPolyObjects.push(object);
      }
      
      // Create a unique key for the geometry
      const key = `${geometry.uuid}_${triangleCount}`;
      geometryCounts.set(key, (geometryCounts.get(key) || 0) + 1);
    }
  });
  
  // Second pass: optimize geometries
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry as THREE.BufferGeometry;
      
      // Skip non-buffer geometries
      if (!(geometry instanceof THREE.BufferGeometry)) return;
      
      // Create a unique key for the geometry
      const key = `${geometry.uuid}_${geometry.attributes.position.count}`;
      
      // If this geometry appears multiple times, reuse it
      if (geometryCounts.get(key)! > 1) {
        if (!geometryCache.has(key)) {
          // Store the first instance in the cache
          geometryCache.set(key, geometry);
        } else {
          // Reuse cached geometry
          object.geometry = geometryCache.get(key)!;
        }
      }
      
      // Optimize buffer attributes
      if (settings.useCompressedGeometries) {
        // Use the most efficient buffer types
        compressGeometryBuffers(geometry);
      }
      
      // Remove unused attributes
      optimizeGeometryAttributes(geometry, object.material);
    }
  });
  
  // Third pass: setup LOD for high-poly objects
  if (highPolyObjects.length > 0) {
    console.log(`Setting up LOD for ${highPolyObjects.length} high-poly objects`);
    
    highPolyObjects.forEach(object => {
      createLODForObject(object, scene, settings);
    });
  }
}

/**
 * Compress geometry buffers to use the most efficient format
 */
function compressGeometryBuffers(geometry: THREE.BufferGeometry): void {
  // Skip if already optimized
  if (geometry.userData.optimized) return;
  
  // Optimize position attribute
  if (geometry.attributes.position) {
    const positions = geometry.attributes.position;
    
    // Check if we can use a smaller data type based on the range of values
    if (positions.array instanceof Float32Array) {
      // Check range of values
      let minVal = Infinity;
      let maxVal = -Infinity;
      
      for (let i = 0; i < positions.array.length; i++) {
        const val = positions.array[i];
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
      }
      
      // If values are within the range of Int16, convert to save memory
      if (minVal > -32768 && maxVal < 32767) {
        // Scale values to maximize precision
        const scale = Math.max(Math.abs(minVal), Math.abs(maxVal));
        const scaleFactor = 32767 / scale;
        
        // Create Int16 buffer
        const int16Array = new Int16Array(positions.array.length);
        
        for (let i = 0; i < positions.array.length; i++) {
          int16Array[i] = Math.round(positions.array[i] * scaleFactor);
        }
        
        // Replace the attribute
        geometry.setAttribute('position', new THREE.BufferAttribute(
          int16Array,
          positions.itemSize,
          true  // normalized
        ));
        
        // Store scale factor to convert back when needed
        geometry.userData.positionScale = 1 / scaleFactor;
      }
    }
  }
  
  // Optimize normal attribute
  if (geometry.attributes.normal) {
    // Normals can always be represented as normalized byte values
    // since they're unit vectors (values between -1 and 1)
    const normals = geometry.attributes.normal;
    const int8Array = new Int8Array(normals.array.length);
    
    for (let i = 0; i < normals.array.length; i++) {
      int8Array[i] = Math.round(normals.array[i] * 127);
    }
    
    geometry.setAttribute('normal', new THREE.BufferAttribute(
      int8Array,
      normals.itemSize,
      true  // normalized
    ));
  }
  
  // Optimize UV attribute
  if (geometry.attributes.uv) {
    // UVs are in the range [0, 1], can use Uint16
    const uvs = geometry.attributes.uv;
    const uint16Array = new Uint16Array(uvs.array.length);
    
    for (let i = 0; i < uvs.array.length; i++) {
      uint16Array[i] = Math.round(uvs.array[i] * 65535);
    }
    
    geometry.setAttribute('uv', new THREE.BufferAttribute(
      uint16Array,
      uvs.itemSize,
      true  // normalized
    ));
  }
  
  // Mark as optimized
  geometry.userData.optimized = true;
}

/**
 * Remove unused attributes from a geometry
 */
function optimizeGeometryAttributes(
  geometry: THREE.BufferGeometry, 
  material: THREE.Material | THREE.Material[]
): void {
  // Convert to array for convenience
  const materials = Array.isArray(material) ? material : [material];
  
  // Remove normal attributes if flat shading or basic material
  const needsNormals = materials.some(mat => {
    if (mat instanceof THREE.MeshBasicMaterial) return false;
    if (mat instanceof THREE.MeshLambertMaterial) return true;
    if (mat instanceof THREE.MeshPhongMaterial) return true;
    if (mat instanceof THREE.MeshStandardMaterial) return true;
    return false;
  });
  
  if (!needsNormals && geometry.attributes.normal) {
    geometry.deleteAttribute('normal');
  }
  
  // Remove UV attributes if no texture is used
  const needsUVs = materials.some(mat => {
    if (mat instanceof THREE.MeshBasicMaterial) return !!mat.map;
    if (mat instanceof THREE.MeshLambertMaterial) return !!mat.map;
    if (mat instanceof THREE.MeshPhongMaterial) return !!mat.map;
    if (mat instanceof THREE.MeshStandardMaterial) {
      return !!(mat.map || mat.bumpMap || mat.normalMap || 
                mat.displacementMap || mat.roughnessMap || mat.metalnessMap);
    }
    return false;
  });
  
  if (!needsUVs && geometry.attributes.uv) {
    geometry.deleteAttribute('uv');
  }
  
  // Remove color attributes if not used
  const needsColors = materials.some(mat => {
    if ('vertexColors' in mat) {
      return (mat as any).vertexColors === true;
    }
    return false;
  });
  
  if (!needsColors && geometry.attributes.color) {
    geometry.deleteAttribute('color');
  }
}

/**
 * Create levels of detail (LOD) for a high-polygon object
 */
function createLODForObject(
  object: THREE.Mesh, 
  scene: THREE.Scene, 
  settings: PerformanceSettings
): void {
  // Skip if object already has LOD
  if (object.parent instanceof THREE.LOD) return;
  
  // Create LOD object
  const lod = new THREE.LOD();
  
  // Get object's world position
  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);
  lod.position.copy(worldPosition);
  
  // Reset object's position as it will be relative to LOD
  object.position.set(0, 0, 0);
  
  // Add original high-detail object as level 0
  lod.addLevel(object, 0);
  
  // Create medium detail version
  const mediumDetailGeometry = simplifyGeometry(object.geometry, 0.5);
  const mediumDetailMesh = new THREE.Mesh(mediumDetailGeometry, object.material);
  lod.addLevel(mediumDetailMesh, settings.maxDetailDistance / 2);
  
  // Create low detail version
  const lowDetailGeometry = simplifyGeometry(object.geometry, 0.2);
  const lowDetailMesh = new THREE.Mesh(lowDetailGeometry, object.material);
  lod.addLevel(lowDetailMesh, settings.maxDetailDistance);
  
  // Replace original object with LOD in the scene
  if (object.parent) {
    const parent = object.parent;
    const index = parent.children.indexOf(object);
    
    if (index !== -1) {
      parent.children.splice(index, 1, lod);
      lod.updateMatrix();
      lod.matrixAutoUpdate = true;
    }
  } else {
    // Add to scene if no parent
    scene.add(lod);
  }
}

/**
 * Simplify a geometry by reducing the number of triangles
 */
function simplifyGeometry(
  geometry: THREE.BufferGeometry, 
  reductionRatio: number
): THREE.BufferGeometry {
  // For proper geometry simplification, use an external library like SimplifyModifier
  // This implementation creates a simplified proxy geometry based on the object type
  
  // Clone the geometry first
  const simplified = geometry.clone();
  
  // Check if we can identify common geometry types
  // For each type, create a simplified version with fewer segments
  if (geometry.userData.type === 'BoxGeometry') {
    // Assume original had segments > 1
    return new THREE.BoxGeometry(
      geometry.userData.width || 1,
      geometry.userData.height || 1,
      geometry.userData.depth || 1,
      1, 1, 1  // Minimum segments
    );
  } 
  else if (geometry.userData.type === 'SphereGeometry') {
    const segments = Math.max(4, Math.floor((geometry.userData.widthSegments || 16) * reductionRatio));
    return new THREE.SphereGeometry(
      geometry.userData.radius || 1,
      segments,
      Math.max(4, Math.floor(segments / 2))
    );
  }
  else if (geometry.userData.type === 'CylinderGeometry') {
    const segments = Math.max(4, Math.floor((geometry.userData.radialSegments || 16) * reductionRatio));
    return new THREE.CylinderGeometry(
      geometry.userData.radiusTop || 1,
      geometry.userData.radiusBottom || 1,
      geometry.userData.height || 1,
      segments
    );
  }
  
  // Fallback: Just return the original geometry for now
  // In a real implementation, you'd use a mesh simplification algorithm
  return simplified;
}

/**
 * Setup LOD (Level of Detail) for the entire scene
 */
function setupLOD(scene: THREE.Scene, settings: PerformanceSettings): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && !object.userData.noLOD) {
      // Skip if already part of an LOD setup
      if (object.parent instanceof THREE.LOD) return;
      
      // Count polygons
      let polyCount = 0;
      
      if (object.geometry.index) {
        polyCount = object.geometry.index.count / 3;
      } else if (object.geometry.attributes.position) {
        polyCount = object.geometry.attributes.position.count / 3;
      }
      
      // Only create LOD for objects with more than the threshold polygons
      if (polyCount > settings.maxPolygonsPerObject) {
        createLODForObject(object, scene, settings);
      }
    }
  });
}

/**
 * Optimize textures in the scene to reduce memory usage
 */
function optimizeTextures(scene: THREE.Scene, maxTextureSize: number): void {
  const processedTextures = new Set<THREE.Texture>();
  
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    
    const materials = Array.isArray(object.material) 
      ? object.material 
      : [object.material];
    
    materials.forEach(material => {
      // Skip empty materials
      if (!material) return;
      
      // Process all texture maps
      const textureMaps = [
        'map', 'bumpMap', 'normalMap', 'displacementMap',
        'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap',
        'emissiveMap', 'specularMap', 'envMap', 'lightMap'
      ];
      
      textureMaps.forEach(mapName => {
        const texture = (material as any)[mapName] as THREE.Texture;
        
        if (texture && !processedTextures.has(texture)) {
          processedTextures.add(texture);
          
          // Optimize the texture
          optimizeTexture(texture, maxTextureSize);
        }
      });
    });
  });
}

/**
 * Optimize a single texture
 */
function optimizeTexture(texture: THREE.Texture, maxTextureSize: number): void {
  // Skip if already optimized
  if (texture.userData.optimized) return;
  
  // Set appropriate filter for mipmaps
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  
  // Generate mipmaps by default
  texture.generateMipmaps = true;
  
  // Set anisotropy if supported
  const renderer = new THREE.WebGLRenderer();
  const capabilities = renderer.capabilities;
  if (capabilities.getMaxAnisotropy) {
    texture.anisotropy = capabilities.getMaxAnisotropy();
  }
  renderer.dispose();
  
  // Consider downscaling large textures
  if (texture.image && 
      (texture.image.width > maxTextureSize || texture.image.height > maxTextureSize)) {
    // In a real app, you'd resize the image dynamically
    // For now, just warn about large textures
    console.warn(`Large texture detected: ${texture.image.width}x${texture.image.height}`);
  }
  
  // Mark as optimized
  texture.userData.optimized = true;
}

/**
 * Optimize shadows in the scene
 */
function setupShadowOptimizations(scene: THREE.Scene, disableShadowsDistance: number): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Light) {
      if (object.castShadow) {
        // Optimize shadow map settings
        if (object.shadow) {
          // Reasonable shadow map size for balance of quality and performance
          object.shadow.mapSize.width = 1024;
          object.shadow.mapSize.height = 1024;
          
          // Optimize shadow camera frustum
          if (object instanceof THREE.DirectionalLight || 
              object instanceof THREE.SpotLight) {
            
            object.shadow.bias = -0.001; // Adjust to prevent shadow acne
            
            // For directional lights, set reasonable shadow camera bounds
            if (object instanceof THREE.DirectionalLight) {
              const shadowSize = 100; // Size of area to cast shadows
              object.shadow.camera.left = -shadowSize;
              object.shadow.camera.right = shadowSize;
              object.shadow.camera.top = shadowSize;
              object.shadow.camera.bottom = -shadowSize;
              object.shadow.camera.near = 1;
              object.shadow.camera.far = 500;
            }
          }
        }
      }
    }
    else if (object instanceof THREE.Mesh) {
      // Store original shadow settings
      if (object.castShadow) {
        object.userData.originalCastShadow = true;
      }
      
      if (object.receiveShadow) {
        object.userData.originalReceiveShadow = true;
      }
    }
  });
  
  // Create a function to update shadow casting based on camera distance
  const updateShadowsBasedOnDistance = (camera: THREE.Camera) => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      
      // Skip objects that never cast shadows
      if (object.userData.originalCastShadow !== true &&
          object.userData.originalReceiveShadow !== true) {
        return;
      }
      
      // Calculate distance to camera
      const cameraPosition = new THREE.Vector3();
      camera.getWorldPosition(cameraPosition);
      
      const objectPosition = new THREE.Vector3();
      object.getWorldPosition(objectPosition);
      
      const distance = cameraPosition.distanceTo(objectPosition);
      
      // Disable shadows for distant objects
      if (distance > disableShadowsDistance) {
        object.castShadow = false;
        object.receiveShadow = false;
      } else {
        object.castShadow = !!object.userData.originalCastShadow;
        object.receiveShadow = !!object.userData.originalReceiveShadow;
      }
    });
  };
  
  // Store the update function for later use
  scene.userData.updateShadowsBasedOnDistance = updateShadowsBasedOnDistance;
}

/**
 * Create instanced meshes for repeated geometries
 */
export function createInstancedMeshes(scene: THREE.Scene): void {
  // Map to store geometry/material combinations
  const instanceableObjects: Map<string, THREE.Mesh[]> = new Map();
  
  // First pass: identify instanceable objects
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    
    // Skip already instanced meshes
    if (object instanceof THREE.InstancedMesh) return;
    
    // Skip objects with custom properties
    if (object.userData.noInstancing) return;
    
    // Create a key using geometry and material
    const geometryId = object.geometry.uuid;
    let materialId: string;
    
    if (Array.isArray(object.material)) {
      // Skip multi-material objects for now
      return;
    } else {
      materialId = object.material.uuid;
    }
    
    const key = `${geometryId}_${materialId}`;
    
    // Add to the map
    if (!instanceableObjects.has(key)) {
      instanceableObjects.set(key, []);
    }
    
    instanceableObjects.get(key)!.push(object);
  });
  // Second pass: create instanced meshes
  for (const [key, objects] of Array.from(instanceableObjects.entries())) {
    // Only create instances if we have more than one object
    if (objects.length < 2) continue;
    
    const template = objects[0];
    const geometry = template.geometry;
    const material = template.material as THREE.Material;
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      objects.length
    );
    
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    
    // Set transforms for each instance
    const matrix = new THREE.Matrix4();
    objects.forEach((object: THREE.Mesh, i: number) => {
      object.updateWorldMatrix(true, false);
      matrix.copy(object.matrixWorld);
      instancedMesh.setMatrixAt(i, matrix);
      // Copy some important userData if present
      if (object.userData.id) {
        if (!instancedMesh.userData.instanceIds) {
          instancedMesh.userData.instanceIds = [];
        }
        instancedMesh.userData.instanceIds[i] = object.userData.id;
      }
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    
    // Add the instanced mesh to the scene
    scene.add(instancedMesh);
    
    // Remove original objects
    objects.forEach(object => {
      if (object.parent) {
        object.parent.remove(object);
      }
    });
    
    console.log(`Created instanced mesh with ${objects.length} instances for geometry ${key}`);
  }
}

/**
 * Updates objects based on LOD and frustum culling
 * Call this function in your render loop
 */
export function updateSceneDynamicOptimizations(
  scene: THREE.Scene, 
  camera: THREE.Camera
): void {
  // Update LOD
  if (scene.userData.updateShadowsBasedOnDistance) {
    scene.userData.updateShadowsBasedOnDistance(camera);
  }
  
  // Additional dynamic optimizations could be added here
  // For example, occlusion culling or level streaming
}

/**
 * Performs a scene analysis and returns optimization suggestions
 */
export function analyzeScene(scene: THREE.Scene): {
  suggestions: string[],
  stats: {
    objectCount: number,
    triangleCount: number,
    materialCount: number,
    textureCount: number,
    lightCount: number,
    highPolyCount: number,
    shadowCasterCount: number
  }
} {
  const stats = {
    objectCount: 0,
    triangleCount: 0,
    materialCount: 0,
    textureCount: 0,
    lightCount: 0,
    highPolyCount: 0,
    shadowCasterCount: 0
  };
  
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const suggestions: string[] = [];
  
  // Traverse the scene to collect statistics
  scene.traverse((object) => {
    stats.objectCount++;
    
    if (object instanceof THREE.Mesh) {
      // Count triangles
      let triangles = 0;
      if (object.geometry.index) {
        triangles = object.geometry.index.count / 3;
      } else if (object.geometry.attributes.position) {
        triangles = object.geometry.attributes.position.count / 3;
      }
      
      stats.triangleCount += triangles;
      
      if (triangles > 10000) {
        stats.highPolyCount++;
      }
      
      // Count materials
      if (Array.isArray(object.material)) {
        object.material.forEach(mat => materials.add(mat));
      } else if (object.material) {
        materials.add(object.material);
      }
      
      // Count shadow casters
      if (object.castShadow) {
        stats.shadowCasterCount++;
      }
    }
    
    if (object instanceof THREE.Light) {
      stats.lightCount++;
    }
  });
  
  stats.materialCount = materials.size;
  
  // Collect textures
  materials.forEach(material => {
    const textureMaps = [
      'map', 'bumpMap', 'normalMap', 'displacementMap',
      'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap',
      'emissiveMap', 'specularMap', 'envMap', 'lightMap'
    ];
    
    textureMaps.forEach(mapName => {
      const texture = (material as any)[mapName] as THREE.Texture;
      if (texture) {
        textures.add(texture);
        
        // Check texture size
        if (texture.image && 
            (texture.image.width > 2048 || texture.image.height > 2048)) {
          suggestions.push(`Large texture detected: ${texture.image.width}x${texture.image.height}. Consider resizing.`);
        }
      }
    });
  });
  
  stats.textureCount = textures.size;
  
  // Generate optimization suggestions
  if (stats.triangleCount > 1000000) {
    suggestions.push(`High triangle count (${stats.triangleCount.toLocaleString()}). Consider using LOD.`);
  }
  
  if (stats.materialCount > 50) {
    suggestions.push(`High material count (${stats.materialCount}). Consider consolidating similar materials.`);
  }
  
  if (stats.lightCount > 4) {
    suggestions.push(`Many lights (${stats.lightCount}). Consider reducing light count or using light probes.`);
  }
  
  if (stats.shadowCasterCount > 20) {
    suggestions.push(`Many shadow casters (${stats.shadowCasterCount}). Consider limiting shadow casting to important objects.`);
  }
  
  if (stats.highPolyCount > 10) {
    suggestions.push(`${stats.highPolyCount} high-poly objects detected. Consider geometry simplification.`);
  }
  
  return { suggestions, stats };
}

/**
 * Create a merged geometry for static objects sharing the same material
 */
export function mergeStaticGeometries(
  scene: THREE.Scene, 
  options: { preserveUserData?: boolean } = {}
): void {
  // Map of material ID to geometries
  const materialToGeometries: Map<string, {
    geometries: THREE.BufferGeometry[],
    objects: THREE.Mesh[],
    material: THREE.Material
  }> = new Map();
  
  // Collect geometries by material
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    
    // Skip objects marked as non-mergeable
    if (object.userData.noMerge) return;
    
    // Skip objects with different transformations
    if (object.userData.animated) return;
    
    // Skip non-static objects
    if (object.matrixAutoUpdate) return;
    
    // Handle only single material objects for now
    if (Array.isArray(object.material)) return;
    
    const material = object.material as THREE.Material;
    const materialId = material.uuid;
    
    // Create entry if it doesn't exist
    if (!materialToGeometries.has(materialId)) {
      materialToGeometries.set(materialId, {
        geometries: [],
        objects: [],
        material
      });
    }
    
    // Clone and transform the geometry to world space
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    
    materialToGeometries.get(materialId)!.geometries.push(geometry);
    materialToGeometries.get(materialId)!.objects.push(object);
  });
  // Merge geometries for each material
  for (const [materialId, data] of Array.from(materialToGeometries)) {
    if (data.geometries.length < 2) continue; // Skip if only one geometry
    
    try {
      // Create merged BufferGeometry
      const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(data.geometries);
      
      // Create a mesh with the merged geometry
      const mergedMesh = new THREE.Mesh(mergedGeometry, data.material);
      mergedMesh.castShadow = data.objects[0].castShadow;
      mergedMesh.receiveShadow = data.objects[0].receiveShadow;
      
      // Preserve userData if required
      if (options.preserveUserData) {
        mergedMesh.userData.originalObjects = data.objects.map(obj => {
          return {
            id: obj.userData.id,
            userData: { ...obj.userData }
          };
        });
      }
      
      mergedMesh.userData.isMerged = true;
      
      // Add to scene
      scene.add(mergedMesh);
      
      // Remove original objects
      data.objects.forEach(object => {
        if (object.parent) {
          object.parent.remove(object);
        }
      });
      
      console.log(`Merged ${data.geometries.length} geometries with material ${materialId}`);
    } catch (error) {
      console.error(`Failed to merge geometries for material ${materialId}:`, error);
    }
  }
}

// Stub for BufferGeometryUtils since it's an imported module in Three.js
const BufferGeometryUtils = {
  mergeBufferGeometries: (geometries: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    // This is a simplified stub implementation
    // In a real implementation, you would import THREE/examples/jsm/utils/BufferGeometryUtils.js
    const mergedGeometry = new THREE.BufferGeometry();
    
    // Initialize arrays for all attributes
    const attributes: Record<string, {
      array: number[],
      itemSize: number
    }> = {};
    
    // Find all attributes and initialize arrays
    geometries.forEach(geometry => {
      for (const name in geometry.attributes) {
        if (!attributes[name]) {
          attributes[name] = {
            array: [],
            itemSize: geometry.attributes[name].itemSize
          };
        }
      }
    });
    
    // Merge all attributes
    geometries.forEach(geometry => {
      let indexOffset = 0;
      
      // For each attribute in this geometry
      for (const name in attributes) {
        const attrib = geometry.attributes[name];
        if (attrib) {
          const array = attrib.array;
          const itemSize = attrib.itemSize;
          
          for (let i = 0; i < array.length; i++) {
            attributes[name].array.push(array[i]);
          }
        }
      }
      
      // Update index offset
      if (geometry.attributes.position) {
        indexOffset += geometry.attributes.position.count;
      }
    });
    
    // Set attributes in merged geometry
    for (const name in attributes) {
      const attr = attributes[name];
      const typedArray = new Float32Array(attr.array);
      mergedGeometry.setAttribute(
        name,
        new THREE.BufferAttribute(typedArray, attr.itemSize)
      );
    }
    
    return mergedGeometry;
  }
};
