// src/utils/threeOptimizer.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * Three.js optimization utilities for CAD/CAM applications
 */
export class ThreeOptimizer {
  // Store disposable objects for cleanup
  private disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  } = {
    geometries: [],
    materials: [],
    textures: []
  };

  // Store instance count for shared materials
  private materialInstances: Map<THREE.Material, number> = new Map();

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {}

  /**
   * Optimize renderer settings for better performance
   * @param highQuality Use higher quality settings (with performance impact)
   */
  optimizeRenderer(highQuality = false): void {
    // Basic optimizations
    this.renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1);
    
    if (highQuality) {
      // Higher quality settings
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
    } else {
      // Performance optimizations
      this.renderer.shadowMap.enabled = false;
      // Simpler shadow map if needed
      // this.renderer.shadowMap.type = THREE.BasicShadowMap;
    }
  }

  /**
   * Update renderer size with proper pixel ratio handling
   */
  updateRendererSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderer.setSize(width * pixelRatio, height * pixelRatio, false);
  }

  /**
   * Register a disposable object for later cleanup
   */
  registerDisposable(
    object: THREE.BufferGeometry | THREE.Material | THREE.Texture
  ): void {
    if (object instanceof THREE.BufferGeometry) {
      this.disposables.geometries.push(object);
    } else if (object instanceof THREE.Material) {
      this.disposables.materials.push(object);
      this.materialInstances.set(object, (this.materialInstances.get(object) || 0) + 1);
    } else if (object instanceof THREE.Texture) {
      this.disposables.textures.push(object);
    }
  }

  /**
   * Dispose a specific object and remove from tracking
   */
  disposeObject(
    object: THREE.BufferGeometry | THREE.Material | THREE.Texture
  ): void {
    if (object instanceof THREE.BufferGeometry) {
      object.dispose();
      const index = this.disposables.geometries.indexOf(object);
      if (index !== -1) this.disposables.geometries.splice(index, 1);
    } else if (object instanceof THREE.Material) {
      const instances = this.materialInstances.get(object) || 0;
      if (instances <= 1) {
        object.dispose();
        this.materialInstances.delete(object);
        const index = this.disposables.materials.indexOf(object);
        if (index !== -1) this.disposables.materials.splice(index, 1);
      } else {
        this.materialInstances.set(object, instances - 1);
      }
    } else if (object instanceof THREE.Texture) {
      object.dispose();
      const index = this.disposables.textures.indexOf(object);
      if (index !== -1) this.disposables.textures.splice(index, 1);
    }
  }

  /**
   * Dispose all tracked objects
   */
  disposeAll(): void {
    // Dispose geometries
    this.disposables.geometries.forEach(geometry => {
      geometry.dispose();
    });
    this.disposables.geometries = [];

    // Dispose materials
    this.disposables.materials.forEach(material => {
      material.dispose();
    });
    this.disposables.materials = [];
    this.materialInstances.clear();

    // Dispose textures
    this.disposables.textures.forEach(texture => {
      texture.dispose();
    });
    this.disposables.textures = [];
  }

  /**
   * Dispose scene and all its children
   */
  disposeScene(): void {
    this.traverseScene(this.scene, (object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material: THREE.Material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  /**
   * Helper to traverse scene and apply a function to each object
   */
  traverseScene(
    node: THREE.Object3D, 
    callback: (object: any) => void
  ): void {
    callback(node);
    node.children.forEach(child => {
      this.traverseScene(child, callback);
    });
  }

  /**
   * Merge multiple geometries of similar meshes for better performance
   */
  mergeGeometries(
    meshes: THREE.Mesh[], 
    options: { preserveGroups?: boolean } = {}
  ): THREE.Mesh | null {
    if (meshes.length === 0) return null;
    
    // Check if all meshes use the same material
    const firstMaterial = meshes[0].material;
    const sameMaterial = meshes.every(mesh => mesh.material === firstMaterial);
    
    if (!sameMaterial) {
      console.warn('Cannot merge meshes with different materials');
      return null;
    }
    
    // Extract geometries and calculate transformations
    const geometries: THREE.BufferGeometry[] = [];
    
    meshes.forEach(mesh => {
      // Clone the geometry
      const geometry = mesh.geometry.clone();
      
      // Apply mesh's transformation to geometry
      mesh.updateMatrix();
      geometry.applyMatrix4(mesh.matrix);
      
      geometries.push(geometry);
    });
    
    // Merge geometries
    const mergedGeometry = mergeBufferGeometries(geometries, options.preserveGroups);
    if (!mergedGeometry) return null;
    
    // Create new mesh with merged geometry
    const mergedMesh = new THREE.Mesh(mergedGeometry, firstMaterial);
    
    // Register the new geometry for disposal
    this.registerDisposable(mergedGeometry);
    
    // Clean up the original geometries
    geometries.forEach(geo => {
      this.disposeObject(geo);
    });
    
    return mergedMesh;
  }

  /**
   * Create instanced mesh from array of meshes
   */
  createInstancedMesh(
    meshes: THREE.Mesh[]
  ): THREE.InstancedMesh | null {
    if (meshes.length === 0) return null;
    
    const firstMesh = meshes[0];
    const material = firstMesh.material;
    const geometry = firstMesh.geometry;
    
    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      meshes.length
    );
    
    // Set matrix for each instance
    const matrix = new THREE.Matrix4();
    meshes.forEach((mesh, i) => {
      mesh.updateWorldMatrix(true, false);
      mesh.matrixWorld.decompose(
        new THREE.Vector3(),
        new THREE.Quaternion(),
        new THREE.Vector3()
      );
      mesh.matrix.decompose(
        new THREE.Vector3(),
        new THREE.Quaternion(),
        new THREE.Vector3()
      );
      
      matrix.copy(mesh.matrix);
      instancedMesh.setMatrixAt(i, matrix);
    });
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Enable frustum culling for all objects in the scene
   */
  enableFrustumCulling(): void {
    this.traverseScene(this.scene, (object) => {
      if (object.isObject3D) {
        object.frustumCulled = true;
      }
    });
  }

  /**
   * Level of Detail (LOD) creation helper
   */
  createLOD(
    highDetailMesh: THREE.Mesh,
    mediumDetailMesh: THREE.Mesh,
    lowDetailMesh: THREE.Mesh
  ): THREE.LOD {
    const lod = new THREE.LOD();
    
    // Add levels with distances
    lod.addLevel(highDetailMesh, 0);
    lod.addLevel(mediumDetailMesh, 50);
    lod.addLevel(lowDetailMesh, 200);
    
    return lod;
  }

  /**
   * Create a simplified version of a mesh for LOD
   */
  simplifyGeometry(
    originalMesh: THREE.Mesh,
    reduction: number = 0.5
  ): THREE.Mesh {
    // In a real implementation, you'd use a simplification library
    // like simplify-js or simplify-3d
    // This is a placeholder implementation
    
    // Clone the original mesh and material
    const simplified = originalMesh.clone();
    
    // Here you would actually simplify the geometry
    // For now, we just scale down the vertex count for demonstration
    
    return simplified;
  }

  /**
   * Optimize textures for lower memory usage
   */
  optimizeTextures(texturesToOptimize?: THREE.Texture[]): void {
    const textures = texturesToOptimize || this.disposables.textures;
    
    textures.forEach(texture => {
      // Ensure power-of-two dimensions for better performance
      texture.minFilter = THREE.LinearFilter;
      
      // Disable mipmaps if not needed
      texture.generateMipmaps = false;
      
      // Optimize repeat wrapping only when needed
      if (!texture.repeat.equals(new THREE.Vector2(1, 1))) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
      } else {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
      }
      
      // Force texture update
      texture.needsUpdate = true;
    });
  }

  /**
   * Toggle adaptive quality based on FPS
   */
  enableAdaptiveQuality(
    composer: EffectComposer,
    targetFPS: number = 60,
    onQualityChange?: (quality: 'high' | 'medium' | 'low') => void
  ): () => void {
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let totalFrameTime = 0;
    let currentQuality: 'high' | 'medium' | 'low' = 'high';
    
    // Set initial pixel ratio based on device
    if (window.devicePixelRatio > 1) {
      composer.setPixelRatio(1.5);
    } else {
      composer.setPixelRatio(1);
    }
    
    // Function to measure FPS and adjust quality
    const measurePerformance = () => {
      const now = performance.now();
      const delta = now - lastFrameTime;
      lastFrameTime = now;
      
      // Skip first frame
      if (frameCount === 0) {
        frameCount++;
        return;
      }
      
      totalFrameTime += delta;
      frameCount++;
      
      // Measure every 10 frames
      if (frameCount >= 10) {
        const averageFPS = 1000 / (totalFrameTime / frameCount);
        
        // Adjust quality based on FPS
        if (averageFPS < targetFPS * 0.5 && currentQuality !== 'low') {
          currentQuality = 'low';
          composer.setPixelRatio(0.5);
          if (onQualityChange) onQualityChange('low');
        } else if (averageFPS < targetFPS * 0.8 && currentQuality === 'high') {
          currentQuality = 'medium';
          composer.setPixelRatio(0.75);
          if (onQualityChange) onQualityChange('medium');
        } else if (averageFPS > targetFPS * 0.9 && currentQuality === 'low') {
          currentQuality = 'medium';
          composer.setPixelRatio(0.75);
          if (onQualityChange) onQualityChange('medium');
        } else if (averageFPS > targetFPS && currentQuality === 'medium') {
          currentQuality = 'high';
          composer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
          if (onQualityChange) onQualityChange('high');
        }
        
        // Reset counters
        frameCount = 0;
        totalFrameTime = 0;
      }
    };
    
    // Add to animation loop
    const id = requestAnimationFrame(function updateLoop() {
      measurePerformance();
      requestAnimationFrame(updateLoop);
    });
    
    // Return cleanup function
    return () => {
      cancelAnimationFrame(id);
    };
  }

  /**
   * Create optimized materials for CAD rendering
   */
  createOptimizedMaterial(
    type: 'standard' | 'basic' | 'phong' | 'wireframe' = 'standard',
    options: any = {}
  ): THREE.Material {
    let material: THREE.Material;
    
    switch (type) {
      case 'standard':
        material = new THREE.MeshStandardMaterial({
          metalness: 0.1,
          roughness: 0.7,
          ...options
        });
        break;
      
      case 'basic':
        material = new THREE.MeshBasicMaterial(options);
        break;
        
      case 'phong':
        material = new THREE.MeshPhongMaterial({
          shininess: 30,
          ...options
        });
        break;
        
      case 'wireframe':
        material = new THREE.LineBasicMaterial({
          color: 0x000000,
          ...options
        });
        break;
        
      default:
        material = new THREE.MeshStandardMaterial(options);
    }
    
    // Register for disposal
    this.registerDisposable(material);
    
    return material;
  }

  /**
   * Enable performance stats display
   */
  enableStats(container: HTMLElement): any {
    // This is a placeholder - in a real implementation,
    // you would integrate stats.js
    console.log('Stats.js would be initialized here');
    
    // Return mock stats object
    return {
      update: () => {},
      dom: document.createElement('div')
    };
  }
}

export default ThreeOptimizer;