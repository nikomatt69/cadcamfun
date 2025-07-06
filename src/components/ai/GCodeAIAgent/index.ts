export { default as GCodeAIAgent } from "./GCodeAIAgent";
export type { AIAgentMode } from "./GCodeAIAgent";

// Export subcomponents for direct usage
export { default as ChatMessage } from "./ChatMessage";
export { default as AnalysisPanel } from "./AnalysisPanel";
export { default as OptimizationPanel } from "./OptimizationPanel";
export { default as GenerationPanel } from "./GenerationPanel";

// Export UI components
export { CommandMenu, ReferenceMenu, QuickEditDialog, ModeTab, GCodeAutocomplete } from "./components";
