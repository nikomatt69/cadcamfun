/**
 * PMI panel (spec 49 P1): annotations grouped by capture, capture switcher, broken/orphan state
 * from `pmi.validatePmiSet`, authoring from the viewport selection, and save/load through the PMI
 * API group with CAS. The drawing section below reuses the backend derivation
 * (`pmi.pmiDrawingData`) — the same rows the sheet renders, not a forked GD&T rendering.
 * Styling is the workstation panel design system (`styles/panel.css`): every text, border and
 * surface reads a `--panel-*` token, so the panel is legible in the light and dark theme and
 * inside a Portal, where no shell colour can be inherited.
 */
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { pmi } from "@cadcamfun/core"
import { Badge, INPUT, Note, PanelCard } from "../../../shared/components/panel/ui.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { PmiScene } from "../../../shared/ui/stageshow/scenes-cad.tsx"
import { LoadingState } from "../../../shared/components/screen-parts.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { storedRevisionOf } from "../../cad/lib/stored-revision.ts"
import { annotationSummary, drawingRows, groupByCapture, isBroken, issuesFor, kindKey, refLabel } from "../pmi-format.ts"
import { loadPmi, savePmi } from "../pmi-api.ts"
import { usePmiStore } from "../pmi-store.ts"
import PmiAnnotationForm from "./PmiAnnotationForm.tsx"

const BUTTON = "panel-btn"
const MUTED = { color: "var(--panel-text-muted)" } as const
const BAD = { color: "var(--panel-bad)" } as const
const DIVIDER = { "border-color": "var(--panel-border)" } as const

