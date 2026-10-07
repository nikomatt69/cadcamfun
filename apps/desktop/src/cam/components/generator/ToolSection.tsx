import { For, Match, Show, Switch, type JSX } from "solid-js"
import { Upload, Wrench } from "lucide-solid"
import { predefinedTools } from "../../../cad/lib/predefinedLibraries.ts"
import { useRead } from "../../../app/queries.ts"
import { useGeneratorStore, type LibraryTool, type ToolpathSettings } from "../../store/generatorStore.ts"
import { CHECKBOX, INPUT, LABEL, NumberField, Section } from "./ui.tsx"

const MILL_TYPES = ["endmill", "ballnose", "drill", "vbit", "chamfer", "threadmill", "reamer"]
const LATHE_TYPES = ["turning", "facing", "boring", "threading", "grooving", "parting"]

/** Tool sketch drawn in the tool card (legacy SVG, one per kind). */
function ToolSketch(): JSX.Element {
  const gen = useGeneratorStore()
  const machine = () => gen.settings.machineType
  const type = () => gen.settings.toolType
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <Show when={machine() === "mill" && type() === "endmill"}>
        <g><rect x="15" y="5" width="10" height="30" fill="#9CA3AF" /><rect x="17" y="5" width="6" height="30" fill="#D1D5DB" /><rect x="15" y="3" width="10" height="2" fill="#6B7280" /></g>
      </Show>
      <Show when={machine() === "mill" && type() === "ballnose"}>
        <g><rect x="15" y="5" width="10" height="25" fill="#9CA3AF" /><rect x="17" y="5" width="6" height="25" fill="#D1D5DB" /><ellipse cx="20" cy="30" rx="5" ry="5" fill="#9CA3AF" /><rect x="15" y="3" width="10" height="2" fill="#6B7280" /></g>
      </Show>
      <Show when={machine() === "mill" && type() === "drill"}>
        <g><rect x="15" y="5" width="10" height="25" fill="#9CA3AF" /><rect x="17" y="5" width="6" height="25" fill="#D1D5DB" /><polygon points="20,35 15,30 25,30" fill="#9CA3AF" /><rect x="15" y="3" width="10" height="2" fill="#6B7280" /></g>
      </Show>
      <Show when={machine() === "lathe"}>
        <g><rect x="10" y="15" width="20" height="10" fill="#9CA3AF" /><polygon points="30,15 35,10 35,20 30,25" fill="#6B7280" /><rect x="8" y="15" width="2" height="10" fill="#4B5563" /></g>
      </Show>
      <Show when={machine() === "3dprinter"}>
        <g><rect x="15" y="5" width="10" height="15" fill="#9CA3AF" /><polygon points="25,20 15,20 18,35 22,35" fill="#6B7280" /><circle cx="20" cy="35" r="1" fill="#4B5563" /></g>
      </Show>
    </svg>
  )
}

const toolTitle = (machine: string, type: string): string => {
  if (machine === "mill") return type === "endmill" ? "Endmill" : type === "ballnose" ? "Ballnose" : type === "drill" ? "Drill" : type === "vbit" ? "V-bit" : "Special tool"
  if (machine === "lathe") return type === "turning" ? "Turning" : type === "facing" ? "Facing" : type === "boring" ? "Boring" : "Threadmill"
  return "3D printer tool"
}

