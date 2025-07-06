/**
 * WASM Production Configuration
 * 
 * This file contains production-ready configurations for the unified WASM system.
 * Import and use these configurations in your components for optimal performance.
 */

// Base configuration for all WASM operations
const baseWasmConfig = {
  preferEnhanced: true,
  enablePerformanceMonitoring: process.env.NODE_ENV === 'development',
  memoryManagement: true,
  adaptiveResolution: true,
  targetFps: 60
};

// Optimized configuration for CAD operations
export const cadWasmConfig = {
  ...baseWasmConfig,
  enableCSG: true,
  enableMeshOptimization: true,
  enableSnapping: true,
  enableConstraints: true,
  enableLOD: true,
  enableFrustumCulling: true,
  enableGeometryOptimization: true,
  enableInstancing: true,
  
  // CAD-specific thresholds
  highDetailThreshold: 100,     // Objects closer than 100 units = high detail
  mediumDetailThreshold: 300,   // Objects 100-300 units = medium detail
  lowDetailReduction: 0.3,      // Reduce to 30% of original triangles for distant objects
  mediumDetailReduction: 0.6,   // Reduce to 60% of original triangles for medium distance
  
  // Performance targets for CAD
  targetFps: process.env.NODE_ENV === 'development' ? 30 : 60,
  maxTriangles: 1000000,        // Maximum triangles before aggressive optimization
  
  // CAD-specific features
  enableToolpathOptimization: false // Usually not needed for pure CAD operations
};

// Optimized configuration for CAM/Toolpath operations  
export const camWasmConfig = {
  ...baseWasmConfig,
  enableToolpathOptimization: true,
  enableLOD: true,
  enableFrustumCulling: true,
  enableGeometryOptimization: true,
  enableInstancing: true,
  
  // CAM usually doesn't need CSG operations
  enableCSG: false,
  enableMeshOptimization: true,
  enableSnapping: false,
  enableConstraints: false,
  
  // Performance targets for CAM (more aggressive)
  targetFps: process.env.NODE_ENV === 'development' ? 30 : 60,
  maxTriangles: 2000000,        // CAM can handle more triangles
  
  // CAM-specific thresholds
  highDetailThreshold: 200,     // Toolpaths can be less detailed at distance
  mediumDetailThreshold: 500,   
  lowDetailReduction: 0.2,      // More aggressive reduction for toolpaths
  mediumDetailReduction: 0.5
};

// High-performance configuration for complex scenes
export const highPerformanceWasmConfig = {
  ...baseWasmConfig,
  enableCSG: true,
  enableMeshOptimization: true,
  enableSnapping: true,
  enableConstraints: true,
  enableLOD: true,
  enableFrustumCulling: true,
  enableGeometryOptimization: true,
  enableInstancing: true,
  enableToolpathOptimization: true,
  
  // Aggressive performance settings
  targetFps: 60,
  adaptiveResolution: true,
  maxTriangles: 500000,         // Lower threshold for aggressive optimization
  
  // Aggressive LOD settings
  highDetailThreshold: 50,      
  mediumDetailThreshold: 150,   
  lowDetailReduction: 0.1,      // Very aggressive reduction
  mediumDetailReduction: 0.3
};

// Development configuration with extensive debugging
export const developmentWasmConfig = {
  ...baseWasmConfig,
  enablePerformanceMonitoring: true,
  enableCSG: true,
  enableMeshOptimization: true,
  enableSnapping: true,
  enableConstraints: true,
  enableLOD: true,
  enableFrustumCulling: true,
  enableGeometryOptimization: true,
  enableInstancing: true,
  enableToolpathOptimization: true,
  
  // Relaxed performance for development
  targetFps: 30,
  adaptiveResolution: false,    // Disable for consistent debugging
  maxTriangles: 2000000,        // Higher threshold for development
  
  // Less aggressive LOD for development
  highDetailThreshold: 200,     
  mediumDetailThreshold: 600,   
  lowDetailReduction: 0.5,      
  mediumDetailReduction: 0.7
};

// Mobile-optimized configuration
export const mobileWasmConfig = {
  ...baseWasmConfig,
  enableCSG: false,             // Disable expensive operations on mobile
  enableMeshOptimization: true,
  enableSnapping: false,
  enableConstraints: false,
  enableLOD: true,
  enableFrustumCulling: true,
  enableGeometryOptimization: true,
  enableInstancing: true,
  enableToolpathOptimization: false,
  
  // Mobile-specific performance
  targetFps: 30,
  adaptiveResolution: true,
  maxTriangles: 100000,         // Much lower for mobile
  
  // Very aggressive LOD for mobile
  highDetailThreshold: 30,      
  mediumDetailThreshold: 100,   
  lowDetailReduction: 0.05,     // Extremely aggressive
  mediumDetailReduction: 0.2
};

