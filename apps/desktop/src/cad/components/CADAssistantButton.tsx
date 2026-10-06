import type { JSX } from "solid-js"
import { Cpu } from "lucide-solid"

interface Props { readonly isVisible: boolean; toggleVisibility(): void; readonly class?: string }

/** The round button that opens and closes the CAD assistant. */
export function CADAssistantButton(props: Props): JSX.Element {
  return (
    <button
      onClick={() => props.toggleVisibility()}
      class={`p-2 rounded-lg shadow-lg z-60 transition-colors ${props.isVisible ? "bg-blue-700 text-white z-60" : "bg-white text-blue-700 hover:bg-blue-50"} ${props.class ?? ""}`}
      title={props.isVisible ? "Hide CAD Assistant" : "Show CAD Assistant"}
    >
      <Cpu size={18} />
    </button>
  )
}
