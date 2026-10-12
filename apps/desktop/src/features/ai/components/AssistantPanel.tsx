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
import { t as translate } from "../../../i18n/index.ts"

interface Props {
  readonly open: boolean
  /** Dismisses the panel; the CAD/CAM toolbar buttons and the AI activity button pass it. */
  readonly onClose?: () => void
}

export function AssistantPanel(props: Props): JSX.Element {
  return (
    <Show when={props.open}>
      <aside
        class="assistant-dock"
        style={{
          display: "flex",
          "flex-direction": "column",
          flex: "0 1 520px",
          width: "100%",
          "max-width": "min(520px, 100vw)",
          "min-width": "0",
          "min-height": "0",
          overflow: "hidden",
          animation: "none",
          transition: "none"
        }}
        aria-label={translate("ai.title")}
        data-testid="ai-panel"
      >
        <EnhancedAssistant
          className="assistant-dock-content !animate-none"
          {...{
            headerActions: (
              <>
                <A
                  href="/ai"
                  class="assistant-header-action"
                  aria-label={translate("ai.open")}
                  title={translate("ai.open")}
                  style={{ animation: "none", transition: "none" }}
                >
                  <Maximize2 size={16} aria-hidden="true" />
                </A>
                <Show when={props.onClose}>
                  <button
                    type="button"
                    class="assistant-header-action"
                    aria-label={translate("ai.close")}
                    title={translate("ai.close")}
                    style={{ animation: "none", transition: "none" }}
                    onClick={() => props.onClose?.()}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </Show>
              </>
            )
          }}
        />
      </aside>
    </Show>
  )
}
