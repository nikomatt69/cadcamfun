import { useState, useEffect, useCallback, useRef } from "react";
import { WasmConfig, OperationType, PerformanceMetrics, PerformanceAlert } from "src/lib/wasm/types";
import { WasmConfigManager } from "src/lib/wasm/config-manager";

/**
 * Main React hook for WASM configuration
 * Provides centralized configuration management for WASM operations
 */
export function useWasmConfig(operationType: OperationType = "cad") {
  const [config, setConfig] = useState<WasmConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimal, setIsOptimal] = useState(true);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const configManagerRef = useRef<WasmConfigManager | null>(null);
  const unsubscribeConfigRef = useRef<(() => void) | null>(null);
  const unsubscribeMetricsRef = useRef<(() => void) | null>(null);
  const unsubscribeAlertsRef = useRef<(() => void) | null>(null);

  /**
   * Initialize WASM configuration manager
   */
  const initializeConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get singleton instance
      configManagerRef.current = WasmConfigManager.getInstance();

      // Initialize with operation type
      await configManagerRef.current.initialize(operationType);

      // Subscribe to configuration changes
      unsubscribeConfigRef.current = configManagerRef.current.onConfigChange(newConfig => {
        setConfig(newConfig);
        setIsLoading(false);
      });

      // Subscribe to performance metrics
      const performanceMonitor = configManagerRef.current.getPerformanceMonitor();
      if (performanceMonitor) {
        unsubscribeMetricsRef.current = performanceMonitor.subscribe(newMetrics => {
          setMetrics(newMetrics);

          // Update optimality status based on performance
          const score = performanceMonitor.getPerformanceScore();
          setIsOptimal(score >= 70);
        });

        unsubscribeAlertsRef.current = performanceMonitor.subscribeToAlerts(alert => {
          setAlerts(prev => [alert, ...prev.slice(0, 9)]); // Keep last 10 alerts
        });
      }

      // Set initial config if already available
      const currentConfig = configManagerRef.current.getCurrentConfig();
      if (currentConfig) {
        setConfig(currentConfig);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Failed to initialize WASM config:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [operationType]);

  /**
   * Cleanup subscriptions
   */
  const cleanup = useCallback(() => {
    if (unsubscribeConfigRef.current) {
      unsubscribeConfigRef.current();
      unsubscribeConfigRef.current = null;
    }

    if (unsubscribeMetricsRef.current) {
      unsubscribeMetricsRef.current();
      unsubscribeMetricsRef.current = null;
    }

    if (unsubscribeAlertsRef.current) {
      unsubscribeAlertsRef.current();
      unsubscribeAlertsRef.current = null;
    }
  }, []);

  /**
   * Initialize on mount and operation type change
   */
  useEffect(() => {
    initializeConfig();

    return cleanup;
  }, [initializeConfig, cleanup]);

  /**
   * Update operation type
   */
  const updateOperationType = useCallback(async (newOperationType: OperationType) => {
    if (!configManagerRef.current) return;

    try {
      await configManagerRef.current.updateOperationType(newOperationType);
    } catch (err) {
      console.error("Failed to update operation type:", err);
      setError(err instanceof Error ? err.message : "Failed to update operation type");
    }
  }, []);

  /**
   * Manually update configuration
   */
  const updateConfig = useCallback((partialConfig: Partial<WasmConfig>) => {
    if (!configManagerRef.current) return;

    try {
      configManagerRef.current.updateConfig(partialConfig);
    } catch (err) {
      console.error("Failed to update config:", err);
      setError(err instanceof Error ? err.message : "Failed to update config");
    }
  }, []);

  /**
   * Reset to optimal configuration
   */
  const resetToOptimal = useCallback(async () => {
    if (!configManagerRef.current) return;

    try {
      await configManagerRef.current.resetToOptimal();
    } catch (err) {
      console.error("Failed to reset config:", err);
      setError(err instanceof Error ? err.message : "Failed to reset config");
    }
  }, []);

  /**
   * Clear performance alerts
   */
  const clearAlerts = useCallback(() => {
    setAlerts([]);

    const performanceMonitor = configManagerRef.current?.getPerformanceMonitor();
    if (performanceMonitor) {
      performanceMonitor.clearAlerts();
    }
  }, []);

  /**
   * Update external performance metrics (for components to report their metrics)
   */
  const updateMetrics = useCallback((updates: Partial<PerformanceMetrics>) => {
    const performanceMonitor = configManagerRef.current?.getPerformanceMonitor();
    if (performanceMonitor) {
      performanceMonitor.updateExternalMetrics(updates);
    }
  }, []);

  /**
   * Get device capabilities
   */
  const getCapabilities = useCallback(() => {
    return configManagerRef.current?.getCapabilities() || null;
  }, []);

  /**
   * Get performance score
   */
  const getPerformanceScore = useCallback(() => {
    const performanceMonitor = configManagerRef.current?.getPerformanceMonitor();
    return performanceMonitor ? performanceMonitor.getPerformanceScore() : 100;
  }, []);

  return {
    // Configuration state
    config,
    isLoading,
    isOptimal,
    error,

    // Performance data
    metrics,
    alerts,

    // Actions
    updateOperationType,
    updateConfig,
    updateMetrics,
    resetToOptimal,
    clearAlerts,

    // Utilities
    getCapabilities,
    getPerformanceScore,

    // Direct access to manager (for advanced use cases)
    configManager: configManagerRef.current
  };
}

/**
 * Lightweight hook for getting just the current config
 * Useful when you don't need performance monitoring
 */
export function useWasmConfigOnly(operationType: OperationType = "cad") {
  const [config, setConfig] = useState<WasmConfig | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const configManager = WasmConfigManager.getInstance();

    const initializeAndSubscribe = async () => {
      if (!configManager.isReady()) {
        await configManager.initialize(operationType);
      }

      const unsubscribe = configManager.onConfigChange(newConfig => {
        setConfig(newConfig);
        setIsReady(true);
      });

      // Set initial config if available
      const currentConfig = configManager.getCurrentConfig();
      if (currentConfig) {
        setConfig(currentConfig);
        setIsReady(true);
      }

      return unsubscribe;
    };

    let unsubscribe: (() => void) | null = null;

    initializeAndSubscribe().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [operationType]);

  return { config, isReady };
}
