import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Stats, { Panel } from 'stats.js';

// Definizione più precisa dei tipi di statistiche
interface SceneStatistics {
  objectCount: number;
  triangles: number;
  fps: number;
  memory: number;
  drawCalls: number;
  geometries: number;
  textures: number;
}

/**
 * Hook per monitorare e ottimizzare le performance di una scena Three.js
 */
export const useThreePerformanceVisualizer = (
  sceneRef: React.RefObject<THREE.Scene>,
  rendererRef?: React.RefObject<THREE.WebGLRenderer>
) => {
  // Riferimenti per monitoraggio e controllo
  const statsRef = useRef<Stats>();
  const animationFrameRef = useRef<number>();
  const perfTimerRef = useRef<NodeJS.Timeout>();
  const previousStatsRef = useRef<SceneStatistics>({
    objectCount: 0,
    triangles: 0,
    fps: 0,
    memory: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0
  });
  
  // Stati per le metriche di performance
  const [sceneStatistics, setSceneStatistics] = useState<SceneStatistics>({
    objectCount: 0,
    triangles: 0,
    fps: 0,
    memory: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0
  });
  
  // Stati per tracciare ottimizzazioni e problemi
  const [optimizations, setOptimizations] = useState<{
    materialsSaved: number;
    geometriesOptimized: number;
    attributesRemoved: number;
    lastOptimizationTime: number;
  }>({
    materialsSaved: 0,
    geometriesOptimized: 0,
    attributesRemoved: 0,
    lastOptimizationTime: 0
  });
  
  const [memoryWarning, setMemoryWarning] = useState<boolean>(false);
  
  // Inizializza stats.js per monitoraggio FPS e memoria
  useEffect(() => {
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3: custom
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = '0px';
    stats.dom.style.top = '0px';
    stats.dom.style.display = 'none'; // Nascondi di default
    document.body.appendChild(stats.dom);
    
    statsRef.current = stats;
    
    // Timer per aggiornare le statistiche - utilizziamo requestIdleCallback se disponibile
    // per non influire sulle performance del rendering
    const updateStatistics = () => {
      if (!sceneRef.current) return;
      
      const info = rendererRef?.current?.info;
      
      // Conteggio triangoli e oggetti
      let triangleCount = 0;
      let objectCount = 0;
      let geometryCount = 0;
      
      sceneRef.current.traverse((object) => {
        objectCount++;
        
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometryCount++;
          const geometry = object.geometry;
          
          if (geometry instanceof THREE.BufferGeometry) {
            if (geometry.index !== null) {
              triangleCount += geometry.index.count / 3;
            } else if (geometry.attributes.position) {
              triangleCount += geometry.attributes.position.count / 3;
            }
          }
        }
      });
      
      // Calcola FPS dal pannello stats
      const fps = statsRef.current ? Math.round((statsRef.current.addPanel.length).valueOf()) : 0;
      
      // Informazioni memoria dal renderer o da performance API
      const memory = info?.memory?.geometries 
        ? (info.memory.textures * 4 + info.memory.geometries * 0.5) // Stima approssimativa
        : window.performance?.memory?.usedJSHeapSize 
          ? Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024))
          : 0;
          
      // Informazioni renderer
      const drawCalls = info?.render?.calls || 0;
      const geometries = info?.memory?.geometries || geometryCount;
      const textures = info?.memory?.textures || 0;
      
      // Aggiorna le statistiche solo se sono cambiate significativamente
      const prevStats = previousStatsRef.current;
      const hasSignificantChange = 
        Math.abs(triangleCount - prevStats.triangles) > 10 ||
        Math.abs(objectCount - prevStats.objectCount) > 2 ||
        Math.abs(fps - prevStats.fps) > 5 ||
        Math.abs(memory - prevStats.memory) > 5 ||
        Math.abs(drawCalls - prevStats.drawCalls) > 5;
        
      if (hasSignificantChange) {
        const newStats = {
          objectCount,
          triangles: Math.floor(triangleCount),
          fps,
          memory,
          drawCalls,
          geometries,
          textures
        };
        
        setSceneStatistics(newStats);
        previousStatsRef.current = newStats;
        
        // Controlla se c'è troppa memoria utilizzata
        if (memory > 200) { // Valore arbitrario, regola in base all'applicazione
          setMemoryWarning(true);
        } else {
          setMemoryWarning(false);
        }
      }
    };
    
    // Utilizziamo requestIdleCallback se disponibile, altrimenti setTimeout
    const scheduleUpdate = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(
          () => {
            updateStatistics();
            perfTimerRef.current = setTimeout(scheduleUpdate, 2000);
          },
          { timeout: 1000 }
        );
      } else {
        updateStatistics();
        perfTimerRef.current = setTimeout(scheduleUpdate, 2000);
      }
    };
    
    scheduleUpdate();
    
    return () => {
      if (perfTimerRef.current) {
        clearTimeout(perfTimerRef.current);
      }
      
      if (statsRef.current) {
        if (document.body.contains(statsRef.current.dom)) {
          document.body.removeChild(statsRef.current.dom);
        }
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [sceneRef, rendererRef]);

  // Aggiorna stats.js in ogni frame se visibile
  const updateStats = useCallback(() => {
    if (statsRef.current) {
      statsRef.current.update();
    }
    animationFrameRef.current = requestAnimationFrame(updateStats);
  }, []);

  useEffect(() => {
    // Avvia l'aggiornamento solo se stats è visibile
    if (statsRef.current && statsRef.current.dom.style.display !== 'none') {
      animationFrameRef.current = requestAnimationFrame(updateStats);
      
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [updateStats]);
  
  // Funzione per mostrare/nascondere stats.js
  const toggleStats = useCallback((show?: boolean) => {
    if (!statsRef.current) return;
    
    const shouldShow = show !== undefined ? show : statsRef.current.dom.style.display === 'none';
    
    statsRef.current.dom.style.display = shouldShow ? 'block' : 'none';
    
    // Avvia o ferma l'aggiornamento in base alla visibilità
    if (shouldShow) {
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateStats);
      }
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }
  }, [updateStats]);

  // Deduplicazione di materiali usando una cache di WeakMap
  // questo approccio è più efficiente di una semplice stringa come chiave
  const materialCache = useRef(new WeakMap<THREE.Material, string>());
  const uniqueMaterials = useRef(new Map<string, THREE.Material>());
  
  // Helper per generare una chiave univoca per materiali simili
  const getMaterialKey = useCallback((material: THREE.Material): string => {
    // Controlla se abbiamo già calcolato una chiave per questo materiale
    const cachedKey = materialCache.current.get(material);
    if (cachedKey) return cachedKey;
    
    let key = material.type;
    
    // Proprietà comuni a tutti i materiali
    key += `_${material.transparent}_${material.opacity}_${material.side}`;
    
    // Aggiungi proprietà specifiche in base al tipo di materiale
    if (material instanceof THREE.MeshStandardMaterial) {
      key += `_standard_${material.color.getHex()}_${material.roughness.toFixed(2)}_${material.metalness.toFixed(2)}_${Boolean(material.map)}_${Boolean(material.normalMap)}`;
    } else if (material instanceof THREE.MeshPhongMaterial) {
      key += `_phong_${material.color.getHex()}_${material.shininess}_${Boolean(material.map)}`;
    } else if (material instanceof THREE.MeshBasicMaterial) {
      key += `_basic_${material.color.getHex()}_${material.wireframe}_${Boolean(material.map)}`;
    } else if (material instanceof THREE.LineBasicMaterial) {
      key += `_line_${material.color.getHex()}_${material.linewidth || 1}`;
    } else if (material instanceof THREE.PointsMaterial) {
      key += `_points_${material.color.getHex()}_${material.size}_${material.sizeAttenuation}`;
    } else if (material instanceof THREE.MeshLambertMaterial) {
      key += `_lambert_${material.color.getHex()}_${Boolean(material.map)}`;
    }
    
    // Cache la chiave per uso futuro
    materialCache.current.set(material, key);
    return key;
  }, []);

  /**
   * Ottimizza geometrie liberando memoria e rimuovendo attributi inutilizzati
   */
  const optimizeGeometry = useCallback((geometry: THREE.BufferGeometry, material?: THREE.Material): number => {
    let attributesRemoved = 0;
    
    if (!geometry.isBufferGeometry) return attributesRemoved;
    
    try {
      // Ottimizza indici se presenti
      if (geometry.index && geometry.index.count > 0) {
        // Mantieni gli indici, sono in genere un'ottimizzazione
      } else if (geometry.attributes.position) {
        // Potrebbe essere utile generare indici per geometrie grandi
        if (geometry.attributes.position.count > 1000) {
          // geometry.setIndex([...]); - opzionale, ma richiede calcoli complessi
        }
      }
      
      // Rimuovi attributi non utilizzati in base al materiale
      if (material) {
        // Rimuovi color attribute se non usato
        if (geometry.attributes.color && 
            !(material as any).vertexColors) {
          geometry.deleteAttribute('color');
          attributesRemoved++;
        }
        
        // Rimuovi UV se non c'è una texture
        if (geometry.attributes.uv && 
            !(material as any).map && 
            !(material as any).roughnessMap && 
            !(material as any).metalnessMap && 
            !(material as any).normalMap) {
          geometry.deleteAttribute('uv');
          attributesRemoved++;
        }
        
        // Rimuovi UV2 (lightmap) se non usato
        if (geometry.attributes.uv2 && 
            !(material as any).lightMap && 
            !(material as any).aoMap) {
          geometry.deleteAttribute('uv2');
          attributesRemoved++;
        }
      }
      
      // Aggiungi normali se mancanti ma necessarie per il materiale
      if (!geometry.attributes.normal && 
          (material instanceof THREE.MeshStandardMaterial || 
           material instanceof THREE.MeshPhongMaterial || 
           material instanceof THREE.MeshLambertMaterial)) {
        geometry.computeVertexNormals();
      }
      
      // Aggiunge boundingSphere per ottimizzare il frustum culling
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }
      
      return attributesRemoved;
    } catch (e) {
      console.error('Error optimizing geometry:', e);
      return 0;
    }
  }, []);

  /**
   * Funzione completa per ottimizzare la scena
   */
  const optimizeScene = useCallback(() => {
    if (!sceneRef.current) return;
    
    console.time('Scene optimization');
    
    // Statistiche di ottimizzazione
    let materialsSaved = 0;
    let geometriesOptimized = 0;
    let attributesRemoved = 0;
    
    // 1. Cache e deduplicazione materiali
    uniqueMaterials.current.clear();
    materialCache.current = new WeakMap(); // Reset della cache
    
    // Prima ottimizzazione: raccolta di materiali unici
    sceneRef.current.traverse((object) => {
      if (!(object instanceof THREE.Mesh && !object.userData.preventOptimization)) return;
      
      // Gestione array di materiali
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => {
          const materialKey = getMaterialKey(mat);
          if (!uniqueMaterials.current.has(materialKey)) {
            uniqueMaterials.current.set(materialKey, mat);
          }
        });
      } 
      // Gestione materiale singolo
      else if (object.material) {
        const materialKey = getMaterialKey(object.material);
        if (!uniqueMaterials.current.has(materialKey)) {
          uniqueMaterials.current.set(materialKey, object.material);
        }
      }
    });
    
    // Seconda passata: applicazione dei materiali deduplicate
    sceneRef.current.traverse((object) => {
      if (!(object instanceof THREE.Mesh && !object.userData.preventOptimization)) return;
      
      if (Array.isArray(object.material)) {
        const originalLength = object.material.length;
        
        // Sostituisci ogni materiale con la versione condivisa
        object.material = object.material.map(mat => {
          const materialKey = getMaterialKey(mat);
          return uniqueMaterials.current.get(materialKey) || mat;
        });
        
        materialsSaved += originalLength - new Set(object.material).size;
      } 
      else if (object.material) {
        const originalMaterial = object.material;
        const materialKey = getMaterialKey(originalMaterial);
        const sharedMaterial = uniqueMaterials.current.get(materialKey);
        
        // Usa il materiale condiviso se disponibile
        if (sharedMaterial && sharedMaterial !== originalMaterial) {
          object.material = sharedMaterial;
          materialsSaved++;
        }
      }
    });
    
    // 2. Ottimizzazione geometrie
    sceneRef.current.traverse((object) => {
      if ((object instanceof THREE.Mesh || 
           object instanceof THREE.Points || 
           object instanceof THREE.Line) && 
          !object.userData.preventOptimization) {
        
        if (!object.geometry) return;
        
        const material = Array.isArray(object.material) ? 
          object.material[0] : object.material;
          
        const removed = optimizeGeometry(object.geometry, material);
        attributesRemoved += removed;
        
        if (removed > 0) {
          geometriesOptimized++;
        }
      }
    });
    
    // 3. Attiva frustum culling sugli oggetti
    sceneRef.current.traverse((object) => {
      if (object.type === 'Mesh' || object.type === 'Line' || object.type === 'Points') {
        object.frustumCulled = true;
      }
    });
    
    // 4. Ottimizzazione di gruppi o riduzioni di draw calls (opzionale)
    // Questa parte è complessa e dipende dallo specifico caso d'uso
    
    console.timeEnd('Scene optimization');
    
    // Aggiorna statistiche di ottimizzazione
    setOptimizations({
      materialsSaved,
      geometriesOptimized,
      attributesRemoved,
      lastOptimizationTime: Date.now()
    });
    
  }, [sceneRef, getMaterialKey, optimizeGeometry]);

  /**
   * Rilascia memoria liberando geometrie e materiali non utilizzati
   */
  const disposeUnusedResources = useCallback(() => {
    if (!sceneRef.current) return;
    
    // Set per tenere traccia di geometrie e materiali ancora in uso
    const usedGeometries = new Set<THREE.BufferGeometry>();
    const usedMaterials = new Set<THREE.Material>();
    
    // Prima passata: identifica risorse in uso
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh || 
          object instanceof THREE.Line || 
          object instanceof THREE.Points) {
        
        if (object.geometry) {
          usedGeometries.add(object.geometry);
        }
        
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => usedMaterials.add(mat));
        } else if (object.material) {
          usedMaterials.add(object.material);
        }
      }
    });
    
    // Esegui garbage collection su THREE.js (funzione unofficiale)
    if ((THREE as any).Cache && typeof (THREE as any).Cache.clear === 'function') {
      (THREE as any).Cache.clear();
    }
    
    return {
      usedGeometries: usedGeometries.size,
      usedMaterials: usedMaterials.size
    };
  }, [sceneRef]);

  /**
   * Dispone correttamente un oggetto e i suoi figli per liberare memoria
   */
  const disposeObject = useCallback((object: THREE.Object3D) => {
    if (!object) return;
    
    // Rimuovi dalla scena se ha un parent
    if (object.parent) {
      object.parent.remove(object);
    }
    
    // Traversa i figli in modo ricorsivo
    for (let i = object.children.length - 1; i >= 0; i--) {
      disposeObject(object.children[i]);
    }
    
    // Libera geometria
    if ((object as any).geometry) {
      (object as any).geometry.dispose();
    }
    
    // Libera materiali
    if ((object as any).material) {
      if (Array.isArray((object as any).material)) {
        (object as any).material.forEach((material: THREE.Material) => {
          disposeMaterial(material);
        });
      } else {
        disposeMaterial((object as any).material);
      }
    }
    
    // Rimuovi riferimenti
    object.clear();
  }, []);
  
  /**
   * Dispone correttamente un materiale e le sue textures
   */
  const disposeMaterial = useCallback((material: THREE.Material) => {
    if (!material) return;
    
    // Dispone textures associate
    Object.keys(material).forEach(propertyName => {
      const value = (material as any)[propertyName];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    });
    
    // Dispone il materiale stesso
    material.dispose();
  }, []);

  /**
   * Restituisce funzioni e dati per gestire le performance
   */
  return {
    optimizeScene,
    sceneStatistics,
    toggleStats,
    optimizations,
    memoryWarning,
    disposeUnusedResources,
    disposeObject
  };
};