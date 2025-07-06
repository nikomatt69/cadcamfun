// Elements Rendering Hook - Consolidated Element Management
// Phase 3 - Step 3.2: UseEffect Consolidation

import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { debounce } from 'lodash';
import { WasmCore } from './useWasmCore';
import { SceneRefs } from './useSceneLifecycle';

/**
 * Element rendering configuration
 */
export interface ElementsRenderingConfig {
  elements: any[];
  selectedElement: any | null;
  selectedElementIds: string[];
  previewComponent: string | null;
  hoveredElementId: string | null;
  layers: any[];
  originOffset: { x: number; y: number; z: number };
  
  // Performance settings
  enableBatching?: boolean;
  batchSize?: number;
  updateThreshold?: number; // ms
  enableLOD?: boolean;
  enableControlPoints?: boolean;
  enablePreview?: boolean;
}

/**
 * Element update statistics
 */
export interface ElementUpdateStats {
  totalElements: number;
  updatedElements: number;
  batchedUpdates: number;
  wasmOptimized: number;
  lastUpdateTime: number;
  averageUpdateTime: number;
}

/**
 * Hook for managing CAD element rendering and updates
 * Consolidates multiple element-related useEffects into a single, optimized hook
 */
export function useElementsRendering(
  wasmCore: WasmCore,
  sceneRefs: SceneRefs,
  config: ElementsRenderingConfig
): {
  stats: ElementUpdateStats;
  updateElement: (elementId: string, updates: any) => void;
  refreshAllElements: () => void;
  clearScene: () => void;
} {
  // Internal state
  const elementObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const controlPointsRef = useRef<Map<string, THREE.Object3D[]>>(new Map());
  const previewObjectRef = useRef<THREE.Object3D | null>(null);
  const lastUpdateTime = useRef<number>(Date.now());
  const updateTimes = useRef<number[]>([]);
  
  // Statistics
  const statsRef = useRef<ElementUpdateStats>({
    totalElements: 0,
    updatedElements: 0,
    batchedUpdates: 0,
    wasmOptimized: 0,
    lastUpdateTime: 0,
    averageUpdateTime: 0
  });
  
  // Memoized configuration
  const memoizedConfig = useMemo(() => ({
    enableBatching: config.enableBatching ?? true,
    batchSize: config.batchSize || 50,
    updateThreshold: config.updateThreshold || 16, // 60 FPS
    enableLOD: config.enableLOD ?? true,
    enableControlPoints: config.enableControlPoints ?? true,
    enablePreview: config.enablePreview ?? true,
    ...config
  }), [
    config.enableBatching,
    config.batchSize,
    config.updateThreshold,
    config.enableLOD,
    config.enableControlPoints,
    config.enablePreview,
    config.elements,
    config.selectedElement,
    config.selectedElementIds,
    config.previewComponent,
    config.hoveredElementId,
    config.layers,
    config.originOffset
  ]);
  
  // Create Three.js object from CAD element
  const createThreeObject = useCallback((element: any): THREE.Object3D | null => {
    if (!wasmCore.isReady) {
      console.warn('⚠️ WASM core not ready, skipping element creation');
      return null;
    }
    
    try {
      // Try WASM-optimized creation first
      const wasmObject = wasmCore.createOptimizedThreeObject(element);
      if (wasmObject) {
        statsRef.current.wasmOptimized++;
        wasmObject.userData.elementId = element.id;
        wasmObject.userData.isCADElement = true;
        return wasmObject;
      }
      
      // Fallback to JavaScript implementation
      return createThreeObjectFallback(element);
      
    } catch (error) {
      console.error('Failed to create Three.js object for element:', element.id, error);
      return createThreeObjectFallback(element);
    }
  }, [wasmCore]);
  
  // Fallback Three.js object creation
  const createThreeObjectFallback = useCallback((element: any): THREE.Object3D | null => {
    const { originOffset } = memoizedConfig;
    
    switch (element.type) {
      case 'cube':
        const cubeGeometry = new THREE.BoxGeometry(element.width, element.height, element.depth);
        const cubeMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        cube.userData.elementId = element.id;
        cube.userData.isCADElement = true;
        return cube;
        
      case 'sphere':
        const sphereGeometry = new THREE.SphereGeometry(element.radius, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        sphere.userData.elementId = element.id;
        sphere.userData.isCADElement = true;
        return sphere;
        
      case 'cylinder':
        const cylinderGeometry = new THREE.CylinderGeometry(element.radius, element.radius, element.height, 32);
        const cylinderMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xffc107,
          wireframe: element.wireframe || false
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        cylinder.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );
        cylinder.rotation.x = Math.PI / 2;
        cylinder.userData.elementId = element.id;
        cylinder.userData.isCADElement = true;
        return cylinder;
        
      default:
        console.warn('Unknown element type:', element.type);
        return null;
    }
  }, [memoizedConfig]);
  
  // Create control points for selected elements
  const createControlPoints = useCallback((element: any): THREE.Object3D[] => {
    if (!memoizedConfig.enableControlPoints) return [];
    
    const controlPoints: THREE.Object3D[] = [];
    const pointGeometry = new THREE.SphereGeometry(3, 12, 12);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    
    switch (element.type) {
      case 'cube':
        // Create control points for cube corners
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const halfDepth = element.depth / 2;
        
        for (let i = 0; i < 8; i++) {
          const xSign = i & 1 ? 1 : -1;
          const ySign = i & 2 ? 1 : -1;
          const zSign = i & 4 ? 1 : -1;
          
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(
            element.x + (xSign * halfWidth),
            element.y + (ySign * halfHeight),
            element.z + (zSign * halfDepth)
          );
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = i;
          point.userData.controlFor = element.type;
          
          controlPoints.push(point);
        }
        break;
        
      case 'sphere':
        // Create control points for sphere (center + 6 directions)
        const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        centerPoint.position.set(element.x, element.y, element.z || 0);
        centerPoint.userData.isControlPoint = true;
        centerPoint.userData.elementId = element.id;
        centerPoint.userData.pointIndex = 0;
        centerPoint.userData.controlFor = element.type;
        controlPoints.push(centerPoint);
        
        // Six direction points
        const directions = [
          [1, 0, 0], [-1, 0, 0],
          [0, 1, 0], [0, -1, 0],
          [0, 0, 1], [0, 0, -1]
        ];
        
        directions.forEach((dir, idx) => {
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + dir[0] * element.radius,
            element.y + dir[1] * element.radius,
            (element.z || 0) + dir[2] * element.radius
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = idx + 1;
          radiusPoint.userData.controlFor = element.type;
          controlPoints.push(radiusPoint);
        });
        break;
        
      default:
        // Create basic center control point for unknown types
        const basicPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        basicPoint.position.set(element.x, element.y, element.z || 0);
        basicPoint.userData.isControlPoint = true;
        basicPoint.userData.elementId = element.id;
        basicPoint.userData.pointIndex = 0;
        basicPoint.userData.controlFor = element.type;
        controlPoints.push(basicPoint);
        break;
    }
    
    return controlPoints;
  }, [memoizedConfig.enableControlPoints]);
  
  // Debounced batch update function
  const debouncedBatchUpdate = useMemo(
    () => debounce((elements: any[]) => {
      if (!sceneRefs.sceneRef.current || !wasmCore.isReady) return;
      
      const startTime = performance.now();
      
      try {
        if (memoizedConfig.enableBatching && elements.length > memoizedConfig.batchSize) {
          // Use WASM batch processing for large updates
          console.log(`🧵 Batch processing ${elements.length} elements with WASM`);
          wasmCore.batchUpdateElements(elements);
          statsRef.current.batchedUpdates++;
        } else {
          // Process elements individually
          elements.forEach(element => {
            updateSingleElement(element);
          });
        }
        
        // Update statistics
        const endTime = performance.now();
        const updateTime = endTime - startTime;
        updateTimes.current.push(updateTime);
        
        // Keep only last 100 update times for average calculation
        if (updateTimes.current.length > 100) {
          updateTimes.current = updateTimes.current.slice(-100);
        }
        
        statsRef.current.totalElements = elements.length;
        statsRef.current.updatedElements = elements.length;
        statsRef.current.lastUpdateTime = endTime;
        statsRef.current.averageUpdateTime = 
          updateTimes.current.reduce((sum, time) => sum + time, 0) / updateTimes.current.length;
        
        console.log(`✅ Updated ${elements.length} elements in ${updateTime.toFixed(2)}ms`);
        
      } catch (error) {
        console.error('Batch update failed:', error);
      }
    }, memoizedConfig.updateThreshold),
    [wasmCore.isReady, memoizedConfig.enableBatching, memoizedConfig.batchSize, memoizedConfig.updateThreshold]
  );
  
  // Update single element
  const updateSingleElement = useCallback((element: any) => {
    if (!sceneRefs.sceneRef.current) return;
    
    const scene = sceneRefs.sceneRef.current;
    const existingObject = elementObjectsRef.current.get(element.id);
    
    // Remove existing object if it exists
    if (existingObject) {
      scene.remove(existingObject);
      
      // Dispose geometry and materials
      if (existingObject instanceof THREE.Mesh) {
        existingObject.geometry?.dispose();
        if (Array.isArray(existingObject.material)) {
          existingObject.material.forEach(mat => mat.dispose());
        } else {
          existingObject.material?.dispose();
        }
      }
      
      elementObjectsRef.current.delete(element.id);
    }
    
    // Create new object
    const newObject = createThreeObject(element);
    if (newObject) {
      scene.add(newObject);
      elementObjectsRef.current.set(element.id, newObject);
    }
  }, [createThreeObject, sceneRefs.sceneRef]);
  
  // Update control points for selected elements
  const updateControlPoints = useCallback(() => {
    if (!sceneRefs.sceneRef.current || !memoizedConfig.enableControlPoints) return;
    
    const scene = sceneRefs.sceneRef.current;
    
    // Remove all existing control points
    controlPointsRef.current.forEach((points, elementId) => {
      points.forEach(point => scene.remove(point));
    });
    controlPointsRef.current.clear();
    
    // Add control points for selected elements
    const selectedElements = [
      ...(memoizedConfig.selectedElement ? [memoizedConfig.selectedElement] : []),
      ...memoizedConfig.elements.filter(el => 
        memoizedConfig.selectedElementIds.includes(el.id) && 
        el.id !== memoizedConfig.selectedElement?.id
      )
    ];
    
    selectedElements.forEach(element => {
      const controlPoints = createControlPoints(element);
      controlPoints.forEach(point => scene.add(point));
      controlPointsRef.current.set(element.id, controlPoints);
    });
    
  }, [
    memoizedConfig.selectedElement,
    memoizedConfig.selectedElementIds,
    memoizedConfig.elements,
    memoizedConfig.enableControlPoints,
    createControlPoints,
    sceneRefs.sceneRef
  ]);
  
  // Update preview component
  const updatePreviewComponent = useCallback(() => {
    if (!sceneRefs.sceneRef.current || !memoizedConfig.enablePreview) return;
    
    const scene = sceneRefs.sceneRef.current;
    
    // Remove existing preview
    if (previewObjectRef.current) {
      scene.remove(previewObjectRef.current);
      previewObjectRef.current = null;
    }
    
    // Add new preview if component is selected
    if (memoizedConfig.previewComponent) {
      // This would create a preview object based on the component
      // For now, create a simple placeholder
      const previewGeometry = new THREE.BoxGeometry(1, 1, 1);
      const previewMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a90e2,
        opacity: 0.7,
        transparent: true
      });
      
      const previewObject = new THREE.Mesh(previewGeometry, previewMaterial);
      previewObject.userData.isPreview = true;
      previewObject.userData.componentId = memoizedConfig.previewComponent;
      
      scene.add(previewObject);
      previewObjectRef.current = previewObject;
    }
  }, [memoizedConfig.previewComponent, memoizedConfig.enablePreview, sceneRefs.sceneRef]);
  
  // Manual element update function
  const updateElement = useCallback((elementId: string, updates: any) => {
    const element = memoizedConfig.elements.find(el => el.id === elementId);
    if (!element) return;
    
    const updatedElement = { ...element, ...updates };
    updateSingleElement(updatedElement);
  }, [memoizedConfig.elements, updateSingleElement]);
  
  // Refresh all elements
  const refreshAllElements = useCallback(() => {
    debouncedBatchUpdate(memoizedConfig.elements);
  }, [memoizedConfig.elements, debouncedBatchUpdate]);
  
  // Clear scene
  const clearScene = useCallback(() => {
    if (!sceneRefs.sceneRef.current) return;
    
    const scene = sceneRefs.sceneRef.current;
    
    // Remove all element objects
    elementObjectsRef.current.forEach((object, elementId) => {
      scene.remove(object);
      
      // Dispose geometry and materials
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material?.dispose();
        }
      }
    });
    elementObjectsRef.current.clear();
    
    // Remove all control points
    controlPointsRef.current.forEach((points) => {
      points.forEach(point => scene.remove(point));
    });
    controlPointsRef.current.clear();
    
    // Remove preview
    if (previewObjectRef.current) {
      scene.remove(previewObjectRef.current);
      previewObjectRef.current = null;
    }
    
    console.log('🧹 Scene cleared');
  }, [sceneRefs.sceneRef]);
  
  // Main elements update effect
  useEffect(() => {
    if (!wasmCore.isReady || !sceneRefs.sceneRef.current) {
      console.log('⏳ Waiting for WASM core and scene...');
      return;
    }
    
    console.log('🔄 Updating elements:', memoizedConfig.elements.length);
    debouncedBatchUpdate(memoizedConfig.elements);
    
  }, [wasmCore.isReady, memoizedConfig.elements, debouncedBatchUpdate, sceneRefs.sceneRef]);
  
  // Control points update effect
  useEffect(() => {
    updateControlPoints();
  }, [updateControlPoints]);
  
  // Preview component update effect
  useEffect(() => {
    updatePreviewComponent();
  }, [updatePreviewComponent]);
  
  // Cleanup effect
  useEffect(() => {
    return () => {
      clearScene();
      debouncedBatchUpdate.cancel();
    };
  }, [clearScene, debouncedBatchUpdate]);
  
  return {
    stats: statsRef.current,
    updateElement,
    refreshAllElements,
    clearScene
  };
}
