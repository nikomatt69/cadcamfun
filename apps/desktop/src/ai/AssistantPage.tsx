/**
 * The full `/ai` route page (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * Gives the EnhancedAssistant the full main-column width for longer
 * conversations. Re-uses the same AIProvider context so the docked panel
 * and the page share state.
 */
import { type JSX } from "solid-js"
import { EnhancedAssistant } from "./EnhancedAssistant.tsx"
import { ScreenHeader } from "../screens/screen-parts.tsx"
import { t } from "../i18n/index.ts"

export function AssistantPage(): JSX.Element {
  return (
    <section class="flex h-full flex-col p-4 sm:p-6" data-testid="ai-page">
      <ScreenHeader title={t("ai.page.title")} subtitle={t("ai.page.subtitle")} />
      <div class="flex-1 min-h-0 mt-4">
        <EnhancedAssistant className="h-full" />
      </div>
    </section>
  )
}

export default AssistantPage