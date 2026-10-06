/**
 * The fixed-cycle editor module of the legacy app (`FixedCyclesUIRenderer.tsx`): a card with one field per
 * parameter of the cycle found on a G-code line, an "Apply Changes" button, the detection helpers and the
 * "Detected Fixed Cycles" info panel. The card itself is the shared `FixedCycleEditor`.
 */
import { createMemo, type Accessor, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { FixedCycleEditor } from "./generator/FixedCyclesSection.tsx"

const g = cam.generator

export interface FixedCyclesUIRendererProps {
  /** The G-code line to analyse. */
  readonly gCodeLine: string
  readonly onParametersChange?: (params: cam.generator.FixedCycleParams) => void
  /** Receives the regenerated line when "Apply Changes" is pressed. */
  readonly onApply?: (generatedGCode: string) => void
  readonly className?: string
}

/** Shows the editor when `gCodeLine` is a fixed cycle, nothing otherwise. */
export function FixedCyclesUIRenderer(props: FixedCyclesUIRendererProps): JSX.Element {
  return (
    <FixedCycleEditor
      line={props.gCodeLine}
      {...(props.onParametersChange ? { onChange: props.onParametersChange } : {})}
      {...(props.onApply ? { onApply: props.onApply } : {})}
      {...(props.className ? { class: props.className } : {})}
    />
  )
}

/** The parse result of a line (`null` when it is not a fixed cycle), reactive on the line. */
export const useFixedCycleDetection = (gCodeLine: Accessor<string>): Accessor<ReturnType<typeof g.parseFixedCycle>> =>
  createMemo(() => (gCodeLine() ? g.parseFixedCycle(gCodeLine()) : null))

/** True when `gCode` is a fixed-cycle line. */
export const isFixedCycle = (gCode: string): boolean => {
  const result = g.parseFixedCycle(gCode)
  return result !== null && result.isValid
}

/** The editor for a cycle built from `cycleType` / `initialParams`. */
export const renderFixedCycleUI = (
  cycleType: cam.generator.FixedCycleType,
  initialParams: cam.generator.FixedCycleParams,
  onParamsChange?: (params: cam.generator.FixedCycleParams) => void
): JSX.Element => (
  <FixedCyclesUIRenderer gCodeLine={g.generateFixedCycleGCode(cycleType, initialParams)} {...(onParamsChange ? { onParametersChange: onParamsChange } : {})} />
)

export default FixedCyclesUIRenderer
