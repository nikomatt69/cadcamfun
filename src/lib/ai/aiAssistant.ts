import { v4 as uuidv4 } from 'uuid';
import { aiCore } from './aiCore';
import { aiCache } from './aiCache';
import { aiAnalytics } from './aiAnalytics';
import { AssistantMode } from '../../store/aiAssistantStore';
import { AIModelType } from '../../types/ai';

// Suggested prompts per mode
const SUGGESTED_PROMPTS: Record<AssistantMode, string[]> = {
  cad: [
    "How do I create a complex shape?",
    "What's the best approach for designing gears?",
    "Can you explain boolean operations?"
  ],
  cam: [
    "How do I optimize cutting paths?",
    "What feeds and speeds should I use for aluminum?",
    "What's the difference between roughing and finishing?"
  ],
  gcode: [
    "Can you help me debug this G-code issue?",
    "How do I set up tool compensation?",
    "What's the best way to handle tool changes?"
  ],
  toolpath: [
    "How do I create a contour toolpath?",
    "What's the best strategy for pocketing?",
    "How can I optimize my toolpaths for speed?"
  ],
  general: [
    "How do I get started with CAD/CAM?",
    "What's the difference between CAD and CAM?",
    "Can you recommend resources for learning more?"
  ]
};

class AIAssistant {
  private contextMap: Record<AssistantMode, string> = {
    cad: 'You are a CAD design expert assistant. ',
    cam: 'You are a CAM operations expert assistant. ',
    gcode: 'You are a G-code optimization expert assistant. ',
    toolpath: 'You are a toolpath generation expert assistant. ',
    general: 'You are a helpful AI assistant for software development and engineering tasks. '
  };

  async processMessage(
    message: string,
    mode: AssistantMode,
    model: AIModelType
  ) {
    const contextPrefix = this.contextMap[mode];
    const cacheKey = `${mode}-${message}`;
    
    // Check cache first
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      // Track analytics
      const requestId = aiAnalytics.trackRequestStart('assistant_message', uuidv4(), {
        mode,
        messageLength: message.length
      });

      const response = await aiCore.processRequest({
        prompt: `${contextPrefix}${message}`,
        model,
        maxTokens: 1000,
        temperature: 0.7
      });

      // Cache the response
      aiCache.set(cacheKey, response.data);
      // Track completion
      const startTime = parseInt(requestId.split('_')[1] || '0', 10);
      const responseTime = startTime > 0 ? Date.now() - startTime : 1000; // Default to 1 second if parsing fails
      aiAnalytics.trackRequestComplete(
        requestId,
        responseTime,
        true,
        message.length,
        typeof response.data === 'string' ? response.data.length : 0
      );

      return response.data;
    } catch (error) {
      console.error('AI Assistant Error:', error);
      throw error;
    }
  }

  async getSuggestions(mode: AssistantMode): Promise<string[]> {
    return SUGGESTED_PROMPTS[mode] || [];
  }
}

export const aiAssistant = new AIAssistant();