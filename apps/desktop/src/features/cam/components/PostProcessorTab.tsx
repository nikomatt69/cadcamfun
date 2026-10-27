/**
 * The "Post-Processor" tab: the conversion panel over every post the core writes (`POST_TARGETS`).
 *
 * The panel works on NC text. When the program has toolpaths but no text yet, the text is emitted from the program through
 * the selected control's own post, so the tab is never empty after a generate.
 */
import { createMemo, type JSX } from "solid-js"
import "../../../styles/cam-panels.css"
import { cam } from "@cadcamfun/core"
import PostProcessorPanel from "./PostProcessorPanel.tsx"
import { POST_TARGETS } from "./AdvancedPostProcessorPanel.tsx"

export type PostProcessorType = cam.PostId

export const POST_PROCESSORS: ReadonlyArray<{ readonly id: PostProcessorType; readonly label: string }> = POST_TARGETS

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
    try {
      return cam.posts[props.controller].emit(props.program)
    } catch {
      // A program the control cannot take (e.g. rotary moves on GRBL): the reference text, which the panel then refuses with the reason.
      return cam.posts.generic.emit(props.program)
    }
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
