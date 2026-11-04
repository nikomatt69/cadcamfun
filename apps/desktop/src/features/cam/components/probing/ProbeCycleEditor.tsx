/**
 * The editor of one probe cycle (spec 73 §4): the cycle's figures, what to do with the result (update mode, work offset, tolerance),
 * a tilted plane for 5-axis probing, inspection limits and the figures this cycle overrides. Every dimension is a NumberField (comma
 * decimals, expressions), the field lists are stable per cycle kind, and the core's own refusals are shown as typed.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Plus, Trash2 } from "lucide-solid"
import { t, type Key } from "../../../../i18n/index.ts"
import { Field, Grid, Group, Note } from "../../../../shared/components/panel/ui.tsx"
import { NumberField } from "../../../cad/components/property-inputs/NumberField.tsx"
import type { ProbingDefaults } from "../../../../shared/state/settings.ts"
import { UPDATE_MODES, type MachineProfile, type UpdateMode } from "../../lib/probing/contract.ts"
import { fieldsOf, getPath, setPath, type CycleField, type CycleSpec } from "../../lib/probing/cycle-fields.ts"
import { formatNumberList, formatPointList, parseNumberList, parsePointList } from "../../lib/probing/lists.ts"
import { defaultChecks, movesOffset, operationIssues, planLocal, resultsOf, type CheckSpec, type OffsetFollow, type ProbeOperation, type TiltedFrame } from "../../lib/probing/operation.ts"
import { OVERRIDE_KEYS, resolveSettings, sourcesOf, type OverrideKey, type ProbeOverrides } from "../../lib/probing/resolve.ts"
import { offsetChoicesOf } from "../../lib/probing/work-offsets.ts"
import { ProbeIcon } from "./ProbeIcons.tsx"
import { ProbeTargetPicker } from "./ProbeTargetPicker.tsx"
import type { ProbeTarget } from "../../lib/probing/probe-targets.ts"

const unitOf = (field: CycleField): string => (field.kind === "angle" ? "°" : field.kind === "length" ? "mm" : "")
const OVERRIDE_UNIT: Readonly<Record<OverrideKey, string>> = { touchFeed: "mm/min", fastFeed: "mm/min", search: "mm", clearance: "mm", safeZ: "mm", overtravel: "mm", backoff: "mm", stylusDiameter: "mm" }
const FOLLOW: ReadonlyArray<OffsetFollow> = ["X", "Y", "Z", "R"]
const CHECK_KINDS = ["size", "position", "true-position", "flatness", "angle"] as const

export interface ProbeCycleEditorProps {
  readonly id: string
  readonly operation: ProbeOperation
  readonly profile: MachineProfile | undefined
  readonly defaults: ProbingDefaults
  readonly targets: ReadonlyArray<ProbeTarget>
  /** The user is picking on the model. */
  readonly picking: boolean
  onChange(patch: Partial<ProbeOperation>): void
  onPick(): void
  onTarget(target: ProbeTarget): void
}

const fieldLabel = (path: string): string => t(`cam.probing.field.${path}` as Key)

