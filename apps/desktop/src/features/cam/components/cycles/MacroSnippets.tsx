/** "Macros and variables": the controller's own macro language (Fanuc Custom Macro B, Siemens R parameters, Heidenhain Q parameters ...). */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Note, PanelCard } from "../../../../shared/components/panel/ui.tsx"
import { t } from "../../../../i18n/index.ts"
import { availableMacros, controllerName, defaultValues, generateMacro, type CycleController, type CycleValues } from "./cycleApi.ts"
import { cycleIconFor } from "../MachineCycleIcons.tsx"
import { ParameterForm } from "./ParameterForm.tsx"
import { matchesFilter } from "./cycleFamilies.ts"

export function MacroSnippets(props: { readonly controller: CycleController; readonly filter: string; readonly onInsert: (code: string) => void }): JSX.Element {
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [values, setValues] = createSignal<CycleValues>({})
  const macros = createMemo(() => availableMacros(props.controller))
  const visible = createMemo(() => macros().filter((macro) => matchesFilter(macro, props.filter)))
  const selected = createMemo(() => macros().find((macro) => macro.id === selectedId()))
  const preview = createMemo(() => {
    const macro = selected()
    if (!macro) return ""
    try { return generateMacro(macro.id, values(), props.controller) } catch { return "" }
  })
  const select = (id: string): void => {
    setSelectedId(id)
    const macro = macros().find((entry) => entry.id === id)
    setValues(macro ? defaultValues(macro.parameters) : {})
  }
  return (
    <PanelCard title={t("cam.cycles.macros")} testId="cycles-macros" actions={<span>{macros().length}</span>}>
      <Show when={macros().length > 0} fallback={<Note testId="cycles-macros-empty">{t("cam.cycles.noMacros", { controller: controllerName(props.controller) })}</Note>}>
        <div class="machine-cycle-list">
          <For each={visible()} fallback={<Note>{t("cam.cycles.noMatch")}</Note>}>{(macro) => (
            <button type="button" data-macro-id={macro.id} class="machine-cycle-choice" title={macro.description} aria-pressed={selectedId() === macro.id} onClick={() => select(macro.id)}>
              <span class="machine-cycle-choice__icon">{cycleIconFor("macro")}</span><span>{macro.name}</span>
            </button>
          )}</For>
        </div>
        <Show when={selected()} fallback={<Note>{t("cam.cycles.selectMacro")}</Note>}>{(macro) => <>
          <Note>{macro().description}</Note>
          <ParameterForm parameters={macro().parameters} values={values()} idPrefix="macro" onChange={(name, value) => setValues({ ...values(), [name]: value })} />
          <div class="panel-card__actions">
            <button type="button" class="panel-btn panel-btn--primary" data-testid="macro-insert" disabled={preview() === ""} onClick={() => { if (preview()) props.onInsert(preview()) }}>{t("cam.cycles.insertMacro")}</button>
          </div>
          <pre data-testid="macro-preview" class="panel-code">{preview()}</pre>
        </>}</Show>
      </Show>
    </PanelCard>
  )
}
