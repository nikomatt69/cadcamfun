import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { drawing } from "@cadcamfun/core"
import { ChevronDown, ChevronUp, PencilLine } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useRead } from "../../../app/queries.ts"
import { currentTitleBlock } from "../lib/document-setup.ts"
import { useCADStore } from "../store/cadStore.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import TitleBlockDialog from "./TitleBlockDialog.tsx"
import "../../../styles/viewport-chrome.css"

const STORAGE_KEY = "cadcamfun.title-block-collapsed"
const readCollapsed = (): boolean => { try { return globalThis.localStorage?.getItem(STORAGE_KEY) === "1" } catch { return false } }
const [collapsed, setCollapsedSignal] = createSignal(readCollapsed())
const setCollapsed = (value: boolean): void => {
  setCollapsedSignal(value)
  try { globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0") } catch { /* private window: the choice lasts until the page is closed */ }
}

/** One cell of the block: a small label over the value. */
function Cell(props: { readonly label: string; readonly value: string; readonly class?: string; readonly big?: boolean }): JSX.Element {
  return (
    <div class={`title-block__cell ${props.big === true ? "title-block__cell--key" : ""} ${props.class ?? ""}`}>
      <div class="title-block__label" title={props.label}>{props.label}</div>
      <div class="title-block__value" title={props.value}>{props.value === "" ? " " : props.value}</div>
    </div>
  )
}

/**
 * The title block of the open drawing, 2D and 3D alike: the same block, from the same data (`drawing.TitleBlock`, stored with the
 * drawing), laid out the way a drawing office lays it out. It is where the form that creates and edits it opens from. The CAM
 * workspace shows the manufacturing fields (machine, program, setup) as well.
 *
 * It does not position itself: the CAD canvas (`footerDock`) and the toolpath view (`dock`) put it at the bottom right in the same
 * stack as their own controls, so it cannot lie over them. Its surface is glass (`.title-block`, `styles/viewport-chrome.css`; the
 * native material rules are in `styles/glass.css`).
 */
export default function TitleBlockOverlay(props: { readonly mode: "2d" | "3d"; readonly cam?: boolean }): JSX.Element {
  const doc = useDocumentStore()
  const cad = useCADStore()
  const [editing, setEditing] = createSignal(false)
  // Whoever is at the keyboard signs the block until another name is written.
  const profile = useRead((client) => client.user.profile())
  createEffect(() => {
    const p = profile.data()
    if (p !== undefined && doc.author === "" && p.name !== null) useDocumentStore.getState().setIdentity(p.name, p.company ?? "")
  })

  const block = createMemo(() => {
    void [doc.titleBlock, doc.name, doc.author, doc.organization, cad.workpiece, cad.selectedMachine]
    return currentTitleBlock()
  })
  const text = (key: drawing.TitleBlockKey): string => drawing.titleBlockText(block(), key)
  const label = (key: drawing.TitleBlockKey): string => t(`cad.titleBlock.field.${key}`)
  const camFields = createMemo(() => (props.cam === true ? (["machine", "program", "setup"] as const) : drawing.titleBlockFieldsFor(block()).filter((f) => f.cam === true).map((f) => f.key as "machine" | "program" | "setup")))
  const incomplete = createMemo(() => drawing.titleBlockIssues(block()).length > 0)

  return (
    <div class="title-block-dock" data-testid="title-block-overlay" data-mode={props.mode}>
      <div class="title-block-tools">
        <Show when={incomplete()}><span class="title-block-missing" role="status">{t("cad.titleBlock.missing", { fields: drawing.titleBlockIssues(block()).map((i) => label(i.key)).join(", ") })}</span></Show>
        <button type="button" class="panel-icon-btn" data-testid="title-block-toggle" aria-expanded={!collapsed()} title={collapsed() ? t("cad.titleBlock.show") : t("cad.titleBlock.hide")} aria-label={collapsed() ? t("cad.titleBlock.show") : t("cad.titleBlock.hide")} onClick={() => setCollapsed(!collapsed())}>
          <Show when={collapsed()} fallback={<ChevronDown size={14} />}><ChevronUp size={14} /></Show>
        </button>
        <button type="button" class="panel-icon-btn" data-testid="title-block-edit" title={t("cad.titleBlock.edit")} aria-label={t("cad.titleBlock.edit")} onClick={() => setEditing(true)}><PencilLine size={14} /></button>
      </div>
      <Show when={!collapsed()} fallback={
        <button type="button" class="title-block title-block-pill" onClick={() => setEditing(true)}>
          <span class="title-block-pill__title">{text("title")}</span>
          <span class="title-block-pill__meta">{text("number")} · {t("cad.titleBlock.field.revision")} {text("revision")}</span>
        </button>
      }>
        <div class="title-block" data-testid="title-block" role="button" tabindex="0" onClick={() => setEditing(true)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditing(true) } }}>
          <div class="title-block__grid">
            <Cell label={label("owner")} value={text("owner")} class="col-span-2" />
            <Cell label={label("documentType")} value={t(`cad.titleBlock.option.${block().documentType}`)} />
            <Cell label={label("status")} value={t(`cad.titleBlock.option.${block().status}`)} />
            <Cell label={label("mass")} value={text("mass")} />
            <Cell label={label("units")} value={block().units} />
            <Cell label={label("title")} value={text("title")} class="col-span-3" big />
            <Cell label={label("number")} value={text("number")} class="col-span-2" big />
            <Cell label={label("revision")} value={text("revision")} big />
            <Cell label={label("material")} value={text("material")} class="col-span-2" />
            <Cell label={label("finish")} value={text("finish")} />
            <Cell label={label("standard")} value={text("standard")} />
            <Cell label={label("scale")} value={text("scale")} />
            <Cell label={label("projection")} value={text("projection")} />
            <Cell label={label("createdBy")} value={text("createdBy")} class="col-span-2" />
            <Cell label={label("checkedBy")} value={text("checkedBy")} />
            <Cell label={label("approvedBy")} value={text("approvedBy")} />
            <Cell label={label("date")} value={text("date")} />
            <Cell label={label("sheet")} value={text("sheet")} />
            <For each={camFields()}>{(key) => <Cell label={label(key)} value={text(key)} class="col-span-2" />}</For>
          </div>
        </div>
      </Show>
      <TitleBlockDialog open={editing()} onClose={() => setEditing(false)} {...(props.cam === true ? { cam: true } : {})} />
    </div>
  )
}
