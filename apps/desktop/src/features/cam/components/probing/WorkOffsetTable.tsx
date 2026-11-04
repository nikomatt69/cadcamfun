/**
 * The work-offset table of the machine or of one setup (spec 73 §4): the rows of the control (G54..G59, G54.1 Pn, G505.., Siemens,
 * Heidenhain presets, LinuxCNC G59.x), edited in place with NumberFields, a diff of what Save would change, and the 409 conflict
 * when the table changed on the machine since it was read. The probe's measured updates land in the rows through the store and wait
 * for Save; nothing is written to the machine behind the user's back.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { RefreshCw, Save, Undo2 } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { Note } from "../../../../shared/components/panel/ui.tsx"
import { NumberField } from "../../../cad/components/property-inputs/NumberField.tsx"
import type { MachineProfile } from "../../lib/probing/contract.ts"
import { OFFSET_ROW_AXES, extendedOffsetsOf, offsetFamilyOf, offsetRefusal, type OffsetRowAxis } from "../../lib/probing/work-offsets.ts"
import { useWorkOffsetStore, type OffsetScope } from "../../store/workOffsetStore.ts"

const OPTIONAL: ReadonlySet<OffsetRowAxis> = new Set(["a", "b", "c", "rotation"])
const UNIT = (axis: OffsetRowAxis): string => (OPTIONAL.has(axis) ? "°" : "mm")
const signed = (n: number): string => `${n >= 0 ? "+" : ""}${Number(n.toFixed(4))}`

export interface WorkOffsetTableProps {
  readonly profile: MachineProfile | undefined
  /** The machine configuration is stored (it has a database id), so a table can be loaded and saved. */
  readonly stored: boolean
  readonly setups: ReadonlyArray<{ readonly id: string; readonly name: string }>
  onSave(): void
  onReload(): void
  onScope(scope: OffsetScope, setupId?: string): void
}

