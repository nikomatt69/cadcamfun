// src/hooks/canvas/useCADUpscaler.ts
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { ThreeJSUpscaler, UpscalerOptions } from "@/src/lib/canvas/ThreeJSUpscaler";

interface UseCADUpscalerProps {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  enabled?: boolean;
  options?: Partial<UpscalerOptions>;
}

interface UpscalerStats {
  scaleFactor: number;
  resolution: string;
  isActive: boolean;
  performanceGain: number;
}

export const useCADUpscaler = ({ renderer, scene, camera, enabled = true, options = {} }: UseCADUpscalerProps) => {
  const upscalerRef = useRef<ThreeJSUpscaler | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<UpscalerStats>({
    scaleFactor: 1.5,
    resolution: "",
    isActive: false,
    performanceGain: 0
  });
  const performanceMonitorRef = useRef({
    frameCount: 0,
    startTime: 0,
    lastFPS: 0
  });

  // Initialize upscaler when dependencies are ready
  useEffect(() => {
    if (!renderer || !scene || !camera || !enabled) {
      if (upscalerRef.current) {
        upscalerRef.current.dispose();
        upscalerRef.current = null;
        setIsInitialized(false);
      }
      return;
    }

    try {
      const defaultOptions: Partial<UpscalerOptions> = {
        scaleFactor: 1.5,
        useEdgeDetection: true,
        enableFSR: true,
        adaptiveQuality: true,
        debugMode: process.env.NODE_ENV === "development",
        ...options
      };

      upscalerRef.current = new ThreeJSUpscaler(renderer, scene, camera, defaultOptions);
      setIsInitialized(true);

      // Initialize performance monitoring
      performanceMonitorRef.current.startTime = performance.now();

      console.log("CAD Upscaler initialized with options:", defaultOptions);
    } catch (error) {
      console.error("Failed to initialize CAD Upscaler:", error);
      setIsInitialized(false);
    }
  }, [renderer, scene, camera, enabled]);

  // Handle options updates
  useEffect(() => {
    if (upscalerRef.current && isInitialized) {
      upscalerRef.current.updateOptions(options);
    }
  }, [options, isInitialized]);

  // Handle window resize
  const handleResize = useCallback(() => {
    if (upscalerRef.current && isInitialized) {
      upscalerRef.current.handleResize();
      updateStats();
    }
  }, [isInitialized]);

  // Update performance stats
  const updateStats = useCallback(() => {
    if (upscalerRef.current) {
      const qualityStats = upscalerRef.current.getQualityStats();
      const monitor = performanceMonitorRef.current;

      // Calculate performance gain estimation
      const scaleFactor = qualityStats.scaleFactor;
      const pixelReduction = 1 - 1 / (scaleFactor * scaleFactor);
      const estimatedGain = pixelReduction * 100;

      setStats({
        ...qualityStats,
        performanceGain: estimatedGain
      });
    }
  }, []);

  // Performance monitoring
  useEffect(() => {
    if (!isInitialized) return;

    const monitor = () => {
      const current = performanceMonitorRef.current;
      current.frameCount++;

      const elapsed = performance.now() - current.startTime;
      if (elapsed >= 1000) {
        // Update every second
        current.lastFPS = (current.frameCount * 1000) / elapsed;
        current.frameCount = 0;
        current.startTime = performance.now();
        updateStats();
      }

      requestAnimationFrame(monitor);
    };

    const monitorId = requestAnimationFrame(monitor);
    return () => cancelAnimationFrame(monitorId);
  }, [isInitialized, updateStats]);

  // Main render function
  const render = useCallback(() => {
    if (upscalerRef.current && enabled && isInitialized) {
      upscalerRef.current.render();
    } else if (renderer && scene && camera) {
      // Fallback to normal rendering
      renderer.render(scene, camera);
    }
  }, [renderer, scene, camera, enabled, isInitialized]);

  // Update upscaler options
  const updateOptions = useCallback(
    (newOptions: Partial<UpscalerOptions>) => {
      if (upscalerRef.current) {
        upscalerRef.current.updateOptions(newOptions);
        updateStats();
      }
    },
    [updateStats]
  );

  // Toggle upscaler
  const toggleUpscaler = useCallback(() => {
    const currentEnabled = stats.isActive;
    if (upscalerRef.current) {
      updateOptions({ scaleFactor: currentEnabled ? 1.0 : 1.5 });
    }
  }, [stats.isActive, updateOptions]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (upscalerRef.current) {
        upscalerRef.current.dispose();
      }
    };
  }, []);

  return {
    // Core functions
    render,
    handleResize,

    // Control functions
    updateOptions,
    toggleUpscaler,

    // State
    isInitialized,
    isEnabled: enabled,
    stats,

    // Presets for common CAD scenarios
    presets: {
      highQuality: () =>
        updateOptions({
          scaleFactor: 1.25,
          useEdgeDetection: true,
          enableFSR: true,
          adaptiveQuality: true
        }),

      balanced: () =>
        updateOptions({
          scaleFactor: 1.5,
          useEdgeDetection: true,
          enableFSR: true,
          adaptiveQuality: true
        }),

      performance: () =>
        updateOptions({
          scaleFactor: 2.0,
          useEdgeDetection: false,
          enableFSR: true,
          adaptiveQuality: false
        }),

      disabled: () =>
        updateOptions({
          scaleFactor: 1.0,
          useEdgeDetection: false,
          enableFSR: false,
          adaptiveQuality: false
        })
    }
  };
};
