// src/hooks/useAIAssistant.ts
import { useState, useCallback } from "react";
import { useAIAssistantStoreOpenai } from "../store/aiAssistantStoreOpenai";
import { openAIService } from "../lib/ai/openaiService";
import { aiActionService } from "../lib/ai/aiActionService";
import { AIAction, AIMessage, AIArtifact } from "../types/AITypes";

export function useAIAssistant() {
  const {
    messages,
    isProcessing,
    isOpen,
    error,
    context,
    availableActions,
    addMessage,
    setProcessing,
    toggleAssistant,
    clearMessages,
    setError,
    setContext
  } = useAIAssistantStoreOpenai();

  const [pendingActions, setPendingActions] = useState<AIAction[]>([]);

  // Send a message to the AI
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isProcessing) return;

      addMessage("user", content);
      setProcessing(true);
      setError(null);
      setPendingActions([]); // Clear previous pending actions

      try {
        const response = await openAIService.sendMessage(
          messages, // Pass current messages for history
          context,
          availableActions
        );

        // Handle actions first
        if (response.actions && response.actions.length > 0) {
          setPendingActions(response.actions);
          // Don't add assistant text message if actions are pending
          // Let the user confirm via AIActionHandler
        } else if (response.content) {
          // Only add assistant text message if there are no actions
          addMessage("assistant", response.content, response.artifacts);
        } else {
          // Handle cases where there is neither text nor action
          addMessage("assistant", "(AI returned an empty response)");
        }
      } catch (error) {
        console.error("Error sending message:", error);
        const errorMsg = error instanceof Error ? error.message : "An error occurred";
        setError(errorMsg);
        addMessage("system", `Sorry, I encountered an error: ${errorMsg}`);
      } finally {
        setProcessing(false);
      }
    },
    [
      messages, // Include messages dependency
      isProcessing,
      context,
      availableActions,
      addMessage,
      setProcessing,
      setError,
      setPendingActions // Add setPendingActions dependency
    ]
  );

  // Function to execute a specific pending action
  const executePendingAction = useCallback(
    async (action: AIAction) => {
      setProcessing(true); // Indicate processing while action runs
      setError(null);

      try {
        const result = await aiActionService.executeAction(action);
        addMessage("system", `Action "${action.type}" executed successfully.`, [
          {
            id: crypto.randomUUID(),
            type: "json",
            content: JSON.stringify(result, null, 2),
            language: "json",
            title: `${action.type} Result`
          }
        ]);
        // Remove the executed action from pending
        setPendingActions(prev => prev.filter(pa => pa.type !== action.type)); // Simple filter, might need ID if multiple same type
      } catch (actionError) {
        const errorMsg = actionError instanceof Error ? actionError.message : "Unknown error";
        addMessage("system", `Error executing action "${action.type}": ${errorMsg}`);
        setError(`Failed to execute action: ${action.type}`);
        // Optionally remove the failed action from pending or leave it for retry?
        // setPendingActions(prev => prev.filter(pa => pa.type !== action.type));
      } finally {
        setProcessing(false);
      }
    },
    [addMessage, setProcessing, setError, setPendingActions]
  ); // Add setPendingActions dependency

  return {
    messages,
    isProcessing,
    isOpen,
    error,
    context,
    availableActions,
    pendingActions,
    sendMessage,
    executePendingAction, // Expose the new function
    toggleAssistant,
    clearMessages,
    setContext
  };
}
