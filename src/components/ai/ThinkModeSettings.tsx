// Think Mode Settings Component - Configurazione avanzata per la modalità di pensiero AI
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Settings,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  Eye,
  ToggleLeft,
  ToggleRight,
  Info,
  Sliders
} from "react-feather";

interface IThinkModeSettings {
  enabled: boolean;
  contextAwareness: boolean;
  autoOptimize: boolean;
  budgetTokens: number;
  thinkingSpeed: "slow" | "normal" | "fast";
  showIntermediateSteps: boolean;
  verbosityLevel: "minimal" | "detailed" | "comprehensive";
}

interface ThinkModeSettingsProps {
  settings: IThinkModeSettings;
  onSettingsChange: (settings: IThinkModeSettings) => void;
  className?: string;
}

interface SettingSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
}

export const ThinkModeSettings: React.FC<ThinkModeSettingsProps> = ({ settings, onSettingsChange, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("general");
  const [localSettings, setLocalSettings] = useState<IThinkModeSettings>(settings);

  // Update local settings when props change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const sections: SettingSection[] = [
    {
      id: "general",
      title: "General Settings",
      icon: <Settings size={16} />,
      description: "Basic think mode configuration"
    },
    {
      id: "performance",
      title: "Performance",
      icon: <Zap size={16} />,
      description: "Speed and token optimization"
    },
    {
      id: "display",
      title: "Display Options",
      icon: <Eye size={16} />,
      description: "How thinking steps are shown"
    }
  ];

  const handleSettingChange = <K extends keyof IThinkModeSettings>(key: K, value: IThinkModeSettings[K]) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const getVerbosityDescription = (level: string) => {
    switch (level) {
      case "minimal":
        return "Show only key decisions";
      case "detailed":
        return "Show reasoning steps";
      case "comprehensive":
        return "Show complete analysis";
      default:
        return "";
    }
  };

  const getSpeedDescription = (speed: string) => {
    switch (speed) {
      case "slow":
        return "Thorough analysis (higher token usage)";
      case "normal":
        return "Balanced approach";
      case "fast":
        return "Quick decisions (lower token usage)";
      default:
        return "";
    }
  };

  const renderGeneralSettings = () => (
    <div className="space-y-4">
      {/* Main Toggle */}
      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700">
        <div className="flex items-center">
          <Activity className="text-blue-500 mr-2" size={20} />
          <div>
            <h4 className="font-medium text-blue-700 dark:text-blue-400">Think Mode</h4>
            <p className="text-sm text-blue-600 dark:text-blue-300">Enable AI reasoning visualization</p>
          </div>
        </div>
        <button
          onClick={() => handleSettingChange("enabled", !localSettings.enabled)}
          className={`p-1 rounded-full transition-colors ${
            localSettings.enabled ? "text-blue-600 hover:text-blue-700" : "text-gray-400 hover:text-gray-500"
          }`}
        >
          {localSettings.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
        </button>
      </div>

      {/* Context Awareness */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Info className="text-gray-500 mr-2" size={16} />
          <div>
            <span className="text-sm font-medium">Context Awareness</span>
            <p className="text-xs text-gray-500">Consider existing elements and history</p>
          </div>
        </div>
        <button
          onClick={() => handleSettingChange("contextAwareness", !localSettings.contextAwareness)}
          className={`p-1 rounded transition-colors ${
            localSettings.contextAwareness ? "text-green-600 hover:text-green-700" : "text-gray-400 hover:text-gray-500"
          }`}
        >
          {localSettings.contextAwareness ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
      </div>

      {/* Auto Optimize */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Zap className="text-gray-500 mr-2" size={16} />
          <div>
            <span className="text-sm font-medium">Auto Optimize</span>
            <p className="text-xs text-gray-500">Automatically optimize reasoning paths</p>
          </div>
        </div>
        <button
          onClick={() => handleSettingChange("autoOptimize", !localSettings.autoOptimize)}
          className={`p-1 rounded transition-colors ${
            localSettings.autoOptimize ? "text-green-600 hover:text-green-700" : "text-gray-400 hover:text-gray-500"
          }`}
        >
          {localSettings.autoOptimize ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
      </div>
    </div>
  );

  const renderPerformanceSettings = () => (
    <div className="space-y-4">
      {/* Budget Tokens */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Budget Tokens: {localSettings.budgetTokens}
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">1000</span>
          <input
            type="range"
            min="1000"
            max="8000"
            step="500"
            value={localSettings.budgetTokens}
            onChange={e => handleSettingChange("budgetTokens", parseInt(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-gray-500">8000</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">Higher values allow more detailed reasoning but cost more</p>
      </div>

      {/* Thinking Speed */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Thinking Speed</label>
        <div className="grid grid-cols-3 gap-2">
          {(["slow", "normal", "fast"] as const).map(speed => (
            <button
              key={speed}
              onClick={() => handleSettingChange("thinkingSpeed", speed)}
              className={`p-2 text-sm rounded border transition-colors ${
                localSettings.thinkingSpeed === speed
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400"
              }`}
            >
              <div className="font-medium capitalize">{speed}</div>
              <div className="text-xs opacity-75">{getSpeedDescription(speed)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderDisplaySettings = () => (
    <div className="space-y-4">
      {/* Show Intermediate Steps */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Eye className="text-gray-500 mr-2" size={16} />
          <div>
            <span className="text-sm font-medium">Show Intermediate Steps</span>
            <p className="text-xs text-gray-500">Display thinking process as it happens</p>
          </div>
        </div>
        <button
          onClick={() => handleSettingChange("showIntermediateSteps", !localSettings.showIntermediateSteps)}
          className={`p-1 rounded transition-colors ${
            localSettings.showIntermediateSteps
              ? "text-green-600 hover:text-green-700"
              : "text-gray-400 hover:text-gray-500"
          }`}
        >
          {localSettings.showIntermediateSteps ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
      </div>

      {/* Verbosity Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Verbosity Level</label>
        <div className="space-y-2">
          {(["minimal", "detailed", "comprehensive"] as const).map(level => (
            <label key={level} className="flex items-center">
              <input
                type="radio"
                name="verbosity"
                value={level}
                checked={localSettings.verbosityLevel === level}
                onChange={() => handleSettingChange("verbosityLevel", level)}
                className="mr-2"
              />
              <div>
                <span className="text-sm font-medium capitalize">{level}</span>
                <p className="text-xs text-gray-500">{getVerbosityDescription(level)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center">
          <Activity className="text-purple-500 mr-3" size={20} />
          <div className="text-left">
            <h3 className="font-medium text-gray-900 dark:text-white">Think Mode Settings</h3>
            <p className="text-sm text-gray-500">
              Configure AI reasoning behavior
              {localSettings.enabled && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              )}
            </p>
          </div>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={20} className="text-gray-400" />
        </motion.div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
          >
            <div className="p-4">
              {/* Section Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                {sections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeSection === section.id
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {section.icon}
                    <span className="ml-2">{section.title}</span>
                  </button>
                ))}
              </div>

              {/* Section Content */}
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                {activeSection === "general" && renderGeneralSettings()}
                {activeSection === "performance" && renderPerformanceSettings()}
                {activeSection === "display" && renderDisplaySettings()}
              </motion.div>

              {/* Quick Stats */}
              <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Configuration</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <span className={`ml-1 font-medium ${localSettings.enabled ? "text-green-600" : "text-red-600"}`}>
                      {localSettings.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Budget:</span>
                    <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                      {localSettings.budgetTokens} tokens
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Speed:</span>
                    <span className="ml-1 font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {localSettings.thinkingSpeed}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Verbosity:</span>
                    <span className="ml-1 font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {localSettings.verbosityLevel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
