/** Cycles already written in the program: ISO canned cycles, Klartext CYCL DEF, and Siemens CYCLE calls. */
import { For, Show, createMemo, type JSX } from "solid-js"
import { Note, PanelCard } from "../../../../shared/components/panel/ui.tsx"
import { t } from "../../../../i18n/index.ts"
import { findProgramCycles, type ProgramCycle } from "./programCycles.ts"

const detail = (cycle: ProgramCycle): string => {
  if (cycle.kind === "heidenhain-def") {
    const rows = cycle.rows.map((row) => `${row.name}=${row.value.trim()}`).join("\n")
    return rows.length > 0 ? `${cycle.text}\n${rows}` : cycle.text
  }
  if (cycle.kind === "siemens") return `${cycle.name}(${cycle.args.join(", ")})`
  return cycle.text
}

export function ProgramCycleList(props: { readonly gcode: string }): JSX.Element {
  const found = createMemo(() => findProgramCycles(props.gcode))
  return (
    <PanelCard title={t("cam.cycles.inProgram")} testId="program-cycles" actions={<span>{found().length}</span>}>
      <Show when={found().length > 0} fallback={<Note testId="program-cycles-empty">{t("cam.cycles.noProgramCycles")}</Note>}>
        <For each={found()}>{(cycle) => <pre data-testid="program-cycle" class="panel-code">{detail(cycle)}</pre>}</For>
      </Show>
    </PanelCard>
  )
}
