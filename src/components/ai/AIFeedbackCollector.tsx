import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, X, Edit2 } from "react-feather";

interface AIFeedbackCollectorProps {
  exampleId: string;
  modelType: string;
  result: any;
  onFeedbackSubmitted?: (isCorrect: boolean, correctedOutput?: any) => void;
  allowCorrection?: boolean;
  className?: string;
}

/**
 * Component for collecting user feedback on AI predictions
 * Used to improve the machine learning model over time
 */
export const AIFeedbackCollector: React.FC<AIFeedbackCollectorProps> = ({
  exampleId,
  modelType,
  result,
  onFeedbackSubmitted,
  allowCorrection = true,
  className = ""
}) => {
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "submitting" | "submitted" | "correcting">("idle");
  const [correctedOutput, setCorrectedOutput] = useState<string>("");

  // Handle feedback submission
  const handleFeedback = async (isCorrect: boolean) => {
    setFeedbackStatus("submitting");

    try {
      // Send feedback to the server
      const response = await fetch("/api/ml/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exampleId,
          isCorrect,
          modelType
        })
      });

      if (!response.ok) {
        throw new Error(`Feedback submission failed: ${response.statusText}`);
      }

      // Update UI state
      setFeedbackStatus("submitted");

      // If incorrect and allowCorrection is enabled, show correction form
      if (!isCorrect && allowCorrection) {
        setFeedbackStatus("correcting");
      }

      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(isCorrect);
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      setFeedbackStatus("idle"); // Reset to allow retry
    }
  };

  // Handle correction submission
  const handleCorrectionSubmit = async () => {
    if (!correctedOutput.trim()) return;

    setFeedbackStatus("submitting");

    try {
      let parsedOutput = null;
      try {
        // Attempt to parse as JSON if possible
        parsedOutput = JSON.parse(correctedOutput);
      } catch {
        // If parsing fails, use the raw string
        parsedOutput = correctedOutput;
      }

      // Send correction to the server
      const response = await fetch("/api/ml/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exampleId,
          isCorrect: false,
          correctedOutput: parsedOutput,
          modelType
        })
      });

      if (!response.ok) {
        throw new Error(`Correction submission failed: ${response.statusText}`);
      }

      // Update UI state
      setFeedbackStatus("submitted");

      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(false, parsedOutput);
      }
    } catch (error) {
      console.error("Correction submission error:", error);
      setFeedbackStatus("idle"); // Reset to allow retry
    }
  };

  // Cancel correction
  const handleCancelCorrection = () => {
    setFeedbackStatus("submitted");
    setCorrectedOutput("");
  };

  // Reset feedback state
  const handleReset = () => {
    setFeedbackStatus("idle");
    setCorrectedOutput("");
  };

  return (
    <div className={`ai-feedback-collector ${className}`}>
      {feedbackStatus === "idle" && (
        <div className="flex items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
          <span className="text-sm text-gray-600 dark:text-gray-300">Was this result helpful?</span>
          <button
            onClick={() => handleFeedback(true)}
            className="p-1.5 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400"
            aria-label="Yes, this was helpful"
          >
            <ThumbsUp size={16} />
          </button>
          <button
            onClick={() => handleFeedback(false)}
            className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
            aria-label="No, this wasn't helpful"
          >
            <ThumbsDown size={16} />
          </button>
        </div>
      )}

      {feedbackStatus === "submitting" && (
        <div className="p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-300 flex items-center">
            <div className="animate-spin mr-2 h-4 w-4 border-2 border-gray-500 dark:border-gray-400 border-t-transparent dark:border-t-transparent rounded-full"></div>
            Submitting feedback...
          </div>
        </div>
      )}

      {feedbackStatus === "submitted" && (
        <div className="p-2 border border-green-200 dark:border-green-900/30 rounded-md bg-green-50 dark:bg-green-900/10">
          <div className="text-sm text-green-600 dark:text-green-400 flex items-center">
            <Check size={16} className="mr-2" />
            Thank you for your feedback!
            <button
              onClick={handleReset}
              className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {feedbackStatus === "correcting" && (
        <div className="p-3 border border-blue-200 dark:border-blue-900/30 rounded-md bg-blue-50 dark:bg-blue-900/10">
          <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center mb-2">
            <Edit2 size={16} className="mr-2" />
            Please provide the correct output:
          </div>
          <textarea
            value={correctedOutput}
            onChange={e => setCorrectedOutput(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm min-h-[100px]"
            placeholder={typeof result === "object" ? JSON.stringify(result, null, 2) : (result as string)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={handleCancelCorrection}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCorrectionSubmit}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!correctedOutput.trim()}
            >
              Submit Correction
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIFeedbackCollector;
