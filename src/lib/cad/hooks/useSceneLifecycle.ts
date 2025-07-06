// Scene Lifecycle Hook - Consolidated Scene Management
// Phase 3 - Step 3.2: UseEffect Consolidation

import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { WasmCore, SceneOptions, RendererOptions } from './useWasmCore';
import CanvasPool from '@/src/lib/canvas/CanvasPool';

/**
 * Scene references returned by the hook
 */
export interface SceneRefs {
  sceneRef: React.RefObject<THREE.Scene>;
  rendererRef: React.RefObject<THREE.WebGLRenderer>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera>;
  controlsRef: React.RefObject<OrbitControls>;
  transformControlsRef: React.RefObject<TransformControls>;
  animationFrameIdRef: React.RefObject<number | null>;
}

/**
 * Scene lifecycle configuration
 */
export interface SceneLifecycleConfig extends SceneOptions {
  canvasRef: React.RefObject<HTMLDivElement>;
  width?: number;
  height?: number;
  
  // Camera settings
  fov?: number;
  near?: number;
  far?: number;
  cameraPosition?: { x: number; y: number; z: number };
  
  // Controls settings
  enableDamping?: boolean;
  dampingFactor?: number;
  minDistance?: number;
  maxDistance?: number;
  enableRotate?: boolean;
  enablePan?: boolean;
  enableZoom?: boolean;
  
  // Performance settings
  enableLOD?: boolean;
  enableFrustumCulling?: boolean;
  
  // Renderer settings
  rendererOptions?: RendererOptions;
}

/**
 * Hook for managing the complete lifecycle of a Three.js scene
 * Consolidates multiple useEffects into a single, optimized hook
 */
