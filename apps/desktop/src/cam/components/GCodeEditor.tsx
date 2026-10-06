/**
 * Plain G-code editor (spec 06-desktop-ui.md §3 tab "Editor G-Code").
 *
 * A `<textarea>` per the spec is acceptable for v6 — we surface the text and
 * the user edits it. The `PostProcessorPanel` is the place that turns an
 * edited blob back into a structured program; this component stays a text
 * surface.
 */
import { For, Show, createMemo, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Card } from "../../components/ui/card.tsx"
import { t } from "../../i18n/index.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

export interface GCodeEditorProps {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly onProcess: () => void
}

export default function GCodeEditor(props: GCodeEditorProps): JSX.Element {
  const lineCount = createMemo(() => {
    if (props.value.length === 0) return 0
    return props.value.split(/\r?\n/).filter((line) => line.trim().length > 0).length
  })

  return (
    <Motion.div class="h-full w-full flex flex-col" {...rise} transition={{ duration: 0.5 }}>
      <Card variant="default" class="flex-1 flex flex-col p-3">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">{t("cam.editor")}</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {lineCount()} {t("cam.lines", { count: lineCount() }).replace(`${lineCount()} `, "")}
          </span>
        </div>
        <textarea
          class="form-textarea flex-1 font-mono text-xs leading-5"
          value={props.value}
          spellcheck={false}
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
        <div class="mt-2 flex gap-2">
          <Motion.button
            class="ui-btn ui-btn-primary"
            hover={{ scale: 1.02 }}
            press={{ scale: 0.97 }}
            onClick={() => props.onProcess()}
          >
            {t("cam.process")}
          </Motion.button>
        </div>
        <Show when={lineCount() === 0}>
          <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("cam.importHint")}</p>
        </Show>
      </Card>
    </Motion.div>
  )
}