import { For, Show, batch, createMemo, createUniqueId, type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import { useElementsStore } from "../../../cad/store/elementsStore.ts"
import { useSelectionStore } from "../../../cad/store/selectorStore.ts"
import { useJob } from "../../hooks/useJob.ts"
import { elementName, isMachinable } from "../../lib/explorer.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { INPUT, LABEL } from "./ui.tsx"

/** Pick the actual CAD record; both selection stores must agree on what the generator machines. */
export function CadElementPicker(): JSX.Element {
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const gen = useGeneratorStore()
  const job = useJob()
  const id = createUniqueId()
  const available = createMemo(() => job.elements().filter(isMachinable))

  return (
    <div class="mb-3" data-testid="generator-cad-picker">
      <label class={LABEL} for={id}>{t("cam.generator.cadElement")}</label>
      <select
        id={id}
        class={INPUT}
        value={String(job.element()?.["id"] ?? "")}
        onChange={(event) => {
          const element = available().find((candidate) => String(candidate["id"]) === event.currentTarget.value)
          // Multi-selection has priority in useJob, so replacing only selectedElement would keep the old parts.
          batch(() => {
            selection.selectMultiple(element ? [String(element["id"])] : [])
            elements.selectElement(element ? String(element["id"]) : null)
            gen.setGeometryType("selected", element)
          })
        }}
      >
        <option value="">{t("cam.generator.chooseCadElement")}</option>
        <For each={available()}>{(element) => (
          <option value={String(element["id"])}>
            {elementName(element)} · {String(element["type"])} · {String(element["id"])}
          </option>
        )}</For>
      </select>
      <Show when={available().length > 1}>
        <details class="mt-2" data-testid="generator-cad-multi" open={job.selection().length > 1}>
          <summary class="text-xs text-gray-600 cursor-pointer">Machine several parts ({job.selection().length} selected)</summary>
          <div class="mt-1 max-h-40 overflow-auto space-y-1">
            <For each={available()}>{(element) => {
              const key = String(element["id"])
              const checked = () => job.selection().some((part) => String(part["id"]) === key)
              return (
                <label class="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={checked()} onChange={(event) => {
                    const ids = job.selection().map((part) => String(part["id"])).filter((other) => other !== key)
                    const next = event.currentTarget.checked ? [...ids, key] : ids
                    batch(() => {
                      selection.selectMultiple(next)
                      elements.selectElement(next[0] ?? null)
                      gen.setGeometryType("selected", available().find((part) => String(part["id"]) === next[0]))
                    })
                  }} />
                  {elementName(element)} · {String(element["type"])}
                </label>
              )
            }}</For>
          </div>
        </details>
      </Show>
      <Show when={available().length === 0}>
        <p class="mt-2 text-xs text-gray-600 dark:text-gray-400">{t("cam.generator.noCadElements")}</p>
      </Show>
    </div>
  )
}