export function WorkOffsetTable(props: WorkOffsetTableProps): JSX.Element {
  const store = useWorkOffsetStore()
  const [showRotary, setShowRotary] = createSignal(false)
  const family = () => (props.profile === undefined ? "fanuc" : offsetFamilyOf(props.profile))
  const rotaryColumns = () => showRotary() || (props.profile?.rotary !== undefined) || store.rows.some((row) => OFFSET_ROW_AXES.some((axis) => OPTIONAL.has(axis) && row.entry[axis] !== undefined))
  const axes = createMemo(() => OFFSET_ROW_AXES.filter((axis) => !OPTIONAL.has(axis) || rotaryColumns()))
  const changes = createMemo(() => { store.rows; store.saved; return store.changes() })
  const extended = createMemo(() => extendedOffsetsOf(family(), props.profile?.probing?.offsets).filter((key) => !store.rows.some((row) => row.key === key)))
  const writable = () => props.stored && store.isOwner && !store.saving
  return (
    <div class="probing-offsets" data-testid="work-offset-table">
      <Show when={!props.stored}><Note kind="info" testId="offsets-unstored">{t("cam.probing.offsets.unstored")}</Note></Show>
      <Show when={props.stored}>
        <div class="probing-offsets__scope" role="group" aria-label={t("cam.probing.offsets.scope")}>
          <button type="button" class="panel-seg__item" aria-pressed={store.scope === "machine"} onClick={() => props.onScope("machine")}>{t("cam.probing.offsets.machine")}</button>
          <select class="panel-input" aria-label={t("cam.probing.offsets.setup")} value={store.scope === "setup" ? store.setupId ?? "" : ""}
            onChange={(event) => { const id = event.currentTarget.value; if (id === "") props.onScope("machine"); else props.onScope("setup", id) }}>
            <option value="">{t("cam.probing.offsets.noSetup")}</option>
            <For each={props.setups}>{(setup) => <option value={setup.id}>{setup.name}</option>}</For>
          </select>
        </div>
        <Show when={!store.isOwner && store.updatedAt !== undefined}><Note kind="info" testId="offsets-readonly">{t("cam.probing.offsets.readonly")}</Note></Show>
        <Show when={store.conflict}>
          <Note kind="warn" role="alert" testId="offsets-conflict">
            <p>{t("cam.probing.offsets.conflict")}</p>
            <div class="probing-row-actions">
              <button type="button" class="panel-btn panel-btn--fit" data-testid="offsets-conflict-reload" onClick={props.onReload}><RefreshCw size={14} />{t("cam.probing.offsets.reload")}</button>
              <button type="button" class="panel-btn panel-btn--fit" data-testid="offsets-conflict-keep" onClick={() => store.setConflict(false)}>{t("cam.probing.offsets.keepMine")}</button>
            </div>
          </Note>
        </Show>
        <Show when={store.error}>{(message) => <Note kind="bad" role="alert" testId="offsets-error">{message()}</Note>}</Show>
        <div class="probing-table-scroll">
          {/* Roles, not <table>: a grid of rows and cells that keeps its columns when the rotary columns come and go. */}
          <div class="probing-table" role="table" aria-label={t("cam.probing.section.offsets")} style={{ "--cols": String(axes().length) }}>
            <div class="probing-table__row probing-table__row--head" role="row">
              <span role="columnheader">{t("cam.probing.offsets.offset")}</span>
              <For each={axes()}>{(axis) => <span role="columnheader">{axis === "rotation" ? t("cam.probing.rotation") : axis.toUpperCase()}</span>}</For>
            </div>
            <For each={store.rows}>{(row) => (
              <div class="probing-table__row" role="row" data-testid={`offset-row-${row.key}`} data-source={row.source}>
                <span role="rowheader" class="probing-table__key">
                  <span>{row.key}</span>
                  <Show when={row.source === "setup"}><span class="probing-tag">{t("cam.probing.offsets.setupTag")}</span></Show>
                  <Show when={offsetRefusal(row.key, family(), props.profile?.probing?.offsets)}>{(reason) => <span class="probing-tag probing-tag--warn" title={reason()}>{t("cam.probing.offsets.unwritable")}</span>}</Show>
                </span>
                <For each={axes()}>{(axis) => (
                  <span role="cell">
                    <NumberField class="panel-input probing-cell-input" testId={`offset-${row.key}-${axis}`} label={`${row.key} ${axis}`} deferred disabled={!writable()}
                      optional={OPTIONAL.has(axis)} value={row.entry[axis]} step={UNIT(axis) === "°" ? 1 : 0.1}
                      onChange={(value) => store.edit(row.key, axis, value)} onClear={() => store.edit(row.key, axis, undefined)} />
                  </span>
                )}</For>
              </div>
            )}</For>
          </div>
        </div>
        <div class="probing-row-actions">
          <select class="panel-input" aria-label={t("cam.probing.offsets.add")} data-testid="offset-add" value="" disabled={!writable() || extended().length === 0}
            onChange={(event) => { if (event.currentTarget.value !== "") store.addRow(event.currentTarget.value); event.currentTarget.value = "" }}>
            <option value="">{t("cam.probing.offsets.add")}</option>
            <For each={extended()}>{(key) => <option value={key}>{key}</option>}</For>
          </select>
          <button type="button" class="panel-btn panel-btn--fit" onClick={() => setShowRotary(!showRotary())} aria-pressed={rotaryColumns()}>{t("cam.probing.offsets.rotary")}</button>
        </div>
        <Show when={changes().length > 0}>
          <ul class="probing-diff" data-testid="offsets-diff">
            <For each={changes()}>{(change) => (
              <li>
                <span class="probing-diff__key">{change.key} {change.axis.toUpperCase()}</span>
                <span>{Number(change.before.toFixed(4))} → {Number(change.after.toFixed(4))}</span>
                <span class="probing-diff__delta">{signed(change.delta)} {UNIT(change.axis)}</span>
              </li>
            )}</For>
          </ul>
        </Show>
        <div class="panel-edit-actions">
          <button type="button" class="panel-btn" data-testid="offsets-discard" disabled={changes().length === 0 || store.saving} onClick={store.discard}><Undo2 size={14} />{t("cam.probing.offsets.discard")}</button>
          <button type="button" class="panel-btn" data-testid="offsets-reload" disabled={store.loading || store.saving} onClick={props.onReload}><RefreshCw size={14} />{t("cam.probing.offsets.reload")}</button>
          <button type="button" class="panel-btn panel-btn--primary" data-testid="offsets-save" disabled={!writable() || changes().length === 0 || store.conflict} onClick={props.onSave}>
            <Save size={14} />{store.saving ? t("cam.probing.offsets.saving") : t("cam.probing.offsets.save")}
          </button>
        </div>
        <Show when={changes().length > 0}><p class="panel-hint">{t("cam.probing.offsets.pending", { count: changes().length })}</p></Show>
      </Show>
    </div>
  )
}