// Configuration selector based on environment and device
export function getOptimalWasmConfig(context = {}) {
  const {
    isMobile = false,
    isDevelopment = process.env.NODE_ENV === 'development',
    operationType = 'cad', // 'cad', 'cam', 'mixed'
    performanceMode = 'balanced' // 'balanced', 'high-performance', 'mobile'
  } = context;
  
  // Mobile override
  if (isMobile) {
    return mobileWasmConfig;
  }
  
  // Development override
  if (isDevelopment) {
    return developmentWasmConfig;
  }
  
  // Performance mode selection
  if (performanceMode === 'high-performance') {
    return highPerformanceWasmConfig;
  }
  
  // Operation type selection
  switch (operationType) {
    case 'cam':
      return camWasmConfig;
    case 'mixed':
      return {
        ...cadWasmConfig,
        enableToolpathOptimization: true,
        maxTriangles: 1500000
      };
    case 'cad':
    default:
      return cadWasmConfig;
  }
}

// Utility function to detect device capabilities
export function detectDeviceCapabilities() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasWebAssembly = typeof WebAssembly !== 'undefined';
  
  // Simple WebGL detection without creating contexts
  let hasWebGL2 = false;
  let hasWebGL = false;
  
  // Only detect in browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      // Quick test without creating persistent contexts
      const tempCanvas = document.createElement('canvas');
      const gl2 = tempCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      if (gl2) {
        hasWebGL2 = true;
        hasWebGL = true;
        // Immediately lose context to prevent accumulation
        const loseContext = gl2.getExtension('WEBGL_lose_context');
        if (loseContext) loseContext.loseContext();
      } else {
        const gl = tempCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
        if (gl) {
          hasWebGL = true;
          // Immediately lose context to prevent accumulation
          const loseContext = gl.getExtension('WEBGL_lose_context');
          if (loseContext) loseContext.loseContext();
        }
      }
      // Remove canvas reference
      tempCanvas.remove();
    } catch (error) {
      console.warn('WebGL detection failed:', error);
    }
  }
  
  const memoryGB = navigator.deviceMemory || 4; // Default to 4GB if unknown
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  
  return {
    isMobile,
    hasSharedArrayBuffer,
    hasWebAssembly,
    hasWebGL2,
    hasWebGL,
    memoryGB,
    hardwareConcurrency,
    
    // Derived capabilities
    canUseWasm: hasWebAssembly,
    canUseThreading: hasSharedArrayBuffer,
    isHighEndDevice: memoryGB >= 8 && hardwareConcurrency >= 4,
    isLowEndDevice: memoryGB < 4 || hardwareConcurrency < 2
  };
}

// Auto-configuration based on device capabilities
export function getAutoWasmConfig(operationType = 'cad') {
  const capabilities = detectDeviceCapabilities();
  
  let performanceMode = 'balanced';
  
  if (capabilities.isLowEndDevice || capabilities.isMobile) {
    performanceMode = 'mobile';
  } else if (capabilities.isHighEndDevice) {
    performanceMode = 'high-performance';
  }
  
  const config = getOptimalWasmConfig({
    isMobile: capabilities.isMobile,
    operationType,
    performanceMode
  });
  
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

// Performance monitoring configuration
export const performanceMonitoringConfig = {
  enabled: process.env.NODE_ENV === 'development',
  metricsInterval: 1000,        // Update metrics every second
  historyLength: 60,            // Keep 60 seconds of history
  
  // Alert thresholds
  alerts: {
    lowFps: 20,                 // Alert if FPS drops below 20
    highMemory: 500 * 1024 * 1024, // Alert if memory usage > 500MB
    highTriangles: 2000000,     // Alert if triangle count > 2M
    maxDrawCalls: 1000          // Alert if draw calls > 1000
  },
  
  // Adaptive settings
  adaptive: {
    enabled: true,
    adjustmentInterval: 3000,   // Adjust settings every 3 seconds
    fpsThreshold: 0.8,          // Adjust when FPS < 80% of target
    recoveryThreshold: 1.1      // Restore quality when FPS > 110% of target
  }
};

// Export default configuration
export default getAutoWasmConfig; 