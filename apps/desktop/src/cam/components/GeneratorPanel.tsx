/**
 * Operation picker + cut-depth controls (spec 06-desktop-ui.md §3 sidebar tab
 * "Generator").
 *
 * Five operations, two number fields and a list of feeds. The panel deliberately
 * stays light: the schema-driven form lives below the page (see `CamPage`)
 * because picking an operation may swap the schema.
 */
import { For, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Card } from "../../components/ui/card.tsx"
import { Field, TextInput } from "../../components/ui/field.tsx"
import { t } from "../../i18n/index.ts"
import { useCamStore } from "../store/camStore.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }
const hover = { scale: 1.04, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.96 }

export type OperationId = "profile" | "pocket" | "engrave" | "drill" | "face"

const OPERATIONS: ReadonlyArray<{ readonly id: OperationId; readonly label: string }> = [
  { id: "profile", label: t("cam.profile") },
  { id: "pocket", label: t("cam.pocket") },
  { id: "engrave", label: t("cam.engrave") },
  { id: "drill", label: "Drill" },
  { id: "face", label: "Face" }
]

const DEFAULTS: Readonly<Record<OperationId, { readonly stepDown: number; readonly feed: number; readonly plunge: number }>> = {
  profile: { stepDown: 3, feed: 1200, plunge: 400 },
  pocket: { stepDown: 2, feed: 1000, plunge: 350 },
  engrave: { stepDown: 0.5, feed: 800, plunge: 300 },
  drill: { stepDown: 5, feed: 200, plunge: 80 },
  face: { stepDown: 1, feed: 1500, plunge: 400 }
}

export interface GeneratorPanelProps {
  readonly stepDown?: number
  readonly feed?: number
  readonly plunge?: number
  readonly onChangeStepDown?: (stepDown: number) => void
  readonly onChangeFeed?: (feed: number) => void
  readonly onChangePlunge?: (plunge: number) => void
  readonly onGenerate?: () => void
}

export default function GeneratorPanel(props: GeneratorPanelProps): JSX.Element {
  const cam = useCamStore()
  const defaults = (): { readonly stepDown: number; readonly feed: number; readonly plunge: number } =>
    DEFAULTS[cam.operation]

  return (
    <Motion.div class="w-full" {...rise} transition={{ duration: 0.4 }}>
      <Card variant="default" delay={0.05} class="w-full p-4">
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{t("cam.generator")}</h3>

        <div>
          <span class="text-sm font-medium text-gray-700 dark:text-blue-400 mb-1 block">{t("cam.operation")}</span>
          <div class="grid grid-cols-2 gap-2">
            <For each={OPERATIONS}>
              {(op) => (
                <Motion.button
                  class={`px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                    cam.operation === op.id
                      ? "bg-blue-600 text-white border-blue-600 shadow"
                      : "bg-white/60 dark:bg-gray-800/60 border-white/40 dark:border-gray-600/40 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700/80"
                  }`}
                  onClick={() => cam.setOperation(op.id)}
                  hover={cam.operation === op.id ? hover : { scale: 1.02 }}
                  press={press}
                >
                  {op.label}
                </Motion.button>
              )}
            </For>
          </div>
        </div>

        <div class="mt-4 space-y-3">
          <Field label="Step-down (mm)">
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="0.1"
                min="0"
                value={String(props.stepDown ?? defaults().stepDown)}
                onInput={(event) => props.onChangeStepDown?.(Number(event.currentTarget.value))}
              />
            )}
          </Field>
          <Field label="Feed (mm/min)">
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="10"
                min="0"
                value={String(props.feed ?? defaults().feed)}
                onInput={(event) => props.onChangeFeed?.(Number(event.currentTarget.value))}
              />
            )}
          </Field>
          <Field label="Plunge (mm/min)">
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="10"
                min="0"
                value={String(props.plunge ?? defaults().plunge)}
                onInput={(event) => props.onChangePlunge?.(Number(event.currentTarget.value))}
              />
            )}
          </Field>
        </div>

        <Motion.button
          class="ui-btn ui-btn-primary w-full justify-center mt-4"
          onClick={() => props.onGenerate?.()}
          hover={{ scale: 1.02 }}
          press={{ scale: 0.97 }}
        >
          Generate toolpath
        </Motion.button>
      </Card>
    </Motion.div>
  )
}