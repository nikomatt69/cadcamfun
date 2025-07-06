// src/hooks/useThreeJsOptimizer.ts
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
  initWasmOptimizer,
  configureOptimizer,
  updatePerformanceStats,
  calculateOptimalSettings,
  getPerformanceStats,
  decimateMesh,
  calculateLodLevels,
  isInFrustum
} from "../lib/wasm/wasmBridge";
import { PerformanceSettings, PerformanceStats } from "../types/typeswasm";

// Tipi per le opzioni dell'ottimizzatore
interface ThreeJsOptimizerOptions {
  targetFps?: number;
  adaptiveResolution?: boolean;
  enableLod?: boolean;
  enableFrustumCulling?: boolean;
  enableGeometryOptimization?: boolean;
  enableInstancing?: boolean;
  memoryManagement?: boolean;
  monitorPerformance?: boolean;
}

/**
 * Hook React per ottimizzare le prestazioni di Three.js utilizzando WebAssembly
 */
export function useThreeJsOptimizer(
  sceneRef: React.RefObject<THREE.Scene>,
  cameraRef: React.RefObject<THREE.Camera>,
  rendererRef: React.RefObject<THREE.WebGLRenderer>,
  options: ThreeJsOptimizerOptions = {}
) {
  // Riferimenti per tracciare lo stato dell'ottimizzatore
  const isInitializedRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const fpsUpdateIntervalRef = useRef(500); // ms
  const requestIdRef = useRef<number | null>(null);

  // Riferimenti per gli oggetti Three.js
  const lodGroupsRef = useRef<THREE.LOD[]>([]);
  const instancedMeshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const geometryCacheRef = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const materialCacheRef = useRef<Map<string, THREE.Material>>(new Map());

  // Stato delle performance
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({
    fps: 0,
    frameTime: 0,
    triangleCount: 0,
    drawCalls: 0,
    memoryUsage: 0,
    gpuUsage: 0
  });

  // Stato delle impostazioni
  const [currentSettings, setCurrentSettings] = useState<PerformanceSettings>({
    targetFps: options.targetFps || 60,
    resolutionScale: 1.0,
    lodBias: 0.0,
    maxTriangles: 1000000,
    frustumCulling: options.enableFrustumCulling !== false
  });

  // Stato dell'ottimizzazione
  const [isOptimizing, setIsOptimizing] = useState(false);

  /**
   * Inizializza l'ottimizzatore
   */
  const initialize = useCallback(async () => {
    if (isInitializedRef.current) return;

    try {
      await initWasmOptimizer();

      // Configura l'ottimizzatore con le impostazioni iniziali
      await configureOptimizer({
        targetFps: options.targetFps || 60,
        resolutionScale: 1.0,
        lodBias: 0.0,
        maxTriangles: 1000000,
        frustumCulling: options.enableFrustumCulling !== false
      });

      isInitializedRef.current = true;
      console.log("Three.js WebAssembly Optimizer initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Three.js WebAssembly Optimizer:", error);
    }
  }, [options.targetFps, options.enableFrustumCulling]);

  /**
   * Ottimizza la scena Three.js
   */
  const optimizeScene = useCallback(async () => {
    if (!isInitializedRef.current || !sceneRef.current) return;

    setIsOptimizing(true);

    try {
      // 1. Ottimizza istanze simili
      if (options.enableInstancing !== false) {
        optimizeInstancing();
      }

      // 2. Configura LOD per oggetti complessi
      if (options.enableLod !== false) {
        await setupLOD();
      }

      // 3. Ottimizza geometrie
      if (options.enableGeometryOptimization !== false) {
        optimizeGeometries();
      }

      // 4. Ottimizza shader e materiali
      optimizeMaterials();

      // 5. Ottimizza impostazioni renderer
      optimizeRenderer();

      console.log("Scene optimization completed");
    } catch (error) {
      console.error("Error during scene optimization:", error);
    } finally {
      setIsOptimizing(false);
    }
  }, [options.enableInstancing, options.enableLod, options.enableGeometryOptimization, sceneRef]);

  /**
   * Aggiorna i parametri di rendering in base alle performance
   */
  const updateRenderer = useCallback(async () => {
    if (!rendererRef.current || !isInitializedRef.current) return;

    const now = performance.now();
    frameCountRef.current++;

    // Aggiorna le statistiche ogni tot millisecondi
    if (now - lastTimeRef.current > fpsUpdateIntervalRef.current) {
      const elapsedSeconds = (now - lastTimeRef.current) / 1000;
      const currentFps = frameCountRef.current / elapsedSeconds;
      const stats = await fetchRenderStats();

      // Aggiorna le statistiche WASM
      await updatePerformanceStats(
        currentFps,
        (elapsedSeconds * 1000) / frameCountRef.current,
        stats.triangles,
        stats.drawCalls
      );

      // Ottieni le statistiche aggiornate
      const updatedStats = await getPerformanceStats();
      setPerformanceStats(updatedStats);

      // Calcola impostazioni ottimali
      if (options.adaptiveResolution !== false) {
        const optimalSettings = await calculateOptimalSettings();

        // Applica le nuove impostazioni se significativamente diverse
        if (Math.abs(optimalSettings.resolutionScale - currentSettings.resolutionScale) > 0.05) {
          setCurrentSettings(optimalSettings);
          applySettings(optimalSettings);
        }
      }

      // Resetta i contatori
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }
  }, [rendererRef, currentSettings, options.adaptiveResolution]);

  /**
   * Ottieni statistiche di rendering dalla scena
   */
  const fetchRenderStats = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current) {
      return { triangles: 0, drawCalls: 0 };
    }

    // Conteggio triangoli
    let triangles = 0;
    let drawCalls = 0;

    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          const geometry = object.geometry;
          if (geometry.index !== null) {
            triangles += geometry.index.count / 3;
          } else if (geometry.attributes.position) {
            triangles += geometry.attributes.position.count / 3;
          }

          // Incrementa draw calls (stima)
          if (object.visible) {
            drawCalls++;
          }
        }
      }
    });

    return { triangles, drawCalls };
  }, [rendererRef, sceneRef]);

  /**
   * Applica impostazioni di rendering
   */
  const applySettings = useCallback(
    (settings: PerformanceSettings) => {
      if (!rendererRef.current) return;

      // Applica scala di risoluzione
      const pixelRatio = window.devicePixelRatio * settings.resolutionScale;
      rendererRef.current.setPixelRatio(pixelRatio);

      // Aggiorna la dimensione del renderer
      const canvas = rendererRef.current.domElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      rendererRef.current.setSize(width, height, false);

      console.log(`Applied resolution scale: ${settings.resolutionScale.toFixed(2)}`);
    },
    [rendererRef]
  );

  /**
   * Ottimizza istanze simili
   */
  const optimizeInstancing = useCallback(() => {
    if (!sceneRef.current) return;

    // Trova mesh simili
    const meshes: THREE.Mesh[] = [];
    const meshGroups: Record<string, THREE.Mesh[]> = {};

    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper && !object.userData.excludeFromOptimization) {
        meshes.push(object);

        // Genera una chiave per raggruppare mesh simili
        const geometryId = getGeometryId(object.geometry);
        const materialId = getMaterialId(object.material);
        const key = `${geometryId}_${materialId}`;

        if (!meshGroups[key]) {
          meshGroups[key] = [];
        }

        meshGroups[key].push(object);
      }
    });

    // Crea instanced meshes per gruppi di mesh identiche
    let instancedMeshCount = 0;

    for (const [key, group] of Object.entries(meshGroups)) {
      // Se il gruppo è abbastanza grande per beneficiare dell'instancing
      if (group.length >= 5) {
        const templateMesh = group[0];
        const instancedMesh = new THREE.InstancedMesh(
          templateMesh.geometry.clone(),
          templateMesh.material,
          group.length
        );

        // Configura ciascuna istanza
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < group.length; i++) {
          const mesh = group[i];

          mesh.updateMatrix();
          matrix.copy(mesh.matrix);

          instancedMesh.setMatrixAt(i, matrix);

          // Rimuovi la mesh originale dalla scena
          if (mesh.parent) {
            mesh.parent.remove(mesh);
          }
        }

        // Aggiungi la instanced mesh alla scena
        sceneRef.current.add(instancedMesh);
        instancedMeshesRef.current.set(key, instancedMesh);
        instancedMeshCount++;
      }
    }

    console.log(`Created ${instancedMeshCount} instanced meshes from ${meshes.length} objects`);
  }, [sceneRef]);

  /**
   * Ottimizza il renderer
   */
  const optimizeRenderer = useCallback(() => {
    if (!rendererRef.current) return;

    // Imposta opzioni di rendering ottimali
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current.sortObjects = true;

    // Altre ottimizzazioni in base alle capacità GPU
    if (isWebGL2()) {
      rendererRef.current.outputEncoding = THREE.sRGBEncoding;
      rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }, [rendererRef]);

  /**
   * Ottimizza le geometrie
   */
  const optimizeGeometries = useCallback(() => {
    if (!sceneRef.current) return;

    const processedGeometries = new Set<string>();

    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper && !object.userData.excludeFromOptimization) {
        const geometry = object.geometry;

        // Genera un ID per la geometria
        const geometryId = getGeometryId(geometry);

        // Processa solo geometrie non ancora ottimizzate
        if (!processedGeometries.has(geometryId)) {
          processedGeometries.add(geometryId);

          // Ottimizza la geometria
          optimizeBufferGeometry(geometry);
        }
      }
    });

    console.log(`Optimized ${processedGeometries.size} unique geometries`);
  }, [sceneRef]);

  /**
   * Ottimizza una singola geometria
   */
  const optimizeBufferGeometry = useCallback((geometry: THREE.BufferGeometry) => {
    // Rimuovi attributi non essenziali per risparmiare memoria
    if (!geometry.userData.preserveAttributes) {
      const essentialAttributes = ["position", "normal", "uv"];

      for (const key in geometry.attributes) {
        if (!essentialAttributes.includes(key)) {
          geometry.deleteAttribute(key);
        }
      }
    }

    // Assicurati che le normali siano calcolate
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Ottimizza l'uso della memoria
    if (geometry.index) {
      const indexArray = geometry.index.array;
      // Only optimize if it's a type the function handles and can potentially be optimized
      if (indexArray instanceof Uint32Array) {
        geometry.index.array = optimizeTypedArray(indexArray);
      } else if (indexArray instanceof Uint16Array) {
        // Can potentially optimize Uint16Array further if needed (e.g., to Uint8Array if max index < 256)
        // For now, just ensure it's passed through if optimizeTypedArray expects Uint16Array
        geometry.index.array = optimizeTypedArray(indexArray);
      }
    }

    // Imposta flag per lo static drawing
    for (const key in geometry.attributes) {
      if (geometry.attributes[key] instanceof THREE.BufferAttribute) {
        (geometry.attributes[key] as THREE.BufferAttribute).usage = THREE.StaticDrawUsage;
      }
    }

    return geometry;
  }, []);

  /**
   * Ottimizza i materiali
   */
  const optimizeMaterials = useCallback(() => {
    if (!sceneRef.current) return;

    const processedMaterials = new Set<string>();

    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper && !object.userData.excludeFromOptimization) {
        // Gestisci sia materiali singoli che array di materiali
        const materials = Array.isArray(object.material) ? object.material : [object.material];

        materials.forEach(material => {
          const materialId = getMaterialId(material);

          if (!processedMaterials.has(materialId)) {
            processedMaterials.add(materialId);

            // Ottimizza il materiale
            optimizeMaterial(material);
          }
        });
      }
    });

    console.log(`Optimized ${processedMaterials.size} unique materials`);
  }, [sceneRef]);

  /**
   * Ottimizza un singolo materiale
   */
  const optimizeMaterial = useCallback((material: THREE.Material) => {
    // Ottimizza in base al tipo di materiale
    if (material instanceof THREE.MeshStandardMaterial) {
      // Semplifica materiali standard per migliorare le performance
      material.flatShading = true;

      // Riduce la qualità delle texture
      if (material.map) {
        material.map.minFilter = THREE.LinearFilter;
        material.map.generateMipmaps = false;
      }

      // Elimina mappe non essenziali per risparmiare memoria
      if (!material.userData.preserveMaps) {
        material.normalMap = null;
        material.metalnessMap = null;
        material.roughnessMap = null;
        material.aoMap = null;
      }
    }

    return material;
  }, []);

  /**
   * Configura i livelli LOD
   */
  const setupLOD = useCallback(async () => {
    if (!sceneRef.current || !isInitializedRef.current) return;

    // Cerca mesh complesse che potrebbero beneficiare del LOD
    const complexMeshes: THREE.Mesh[] = [];

    sceneRef.current.traverse(object => {
      if (object instanceof THREE.Mesh && !object.userData.isHelper && !object.userData.excludeFromLOD) {
        // Calcola la complessità della mesh
        const triangleCount = getTriangleCount(object.geometry);

        // Applica LOD solo a mesh abbastanza complesse
        if (triangleCount > 1000) {
          complexMeshes.push(object);
        }
      }
    });

    // Crea gruppi LOD per le mesh complesse
    let createdLodGroups = 0;

    for (const mesh of complexMeshes) {
      // Calcola la complessità
      const triangleCount = getTriangleCount(mesh.geometry);

      // Ottieni livelli LOD ottimali dal modulo WASM
      const lodLevels = await calculateLodLevels(triangleCount);

      // Crea gruppo LOD
      const lod = new THREE.LOD();
      lod.position.copy(mesh.position);
      lod.rotation.copy(mesh.rotation);
      lod.scale.copy(mesh.scale);

      // Aggiungi il livello 0 (massima qualità)
      lod.addLevel(mesh.clone(), 0);

      // Aggiungi livelli LOD aggiuntivi
      for (let i = 0; i < lodLevels.length; i++) {
        const level = lodLevels[i];
        const lodMesh = await createLODMesh(mesh, level.detailRatio);

        if (lodMesh) {
          lod.addLevel(lodMesh, level.distance);
        }
      }

      // Rimuovi la mesh originale dalla scena
      if (mesh.parent) {
        const parent = mesh.parent;
        parent.remove(mesh);
        parent.add(lod);
      } else {
        sceneRef.current.add(lod);
      }

      // Salva riferimento al gruppo LOD
      lodGroupsRef.current.push(lod);
      createdLodGroups++;
    }

    console.log(`Created ${createdLodGroups} LOD groups`);
  }, [sceneRef]);

  /**
   * Crea una versione semplificata di una mesh per LOD
   */
  const createLODMesh = useCallback(async (mesh: THREE.Mesh, detailRatio: number): Promise<THREE.Mesh | null> => {
    try {
      // Estrai dati della geometria
      const geometry = mesh.geometry;
      const position = geometry.attributes.position.array as Float32Array;
      const indices = geometry.index
        ? (geometry.index.array as Uint32Array)
        : new Uint32Array(Array.from({ length: position.length / 3 }, (_, i) => i));

      // Riduci la geometria usando WebAssembly
      const decimated = await decimateMesh(position, indices, detailRatio);

      // Crea una nuova geometria Three.js con i dati ridotti
      const lodGeometry = new THREE.BufferGeometry();
      lodGeometry.setAttribute("position", new THREE.BufferAttribute(decimated.vertices, 3));
      lodGeometry.setIndex(new THREE.BufferAttribute(decimated.indices, 1));
      lodGeometry.computeVertexNormals();

      // Crea materiale semplificato
      let lodMaterial: THREE.Material;

      if (Array.isArray(mesh.material)) {
        // Semplifica array di materiali
        lodMaterial = mesh.material[0].clone();
      } else {
        lodMaterial = mesh.material.clone();
      }

      // Semplifica ulteriormente il materiale per LOD
      if (lodMaterial instanceof THREE.MeshStandardMaterial) {
        lodMaterial.flatShading = true;
        lodMaterial.normalMap = null;
        lodMaterial.roughnessMap = null;
        lodMaterial.metalnessMap = null;
      }

      // Crea e restituisci la mesh LOD
      return new THREE.Mesh(lodGeometry, lodMaterial);
    } catch (error) {
      console.error("Error creating LOD mesh:", error);
      return null;
    }
  }, []);

  /**
   * Aggiorna frustum culling
   */
  const updateFrustumCulling = useCallback(async () => {
    if (!sceneRef.current || !cameraRef.current || !currentSettings.frustumCulling) return;

    try {
      // Calcola la matrice di view-projection
      const camera = cameraRef.current;
      const viewMatrix = camera.matrixWorldInverse;
      const projMatrix = camera.projectionMatrix;

      const viewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(projMatrix, viewMatrix);
      const viewProjectionArray = new Float32Array(16);

      viewProjectionMatrix.toArray(viewProjectionArray);

      // Verifica visibilità degli oggetti
      sceneRef.current.traverse(async object => {
        if (
          object instanceof THREE.Mesh &&
          !object.userData.isHelper &&
          !object.userData.alwaysVisible &&
          !object.userData.excludeFromFrustumCulling
        ) {
          // Calcola bounding box se non definito
          if (!object.geometry.boundingBox) {
            object.geometry.computeBoundingBox();
          }

          const box = object.geometry.boundingBox!;

          // Converti bounding box in coordinate mondo
          const worldBox = {
            min: box.min.clone().applyMatrix4(object.matrixWorld),
            max: box.max.clone().applyMatrix4(object.matrixWorld)
          };

          // Controllo di visibilità usando WASM
          const isVisible = await isInFrustum(
            [worldBox.min.x, worldBox.min.y, worldBox.min.z],
            [worldBox.max.x, worldBox.max.y, worldBox.max.z],
            viewProjectionArray
          );

          // Aggiorna visibilità
          object.visible = isVisible;
        }
      });
    } catch (error) {
      console.error("Error in frustum culling:", error);
    }
  }, [sceneRef, cameraRef, currentSettings.frustumCulling]);

  /**
   * Aggiorna i livelli LOD
   */
  const updateLOD = useCallback(() => {
    if (!cameraRef.current || lodGroupsRef.current.length === 0) return;

    // Aggiorna tutti i gruppi LOD
    for (const lod of lodGroupsRef.current) {
      lod.update(cameraRef.current);
    }
  }, [cameraRef]);

  /**
   * Metodo principale di aggiornamento da chiamare in ogni frame
   */
  const update = useCallback(() => {
    if (!isInitializedRef.current) return;

    // Aggiorna statistiche renderer
    updateRenderer();

    // Aggiorna frustum culling se abilitato
    if (currentSettings.frustumCulling) {
      updateFrustumCulling();
    }

    // Aggiorna LOD se abilitato
    if (options.enableLod !== false) {
      updateLOD();
    }

    // Pianifica prossimo aggiornamento
    requestIdRef.current = requestAnimationFrame(update);
  }, [updateRenderer, updateFrustumCulling, updateLOD, currentSettings.frustumCulling, options.enableLod]);

  // Inizializza l'ottimizzatore al mount
  useEffect(() => {
    // Inizializza l'ottimizzatore WASM
    initialize().then(() => {
      // Ottimizza la scena
      optimizeScene();

      // Avvia il loop di aggiornamento
      lastTimeRef.current = performance.now();
      update();
    });

    // Cleanup al dismount
    return () => {
      if (requestIdRef.current) {
        cancelAnimationFrame(requestIdRef.current);
        requestIdRef.current = null;
      }
    };
  }, [initialize, optimizeScene, update]);

  // Utility per verificare se WebGL2 è disponibile
  function isWebGL2(): boolean {
    if (!rendererRef.current) return false;

    const context = rendererRef.current.getContext();
    return context instanceof WebGL2RenderingContext;
  }

  // Utility per ottenere un ID univoco per una geometria
  function getGeometryId(geometry: THREE.BufferGeometry): string {
    if (!geometry) return "null";

    // Genera hash basato sugli attributi
    const position = geometry.attributes.position;
    if (!position) return "empty";

    const vertexCount = position.count;
    const triangleCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

    return `v${vertexCount}_t${Math.floor(triangleCount)}_${geometry.uuid.slice(0, 8)}`;
  }

  // Utility per ottenere un ID univoco per un materiale
  function getMaterialId(material: THREE.Material | THREE.Material[]): string {
    if (!material) return "null";

    if (Array.isArray(material)) {
      return material.map(m => getMaterialId(m)).join("_");
    }

    // Genera hash basato sulle proprietà
    if (material instanceof THREE.MeshStandardMaterial) {
      return `std_${material.uuid.slice(0, 8)}_${material.color.getHexString()}`;
    }

    return `${material.type}_${material.uuid.slice(0, 8)}`;
  }

  // Utility per contare i triangoli in una geometria
  function getTriangleCount(geometry: THREE.BufferGeometry): number {
    if (!geometry) return 0;

    if (geometry.index) {
      return geometry.index.count / 3;
    } else if (geometry.attributes.position) {
      return geometry.attributes.position.count / 3;
    }

    return 0;
  }

  // Utility per ottimizzare un array tipizzato
  function optimizeTypedArray<T extends Uint32Array | Uint16Array>(array: T): T | Uint16Array {
    // Scegli il tipo di array più efficiente in base ai valori
    if (array instanceof Uint32Array) {
      // Find max value safely without spread operator
      let maxValue = 0;
      for (let i = 0; i < array.length; i++) {
        if (array[i] > maxValue) {
          maxValue = array[i];
        }
      }

      if (maxValue < 65536) {
        return new Uint16Array(array); // Return specific type
      }
    }

    return array; // Return original if no optimization possible/needed
  }

  // Esponi API e stato per l'uso nel componente
  return {
    stats: performanceStats,
    settings: currentSettings,
    isOptimizing,
    optimizeSceneNow: optimizeScene,
    updateLOD,

    // Metodi per operazioni specifiche
    createLODMesh,
    optimizeInstancing,
    applySettings
  };
}

export default useThreeJsOptimizer;
