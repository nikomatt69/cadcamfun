/**
 * Stock and material controls (spec 06-desktop-ui.md §3 sidebar tab "Workpiece").
 *
 * Three numeric inputs (width / height / depth) and a material selector. The
 * numbers flow into the CAM store, so every other panel that reads the
 * workpiece reflects the change automatically.
 */
import { type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Card } from "../../../shared/ui/card.tsx"
import { Field, TextInput } from "../../../shared/ui/field.tsx"
import { t } from "../../../i18n/index.ts"
import type { Workpiece } from "../store/camStore.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

export interface WorkpieceSetupProps {
  readonly workpiece: Workpiece
  readonly material: string
  readonly onChangeWorkpiece: (next: Workpiece) => void
  readonly onChangeMaterial: (next: string) => void
}

const MATERIALS: ReadonlyArray<string> = ["aluminum", "steel", "brass", "wood", "plastic", "mdf", "plywood"]

export default function WorkpieceSetup(props: WorkpieceSetupProps): JSX.Element {
  const update = (key: keyof Workpiece, raw: string): void => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    props.onChangeWorkpiece({ ...props.workpiece, [key]: parsed })
  }

  return (
    <Motion.div class="w-full" {...rise} transition={{ duration: 0.4 }}>
      <Card variant="default" delay={0.05} class="w-full p-4">
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{t("cam.workpiece")}</h3>
        <div class="space-y-3">
          <Field label={t("cam.stockX")}>
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="0.1"
                min="0"
                value={String(props.workpiece.x)}
                onInput={(event) => update("x", event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={t("cam.stockY")}>
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="0.1"
                min="0"
                value={String(props.workpiece.y)}
                onInput={(event) => update("y", event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={t("cam.stockZ")}>
            {(ids) => (
              <TextInput
                id={ids.id}
                type="number"
                step="0.1"
                min="0"
                value={String(props.workpiece.z)}
                onInput={(event) => update("z", event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={t("cam.material")}>
            {(ids) => (
              <select
                id={ids.id}
                class="ui-select"
                value={props.material}
                onChange={(event) => props.onChangeMaterial(event.currentTarget.value)}
              >
                <option value="">Select…</option>
                {MATERIALS.map((m) => (
                  <option value={m}>{m}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("cam.unitsNotice")}</p>
      </Card>
    </Motion.div>
  )
}