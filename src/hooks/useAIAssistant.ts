import { useState, useCallback } from 'react';
import { useAIAssistantStore, AssistantMode } from '../store/aiAssistantStore';
import  {aiService } from 'src/lib/aiService';
import { aiCore } from '../lib/ai/aiCore';

export function useAIAssistant() {
  const { 
    isVisible, 
    isExpanded, 
    currentMode, 
    messageHistory, 
    toggle, 
    setVisible, 
    setExpanded, 
    setMode, 
    addMessage, 
    clearMessages 
  } = useAIAssistantStore();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Send a message to the AI assistant
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isProcessing) return null;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Add context based on the current mode
      let contextPrefix = '';
      
      switch (currentMode) {
        case 'cad':
          contextPrefix = 'You are helping with CAD design. ';
          break;
        case 'cam':
          contextPrefix = 'You are helping with CAM operations. ';
          break;
        case 'gcode':
          contextPrefix = 'You are helping with G-code optimization and debugging. ';
          break;
        case 'toolpath':
          contextPrefix = 'You are helping with toolpath generation. ';
          break;
      }
      
      // Add user message to history
      addMessage('user', message, currentMode);
      
      // Generate AI response
      const prompt = `${contextPrefix}${message}`;
      const response = await aiCore.processRequest<string>({
        prompt,
        model: 'claude-3-5-sonnet-20240229',
        maxTokens: 1000,
        temperature: 0.7
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to generate response');
      }
      
      // Add AI response to history
      addMessage('assistant', response.data, currentMode);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      console.error('AI Assistant Error:', error);
      
      // Add error message to chat
      addMessage('assistant', `Sorry, I encountered an error: ${errorMessage}`, currentMode);
      
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [currentMode, isProcessing, addMessage]);
  
  // Show assistant with a specific message
  const showWithQuestion = useCallback((message: string, mode?: AssistantMode) => {
    if (mode) {
      setMode(mode);
    }
    
    setVisible(true);
    setExpanded(true);
    
    if (message) {
      sendMessage(message);
    }
  }, [setVisible, setExpanded, setMode, sendMessage]);
  
  return {
    isVisible,
    isExpanded,
    currentMode,
    messageHistory,
    isProcessing,
    error,
    toggle,
    setVisible,
    setExpanded,
    setMode,
    sendMessage,
    showWithQuestion,
    clearMessages
  };
}