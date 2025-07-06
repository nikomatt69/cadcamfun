import { AdvancedDeviceDetector } from "./device-detector";
import { PerformanceMonitor } from "./performance-monitor";
import {
  detectDeviceCapabilities as detectDeviceCaps,
  getOptimalWasmConfigForDevice
} from "../utils/deviceCapabilities";
import getAutoWasmConfig, { performanceMonitoringConfig } from "../../../wasm-production.config.js";
import {
  AdaptiveSettings,
  DeviceCapabilities,
  OperationType,
  PerformanceMetrics,
  QualityAdjustments,
  WasmConfig
} from "./types";

/**
 * Central WASM Configuration Manager
 * Coordinates device detection, performance monitoring, and adaptive quality
 */
export class WasmConfigManager {
  private static instance: WasmConfigManager;
  private currentConfig: WasmConfig | null = null;
  private capabilities: DeviceCapabilities | null = null;
  private performanceMonitor: PerformanceMonitor | null = null;
  private adaptiveSettings: AdaptiveSettings;
  private isInitialized = false;
  private operationType: OperationType = "cad";

  // Callbacks for config changes
  private configChangeCallbacks: ((config: WasmConfig) => void)[] = [];

  private constructor() {
    this.adaptiveSettings = {
      enabled: true,
      adjustmentInterval: 3000,
      fpsThreshold: 0.8,
      recoveryThreshold: 1.1,
      currentAdjustments: {}
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WasmConfigManager {
    if (!WasmConfigManager.instance) {
      WasmConfigManager.instance = new WasmConfigManager();
    }
    return WasmConfigManager.instance;
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(operationType: OperationType = "cad"): Promise<void> {
    if (this.isInitialized) {
      console.log("✅ WasmConfigManager already initialized");
      return;
    }

    console.log("🚀 Initializing WasmConfigManager...");

    try {
      this.operationType = operationType;

      // Step 1: Detect device capabilities
      console.log("📱 Detecting device capabilities...");
      this.capabilities = await this.detectCapabilities();

      // Step 2: Get optimal configuration
      console.log("⚙️ Determining optimal configuration...");
      this.currentConfig = await this.determineOptimalConfig();

      // Step 3: Initialize performance monitoring
      console.log("📊 Starting performance monitoring...");
      await this.initializePerformanceMonitoring();

      // Step 4: Setup adaptive quality if enabled
      if (this.adaptiveSettings.enabled) {
        console.log("🎯 Setting up adaptive quality...");
        this.setupAdaptiveQuality();
      }

      this.isInitialized = true;
      console.log("✅ WasmConfigManager initialized successfully");
      console.log("📋 Current config:", this.currentConfig);
    } catch (error) {
      console.error("❌ Failed to initialize WasmConfigManager:", error);

      // Fallback to safe configuration
      this.currentConfig = this.getFallbackConfig();
      this.isInitialized = true;

      console.log("🛡️ Using fallback configuration");
    }
  }

  /**
   * Detect device capabilities using both basic and advanced detection
   */
  private async detectCapabilities(): Promise<DeviceCapabilities> {
    // Use basic detection from utility
    const basicCapabilities = detectDeviceCaps();

    // Optionally run advanced benchmarking for more precise detection
    if (performanceMonitoringConfig.enabled) {
      try {
        const deviceProfile = await AdvancedDeviceDetector.runPerformanceBenchmark();
        console.log(`🏆 Device benchmark score: ${deviceProfile.benchmarkScore.toFixed(1)}`);
        return deviceProfile.capabilities;
      } catch (error) {
        console.warn("⚠️ Advanced benchmarking failed, using basic detection:", error);
      }
    }

    return basicCapabilities;
  }

  /**
   * Determine optimal configuration based on operation type and device
   */
  private async determineOptimalConfig(): Promise<WasmConfig> {
    if (!this.capabilities) {
      throw new Error("Device capabilities not detected");
    }

    // Use the utility's device-aware configuration
    const autoConfig = getOptimalWasmConfigForDevice(this.operationType);

    // Apply any custom adjustments based on specific requirements
    return this.applyCustomAdjustments(autoConfig);
  }

  /**
   * Apply custom adjustments to the base configuration
   */
  private applyCustomAdjustments(baseConfig: any): WasmConfig {
    // Convert from production config format to our typed interface
    const config: WasmConfig = {
      preferEnhanced: baseConfig.preferEnhanced || true,
      enablePerformanceMonitoring: baseConfig.enablePerformanceMonitoring || false,
      memoryManagement: baseConfig.memoryManagement || true,
      adaptiveResolution: baseConfig.adaptiveResolution || true,
      targetFps: baseConfig.targetFps || 60,

      enableCSG: baseConfig.enableCSG || false,
      enableMeshOptimization: baseConfig.enableMeshOptimization || true,
      enableSnapping: baseConfig.enableSnapping || false,
      enableConstraints: baseConfig.enableConstraints || false,
      enableLOD: baseConfig.enableLOD || true,
      enableFrustumCulling: baseConfig.enableFrustumCulling || true,
      enableGeometryOptimization: baseConfig.enableGeometryOptimization || true,
      enableInstancing: baseConfig.enableInstancing || true,
      enableToolpathOptimization: baseConfig.enableToolpathOptimization || false,

      highDetailThreshold: baseConfig.highDetailThreshold || 100,
      mediumDetailThreshold: baseConfig.mediumDetailThreshold || 300,
      lowDetailReduction: baseConfig.lowDetailReduction || 0.3,
      mediumDetailReduction: baseConfig.mediumDetailReduction || 0.6,
      maxTriangles: baseConfig.maxTriangles || 1000000
    };

    // Apply operation-specific adjustments
    if (this.operationType === "cam") {
      config.enableToolpathOptimization = true;
      config.enableCSG = false; // CAM usually doesn't need CSG
    } else if (this.operationType === "mixed") {
      config.enableToolpathOptimization = true;
      config.enableCSG = true;
      config.maxTriangles = Math.min(config.maxTriangles, 1500000); // Conservative for mixed workloads
    }

    return config;
  }

  /**
   * Initialize performance monitoring
   */
  private async initializePerformanceMonitoring(): Promise<void> {
    if (!this.currentConfig) return;

    this.performanceMonitor = new PerformanceMonitor(this.currentConfig.targetFps);

    // Subscribe to performance updates for adaptive quality
    this.performanceMonitor.subscribe(metrics => {
      if (this.adaptiveSettings.enabled) {
        this.handlePerformanceUpdate(metrics);
      }
    });

    // Subscribe to alerts for logging/debugging
    this.performanceMonitor.subscribeToAlerts(alert => {
      console.warn(`🚨 Performance Alert [${alert.severity}]: ${alert.message}`);
      console.log(`💡 Suggestion: ${alert.suggestedAction}`);
    });

    if (this.currentConfig.enablePerformanceMonitoring) {
      this.performanceMonitor.startMonitoring();
    }
  }

  /**
   * Setup adaptive quality system
   */
  private setupAdaptiveQuality(): void {
    setInterval(() => {
      if (this.performanceMonitor && this.currentConfig) {
        this.adaptQuality();
      }
    }, this.adaptiveSettings.adjustmentInterval);
  }

  /**
   * Handle performance metrics updates for adaptive quality
   */
  private handlePerformanceUpdate(metrics: PerformanceMetrics): void {
    // Store latest metrics for adaptive quality decisions
    // The actual adaptation happens in adaptQuality() method
  }

  /**
   * Adapt quality based on performance metrics
   */
  private adaptQuality(): void {
    if (!this.performanceMonitor || !this.currentConfig) return;

    const metrics = this.performanceMonitor.getCurrentMetrics();
    const targetFps = this.currentConfig.targetFps;
    const currentFps = metrics.fps;

    // Only adapt if we have meaningful FPS data
    if (currentFps === 0) return;

    const fpsRatio = currentFps / targetFps;
    const shouldDegrade = fpsRatio < this.adaptiveSettings.fpsThreshold;
    const shouldRecover = fpsRatio > this.adaptiveSettings.recoveryThreshold;

    if (shouldDegrade) {
      this.degradeQuality();
    } else if (shouldRecover) {
      this.improveQuality();
    }
  }

  /**
   * Degrade quality settings to improve performance
   */
  private degradeQuality(): void {
    if (!this.currentConfig) return;

    const adjustments: QualityAdjustments = {};
    let configChanged = false;

    // Reduce LOD thresholds
    if (this.currentConfig.highDetailThreshold > 50) {
      this.currentConfig.highDetailThreshold *= 0.9;
      adjustments.lodReduction = (adjustments.lodReduction || 0) + 0.1;
      configChanged = true;
    }

    // Reduce triangle limit
    if (this.currentConfig.maxTriangles > 100000) {
      this.currentConfig.maxTriangles = Math.floor(this.currentConfig.maxTriangles * 0.9);
      adjustments.triangleLimit = this.currentConfig.maxTriangles;
      configChanged = true;
    }

    // Disable expensive features if needed
    if (this.currentConfig.enableInstancing) {
      this.currentConfig.enableInstancing = false;
      adjustments.enableInstancing = false;
      configChanged = true;
    }

    if (configChanged) {
      this.adaptiveSettings.currentAdjustments = { ...this.adaptiveSettings.currentAdjustments, ...adjustments };
      this.notifyConfigChange();
      console.log("⬇️ Quality degraded for better performance");
    }
  }

  /**
   * Improve quality settings when performance allows
   */
  private improveQuality(): void {
    if (!this.currentConfig) return;

    const adjustments: QualityAdjustments = {};
    let configChanged = false;

    // Restore features gradually
    if (!this.currentConfig.enableInstancing && this.capabilities?.canUseThreading) {
      this.currentConfig.enableInstancing = true;
      adjustments.enableInstancing = true;
      configChanged = true;
    }

    // Increase triangle limit
    const originalMaxTriangles = this.getOriginalConfig().maxTriangles;
    if (this.currentConfig.maxTriangles < originalMaxTriangles) {
      this.currentConfig.maxTriangles = Math.min(
        originalMaxTriangles,
        Math.floor(this.currentConfig.maxTriangles * 1.1)
      );
      adjustments.triangleLimit = this.currentConfig.maxTriangles;
      configChanged = true;
    }

    if (configChanged) {
      this.adaptiveSettings.currentAdjustments = { ...this.adaptiveSettings.currentAdjustments, ...adjustments };
      this.notifyConfigChange();
      console.log("⬆️ Quality improved due to good performance");
    }
  }

  /**
   * Get the original (non-adapted) configuration
   */
  private getOriginalConfig(): WasmConfig {
    const autoConfig = getAutoWasmConfig(this.operationType);
    return this.applyCustomAdjustments(autoConfig);
  }

  /**
   * Get fallback configuration for error cases
   */
  private getFallbackConfig(): WasmConfig {
    return {
      preferEnhanced: false,
      enablePerformanceMonitoring: false,
      memoryManagement: true,
      adaptiveResolution: true,
      targetFps: 30,

      enableCSG: false,
      enableMeshOptimization: true,
      enableSnapping: false,
      enableConstraints: false,
      enableLOD: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: false,
      enableInstancing: false,
      enableToolpathOptimization: false,

      highDetailThreshold: 200,
      mediumDetailThreshold: 500,
      lowDetailReduction: 0.2,
      mediumDetailReduction: 0.5,
      maxTriangles: 500000
    };
  }

  /**
   * Notify all callbacks about configuration changes
   */
  private notifyConfigChange(): void {
    if (!this.currentConfig) return;

    this.configChangeCallbacks.forEach(callback => {
      try {
        callback(this.currentConfig!);
      } catch (error) {
        console.error("Config change callback error:", error);
      }
    });
  }

  // Public API methods

  /**
   * Get current configuration
   */
  getCurrentConfig(): WasmConfig | null {
    return this.currentConfig ? { ...this.currentConfig } : null;
  }

  /**
   * Get device capabilities
   */
  getCapabilities(): DeviceCapabilities | null {
    return this.capabilities ? { ...this.capabilities } : null;
  }

  /**
   * Get performance monitor instance
   */
  getPerformanceMonitor(): PerformanceMonitor | null {
    return this.performanceMonitor;
  }

  /**
   * Subscribe to configuration changes
   */
  onConfigChange(callback: (config: WasmConfig) => void): () => void {
    this.configChangeCallbacks.push(callback);

    // Immediately call with current config if available
    if (this.currentConfig) {
      callback(this.currentConfig);
    }

    return () => {
      const index = this.configChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.configChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update operation type and reconfigure
   */
  async updateOperationType(operationType: OperationType): Promise<void> {
    if (this.operationType === operationType) return;

    this.operationType = operationType;

    if (this.isInitialized) {
      console.log(`🔄 Updating configuration for operation type: ${operationType}`);
      this.currentConfig = await this.determineOptimalConfig();
      this.notifyConfigChange();
    }
  }

  /**
   * Manually update configuration
   */
  updateConfig(partialConfig: Partial<WasmConfig>): void {
    if (!this.currentConfig) return;

    this.currentConfig = { ...this.currentConfig, ...partialConfig };
    this.notifyConfigChange();

    console.log("⚙️ Configuration manually updated");
  }

  /**
   * Reset to optimal configuration (clear adaptive adjustments)
   */
  async resetToOptimal(): Promise<void> {
    if (!this.isInitialized) return;

    console.log("🔄 Resetting to optimal configuration...");

    this.currentConfig = await this.determineOptimalConfig();
    this.adaptiveSettings.currentAdjustments = {};
    this.notifyConfigChange();

    console.log("✅ Configuration reset to optimal settings");
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.performanceMonitor) {
      this.performanceMonitor.stopMonitoring();
    }

    this.configChangeCallbacks = [];
    this.isInitialized = false;

    console.log("🧹 WasmConfigManager disposed");
  }
}
