/** The editable NC text uses the same panel vocabulary as the generator; processing still belongs to the page. */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Code, Play } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { gcodeSummary } from "../lib/gcode-summary.ts"
import { caretPosition, tokenizeGcodeLine } from "../lib/gcode-tokens.ts"
import "../../../styles/cam-panels.css"

export interface GCodeEditorProps {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly onProcess: () => void
}

/** Above this many lines the colouring is dropped so that typing in a huge program stays immediate. */
const HIGHLIGHT_LIMIT = 4000
const INDENT = "  "

/** Colouring whose text is exactly the lines joined by newlines: a break only between lines, never around them. */
function Painted(props: { readonly lines: readonly string[] }): JSX.Element {
  return <For each={props.lines}>{(line, index) => {
    const tokens = tokenizeGcodeLine(line)
    return <>{index() > 0 ? "\n" : null}{tokens.map((token) => <span class={`gc-${token.kind}`}>{token.text}</span>)}</>
  }}</For>
}

export default function GCodeEditor(props: GCodeEditorProps): JSX.Element {
  const summary = createMemo(() => gcodeSummary(props.value))
  const lines = createMemo(() => props.value.split("\n"))
  const colored = createMemo(() => lines().length <= HIGHLIGHT_LIMIT)
  const [caret, setCaret] = createSignal(0)
  const [scroll, setScroll] = createSignal({ top: 0, left: 0 })
  const position = createMemo(() => caretPosition(props.value, caret()))
  const gutter = createMemo(() => lines().map((_, i) => i + 1).join("\n"))
  const shift = () => `translate(${-scroll().left}px, ${-scroll().top}px)`
  const shiftY = () => `translateY(${-scroll().top}px)`
  const bandTop = () => `${(position().line - 1) * 20}px`

  const track = (area: HTMLTextAreaElement) => setCaret(area.selectionStart)
  const edit = (area: HTMLTextAreaElement) => { props.onChange(area.value); track(area) }

  const onKeyDown: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent> = (event) => {
    const area = event.currentTarget
    // Cmd/Ctrl+Enter is the global "process G-code" command; the editor only owns Tab.
    if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      area.setRangeText(INDENT, area.selectionStart, area.selectionEnd, "end")
      edit(area)
    }
  }

  return <section class="panel cam-editor cam-central-panel" data-testid="gcode-editor-panel">
    <header class="panel-header">
      <div class="cam-panel-heading"><Code size={15} /><h3 class="panel-header__title">{t("cam.editor")}</h3></div>
      <p class="cam-editor__facts" data-testid="editor-summary">
        <span title={t("cam.panel.blocks")}>{t("cam.lines", { count: summary().lines })}</span>
        <Show when={summary().tools.length > 0}><span>{summary().tools.map(n => `T${n}`).join(" ")}</span></Show>
        <Show when={summary().offsets.length > 0}><span>{summary().offsets.join(" ")}</span></Show>
      </p>
    </header>
    <div class="cam-editor__body">
      <div class="cam-editor__gutter" aria-hidden="true">
        <div class="cam-editor__gutter-lines" style={{ transform: shiftY() }}>
          <div class="cam-editor__band" style={{ top: bandTop() }} />
          <pre>{gutter()}</pre>
        </div>
      </div>
      <div class="cam-editor__stack">
        <div class="cam-editor__paint" aria-hidden="true">
          <div class="cam-editor__paint-lines" style={{ transform: shift() }}>
            <div class="cam-editor__band" style={{ top: bandTop() }} />
            <pre><Show when={colored()}><Painted lines={lines()} /></Show></pre>
          </div>
        </div>
        <textarea aria-label={t("cam.editor")} class="cam-editor__code" classList={{ "cam-editor__code--painted": colored() }}
          value={props.value} spellcheck={false} wrap="off" autocapitalize="off" autocomplete="off"
          onInput={(event) => edit(event.currentTarget)} onKeyDown={onKeyDown}
          onKeyUp={(event) => track(event.currentTarget)} onClick={(event) => track(event.currentTarget)}
          onSelect={(event) => track(event.currentTarget)}
          onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })} />
      </div>
    </div>
    <footer class="cam-editor__footer">
      <p class="panel-hint">
        <span class="cam-editor__cursor">Ln {position().line}, Col {position().column}</span>
        <Show when={summary().blocks === 0}> · {t("cam.importHint")}</Show>
      </p>
      <button type="button" class="panel-btn panel-btn--primary" title={`${t("cam.panel.editorHint")} (Ctrl/⌘ + Enter)`} disabled={summary().blocks === 0}
        onClick={() => props.onProcess()}><Play size={14} />{t("cam.process")}</button>
    </footer>
  </section>
}
