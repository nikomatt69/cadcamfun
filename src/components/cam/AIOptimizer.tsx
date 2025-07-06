import fanucOptimizer from "@/src/lib/fanucOptimizer";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertCircle, Code, RefreshCw, ChevronDown, ChevronUp, Info, Cpu, Zap, Clock, TrendingUp } from "react-feather";

interface AIOptimizerProps {
  gcode: string;
  onApplyOptimized: (optimizedCode: string) => void;
}

const AIOptimizer: React.FC<AIOptimizerProps> = ({ gcode, onApplyOptimized }) => {
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const handleOptimize = async () => {
    if (!gcode.trim()) {
      return;
    }

    setIsOptimizing(true);
    try {
      const result = await fanucOptimizer.optimizeCode(gcode);
      setOptimizationResult(result);
    } catch (error) {
      console.error("Optimization failed:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyOptimized = () => {
    if (optimizationResult && optimizationResult.code) {
      onApplyOptimized(optimizationResult.code);
      // Reset state after applying
      setOptimizationResult(null);
    }
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-gray-900 shadow-xl rounded-xl p-6 mt-6 border border-gray-200 dark:border-gray-700"
    >
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Ottimizzazione AI per Fanuc
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">AI-powered G-code optimization</p>
          </div>
        </div>

        <div className="flex space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOptimize}
            disabled={isOptimizing || !gcode.trim()}
            className={`flex items-center px-5 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
              isOptimizing 
                ? "bg-gray-300 cursor-not-allowed text-gray-500" 
                : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
            }`}
          >
            {isOptimizing ? (
              <>
                <RefreshCw size={18} className="mr-2 animate-spin" />
                Ottimizzazione...
              </>
            ) : (
              <>
                <Zap size={18} className="mr-2" />
                Ottimizza G-Code
              </>
            )}
          </motion.button>

          <AnimatePresence>
            {optimizationResult && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleApplyOptimized}
                className="flex items-center px-5 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow-lg transition-all"
              >
                <Check size={18} className="mr-2" />
                Applica Ottimizzazione
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {!optimizationResult && !isOptimizing && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700"
          >
            <div className="flex items-start space-x-3">
              <div className="p-1 bg-blue-500/20 rounded-lg mt-0.5">
                <Info size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  Ottimizzazione AI Avanzata per Fanuc
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                  L&apos;ottimizzazione AI analizza il codice G-code e applica tecniche avanzate per:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    "Rimuovere comandi ridondanti",
                    "Consolidare movimenti consecutivi", 
                    "Ottimizzare parametri di velocità",
                    "Ridurre il tempo di esecuzione",
                    "Rispettare le specifiche Fanuc",
                    "Migliorare l'efficienza energetica"
                  ].map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + idx * 0.05 }}
                      className="flex items-center text-xs text-blue-700 dark:text-blue-300"
                    >
                      <div className="w-1 h-1 bg-blue-500 rounded-full mr-2" />
                      {item}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {optimizationResult && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-6"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
                className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-700 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-800 px-2 py-1 rounded-full">
                    Ottimo
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Riduzione Linee</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{optimizationResult.stats.reductionPercent}%</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <Code className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Linee Originali</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{optimizationResult.stats.originalLines}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
                className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-200 dark:border-purple-700 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Linee Ottimizzate</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{optimizationResult.stats.optimizedLines}</p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border border-orange-200 dark:border-orange-700 shadow-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-800 px-2 py-1 rounded-full">
                    Risparmio
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Risparmio Tempo</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  ~{optimizationResult.stats.estimatedTimeReduction.toFixed(2)} min
                </p>
              </motion.div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
            >
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="flex items-center justify-between cursor-pointer" 
                onClick={toggleDetails}
              >
                <div className="flex items-center space-x-2">
                  <div className="p-1 bg-blue-500/20 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Miglioramenti Applicati</h3>
                </div>
                <motion.div
                  animate={{ rotate: showDetails ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                </motion.div>
              </motion.div>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-2">
                      {optimizationResult.improvements.map((improvement: string, idx: number) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-start space-x-2 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                          <span>{improvement}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <AnimatePresence>
              {optimizationResult.stats.reductionPercent === 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700 shadow-lg"
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-1 bg-yellow-500/20 rounded-lg mt-0.5">
                      <AlertCircle size={18} className="text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">
                        Codice già ottimizzato
                      </h4>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        Il codice è già ben ottimizzato. Non sono necessarie ulteriori modifiche.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AIOptimizer;
