// src/components/ai/ProactiveAssistant/ContextualHintsProvider.tsx
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, ArrowRight, Eye, BookOpen, Target, Zap, X, Clock } from "react-feather";
import { ContextualHint } from "./types";
import { Lightbulb, Pin, Sparkles } from "lucide-react";

interface ContextualHintsProviderProps {
  /**
   * Array of contextual hints to display based on current editor state and user interactions.
   * These hints provide just-in-time learning opportunities and productivity guidance.
   */
  hints: ContextualHint[];

  /**
   * Callback function triggered when a user interacts with a hint through clicking or dismissing.
   * This enables tracking of hint effectiveness and user engagement patterns.
   */
  onHintAction: (hint: ContextualHint, action: "dismiss" | "pin" | "click") => void;

  /**
   * Optional callback for custom hint handling when built-in behavior is insufficient.
   * This allows extension of hint functionality for specific use cases.
   */
  onCustomHintHandler?: (hint: ContextualHint) => Promise<boolean>;

  /**
   * Configuration object controlling hint display behavior and interaction patterns.
   * This includes timing, positioning, and persistence settings.
   */
  displayConfig?: {
    maxSimultaneousHints: number;
    autoHideDelay: number;
    enableHintPinning: boolean;
    showHintIcons: boolean;
  };

  /**
   * Position preference for hint display within the editor interface.
   * This allows flexible positioning based on available screen real estate and user preference.
   */
  position?: "top" | "bottom" | "sidebar" | "floating";
}

/**
 * ContextualHintsProvider delivers intelligent, context-aware guidance within the G-code editing environment.
 * This component analyzes user behavior patterns and editor state to provide relevant educational content
 * and productivity enhancements at precisely the right moments during the coding process.
 *
 * The provider supports multiple hint types including educational content, productivity tips,
 * and just-in-time assistance for complex G-code programming tasks. Hints are dynamically
 * prioritized based on user experience level and current editing context.
 */
