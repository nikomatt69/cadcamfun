/**
 * AutonomousReport.tsx - Visualizza il report finale del processo autonomo
 */

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, TrendingUp, Award, AlertCircle, Clock, Layers, Target, ChevronDown, ChevronUp } from "lucide-react";
import { ProgressReport, StopReason } from "@/src/types/autonomousTypes";

interface AutonomousReportProps {
  report: ProgressReport;
  onClose?: () => void;
  className?: string;
}

export const AutonomousReport: React.FC<AutonomousReportProps> = ({ report, onClose, className = "" }) => {
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    summary: true,
    achievements: true,
    recommendations: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getQualityColor = (score: number): string => {
    if (score >= 90) return "text-green-600 dark:text-green-400";
    if (score >= 75) return "text-blue-600 dark:text-blue-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getStopReasonIcon = (reason: StopReason): React.ReactNode => {
    switch (reason) {
      case "quality_achieved":
        return <Target className="w-5 h-5 text-green-500" />;
      case "max_iterations":
        return <Layers className="w-5 h-5 text-blue-500" />;
      case "timeout":
        return <Clock className="w-5 h-5 text-orange-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">Autonomous Processing Report</h2>
              <p className="text-indigo-100">Session ID: {report.sessionId.substring(0, 8)}...</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
        <MetricCard
          icon={<TrendingUp className="w-6 h-6 text-blue-500" />}
          label="Final Quality"
          value={`${report.finalQualityScore}%`}
          valueClass={getQualityColor(report.finalQualityScore)}
        />
        <MetricCard
          icon={<Clock className="w-6 h-6 text-green-500" />}
          label="Duration"
          value={formatDuration(report.duration)}
        />
        <MetricCard
          icon={<Layers className="w-6 h-6 text-purple-500" />}
          label="Iterations"
          value={report.totalIterations.toString()}
        />
        <MetricCard
          icon={<Award className="w-6 h-6 text-yellow-500" />}
          label="Improvement"
          value={`+${Math.round(report.qualityImprovement)}%`}
          valueClass="text-green-600 dark:text-green-400"
        />
      </div>

      {/* Summary Section */}
      <ReportSection
        title="Summary"
        icon={<FileText className="w-5 h-5" />}
        expanded={expandedSections.summary}
        onToggle={() => toggleSection("summary")}
      >
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{report.summary}</p>

        <div className="mt-4 flex items-center space-x-2">
          {getStopReasonIcon(report.stopReason)}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Stopped: {formatStopReason(report.stopReason)}
          </span>
        </div>

        {report.elementsGenerated > 0 && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Generated <span className="font-bold">{report.elementsGenerated}</span> CAD elements
            </p>
          </div>
        )}
      </ReportSection>

      {/* Achievements Section */}
      {report.achievements.length > 0 && (
        <ReportSection
          title="Achievements"
          icon={<Award className="w-5 h-5" />}
          expanded={expandedSections.achievements}
          onToggle={() => toggleSection("achievements")}
        >
          <div className="space-y-2">
            {report.achievements.map((achievement, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-2"
              >
                <span className="text-lg">{achievement.substring(0, 2)}</span>
                <p className="text-gray-700 dark:text-gray-300">{achievement.substring(2).trim()}</p>
              </motion.div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Recommendations Section */}
      {report.recommendations && report.recommendations.length > 0 && (
        <ReportSection
          title="Recommendations"
          icon={<AlertCircle className="w-5 h-5" />}
          expanded={expandedSections.recommendations}
          onToggle={() => toggleSection("recommendations")}
        >
          <div className="space-y-3">
            {report.recommendations.map((recommendation, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
              >
                <p className="text-sm text-yellow-800 dark:text-yellow-300">{recommendation}</p>
              </motion.div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Actions Section */}
      {report.actionsExecuted.length > 0 && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Actions Executed</h3>
          <div className="flex flex-wrap gap-2">
            {report.actionsExecuted.map((action, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Helper Components
const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}> = ({ icon, label, value, valueClass = "text-gray-900 dark:text-gray-100" }) => (
  <div className="flex flex-col items-center text-center">
    <div className="mb-2">{icon}</div>
    <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
    <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
  </div>
);

const ReportSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, expanded, onToggle, children }) => (
  <div className="border-b border-gray-200 dark:border-gray-700">
    <button
      onClick={onToggle}
      className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      <div className="flex items-center space-x-3">
        {icon}
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
      </div>
      {expanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
    </button>

    <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="px-6 pb-6">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// Helper function
function formatStopReason(reason: StopReason): string {
  const reasons: Record<StopReason, string> = {
    quality_achieved: "Quality threshold achieved",
    max_iterations: "Maximum iterations reached",
    user_interrupted: "Interrupted by user",
    error_threshold: "Error threshold exceeded",
    diminishing_returns: "Diminishing returns detected",
    timeout: "Time limit exceeded",
    no_improvements_possible: "No further improvements possible",
    objective_achieved: "Objective achieved",
    quality_stagnation: "Quality stagnation",
    max_continuous_iterations: "Maximum continuous iterations"
  };

  return reasons[reason] || "Unknown reason";
}
