// src/components/ai/AIMessage.tsx
import React, { useState, useEffect } from "react";

import { motion } from "framer-motion";
import {
  AIMessage as AIMessageType,
  AIArtifact,
  TextContentBlock,
  ImageContentBlock,
  MessageContent,
  AIAction,
  ThinkingStep,
  ThinkingSession
} from "../../../../types/AITypes";
import { Element } from "@/src/store/elementsStore";
import { useAI } from "../AIContextProvider";
import { AIArtifactRenderer } from "./AIArtifactRenderer";
import { ThumbsUp, ThumbsDown, PlusSquare, AlertCircle, Cpu, FileText, } from "react-feather";
import { CADActionHandler } from "./CADActionHandler";
import { ThinkingDropdown } from "../../ThinkingDropdown";
import { ProgressReport } from "@/src/types/autonomousTypes";
import { Sparkles } from "lucide-react";
import { useSession } from "@/src/lib/auth-client";

interface AIMessageProps {
  message: AIMessageType; // Keep message prop, even for typing indicator
  onFeedback?: (messageId: string, rating: "good" | "bad") => void;
  onExecuteAction?: (action: AIAction) => void;
  onViewReport?: (report: ProgressReport) => void;
  isTypingIndicator?: boolean;
  thinking?: string;
  thinkingSteps?: ThinkingStep[];
  thinkingSession?: ThinkingSession;
  showExtendedThinking?: boolean;
}

// Helper function to render message content (text and images)
const renderMessageContent = (content: MessageContent) => {
  if (typeof content === "string") {
    return <div className="ai-message-content whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0">{content}</div>;
  } else if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((block, index) => {
          if (block.type === "text") {
            return (
              <div key={index} className="ai-message-content whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0">
                {(block as TextContentBlock).text}
              </div>
            );
          } else if (block.type === "image_url") {
            return (
              <div key={index} className="mt-1">
                <img
                  src={(block as ImageContentBlock).image_url.url}
                  alt="User uploaded content"
                  className="max-w-full h-auto rounded-xl border border-gray-200/50 dark:border-gray-700/50 max-h-60 object-contain shadow-lg backdrop-blur-sm"
                />
              </div>
            );
          } else {
            return <div key={index}>[Unsupported content block type]</div>;
          }
        })}
      </div>
    );
  } else {
    return <div>[Invalid content format]</div>;
  }
};

// TypingDots component
const TypingDots = () => (
  <motion.div
    className="flex space-x-1.5 items-center justify-center h-full px-2"
    initial="start"
    animate="end"
    variants={{
      start: { transition: { staggerChildren: 0.2 } },
      end: { transition: { staggerChildren: 0.2 } }
    }}
  >
    {[0, 1, 2].map(i => (
      <motion.div
        key={i}
        className="w-2 h-2 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full shadow-sm"
        variants={{
          start: { y: "0%" },
          end: { y: "-40%" }
        }}
        transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      />
    ))}
  </motion.div>
);

