/**
 * Post-processor tab (spec 06-desktop-ui.md §3 tab "Post-Processor").
 *
 * Lets the user pick the controller dialect and emits G-code for the current
 * program. The output updates as the program changes, so the right-hand viewer
 * shows the same text the file would contain.
 */
import { For, createMemo, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { cam } from "@cadcamfun/core"
import { Card } from "../../components/ui/card.tsx"
import { toast } from "../../components/ui/toast.tsx"
import { t } from "../../i18n/index.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }
const hover = { scale: 1.02, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.98 }

export interface PostProcessorPanelProps {
  readonly controller: "gcode" | "grbl" | "fanuc"
  readonly program: cam.Program
  readonly onChangeController: (next: "gcode" | "grbl" | "fanuc") => void
  readonly onSave: (gcode: string) => void
}

const OPTIONS: ReadonlyArray<{ readonly id: "gcode" | "grbl" | "fanuc"; readonly label: string; readonly description: string }> = [
  { id: "gcode", label: "Generic G-code", description: "LinuxCNC-style generic output." },
  { id: "grbl", label: "GRBL", description: "For hobbyist Arduino controllers." },
  { id: "fanuc", label: "Fanuc", description: "Industrial Fanuc dialect with canned cycles." }
]

/** Map the workspace controller choice to the post-processor id the core expects. */
const toPostId = (controller: "gcode" | "grbl" | "fanuc"): "generic" | "grbl" | "fanuc" =>
  controller === "gcode" ? "generic" : controller

/** Pulls the G-code string out of the right post for the current program. */
const emitFor = (program: cam.Program, controller: "gcode" | "grbl" | "fanuc"): string => {
  const id = toPostId(controller)
  const post = cam.posts[id]
  if (post === undefined) return ""
  return post.emit(program)
}

export default function PostProcessorPanel(props: PostProcessorPanelProps): JSX.Element {
  const gcode = createMemo(() => emitFor(props.program, props.controller))
  const lineCount = createMemo(() =>
    gcode().split(/\r?\n/).filter((line) => line.trim().length > 0).length
  )

  const save = (): void => {
    const next = gcode()
    if (next.length === 0) {
      toast.error("Nothing to save: no toolpaths in the current program.")
      return
    }
    props.onSave(next)
    toast.success(t("cam.saved"))
  }

  return (
    <Motion.div class="h-full w-full flex flex-col" {...rise} transition={{ duration: 0.5 }}>
      <Card variant="default" class="flex-1 flex flex-col p-3">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">{t("cam.postTab")}</h3>
          <span class="text-xs text-gray-500 dark:text-gray-400">{lineCount()} lines</span>
        </div>

        <div class="grid grid-cols-3 gap-2 mb-3">
          <For each={OPTIONS}>
            {(option) => (
              <Motion.button
                class={`px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 text-left ${
                  props.controller === option.id
                    ? "bg-blue-600 text-white border-blue-600 shadow"
                    : "bg-white/60 dark:bg-gray-800/60 border-white/40 dark:border-gray-600/40 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700/80"
                }`}
                onClick={() => props.onChangeController(option.id)}
                hover={hover}
                press={press}
              >
                <div class="font-semibold">{option.label}</div>
                <div class="text-xs opacity-80">{option.description}</div>
              </Motion.button>
            )}
          </For>
        </div>

        <textarea
          class="form-textarea flex-1 font-mono text-xs leading-5"
          value={gcode()}
          readOnly
          spellcheck={false}
        />

        <div class="mt-2 flex gap-2">
          <Motion.button
            class="ui-btn ui-btn-primary"
            hover={{ scale: 1.02 }}
            press={{ scale: 0.97 }}
            onClick={save}
          >
            {t("cam.saveCode")}
          </Motion.button>
        </div>
      </Card>
    </Motion.div>
  )
}