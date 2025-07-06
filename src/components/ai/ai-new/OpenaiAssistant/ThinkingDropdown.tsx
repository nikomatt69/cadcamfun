import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Clock, BarChart, Target, CheckCircle, Activity, Zap,  TrendingUp,  } from "react-feather";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingStep, ThinkingSession } from "@/src/types/AITypes";
import { Brain, Timer } from "lucide-react";

interface ThinkingDropdownProps {
  thinking: string;
  summary?: string;
  duration?: number;
  steps?: ThinkingStep[];
  session?: ThinkingSession;
  showRealTime?: boolean;
  verbosity?: "minimal" | "normal" | "detailed" | "verbose";
}

export const ThinkingDropdown: React.FC<ThinkingDropdownProps> = ({
  thinking,
  summary,
  duration,
  steps = [],
  session,
  showRealTime = false,
  verbosity = "normal"
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeStep, setActiveStep] = useState<string | null>(null);

  // Generate summary if not provided
  const thinkingSummary = summary || generateSummary(thinking);

  // Real-time thinking animation
  const [thinkingAnimation, setThinkingAnimation] = useState("");
  useEffect(() => {
    if (showRealTime && !isExpanded) {
      const intervals = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      let i = 0;
      const interval = setInterval(() => {
        setThinkingAnimation(intervals[i % intervals.length]);
        i++;
      }, 100);
      return () => clearInterval(interval);
    }
  }, [showRealTime, isExpanded]);

  const getPhaseIcon = (phase: ThinkingStep["type"]) => {
    switch (phase) {
      case "analysis":
        return <BarChart size={14} className="text-blue-400" />;
      case "reasoning":
        return <Brain size={14} className="text-emerald-400" />;
      case "conclusion":
        return <Target size={14} className="text-orange-400" />;
      case "question":
        return <CheckCircle size={14} className="text-purple-400" />;
      case "hypothesis":
        return <Zap size={14} className="text-yellow-400" />;
      default:
        return <Activity size={14} className="text-gray-400" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-emerald-500 dark:text-emerald-400";
    if (confidence >= 0.6) return "text-yellow-500 dark:text-yellow-400";
    return "text-red-500 dark:text-red-400";
  };

  const getConfidenceGradient = (confidence: number) => {
    if (confidence >= 0.8) return "from-emerald-400 to-emerald-600";
    if (confidence >= 0.6) return "from-yellow-400 to-yellow-600";
    return "from-red-400 to-red-600";
  };

  // Calculate session stats
  const sessionStats = {
    totalSteps: steps.length,
    averageConfidence: steps.length > 0 
      ? Math.round((steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length) * 100)
      : 0,
    totalDuration: duration || 0
  };

  const renderStepsView = () => {
    if (verbosity === "minimal") return null;

    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
              Thinking Process
            </span>
            <div className="px-2 py-0.5 bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/50 dark:to-indigo-900/50 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium backdrop-blur-sm border border-purple-200/50 dark:border-purple-700/50">
              {steps.length} steps
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
              className={`relative overflow-hidden cursor-pointer transition-all duration-300 rounded-xl ${
                activeStep === step.id
                  ? "bg-gradient-to-r from-purple-100/80 to-indigo-100/80 dark:from-purple-900/40 dark:to-indigo-900/40 shadow-lg border border-purple-300/50 dark:border-purple-600/50"
                  : "bg-white/40 dark:bg-gray-800/40 hover:bg-gradient-to-r hover:from-purple-50/60 hover:to-indigo-50/60 dark:hover:from-purple-900/30 dark:hover:to-indigo-900/30 border border-white/30 dark:border-gray-700/30"
              } backdrop-blur-xl`}
              onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
            >
              {/* Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-indigo-400/20 rounded-xl -z-10"></div>
              
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-white/60 to-gray-100/60 dark:from-gray-700/60 dark:to-gray-800/60 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30 dark:border-gray-600/30 shadow-md">
                        {getPhaseIcon(step.type)}
                      </div>
                      {/* Progress ring */}
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-xl opacity-20 blur-sm"></div>
                    </div>
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold capitalize text-gray-800 dark:text-gray-200">
                          {step.type}
                        </span>
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${getConfidenceGradient(step.confidence)} shadow-sm`}></div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`text-xs font-medium ${getConfidenceColor(step.confidence)}`}>
                          {Math.round(step.confidence * 100)}% confidence
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {step.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {step.relatedConcepts && step.relatedConcepts.length > 0 && (
                      <div className="px-2 py-1 bg-gradient-to-r from-indigo-100/70 to-purple-100/70 dark:from-indigo-900/50 dark:to-purple-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium backdrop-blur-sm border border-indigo-200/30 dark:border-indigo-700/30">
                        {step.relatedConcepts.length} concepts
                      </div>
                    )}
                    <motion.div
                      animate={{ rotate: activeStep === step.id ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="p-1 rounded-lg bg-white/40 dark:bg-gray-700/40 backdrop-blur-sm"
                    >
                      <ChevronDown size={14} className="text-gray-600 dark:text-gray-400" />
                    </motion.div>
                  </div>
                </div>

                <AnimatePresence>
                  {activeStep === step.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="mt-3 overflow-hidden"
                    >
                      <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 leading-relaxed p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg backdrop-blur-sm border border-white/20 dark:border-gray-700/20">
                        {step.content}
                      </div>
                      
                      {step.reasoning && (verbosity === "verbose" || verbosity === "detailed") && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                          <div className="flex items-center space-x-2 mb-2">
                            <Brain size={12} className="text-blue-500" />
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Reasoning</span>
                          </div>
                          <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            {step.reasoning}
                          </div>
                        </div>
                      )}
                      
                      {step.relatedConcepts && step.relatedConcepts.length > 0 && verbosity !== "normal" && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Target size={12} className="text-purple-500" />
                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Related Concepts</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {step.relatedConcepts.map((concept, idx) => (
                              <motion.span
                                key={idx}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="px-2.5 py-1 bg-gradient-to-r from-purple-100/80 to-indigo-100/80 dark:from-purple-800/60 dark:to-indigo-800/60 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium backdrop-blur-sm border border-purple-200/30 dark:border-purple-700/30 shadow-sm"
                              >
                                {concept}
                              </motion.span>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  const renderSessionStats = () => {
    if (!session || verbosity === "minimal") return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 p-4 bg-gradient-to-r from-gray-50/80 to-blue-50/80 dark:from-gray-900/50 dark:to-blue-900/50 rounded-xl backdrop-blur-sm border border-gray-200/30 dark:border-gray-700/30 shadow-sm"
      >
        <div className="flex items-center space-x-2 mb-3">
          <TrendingUp size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Session Statistics</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Duration</span>
              <div className="flex items-center space-x-1">
                <Timer size={10} className="text-blue-400" />
                <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                  {Math.round(session.totalDuration / 1000)}s
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Steps</span>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                {session.steps.length}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Avg Confidence</span>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${getConfidenceGradient(sessionStats.averageConfidence / 100)}`}></div>
                <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                  {sessionStats.averageConfidence}%
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">Phases:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(
                  session.steps.reduce(
                    (acc, step) => {
                      acc[step.type] = (acc[step.type] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>
                  )
                ).map(([phase, count]) => (
                  <span key={phase} className="px-1.5 py-0.5 bg-gray-100/70 dark:bg-gray-800/70 text-gray-700 dark:text-gray-300 rounded text-xs">
                    {phase}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-blue-500/10 dark:from-purple-900/20 dark:via-indigo-900/20 dark:to-blue-900/20 backdrop-blur-xl rounded-2xl border border-purple-200/40 dark:border-purple-700/40 shadow-xl overflow-hidden"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-400/5 via-indigo-400/5 to-blue-400/5 animate-pulse"></div>
      
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative w-full p-4 flex items-center justify-between text-left hover:bg-gradient-to-r hover:from-purple-100/30 hover:to-indigo-100/30 dark:hover:from-purple-900/30 dark:hover:to-indigo-900/30 transition-all duration-300 group"
      >
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          {/* Icon and Animation */}
          <div className="flex items-center space-x-3">
            {showRealTime && !isExpanded && (
              <motion.span 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="text-purple-500 dark:text-purple-400 font-mono text-lg"
              >
                {thinkingAnimation}
              </motion.span>
            )}
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Brain size={18} className="text-white" />
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl opacity-30 animate-ping"></div>
            </div>
          </div>

          {/* Title and Stats */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-1">
              <span className="text-base font-semibold text-purple-700 dark:text-purple-300 group-hover:text-purple-800 dark:group-hover:text-purple-200 transition-colors">
                Thinking Process
              </span>
              {sessionStats.totalSteps > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                    {sessionStats.totalSteps} steps
                  </span>
                </div>
              )}
            </div>
            
            {/* Stats Row */}
            <div className="flex items-center space-x-4 text-xs">
              {sessionStats.totalDuration > 0 && (
                <div className="flex items-center space-x-1">
                  <Clock size={12} className="text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {Math.round(sessionStats.totalDuration)}ms
                  </span>
                </div>
              )}
              
              {sessionStats.averageConfidence > 0 && (
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${getConfidenceGradient(sessionStats.averageConfidence / 100)} shadow-sm`}></div>
                  <span className={`font-medium ${getConfidenceColor(sessionStats.averageConfidence / 100)}`}>
                    {sessionStats.averageConfidence}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expand Button */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="p-2 rounded-xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm border border-white/30 dark:border-gray-700/30 shadow-sm group-hover:bg-white/60 dark:group-hover:bg-gray-800/60 group-hover:shadow-md transition-all"
        >
          <ChevronDown size={16} className="text-purple-600 dark:text-purple-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Summary Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-4 bg-gradient-to-r from-white/60 to-purple-50/60 dark:from-gray-800/60 dark:to-purple-900/40 backdrop-blur-sm rounded-xl border border-purple-200/30 dark:border-purple-700/30 shadow-sm"
              >
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-2 h-2 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Analysis Summary</span>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {thinkingSummary}
                </div>
              </motion.div>

              {/* Raw Thinking (for detailed/verbose modes) */}
              {verbosity !== "minimal" && thinking && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="p-4 bg-gradient-to-r from-gray-50/70 to-blue-50/70 dark:from-gray-900/50 dark:to-blue-900/50 backdrop-blur-sm rounded-xl border border-gray-200/30 dark:border-gray-700/30"
                >
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Raw Thinking</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed custom-scrollbar">
                    {thinking}
                  </div>
                </motion.div>
              )}

              {/* Steps View */}
              {renderStepsView()}

              {/* Session Stats */}
              {renderSessionStats()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

function generateSummary(thinking: string): string {
  // Extract key points from thinking
  const lines = thinking.split("\n").filter(line => line.trim());

  // Look for key patterns
  const patterns = {
    analyzing: /analyz|consider|evaluat|examin/i,
    planning: /plan|strateg|approach|implement/i,
    deciding: /decid|choos|select|determin/i,
    creating: /creat|generat|build|design/i,
    optimizing: /optim|improv|enhanc|refin/i
  };

  let summaryParts: string[] = [];

  for (const [action, pattern] of Object.entries(patterns)) {
    if (pattern.test(thinking)) {
      summaryParts.push(action);
    }
  }

  if (summaryParts.length === 0) {
    return "Processing request...";
  }

  return `${summaryParts.slice(0, 3).join(", ")} ${summaryParts.length > 3 ? "and more" : ""}`;
}
