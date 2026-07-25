// CustomElementPreview.tsx - Anteprima 3D per Custom Elements
// Componente indipendente per il rendering Three.js

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { RefreshCcw } from 'react-feather';
import { CustomElementDefinition } from './types';

interface CustomElementPreviewProps {
  object: THREE.Object3D | null;
  definition: CustomElementDefinition;
  isLoading?: boolean;
}

export const CustomElementPreview: React.FC<CustomElementPreviewProps> = ({
  object,
  definition,
  isLoading = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const currentObjectRef = useRef<THREE.Object3D | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Mouse controls state
  const mouseRef = useRef({
    isDragging: false,
    previousPosition: { x: 0, y: 0 },
    spherical: new THREE.Spherical(5, Math.PI / 3, Math.PI / 4)
  });

  // Initialize scene
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const rect = container.getBoundingClientRect();

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(definition.previewConfig?.background || '#f0f0f0');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      rect.width / rect.height,
      0.1,
      1000
    );
    
    const cameraPos = definition.previewConfig?.camera?.position || [3, 3, 3];
    camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
    
    const target = new THREE.Vector3(...(definition.previewConfig?.camera?.target || [0, 0, 0]));
    camera.lookAt(target);
    
    cameraRef.current = camera;

    // Initialize spherical coordinates from camera position
    mouseRef.current.spherical.setFromVector3(camera.position.clone().sub(target));

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true
    });
    renderer.setSize(rect.width, rect.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // Lighting
    if (definition.previewConfig?.lighting !== false) {
      // Ambient light
      const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
      scene.add(ambientLight);

      // Directional light
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 5, 5);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
      scene.add(directionalLight);

      // Fill light
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-5, 0, -5);
      scene.add(fillLight);
    }

    // Grid helper
    const grid = new THREE.GridHelper(10, 10, 0xcccccc, 0xeeeeee);
    scene.add(grid);

    // Axes helper
    const axes = new THREE.AxesHelper(2);
    scene.add(axes);

    // Mouse controls
    const handleMouseDown = (event: MouseEvent) => {
      mouseRef.current.isDragging = true;
      mouseRef.current.previousPosition = { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!mouseRef.current.isDragging) return;

      const deltaMove = {
        x: event.clientX - mouseRef.current.previousPosition.x,
        y: event.clientY - mouseRef.current.previousPosition.y
      };

      // Update spherical coordinates
      mouseRef.current.spherical.theta -= deltaMove.x * 0.01;
      mouseRef.current.spherical.phi += deltaMove.y * 0.01;
      
      // Clamp phi to prevent camera flipping
      mouseRef.current.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, mouseRef.current.spherical.phi));

      // Update camera position
      const target = new THREE.Vector3(...(definition.previewConfig?.camera?.target || [0, 0, 0]));
      camera.position.setFromSpherical(mouseRef.current.spherical).add(target);
      camera.lookAt(target);

      mouseRef.current.previousPosition = { x: event.clientX, y: event.clientY };
    };

    const handleMouseUp = () => {
      mouseRef.current.isDragging = false;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaY > 0 ? 1.1 : 0.9;
      
      // Update spherical radius
      mouseRef.current.spherical.radius *= scale;
      mouseRef.current.spherical.radius = Math.max(0.5, Math.min(50, mouseRef.current.spherical.radius));
      
      // Update camera position
      const target = new THREE.Vector3(...(definition.previewConfig?.camera?.target || [0, 0, 0]));
      camera.position.setFromSpherical(mouseRef.current.spherical).add(target);
      camera.lookAt(target);
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [definition]);

  // Update object in scene
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove previous object
    if (currentObjectRef.current) {
      sceneRef.current.remove(currentObjectRef.current);
      
      // Dispose geometry and materials
      currentObjectRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }

    // Add new object
    if (object) {
      // Enable shadows
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      sceneRef.current.add(object);
      currentObjectRef.current = object;

      // Auto-fit camera to object
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      if (maxDim > 0 && cameraRef.current) {
        // Update spherical radius based on object size
        mouseRef.current.spherical.radius = Math.max(maxDim * 2, 3);
        
        // Update camera position
        const target = new THREE.Vector3(...(definition.previewConfig?.camera?.target || [0, 0, 0]));
        cameraRef.current.position.setFromSpherical(mouseRef.current.spherical).add(target);
        cameraRef.current.lookAt(target);
      }
    } else {
      currentObjectRef.current = null;
    }
  }, [object, definition]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      
      const rect = mountRef.current.getBoundingClientRect();
      cameraRef.current.aspect = rect.width / rect.height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(rect.width, rect.height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-full bg-gray-50 dark:bg-gray-900">
      <div ref={mountRef} className="w-full h-full" />
      
      {isLoading && (
        <div className="absolute inset-0 bg-white dark:bg-gray-800 bg-opacity-75 flex items-center justify-center">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
            <RefreshCcw className="w-5 h-5 animate-spin" />
            <span>Generating preview...</span>
          </div>
        </div>
      )}

      {!object && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <div className="text-2xl mb-2">📦</div>
            <div>No preview available</div>
            <div className="text-sm">Fix validation errors and click Preview</div>
          </div>
        </div>
      )}

      {/* Camera controls help */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
        <div>🖱️ Drag: Rotate</div>
        <div>🔘 Scroll: Zoom</div>
      </div>

      {/* Object info */}
      {object && !isLoading && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
          <div>Vertices: {object.userData.vertexCount || 'N/A'}</div>
          <div>Type: {object.type}</div>
        </div>
      )}
    </div>
  );
};
