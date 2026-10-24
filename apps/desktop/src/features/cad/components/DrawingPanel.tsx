import { INPUT, PanelCard } from "../../../shared/components/panel/ui.tsx"
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { drawing, type History } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { downloadDrawing, drawingPdf } from "../lib/drawing-export.ts"

const BUTTON = "panel-btn"
type Principal = "front" | "top" | "right"

/** Derived sheets stay separate from model geometry and undo history. Every source/options change invalidates the preview. */
export default function DrawingPanel(): JSX.Element {
  const elements = useElementsStore(), selection = useSelectionStore()
  const parts = createMemo(() => elements.elements.filter((e) => e.type === "parametric"))
  const [chosen, setChosen] = createSignal("")
  const part = createMemo(() => parts().find((e) => e.id === chosen()) ?? parts().find((e) => selection.selectedElementIds.includes(e.id)) ?? parts()[0])
  const [size, setSize] = createSignal<drawing.SheetSize>("A3")
  const [projection, setProjection] = createSignal<"first" | "third">("first")
  const [title, setTitle] = createSignal("")
  const [material, setMaterial] = createSignal("")
  const [section, setSection] = createSignal(false)
  const [axis, setAxis] = createSignal<"x" | "y" | "z">("y")
  const [at, setAt] = createSignal("0")
  const [detail, setDetail] = createSignal(false)
  const [parent, setParent] = createSignal<Principal>("top")
  const [x, setX] = createSignal("0"), [y, setY] = createSignal("0"), [z, setZ] = createSignal("0")
  const [radius, setRadius] = createSignal("20"), [factor, setFactor] = createSignal("2")
  const [sheet, setSheet] = createSignal<drawing.DrawingSheet>()
  const [error, setError] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  let dialog: HTMLDialogElement | undefined
  const numeric = (text: string): number => text.trim() === "" ? NaN : Number(text)
  const options = createMemo((): drawing.SheetOptions => ({
    size: size(), projection: projection(), title: title() || part()?.name || "Drawing", material: material() || "N.A.",
    ...(section() ? { section: { axis: axis(), at: numeric(at()) } } : {}),
    ...(detail() ? { detail: { view: parent(), centre: { x: numeric(x()), y: numeric(y()), z: numeric(z()) }, radius: numeric(radius()), factor: numeric(factor()) } } : {})
  }))
  createEffect(() => { part()?.id; part()?.["history"]; options(); setSheet(undefined); setError("") })
  const generate = async () => {
    const source = part()
    if (source === undefined) return
    setBusy(true); setError(""); setSheet(undefined)
    try {
      // Let the button paint before the synchronous core projection starts.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      setSheet(drawing.generateSheet(source["history"] as History, options()))
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("cad.drawing.failed")) }
    finally { setBusy(false) }
  }
  const exportPdf = async () => {
    const current = sheet()
    if (current === undefined) return
    setBusy(true); setError("")
    try { downloadDrawing(await drawingPdf(current), "application/pdf", "drawing.pdf") }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("cad.drawing.failed")) }
    finally { setBusy(false) }
  }
  const preview = () => sheet() === undefined ? "" : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet()!.svg)}`
  const field = (label: string, value: () => string, set: (v: string) => void, numeric = false) =>
    <label class="block text-xs"><span class="mb-1 block text-gray-500">{label}</span><input class={INPUT} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} required={numeric} value={value()} onInput={(e) => set(e.currentTarget.value)} /></label>
  return <PanelCard title={t("cad.drawing.title")} testId="drawing-panel">
    <p class="text-xs text-gray-500">{t("cad.drawing.description")}</p>
    <Show when={parts().length > 0} fallback={<p>{t("cad.drawing.empty")}</p>}>
      <fieldset disabled={busy()} class="space-y-3">
        <label class="block text-xs">{t("cad.drawing.part")}<select class={INPUT} value={part()?.id} onChange={(e) => setChosen(e.currentTarget.value)}>
          <For each={parts()}>{(p) => <option value={p.id}>{p.name ?? p.id}</option>}</For>
        </select></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs">{t("cad.drawing.paper")}<select class={INPUT} value={size()} onChange={(e) => setSize(e.currentTarget.value as drawing.SheetSize)}><For each={["A4", "A3", "A2"]}>{(s) => <option value={s}>{s}</option>}</For></select></label>
          <label class="text-xs">{t("cad.drawing.projection")}<select class={INPUT} value={projection()} onChange={(e) => setProjection(e.currentTarget.value as "first" | "third")}><option value="first">{t("cad.drawing.first")}</option><option value="third">{t("cad.drawing.third")}</option></select></label>
          {field(t("cad.drawing.sheetTitle"), title, setTitle)}{field(t("cad.drawing.material"), material, setMaterial)}
        </div>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={section()} onChange={(e) => setSection(e.currentTarget.checked)} />{t("cad.drawing.section")}</label>
        <Show when={section()}><div class="grid grid-cols-2 gap-2"><label class="text-xs">{t("cad.drawing.axis")}<select class={INPUT} value={axis()} onChange={(e) => setAxis(e.currentTarget.value as "x" | "y" | "z")}><For each={["x", "y", "z"]}>{(a) => <option value={a}>{a.toUpperCase()}</option>}</For></select></label>{field(t("cad.drawing.position"), at, setAt, true)}</div></Show>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={detail()} onChange={(e) => setDetail(e.currentTarget.checked)} />{t("cad.drawing.detail")}</label>
        <Show when={detail()}><div class="grid grid-cols-3 gap-2">
          <label class="col-span-3 text-xs">{t("cad.drawing.parent")}<select class={INPUT} value={parent()} onChange={(e) => setParent(e.currentTarget.value as Principal)}><For each={["front", "top", "right"]}>{(p) => <option value={p}>{p}</option>}</For></select></label>
          {field(t("cad.drawing.x"), x, setX, true)}{field(t("cad.drawing.y"), y, setY, true)}{field(t("cad.drawing.z"), z, setZ, true)}
          {field(t("cad.drawing.radius"), radius, setRadius, true)}{field(t("cad.drawing.factor"), factor, setFactor, true)}
        </div></Show>
        <button type="button" class={`${BUTTON} panel-btn--primary panel-btn--block`} onClick={() => void generate()}>{t("cad.drawing.generate")}</button>
      </fieldset>
      <Show when={busy()}><p role="status" class="text-xs">{t("cad.drawing.working")}</p></Show>
      <Show when={error()}><p role="alert" class="text-xs text-red-600">{error()}</p></Show>
      <Show when={sheet()}>{(current) => <div class="space-y-3">
        <button type="button" class="w-full border border-gray-300 bg-white" aria-label={t("cad.drawing.enlarge")} onClick={() => dialog?.showModal()}><img src={preview()} alt={t("cad.drawing.preview")} class="w-full" /></button>
        <p class="text-xs text-gray-500">{current().size.width} × {current().size.height} mm · {drawing.scaleText(current().scale)}</p>
        <div class="flex gap-2"><button type="button" class={BUTTON} disabled={busy()} onClick={() => downloadDrawing(current().svg, "image/svg+xml", "drawing.svg")}>{t("cad.drawing.svg")}</button><button type="button" class={BUTTON} disabled={busy()} onClick={() => void exportPdf()}>{t("cad.drawing.pdf")}</button></div>
        <p class="text-xs text-gray-500">{t("cad.drawing.pdfLimit")}</p>
        <Show when={current().warnings.length > 0}><details open><summary class="text-xs font-medium">{t("cad.drawing.warnings")}</summary><ul class="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400"><For each={current().warnings}>{(w) => <li>{w}</li>}</For></ul></details></Show>
        <dialog ref={dialog} class="m-auto w-[95vw] max-w-none border border-gray-400 bg-white p-3 backdrop:bg-black/60" aria-label={t("cad.drawing.preview")}>
          <div class="mb-2 flex justify-end"><button type="button" class={BUTTON} onClick={() => dialog?.close()}>{t("cad.drawing.close")}</button></div><img src={preview()} alt={t("cad.drawing.preview")} class="max-h-[85vh] w-full object-contain" />
        </dialog>
      </div>}</Show>
    </Show>
  </PanelCard>
}
