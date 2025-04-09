import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronUp, Settings, Target, Tool, Zap } from 'react-feather';
import { aiToolpathOptimizer } from '@/src/lib/aiToolpathOptimizer';
import { Toolpath, ToolpathParameters } from '@/src/types/ai';

interface OptimizationSettings {
  operation: string;
  toolDiameter: number;
  cuttingSpeed: number;
  feedRate: number;
  optimizationGoal: 'speed' | 'quality' | 'toolLife' | 'balanced';
}

const AIToolpathOptimizer: React.FC = () => {
  const [optimizedToolpath, setOptimizedToolpath] = useState<Toolpath | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<OptimizationSettings>({
    operation: 'milling',
    toolDiameter: 10,
    cuttingSpeed: 1000,
    feedRate: 200,
    optimizationGoal: 'balanced'
  });

  const performToolpathOptimization = async () => {
    setIsOptimizing(true);
    setError(null);
    
    try {
      const mockToolpath: Toolpath = {
        id: 'sample-toolpath',
        points: [{ x: 0, y: 0, z: 0 }]
      };
      
      const parameters: ToolpathParameters = {
        operation: settings.operation,
        tool: {
          type: 'endmill',
          diameter: settings.toolDiameter
        },
        cutting: {
          speed: settings.cuttingSpeed,
          feedRate: settings.feedRate
        }
      };
      
      const result = await aiToolpathOptimizer.optimize(mockToolpath, parameters);
      setOptimizedToolpath(result);
    } catch (error) {
      console.error('Toolpath Optimization Error', error);
      setError('Failed to optimize toolpath. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const getOptimizationScore = () => {
    if (!optimizedToolpath?.aiOptimizations?.optimizationScore) return 0;
    return Math.round(optimizedToolpath.aiOptimizations.optimizationScore * 100);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Tool className="text-blue-500" size={24} />
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">AI Toolpath Optimizer</h2>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center space-x-2 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Settings size={18} />
          <span>Settings</span>
          {showSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </motion.button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Operation
                </label>
                <select
                  value={settings.operation}
                  onChange={(e) => setSettings({ ...settings, operation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                >
                  <option value="milling">Milling</option>
                  <option value="turning">Turning</option>
                  <option value="drilling">Drilling</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tool Diameter (mm)
                </label>
                <input
                  type="number"
                  value={settings.toolDiameter}
                  onChange={(e) => setSettings({ ...settings, toolDiameter: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cutting Speed (RPM)
                </label>
                <input
                  type="number"
                  value={settings.cuttingSpeed}
                  onChange={(e) => setSettings({ ...settings, cuttingSpeed: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Feed Rate (mm/min)
                </label>
                <input
                  type="number"
                  value={settings.feedRate}
                  onChange={(e) => setSettings({ ...settings, feedRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Optimization Goal
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['speed', 'quality', 'toolLife', 'balanced'] as const).map((goal) => (
                  <button
                    key={goal}
                    onClick={() => setSettings({ ...settings, optimizationGoal: goal })}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${settings.optimizationGoal === goal
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                  >
                    {goal.charAt(0).toUpperCase() + goal.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={performToolpathOptimization}
        disabled={isOptimizing}
        className={`
          w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium
          ${isOptimizing
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700'
            : 'bg-blue-500 text-white hover:bg-blue-600 dark:hover:bg-blue-400'
          }
          transition-colors duration-200
        `}
      >
        {isOptimizing ? (
          <>
            <Target className="animate-spin" size={18} />
            <span>Optimizing Toolpath...</span>
          </>
        ) : (
          <>
            <Zap size={18} />
            <span>Optimize Toolpath</span>
          </>
        )}
      </motion.button>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center space-x-2 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 rounded-lg"
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </motion.div>
      )}

      <AnimatePresence>
        {optimizedToolpath && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                Optimization Results
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Score:</span>
                <span className={`text-lg font-bold ${
                  getOptimizationScore() > 80 ? 'text-green-500' :
                  getOptimizationScore() > 60 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {getOptimizationScore()}%
                </span>
              </div>
            </div>

            <p className="text-gray-700 dark:text-gray-300">
              {optimizedToolpath.aiOptimizations?.description || 'No description available'}
            </p>

            {optimizedToolpath.aiOptimizations?.suggestedModifications && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-700 dark:text-gray-300">
                  Suggested Modifications:
                </h4>
                <div className="space-y-2">
                  {optimizedToolpath.aiOptimizations.suggestedModifications.map((mod, index) => (
                    <div
                      key={mod.id || index}
                      className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-gray-800 dark:text-gray-200">{mod.description}</p>
                        {mod.impact && (
                          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                            {mod.impact.timeReduction && (
                              <div className="text-green-500">
                                Time: -{mod.impact.timeReduction}%
                              </div>
                            )}
                            {mod.impact.toolWearReduction && (
                              <div className="text-blue-500">
                                Wear: -{mod.impact.toolWearReduction}%
                              </div>
                            )}
                            {mod.impact.surfaceQualityImprovement && (
                              <div className="text-purple-500">
                                Quality: +{mod.impact.surfaceQualityImprovement}%
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        mod.priority > 8 ? 'bg-red-100 text-red-600' :
                        mod.priority > 5 ? 'bg-yellow-100 text-yellow-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        Priority {mod.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIToolpathOptimizer;