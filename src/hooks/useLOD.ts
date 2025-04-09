import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

export const useLOD = (
  sceneRef: React.RefObject<THREE.Scene>,
  cameraRef: React.RefObject<THREE.PerspectiveCamera>
) => {
  const frameIdRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);

  // Assicurati che isUnmountedRef sia sempre correttamente inizializzato e gestisci
  // correttamente il cleanup quando il componente viene smontato o nascosto
  useEffect(() => {
    isUnmountedRef.current = false;
    
    // Funzione di cleanup immediata quando il componente viene smontato
    const cleanup = () => {
      isUnmountedRef.current = true;
      
      if (frameIdRef.current) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
    };
    
    // Cleanup anche se il componente viene nascosto (navigazione via client)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cleanup();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanup();
    };
  }, []);

  // Applica LOD agli oggetti nella scena
  const applyLOD = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || isUnmountedRef.current) return;
    
    const camera = cameraRef.current;
    const cameraPosition = camera.position.clone();
    
    // Cancella eventuali loop precedenti
    if (frameIdRef.current) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = 0;
    }
    
    // Funzione per applicare LOD ad ogni frame
    const updateLOD = () => {
      if (!sceneRef.current || !cameraRef.current || isUnmountedRef.current) return;
      
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh && !object.userData.isControlPoint) {
          const distance = cameraPosition.distanceTo(object.position);
          
          // Imposta different LOD in base alla distanza
          if (object.geometry instanceof THREE.BufferGeometry) {
            if (distance > 50) {
              // Oggetti lontani - riduce la qualità
              if (object.userData.originalGeometry && !object.userData.isLowDetail) {
                object.userData.isLowDetail = true;
                
                // Crea versione semplificata
                let simplifiedGeometry: THREE.BufferGeometry;
                
                if (object instanceof THREE.Mesh) {
                  if (object.geometry instanceof THREE.SphereGeometry || 
                      object.geometry.type === 'SphereGeometry') {
                    simplifiedGeometry = new THREE.SphereGeometry(
                      (object.geometry as any).parameters.radius,
                      Math.max(8, Math.floor((object.geometry as any).parameters.widthSegments / 3)),
                      Math.max(6, Math.floor((object.geometry as any).parameters.heightSegments / 3))
                    );
                  } else if (object.geometry instanceof THREE.BoxGeometry || 
                             object.geometry.type === 'BoxGeometry') {
                    simplifiedGeometry = new THREE.BoxGeometry(
                      (object.geometry as any).parameters.width,
                      (object.geometry as any).parameters.height,
                      (object.geometry as any).parameters.depth
                    );
                  } else if (object.geometry instanceof THREE.CylinderGeometry || 
                             object.geometry.type === 'CylinderGeometry') {
                    simplifiedGeometry = new THREE.CylinderGeometry(
                      (object.geometry as any).parameters.radiusTop,
                      (object.geometry as any).parameters.radiusBottom,
                      (object.geometry as any).parameters.height,
                      Math.max(8, Math.floor((object.geometry as any).parameters.radialSegments / 3))
                    );
                  } else {
                    // Fallback: usa la geometria originale
                    simplifiedGeometry = object.geometry.clone();
                  }
                  
                  // Applica la geometria semplificata
                  object.geometry = simplifiedGeometry;
                }
              }
            } else {
              // Oggetti vicini - usa la geometria originale ad alta qualità
              if (object.userData.originalGeometry && object.userData.isLowDetail) {
                object.geometry = object.userData.originalGeometry.clone();
                object.userData.isLowDetail = false;
              }
            }
          }
        }
      });
      
      if (!isUnmountedRef.current) {
        frameIdRef.current = window.requestAnimationFrame(updateLOD);
      }
    };
    
    // Memorizza le geometrie originali per ogni oggetto
    try {
      if (sceneRef.current && !isUnmountedRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh && !object.userData.isControlPoint) {
            if (!object.userData.originalGeometry) {
              object.userData.originalGeometry = object.geometry.clone();
              object.userData.isLowDetail = false;
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error while storing original geometries:', e);
    }
    
    // Avvia il loop di aggiornamento LOD solo se il componente è ancora montato
    if (!isUnmountedRef.current) {
      frameIdRef.current = window.requestAnimationFrame(updateLOD);
    }
  }, [sceneRef, cameraRef]);

  return { applyLOD };
};