/** The input of one cycle field; every dimension goes through the NumberField, so "12,5" and "40/2" are numbers. */
function CycleFieldInput(props: { readonly field: CycleField; readonly spec: CycleSpec; readonly onSet: (path: string, value: unknown) => void }): JSX.Element {
  const f = () => props.field
  const value = () => getPath(props.spec, f().path)
  const id = () => `probe-field-${f().path.replace(/\./g, "-")}`
  const [listError, setListError] = createSignal<string>()
  const set = (v: unknown) => props.onSet(f().path, v)
  return (
    <Field label={fieldLabel(f().path)} unit={unitOf(f())} for={id()}>
      {(() => {
        switch (f().kind) {
          case "length": case "angle": case "int":
            return (
              <NumberField id={id()} name={f().path} class="panel-input" testId={id()} deferred value={value()} integer={f().kind === "int"} optional={f().optional === true}
                {...(f().path === "diameter" || f().path === "width" || f().path === "depth" || f().path.endsWith("diameter") ? { min: 0.0001 } : {})}
                onChange={set} onClear={() => set(undefined)} />
            )
          case "boolean":
            return <input id={id()} type="checkbox" checked={value() === true} onChange={(event) => set(event.currentTarget.checked)} />
          case "sense":
            return (
              <select id={id()} class="panel-input" value={String(value())} onChange={(event) => set(Number(event.currentTarget.value))}>
                <option value="1">{t("cam.probing.sense.positive")}</option>
                <option value="-1">{t("cam.probing.sense.negative")}</option>
              </select>
            )
          case "choice":
            return (
              <select id={id()} class="panel-input" value={String(value() ?? "")} onChange={(event) => {
                const raw = event.currentTarget.value
                set(raw === "" ? undefined : typeof f().choices?.[0] === "number" ? Number(raw) : raw)
              }}>
                <Show when={f().optional === true}><option value="">{t("cam.probing.inherit")}</option></Show>
                <For each={f().choices}>{(choice) => <option value={String(choice)}>{typeof choice === "number" ? String(choice) : t(`cam.probing.choice.${choice}` as Key)}</option>}</For>
              </select>
            )
          case "numbers":
            return (
              <input id={id()} type="text" class="panel-input" aria-invalid={listError() !== undefined} data-testid={id()} value={formatNumberList(value())}
                onChange={(event) => { const parsed = parseNumberList(event.currentTarget.value, 3); if (parsed.ok) { setListError(undefined); set(parsed.value) } else setListError(parsed.error) }} />
            )
          case "points":
            return (
              <textarea id={id()} class="panel-input" rows={3} aria-invalid={listError() !== undefined} data-testid={id()} value={formatPointList(value())}
                onChange={(event) => { const parsed = parsePointList(event.currentTarget.value); if (parsed.ok) { setListError(undefined); set(parsed.value) } else setListError(parsed.error) }} />
            )
        }
      })()}
      <Show when={listError()}>{(message) => <p class="panel-hint" role="alert">{message()}</p>}</Show>
    </Field>
  )
}

/** One inspection limit row: the result it reads, nominal and the allowed deviation either side. */
function CheckRow(props: { readonly check: CheckSpec; readonly results: ReadonlyArray<string>; readonly index: number; onChange(next: CheckSpec): void; onRemove(): void }): JSX.Element {
  const c = () => props.check
  const patch = (next: Partial<CheckSpec>) => props.onChange({ ...c(), ...next })
  return (
    <div class="probing-check" data-testid={`probe-check-${props.index}`}>
      <input class="panel-input" type="text" aria-label={t("cam.probing.check.name")} value={c().name} onChange={(event) => patch({ name: event.currentTarget.value })} />
      <select class="panel-input" aria-label={t("cam.probing.check.result")} value={c().result} onChange={(event) => patch({ result: event.currentTarget.value })}>
        <For each={props.results}>{(name) => <option value={name}>{name}</option>}</For>
      </select>
      <select class="panel-input" aria-label={t("cam.probing.check.kind")} value={c().kind} onChange={(event) => patch({ kind: event.currentTarget.value as CheckSpec["kind"] })}>
        <For each={CHECK_KINDS}>{(kind) => <option value={kind}>{t(`cam.probing.check.kind.${kind}` as Key)}</option>}</For>
      </select>
      <NumberField class="panel-input" deferred testId={`probe-check-${props.index}-nominal`} label={t("cam.probing.check.nominal")} value={c().nominal} onChange={(nominal) => patch({ nominal })} />
      <NumberField class="panel-input" deferred testId={`probe-check-${props.index}-lower`} label={t("cam.probing.check.lower")} value={c().lower} onChange={(lower) => patch({ lower })} />
      <NumberField class="panel-input" deferred testId={`probe-check-${props.index}-upper`} label={t("cam.probing.check.upper")} value={c().upper} onChange={(upper) => patch({ upper })} />
      <button type="button" class="panel-icon-btn" aria-label={t("cam.probing.check.remove")} onClick={props.onRemove}><Trash2 size={14} /></button>
    </div>
  )
}

