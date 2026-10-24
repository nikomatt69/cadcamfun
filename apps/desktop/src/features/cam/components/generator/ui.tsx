/**
 * The generator panel's own building blocks. The vocabulary (fields, notes, badges, the segmented control) is the shared
 * workstation panel design system; what this file adds is the `Section` bound to the generator store, so a section of the
 * generator remembers whether it was open.
 */
import type { JSX } from "solid-js"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { PanelSection } from "../../../../shared/components/panel/ui.tsx"

export {
  Badge, CHECKBOX, CheckRow, Field, Grid, Group, INPUT, LABEL, Note, NumberField, PanelSection, Segmented, Stat
} from "../../../../shared/components/panel/ui.tsx"

export interface SectionProps {
  readonly id: string
  readonly title: string
  readonly icon: import("solid-js").Component<{ size?: number; class?: string }>
  /** A short state line shown on the header while the section is closed (the machine, the operation, the material). */
  readonly summary?: string | undefined
  readonly testId?: string
  readonly children: JSX.Element
}

/** One collapsible block of the generator panel; the generator store keeps it open or closed. */
export function Section(props: SectionProps): JSX.Element {
  const gen = useGeneratorStore()
  const open = (): boolean => gen.expanded[props.id] === true
  return (
    <PanelSection
      id={props.id}
      title={props.title}
      icon={props.icon}
      open={open()}
      onToggle={() => gen.toggleSection(props.id)}
      summary={props.summary}
      testId={props.testId}
    >
      {props.children}
    </PanelSection>
  );
}