/** "Tool": type, the tool card, diameter / flutes / rpm / coolant and the tools library. */
export function ToolSection(): JSX.Element {
  const gen = useGeneratorStore()
  const tools = useRead((client) => client.tools.list({ query: {} }))
  const machine = () => gen.settings.machineType
  const userTools = () => (tools.data() ?? []) as ReadonlyArray<{ id: string; name: string; type: string; diameter: number; material?: string; numberOfFlutes?: number | null; maxRPM?: number | null }>
  const fits = (type: string): boolean => machine() === "mill" ? MILL_TYPES.includes(type) : machine() === "lathe" ? LATHE_TYPES.includes(type) : true
  const select = (event: Event & { currentTarget: HTMLSelectElement }): void => gen.updateSettings("toolType", event.currentTarget.value as ToolpathSettings["toolType"])
  const pick = (value: string): void => {
    if (!value) return
    const predefined = predefinedTools.find((tool) => tool.name === value)
    const user = userTools().find((tool) => tool.id === value)
    if (predefined) gen.selectLibraryTool({ ...predefined, numberOfFlutes: predefined.numberOfFlutes ?? undefined, maxRPM: predefined.maxRPM ?? undefined } as LibraryTool)
    else if (user) gen.selectLibraryTool({ ...user, numberOfFlutes: user.numberOfFlutes ?? undefined, maxRPM: user.maxRPM ?? undefined } as LibraryTool)
  }
  const upload = (): void => {
    if (machine() === "mill") gen.patchSettings({ toolType: "endmill", toolDiameter: 6, flutes: 4, rpm: 12000 })
    else if (machine() === "lathe") gen.patchSettings({ toolType: "turning", toolDiameter: 12, rpm: 1500 })
    else gen.patchSettings({ toolType: "standard", nozzleDiameter: 0.4 })
    gen.flash("Utensile caricato dalla libreria!")
  }
  return (
    <Section id="tool" delay={0.35} tone="indigo" icon={Wrench} title="Tool" testId="tool-section">
      <div>
        <label class={LABEL}>Tool Type</label>
        <Switch>
          <Match when={machine() === "mill"}>
            <select class={INPUT} value={gen.settings.toolType} onChange={select}>
              <option value="endmill">Endmill</option><option value="ballnose">Ballnose</option><option value="drill">Drill</option><option value="vbit">V-bit</option>
              <option value="chamfer">Chamfer</option><option value="threadmill">Threadmill</option><option value="reamer">Reamer</option>
              <option value="probe">Touch probe</option><option value="toolsetter">Tool setter</option>
            </select>
          </Match>
          <Match when={machine() === "lathe"}>
            <select class={INPUT} value={gen.settings.toolType} onChange={select}>
              <option value="turning">Turning</option><option value="facing">Facing</option><option value="boring">Boring</option>
              <option value="threading">Threading</option><option value="grooving">Grooving</option><option value="parting">Parting</option>
            </select>
          </Match>
          <Match when={machine() === "3dprinter"}>
            <select class={INPUT} value={gen.settings.toolType} onChange={select}>
              <option value="standard">Standard</option><option value="brass">Brass</option><option value="hardened">Hardened</option><option value="ruby">Ruby</option>
            </select>
          </Match>
        </Switch>
      </div>

      <div class="p-3 bg-gray-50 rounded-md">
        <div class="flex justify-between items-start">
          <h4 class="text-sm font-medium text-gray-700 mb-2">{toolTitle(machine(), gen.settings.toolType)}</h4>
          <div class="text-xs text-gray-500">{gen.selectedLibraryTool ? `${gen.selectedLibraryTool.name || "Custom tool"}` : "Generic tool"}</div>
        </div>
        <div class="flex items-center">
          <div class="w-20 h-20 mr-4 bg-white rounded-md border border-gray-200 flex items-center justify-center"><ToolSketch /></div>
          <div class="flex-1">
            <table class="w-full text-xs">
              <tbody>
                <Show when={machine() !== "3dprinter"} fallback={
                  <>
                    <tr><td class="py-1 text-gray-500">Nozzle Diameter:</td><td class="py-1 text-gray-800">{gen.settings.nozzleDiameter} mm</td></tr>
                    <tr><td class="py-1 text-gray-500">Filament Diameter:</td><td class="py-1 text-gray-800">{gen.settings.filamentDiameter} mm</td></tr>
                  </>
                }>
                  <tr><td class="py-1 text-gray-500">Diameter:</td><td class="py-1 text-gray-800">{gen.settings.toolDiameter} mm</td></tr>
                  <tr><td class="py-1 text-gray-500">Flutes:</td><td class="py-1 text-gray-800">{gen.settings.flutes}</td></tr>
                </Show>
                <tr><td class="py-1 text-gray-500">Max Speed:</td><td class="py-1 text-gray-800">{gen.settings.rpm} RPM</td></tr>
                <Show when={gen.selectedLibraryTool?.material}>
                  <tr><td class="py-1 text-gray-500">Material:</td><td class="py-1 text-gray-800">{gen.selectedLibraryTool?.material}</td></tr>
                </Show>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Show when={machine() !== "3dprinter"}>
        <div>
          <label class={LABEL}>Tool Diameter (mm)</label>
          <NumberField min="0.1" step="0.1" value={gen.settings.toolDiameter} onValue={(value) => gen.updateSettings("toolDiameter", value)} />
        </div>
        <Show when={machine() === "mill"}>
          <div>
            <label class={LABEL}>Number of Flutes</label>
            <NumberField min="1" max="12" int value={gen.settings.flutes} onValue={(value) => gen.updateSettings("flutes", value)} />
          </div>
        </Show>
        <div>
          <label class={LABEL}>Rotation Speed (RPM)</label>
          <NumberField min="1000" step="500" int value={gen.settings.rpm} onValue={(value) => gen.updateSettings("rpm", value)} />
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="coolant" class={CHECKBOX} checked={gen.settings.coolant} onChange={(event) => gen.updateSettings("coolant", event.currentTarget.checked)} />
          <label for="coolant" class="ml-2 block text-sm text-gray-700">Activate Coolant</label>
        </div>
      </Show>

      <div class="mt-2 flex flex-col pt-2 border-t border-gray-200">
        <label class={LABEL}>Select from Library</label>
        <select class={INPUT} value={gen.selectedLibraryTool?.id || gen.selectedLibraryTool?.name || ""} onChange={(event) => pick(event.currentTarget.value)}>
          <option value="">Select a tool</option>
          <optgroup label="Utensili Predefiniti">
            <For each={predefinedTools.filter((tool) => fits(tool.type))}>{(tool) => <option value={tool.name}>{tool.name} - {tool.type} {tool.diameter}mm</option>}</For>
          </optgroup>
          <Show when={userTools().length > 0}>
            <optgroup label="Utensili Locali">
              <For each={userTools().filter((tool) => fits(tool.type))}>{(tool) => <option value={tool.id}>{tool.name} - {tool.type} {tool.diameter}mm</option>}</For>
            </optgroup>
          </Show>
        </select>
      </div>

      <div class="mt-2 flex justify-between items-center pt-2 border-t border-gray-200">
        <span class="text-sm text-gray-600">Upload from library</span>
        <button type="button" class="text-xs text-blue-600 hover:text-blue-800 flex items-center" onClick={upload}><Upload size={14} class="mr-1" /> Upload</button>
      </div>
    </Section>
  )
}
