/**
 * The program of the selected probe cycle (spec 73 §4): the control it is written for, the NC text from the sidecar with the touch
 * lines marked, and the actions on it: Simulate (run it against the part), Show in 3D (the probe, contacts and deviations in the
 * toolpath view) and Insert (append it to the program in the editor). A program written for an older edit of the cycle is marked
 * stale and cannot be inserted.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { Box, ClipboardCopy, FileInput, Play, RefreshCw } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { Field, Note } from "../../../../shared/components/panel/ui.tsx"
import type { ProbeProgram, ProbingBusy } from "../../store/probingStore.ts"

export interface DialectOption { readonly id: string; readonly label: string }

export interface ProbeProgramPreviewProps {
  readonly program: ProbeProgram | undefined
  /** The program does not describe the cycle as it is now. */
  readonly stale: boolean
  readonly dialect: string
  readonly dialects: ReadonlyArray<DialectOption>
  readonly busy: ProbingBusy | undefined
  readonly showIn3d: boolean
  /** Lines (1-based) of the touch blocks, from a simulated run: marked in the gutter. */
  readonly contactLines?: ReadonlySet<number>
  /** No cycle is selected or it is refused: nothing can be written. */
  readonly disabled: boolean
  onDialect(id: string): void
  onGenerate(): void
  onSimulate(): void
  onShow3d(show: boolean): void
  onInsert(nc: string): void
  onCopy?(nc: string): void
}

export function ProbeProgramPreview(props: ProbeProgramPreviewProps): JSX.Element {
  const lines = createMemo(() => (props.program?.nc ?? "").replace(/\n$/, "").split("\n"))
  const working = () => props.busy !== undefined
  return (
    <div class="probing-program" data-testid="probe-program">
      <Field label={t("cam.probing.dialect")} for="probe-dialect">
        <select id="probe-dialect" class="panel-input" data-testid="probe-dialect" value={props.dialect} onChange={(event) => props.onDialect(event.currentTarget.value)}>
          <For each={props.dialects}>{(d) => <option value={d.id}>{d.label}</option>}</For>
        </select>
      </Field>
      <div class="probing-row-actions">
        <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-generate" disabled={props.disabled || working()} onClick={props.onGenerate}>
          <RefreshCw size={14} />{props.busy === "emit" ? t("cam.probing.program.generating") : t("cam.probing.program.generate")}
        </button>
        <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-simulate" disabled={props.disabled || working()} onClick={props.onSimulate}>
          <Play size={14} />{props.busy === "simulate" ? t("cam.probing.program.simulating") : t("cam.probing.program.simulate")}
        </button>
        <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-show3d" aria-pressed={props.showIn3d} onClick={() => props.onShow3d(!props.showIn3d)}>
          <Box size={14} />{t("cam.probing.program.show3d")}
        </button>
      </div>
      <Show when={props.program} fallback={<p class="panel-empty" data-testid="probe-program-empty">{t("cam.probing.program.empty")}</p>}>
        {(program) => (
          <>
            <Show when={props.stale}><Note kind="warn" testId="probe-program-stale">{t("cam.probing.program.stale")}</Note></Show>
            <For each={program().warnings}>{(warning) => <Note kind="warn" testId="probe-program-warning">{warning}</Note>}</For>
            <pre class="panel-code probing-code" data-testid="probe-nc" tabindex="0" aria-label={t("cam.probing.program.code")}>
              <For each={lines()}>{(line, index) => (
                <span class="probing-code__line" data-contact={props.contactLines?.has(index() + 1) === true}>
                  <span class="probing-code__no">{index() + 1}</span>{line}{"\n"}
                </span>
              )}</For>
            </pre>
            <ul class="probing-notes"><For each={program().notes}>{(note) => <li class="panel-hint">{note}</li>}</For></ul>
            <div class="probing-row-actions">
              <button type="button" class="panel-btn panel-btn--primary panel-btn--fit" data-testid="probe-insert" disabled={props.stale || working()} onClick={() => props.onInsert(program().nc)}>
                <FileInput size={14} />{t("cam.probing.program.insert")}
              </button>
              <Show when={props.onCopy}>{(copy) => (
                <button type="button" class="panel-btn panel-btn--fit" data-testid="probe-copy" onClick={() => copy()(program().nc)}><ClipboardCopy size={14} />{t("cam.probing.program.copy")}</button>
              )}</Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
