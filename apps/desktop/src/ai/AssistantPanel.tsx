/**
 * The docked AI panel (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * Wraps the EnhancedAssistant for the shell-side drawer the user toggles
 * with the `AI` activity button. Same context, narrower width, with a
 * small "open full screen" affordance so the user can switch to `/ai`
 * for a wider conversation view.
 */
import { Show, type JSX } from "solid-js"
import Maximize2 from "lucide-solid/icons/maximize-2"
import X from "lucide-solid/icons/x"
import { A } from "@solidjs/router"
import { EnhancedAssistant } from "./EnhancedAssistant.tsx"
import { t as translate } from "../i18n/index.ts"

interface Props {
  readonly open: boolean
  /** Dismisses the panel; the CAD/CAM toolbar buttons and the AI activity button pass it. */
  readonly onClose?: () => void
}

export function AssistantPanel(props: Props): JSX.Element {
  return (
    <Show when={props.open}>
      <aside
        class="flex w-96 shrink-0 flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        aria-label={translate("ai.title")}
        data-testid="ai-panel"
      >
        <div class="flex items-center justify-end gap-1 px-3 pt-2">
          <A
            href="/ai"
            class="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-blue-600"
            aria-label={translate("ai.open")}
          >
            <Maximize2 size={10} aria-hidden="true" />
            {translate("ai.open")}
          </A>
          <Show when={props.onClose}>
            <button
              type="button"
              class="inline-flex items-center rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700"
              aria-label={translate("ai.close")}
              title={translate("ai.close")}
              onClick={() => props.onClose?.()}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </Show>
        </div>
        <div class="flex-1 min-h-0 p-2">
          <EnhancedAssistant className="h-full" />
        </div>
      </aside>
    </Show>
  )
}