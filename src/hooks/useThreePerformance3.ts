import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import Stats from 'stats.js';

export const useThreePerformance = (sceneRef: React.RefObject<THREE.Scene>) => {
  const statsRef = useRef<Stats>();
  const [sceneStatistics, setSceneStatistics] = useState({
    objectCount: 0,
    triangles: 0,
    fps: 0
  });

  // Inizializza stats.js per monitoraggio FPS
  useEffect(() => {
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3: mb
    stats.dom.style.position = 'absolute';
    stats.dom.style.left = '0px';
    stats.dom.style.top = '0px';
    // stats.dom.style.display = 'none'; // Nascondi di default
    stats.dom.style.display = 'block'; // Mostra
    document.body.appendChild(stats.dom);
    
    statsRef.current = stats;
    
    // Timer per aggiornare le statistiche
    const intervalId = setInterval(() => {
      if (sceneRef.current) {
        let triangleCount = 0;
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
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
        
        setSceneStatistics({
          objectCount: sceneRef.current.children.length,
          triangles: Math.round(triangleCount),
          fps: statsRef.current?.end() ?? 0
        });
      }
    }, 1000);
    return () => {
      clearInterval(intervalId);
      if (statsRef.current) {
        document.body.removeChild(statsRef.current.dom);
      }
    };
  }, [sceneRef]);

  // Aggiorna stats.js in ogni frame se visibile
  const updateStats = useCallback(() => {
    if (statsRef.current) {
      statsRef.current.update();
    }
    requestAnimationFrame(updateStats);
  }, []);

  useEffect(() => {
    updateStats();
  }, [updateStats]);

  // Funzione per ottimizzare la scena
  const optimizeScene = useCallback(() => {
    if (!sceneRef.current) return;
    
    // 1. Consolida materiali simili
    const materialMap = new Map<string, THREE.Material>();
    
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.preventOptimization) {
        if (Array.isArray(object.material)) {
          // Gestisci materiali multipli
          object.material.forEach((mat, index) => {
            const materialKey = getMaterialKey(mat);
            if (!materialMap.has(materialKey)) {
              materialMap.set(materialKey, mat);
            } else {
              object.material[index] = materialMap.get(materialKey)!;
            }
          });
        } else if (object.material) {
          // Gestisci singolo materiale
          const material = object.material as THREE.Material;
          const materialKey = getMaterialKey(material);
          
          if (!materialMap.has(materialKey)) {
            materialMap.set(materialKey, material);
          } else {
            object.material = materialMap.get(materialKey)!;
          }
        }
      }
    });
    
    // 2. Ottimizza geometrie
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.preventOptimization) {
        try {
          // Assicurati che la geometria sia una BufferGeometry
          // Nota: fromGeometry è deprecato nelle versioni recenti
          if (object.geometry && !(object.geometry instanceof THREE.BufferGeometry)) {
            console.warn('Found non-BufferGeometry, this is unusual in recent Three.js versions');
            
            // Nelle versioni recenti di Three.js, tutte le geometrie sono BufferGeometry
            // Converti la geometria in BufferGeometry se necessario
            if (!(object.geometry instanceof THREE.BufferGeometry)) {
              object.geometry = new THREE.BufferGeometry().copy(object.geometry);
            }
          }
          
          // Ottimizza l'attributo di posizione se possibile
          if (object.geometry instanceof THREE.BufferGeometry) {
            const geometry = object.geometry;
            
            // Rimuovi attributi non necessari se esistono
            if (geometry.hasAttribute('color') && object.material.vertexColors !== true) {
              geometry.deleteAttribute('color');
            }
            
            // Non eliminare normali e UV se sono usati dal materiale
            if (!(object.material as any).map && geometry.hasAttribute('uv')) {
              geometry.deleteAttribute('uv');
            }
            
            // Ricalcola le normali solo se non esistono già
            if (!geometry.hasAttribute('normal')) {
              geometry.computeVertexNormals();
            }
          }
        } catch (e) {
          console.error('Error optimizing geometry:', e);
        }
      }
    });
    
    // 3. Imposta frustum culling
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.frustumCulled = true;
      }
    });
    
  }, [sceneRef]);
  
  // Helper per generare una chiave univoca per materiali simili
  const getMaterialKey = (material: THREE.Material): string => {
    if (material instanceof THREE.MeshStandardMaterial) {
      return `standard_${material.color.getHex()}_${material.roughness}_${material.metalness}_${material.wireframe}`;
    } else if (material instanceof THREE.MeshBasicMaterial) {
      return `basic_${material.color.getHex()}_${material.wireframe}`;
    } else if (material instanceof THREE.LineBasicMaterial) {
      return `line_${material.color.getHex()}_${material.linewidth}`;
    }
    return 'unknown';
  };

  return {
    optimizeScene,
    sceneStatistics
  };
}; 