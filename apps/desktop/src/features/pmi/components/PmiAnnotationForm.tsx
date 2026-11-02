/**
 * Authoring form for one PMI annotation. The referenced entity comes from the existing viewport
 * selection (`selectorStore` + `elementsStore`): `refFromElement` turns it into the topological
 * `Ref` the backend stores. GD&T fields reuse the core vocabulary (`drawing.GdtKind`,
 * `drawing.validateGdt` via `pmi.validatePmiSet`); nothing is validated by hand here.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { pmi } from "@cadcamfun/core"
import { INPUT } from "../../../shared/components/panel/ui.tsx"
import { t } from "../../../i18n/index.ts"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../cad/store/selectorStore.ts"
import { GDT_KINDS, newPmiId, refFromElement } from "../pmi-format.ts"
import { usePmiStore } from "../pmi-store.ts"

type Kind = pmi.PmiAnnotation["kind"]
const KINDS: readonly Kind[] = ["dimensional-size", "dimensional-location", "geometric-tolerance", "datum", "datum-target", "surface-texture", "note"]
const num = (s: string): number => (s.trim() === "" ? NaN : Number(s))
const MUTED = { color: "var(--panel-text-muted)" } as const
const BAD = { color: "var(--panel-bad)" } as const

export default function PmiAnnotationForm(props: { readonly captureId: string | undefined }): JSX.Element {
  const store = usePmiStore()
  const selection = useSelectionStore()
  const elements = useElementsStore()
  const [kind, setKind] = createSignal<Kind>("dimensional-size")
  const [nominal, setNominal] = createSignal("10"), [upper, setUpper] = createSignal("0.1"), [lower, setLower] = createSignal("-0.1")
  const [gdtKind, setGdtKind] = createSignal("position"), [gdtValue, setGdtValue] = createSignal("0.1"), [gdtDatums, setGdtDatums] = createSignal("A"), [gdtDiameter, setGdtDiameter] = createSignal(false)
  const [letter, setLetter] = createSignal("A"), [target, setTarget] = createSignal("T1")
  const [ra, setRa] = createSignal("1.6"), [rz, setRz] = createSignal(""), [lay, setLay] = createSignal(""), [process, setProcess] = createSignal("")
  const [text, setText] = createSignal("")
  const [error, setError] = createSignal("")

  const selectedElement = createMemo(() => {
    const id = selection.selectedElementIds[0]
    return id === undefined ? undefined : elements.elements.find((e) => e.id === id)
  })
  const datumLetters = createMemo(() => store.set.annotations.filter((a) => a.kind === "datum").map((a) => (a as { letter: string }).letter))

  const create = (): void => {
    const el = selectedElement()
    if (kind() !== "note" && el === undefined) { setError(t("cad.pmi.needSelection")); return }
    const existingCaptureId = props.captureId ?? store.activeCaptureId
    const captureId = existingCaptureId ?? newPmiId("capture")
    const refs: readonly pmi.PmiRef[] = el === undefined ? [] : [refFromElement(el)]
    const base = { id: newPmiId("pmi"), captureId, refs }
    let annotation: pmi.PmiAnnotation
    switch (kind()) {
      case "dimensional-size": annotation = { ...base, kind: "dimensional-size", nominal: num(nominal()), upper: num(upper()), lower: num(lower()), unit: "mm" }; break
      case "dimensional-location": annotation = { ...base, kind: "dimensional-location", nominal: num(nominal()), upper: num(upper()), lower: num(lower()) }; break
      case "geometric-tolerance": annotation = { ...base, kind: "geometric-tolerance", gdt: { kind: gdtKind() as never, value: num(gdtValue()), ...(gdtDiameter() ? { diameter: true } : {}), datums: gdtDatums().split(/[\s,]+/).filter(Boolean) } }; break
      case "datum": annotation = { ...base, kind: "datum", letter: letter().trim().toUpperCase() }; break
      case "datum-target": annotation = { ...base, kind: "datum-target", letter: letter().trim().toUpperCase(), target: target() }; break
      case "surface-texture": annotation = { ...base, kind: "surface-texture", ...(ra().trim() !== "" ? { ra: num(ra()) } : {}), ...(rz().trim() !== "" ? { rz: num(rz()) } : {}), ...(lay().trim() !== "" ? { lay: lay() } : {}), ...(process().trim() !== "" ? { process: process() } : {}) }; break
      case "note": annotation = { ...base, kind: "note", text: text() }; break
    }
    const candidate: pmi.PmiSet = { version: 1, annotations: [...store.set.annotations, annotation], captures: store.set.captures.some((c) => c.id === captureId) ? store.set.captures.map((c) => (c.id === captureId ? { ...c, annotationIds: [...c.annotationIds, annotation.id] } : c)) : [...store.set.captures, { id: captureId, name: "Default", annotationIds: [annotation.id] }] }
    const issues = pmi.validatePmiSet(candidate).filter((i) => i.annotationId === annotation.id)
    if (issues.length > 0) { setError(issues.map((i) => i.message).join("; ")); return }
    setError("")
    const targetCaptureId = existingCaptureId ?? store.addCapture("Default")
    store.addAnnotation({ ...annotation, captureId: targetCaptureId })
  }

  const field = (label: string, value: () => string, set: (v: string) => void, numeric = false): JSX.Element =>
    <label class="block"><span class="panel-label">{label}</span><input class={INPUT} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} value={value()} onInput={(e) => set(e.currentTarget.value)} /></label>

  return (
    <div class="space-y-2" data-testid="pmi-authoring-form">
      <label class="block"><span class="panel-label">{t("cad.pmi.kind")}</span>
        <select class={INPUT} data-testid="pmi-kind" value={kind()} onChange={(e) => setKind(e.currentTarget.value as Kind)}>
          <For each={KINDS}>{(k) => <option value={k}>{t(`cad.pmi.kind.${k}` as never)}</option>}</For>
        </select></label>
      <p style={{ ...MUTED, "font-size": "12px" }} data-testid="pmi-selected-ref">{selectedElement() === undefined ? t("cad.pmi.noSelection") : `${t("cad.pmi.selected")}: ${selectedElement()!.name ?? selectedElement()!.id}`}</p>
      <Show when={datumLetters().length > 0}><p style={{ ...MUTED, "font-size": "12px" }}>{t("cad.pmi.datums")}: {datumLetters().join(", ")}</p></Show>
      <Show when={kind() === "dimensional-size" || kind() === "dimensional-location"}><div class="grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(70px, 1fr))" }}>{field(t("cad.pmi.nominal"), nominal, setNominal, true)}{field(t("cad.pmi.upper"), upper, setUpper, true)}{field(t("cad.pmi.lower"), lower, setLower, true)}</div></Show>
      <Show when={kind() === "geometric-tolerance"}><div class="grid grid-cols-2 gap-2">
        <label class="block"><span class="panel-label">{t("cad.pmi.gdtKind")}</span><select class={INPUT} value={gdtKind()} onChange={(e) => setGdtKind(e.currentTarget.value)}><For each={GDT_KINDS}>{(k) => <option value={k}>{k}</option>}</For></select></label>
        {field(t("cad.pmi.gdtValue"), gdtValue, setGdtValue, true)}
        {field(t("cad.pmi.gdtDatums"), gdtDatums, setGdtDatums)}
        <label class="flex items-center gap-2" style={{ ...MUTED, "font-size": "12px" }}><input type="checkbox" checked={gdtDiameter()} onChange={(e) => setGdtDiameter(e.currentTarget.checked)} />{t("cad.pmi.diameter")}</label>
      </div></Show>
      <Show when={kind() === "datum" || kind() === "datum-target"}><div class="grid grid-cols-2 gap-2">{field(t("cad.pmi.letter"), letter, setLetter)}<Show when={kind() === "datum-target"}>{field(t("cad.pmi.target"), target, setTarget)}</Show></div></Show>
      <Show when={kind() === "surface-texture"}><div class="grid grid-cols-2 gap-2">{field("Ra", ra, setRa, true)}{field("Rz", rz, setRz, true)}{field(t("cad.pmi.lay"), lay, setLay)}{field(t("cad.pmi.process"), process, setProcess)}</div></Show>
      <Show when={kind() === "note"}>{field(t("cad.pmi.text"), text, setText)}</Show>
      <Show when={error()}><p role="alert" style={{ ...BAD, "font-size": "12px" }}>{error()}</p></Show>
      <button type="button" class="panel-btn panel-btn--primary panel-btn--block" data-testid="pmi-create" onClick={create}>{t("cad.pmi.create")}</button>
    </div>
  )
}
