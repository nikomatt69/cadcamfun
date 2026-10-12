/**
 * The full `/ai` route page (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * Gives the EnhancedAssistant the full main-column width for longer
 * conversations. Re-uses the same AIProvider context so the docked panel
 * and the page share state.
 */
import { type JSX } from "solid-js"
import { EnhancedAssistant } from "./EnhancedAssistant.tsx"
export function AssistantPage(): JSX.Element {
  return (
    <section class="assistant-page" data-testid="ai-page">
      <EnhancedAssistant className="assistant-page-surface" />
    </section>
  )
}

export default AssistantPage
