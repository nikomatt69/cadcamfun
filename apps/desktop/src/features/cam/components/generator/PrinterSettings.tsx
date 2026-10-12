import { Show, type JSX } from "solid-js"
import { Info } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import type { CadElement } from "../../lib/job.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { INPUT, LABEL, NumberField } from "./ui.tsx"

/** "3D Printing Settings": layer, nozzle, infill, shells, supports, temperatures and the estimates for the selected element. */
export function PrinterSettings(props: { readonly element: CadElement | undefined }): JSX.Element {
  const gen = useGeneratorStore()
  const stats = () => {
    const element = props.element
    if (!element) return undefined
    const s = gen.settings
    const p = gen.printer
    return {
      time: cam.generator.estimatePrintTime(element, s, { infillDensity: p.infillDensity, supportType: p.supportType, layerHeight: s.layerHeight || 0.2 }),
      material: cam.generator.estimateMaterialUsage(element, { infillDensity: p.infillDensity, shellCount: p.shellCount, supportType: p.supportType, material: s.material })
    }
  }
  return (
    <div class="space-y-4">
      <div class="p-3 bg-blue-50 rounded-md">
        <h3 class="text-sm font-medium text-blue-700 mb-2">3D Printing Settings</h3>
        <p class="text-xs text-blue-600">Configure how your CAD model will be printed with these specialized 3D printing parameters.</p>
      </div>

      <div class="space-y-3">
        <div>
          <label class={LABEL}>Layer Height (mm)</label>
          <div class="flex items-center">
            <NumberField min="0.05" max="0.4" step="0.05" value={gen.settings.layerHeight} onValue={(value) => gen.updateSettings("layerHeight", value)} />
            <div class="ml-2 tooltip" data-tooltip="Layer height determines the resolution of your print. Lower values produce finer details but increase print time.">
              <Info size={18} class="text-gray-500" />
            </div>
          </div>
          <div class="flex justify-between mt-1 text-xs text-gray-500"><span>Fine (0.1mm)</span><span>Standard (0.2mm)</span><span>Draft (0.3mm)</span></div>
        </div>

        <div>
          <label class={LABEL}>Nozzle Diameter (mm)</label>
          <select class={INPUT} value={String(gen.settings.nozzleDiameter)} onChange={(event) => gen.updateSettings("nozzleDiameter", parseFloat(event.currentTarget.value))}>
            <option value="0.2">0.2mm (Ultra Fine)</option>
            <option value="0.3">0.3mm (Fine)</option>
            <option value="0.4">0.4mm (Standard)</option>
            <option value="0.6">0.6mm (Fast)</option>
            <option value="0.8">0.8mm (Draft/Rapid)</option>
          </select>
        </div>

        <div>
          <label class={LABEL}>Print Resolution</label>
          <select class={INPUT} value={gen.printer.printResolution} onChange={(event) => gen.setPrinter({ printResolution: event.currentTarget.value as "standard" | "high" | "low" })}>
            <option value="high">High Quality (Slower)</option>
            <option value="standard">Standard Quality</option>
            <option value="low">Draft Quality (Faster)</option>
          </select>
        </div>

        <div>
          <label class={LABEL}>Print Speed (mm/s)</label>
          <NumberField min="20" max="150" value={gen.settings.printSpeed} onValue={(value) => gen.updateSettings("printSpeed", value)} />
          <div class="flex justify-between mt-1 text-xs text-gray-500"><span>Slow (30mm/s)</span><span>Normal (60mm/s)</span><span>Fast (100mm/s)</span></div>
        </div>
      </div>

      <div class="pt-3 border-t border-gray-200">
        <div class="space-y-3">
          <div>
            <label class={LABEL}>Infill Density (%)</label>
            <input type="range" min="5" max="90" step="5" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" value={gen.printer.infillDensity} onInput={(event) => gen.setPrinter({ infillDensity: parseInt(event.currentTarget.value) })} />
            <div class="flex justify-between mt-1">
              <span class="text-xs text-gray-500">Hollow (5%)</span>
              <span class="text-sm font-medium">{gen.printer.infillDensity}%</span>
              <span class="text-xs text-gray-500">Solid (90%)</span>
            </div>
          </div>
          <div>
            <label class={LABEL}>Infill Pattern</label>
            <select class={INPUT} value={gen.printer.infillPattern} onChange={(event) => gen.setPrinter({ infillPattern: event.currentTarget.value as "grid" | "lines" | "triangles" | "honeycomb" })}>
              <option value="grid">Grid (Standard)</option>
              <option value="lines">Lines (Fast)</option>
              <option value="triangles">Triangles (Strong)</option>
              <option value="honeycomb">Honeycomb (Optimal)</option>
            </select>
          </div>
          <div>
            <label class={LABEL}>Shell Count (Perimeters)</label>
            <select class={INPUT} value={String(gen.printer.shellCount)} onChange={(event) => gen.setPrinter({ shellCount: parseInt(event.currentTarget.value) })}>
              <option value="1">1 Shell (Fastest)</option>
              <option value="2">2 Shells (Standard)</option>
              <option value="3">3 Shells (Strong)</option>
              <option value="4">4 Shells (Extra Strong)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-gray-200">
        <div class="space-y-3">
          <div>
            <label class={LABEL}>Support Structure</label>
            <select class={INPUT} value={gen.printer.supportType} onChange={(event) => gen.setPrinter({ supportType: event.currentTarget.value as "none" | "minimal" | "full" })}>
              <option value="none">None (No Overhangs)</option>
              <option value="minimal">Minimal (Less Material)</option>
              <option value="full">Full (Best Quality)</option>
            </select>
          </div>
          <div>
            <label class={LABEL}>Print Orientation</label>
            <select class={INPUT} value={gen.printer.printOrientation} onChange={(event) => gen.setPrinter({ printOrientation: event.currentTarget.value as "original" | "auto-optimal" })}>
              <option value="original">Original (As Designed)</option>
              <option value="auto-optimal">Auto-Optimal (Best Orientation)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-gray-200">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class={LABEL}>Extruder Temperature (°C)</label>
            <NumberField min="160" max="280" int accept={() => true} value={gen.settings.printTemperature} onValue={(value) => gen.updateSettings("printTemperature", value)} />
          </div>
          <div>
            <label class={LABEL}>Bed Temperature (°C)</label>
            <NumberField min="20" max="120" int accept={() => true} value={gen.settings.bedTemperature} onValue={(value) => gen.updateSettings("bedTemperature", value)} />
          </div>
        </div>
      </div>

      <Show when={stats()}>
        {(printStats) => (
          <div class="mt-3 p-3 bg-green-50 rounded-md">
            <h3 class="text-sm font-medium text-green-700 mb-2">Print Statistics</h3>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col">
                <span class="text-xs text-gray-500">Print Time</span>
                <span class="text-sm font-medium text-green-600">
                  {printStats().time > 60 ? `${Math.floor(printStats().time / 60)}h ${printStats().time % 60}m` : `${printStats().time}m`}
                </span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-gray-500">Material Usage</span>
                <span class="text-sm font-medium text-green-600">{printStats().material}g</span>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
