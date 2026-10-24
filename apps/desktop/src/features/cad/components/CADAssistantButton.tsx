import type { JSX } from "solid-js"
import { Cpu } from "lucide-solid"

interface Props { readonly isVisible: boolean; toggleVisibility(): void; readonly class?: string }

/** The round button that opens and closes the CAD assistant. */
export function CADAssistantButton(props: Props): JSX.Element {
  return (
    <button
      onClick={() => props.toggleVisibility()}
      class={`panel-icon-btn ${props.class ?? ""}`}
      aria-pressed={props.isVisible}
      aria-label={props.isVisible ? "Hide CAD Assistant" : "Show CAD Assistant"}
      title={props.isVisible ? "Hide CAD Assistant" : "Show CAD Assistant"}
    >
      <Cpu size={18} />
    </button>
  )
}
