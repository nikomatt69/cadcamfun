import { For, Show, createSignal, type JSX } from "solid-js"
import { Package } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { predefinedMaterials } from "../../../cad/lib/predefinedLibraries.ts"
import { CuttingReferenceView } from "./EvidenceSection.tsx"
import { useRead } from "../../../../app/queries.ts"
import { useJob } from "../../hooks/useJob.ts"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { Field, INPUT, LABEL, Note, Section } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

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

  // The CAM kernel's grade within the panel's family, the cutter's material and the machine whose limits apply.
  const [grade, setGrade] = createSignal<string | undefined>(undefined)
  const [toolMaterial, setToolMaterial] = createSignal<"carbide" | "hss">("carbide")
  const [machineId, setMachineId] = createSignal(cam.kernel.DEFAULT_MACHINE.id)
  const familyGrade = () => cam.kernel.findMaterial(cam.kernel.LEGACY_MATERIAL_GRADE[gen.settings.material] ?? gen.settings.material)
  const currentGrade = () => (grade() !== undefined ? cam.kernel.findMaterial(grade()!) : undefined) ?? familyGrade()
  /** Grades of the same ISO group as the panel's family (all grades for "other"). */
  const grades = () => {
    const family = familyGrade()
    return gen.settings.material === "other" || family === undefined ? cam.kernel.MATERIALS : cam.kernel.MATERIALS.filter((m) => m.iso === family.iso || m.family === family.family)
  }
  const recommendation = () => {
    const machine = cam.kernel.findMachine(machineId()) ?? cam.kernel.DEFAULT_MACHINE
    return cam.kernel.recommendForSettings(gen.settings, { ...(currentGrade() !== undefined ? { grade: currentGrade()!.id } : {}), toolMaterial: toolMaterial(), machine: machine.limits })
  }

  const applyRecommended = (): void => {
    const r = recommendation()
    if (r === undefined) { gen.flash("Cutting data is computed for milling operations"); return }
    gen.patchSettings(r.patch)
    const d = r.data
    const notes = [...d.warnings, ...d.exceeded].slice(0, 2).join(" · ")
    gen.flash(`${r.material.name}: ${d.rpm} rpm, F${d.feed}, ap ${d.ap} mm, ae ${d.ae} mm (Vc ${Math.round(d.vc)} m/min, fz ${d.fz} mm)${notes ? ` — ${notes}` : ""}`, 6000)
  }

  const fromLibrary = (value: string): void => {
    if (!value) return
    const predefined = predefinedMaterials.find((material) => material.name === value)
    const user = userMaterials().find((material) => material.id === value)
    const found = predefined ?? user
    if (!found) return
    gen.patchSettings({ material: materialTypeOf(found.name) })
    const known = cam.kernel.findMaterial(found.name)
    if (known !== undefined) setGrade(known.id)
    gen.flash(`Material "${found.name}" loaded from library`)
  }

  const filament = () => cam.print.FILAMENTS.find((f) => f.id === gen.printer.filament) ?? cam.print.FILAMENTS[0]!

  return (
    <Show when={gen.settings.machineType === "3dprinter"} fallback={(
    <Section id="material" icon={Package} title={t("cam.material")} summary={MATERIAL_NAMES[gen.settings.material]} testId="material-section">
      <div>
        <label class={LABEL}>{t("cam.gen.mat.type")}</label>
        <select class={INPUT} value={gen.settings.material} onChange={(event) => gen.updateSettings("material", event.currentTarget.value as ToolpathSettings["material"])}>
          <option value="aluminum">{t("cam.explorer.materialName.aluminum")}</option>
          <option value="steel">{t("cam.gen.mat.steel")}</option>
          <option value="wood">{t("cam.gen.mat.wood")}</option>
          <option value="plastic">{t("cam.gen.mat.plastic")}</option>
          <option value="brass">{t("cam.gen.mat.brass")}</option>
          <option value="titanium">{t("cam.gen.mat.titanium")}</option>
          <option value="composite">{t("cam.gen.mat.composite")}</option>
          <option value="other">{t("cam.gen.mat.other")}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 gap-2" data-testid="cutting-data-panel">
        <div>
          <label class={LABEL}>{t("cam.gen.mat.grade")}</label>
          <select class={INPUT} data-testid="material-grade" value={currentGrade()?.id ?? ""} onChange={(event) => setGrade(event.currentTarget.value || undefined)}>
            <For each={grades()}>{(m) => <option value={m.id}>{m.name} (ISO {m.iso})</option>}</For>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class={LABEL}>{t("cam.gen.mat.toolMaterial")}</label>
            <select class={INPUT} value={toolMaterial()} onChange={(event) => setToolMaterial(event.currentTarget.value as "carbide" | "hss")}>
              <option value="carbide">{t("cam.gen.mat.carbide")}</option>
              <option value="hss">HSS</option>
            </select>
          </div>
          <div>
            <label class={LABEL}>{t("cam.gen.mat.machineLimits")}</label>
            <select class={INPUT} value={machineId()} onChange={(event) => setMachineId(event.currentTarget.value)}>
              <For each={cam.kernel.MACHINES}>{(m) => <option value={m.id}>{m.name}</option>}</For>
            </select>
          </div>
        </div>
        <Show when={recommendation()}>
          {(r) => (
            <div class="p-2 rounded-md bg-emerald-50 text-xs text-emerald-900 space-y-0.5" data-testid="cutting-data-preview">
              <div class="font-medium">Cutting data for {r().material.name} · Ø{gen.settings.toolDiameter} {gen.settings.flutes}{t("cam.status.feed")} {toolMaterial() === "hss" ? "HSS" : "carbide"}</div>
              <div>{r().data.rpm} rpm · F {r().data.feed} mm/min · plunge {r().data.plungeFeed} · Vc {Math.round(r().data.vc)} m/min · fz {r().data.fz} {t("cad.millimeters")}</div>
              <div>ap {r().data.ap} mm · ae {r().data.ae} mm · {r().data.coolant} · {r().data.powerKw} kW · deflection {r().data.deflectionMm} {t("cad.millimeters")}</div>
              <For each={[...r().data.exceeded, ...r().data.warnings].slice(0, 3)}>{(w) => <div class="text-amber-700">{w}</div>}</For>
              <CuttingReferenceView reference={r().data.reference} />
            </div>
          )}
        </Show>
      </div>

      <Show when={gen.settings.material && properties()}>
        {(property) => (
          <div class="p-3 bg-blue-50 rounded-md">
            <h4 class="text-xs font-medium text-blue-800 mb-2">{MATERIAL_NAMES[gen.settings.material] ?? t("cam.gen.mat.other")} {t("cam.properties")}</h4>
            <div class="grid gap-x-4 gap-y-2 text-xs">
              <div class="flex justify-between"><span class="text-gray-600">{t("cam.gen.mat.density")}</span><span class="font-medium text-blue-700">{property().density}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">{t("cam.explorer.hardness")}</span><span class="font-medium text-blue-700">{property().hardness}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">{t("cam.gen.mat.thermal")}</span><span class="font-medium text-blue-700">{property().thermalBehavior}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">{t("cam.gen.mat.chipType")}</span><span class="font-medium text-blue-700">{property().chipType}</span></div>
              <div class="flex justify-between"><span class="text-gray-600">{t("cam.gen.mat.coolant")}</span><span class="font-medium text-blue-700">{property().coolant}</span></div>
              <Show when={property().recommendedToolCoating}>
                <div class="flex justify-between"><span class="text-gray-600">{t("cam.gen.mat.toolCoating")}</span><span class="font-medium text-blue-700">{property().recommendedToolCoating}</span></div>
              </Show>
            </div>
            <button type="button" class="mt-3 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200" onClick={applyRecommended}>{t("cam.gen.mat.applyRecommended")}</button>
          </div>
        )}
      </Show>

      <div class="mt-2 p-3 bg-blue-50 rounded-md">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-blue-800">{t("cam.gen.mat.workpieceInfo")}</span>
          <button type="button" class="text-xs text-blue-600 hover:text-blue-800" onClick={() => gen.flash("Workpiece thickness is determined by the geometry selected in the Operations section", 4000)}>{t("cam.gen.mat.info")}</button>
        </div>
        <div class="mt-1 text-xs text-blue-600">{job.stock().width} x {job.stock().height} x {job.stock().depth} mm ({job.stock().material ?? gen.settings.material})</div>
        <div class="mt-1 text-xs text-gray-500 italic">{t("cam.gen.mat.thicknessNote")}</div>
      </div>

      <div class="mt-2 flex flex-col pt-2 border-t border-gray-200">
        <label class={LABEL}>{t("cam.gen.mat.fromLibrary")}</label>
        <select class={INPUT} onChange={(event) => fromLibrary(event.currentTarget.value)}>
          <option value="">{t("cam.gen.mat.selectOne")}</option>
          <optgroup label={t("cam.gen.mat.predefined")}>
            <For each={predefinedMaterials}>{(material, index) => <option value={material.name || `material-${index()}`}>{material.name}</option>}</For>
          </optgroup>
          <Show when={userMaterials().length > 0}>
            <optgroup label={t("cam.gen.mat.local")}>
              <For each={userMaterials()}>{(material) => <option value={material.id}>{material.name}</option>}</For>
            </optgroup>
          </Show>
        </select>
      </div>
    </Section>
    )}>
      <Section id="material" icon={Package} title={t("cam.gen.pp.filament")} summary={filament().name} testId="material-section">
        <Field label={t("cam.gen.pp.filament")} for="filament-grade">
          <select id="filament-grade" class={INPUT} value={gen.printer.filament} onChange={(event) => {
            const grade = cam.print.FILAMENTS.find((f) => f.id === event.currentTarget.value)
            gen.setPrinter({ filament: event.currentTarget.value as typeof gen.printer.filament, ...(grade ? { fanSpeed: grade.fan } : {}) })
            // The grade brings the temperatures it prints at; they stay editable in the print profile.
            if (grade) gen.patchSettings({ printTemperature: grade.nozzleTemperature, bedTemperature: grade.bedTemperature })
          }}>
            <For each={cam.print.FILAMENTS}>{(f) => <option value={f.id}>{f.name}</option>}</For>
          </select>
        </Field>
        <dl class="panel-kv" data-testid="filament-properties">
          <dt>{t("library.material.density")}</dt><dd>{filament().densityGcm3} g/cm3</dd>
          <dt>{t("cam.gen.pp.nozzle")}</dt><dd>{filament().nozzleTemperature} deg C</dd>
          <dt>{t("cam.gen.pp.bed")}</dt><dd>{filament().bedTemperature} deg C</dd>
          <dt>{t("cam.gen.mat.partCooling")}</dt><dd>{filament().fan} %</dd>
          <dt>{t("cam.gen.mat.meltRate")}</dt><dd>{filament().maxVolumetricFlow} mm3/s</dd>
        </dl>
        <Show when={filament().notes}><Note kind="warn">{filament().notes}</Note></Show>
        <button type="button" class="panel-btn" onClick={() => {
          gen.patchSettings({ printTemperature: filament().nozzleTemperature, bedTemperature: filament().bedTemperature })
          gen.setPrinter({ fanSpeed: filament().fan })
          gen.flash(`${filament().name}: nozzle ${filament().nozzleTemperature} deg C, bed ${filament().bedTemperature} deg C`)
        }}>{t("cam.gen.mat.applyTemps")}</button>
      </Section>
    </Show>
  )
}
