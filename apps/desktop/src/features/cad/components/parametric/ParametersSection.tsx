import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { parameterProblem, parameterTable, removeParameter, renameParameter, resolveParameters, setParameter, setParameterNote, type History, type ParameterKind } from "@cadcamfun/core"
import { t } from "../../../../i18n/index.ts"
import { DimensionField } from "../property-inputs/DimensionField.tsx"
import { formatNumber } from "../../lib/numberText.ts"

export interface SectionProps {
  readonly history: History
  readonly locked: boolean
  /** Applies a pure edit of the history through the editor's undo; false (with the reason shown) when it was refused. */
  edit(change: (h: History) => History): boolean
}

const SMALL = "panel-btn"
const KINDS: ReadonlyArray<ParameterKind> = ["length", "angle", "scalar"]

/**
 * The parameter table (Fusion 360's "Change Parameters"): each user parameter with its formula, the value it resolves to, what
 * it measures, what it depends on and what uses it; a comment and a kind per parameter; a definition that would close a loop is
 * refused with the loop written out. All edits are core's (`history-edit.ts`, `parameter-table.ts`).
 */
export function ParametersSection(props: SectionProps): JSX.Element {
  const rows = createMemo(() => parameterTable(props.history))
  const context = createMemo(() => { const r = resolveParameters(props.history.parameters); return { values: r.values, failed: r.errors } })
  const [newName, setNewName] = createSignal("")
  const [nonce, setNonce] = createSignal(0)
  const [nameError, setNameError] = createSignal("")

  const add = (stored: number | string | undefined) => {
    const name = newName().trim()
    if (stored === undefined) return
    if (name === "") { setNameError(t("cad.param.needsName")); return }
    if (Object.hasOwn(props.history.parameters, name)) { setNameError(t("cad.parametric.nameTaken", { name })); return }
    if (props.edit((h) => setParameter(h, name, stored))) { setNewName(""); setNameError(""); setNonce((n) => n + 1) }
  }
  const rename = (name: string) => {
    const next = window.prompt(t("cad.parametric.renamePrompt", { name }), name)
    if (next && next !== name) props.edit((h) => renameParameter(h, name, next))
  }

  return (
    <div data-testid="parameters-section">
      <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("cad.customElements.parameters")}</h5>
      <div class="space-y-2">
        <For each={rows()}>{(row) =>
          <div class="rounded-md border border-gray-200 p-1 dark:border-gray-600" data-testid={`parameter-${row.name}`}>
            <div class="grid grid-cols-[6rem_1fr_auto] items-start gap-1">
              <button type="button" class="truncate text-left text-sm font-mono text-blue-700 hover:underline disabled:no-underline" title={t("projects.rename")} disabled={props.locked} onClick={() => rename(row.name)}>
                {row.favorite ? "★ " : ""}{row.name}
              </button>
              <DimensionField value={row.definition} context={context()} disabled={props.locked} label={`Parameter ${row.name}`}
                validate={(stored) => parameterProblem(props.history, row.name, stored)}
                onCommit={(stored) => { if (stored !== undefined) props.edit((h) => setParameter(h, row.name, stored)) }} />
              <button type="button" class={SMALL} disabled={props.locked} aria-label={`${t("cad.parametric.removeParam")} ${row.name}`}
                title={row.usedBy.parameters.length + row.usedBy.features.length + row.usedBy.configurations.length > 0 ? t("cad.parametric.usedBy", { list: [...row.usedBy.parameters, ...row.usedBy.features, ...row.usedBy.configurations].join(", ") }) : t("cad.customElements.delete")}
                onClick={() => props.edit((h) => removeParameter(h, row.name))}>✕</button>
            </div>
            <Show when={row.error}>{(error) => <p class="text-xs text-red-600" role="alert" data-testid={`parameter-error-${row.name}`}>{error()}</p>}</Show>
            <Show when={row.error === undefined && typeof row.definition === "string" && row.value !== undefined}>
              <p class="text-xs text-gray-500">= {formatNumber(row.value)}</p>
            </Show>
            <For each={row.warnings}>{(warning) => <p class="text-xs text-amber-700" data-testid={`parameter-warning-${row.name}`}>{warning}</p>}</For>
            <div class="mt-1 grid grid-cols-[1fr_6rem_auto] items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
              <input class="panel-input" placeholder={t("cad.parametric.comment")} aria-label={`${t("cad.parametric.comment")} ${row.name}`} value={row.comment ?? ""} disabled={props.locked}
                onChange={(event) => props.edit((h) => setParameterNote(h, row.name, { comment: event.currentTarget.value }))} />
              <select class="panel-input" aria-label={`${t("cad.parametric.kind")} ${row.name}`} disabled={props.locked} value={props.history.notes?.[row.name]?.kind ?? ""}
                onChange={(event) => { const kind = event.currentTarget.value as ParameterKind | ""; props.edit((h) => setParameterNote(h, row.name, { kind: kind === "" ? undefined : kind })) }}>
                <option value="">{t("cad.parametric.kind.auto")}</option>
                <For each={KINDS}>{(kind) => <option value={kind}>{t(`cad.parametric.kind.${kind}`)}</option>}</For>
              </select>
              <button type="button" class={SMALL} disabled={props.locked} aria-pressed={row.favorite} aria-label={`${t("cad.parametric.favorite")} ${row.name}`} title={t("cad.parametric.favorite")}
                onClick={() => props.edit((h) => setParameterNote(h, row.name, { favorite: !row.favorite }))}>{row.favorite ? "★" : "☆"}</button>
            </div>
            <Show when={row.dependsOn.length > 0}><p class="mt-0.5 text-xs text-gray-500">{t("cad.parametric.dependsOn", { list: row.dependsOn.join(", ") })}</p></Show>
          </div>}
        </For>
        <div class="grid grid-cols-[6rem_1fr] items-start gap-1">
          <input class="panel-input font-mono" placeholder="name" value={newName()} onInput={(event) => { setNewName(event.currentTarget.value); setNameError("") }} disabled={props.locked} aria-label={t("cad.param.newName")} />
          <For each={[nonce()]}>{() =>
            <DimensionField value={undefined} context={context()} disabled={props.locked} label={t("cad.param.newValue")}
              validate={(stored) => (newName().trim() === "" ? undefined : parameterProblem(props.history, newName().trim(), stored))}
              onCommit={add} />}
          </For>
        </div>
        <Show when={nameError()}><p class="text-xs text-red-600" role="alert">{nameError()}</p></Show>
        <p class="text-xs text-gray-500">{t("cad.param.valueExample")}</p>
      </div>
    </div>
  )
}
