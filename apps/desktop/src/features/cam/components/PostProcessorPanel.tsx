/**
 * The three legacy post-processor panels (`FanucPostProcessor`, `HeidenhainPostProcessor`,
 * `GenericPostProcessor`): each is a thin wrapper that mounts the advanced panel for one controller and
 * forwards the processed program. The default export picks the wrapper from the controller, as the legacy
 * `pages/cam.tsx` did.
 */
import { Match, Switch, type JSX } from "solid-js"
import AdvancedPostProcessorPanel from "./AdvancedPostProcessorPanel.tsx"
import type { cam } from "@cadcamfun/core"

type ControllerType = cam.advanced.ControllerType
type Stats = cam.advanced.OptimizationStats

interface WrapperProps {
  readonly initialGcode: string
  readonly onProcessedGcode: (gcode: string, stats?: Stats) => void
}

export function FanucPostProcessor(props: WrapperProps): JSX.Element {
  return (
    <div class="rounded-lg overflow-hidden">
      <AdvancedPostProcessorPanel initialGcode={props.initialGcode} controllerType="fanuc" onProcessedGcode={props.onProcessedGcode} />
    </div>
  )
}

export function HeidenhainPostProcessor(props: WrapperProps): JSX.Element {
  return (
    <div class="rounded-lg overflow-hidden">
      <AdvancedPostProcessorPanel initialGcode={props.initialGcode} controllerType="heidenhain" onProcessedGcode={props.onProcessedGcode} />
    </div>
  )
}

export function GenericPostProcessor(props: WrapperProps & { readonly controllerType: ControllerType }): JSX.Element {
  return (
    <div class="rounded-lg overflow-hidden">
      <AdvancedPostProcessorPanel initialGcode={props.initialGcode} controllerType={props.controllerType} onProcessedGcode={props.onProcessedGcode} />
    </div>
  )
}

export interface PostProcessorPanelProps extends WrapperProps {
  readonly controllerType: ControllerType
}

export default function PostProcessorPanel(props: PostProcessorPanelProps): JSX.Element {
  return (
    <Switch>
      <Match when={props.controllerType === "fanuc"}>
        <FanucPostProcessor initialGcode={props.initialGcode} onProcessedGcode={props.onProcessedGcode} />
      </Match>
      <Match when={props.controllerType === "heidenhain"}>
        <HeidenhainPostProcessor initialGcode={props.initialGcode} onProcessedGcode={props.onProcessedGcode} />
      </Match>
      <Match when={true}>
        <GenericPostProcessor initialGcode={props.initialGcode} controllerType={props.controllerType} onProcessedGcode={props.onProcessedGcode} />
      </Match>
    </Switch>
  )
}
