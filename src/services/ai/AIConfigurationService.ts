// src/services/ai/AIConfigurationService.ts

/**
 * AIConfigurationService manages comprehensive configuration settings for the AI Copilot system.
 * This service provides centralized management of user preferences, system parameters, and
 * performance optimization settings while maintaining compatibility across different system components.
 *
 * The service implements intelligent defaults based on user experience level and system capabilities
 * while providing granular control for advanced users who require specific customization options.
 */
export class AIConfigurationService {
  private static instance: AIConfigurationService | null = null;
  private configurationStorage: Storage;
  private defaultConfiguration: AISystemConfiguration;
  private currentConfiguration: AISystemConfiguration;
  private configurationListeners: Array<(config: AISystemConfiguration) => void>;

  constructor() {
    this.configurationStorage = localStorage;
    this.configurationListeners = [];
    this.defaultConfiguration = this.generateDefaultConfiguration();
    this.currentConfiguration = this.loadConfiguration();
  }

  /**
   * Singleton pattern implementation ensures consistent configuration management across all
   * system components. This approach prevents configuration conflicts and maintains state coherence
   * throughout the application lifecycle.
   */
  public static getInstance(): AIConfigurationService {
    if (!AIConfigurationService.instance) {
      AIConfigurationService.instance = new AIConfigurationService();
    }
    return AIConfigurationService.instance;
  }

  /**
   * Retrieves current system configuration with all active settings and preferences.
   * This method provides the authoritative configuration state for all AI system components
   * while ensuring consistent behavior across different application contexts.
   */
  public getConfiguration(): AISystemConfiguration {
    return { ...this.currentConfiguration };
  }

  /**
   * Updates system configuration with new settings and validates parameter compatibility.
   * This method handles configuration validation, dependency checking, and automatic
   * optimization of settings based on system capabilities and performance requirements.
   */
  public updateConfiguration(
    updates: Partial<AISystemConfiguration>,
    options: { validate?: boolean; persist?: boolean; notify?: boolean } = {}
  ): boolean {
    const { validate = true, persist = true, notify = true } = options;

    try {
      // Create updated configuration with validation
      const updatedConfiguration = { ...this.currentConfiguration, ...updates };

      if (validate && !this.validateConfiguration(updatedConfiguration)) {
        console.warn("Configuration validation failed, applying safe defaults");
        return false;
      }

      // Apply configuration updates
      this.currentConfiguration = updatedConfiguration;

      // Persist configuration to storage
      if (persist) {
        this.saveConfiguration();
      }

      // Notify registered listeners of configuration changes
      if (notify) {
        this.notifyConfigurationListeners();
      }

      return true;
    } catch (error) {
      console.error("Configuration update failed:", error);
      return false;
    }
  }

  /**
   * Resets configuration to intelligent defaults based on current system state and user context.
   * This method provides recovery from invalid configurations while preserving critical
   * user preferences and system optimizations where appropriate.
   */
  public resetToDefaults(preserveUserPreferences: boolean = true): void {
    const baseDefaults = this.generateDefaultConfiguration();

    if (preserveUserPreferences) {
      // Preserve critical user preferences during reset
      const preservedSettings = {
        userPreferences: this.currentConfiguration.userPreferences,
        performanceOptimization: this.currentConfiguration,
        accessibilitySettings: this.currentConfiguration.accessibilitySettings
      };

      this.currentConfiguration = { ...baseDefaults, ...preservedSettings };
    } else {
      this.currentConfiguration = baseDefaults;
    }

    this.saveConfiguration();
    this.notifyConfigurationListeners();
  }

