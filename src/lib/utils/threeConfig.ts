// src/utils/threeConfig.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass';

import ThreeOptimizer from './threeOptimizer';

/**
 * Configuration options for CAD/CAM Three.js setup
 */
export interface ThreeConfig {
  /** Canvas element to render on */
  canvas: HTMLCanvasElement;
  
  /** Enable antialiasing (affects performance) */
  antialias?: boolean;
  
  /** Quality preset to use */
  quality?: 'low' | 'medium' | 'high' | 'auto';
  
  /** Enable shadows (affects performance) */
  shadows?: boolean;
  
  /** Background color */
  backgroundColor?: string | number;
  
  /** Enable selection outline effect */
  selectionOutline?: boolean;
  
  /** Enable adaptive quality based on performance */
  adaptiveQuality?: boolean;
  
  /** Custom post-processing effects */
  postProcessing?: boolean;
  
  /** Enable performance stats display */
  stats?: boolean;
  
  /** Element to attach stats to */
  statsElement?: HTMLElement;
  
  /** Grid helper settings */
  grid?: {
    enabled: boolean;
    size?: number;
    divisions?: number;
    color1?: string | number;
    color2?: string | number;
  };
  
  /** Axes helper settings */
  axes?: {
    enabled: boolean;
    size?: number;
  };
}

/**
 * Default configuration for CAD/CAM application
 */
export const DEFAULT_THREE_CONFIG: ThreeConfig = {
  canvas: document.createElement('canvas'), // Will be overridden
  antialias: true,
  quality: 'auto',
  shadows: false,
  backgroundColor: 0xf8f9fa,
  selectionOutline: true,
  adaptiveQuality: true,
  postProcessing: true,
  stats: false,
  grid: {
    enabled: true,
    size: 100,
    divisions: 100,
    color1: 0xcccccc,
    color2: 0x888888
  },
  axes: {
    enabled: true,
    size: 50
  }
};

/**
 * Setup Three.js environment for CAD/CAM with optimizations
 */
export function setupThreeEnvironment(config: ThreeConfig) {
  // Merge with default config
  const finalConfig = { ...DEFAULT_THREE_CONFIG, ...config };
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({
    canvas: finalConfig.canvas,
    antialias: finalConfig.antialias,
    alpha: true,
    powerPreference: 'high-performance',
    precision: finalConfig.quality === 'low' ? 'lowp' : 'highp',
  });
  
  // Set pixel ratio based on quality
  switch (finalConfig.quality) {
    case 'low':
      renderer.setPixelRatio(1);
      break;
    case 'medium':
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      break;
    case 'high':
      renderer.setPixelRatio(window.devicePixelRatio);
      break;
    case 'auto':
    default:
      renderer.setPixelRatio(window.devicePixelRatio > 1 ? 1.5 : 1);
      break;
  }
  
  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(finalConfig.backgroundColor);
  
  // Setup camera (perspective is better for CAD)
  const camera = new THREE.PerspectiveCamera(
    45, // FOV
    finalConfig.canvas.width / finalConfig.canvas.height, // Aspect ratio
    0.1, // Near
    10000 // Far
  );
  
  camera.position.set(50, 50, 100);
  camera.lookAt(0, 0, 0);
  
  // Add orbit controls
  const controls = new OrbitControls(camera, finalConfig.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  
  // Setup lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 30);
  
  // Shadow settings
  if (finalConfig.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    
    // Optimize shadow camera frustum for the scene
    const d = 100;
    directionalLight.shadow.camera.left = -d;
    directionalLight.shadow.camera.right = d;
    directionalLight.shadow.camera.top = d;
    directionalLight.shadow.camera.bottom = -d;
  }
  
  scene.add(directionalLight);
  
  // Add helpers
  if (finalConfig.grid?.enabled) {
    const gridHelper = new THREE.GridHelper(
      finalConfig.grid.size || 100,
      finalConfig.grid.divisions || 100,
      new THREE.Color(finalConfig.grid.color1 || 0xcccccc),
      new THREE.Color(finalConfig.grid.color2 || 0x888888)
    );
    scene.add(gridHelper);
  }
  
  if (finalConfig.axes?.enabled) {
    const axesHelper = new THREE.AxesHelper(finalConfig.axes.size || 50);
    scene.add(axesHelper);
  }
  
  // Create optimizer
  const optimizer = new ThreeOptimizer(renderer, scene);
  
  // Setup post-processing
  let composer: EffectComposer | null = null;
  let outlinePass: OutlinePass | null = null;
  
  if (finalConfig.postProcessing) {
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    if (finalConfig.selectionOutline) {
      outlinePass = new OutlinePass(
        new THREE.Vector2(
          finalConfig.canvas.width,
          finalConfig.canvas.height
        ),
        scene,
        camera
      );
      outlinePass.edgeStrength = 3;
      outlinePass.edgeGlow = 0;
      outlinePass.edgeThickness = 1;
      outlinePass.pulsePeriod = 0;
      outlinePass.visibleEdgeColor.set('#ffffff');
      outlinePass.hiddenEdgeColor.set('#190a05');
      composer.addPass(outlinePass);
    }
  }
  
  // Adaptive quality
  let cleanupAdaptiveQuality: (() => void) | null = null;
  
  if (finalConfig.adaptiveQuality && composer) {
    cleanupAdaptiveQuality = optimizer.enableAdaptiveQuality(
      composer,
      60,
      (quality) => {
        console.log(`Quality adjusted to: ${quality}`);
      }
    );
  }
  
  // Stats
  let stats: any = null;
  if (finalConfig.stats && finalConfig.statsElement) {
    stats = optimizer.enableStats(finalConfig.statsElement);
    finalConfig.statsElement.appendChild(stats.dom);
  }
  
  // Setup resize handler
  function handleResize() {
    const width = finalConfig.canvas.clientWidth;
    const height = finalConfig.canvas.clientHeight;
    
    if (finalConfig.canvas.width !== width || finalConfig.canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      if (composer) {
        composer.setSize(width, height);
      }
    }
  }
  
  window.addEventListener('resize', handleResize);
  handleResize();
  
  // Create render loop
  function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    
    if (stats) {
      stats.update();
    }
  }
  
  // Start animation loop
  animate();
  
  // Return objects to be used by the application
  return {
    scene,
    camera,
    renderer,
    controls,
    optimizer,
    composer,
    outlinePass,
    
    // Selection handling
    setSelectedObjects: (objects: THREE.Object3D[]) => {
      if (outlinePass) {
        outlinePass.selectedObjects = objects;
      }
    },
    
    // Cleanup function to prevent memory leaks
    cleanup: () => {
      if (cleanupAdaptiveQuality) {
        cleanupAdaptiveQuality();
      }
      
      window.removeEventListener('resize', handleResize);
      
      controls.dispose();
      
      optimizer.disposeAll();
      optimizer.disposeScene();
      
      renderer.dispose();
      
      if (composer) {
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
    }
  };
}