import { For, Show, type JSX } from "solid-js"
import { Package } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { predefinedMaterials } from "../../../cad/lib/predefinedLibraries.ts"
import { useRead } from "../../../../app/queries.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { INPUT, LABEL, Section } from "./ui.tsx"

const MATERIAL_NAMES: Readonly<Record<string, string>> = {
  aluminum: "Aluminum", steel: "Steel", wood: "Wood", plastic: "Plastic", brass: "Brass", titanium: "Titanium", composite: "Composite", other: "Other"
}

/** Library material names map onto the panel's material types by keyword (legacy rule). */
const materialTypeOf = (name: string): ToolpathSettings["material"] => {
  const lower = name.toLowerCase()
  for (const type of ["aluminum", "steel", "wood", "plastic", "brass", "titanium"] as const) if (lower.includes(type)) return type
  return "other"
}

/** "Material": type, its machining properties, the workpiece and the materials library. */
export function MaterialSection(): JSX.Element {
  const gen = useGeneratorStore()
  const job = useJob()
  const materials = useRead((client) => client.materials.list({ query: {} }))
  const properties = () => cam.generator.materialProperties[gen.settings.material]
  const userMaterials = () => (materials.data() ?? []) as ReadonlyArray<{ id: string; name: string }>

  const applyRecommended = (): void => {
    const property = properties()
    if (!property?.feedrateModifier || !property.speedModifier) return
    gen.patchSettings({
      feedrate: Math.round(1000 * property.feedrateModifier),
      plungerate: Math.round(1000 * property.feedrateModifier * 0.4),
      rpm: Math.round(10000 * property.speedModifier),
      coolant: ["Necessario", "Raccomandato", "Necessario ad alta pressione"].includes(property.coolant)
    })
    gen.flash(`Parameters optimized for ${gen.settings.material}`)
  }

  const fromLibrary = (value: string): void => {
    if (!value) return
    const predefined = predefinedMaterials.find((material) => material.name === value)
    const user = userMaterials().find((material) => material.id === value)
    const found = predefined ?? user
    if (!found) return
    gen.patchSettings({ material: materialTypeOf(found.name) })
    gen.flash(`Material "${found.name}" loaded from library`)
  }

  return (
    <Section id="material" delay={0.3} tone="green" icon={Package} title="Material" testId="material-section">
      <div>
        <label class={LABEL}>Material Type</label>
        <select class={INPUT} value={gen.settings.material} onChange={(event) => gen.updateSettings("material", event.currentTarget.value as ToolpathSettings["material"])}>
          <option value="aluminum">Aluminum</option>
          <option value="steel">Steel</option>
          <option value="wood">Wood</option>
          <option value="plastic">Plastic</option>
          <option value="brass">Brass</option>
          <option value="titanium">Titanium</option>
          <option value="composite">Composite</option>
          <option value="other">Other</option>
        </select>
      </div>

      <Show when={gen.settings.material && properties()}>
        {(property) => (
          <div class="p-3 bg-blue-50 rounded-md">
            <h4 class="text-xs font-medium text-blue-800 mb-2">{MATERIAL_NAMES[gen.settings.material] ?? "Other"} Properties</h4>
            <div class="grid gap-x-4 gap-y-2 text-xs">
              <div class="flex justify-between"><span class="text-gray-600">Density:</span><span class="font-medium text-blue-700">{property().density}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Hardness:</span><span class="font-medium text-blue-700">{property().hardness}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Thermal Behavior:</span><span class="font-medium text-blue-700">{property().thermalBehavior}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Chip Type:</span><span class="font-medium text-blue-700">{property().chipType}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">Coolant:</span><span class="font-medium text-blue-700">{property().coolant}</span></div>
              <Show when={property().recommendedToolCoating}>
                <div class="flex justify-between"><span class="text-gray-600">Tool Coating:</span><span class="font-medium text-blue-700">{property().recommendedToolCoating}</span></div>
              </Show>
            </div>
            <button type="button" class="mt-3 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200" onClick={applyRecommended}>Apply recommended parameters</button>
          </div>
        )}
      </Show>

      <div class="mt-2 p-3 bg-blue-50 rounded-md">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-blue-800">Workpiece Information</span>
          <button type="button" class="text-xs text-blue-600 hover:text-blue-800" onClick={() => gen.flash("Workpiece thickness is determined by the geometry selected in the Operations section", 4000)}>Info</button>
        </div>
        <div class="mt-1 text-xs text-blue-600">{job.stock().width} x {job.stock().height} x {job.stock().depth} mm ({job.stock().material ?? gen.settings.material})</div>
        <div class="mt-1 text-xs text-gray-500 italic">Note: Workpiece thickness is determined by the geometry selected</div>
      </div>

      <div class="mt-2 flex flex-col pt-2 border-t border-gray-200">
        <label class={LABEL}>Select from Materials Library</label>
        <select class={INPUT} onChange={(event) => fromLibrary(event.currentTarget.value)}>
          <option value="">Select a material</option>
          <optgroup label="Predefined Materials">
            <For each={predefinedMaterials}>{(material, index) => <option value={material.name || `material-${index()}`}>{material.name}</option>}</For>
          </optgroup>
          <Show when={userMaterials().length > 0}>
            <optgroup label="Local Materials">
              <For each={userMaterials()}>{(material) => <option value={material.id}>{material.name}</option>}</For>
            </optgroup>
          </Show>
        </select>
      </div>
    </Section>
  )
}
