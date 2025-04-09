// LibraryItemPreview.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {  LibraryItem } from 'src/components/cam/LibraryManagerUI';
import { createComponentPreview } from 'src/lib/libraryTransform';

interface LibraryItemPreviewProps {
  item: LibraryItem;
}

const LibraryItemPreview: React.FC<LibraryItemPreviewProps> = ({ item }) => {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSceneRef = useRef<THREE.Scene | null>(null);
  const previewRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const previewCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    if (!previewCanvasRef.current) return;

    // Crea scena, renderer e camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    previewSceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ canvas: previewCanvasRef.current, antialias: true });
    renderer.setSize(400, 300);
    previewRendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(45, 4/3, 0.1, 1000);
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);
    previewCameraRef.current = camera;

    // Aggiungi luci
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Funzione di animazione
    const animate = () => {
      if (previewRendererRef.current && previewSceneRef.current && previewCameraRef.current) {
        renderer.render(scene, camera);
      }
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    // Rimuovi eventuali oggetti precedenti dalla scena
    if (previewSceneRef.current) {
      while (previewSceneRef.current.children.length > 2) {
        previewSceneRef.current.remove(previewSceneRef.current.children[2]);
      }

      // Se un componente è selezionato, aggiungi la sua anteprima
      if (item.category === 'component') {
        const previewObject = createComponentPreview(item as LibraryItem);
        if (previewObject) {
          previewSceneRef.current.add(previewObject);
        }
      }

      // Rendering
      if (previewRendererRef.current && previewSceneRef.current && previewCameraRef.current) {
        previewRendererRef.current.render(previewSceneRef.current, previewCameraRef.current);
      }
    }
  }, [item]);

  return <canvas ref={previewCanvasRef} className="w-full h-auto" />;
};

export default LibraryItemPreview;