const ContextualHintsProvider: React.FC<ContextualHintsProviderProps> = ({
  hints,
  onHintAction,
  onCustomHintHandler,
  displayConfig = {
    maxSimultaneousHints: 3,
    autoHideDelay: 8000,
    enableHintPinning: true,
    showHintIcons: true
  },
  position = "floating"
}) => {
  // State management for hint display and interaction tracking
  const [visibleHints, setVisibleHints] = useState<ContextualHint[]>([]);
  const [pinnedHints, setPinnedHints] = useState<Set<string>>(new Set());
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [hintTimers, setHintTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());

  /**
   * Effect hook for managing hint visibility based on priority and display configuration.
   * This ensures optimal user experience by preventing hint overflow while maintaining relevance.
   */
  useEffect(() => {
    // Filter and prioritize hints for display
    const activeHints = hints
      .filter(hint => !dismissedHints.has(hint.id))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, displayConfig.maxSimultaneousHints);

    setVisibleHints(activeHints);

    // Set up auto-hide timers for non-persistent hints
    activeHints.forEach(hint => {
      if (!hint.persistent && !pinnedHints.has(hint.id) && displayConfig.autoHideDelay > 0) {
        const timer = setTimeout(() => {
          handleHintDismiss(hint);
        }, displayConfig.autoHideDelay);

        setHintTimers(prev => new Map(prev).set(hint.id, timer));
      }
    });

    // Cleanup timers for hints no longer visible
    return () => {
      hintTimers.forEach(timer => clearTimeout(timer));
      setHintTimers(new Map());
    };
  }, [hints, dismissedHints, pinnedHints, displayConfig]);

  /**
   * Handles hint dismissal with proper cleanup and user preference tracking.
   * This function manages the complete hint lifecycle including timer cleanup and state updates.
   */
  const handleHintDismiss = useCallback(
    (hint: ContextualHint) => {
      // Clear any associated timer
      const timer = hintTimers.get(hint.id);
      if (timer) {
        clearTimeout(timer);
        setHintTimers(prev => {
          const newMap = new Map(prev);
          newMap.delete(hint.id);
          return newMap;
        });
      }

      // Add to dismissed hints to prevent re-display
      setDismissedHints(prev => new Set(prev).add(hint.id));

      // Remove from pinned hints if applicable
      setPinnedHints(prev => {
        const newSet = new Set(prev);
        newSet.delete(hint.id);
        return newSet;
      });

      // Notify parent component of hint action
      onHintAction(hint, "dismiss");
    },
    [hintTimers, onHintAction]
  );

  /**
   * Handles hint pinning to maintain visibility for important or frequently referenced information.
   * Pinned hints persist across editing sessions and provide continuous reference capability.
   */
  const handleHintPin = useCallback(
    (hint: ContextualHint) => {
      if (!displayConfig.enableHintPinning) return;

      const isPinned = pinnedHints.has(hint.id);

      if (isPinned) {
        // Unpin the hint
        setPinnedHints(prev => {
          const newSet = new Set(prev);
          newSet.delete(hint.id);
          return newSet;
        });
      } else {
        // Pin the hint and clear any auto-hide timer
        setPinnedHints(prev => new Set(prev).add(hint.id));

        const timer = hintTimers.get(hint.id);
        if (timer) {
          clearTimeout(timer);
          setHintTimers(prev => {
            const newMap = new Map(prev);
            newMap.delete(hint.id);
            return newMap;
          });
        }
      }

      // Notify parent component of hint action
      onHintAction(hint, "pin");
    },
    [pinnedHints, hintTimers, displayConfig.enableHintPinning, onHintAction]
  );

  /**
   * Handles hint click interactions for actionable hints that provide interactive functionality.
   * This enables hints to trigger specific actions or navigate to relevant documentation.
   */
  const handleHintClick = useCallback(
    async (hint: ContextualHint) => {
      // Notify parent component of interaction
      onHintAction(hint, "click");

      // Handle custom hint actions if handler is provided
      if (onCustomHintHandler && hint.actionable) {
        try {
          const handled = await onCustomHintHandler(hint);
          if (handled) {
            // Custom handler processed the hint successfully
            return;
          }
        } catch (error) {
          console.error("Custom hint handler failed:", error);
        }
      }

      // Default hint action handling for built-in functionality
      if (hint.actionable) {
        // Implementation would depend on specific hint types and actions
        console.log(`Executing hint action for: ${hint.content}`);
      }
    },
    [onHintAction, onCustomHintHandler]
  );

  /**
   * Renders individual hint items with appropriate styling and interaction elements.
   * Each hint includes visual indicators for type, priority, and interactive capabilities.
   */
  const renderHint = useCallback(
    (hint: ContextualHint) => {
      const isPinned = pinnedHints.has(hint.id);
      const isActionable = hint.actionable;

      // Determine hint styling based on trigger type and priority
      const triggerColors = {
        selection: "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
        cursor: "border-green-500 bg-green-50 dark:bg-green-900/20",
        typing: "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20",
        idle: "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
      };

      const triggerIcons = {
        selection: <Target size={14} />,
        cursor: <Eye size={14} />,
        typing: <BookOpen size={14} />,
        idle: <Lightbulb size={14} />
      };

      const priorityIndicator =
        hint.priority >= 4 ? "🔥" : hint.priority >= 3 ? "⚡" : hint.priority >= 2 ? "💡" : "ℹ️";

      return (
        <motion.div
          key={hint.id}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}
          className={`border backdrop-blur-sm rounded-xl p-4 transition-all duration-200 shadow-lg ${triggerColors[hint.trigger]} ${
            isPinned ? "ring-2 ring-blue-400 shadow-blue-400/20" : ""
          }`}
        >
          {/* Hint Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {displayConfig.showHintIcons && (
                <motion.div 
                  className="flex-shrink-0 p-2 rounded-lg backdrop-blur-sm border border-white/20 text-gray-600 dark:text-gray-400 bg-white/20"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  {triggerIcons[hint.trigger]}
                </motion.div>
              )}

              <div className="flex-1 min-w-0">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center space-x-2"
                >
                  <span className="text-sm">{priorityIndicator}</span>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 capitalize bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-full px-2 py-1 border border-white/20">
                    {hint.trigger}
                  </span>
                </motion.div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
              {/* Pin Button */}
              {displayConfig.enableHintPinning && (
                <motion.button
                  onClick={() => handleHintPin(hint)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded-lg text-xs transition-all duration-200 backdrop-blur-sm border ${
                    isPinned
                      ? "bg-blue-500/80 text-white border-blue-400/50 shadow-blue-500/20"
                      : "bg-white/50 dark:bg-gray-600/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-500/70 border-white/20 dark:border-gray-500/50"
                  }`}
                  title={isPinned ? "Unpin hint" : "Pin hint"}
                >
                  <motion.div
                    animate={isPinned ? {
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.1, 1]
                    } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <Pin size={12} />
                  </motion.div>
                </motion.button>
              )}

              {/* Dismiss Button */}
              <motion.button
                onClick={() => handleHintDismiss(hint)}
                whileHover={{ scale: 1.1, backgroundColor: "rgba(239, 68, 68, 0.8)" }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-lg bg-gray-400/70 hover:bg-gray-500/80 text-white text-xs transition-all duration-200 backdrop-blur-sm border border-gray-300/50"
                title="Dismiss hint"
              >
                <X size={12} />
              </motion.button>
            </div>
          </div>

          {/* Hint Content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`text-sm text-gray-800 dark:text-gray-200 ${
              isActionable ? "cursor-pointer" : ""
            }`}
            onClick={isActionable ? () => handleHintClick(hint) : undefined}
          >
            <motion.p 
              className="leading-relaxed"
              whileHover={isActionable ? { 
                scale: 1.02,
                color: "#2563eb"
              } : {}}
            >
              {hint.content}
            </motion.p>

            {/* Actionable Indicator */}
            <AnimatePresence>
              {isActionable && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center space-x-2 mt-3 text-xs text-blue-600 dark:text-blue-400 bg-blue-100/50 dark:bg-blue-900/30 backdrop-blur-sm rounded-lg px-3 py-2 border border-blue-200/50"
                  whileHover={{ scale: 1.05 }}
                >
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight size={12} />
                  </motion.div>
                  <span className="font-medium">Click for more details</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Persistence Indicator */}
          {hint.persistent && !isPinned && (
            <div className="flex items-center space-x-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock size={10} />
              <span>This hint will remain visible</span>
            </div>
          )}

          {/* Auto-hide Countdown for Non-persistent Hints */}
          {!hint.persistent && !isPinned && displayConfig.autoHideDelay > 0 && (
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
              <div
                className="bg-blue-500 h-1 rounded-full transition-all duration-100"
                style={{
                  width: "100%",
                  animation: `shrink ${displayConfig.autoHideDelay}ms linear forwards`
                }}
              />
            </div>
          )}
        </motion.div>
      );
    },
    [pinnedHints, displayConfig, handleHintPin, handleHintDismiss, handleHintClick]
  );

  // Return empty state if no hints are visible
  if (visibleHints.length === 0) {
    return null;
  }

  // Determine container positioning and styling based on position preference
  const positionClasses = {
    top: "fixed top-16 left-1/2 transform -translate-x-1/2 z-50",
    bottom: "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50",
    sidebar: "sticky top-4 z-40",
    floating: "fixed top-20 right-4 z-50"
  };

  const containerClass = `${positionClasses[position]} max-w-sm`;

  return (
    <>
      {/* CSS Animation for Auto-hide Countdown */}
      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>

          <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={containerClass}
    >
      <div className="space-y-3">
        {/* Header for Multiple Hints */}
        <AnimatePresence>
          {visibleHints.length > 1 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-xl p-3 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <motion.div
                    animate={{ 
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.1, 1]
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="p-2 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg text-white"
                  >
                    <Lightbulb size={16} />
                  </motion.div>
                  <div>
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      Contextual Hints ({visibleHints.length})
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Smart suggestions for your context
                    </p>
                  </div>
                </div>

                <AnimatePresence>
                  {pinnedHints.size > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      className="flex items-center space-x-1 text-xs text-blue-600 bg-blue-100/50 dark:bg-blue-900/30 backdrop-blur-sm rounded-full px-3 py-1 border border-blue-200/50"
                    >
                      <Pin size={10} />
                      <span className="font-medium">{pinnedHints.size} pinned</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Render Visible Hints */}
        <AnimatePresence>
          {visibleHints.map((hint, index) => (
            <motion.div
              key={hint.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.1 }}
            >
              {renderHint(hint)}
            </motion.div>
          ))}
        </AnimatePresence>

          {/* Summary for Large Number of Available Hints */}
          <AnimatePresence>
            {hints.length > displayConfig.maxSimultaneousHints && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-gray-100/60 dark:bg-gray-700/60 backdrop-blur-sm border border-white/20 dark:border-gray-600/50 rounded-xl p-3 text-center shadow-lg"
              >
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs text-gray-600 dark:text-gray-400 font-medium flex items-center justify-center space-x-2"
                >
                  <Sparkles size={12} className="text-blue-500" />
                  <span>{hints.length - visibleHints.length} more hints available</span>
                </motion.p>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs text-gray-500 dark:text-gray-500 mt-1"
                >
                  Dismiss current hints to see additional suggestions
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};

export default ContextualHintsProvider;