export const AIMessage: React.FC<AIMessageProps> = ({
  message,
  onFeedback,
  onExecuteAction,
  onViewReport,
  isTypingIndicator = false,
  thinking,
  thinkingSteps = [],
  thinkingSession,
  showExtendedThinking = false
}) => {
  // Call hooks unconditionally at the top
  const { addElementsToCanvas, state } = useAI();
  const { data: session } = useSession();
  const [elementsAdded, setElementsAdded] = useState<Record<string, boolean>>({});

  // Destructure message properties *after* hooks
  // Provide defaults for typing indicator case where message might be minimal
  const {
    id = "typing-indicator",
    role = "assistant",
    content = "",
    timestamp = Date.now(),
    artifacts = [],
    isError = false
  } = message || {};

  // Regular message useEffect (only relevant if not typing indicator)
  useEffect(() => {
    if (!isTypingIndicator && artifacts && artifacts.length > 0) {
      // Existing artifact logic
    }
  }, [artifacts, id, isTypingIndicator]);

  // Regular message handler (only relevant if not typing indicator)
  const handleAddElements = (artifactId: string, elements: any) => {
    if (isTypingIndicator || !elements || !Array.isArray(elements)) {
      return;
    }
    addElementsToCanvas(elements as Element[]);
    setElementsAdded(prev => ({ ...prev, [artifactId]: true }));
  };

  // --- Common variables (can be used by both typing indicator and regular message) ---
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const userInitial = session?.user?.name?.charAt(0) || "?";
  const userImage = "https://ui-avatars.com/api/?name=" + userInitial;

  // Determine message bubble style based on role/error, default to assistant style for typing
  const messageBubbleClasses =
    role === "user"
      ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl rounded-br-lg shadow-lg border border-blue-400/20 backdrop-blur-xl"
      : isError
        ? "bg-gradient-to-br from-red-50/90 to-red-100/90 dark:from-red-900/30 dark:to-red-800/30 text-red-800 dark:text-red-200 border border-red-200/50 dark:border-red-700/50 rounded-2xl rounded-bl-lg shadow-lg backdrop-blur-xl"
        : "bg-white/70 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-lg shadow-lg border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-xl";

  // Determine timestamp style based on role/error, default to assistant style for typing
  const timestampClasses =
    role === "user" ? "text-blue-100" : isError ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400";

  // --- Render logic ---

  const renderAvatar = () => (
    <motion.div
      className="flex-shrink-0 w-8 h-8 rounded-xl overflow-hidden mt-1 border border-gray-200/50 dark:border-gray-600/50 shadow-lg backdrop-blur-sm"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
    >
      {role === "assistant" ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-gray-700 dark:to-gray-600">
          <Cpu size={18} className="text-purple-600 dark:text-purple-300" />
        </div>
      ) : userImage ? (
        <img src={userImage} alt="User" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800">
          <span className="text-blue-800 dark:text-blue-200 font-semibold text-sm">{userInitial}</span>
        </div>
      )}
    </motion.div>
  );

  const renderMessageBubble = () => (
    <motion.div
      className={`flex-grow rounded-2xl p-4 shadow-lg min-w-0 overflow-hidden ${messageBubbleClasses} ${isTypingIndicator ? "min-h-[44px] flex items-center" : ""}`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {isTypingIndicator ? (
        <TypingDots />
      ) : (
        <>
          {/* Content */}
          <div className={`ai-message-content text-sm leading-relaxed break-words overflow-wrap-anywhere word-break-break-all ${isError ? "text-red-800 dark:text-red-200" : ""}`}>
            {renderMessageContent(content)}
          </div>

          {/* Artifacts */}
          {artifacts && artifacts.length > 0 && !isError && (
            <div className="mt-3 space-y-3">
              {artifacts.map(artifact => {
                if (artifact.type === "cad_elements") {
                  const isAdded = !!elementsAdded[artifact.id];
                  return (
                    <motion.div
                      key={artifact.id}
                      className="bg-white/60 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200/50 dark:border-gray-600/50 backdrop-blur-sm shadow-md"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-500 rounded-full"></div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {artifact.title || "Generated CAD Elements"}
                          <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                            {Array.isArray(artifact.content) ? artifact.content.length : 0} items
                          </span>
                        </p>
                      </div>
                      <motion.button
                        onClick={() => handleAddElements(artifact.id, artifact.content)}
                        disabled={isAdded}
                        className={`flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ${isAdded
                          ? "bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl"
                          }`}
                        whileHover={!isAdded ? { scale: 1.02 } : {}}
                        whileTap={!isAdded ? { scale: 0.98 } : {}}
                      >
                        <PlusSquare size={16} className="mr-2" />
                        {isAdded ? "Elements Added" : "Add to Canvas"}
                      </motion.button>
                    </motion.div>
                  );
                } else if (artifact.type === "tool_calls") {
                  const actionsFromArtifact: AIAction[] = artifact.content || [];
                  const actionsToRender: AIAction[] = actionsFromArtifact.map((action: AIAction) => ({
                    type: action.type || "unknown_action",
                    payload: action.payload || {},
                    description: action.description || `Execute ${action.type || "tool call"}`
                  }));

                  if (actionsToRender.length === 0) return null;

                  return (
                    <CADActionHandler
                      key={artifact.id}
                      actions={actionsToRender}
                      onExecute={
                        onExecuteAction || (() => console.error("onExecuteAction prop not provided to AIMessage"))
                      }
                      isProcessing={state.isProcessing}
                    />
                  );
                }
                // Handle new autonomous_report artifact type
                else if (artifact.type === "autonomous_report" && onViewReport) {
                  const report = artifact.content as ProgressReport;
                  return (
                    <motion.div
                      key={artifact.id}
                      className="bg-gradient-to-br from-indigo-50/90 to-purple-50/90 dark:from-indigo-900/30 dark:to-purple-900/30 p-3 rounded-xl border border-indigo-200/50 dark:border-indigo-700/50 backdrop-blur-sm shadow-md"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-2 h-2 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full"></div>
                        <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
                          {artifact.title || "Autonomous Session Report"}
                        </p>
                      </div>
                      <motion.button
                        onClick={() => onViewReport(report)}
                        className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <FileText size={16} className="mr-2" />
                        View Report
                      </motion.button>
                    </motion.div>
                  );
                }
                return <AIArtifactRenderer key={artifact.id} artifact={artifact} />;
              })}
            </div>
          )}

          {/* Feedback */}
          {role === "assistant" && onFeedback && !isError && (
            <motion.div
              className="mt-3 pt-3 border-t border-gray-200/30 dark:border-gray-600/30 flex justify-end space-x-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <motion.button
                onClick={() => onFeedback(id, "good")}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50/60 hover:bg-green-100/60 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200/50 dark:border-green-700/50 backdrop-blur-sm transition-all duration-300"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Good response"
              >
                <ThumbsUp size={12} />
                <span>Good</span>
              </motion.button>
              <motion.button
                onClick={() => onFeedback(id, "bad")}
                className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50/60 hover:bg-red-100/60 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-700/50 backdrop-blur-sm transition-all duration-300"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Bad response"
              >
                <ThumbsDown size={12} />
                <span>Bad</span>
              </motion.button>
            </motion.div>
          )}

          {/* Timestamp */}
          <div className={`text-right mt-2 text-xs ${timestampClasses} flex items-center justify-end space-x-1`}>
            <Sparkles size={10} className="opacity-50" />
            <span>{formattedTime}</span>
          </div>
        </>
      )}
    </motion.div>
  );

  return (
    <motion.div
      className={`flex w-full mb-4 ${role === "user" ? "justify-end" : "justify-start"} min-w-0 overflow-hidden`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className={`flex flex-col max-w-[85%] min-w-0 overflow-hidden ${role === "user" ? "items-end" : "items-start"}`}>
        <div className={`flex items-start space-x-3 ${role === "user" ? "flex-row-reverse space-x-reverse" : ""}`}>
          {renderAvatar()}
          {renderMessageBubble()}
        </div>
      </div>
    </motion.div>
  );
};
