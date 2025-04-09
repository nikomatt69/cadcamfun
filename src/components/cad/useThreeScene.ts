import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface SceneOptions {
  backgroundColor?: string | number;
  cameraPosition?: [number, number, number];
  controlsConfig?: {
    enableDamping?: boolean;
    dampingFactor?: number;
    minDistance?: number;
    maxDistance?: number;
    enableZoom?: boolean;
    enableRotate?: boolean;
    enablePan?: boolean;
    zoomSpeed?: number;
  };
}

export const useThreeScene = (containerRef: React.RefObject<HTMLDivElement>) => {
  // Refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Initialize Three.js scene with container and options
  const initializeScene = useCallback((
    container: HTMLElement, 
    options: SceneOptions = {}
  ) => {
    // Default options
    const {
      backgroundColor = 0x2A2A2A,
      cameraPosition = [0, 0, 10],
      controlsConfig = {
        enableDamping: true,
        dampingFactor: 0.25,
        minDistance: 0.1,
        maxDistance: 1000,
        enableZoom: true,
        enableRotate: true,
        enablePan: true,
        zoomSpeed: 1.0
      }
    } = options;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);
    sceneRef.current = scene;

    // Create camera
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 5000);
    camera.position.set(...cameraPosition);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, controlsConfig);
    controlsRef.current = controls;

    // Animation loop
    const animate = () => {
      if (controls.enableDamping) {
        controls.update();
      }
      renderer.render(scene, camera);
      animationFrameId.current = requestAnimationFrame(animate);
    };
    
    animate();

    return {
      rendererInstance: renderer,
      sceneInstance: scene,
      cameraInstance: camera,
      controlsInstance: controls
    };
  }, []);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      
      // Clear references
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [containerRef]);

  // Handle container resizing
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [containerRef]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    initializeScene
  };
};