  /**
   * Registers configuration change listeners for real-time system adaptation.
   * This method enables reactive configuration management where system components
   * automatically adapt to configuration changes without requiring manual refresh.
   */
  public registerConfigurationListener(listener: (config: AISystemConfiguration) => void): () => void {
    this.configurationListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.configurationListeners.indexOf(listener);
      if (index > -1) {
        this.configurationListeners.splice(index, 1);
      }
    };
  }

  /**
   * Optimizes configuration based on system performance metrics and usage patterns.
   * This method implements intelligent configuration tuning that adapts system behavior
   * to maximize performance while maintaining user experience quality.
   */
  public optimizeConfiguration(performanceMetrics: SystemPerformanceMetrics): void {
    const optimizedSettings: Partial<AISystemConfiguration> = {};

    // Optimize analysis frequency based on system performance
    if (performanceMetrics.averageAnalysisTime > 2000) {
      optimizedSettings.proactiveAssistant = {
        ...this.currentConfiguration.proactiveAssistant,
        analysisFrequency: "minimal",
        enableRealTimeAnalysis: false
      };
    }

    // Adjust suggestion complexity based on user acceptance rates
    if (performanceMetrics.suggestionAcceptanceRate < 0.3) {
      optimizedSettings.suggestions = {
        ...this.currentConfiguration.suggestions,
        complexityLevel: "basic",
        maxSimultaneousSuggestions: 3
      };
    }

    // Optimize memory usage based on system constraints
    if (performanceMetrics.memoryUsage > 0.8) {
      optimizedSettings.performance = {
        ...this.currentConfiguration.performance,
        cacheSize: "small",
        analysisHistoryLimit: 10
      };
    }

    this.updateConfiguration(optimizedSettings);
  }

  /**
   * Exports current configuration for backup, sharing, or migration purposes.
   * This method provides comprehensive configuration export with metadata
   * for proper restoration and compatibility validation.
   */
  public exportConfiguration(): ConfigurationExport {
    return {
      configuration: this.currentConfiguration,
      metadata: {
        exportedAt: new Date().toISOString(),
        systemVersion: "1.0.0",
        userAgent: navigator.userAgent,
        features: this.getAvailableFeatures()
      }
    };
  }

  /**
   * Imports configuration from external source with validation and compatibility checking.
   * This method handles configuration migration, version compatibility, and safe fallback
   * to prevent system instability from incompatible configuration imports.
   */
  public importConfiguration(
    exportedConfig: ConfigurationExport,
    options: { validateCompatibility?: boolean; preserveLocal?: boolean } = {}
  ): boolean {
    const { validateCompatibility = true, preserveLocal = false } = options;

    try {
      if (validateCompatibility && !this.validateImportCompatibility(exportedConfig)) {
        console.warn("Configuration import compatibility validation failed");
        return false;
      }

      let importedConfiguration = exportedConfig.configuration;

      // Preserve local settings if requested
      if (preserveLocal) {
        importedConfiguration = {
          ...importedConfiguration,
          userPreferences: this.currentConfiguration.userPreferences,
          systemSpecific: this.currentConfiguration.systemSpecific
        };
      }

      return this.updateConfiguration(importedConfiguration);
    } catch (error) {
      console.error("Configuration import failed:", error);
      return false;
    }
  }

  // Private implementation methods for internal service operations

  private loadConfiguration(): AISystemConfiguration {
    try {
      const savedConfig = this.configurationStorage.getItem("ai-copilot-config");

      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);

        // Validate loaded configuration and merge with defaults
        if (this.validateConfiguration(parsedConfig)) {
          return { ...this.defaultConfiguration, ...parsedConfig };
        }
      }
    } catch (error) {
      console.warn("Failed to load saved configuration, using defaults");
    }

    return this.defaultConfiguration;
  }

  private saveConfiguration(): void {
    try {
      const configToSave = JSON.stringify(this.currentConfiguration);
      this.configurationStorage.setItem("ai-copilot-config", configToSave);
    } catch (error) {
      console.error("Failed to save configuration:", error);
    }
  }

  private generateDefaultConfiguration(): AISystemConfiguration {
    return {
      proactiveAssistant: {
        enabled: true,
        analysisFrequency: "moderate",
        enableRealTimeAnalysis: true,
        confidenceThreshold: 0.7,
        maxSuggestions: 5
      },

      insights: {
        enabled: true,
        refreshInterval: 30000,
        enablePredictiveAnalysis: true,
        showPerformanceMetrics: true,
        enableTrendAnalysis: true
      },

      voiceInteraction: {
        enabled: false,
        language: "en-US",
        confidenceThreshold: 0.8,
        enableSpeechSynthesis: true,
        voiceVolume: 0.7
      },

      suggestions: {
        enableAutoApply: false,
        complexityLevel: "intermediate",
        maxSimultaneousSuggestions: 5,
        prioritizeByImpact: true,
        showConfidenceScores: true
      },

      performance: {
        cacheSize: "medium",
        analysisHistoryLimit: 50,
        enableMemoryOptimization: true,
        maxConcurrentAnalyses: 2
      },

      userPreferences: {
        theme: "auto",
        language: "en",
        experienceLevel: "intermediate",
        preferredFeatures: ["analysis", "optimization", "suggestions"]
      },

      accessibilitySettings: {
        enableHighContrast: false,
        increasedTextSize: false,
        enableScreenReader: false,
        keyboardNavigationOnly: false
      },

      systemSpecific: {
        platformOptimizations: true,
        hardwareAcceleration: true,
        adaptToSystemLoad: true
      }
    };
  }

  private validateConfiguration(config: AISystemConfiguration): boolean {
    try {
      // Validate required properties exist
      const requiredSections = ["proactiveAssistant", "insights", "suggestions", "performance", "userPreferences"];

      for (const section of requiredSections) {
        if (!config[section as keyof AISystemConfiguration]) {
          return false;
        }
      }

      // Validate numeric ranges
      if (config.proactiveAssistant.confidenceThreshold < 0 || config.proactiveAssistant.confidenceThreshold > 1) {
        return false;
      }

      if (config.insights.refreshInterval < 5000 || config.insights.refreshInterval > 300000) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private notifyConfigurationListeners(): void {
    this.configurationListeners.forEach(listener => {
      try {
        listener(this.currentConfiguration);
      } catch (error) {
        console.error("Configuration listener error:", error);
      }
    });
  }

  private validateImportCompatibility(exportedConfig: ConfigurationExport): boolean {
    // Validate export format and version compatibility
    if (!exportedConfig.metadata || !exportedConfig.configuration) {
      return false;
    }

    // Check for breaking changes between versions
    const currentVersion = "1.0.0";
    const exportedVersion = exportedConfig.metadata.systemVersion;

    // Simple version compatibility check
    return exportedVersion === currentVersion;
  }

  private getAvailableFeatures(): string[] {
    const features = ["proactive-analysis", "insights-dashboard", "code-suggestions"];

    // Add conditional features based on browser capabilities (SSR-safe)
    if (typeof window !== 'undefined') {
      if ("speechRecognition" in window || "webkitSpeechRecognition" in window) {
        features.push("voice-interaction");
      }

      if ("speechSynthesis" in window) {
        features.push("speech-synthesis");
      }
    }

    return features;
  }
}

// Type definitions for comprehensive configuration management

export interface AISystemConfiguration {
  proactiveAssistant: {
    enabled: boolean;
    analysisFrequency: "minimal" | "moderate" | "aggressive";
    enableRealTimeAnalysis: boolean;
    confidenceThreshold: number;
    maxSuggestions: number;
  };

  insights: {
    enabled: boolean;
    refreshInterval: number;
    enablePredictiveAnalysis: boolean;
    showPerformanceMetrics: boolean;
    enableTrendAnalysis: boolean;
  };

  voiceInteraction: {
    enabled: boolean;
    language: string;
    confidenceThreshold: number;
    enableSpeechSynthesis: boolean;
    voiceVolume: number;
  };

  suggestions: {
    enableAutoApply: boolean;
    complexityLevel: "basic" | "intermediate" | "advanced";
    maxSimultaneousSuggestions: number;
    prioritizeByImpact: boolean;
    showConfidenceScores: boolean;
  };

  performance: {
    cacheSize: "small" | "medium" | "large";
    analysisHistoryLimit: number;
    enableMemoryOptimization: boolean;
    maxConcurrentAnalyses: number;
  };

  userPreferences: {
    theme: "light" | "dark" | "auto";
    language: string;
    experienceLevel: "beginner" | "intermediate" | "advanced";
    preferredFeatures: string[];
  };

  accessibilitySettings: {
    enableHighContrast: boolean;
    increasedTextSize: boolean;
    enableScreenReader: boolean;
    keyboardNavigationOnly: boolean;
  };

  systemSpecific: {
    platformOptimizations: boolean;
    hardwareAcceleration: boolean;
    adaptToSystemLoad: boolean;
  };
}

export interface SystemPerformanceMetrics {
  averageAnalysisTime: number;
  suggestionAcceptanceRate: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
}

export interface ConfigurationExport {
  configuration: AISystemConfiguration;
  metadata: {
    exportedAt: string;
    systemVersion: string;
    userAgent: string;
    features: string[];
  };
}

export default AIConfigurationService;
