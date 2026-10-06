/**
 * The CAM "Generator" panel (legacy `ToolpathGenerator.tsx`).
 *
 * The panel owns no G-code logic: it edits the job (`useGeneratorStore`), reads the CAD selection and the raw
 * piece from the CAD stores (`useJob`) and asks the sidecar's `toolpathGenerator` HTTP group to generate. The
 * result goes to the CAM page (`onGCodeGenerated`) and into the CAM store, where the viewport, the post-processor
 * and the assistant read it.
 */
import { Show, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { AlertTriangle, Check, Code, Cpu, CircleHelp, Maximize2, Minimize2, Save, Settings, Upload } from "lucide-solid"
import { Motion } from "solid-motionone"
import { toast } from "../../components/ui/toast.tsx"
import { useApp } from "../../state/context.ts"
import { makeToolpathGenerator, type GenerateResponse } from "../api/generator.ts"
import { geometryOf } from "../lib/job.ts"
import { useJob } from "../lib/useJob.ts"
import { useCamStore } from "../store/camStore.ts"
import { loadConfig, saveConfig, useGeneratorStore, type LibraryTool } from "../store/generatorStore.ts"
import { AdvancedSection } from "./generator/AdvancedSection.tsx"
import { AiSection } from "./generator/AiSection.tsx"
import { CuttingSection } from "./generator/CuttingSection.tsx"
import { FixedCyclesSection } from "./generator/FixedCyclesSection.tsx"
import { LatheSection } from "./generator/LatheSection.tsx"
import { MachineSection } from "./generator/MachineSection.tsx"
import { MaterialSection } from "./generator/MaterialSection.tsx"
import { OperationSection } from "./generator/OperationSection.tsx"
import { OriginSection } from "./generator/OriginSection.tsx"
import { PrinterParamsSection } from "./generator/PrinterParamsSection.tsx"
import { ToolSection } from "./generator/ToolSection.tsx"

export interface ToolpathGeneratorProps {
  /** Receives the generated (or cycle-edited) program text. */
  readonly onGCodeGenerated: (gcode: string) => void
  readonly onToolSelected?: (tool: LibraryTool) => void
}

export default function ToolpathGenerator(props: ToolpathGeneratorProps): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const gen = useGeneratorStore()
  const camStore = useCamStore()
  const job = useJob()
  const generator = makeToolpathGenerator(app.client)

  const generate = async (): Promise<void> => {
    gen.setGenerating(true)
    gen.setError(null)
    gen.setSuccess(null)
    try {
      const response: GenerateResponse = await app.runtime.run(generator.generate({
        settings: gen.settings,
        geometry: geometryOf(gen, job.sources()),
        printer: gen.printer
      }))
      gen.setResult(response.gcode, response.cycles)
      camStore.setGcode(response.gcode)
      camStore.setProgram(response.program)
      for (const warning of response.warnings) toast(warning)
      gen.flash("G-code generated successfully!", 5000)
      props.onGCodeGenerated(response.gcode)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (gen.settings.machineType === "3dprinter") toast.error(message)
      gen.setError(gen.settings.machineType === "3dprinter" ? message : message || "Error generating G-code. Check your settings.")
    } finally {
      gen.setGenerating(false)
    }
  }

  const onCycleGCode = (gcode: string): void => {
    gen.setCurrentGCode(gcode)
    camStore.setGcode(gcode)
    props.onGCodeGenerated(gcode)
  }

  const saveAsToolpath = (): void => {
    if (!gen.currentGCode) { toast.error("No G-code generated yet!"); return }
    // The toolpaths page picks these up to create a toolpath (same hand-off as the legacy app).
    try {
      localStorage.setItem("gcodeFromToolpathGenerator", gen.currentGCode)
      localStorage.setItem("settingsFromToolpathGenerator", JSON.stringify(gen.settings))
    } catch { /* storage blocked: the toolpaths page opens empty */ }
    navigate("/toolpaths?fromGenerator=true")
    toast.success("G-code ready to save as toolpath")
  }

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      class={`bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-gray-900 dark:text-white rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 ${gen.showFullscreen ? "fixed p-6 m-4 inset-0 z-50 overflow-auto" : "p-6"}`}
      data-testid="toolpath-generator"
    >
      <Motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} class="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center space-x-3">
          <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg"><Settings size={24} class="text-blue-600 dark:text-blue-400" /></div>
          <div>
            <h2 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Toolpath Generator</h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">Configure cutting parameters and generate G-code</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <Motion.button
            hover={{ scale: 1.05 }}
            press={{ scale: 0.95 }}
            type="button"
            onClick={() => gen.setShowFullscreen(!gen.showFullscreen)}
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title={gen.showFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Show when={gen.showFullscreen} fallback={<Maximize2 size={20} />}><Minimize2 size={20} /></Show>
          </Motion.button>
          <Motion.button
            hover={{ scale: 1.05 }}
            press={{ scale: 0.95 }}
            type="button"
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title="Help"
            onClick={() => toast("This is the toolpath generator. To start, choose an operation and configure the cutting parameters.")}
          >
            <CircleHelp size={20} />
          </Motion.button>
        </div>
      </Motion.div>

      <OriginSection />
      <MachineSection />
      <OperationSection />
      <FixedCyclesSection onGCode={onCycleGCode} />
      <MaterialSection />
      <ToolSection />
      <LatheSection />
      <PrinterParamsSection />
      <CuttingSection />
      <AdvancedSection />
      <AiSection />

      <Show when={gen.error}>
        <div class="mb-4 p-3 bg-red-50 rounded-md flex items-start" role="alert">
          <AlertTriangle class="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
          <p class="text-sm text-red-800">{gen.error}</p>
        </div>
      </Show>

      <Show when={gen.success}>
        <div class="mb-4 p-3 bg-green-50 rounded-md flex items-start" role="status">
          <Check class="text-green-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
          <p class="text-sm text-green-800">{gen.success}</p>
        </div>
      </Show>

      <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} class="space-y-3 mt-8">
        <Motion.button
          hover={{ scale: 1.02 }}
          press={{ scale: 0.98 }}
          onClick={() => void generate()}
          disabled={gen.isGenerating}
          class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Show when={gen.isGenerating} fallback={<><Code size={20} class="mr-2" />Generate G-Code</>}>
            <Motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, easing: "linear" }} class="mr-2"><Cpu size={20} /></Motion.div>
            Generating G-Code...
          </Show>
        </Motion.button>

        <Motion.button
          hover={{ scale: 1.02 }}
          press={{ scale: 0.98 }}
          onClick={saveAsToolpath}
          class="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-6 rounded-lg hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center shadow-lg transition-all"
        >
          <Save size={20} class="mr-2" />
          Save as Toolpath
        </Motion.button>
      </Motion.div>

      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex justify-between items-center mb-3">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Configuration Management</span>
        </div>
        <div class="flex space-x-3">
          <Motion.button
            hover={{ scale: 1.05 }}
            press={{ scale: 0.95 }}
            type="button"
            class="flex-1 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center"
            onClick={() => { if (saveConfig(gen.settings)) gen.flash("Configuration saved!") }}
          >
            <Save size={16} class="mr-2" />
            Save Config
          </Motion.button>
          <Motion.button
            hover={{ scale: 1.05 }}
            press={{ scale: 0.95 }}
            type="button"
            class="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
            onClick={() => {
              const saved = loadConfig()
              if (saved) { gen.replaceSettings(saved); gen.flash("Configuration loaded!") }
              else gen.flashError("No saved configuration found")
            }}
          >
            <Upload size={16} class="mr-2" />
            Load Config
          </Motion.button>
        </div>
      </Motion.div>
    </Motion.div>
  )
}