export function useSceneLifecycle(
  wasmCore: WasmCore,
  config: SceneLifecycleConfig
): SceneRefs {
  // Create refs for all Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  
  // Internal state refs
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.Group | null>(null);
  const lightsRef = useRef<THREE.Light[]>([]);
  
  // Memoized configuration to prevent unnecessary re-initializations
  const memoizedConfig = useMemo(() => {
    if (!config) return null;
    
    return {
      backgroundColor: config.backgroundColor || "#2A2A2A",
      enableShadows: config.enableShadows ?? true,
      enableFog: config.enableFog ?? false,
      gridVisible: config.gridVisible ?? true,
      axisVisible: config.axisVisible ?? true,
      
      // Camera
      fov: config.fov || 75,
      near: config.near || 0.01,
      far: config.far || 5000,
      cameraPosition: config.cameraPosition || { x: 0, y: 0, z: 5 },
      
      // Controls
      enableDamping: config.enableDamping ?? true,
      dampingFactor: config.dampingFactor || 0.1,
      minDistance: config.minDistance || 0.01,
      maxDistance: config.maxDistance || 5000,
      enableRotate: config.enableRotate ?? true,
      enablePan: config.enablePan ?? true,
      enableZoom: config.enableZoom ?? true,
      
      // Renderer
      rendererOptions: config.rendererOptions || {}
    };
  }, [
    config?.backgroundColor,
    config?.enableShadows,
    config?.enableFog,
    config?.gridVisible,
    config?.axisVisible,
    config?.fov,
    config?.near,
    config?.far,
    config?.cameraPosition,
    config?.enableDamping,
    config?.dampingFactor,
    config?.minDistance,
    config?.maxDistance,
    config?.enableRotate,
    config?.enablePan,
    config?.enableZoom,
    config?.rendererOptions
  ]);
  
  // Create custom axes helper with labels
  const createCustomAxes = useCallback((size: number = 30) => {
    const axesGroup = new THREE.Group();
    
    // Create axes lines
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // Blue for X
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Magenta for Y  
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff7f }); // Green for Z
    
    // X Axis
    const xAxisGeometry = new THREE.BufferGeometry();
    xAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-size, 0, 0, size, 0, 0], 3));
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    
    // Y Axis  
    const yAxisGeometry = new THREE.BufferGeometry();
    yAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -size, 0, 0, size, 0], 3));
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    
    // Z Axis
    const zAxisGeometry = new THREE.BufferGeometry();
    zAxisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -size, 0, 0, size], 3));
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    
    axesGroup.add(xAxis, yAxis, zAxis);
    
    // Add axis labels using canvas pool for performance
    const addAxisLabel = (text: string, position: [number, number, number], color: THREE.Color) => {
      try {
        const canvas = CanvasPool.getCanvas(`axisLabel-${text}`, 64, 64);
        const context = canvas.getContext('2d');
        
        if (context) {
          context.clearRect(0, 0, 64, 64);
          context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
          context.font = 'Bold 48px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(text, 32, 32);
          
          const texture = new THREE.CanvasTexture(canvas);
          const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.position.set(...position);
          sprite.scale.set(2, 2, 2);
          
          return sprite;
        }
      } catch (error) {
        console.warn(`Failed to create axis label for ${text}:`, error);
      }
      return null;
    };
    
    // Add labels
    const xLabel = addAxisLabel('X', [size + 1, 0, 0], new THREE.Color(0, 0, 1));
    const yLabel = addAxisLabel('Y', [0, size + 1, 0], new THREE.Color(1, 0, 1));
    const zLabel = addAxisLabel('Z', [0, 0, size + 1], new THREE.Color(0, 1, 0.5));
    
    if (xLabel) axesGroup.add(xLabel);
    if (yLabel) axesGroup.add(yLabel);
    if (zLabel) axesGroup.add(zLabel);
    
    axesGroup.userData.isCustomAxes = true;
    return axesGroup;
  }, []);
  
  // WASM-optimized animation loop
  const createAnimationLoop = useCallback(() => {
    const animate = () => {
      try {
        // Update controls with damping
        if (controlsRef.current?.enabled) {
          controlsRef.current.update();
        }
        
        // Update transform controls if attached
        if (transformControlsRef.current?.object) {
          const object = transformControlsRef.current.object;
          if (object.parent === null) {
            transformControlsRef.current.detach();
            console.warn('TransformControls: Detached object that lost scene connection');
          } else {
            object.updateMatrixWorld(true);
            object.parent.updateMatrixWorld(true);
          }
        }
        
        // WASM-optimized rendering
        if (rendererRef.current && cameraRef.current && sceneRef.current) {
          sceneRef.current.updateMatrixWorld(true);
          
          if (wasmCore.isReady) {
            // Use WASM optimization if available
            // This would include frustum culling, LOD, etc.
            console.debug('🚀 WASM-optimized render cycle');
          }
          
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        
        animationFrameIdRef.current = requestAnimationFrame(animate);
      } catch (error) {
        console.error('Animation loop error:', error);
        // Stop animation on error to prevent infinite error loops
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
      }
    };
    
    return animate;
  }, [wasmCore.isReady]);
  
  // Main scene initialization effect
  useEffect(() => {
    if (!config.canvasRef.current || !wasmCore.isReady) {
      console.log('⏳ Waiting for canvas and WASM core...');
      return;
    }
    
    console.log('🏗️ Initializing scene lifecycle...');
    
    try {
      // === SCENE CREATION ===
      const scene = wasmCore.createOptimizedScene(memoizedConfig as SceneOptions);
      sceneRef.current = scene;
      
      // === CAMERA CREATION ===
      const canvas = config.canvasRef.current;
      const camera = new THREE.PerspectiveCamera(
        memoizedConfig?.fov,
        canvas.clientWidth / canvas.clientHeight,
        memoizedConfig?.near,
        memoizedConfig?.far
      );
      camera.position.set(
        memoizedConfig?.cameraPosition?.x ?? 0,
        memoizedConfig?.cameraPosition?.y ?? 0,
        memoizedConfig?.cameraPosition?.z ?? 5
      );
      cameraRef.current = camera;
      
      // === RENDERER CREATION ===
      const renderer = wasmCore.createOptimizedRenderer({
        antialias: true,
        ...memoizedConfig?.rendererOptions
      });
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      
      // Enable shadows if configured
      if (memoizedConfig?.enableShadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      
      canvas.appendChild(renderer.domElement);
      rendererRef.current = renderer;
      
      // === CONTROLS CREATION ===
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = memoizedConfig?.enableDamping ?? true;
      controls.dampingFactor = memoizedConfig?.dampingFactor ?? 0.1;
      controls.minDistance = memoizedConfig?.minDistance ?? 0.01;
      controls.maxDistance = memoizedConfig?.maxDistance ?? 5000;
      controls.enableRotate = memoizedConfig?.enableRotate ?? true;
      controls.enablePan = memoizedConfig?.enablePan ?? true;
      controls.enableZoom = memoizedConfig?.enableZoom ?? true;
      controlsRef.current = controls;
      
      // === TRANSFORM CONTROLS ===
      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.addEventListener('dragging-changed', (event) => {
        if (controls) {
          controls.enabled = !event.value;
        }
      });
      scene.add(transformControls);
      transformControlsRef.current = transformControls;
      
      // === LIGHTING SETUP ===
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      lightsRef.current.push(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7.5);
      
      if (memoizedConfig?.enableShadows) {
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
      }
      
      scene.add(directionalLight);
      lightsRef.current.push(directionalLight);
      
      // === GRID HELPER ===
      const gridHelper = new THREE.GridHelper(500, 500);
      gridHelper.rotation.x = Math.PI / 2; // Rotate to XY plane
      gridHelper.visible = memoizedConfig?.gridVisible ?? true;
      scene.add(gridHelper);
      gridHelperRef.current = gridHelper;
      
      // === CUSTOM AXES ===
      const customAxes = createCustomAxes(30);
      customAxes.visible = memoizedConfig?.axisVisible ?? true;
      scene.add(customAxes);
      axesHelperRef.current = customAxes;
      
      // === RESIZE HANDLER ===
      const handleResize = () => {
        if (!canvas || !camera || !renderer) return;
        
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      
      window.addEventListener('resize', handleResize);
      
      // === ANIMATION LOOP ===
      const animate = createAnimationLoop();
      animate();
      
      console.log('✅ Scene lifecycle initialized successfully');
      
      // === CLEANUP FUNCTION ===
      return () => {
        console.log('🧹 Cleaning up scene lifecycle...');
        
        // Stop animation
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
          animationFrameIdRef.current = null;
        }
        
        // Remove resize listener
        window.removeEventListener('resize', handleResize);
        
        // Dispose of Three.js objects
        if (transformControlsRef.current) {
          transformControlsRef.current.dispose();
        }
        
        if (controlsRef.current) {
          controlsRef.current.dispose();
        }
        
        // Dispose scene using WASM core
        wasmCore.disposeScene(scene);
        
        // Dispose renderer
        if (renderer?.domElement?.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
        renderer?.dispose();
        
        // Clear refs
        sceneRef.current = null;
        rendererRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
        transformControlsRef.current = null;
        gridHelperRef.current = null;
        axesHelperRef.current = null;
        lightsRef.current = [];
      };
      
    } catch (error) {
      console.error('❌ Scene lifecycle initialization failed:', error);
      throw error;
    }
    
  }, [wasmCore.isReady, memoizedConfig, createAnimationLoop, createCustomAxes, config.canvasRef]);
  
  // Grid visibility update effect
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = memoizedConfig?.gridVisible ?? true;
    }
  }, [memoizedConfig?.gridVisible]);
  
  // Axis visibility update effect
  useEffect(() => {
    if (axesHelperRef.current) {
        axesHelperRef.current.visible = memoizedConfig?.axisVisible ?? true;
    }
  }, [memoizedConfig?.axisVisible]);
  
  // Return all refs for external use
  return {
    sceneRef,
    rendererRef,
    cameraRef,
    controlsRef,
    transformControlsRef,
    animationFrameIdRef
  };
}