export default function PmiPanel(props: { readonly embedded?: boolean }): JSX.Element {
  const app = useApp()
  const doc = useDocumentStore()
  const store = usePmiStore()
  const [captureName, setCaptureName] = createSignal("")
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  const issues = createMemo(() => pmi.validatePmiSet(store.set))
  const groups = createMemo(() => groupByCapture(store.set))
  const rows = createMemo(() => drawingRows(store.set))
  const drawingId = (): string | null => doc.drawingId ?? store.drawingId

  // Load once per drawing; a later drawing replaces the draft.
  createEffect(() => {
    const id = doc.drawingId
    if (id === null || id === loadedFor()) return
    setLoadedFor(id)
    store.setStatus("loading")
    void loadPmi(app, id).then(
      (result) => { if (doc.drawingId === id) store.setSet(result.set, id) },
      (cause) => { if (doc.drawingId === id) store.setStatus("error", cause instanceof Error ? cause.message : t("cad.pmi.loadFailed")) }
    )
  })

  const save = async (): Promise<void> => {
    const id = drawingId()
    if (id === null) { toast.error(t("cad.pmi.noDrawing")); return }
    store.setStatus("saving")
    try {
      const result = await savePmi(app, id, store.set, storedRevisionOf(id))
      if (result.outcome === "conflict") { store.setStatus("conflict", result.message); toast.error(t("cad.pmi.conflict")); return }
      if (result.outcome === "invalid") { store.setStatus("error", result.message); toast.error(t("cad.pmi.invalid")); return }
      store.setSet(result.result.set, id)
      toast.success(t("cad.pmi.saved"))
    } catch (cause) {
      store.setStatus("error", cause instanceof Error ? cause.message : t("cad.pmi.saveFailed"))
      toast.error(t("cad.pmi.saveFailed"))
    }
  }

  const reload = (): void => {
    const id = drawingId()
    if (id === null) return
    store.setStatus("loading")
    void loadPmi(app, id).then(
      (r) => { if (drawingId() === id) store.setSet(r.set, id) },
      () => { if (drawingId() === id) store.setStatus("error", t("cad.pmi.loadFailed")) }
    )
  }

  const body = (
    <>
      <Show when={props.embedded !== true}><p style={{ ...MUTED, "font-size": "12px" }}>{t("cad.pmi.description")}</p></Show>
      <Show when={drawingId() === null}><Note kind="warn">{t("cad.pmi.noDrawing")}</Note></Show>

      {/* Capture switcher */}
      <div class="mt-3 space-y-2">
        <label class="block"><span class="panel-label">{t("cad.pmi.capture")}</span>
          <select class={INPUT} data-testid="pmi-capture-switcher" value={store.activeCaptureId ?? ""} onChange={(e) => store.setActiveCapture(e.currentTarget.value === "" ? undefined : e.currentTarget.value)}>
            <option value="">{t("cad.pmi.allCaptures")}</option>
            <For each={store.set.captures}>{(c) => <option value={c.id}>{c.name}</option>}</For>
          </select></label>
        <div class="flex flex-wrap items-center gap-2">
          <input class={`${INPUT} min-w-[8rem] flex-1`} data-testid="pmi-capture-name" aria-label={t("cad.pmi.captureName")} placeholder={t("cad.pmi.captureName")} value={captureName()} onInput={(e) => setCaptureName(e.currentTarget.value)} />
          <button type="button" class={`${BUTTON} shrink-0 whitespace-nowrap`} data-testid="pmi-add-capture" onClick={() => { store.addCapture(captureName()); setCaptureName("") }}>{t("cad.pmi.addCapture")}</button>
          <Show when={store.activeCaptureId}><button type="button" class={`${BUTTON} shrink-0 whitespace-nowrap`} data-testid="pmi-remove-capture" onClick={() => store.removeCapture(store.activeCaptureId!)}>{t("cad.pmi.removeCapture")}</button></Show>
        </div>
      </div>

      {/* Annotations grouped by capture */}
      <div class="mt-3 space-y-3" data-testid="pmi-annotation-list">
        <Show when={store.set.annotations.length === 0}><PmiScene /><p style={{ ...MUTED, "font-size": "12px" }}>{t("cad.pmi.empty")}</p></Show>
        <For each={groups()}>{(group) => (
          <div>
            <h4 class="panel-group__title">{group.capture.name}</h4>
            <ul class="mt-1 space-y-1">
              <For each={group.annotations}>{(a) => (
                <li>
                  <button type="button" data-testid="pmi-annotation" data-kind={a.kind} data-broken={isBroken(issues(), a.id)}
                    class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--panel-accent)]"
                    aria-pressed={store.selectedAnnotationId === a.id}
                    style={store.selectedAnnotationId === a.id
                      ? { "border": "1px solid var(--panel-accent)", "background": "var(--panel-accent-soft)", "color": "var(--panel-text)", "font-size": "12px" }
                      : { "border": "1px solid var(--panel-border-strong)", "background": "var(--panel-bg)", "color": "var(--panel-text)", "font-size": "12px" }}
                    onClick={() => store.selectAnnotation(a.id)}>
                    <span class="font-medium">{t(`cad.pmi.kind.${kindKey(a.kind)}` as never)}</span>
                    <span class="flex-1 truncate">{annotationSummary(a)}</span>
                    <Show when={isBroken(issues(), a.id)}><Badge tone="bad">{t("cad.pmi.broken")}</Badge></Show>
                  </button>
                  <Show when={store.selectedAnnotationId === a.id}>
                    <div class="px-3 py-2" style={{ ...MUTED, "font-size": "12px" }}>
                      <For each={a.refs}>{(r) => <div>{refLabel(r)}</div>}</For>
                      <For each={issuesFor(issues(), a.id)}>{(i) => <p role="alert" style={BAD}>{i.message}</p>}</For>
                      <button type="button" class={BUTTON} data-testid="pmi-remove-annotation" onClick={() => store.removeAnnotation(a.id)}>{t("cad.pmi.remove")}</button>
                    </div>
                  </Show>
                </li>
              )}</For>
            </ul>
          </div>
        )}</For>
      </div>

      <Show when={issues().length > 0}>
        <div class="mt-2" data-testid="pmi-issues"><Note kind="bad" role="alert">{issues().map((i) => i.message).join("; ")}</Note></div>
      </Show>
      <p class="mt-3 flex items-baseline gap-2" style={{ ...MUTED, "font-size": "12px" }}>{t("cad.pmi.fingerprint")}: <span class="font-mono" style={{ "font-size": "11px" }} data-testid="pmi-fingerprint" title={pmi.pmiFingerprint(store.set)}>{pmi.pmiFingerprint(store.set).slice(0, 12)}…</span></p>

      {/* Authoring from the viewport selection */}
      <div class="mt-3 border-t pt-3" style={DIVIDER}>
        <PmiAnnotationForm captureId={store.activeCaptureId} />
      </div>

      {/* Save / load with CAS */}
      <div class="mt-4 flex gap-2 border-t pt-3" style={DIVIDER}>
        <button type="button" class={`${BUTTON} panel-btn--primary flex-1`} data-testid="pmi-save" disabled={store.status === "saving" || store.status === "loading"} onClick={() => void save()}>{t("cad.pmi.save")}</button>
        <button type="button" class={`${BUTTON} shrink-0 whitespace-nowrap`} data-testid="pmi-reload" disabled={store.status === "saving" || store.status === "loading"} onClick={reload}>{t("cad.pmi.reload")}</button>
      </div>
      <Show when={store.status === "conflict"}><div class="mt-2"><Note kind="bad" role="alert">{t("cad.pmi.conflict")}{store.error !== undefined ? ` ${store.error}` : ""}</Note></div></Show>
      <Show when={store.status === "error" && store.error !== undefined}><p role="alert" class="mt-2" style={{ ...BAD, "font-size": "12px" }}>{store.error}</p></Show>
      <Show when={store.status === "loading"}><LoadingState label={t("cad.pmi.loading")} rows={2} /></Show>

      {/* Drawing derivation: same rows the sheet consumes */}
      <div class="mt-3 border-t pt-3" style={DIVIDER} data-testid="pmi-drawing-section">
        <h4 class="panel-group__title">{t("cad.pmi.drawingTitle")}</h4>
        <Show when={rows().dimensions.length + rows().gdt.length + rows().datums.length + rows().datumTargets.length + rows().surfaceTextures.length + rows().notes.length === 0}><p style={{ ...MUTED, "font-size": "12px" }}>{t("cad.pmi.drawingEmpty")}</p></Show>
        <ul class="mt-1 space-y-1" style={{ ...MUTED, "font-size": "12px" }}>
          <For each={rows().dimensions}>{(d) => <li data-testid="pmi-drawing-dimension">{d.text}</li>}</For>
          <For each={rows().gdt}>{(g) => <li data-testid="pmi-drawing-gdt">{g.spec.kind} {g.text}{(g.spec.datums ?? []).length > 0 ? ` | ${(g.spec.datums ?? []).join(" | ")}` : ""}</li>}</For>
          <For each={rows().datums}>{(d) => <li data-testid="pmi-drawing-datum">[{d.letter}]</li>}</For>
          <For each={rows().datumTargets}>{(d) => <li>{d.letter} · {d.target}</li>}</For>
          <For each={rows().surfaceTextures}>{(s) => <li>{s.text}</li>}</For>
          <For each={rows().notes}>{(n) => <li>{n.text}</li>}</For>
        </ul>
      </div>
    </>
  )

  // The `panel` class carries the design tokens: the panel stays legible wherever it is mounted.
  return props.embedded === true
    ? <section class="panel" data-testid="pmi-panel">{body}</section>
    : <div class="panel"><PanelCard title={t("cad.pmi.title")} testId="pmi-panel">{body}</PanelCard></div>
}
