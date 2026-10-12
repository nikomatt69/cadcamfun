import { Show, createSignal } from "solid-js"
import { A } from "@solidjs/router"
import { GripHorizontal, X, ChevronUp, ChevronDown, Bot, BookOpen } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { t } from "../../../i18n/index.ts"
import { CadButton, CadToolPalette } from "./cad-controls.tsx"

export function CadFloatingToolbar(props: { onClose: () => void }) {
  const app = useApp()
  const [expanded, setExpanded] = createSignal(true)
  const [mode, setMode] = createSignal<"create" | "transform" | "library" | "ai">("create")
  const [position, setPosition] = createSignal({ x: 32, y: 72 })
  let toolbar: HTMLDivElement | undefined
  let drag: { pointer: number; x: number; y: number } | undefined
  return <div ref={toolbar} class="cad-floating cad-surface" style={{ transform: `translate(${position().x}px, ${position().y}px)` }}>
    <div class="cad-floating-header">
      <button class="cad-drag-handle" aria-label={t("cad.moveToolbar")} onPointerDown={event => {
        if (drag || event.button !== 0) return
        drag = { pointer: event.pointerId, x: event.clientX - position().x, y: event.clientY - position().y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={event => {
        if (!drag || drag.pointer !== event.pointerId || !toolbar) return
        const parent = toolbar.parentElement
        setPosition({ x: Math.max(0, Math.min(event.clientX - drag.x, Math.max(0, (parent?.clientWidth ?? 0) - toolbar.offsetWidth))), y: Math.max(0, Math.min(event.clientY - drag.y, Math.max(0, (parent?.clientHeight ?? 0) - toolbar.offsetHeight))) })
      }} onPointerUp={event => { if (drag?.pointer === event.pointerId) { drag = undefined; event.currentTarget.releasePointerCapture(event.pointerId) } }} onPointerCancel={() => { drag = undefined }} onLostPointerCapture={() => { drag = undefined }}><GripHorizontal size={18} /><span>{t("cad.floatingToolbar")}</span></button>
      <CadButton label={t("cad.collapse")} onClick={() => setExpanded(value => !value)}>{expanded() ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</CadButton>
      <CadButton label={t("common.close")} onClick={props.onClose}><X size={15} /></CadButton>
    </div>
    <Show when={expanded()}><div class="cad-tabs" role="tablist" aria-label={t("cad.floatingToolbar")}>
      <button role="tab" aria-selected={mode() === "create"} onClick={() => setMode("create")}>{t("cad.create")}</button>
      <button role="tab" aria-selected={mode() === "transform"} onClick={() => setMode("transform")}>{t("cad.transform")}</button>
      <button role="tab" aria-selected={mode() === "library"} onClick={() => setMode("library")}>{t("cad.library")}</button>
      <button role="tab" aria-selected={mode() === "ai"} onClick={() => setMode("ai")}>{t("cad.ai")}</button>
    </div><div class="cad-floating-content" role="tabpanel">
      <Show when={mode() === "create"}><CadToolPalette compact /></Show>
      <Show when={mode() === "transform"}><CadToolPalette compact transform /></Show>
      <Show when={mode() === "library"}><A class="cad-button" href="/library"><BookOpen size={17} />{t("cad.openLibrary")}</A></Show>
      <Show when={mode() === "ai"}><CadButton label={t("cad.openAssistant")} onClick={() => app.setPanelOpen(true)}><Bot size={17} />{t("cad.openAssistant")}</CadButton></Show>
    </div></Show>
  </div>
}
