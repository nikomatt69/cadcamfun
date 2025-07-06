// ProactiveAssistant module exports
import ProactiveAIAssistant from "./ProactiveAIAssistant";
import ProactiveSuggestionPanel from "./ProactiveSuggestionPanel";
import ContextualHintsProvider from "./ContextualHintsProvider";
import VoiceInteractionHandler from "./VoiceInteractionHandler";

export { ProactiveAIAssistant };
export { ProactiveSuggestionPanel };
export { ContextualHintsProvider };
export { VoiceInteractionHandler };
export * from "./types";
export * from "./utils";

// Default export per compatibilità
export default ProactiveAIAssistant;
