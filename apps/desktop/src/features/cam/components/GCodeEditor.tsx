/** The editable NC text uses the same panel vocabulary as the generator; processing still belongs to the page. */
import { Show, createMemo, type JSX } from "solid-js"
import { Code, Play } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { Badge, Stat } from "../../../shared/components/panel/ui.tsx"
import { gcodeSummary } from "../lib/gcode-summary.ts"
import "../../../styles/cam-panels.css"

export interface GCodeEditorProps {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly onProcess: () => void
}

export default function GCodeEditor(props: GCodeEditorProps): JSX.Element {
  const summary = createMemo(() => gcodeSummary(props.value))
  return <section class="panel cam-editor cam-central-panel" data-testid="gcode-editor-panel">
    <header class="panel-header">
      <div class="cam-panel-heading"><Code size={15} /><h3 class="panel-header__title">{t("cam.editor")}</h3></div>
      <Badge>{t("cam.lines", { count: summary().lines })}</Badge>
    </header>
    <div class="cam-program-summary" data-testid="editor-summary">
      <Stat label={t("cam.panel.blocks")} value={String(summary().blocks)} />
      <Stat label={t("cam.panel.tools")} value={summary().tools.length ? summary().tools.map(n => `T${n}`).join(" · ") : t("cam.panel.notSpecified")} />
      <Stat label={t("cam.panel.offsets")} value={summary().offsets.join(" · ") || t("cam.panel.notSpecified")} />
    </div>
    <textarea aria-label={t("cam.editor")} class="cam-editor__code" value={props.value} spellcheck={false}
      autocapitalize="off" autocomplete="off" onInput={(event) => props.onChange(event.currentTarget.value)} />
    <footer class="cam-editor__footer">
      <p class="panel-hint"><Show when={summary().blocks > 0} fallback={t("cam.importHint")}>{t("cam.panel.editorHint")}</Show></p>
      <button type="button" class="panel-btn panel-btn--primary" disabled={summary().blocks === 0} onClick={() => props.onProcess()}><Play size={14} />{t("cam.process")}</button>
    </footer>
  </section>
}