export function ProbeCycleEditor(props: ProbeCycleEditorProps): JSX.Element {
  const op = () => props.operation
  const spec = () => op().cycle
  const kind = () => spec().kind
  const fields = createMemo(() => fieldsOf(kind()))
  const input = () => ({ profile: props.profile, defaults: props.defaults })
  const plan = createMemo(() => planLocal(op(), input()))
  const issues = createMemo(() => operationIssues(op()))
  const effective = createMemo(() => resolveSettings({ ...input(), overrides: op().overrides, workOffset: op().workOffset }))
  const sources = createMemo(() => sourcesOf({ ...input(), overrides: op().overrides }))
  const effectiveOf = (key: OverrideKey): number => (key === "touchFeed" ? effective().feed : effective()[key])
  const tolerant = () => op().updateMode === "update-within-tolerance" || op().updateMode === "alarm-outside-tolerance"
  const choices = createMemo(() => offsetChoicesOf(props.profile, op().workOffset))
  const tiltedAllowed = () => props.profile !== undefined && (props.profile.axes ?? 3) >= 4
  const resultNames = createMemo(() => { const p = plan(); return p.ok ? resultsOf(p.routine).map((r) => r.name) : [] })

  const setCycle = (path: string, value: unknown) => props.onChange({ cycle: setPath(spec(), path, value) })
  const setOverride = (key: OverrideKey, value: number | undefined) => {
    const next: Record<string, number | boolean | undefined> = { ...op().overrides }
    if (value === undefined) delete next[key]
    else next[key] = value
    props.onChange({ overrides: next as ProbeOverrides })
  }
  const setFrame = (axis: keyof TiltedFrame, value: number) => props.onChange({ frame: { a: 0, b: 0, c: 0, ...op().frame, [axis]: value } })
  const setCheck = (index: number, next: CheckSpec) => props.onChange({ checks: op().checks.map((c, i) => (i === index ? next : c)) })
  const follow = (axis: OffsetFollow, on: boolean) => props.onChange({ follow: FOLLOW.filter((a) => (a === axis ? on : op().follow.includes(a))) })

  return (
    <div class="probing-editor" data-testid="probe-cycle-editor">
      <div class="probing-editor__title">
        <ProbeIcon kind={kind()} />
        <input class="panel-input" type="text" aria-label={t("cam.probing.name")} value={op().name} onChange={(event) => props.onChange({ name: event.currentTarget.value })} />
      </div>

      <ProbeTargetPicker targets={props.targets} kind={kind()} picking={props.picking} onPick={props.onPick} onTarget={props.onTarget} />

      <Group title={t("cam.probing.group.figures")}>
        <Grid cols={2}>
          <For each={fields()}>{(field) => <CycleFieldInput field={field} spec={spec()} onSet={setCycle} />}</For>
        </Grid>
      </Group>

      <Show when={movesOffset(kind()) || kind() === "stylus-calibrate"}>
        <Group title={t("cam.probing.group.result")}>
          <Grid cols={2}>
            <Field label={t("cam.probing.updateMode")} for="probe-update-mode">
              <select id="probe-update-mode" class="panel-input" value={op().updateMode} onChange={(event) => props.onChange({ updateMode: event.currentTarget.value as UpdateMode })}>
                <For each={UPDATE_MODES}>{(mode) => <option value={mode}>{t(`cam.probing.mode.${mode}` as Key)}</option>}</For>
              </select>
            </Field>
            <Field label={t("cam.probing.workOffset")} for="probe-work-offset">
              <select id="probe-work-offset" class="panel-input" value={op().workOffset} onChange={(event) => props.onChange({ workOffset: event.currentTarget.value })}>
                <For each={choices()}>{(key) => <option value={key}>{key}</option>}</For>
              </select>
            </Field>
            <Show when={tolerant()}>
              <Field label={t("cam.probing.tolerance")} unit="mm" for="probe-tolerance">
                <NumberField id="probe-tolerance" class="panel-input" testId="probe-tolerance" deferred min={0.0001} value={op().tolerance} onChange={(tolerance) => props.onChange({ tolerance })} />
              </Field>
            </Show>
            <Field label={t("cam.probing.deadband")} unit="mm" for="probe-deadband">
              <NumberField id="probe-deadband" class="panel-input" testId="probe-deadband" deferred min={0} value={op().deadband} onChange={(deadband) => props.onChange({ deadband })} />
            </Field>
            <Field label={t("cam.probing.limit")} unit="mm" for="probe-limit">
              <NumberField id="probe-limit" class="panel-input" testId="probe-limit" deferred min={0} value={op().limit} onChange={(limit) => props.onChange({ limit })} />
            </Field>
          </Grid>
          <Show when={movesOffset(kind())}>
            <div class="probing-follow" role="group" aria-label={t("cam.probing.follow")}>
              <span class="panel-label">{t("cam.probing.follow")}</span>
              <For each={FOLLOW}>{(axis) => (
                <label class="panel-check"><input type="checkbox" checked={op().follow.includes(axis)} onChange={(event) => follow(axis, event.currentTarget.checked)} />{axis === "R" ? t("cam.probing.rotation") : axis}</label>
              )}</For>
            </div>
          </Show>
          <p class="panel-hint">{t(`cam.probing.modeHint.${op().updateMode}` as Key)}</p>
        </Group>
      </Show>

      <Group title={t("cam.probing.group.tilted")}>
        <label class="panel-check">
          <input type="checkbox" data-testid="probe-tilted" disabled={!tiltedAllowed()} checked={op().frame !== undefined}
            onChange={(event) => props.onChange({ frame: event.currentTarget.checked ? { a: 0, b: 0, c: 0 } : (undefined as never) })} />
          {t("cam.probing.tilted")}
        </label>
        <Show when={!tiltedAllowed()}><p class="panel-hint">{t("cam.probing.tiltedNeedsRotary")}</p></Show>
        <Show when={op().frame}>{(frame) => (
          <Grid cols={3}>
            <For each={["a", "b", "c"] as const}>{(axis) => (
              <Field label={axis.toUpperCase()} unit="°" for={`probe-frame-${axis}`}>
                <NumberField id={`probe-frame-${axis}`} class="panel-input" testId={`probe-frame-${axis}`} deferred min={-120} max={120} value={frame()[axis]} onChange={(v) => setFrame(axis, v)} />
              </Field>
            )}</For>
          </Grid>
        )}</Show>
      </Group>

      <Group title={t("cam.probing.group.checks")}>
        <For each={op().checks}>{(check, index) => (
          <CheckRow check={check} index={index()} results={resultNames()} onChange={(next) => setCheck(index(), next)} onRemove={() => props.onChange({ checks: op().checks.filter((_, i) => i !== index()) })} />
        )}</For>
        <div class="probing-row-actions">
          <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-checks-fill" disabled={!plan().ok}
            onClick={() => { const p = plan(); if (p.ok) props.onChange({ checks: defaultChecks(p.routine, op().tolerance) }) }}>
            <Plus size={14} />{t("cam.probing.check.fill")}
          </button>
        </div>
      </Group>

      <Group title={t("cam.probing.group.overrides")}>
        <Grid cols={2}>
          <For each={OVERRIDE_KEYS}>{(key) => (
            <Field label={t(`cam.probing.override.${key}` as Key)} unit={OVERRIDE_UNIT[key]} for={`probe-override-${key}`}
              hint={t(`cam.probing.source.${sources()[key]}` as Key)}>
              <NumberField id={`probe-override-${key}`} class="panel-input" testId={`probe-override-${key}`} deferred optional min={0.0001}
                placeholder={String(effectiveOf(key))}
                value={op().overrides[key]} onChange={(v) => setOverride(key, v)} onClear={() => setOverride(key, undefined)} />
            </Field>
          )}</For>
        </Grid>
      </Group>

      <Show when={issues().length > 0}>
        <Note kind="warn" role="alert" testId="probe-issues"><ul class="probing-issues"><For each={issues()}>{(issue) => <li>{issue}</li>}</For></ul></Note>
      </Show>
      {(() => {
        const p = plan()
        return p.ok
          ? (
            <dl class="panel-kv probing-plan" data-testid="probe-plan">
              <dt>{t("cam.probing.plan.touches")}</dt><dd>{p.routine.contacts.length}</dd>
              <For each={resultsOf(p.routine)}>{(r) => <><dt>{r.name}</dt><dd>{Number(r.nominal.toFixed(4))} {r.unit === "deg" ? "°" : "mm"}</dd></>}</For>
            </dl>
          )
          : <Show when={issues().length === 0}><Note kind="bad" role="alert" testId="probe-refused">{p.reason}</Note></Show>
      })()}
    </div>
  )
}

