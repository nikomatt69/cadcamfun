// src/hooks/useGCodeAI.ts
import { useState, useCallback } from "react";
import openAiGCodeService from "../services/openAiGCodeService";

import toast from "react-hot-toast";

// Types for the hook
export interface GCodeAnalysisResult {
  summary: string;
  issues: Array<{
    severity: "critical" | "warning" | "info";
    description: string;
    lineNumbers: number[];
  }>;
}

export interface GCodeOptimizationResult {
  code: string;
  improvements: string[];
  stats: {
    originalLines: number;
    optimizedLines: number;
    reductionPercent: number;
    estimatedTimeReduction: number;
  };
}

export interface GCodeCompletion {
  text: string;
  description: string;
}

export interface GCodeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  imageUrls?: string[];
}

// Hook implementation
export function useGCodeAI() {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);

  const [chatMessages, setChatMessages] = useState<GCodeMessage[]>([]);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<GCodeAnalysisResult | null>(null);
  const [lastOptimizationResult, setLastOptimizationResult] = useState<GCodeOptimizationResult | null>(null);

  // For error handling

  /**
   * Generate G-code from a text description
   */
  const generateGCode = useCallback(
    async (
      prompt: string,
      options: {
        temperature?: number;
        machineType?: "fanuc" | "heidenhain" | "siemens" | "haas" | "generic";
      } = {}
    ): Promise<string> => {
      try {
        setIsGenerating(true);

        // Add user message to chat
        const userMessage: GCodeMessage = {
          id: Date.now().toString(),
          role: "user",
          content: `Generate G-code for: ${prompt}`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, userMessage]);

        const gcode = await openAiGCodeService.generateGCode(prompt, options);

        // Add assistant message with generated code
        const assistantMessage: GCodeMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Here's the generated G-code for your request:\n\n\`\`\`gcode\n${gcode}\n\`\`\``,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        return gcode;
      } catch (error) {
        console.error("Error generating G-code:", error);
        toast("Generation Error", {
          id: error instanceof Error ? error.message : "Failed to generate G-code",
          duration: 5000
        });
        return "";
      } finally {
        setIsGenerating(false);
      }
    },
    [toast]
  );

  /**
   * Optimize existing G-code for efficiency or quality
   */
  const optimizeGCode = useCallback(
    async (
      gcode: string,
      options: {
        optimizationType?: "speed" | "quality" | "balanced";
        machineType?: "fanuc" | "heidenhain" | "siemens" | "haas" | "generic";
      } = {}
    ): Promise<GCodeOptimizationResult | null> => {
      try {
        setIsOptimizing(true);

        // Add user message to chat
        const userMessage: GCodeMessage = {
          id: Date.now().toString(),
          role: "user",
          content: `Optimize this G-code for ${options.optimizationType || "balanced"} performance.`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, userMessage]);

        const result = await openAiGCodeService.optimizeGCode(gcode, options);
        setLastOptimizationResult(result);

        // Add assistant message with optimization results
        const assistantMessage: GCodeMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `I've optimized your G-code for ${options.optimizationType || "balanced"} performance.\n\n${result.improvements
            .map(imp => `- ${imp}`)
            .join(
              "\n"
            )}\n\nReduction: ${result.stats.reductionPercent}% (${result.stats.originalLines} → ${result.stats.optimizedLines} lines)\nEstimated time saved: ~${result.stats.estimatedTimeReduction.toFixed(2)} minutes`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        return result;
      } catch (error) {
        console.error("Error optimizing G-code:", error);
        toast("Optimization Error", {
          id: error instanceof Error ? error.message : "Failed to optimize G-code",

          duration: 5000
        });
        return null;
      } finally {
        setIsOptimizing(false);
      }
    },
    [toast]
  );

  /**
   * Analyze G-code for issues or improvements
   */
  const analyzeGCode = useCallback(
    async (gcode: string): Promise<GCodeAnalysisResult | null> => {
      try {
        setIsAnalyzing(true);

        // Add user message to chat
        const userMessage: GCodeMessage = {
          id: Date.now().toString(),
          role: "user",
          content: "Analyze this G-code for issues and improvements.",
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, userMessage]);

        const result = await openAiGCodeService.analyzeGCode(gcode);
        setLastAnalysisResult(result as GCodeAnalysisResult);

        // Add assistant message with analysis results
        const assistantMessage: GCodeMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Analysis complete. ${result.summary}\n\n${
            result.issues.length > 0
              ? `Issues found:\n${result.issues
                  .map(
                    issue =>
                      `- **${issue.severity.toUpperCase()}**: ${issue.description} (lines: ${issue.lineNumbers.join(", ")})`
                  )
                  .join("\n")}`
              : "No issues found in your G-code."
          }`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        return result as GCodeAnalysisResult;
      } catch (error) {
        console.error("Error analyzing G-code:", error);
        toast("Analysis Error", {
          id: error instanceof Error ? error.message : "Failed to analyze G-code",

          duration: 5000
        });
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [toast]
  );

  /**
   * Get explanations for specific G-code
   */
  const explainGCode = useCallback(
    async (gcode: string): Promise<string> => {
      try {
        setIsExplaining(true);

        // Add user message to chat
        const userMessage: GCodeMessage = {
          id: Date.now().toString(),
          role: "user",
          content: "Explain this G-code in detail.",
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, userMessage]);

        const explanation = await openAiGCodeService.explainGCode(gcode);

        // Add assistant message with explanation
        const assistantMessage: GCodeMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: explanation,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        return explanation;
      } catch (error) {
        console.error("Error explaining G-code:", error);
        toast("Explanation Error", {
          id: error instanceof Error ? error.message : "Failed to explain G-code",

          duration: 5000
        });
        return "";
      } finally {
        setIsExplaining(false);
      }
    },
    [toast]
  );

  /**
   * Get completion suggestions for G-code
   */
  const getGCodeCompletions = useCallback(
    async (
      context: string,
      options: {
        limit?: number;
        cursorPosition?: number;
        recentCommands?: string[];
        mode?: "normal" | "gather" | "agent";
      } = {}
    ): Promise<GCodeCompletion[]> => {
      try {
        const completions = await openAiGCodeService.getGCodeCompletions(context, options);
        return completions;
      } catch (error) {
        console.error("Error getting G-code completions:", error);
        return [];
      }
    },
    []
  );

  /**
   * Add a user message to the chat
   */
  const addUserMessage = useCallback((content: string): string => {
    const id = Date.now().toString();
    const message: GCodeMessage = {
      id,
      role: "user",
      content,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, message]);
    return id;
  }, []);

  /**
   * Send a message to the AI assistant and get a response
   */
  const sendChatMessage = useCallback(
    async (input: string | { content: string; attachments?: File[] }): Promise<string> => {
      const content = typeof input === "string" ? input : input.content;
      const attachments = typeof input === "object" ? input.attachments : undefined;
      try {
        setIsSendingMessage(true);

        // Add user message to chat
        const messageId = addUserMessage(content);

        // Handle image attachments if any
        let imageUrls: string[] = [];
        if (attachments && attachments.length > 0) {
          // In a real implementation, this would upload the files to a server
          // and get back URLs. For now, we'll create object URLs for demo.
          imageUrls = attachments.map(file => URL.createObjectURL(file));
        }

        // Convert chat messages to the format expected by the API
        const apiMessages = chatMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Add the new message
        apiMessages.push({
          role: "user" as const,
          content
        });

        // Get response from AI
        const response = await openAiGCodeService.chatCompletion(apiMessages);

        // Add assistant message with response
        const assistantMessage: GCodeMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response,
          timestamp: new Date(),
          imageUrls: [] // Assistant doesn't have image attachments
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        // Update the user message to include image URLs
        if (imageUrls.length > 0) {
          setChatMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, imageUrls } : msg)));
        }

        return response;
      } catch (error) {
        console.error("Error sending chat message:", error);
        toast("Message Error", {
          id: error instanceof Error ? error.message : "Failed to send message",

          duration: 5000
        });
        return "";
      } finally {
        setIsSendingMessage(false);
      }
    },
    [chatMessages, addUserMessage, toast]
  );

  /**
   * Clear chat history
   */
  const clearChatHistory = useCallback(() => {
    setChatMessages([]);
  }, []);

  return {
    // Methods
    generateGCode,
    optimizeGCode,
    analyzeGCode,
    explainGCode,
    getGCodeCompletions,
    addUserMessage,
    sendChatMessage,
    clearChatHistory,

    // State
    isGenerating,
    isOptimizing,
    isAnalyzing,
    isExplaining,
    isSendingMessage,

    // Data
    chatMessages,
    lastAnalysisResult,
    lastOptimizationResult
  };
}

export default useGCodeAI;
