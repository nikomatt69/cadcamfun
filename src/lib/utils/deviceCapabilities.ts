/**
 * Device Capabilities Detection Utilities
 *
 * Safe runtime detection of device capabilities without causing
 * WebGL context accumulation or HMR issues.
 */

import { detectWebGLCapabilities } from "../webgl/webglContextManager";

export interface DeviceCapabilities {
  isMobile: boolean;
  hasSharedArrayBuffer: boolean;
  hasWebAssembly: boolean;
  hasWebGL: boolean;
  hasWebGL2: boolean;
  memoryGB: number;
  hardwareConcurrency: number;
  maxTextureSize: number;
  maxRenderbufferSize: number;

  // Derived capabilities
  canUseWasm: boolean;
  canUseThreading: boolean;
  isHighEndDevice: boolean;
  isLowEndDevice: boolean;
}

/**
 * Detect device capabilities safely at runtime
 */
export function detectDeviceCapabilities(): DeviceCapabilities {
  const isMobile =
    typeof navigator !== "undefined"
      ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      : false;

  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
  const hasWebAssembly = typeof WebAssembly !== "undefined";

  // Get WebGL capabilities using the context manager
  const webglCaps =
    typeof window !== "undefined"
      ? detectWebGLCapabilities()
      : {
          hasWebGL: false,
          hasWebGL2: false,
          maxTextureSize: 0,
          maxRenderbufferSize: 0
        };

  const memoryGB =
    typeof navigator !== "undefined" && "deviceMemory" in navigator ? (navigator as any).deviceMemory || 4 : 4; // Default to 4GB if unknown

  const hardwareConcurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;

  const isHighEndDevice = memoryGB >= 8 && hardwareConcurrency >= 4;
  const isLowEndDevice = memoryGB < 4 || hardwareConcurrency < 2;

  return {
    isMobile,
    hasSharedArrayBuffer,
    hasWebAssembly,
    hasWebGL: webglCaps.hasWebGL,
    hasWebGL2: webglCaps.hasWebGL2,
    memoryGB,
    hardwareConcurrency,
    maxTextureSize: webglCaps.maxTextureSize,
    maxRenderbufferSize: webglCaps.maxRenderbufferSize,

    // Derived capabilities
    canUseWasm: hasWebAssembly,
    canUseThreading: hasSharedArrayBuffer,
    isHighEndDevice,
    isLowEndDevice
  };
}

/**
 * Get optimal WASM configuration based on device capabilities
 */
export function getOptimalWasmConfigForDevice(operationType: "cad" | "cam" | "mixed" = "cad") {
  const capabilities = detectDeviceCapabilities();

  // Dynamically import config to avoid HMR issues
  let performanceMode = "balanced";

  if (capabilities.isLowEndDevice || capabilities.isMobile) {
    performanceMode = "mobile";
  } else if (capabilities.isHighEndDevice) {
    performanceMode = "high-performance";
  }

  // Create configuration directly based on capabilities to avoid import issues
  const baseConfig = {
    preferEnhanced: true,
    enablePerformanceMonitoring: process.env.NODE_ENV === "development",
    memoryManagement: true,
    adaptiveResolution: true,
    targetFps: 60
  };

  // Configuration based on performance mode and operation type
  let config;

  if (performanceMode === "mobile") {
    config = {
      ...baseConfig,
      enableCSG: false,
      enableMeshOptimization: true,
      enableSnapping: false,
      enableConstraints: false,
      enableLOD: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: true,
      enableInstancing: true,
      enableToolpathOptimization: false,
      targetFps: 30,
      maxTriangles: 100000,
      highDetailThreshold: 30,
      mediumDetailThreshold: 100,
      lowDetailReduction: 0.05,
      mediumDetailReduction: 0.2
    };
  } else if (performanceMode === "high-performance") {
    config = {
      ...baseConfig,
      enableCSG: true,
      enableMeshOptimization: true,
      enableSnapping: true,
      enableConstraints: true,
      enableLOD: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: true,
      enableInstancing: true,
      enableToolpathOptimization: true,
      targetFps: 60,
      maxTriangles: 500000,
      highDetailThreshold: 50,
      mediumDetailThreshold: 150,
      lowDetailReduction: 0.1,
      mediumDetailReduction: 0.3
    };
  } else {
    // Balanced configuration
    config = {
      ...baseConfig,
      enableCSG: operationType === "cad" || operationType === "mixed",
      enableMeshOptimization: true,
      enableSnapping: operationType === "cad" || operationType === "mixed",
      enableConstraints: operationType === "cad" || operationType === "mixed",
      enableLOD: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: true,
      enableInstancing: true,
      enableToolpathOptimization: operationType === "cam" || operationType === "mixed",
      targetFps: process.env.NODE_ENV === "development" ? 30 : 60,
      maxTriangles: operationType === "cam" ? 2000000 : 1000000,
      highDetailThreshold: operationType === "cam" ? 200 : 100,
      mediumDetailThreshold: operationType === "cam" ? 500 : 300,
      lowDetailReduction: operationType === "cam" ? 0.2 : 0.3,
      mediumDetailReduction: operationType === "cam" ? 0.5 : 0.6
    };
  }

  // Adjust based on specific capabilities
  if (!capabilities.canUseThreading) {
    config.enableInstancing = false;
    config.enableGeometryOptimization = false;
  }

  if (!capabilities.hasWebGL2) {
    config.enableFrustumCulling = false;
    config.maxTriangles = Math.min(config.maxTriangles, 200000);
  }

  return config;
}
