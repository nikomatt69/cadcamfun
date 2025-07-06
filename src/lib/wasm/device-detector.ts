import { DeviceCapabilities, DeviceProfile, DeviceClass } from "./types";

/**
 * Advanced Device Detection and Benchmarking
 * Detects device capabilities and runs performance benchmarks
 */
export class AdvancedDeviceDetector {
  private static benchmarkCache: Map<string, DeviceProfile> = new Map();

  /**
   * Detect basic device capabilities
   */
  static detectBasicCapabilities(): DeviceCapabilities {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== "undefined";
    const hasWebAssembly = typeof WebAssembly !== "undefined";

    const hasWebGL2 = (() => {
      try {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl2") || canvas.getContext("experimental-webgl2"));
      } catch (e) {
        return false;
      }
    })();

    const memoryGB = (navigator as any).deviceMemory || 4;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;

    return {
      isMobile,
      hasSharedArrayBuffer,
      hasWebAssembly,
      hasWebGL2,
      memoryGB,
      hardwareConcurrency,
      canUseWasm: hasWebAssembly,
      canUseThreading: hasSharedArrayBuffer,
      isHighEndDevice: memoryGB >= 8 && hardwareConcurrency >= 4,
      isLowEndDevice: memoryGB < 4 || hardwareConcurrency < 2
    };
  }

  /**
   * Run comprehensive performance benchmark
   */
  static async runPerformanceBenchmark(): Promise<DeviceProfile> {
    const cacheKey = this.generateCacheKey();

    if (this.benchmarkCache.has(cacheKey)) {
      return this.benchmarkCache.get(cacheKey)!;
    }

    const capabilities = this.detectBasicCapabilities();

    // Run benchmark tests
    const [cpuScore, gpuScore, memoryScore] = await Promise.all([
      this.benchmarkCPU(),
      this.benchmarkGPU(),
      this.benchmarkMemory()
    ]);

    const overallScore = (cpuScore + gpuScore + memoryScore) / 3;
    const deviceClass = this.classifyDevice(overallScore, capabilities);

    const profile: DeviceProfile = {
      deviceClass,
      recommendedConfig: this.getRecommendedConfig(deviceClass, capabilities),
      capabilities,
      benchmarkScore: overallScore
    };

    // Cache the result
    this.benchmarkCache.set(cacheKey, profile);

    return profile;
  }

  /**
   * CPU Performance Benchmark
   */
  private static async benchmarkCPU(): Promise<number> {
    return new Promise(resolve => {
      const start = performance.now();
      let iterations = 0;
      const maxTime = 100; // 100ms benchmark

      const runTest = () => {
        const batchStart = performance.now();

        // CPU intensive calculation
        for (let i = 0; i < 10000; i++) {
          Math.sqrt(Math.random() * 1000000);
          iterations++;
        }

        const elapsed = performance.now() - start;

        if (elapsed < maxTime) {
          requestAnimationFrame(runTest);
        } else {
          // Score based on iterations per second
          const score = Math.min(100, (iterations / elapsed) * 10);
          resolve(score);
        }
      };

      runTest();
    });
  }

  /**
   * GPU Performance Benchmark
   */
  private static async benchmarkGPU(): Promise<number> {
    return new Promise(resolve => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;

        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (!gl) {
          resolve(10); // Low score for no WebGL
          return;
        }

        // Simple fragment shader benchmark
        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(
          vertexShader,
          `
          attribute vec2 position;
          void main() {
            gl_Position = vec4(position, 0.0, 1.0);
          }
        `
        );
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(
          fragmentShader,
          `
          precision mediump float;
          void main() {
            vec2 coord = gl_FragCoord.xy / 512.0;
            float val = 0.0;
            for(int i = 0; i < 100; i++) {
              val += sin(coord.x * 10.0 + float(i)) * cos(coord.y * 10.0 + float(i));
            }
            gl_FragColor = vec4(val, val, val, 1.0);
          }
        `
        );
        gl.compileShader(fragmentShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        // Measure rendering time
        const start = performance.now();

        for (let i = 0; i < 10; i++) {
          gl.useProgram(program);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        gl.finish();
        const elapsed = performance.now() - start;

        // Score based on rendering speed (lower time = higher score)
        const score = Math.min(100, 1000 / elapsed);
        resolve(score);
      } catch (error) {
        resolve(20); // Medium-low score for GPU errors
      }
    });
  }

  /**
   * Memory Performance Benchmark
   */
  private static async benchmarkMemory(): Promise<number> {
    return new Promise(resolve => {
      try {
        const arraySize = 10000000; // 10M elements
        const start = performance.now();

        // Memory allocation test
        const testArray = new Float32Array(arraySize);
        for (let i = 0; i < arraySize; i++) {
          testArray[i] = Math.random();
        }

        // Memory access test
        let sum = 0;
        for (let i = 0; i < arraySize; i += 1000) {
          sum += testArray[i];
        }

        const elapsed = performance.now() - start;

        // Score based on memory throughput
        const score = Math.min(100, 10000 / elapsed);
        resolve(score);
      } catch (error) {
        resolve(30); // Low score for memory errors
      }
    });
  }

  /**
   * Classify device based on benchmark scores
   */
  private static classifyDevice(score: number, capabilities: DeviceCapabilities): DeviceClass {
    if (capabilities.isMobile) {
      return "mobile";
    }

    if (score >= 70 && capabilities.isHighEndDevice) {
      return "high-end";
    } else if (score >= 40 && !capabilities.isLowEndDevice) {
      return "mid-range";
    } else {
      return "low-end";
    }
  }

  /**
   * Get recommended configuration based on device class
   */
  private static getRecommendedConfig(deviceClass: DeviceClass, capabilities: DeviceCapabilities): any {
    // This will be populated with actual config from wasm-production.config.js
    // For now, return a basic config structure
    const baseConfig = {
      preferEnhanced: true,
      enablePerformanceMonitoring: process.env.NODE_ENV === "development",
      memoryManagement: true,
      adaptiveResolution: true,
      targetFps: 60
    };

    switch (deviceClass) {
      case "high-end":
        return {
          ...baseConfig,
          targetFps: 60,
          maxTriangles: 2000000,
          enableCSG: true,
          enableMeshOptimization: true,
          enableInstancing: true
        };

      case "mid-range":
        return {
          ...baseConfig,
          targetFps: 60,
          maxTriangles: 1000000,
          enableCSG: true,
          enableMeshOptimization: true,
          enableInstancing: capabilities.canUseThreading
        };

      case "low-end":
        return {
          ...baseConfig,
          targetFps: 30,
          maxTriangles: 500000,
          enableCSG: false,
          enableMeshOptimization: false,
          enableInstancing: false
        };

      case "mobile":
      default:
        return {
          ...baseConfig,
          targetFps: 30,
          maxTriangles: 200000,
          enableCSG: false,
          enableMeshOptimization: true,
          enableInstancing: false,
          adaptiveResolution: true
        };
    }
  }

  /**
   * Generate cache key for benchmark results
   */
  private static generateCacheKey(): string {
    const capabilities = this.detectBasicCapabilities();
    return `${capabilities.hardwareConcurrency}-${capabilities.memoryGB}-${capabilities.isMobile}-${capabilities.hasWebGL2}`;
  }

  /**
   * Clear benchmark cache (useful for testing or forced re-benchmark)
   */
  static clearCache(): void {
    this.benchmarkCache.clear();
  }
}
