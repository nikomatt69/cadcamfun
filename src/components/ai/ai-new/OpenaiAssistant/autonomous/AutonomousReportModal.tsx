import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProgressReport } from "@/src/types/autonomousTypes";
import { X, Clock, Target, TrendingUp, Layers, CheckCircle, Award, Zap, BarChart } from "react-feather";

interface AutonomousReportModalProps {
  report: ProgressReport | null;
  isOpen: boolean;
  onClose: () => void;
}

const AutonomousReportModal: React.FC<AutonomousReportModalProps> = ({ report, isOpen, onClose }) => {
  if (!isOpen || !report) {
    return null;
  }

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getQualityColor = (score: number) => {
    if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 80) return "text-blue-600 dark:text-blue-400";
    if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getQualityBg = (score: number) => {
    if (score >= 90) return "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700";
    if (score >= 80) return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700";
    if (score >= 70) return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700";
    return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700";
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700"
        >
          {/* Header with gradient background */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <BarChart size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Autonomous Session Report</h2>
                  <p className="text-blue-100 text-sm mt-1">Comprehensive analysis of AI-driven CAD generation</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors backdrop-blur-sm">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main content with scroll */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
            {/* Summary Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-xl p-6 border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center space-x-2 mb-3">
                <Target className="text-blue-600 dark:text-blue-400" size={20} />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Executive Summary</h3>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm bg-white/60 dark:bg-gray-900/40 p-4 rounded-lg border border-gray-200/50 dark:border-gray-600/50">
                {report.summary}
              </p>
            </motion.div>

            {/* Key Metrics Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              <MetricCard
                icon={<Target className="text-emerald-600 dark:text-emerald-400" size={20} />}
                title="Final Quality Score"
                value={`${report.finalQualityScore}%`}
                className={getQualityBg(report.finalQualityScore)}
                valueClassName={getQualityColor(report.finalQualityScore)}
                subtitle="Overall performance"
              />

              <MetricCard
                icon={<TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />}
                title="Quality Improvement"
                value={`+${Math.round(report.qualityImprovement)}%`}
                className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700"
                valueClassName="text-blue-600 dark:text-blue-400"
                subtitle="Progress made"
              />

              <MetricCard
                icon={<Clock className="text-purple-600 dark:text-purple-400" size={20} />}
                title="Duration"
                value={formatDuration(report.duration)}
                className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700"
                valueClassName="text-purple-600 dark:text-purple-400"
                subtitle="Total processing time"
              />

              <MetricCard
                icon={<Zap className="text-orange-600 dark:text-orange-400" size={20} />}
                title="Total Iterations"
                value={report.totalIterations.toString()}
                className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700"
                valueClassName="text-orange-600 dark:text-orange-400"
                subtitle="Processing cycles"
              />

              <MetricCard
                icon={<Layers className="text-indigo-600 dark:text-indigo-400" size={20} />}
                title="Elements Generated"
                value={(report.elementsGenerated || 0).toString()}
                className="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700"
                valueClassName="text-indigo-600 dark:text-indigo-400"
                subtitle="CAD components"
              />

              <MetricCard
                icon={<CheckCircle className="text-teal-600 dark:text-teal-400" size={20} />}
                title="Stop Reason"
                value={report.stopReason ? report.stopReason.replace(/_/g, " ") : "N/A"}
                className="bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700"
                valueClassName="text-teal-600 dark:text-teal-400"
                subtitle="Completion status"
              />
            </motion.div>

            {/* Actions Executed */}
            {report.actionsExecuted && report.actionsExecuted.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-center space-x-2 mb-4">
                  <Zap className="text-orange-600 dark:text-orange-400" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Actions Executed</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {report.actionsExecuted.map((action, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + index * 0.1 }}
                      className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span className="text-sm font-medium text-orange-800 dark:text-orange-200 capitalize">
                          {action.replace(/_/g, " ")}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Achievements */}
            {report.achievements && report.achievements.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-center space-x-2 mb-4">
                  <Award className="text-yellow-600 dark:text-yellow-400" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Achievements</h3>
                </div>
                <div className="space-y-3">
                  {report.achievements.map((achievement, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.1 }}
                      className="flex items-start space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg"
                    >
                      <CheckCircle className="text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" size={16} />
                      <span className="text-sm text-yellow-800 dark:text-yellow-200 leading-relaxed">
                        {achievement}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Recommendations */}
            {report.recommendations && report.recommendations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
              >
                <div className="flex items-center space-x-2 mb-4">
                  <Target className="text-indigo-600 dark:text-indigo-400" size={20} />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Recommendations</h3>
                </div>
                <div className="space-y-3">
                  {report.recommendations.map((rec, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + index * 0.1 }}
                      className="flex items-start space-x-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg"
                    >
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">{rec}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer with action button */}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  className?: string;
  valueClassName?: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  title,
  value,
  className = "",
  valueClassName = "",
  subtitle
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    className={`p-4 rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md ${className}`}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center space-x-2">
        {icon}
        <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">{title}</h4>
      </div>
    </div>
    <div className="space-y-1">
      <p className={`font-bold text-2xl ${valueClassName}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  </motion.div>
);

export default AutonomousReportModal;
