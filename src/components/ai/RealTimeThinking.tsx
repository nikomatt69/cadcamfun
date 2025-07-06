// src/components/ai/RealTimeThinking.tsx
import React, { useState, useEffect } from "react";
import { Brain, Loader2, Zap, CheckCircle2 } from "lucide-react";
import { getExtendedThinkingService } from "@/src/lib/ai/ai-new/extendedThinkingService";
import { ThinkingStep } from "@/src/types/AITypes";

interface RealTimeThinkingProps {
  sessionId: string;
  onThinkingUpdate?: (step: ThinkingStep) => void;
  className?: string;
  showDetails?: boolean;
}

export const RealTimeThinking: React.FC<RealTimeThinkingProps> = ({
  sessionId,
  onThinkingUpdate,
  className = "",
  showDetails = true
}) => {
  const [currentPhase, setCurrentPhase] = useState<string>("analysis");
  const [confidence, setConfidence] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [stepCount, setStepCount] = useState<number>(0);
  const [latestContent, setLatestContent] = useState<string>("");

  useEffect(() => {
    if (!sessionId) return;

    const thinkingService = getExtendedThinkingService();
    let intervalId: NodeJS.Timeout;

    const checkForUpdates = () => {
      try {
        const session = (thinkingService as any).getThinkingSession?.(sessionId);

        if (session?.steps.length) {
          const latestStep = session.steps[session.steps.length - 1];

          // Update state
          setCurrentPhase(latestStep.phase);
          setConfidence(latestStep.confidence);
          setStepCount(session.steps.length);
          setLatestContent(latestStep.content.substring(0, 100));
          setIsActive(true);

          // Notify parent component
          if (onThinkingUpdate) {
            onThinkingUpdate(latestStep);
          }
        } else {
          setIsActive(false);
        }
      } catch (error) {
        console.warn("Error checking thinking updates:", error);
        setIsActive(false);
      }
    };

    // Check immediately
    checkForUpdates();

    // Set up polling
    intervalId = setInterval(checkForUpdates, 500);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [sessionId, onThinkingUpdate]);

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case "analysis":
        return <Brain className="w-3 h-3" />;
      case "planning":
        return <Zap className="w-3 h-3" />;
      case "execution":
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case "validation":
        return <CheckCircle2 className="w-3 h-3" />;
      default:
        return <Brain className="w-3 h-3" />;
    }
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case "analysis":
        return "text-blue-500";
      case "planning":
        return "text-yellow-500";
      case "execution":
        return "text-green-500";
      case "validation":
        return "text-purple-500";
      default:
        return "text-gray-500";
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className={`real-time-thinking ${className}`}>
      {showDetails ? (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`${getPhaseColor(currentPhase)}`}>{getPhaseIcon(currentPhase)}</div>
              <span className="text-sm font-medium text-gray-700 capitalize">{currentPhase}</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span>Step {stepCount}</span>
              <span>•</span>
              <span>{Math.round(confidence * 100)}% confidence</span>
            </div>
          </div>

          {latestContent && (
            <p className="text-xs text-gray-600 bg-white bg-opacity-50 rounded p-2">{latestContent}...</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-full border border-blue-200">
          <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full" />
          <span className="text-sm text-gray-600">
            {currentPhase} ({Math.round(confidence * 100)}%)
          </span>
        </div>
      )}
    </div>
  );
};

export default RealTimeThinking;
