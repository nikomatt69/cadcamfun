/**
 * AutonomousProgressIndicator.tsx - Indicatore del progresso del sistema autonomo
 */

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, CheckCircle, AlertCircle, XCircle, RefreshCw, Pause, Play } from "lucide-react";
import { AutonomousSession, QualityAnalysis, StopReason } from "@/src/types/autonomousTypes";

interface AutonomousProgressIndicatorProps {
  session: AutonomousSession | null;
  onInterrupt?: () => void;
  onResume?: () => void;
  compact?: boolean;
  className?: string;
}

export const AutonomousProgressIndicator: React.FC<AutonomousProgressIndicatorProps> = ({
  session,
  onInterrupt,
  onResume,
  compact = false,
  className = ""
}) => {
  const currentIteration = useMemo(() => {
    if (!session || !session.iterations || session.iterations.length === 0) return null;
    return session.iterations[session.iterations.length - 1];
  }, [session]);

  const currentQuality = useMemo(() => {
    if (!currentIteration) return null;
    return currentIteration.qualityAfter || null;
  }, [currentIteration]);

  const progress = useMemo(() => {
    if (
      !session ||
      typeof session.currentIteration !== "number" ||
      typeof session.maxIterations !== "number" ||
      session.maxIterations === 0
    )
      return 0;
    return (session.currentIteration / session.maxIterations) * 100;
  }, [session]);

  const statusIcon = useMemo(() => {
    if (!session) return <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />;
    if (!session.isActive) {
      if (session.userInterrupted) return <Pause className="w-5 h-5 text-orange-500" />;
      if (currentQuality && typeof currentQuality.score === "number" && currentQuality.score >= 85)
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
    return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
  }, [session, currentQuality]);

  const statusMessage = useMemo(() => {
    if (!session) return "Initializing...";
    if (!session.isActive) {
      if (session.userInterrupted) return "Paused by user";
      if (session.finalReport) {
        const reason = getStopReasonMessage(session.finalReport.stopReason);
        return `Completed: ${reason}`;
      }
      return "Processing complete";
    }
    return `Iteration ${session.currentIteration}/${session.maxIterations}`;
  }, [session]);

  if (!session) return null;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center space-x-3 p-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-lg ${className}`}
      >
        {statusIcon}
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{statusMessage}</div>
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mt-1">
            <motion.div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        {currentQuality && (
          <div className="text-xs font-bold text-gray-600 dark:text-gray-400">{currentQuality.score}%</div>
        )}
        {session.isActive && onInterrupt && (
          <button
            onClick={onInterrupt}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Pause autonomous processing"
          >
            <Pause className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Brain className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">Autonomous Processing</h3>
              <p className="text-sm text-blue-100">{statusMessage}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {statusIcon}
            {session.isActive && onInterrupt && (
              <button
                onClick={onInterrupt}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title="Pause processing"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            {!session.isActive && session.userInterrupted && onResume && (
              <button
                onClick={onResume}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title="Resume processing"
              >
                <Play className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Overall Progress</span>
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <motion.div
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full relative overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="absolute inset-0 bg-white/20"
              animate={{ x: ["0%", "100%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              style={{ width: "50%" }}
            />
          </motion.div>
        </div>
      </div>

      {/* Quality Metrics */}
      {currentQuality && (
        <div className="p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Quality Metrics</h4>

          <QualityMetric
            label="Overall Score"
            value={currentQuality.score}
            icon={<Zap className="w-4 h-4" />}
            color="blue"
          />

          <QualityMetric
            label="Completeness"
            value={currentQuality.completeness}
            icon={<CheckCircle className="w-4 h-4" />}
            color="green"
          />

          <QualityMetric
            label="Accuracy"
            value={currentQuality.accuracy}
            icon={<AlertCircle className="w-4 h-4" />}
            color="indigo"
          />

          {currentQuality.errorCount > 0 && (
            <div className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center space-x-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-700 dark:text-red-300">Errors Found</span>
              </div>
              <span className="text-sm font-bold text-red-600 dark:text-red-400">{currentQuality.errorCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Iteration History */}
      {session.iterations.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Iteration History</h4>
          <div className="space-y-1">
            {session.iterations.slice(-3).map((iteration, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">Iteration {iteration.iteration}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-700 dark:text-gray-300">{iteration.qualityAfter.score}%</span>
                  {iteration.stopReason && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                      {iteration.stopReason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Helper component for quality metrics
const QualityMetric: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "blue" | "green" | "indigo";
}> = ({ label, value, icon, color }) => {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    indigo: "from-indigo-500 to-indigo-600"
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className={`text-${color}-500`}>{icon}</div>
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className={`bg-gradient-to-r ${colorClasses[color]} h-2 rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />
        </div>
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300 w-10 text-right">{value}%</span>
      </div>
    </div>
  );
};

// Helper function
function getStopReasonMessage(reason: StopReason): string {
  const messages: Record<StopReason, string> = {
    quality_achieved: "Quality threshold reached",
    max_iterations: "Maximum iterations completed",
    user_interrupted: "Stopped by user",
    error_threshold: "Too many errors detected",
    diminishing_returns: "Minimal improvement potential",
    timeout: "Time limit exceeded",
    no_improvements_possible: "No further improvements available",
    objective_achieved: "Objective achieved",
    quality_stagnation: "Quality stagnation",
    max_continuous_iterations: "Maximum continuous iterations"
  };

  return messages[reason] || "Processing complete";
}
