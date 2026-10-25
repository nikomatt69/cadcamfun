/**
 * The public surface of the AI feature.
 *
 * Everything outside `features/ai` — the shell, the routes, the pages, the other
 * features — reaches the assistant through these names. Inside the feature the
 * modules import each other directly: the barrel is the boundary, not a second
 * layer of indirection.
 */
export { AssistantPage } from "./components/AssistantPage.tsx"
export { AssistantPanel } from "./components/AssistantPanel.tsx"
export { EnhancedAssistant } from "./components/EnhancedAssistant.tsx"
export { CADAssistantBridge } from "./components/CADAssistantBridge.tsx"
export { ProviderSettings } from "./components/ProviderSettings.tsx"
export { SkillsSettings } from "./components/SkillsSettings.tsx"
export { BridgeSettings } from "./components/BridgeSettings.tsx"
export { AiProvider, useAiStore, type AiContextValue, type AiStoreAndContext } from "./store/context.tsx"
export { createAiStore, statusLabel, type AiStore } from "./store/store.ts"
export { useAskAi } from "./hooks/use-ask-ai.ts"
export { selectionPrompt, fixVerificationPrompt } from "./lib/ask.ts"
export { captureEditorOwner, reconcileCoalesced, reconcileFromStored } from "./lib/editor-sync.ts"
export { registerViewportCapture } from "./lib/viewport-capture.ts"
export { PANEL_IDS, isPanelId, nextPanel, type PanelId } from "./lib/panels.ts"
export type { AiPending, AiStats, PendingDelivery } from "./lib/types.ts"
