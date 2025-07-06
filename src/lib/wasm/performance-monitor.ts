import { PerformanceAlert, PerformanceMetrics } from "./types";

/**
 * Real-time Performance Monitor
 * Tracks FPS, memory usage, and other performance metrics
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private history: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private isRunning = false;
  private targetFps = 60;
  private monitoringInterval: number | null = null;
  private frameCount = 0;
  private lastTime = 0;
  private callbacks: ((metrics: PerformanceMetrics) => void)[] = [];
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];

  // Performance thresholds
  private thresholds = {
    lowFps: 20,
    highMemory: 500 * 1024 * 1024, // 500MB
    highTriangles: 2000000,
    maxDrawCalls: 1000
  };

  constructor(targetFps = 60) {
    this.targetFps = targetFps;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics with default values
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      fps: 0,
      frameTime: 0,
      memoryUsage: 0,
      triangleCount: 0,
      drawCalls: 0,
      wasmHeapSize: 0,
      gpuMemoryUsage: 0,
      timestamp: performance.now()
    };
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.frameCount = 0;

    // Start FPS monitoring
    this.monitorFrame();

    // Start periodic metrics collection
    this.monitoringInterval = window.setInterval(() => {
      this.updateSystemMetrics();
      this.checkThresholds();
      this.notifyCallbacks();
    }, 1000);

    console.log("🚀 Performance monitoring started");
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log("⏹️ Performance monitoring stopped");
  }

  /**
   * Monitor frame rate
   */
  private monitorFrame(): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    this.frameCount++;

    // Calculate FPS every second
    if (currentTime - this.lastTime >= 1000) {
      this.metrics.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
      this.metrics.frameTime = (currentTime - this.lastTime) / this.frameCount;

      this.frameCount = 0;
      this.lastTime = currentTime;
    }

    requestAnimationFrame(() => this.monitorFrame());
  }

  /**
   * Update system metrics (memory, GPU, etc.)
   */
  private updateSystemMetrics(): void {
    // Memory usage
    if ("memory" in performance) {
      const memInfo = (performance as any).memory;
      this.metrics.memoryUsage = memInfo.usedJSHeapSize;
      this.metrics.wasmHeapSize = memInfo.totalJSHeapSize - memInfo.usedJSHeapSize;
    }

    // GPU memory (if available)
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          // This is an approximation - actual GPU memory is hard to get
          this.metrics.gpuMemoryUsage = this.estimateGPUMemoryUsage();
        }
      }
    } catch (error) {
      // GPU memory not available
    }

    this.metrics.timestamp = performance.now();

    // Add to history (keep last 60 seconds)
    this.history.push({ ...this.metrics });
    if (this.history.length > 60) {
      this.history.shift();
    }
  }

  /**
   * Estimate GPU memory usage based on triangle count and textures
   */
  private estimateGPUMemoryUsage(): number {
    // Rough estimation: triangles * 96 bytes (position + normal + uv + indices)
    const geometryMemory = this.metrics.triangleCount * 96;

    // Add estimated texture memory (hard to track precisely)
    const estimatedTextureMemory = 50 * 1024 * 1024; // 50MB estimate

    return geometryMemory + estimatedTextureMemory;
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkThresholds(): void {
    const now = performance.now();

    // FPS alert
    if (this.metrics.fps < this.thresholds.lowFps && this.metrics.fps > 0) {
      this.addAlert({
        type: "fps",
        severity: this.metrics.fps < 10 ? "critical" : "warning",
        message: `Low FPS detected: ${this.metrics.fps} FPS (target: ${this.targetFps})`,
        suggestedAction: "Consider reducing LOD or disabling expensive features",
        timestamp: now
      });
    }

    // Memory alert
    if (this.metrics.memoryUsage > this.thresholds.highMemory) {
      this.addAlert({
        type: "memory",
        severity: this.metrics.memoryUsage > this.thresholds.highMemory * 1.5 ? "critical" : "warning",
        message: `High memory usage: ${(this.metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`,
        suggestedAction: "Consider reducing mesh complexity or clearing unused objects",
        timestamp: now
      });
    }

    // Triangle count alert
    if (this.metrics.triangleCount > this.thresholds.highTriangles) {
      this.addAlert({
        type: "triangles",
        severity: this.metrics.triangleCount > this.thresholds.highTriangles * 1.5 ? "critical" : "warning",
        message: `High triangle count: ${this.metrics.triangleCount.toLocaleString()}`,
        suggestedAction: "Enable LOD or reduce mesh detail",
        timestamp: now
      });
    }

    // Draw calls alert
    if (this.metrics.drawCalls > this.thresholds.maxDrawCalls) {
      this.addAlert({
        type: "drawCalls",
        severity: "warning",
        message: `High draw calls: ${this.metrics.drawCalls}`,
        suggestedAction: "Enable instancing or batch geometry",
        timestamp: now
      });
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(alert: PerformanceAlert): void {
    // Avoid duplicate alerts within 5 seconds
    const recentAlerts = this.alerts.filter(a => a.type === alert.type && alert.timestamp - a.timestamp < 5000);

    if (recentAlerts.length === 0) {
      this.alerts.push(alert);
      this.alertCallbacks.forEach(callback => callback(alert));

      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts.shift();
      }
    }
  }

  /**
   * Notify all registered callbacks
   */
  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.metrics);
      } catch (error) {
        console.error("Performance monitor callback error:", error);
      }
    });
  }

  /**
   * Subscribe to performance metrics updates
   */
  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to performance alerts
   */
  subscribeToAlerts(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.push(callback);

    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update external metrics (triangle count, draw calls)
   */
  updateExternalMetrics(updates: Partial<PerformanceMetrics>): void {
    this.metrics = { ...this.metrics, ...updates, timestamp: performance.now() };
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance history
   */
  getHistory(): PerformanceMetrics[] {
    return [...this.history];
  }

  /**
   * Get recent alerts
   */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  /**
   * Update target FPS
   */
  updateTargetFps(fps: number): void {
    this.targetFps = fps;
  }

  /**
   * Get performance score (0-100)
   */
  getPerformanceScore(): number {
    if (this.history.length === 0) return 100;

    const recent = this.history.slice(-10); // Last 10 seconds
    const avgFps = recent.reduce((sum, m) => sum + m.fps, 0) / recent.length;
    const avgMemory = recent.reduce((sum, m) => sum + m.memoryUsage, 0) / recent.length;

    // Score based on FPS performance (0-50 points)
    const fpsScore = Math.min(50, (avgFps / this.targetFps) * 50);

    // Score based on memory efficiency (0-30 points)
    const memoryScore = Math.max(0, 30 - (avgMemory / (1024 * 1024 * 1024)) * 10); // Penalty for GB usage

    // Score based on consistency (0-20 points)
    const fpsVariance = recent.reduce((sum, m) => sum + Math.abs(m.fps - avgFps), 0) / recent.length;
    const consistencyScore = Math.max(0, 20 - fpsVariance);

    return Math.round(fpsScore + memoryScore + consistencyScore);
  }
}
