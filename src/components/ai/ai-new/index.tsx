// src/components/ai/index.ts
/**
 * Esportazioni centralizzate per tutti i componenti AI
 */

// Componenti principali 
export { default as AIAssistant } from './AIAssistant';
export { default as AIAssistantButton } from './AIAssistantButton';
export { default as AIHub } from './AIHub';
export { default as TextToCADPanel } from './TextToCADPanel';
export { default as AISettingsPanel } from './AISettingsPanel';
export { default as MCPInsightsPanel } from './MCPSettingsPage';
export { default as OpenAISetupPanel } from './OpenAISetupPanel';


// Componenti di utilità
export { default as AIProcessingIndicator } from './AIProcessingIndicator';
export { default as AIFeedbackCollector } from './AIFeedbackCollector';

// Tipi
export type { AIProcessingStatus } from './AIProcessingIndicator';