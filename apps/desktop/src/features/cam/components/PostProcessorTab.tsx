/**
 * The "Post-Processor" tab (legacy `pages/cam.tsx`): the controller select over the seven dialects, and the legacy
 * panel for that controller (Fanuc, Heidenhain, or the generic one for the others) underneath.
 *
 * The panels work on G-code text, like the legacy ones. When the program has toolpaths but no text yet, the
 * text is emitted from the program through the matching core post, so the tab is never empty after a generate.
 */
import { createMemo, type JSX } from "solid-js"
import "../../../styles/cam-panels.css"
import { cam } from "@cadcamfun/core"
import PostProcessorPanel from "./PostProcessorPanel.tsx"

export type PostProcessorType = "fanuc" | "heidenhain" | "siemens" | "haas" | "mazak" | "okuma" | "generic"

export const POST_PROCESSORS: ReadonlyArray<{ readonly id: PostProcessorType; readonly label: string }> = [
  { id: "fanuc", label: "Fanuc" },
  { id: "heidenhain", label: "Heidenhain" },
  { id: "siemens", label: "Siemens" },
  { id: "haas", label: "Haas" },
  { id: "mazak", label: "Mazak" },
  { id: "okuma", label: "Okuma" },
  { id: "generic", label: "Generic" }
]

export interface PostProcessorTabProps {
  readonly gcode: string
  readonly program: cam.Program
  readonly controller: PostProcessorType
  readonly onControllerChange: (next: PostProcessorType) => void
  /** Receives the processed text when the user processes the program (legacy `handleProcessedGcode`). */
  readonly onProcessedGcode: (code: string) => void
}

export default function PostProcessorTab(props: PostProcessorTabProps): JSX.Element {
  const initialGcode = createMemo(() => {
    if (props.gcode) return props.gcode
    if (props.program.toolpaths.length === 0) return ""
    return cam.posts[props.controller === "fanuc" ? "fanuc" : "generic"]?.emit(props.program) ?? ""
  })

  return (
    <div class="panel cam-central-panel cam-post" data-testid="post-processor-tab">
      <div class="cam-post__content">
        <PostProcessorPanel
          initialGcode={initialGcode()}
          controllerType={props.controller}
          onProcessedGcode={(code) => props.onProcessedGcode(code)}
          onControllerChange={props.onControllerChange}
        />
      </div>
    </div>
  )
}
