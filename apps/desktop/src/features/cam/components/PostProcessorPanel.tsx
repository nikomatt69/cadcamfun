/**
 * The post-processor panel for one control: the conversion panel (`AdvancedPostProcessorPanel`) with that control as its
 * default target, forwarding the converted program.
 */
import type { JSX } from "solid-js"
import AdvancedPostProcessorPanel from "./AdvancedPostProcessorPanel.tsx"
import type { cam } from "@cadcamfun/core"

export interface PostProcessorPanelProps {
  readonly controllerType: cam.PostId
  readonly onControllerChange?: ((controller: cam.PostId) => void) | undefined
  readonly initialGcode: string
  readonly onProcessedGcode: (gcode: string, result?: cam.ConvertResult) => void
}

export default function PostProcessorPanel(props: PostProcessorPanelProps): JSX.Element {
  return (
    <AdvancedPostProcessorPanel initialGcode={props.initialGcode} controllerType={props.controllerType} onProcessedGcode={props.onProcessedGcode} onControllerChange={props.onControllerChange} />
  )
}
