/**
 * "Ask the assistant" from anywhere in the app: opens the docked panel and sends
 * the prompt, so a button on a browser row or on a verification report is one
 * click from a conversation about exactly that.
 *
 * The hook lives here, beside the feature's components, and not in `lib/`: it is
 * the one piece of the assistant that reaches *into* the store, and the library
 * below it stays free of that dependency.
 */
import { useApp } from "../../../shared/state/context.ts"
import { useAiStore } from "../store/context.tsx"

export const useAskAi = (): ((prompt: string) => void) => {
  const app = useApp()
  const ai = useAiStore()
  return (prompt) => {
    app.setPanelOpen(true)
    void ai.send(prompt)
  }
}
