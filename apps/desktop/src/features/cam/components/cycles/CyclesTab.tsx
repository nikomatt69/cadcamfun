/** The Cycles tab: the controller's fixed cycles and macros, plus the cycles already in the program. */
import { Show, createSignal, type JSX } from "solid-js"
import { Note } from "../../../../shared/components/panel/ui.tsx"
import { t, type Key } from "../../../../i18n/index.ts"
import MachineCycles from "../MachineCycles.tsx"
import { FixedCyclesSection } from "../generator/FixedCyclesSection.tsx"
import { MacroSnippets } from "./MacroSnippets.tsx"
import { ProgramCycleList } from "./ProgramCycleList.tsx"
import { cycleSupport, type CycleController } from "./cycleApi.ts"

const NOTE: Partial<Record<CycleController, Key>> = {
  grbl: "cam.cycles.note.grbl",
  siemens: "cam.cycles.note.siemens"
}

export function CyclesTab(props: {
  readonly controller: CycleController
  readonly gcode: string
  readonly onInsert: (code: string) => void
  /** The fixed-cycle editor hands back the whole program, not a block to append. */
  readonly onReplace: (code: string) => void
}): JSX.Element {
  const [filter, setFilter] = createSignal("")
  const support = () => cycleSupport(props.controller)
  const note = (): Key | undefined => NOTE[props.controller]
  return (
    <div class="panel cycles-tab" data-testid="cycles-tab">
      <label class="panel-label" for="cycles-filter">{t("cam.cycles.filter")}</label>
      <input id="cycles-filter" class="panel-input" type="search" value={filter()} data-testid="cycles-filter" onInput={(event) => setFilter(event.currentTarget.value)} />
      <Show when={note()}>{(key) => <Note testId="cycles-note">{t(key())}</Note>}</Show>
      <Show when={support().cycles}>
        <MachineCycles controllerType={props.controller} filter={filter()} onCycleCodeGenerated={props.onInsert} />
      </Show>
      <Show when={support().macros}>
        <MacroSnippets controller={props.controller} filter={filter()} onInsert={props.onInsert} />
      </Show>
      <ProgramCycleList gcode={props.gcode} />
      <FixedCyclesSection gcode={props.gcode} onGCode={props.onReplace} />
    </div>
  )
}
