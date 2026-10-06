import { For, Show } from "solid-js"
import { t } from "../i18n/index.ts"

export const libraryObject = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}

export function LibraryFields(props: { tab: "materials" | "tools" | "machines" | "components"; details: string; onChange: (value: string) => void }) {
  const data = () => { try { return libraryObject(JSON.parse(props.details)) } catch { return {} } }
  const change = (key: string, value: unknown) => props.onChange(JSON.stringify({ ...data(), [key]: value }, null, 2))
  return <div class="grid gap-4 sm:grid-cols-2">
    <Show when={props.tab === "materials"}>
      <For each={["density", "costPerUnit"] as const}>{(key) => <label class="form-label">{t(key === "density" ? "library.density" : "library.cost")}<input class="form-input" type="number" min="0" step="any" value={Number(data()[key] ?? 0)} onInput={(e) => { if (Number.isFinite(e.currentTarget.valueAsNumber)) change(key, e.currentTarget.valueAsNumber) }} /></label>}</For>
      <label class="form-label">{t("library.color")}<input class="h-10 w-full rounded border border-gray-300" type="color" value={String(data()["color"] ?? "#cccccc")} onInput={(e) => change("color", e.currentTarget.value)} /></label>
    </Show>
    <Show when={props.tab === "tools"}>
      <label class="form-label">{t("library.type")}<input class="form-input" required value={String(data()["type"] ?? "endmill")} onInput={(e) => change("type", e.currentTarget.value)} /></label>
      <label class="form-label">{t("library.material")}<input class="form-input" required value={String(data()["material"] ?? "carbide")} onInput={(e) => change("material", e.currentTarget.value)} /></label>
      <For each={["diameter", "numberOfFlutes", "maxRPM"] as const}>{(key) => <label class="form-label">{t(key === "diameter" ? "library.diameter" : key === "numberOfFlutes" ? "library.flutes" : "library.rpm")}<input class="form-input" type="number" min="0.001" step={key === "diameter" ? "any" : "1"} value={Number(data()[key] ?? (key === "diameter" ? 6 : key === "numberOfFlutes" ? 3 : 18000))} onInput={(e) => { if (Number.isFinite(e.currentTarget.valueAsNumber)) change(key, e.currentTarget.valueAsNumber) }} /></label>}</For>
    </Show>
    <Show when={props.tab === "machines" || props.tab === "components"}><label class="form-label">{t("library.type")}<input class="form-input" required value={String(data()["type"] ?? (props.tab === "machines" ? "mill" : "mechanical"))} onInput={(e) => change("type", e.currentTarget.value)} /></label></Show>
  </div>
}
