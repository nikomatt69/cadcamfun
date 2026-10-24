/**
 * The CAM "Generator" panel (legacy `ToolpathGenerator.tsx`).
 *
 * The panel owns no G-code logic: it edits the job (`useGeneratorStore`), reads the CAD selection and the raw
 * piece from the CAD stores (`useJob`) and asks the sidecar's `toolpathGenerator` HTTP group to generate. The
 * result goes to the CAM page (`onGCodeGenerated`) and into the CAM store, where the viewport, the post-processor
 * and the assistant read it.
 */
import { Show, createSignal, type JSX } from "solid-js"
import { Code, Cpu, CircleHelp, Maximize2, Minimize2, Save, Upload } from "lucide-solid"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { makeToolpathGenerator, type GenerateResponse } from "../api/generator.ts"
import { geometryOf } from "../lib/job.ts"
import { useJob } from "../hooks/useJob.ts"
import { useCamStore } from "../store/camStore.ts"
import { loadConfig, saveConfig, useGeneratorStore, type LibraryTool } from "../store/generatorStore.ts"
import { AdvancedSection } from "./generator/AdvancedSection.tsx"
import { AiSection } from "./generator/AiSection.tsx"
import { CuttingSection } from "./generator/CuttingSection.tsx"
import { EvidenceSection } from "./generator/EvidenceSection.tsx"
import { FixedCyclesSection } from "./generator/FixedCyclesSection.tsx"
import { LatheSection } from "./generator/LatheSection.tsx"
import { MachineSection } from "./generator/MachineSection.tsx"
import { MaterialSection } from "./generator/MaterialSection.tsx"
import { OperationSection } from "./generator/OperationSection.tsx"
import { OriginSection } from "./generator/OriginSection.tsx"
import { WorkholdingSection } from "./generator/WorkholdingSection.tsx"
import KernelPrintSection from "./generator/KernelPrintSection.tsx"
import { PrintProfileSection } from "./generator/PrintProfileSection.tsx"
import { PrintResultSection } from "./generator/PrintResultSection.tsx"
import { Note } from "./generator/ui.tsx"
import { ToolSection } from "./generator/ToolSection.tsx"
import KernelSection from "./generator/KernelSection.tsx"
import SaveCamModal from "./SaveCamModal.tsx"

export interface ToolpathGeneratorProps {
  readonly onSave?: () => void
  /** Receives the generated (or cycle-edited) program text. */
  readonly onGCodeGenerated: (gcode: string) => void
  readonly onToolSelected?: (tool: LibraryTool) => void
}

export default function ToolpathGenerator(props: ToolpathGeneratorProps): JSX.Element {
  const app = useApp()
  const [saveOpen, setSaveOpen] = createSignal(false)
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
      gen.setResult(response.gcode, response.cycles, response.evidence, response.print)
      camStore.setGcode(response.gcode)
      camStore.setProgram(response.program)
      for (const warning of response.warnings) toast(warning)
      gen.flash(t("cam.generator.success"), 5000)
      props.onGCodeGenerated(response.gcode)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (gen.settings.machineType === "3dprinter") toast.error(message)
      gen.setError(gen.settings.machineType === "3dprinter" ? message : message || t("cam.generator.error"))
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
    if (!camStore.gcode) { toast.error(t("cam.generator.noGcode")); return }
    if (props.onSave) props.onSave()
    else setSaveOpen(true)
  }

  return (
    <div
      class={`panel workstation-generator__form ${gen.showFullscreen ? "fixed p-6 m-4 inset-0 z-50 overflow-auto bg-white dark:bg-gray-900" : "p-2"}`}
      data-testid="toolpath-generator"
    >
      <Show when={saveOpen()}><SaveCamModal code={camStore.gcode} extension=".nc" projectOnly onClose={() => setSaveOpen(false)} /></Show>
      <header class="panel-header">
        <div>
          <h2 class="panel-header__title">{t("cam.generator")}</h2>
          <p class="panel-header__sub">{t("cam.generator.subtitle")}</p>
        </div>
        <div class="panel-header__tools">
          <button
            type="button" class="panel-icon-btn"
            onClick={() => gen.setShowFullscreen(!gen.showFullscreen)}
            title={t(gen.showFullscreen ? "cam.exitFullscreen" : "cam.fullscreen")}
            aria-label={t(gen.showFullscreen ? "cam.exitFullscreen" : "cam.fullscreen")}
          >
            <Show when={gen.showFullscreen} fallback={<Maximize2 size={15} />}><Minimize2 size={15} /></Show>
          </button>
          <button type="button" class="panel-icon-btn" title={t("cam.generator.helpTitle")} aria-label={t("cam.generator.helpTitle")} onClick={() => toast(t("cam.generator.help"))}>
            <CircleHelp size={15} />
          </button>
        </div>
      </header>

      <MachineSection />
      <OriginSection />
      <WorkholdingSection />
      <Show when={gen.settings.machineType === "mill"}><KernelSection onGCodeGenerated={props.onGCodeGenerated} /></Show>
      <OperationSection />
      <PrintProfileSection />
      <KernelPrintSection onGCodeGenerated={props.onGCodeGenerated} />
      <Show when={gen.settings.machineType !== "3dprinter"}><FixedCyclesSection onGCode={onCycleGCode} /></Show>
      <MaterialSection />
      <ToolSection />
      <LatheSection />
      <Show when={gen.settings.machineType !== "3dprinter"}>
        <CuttingSection />
        <AdvancedSection />
      </Show>
      <AiSection />
      <PrintResultSection />
      <EvidenceSection />

      <Show when={gen.error}>
        <Note kind="bad" role="alert">{gen.error}</Note>
      </Show>
      <Show when={gen.success}>
        <Note kind="ok" role="status">{gen.success}</Note>
      </Show>

      <div class="panel-footer">
        <div class="panel-actions">
          <button type="button" onClick={() => void generate()} disabled={gen.isGenerating} data-testid="generate-toolpath" class="panel-btn panel-btn--primary panel-btn--block">
            <Show when={gen.isGenerating} fallback={<><Code size={14} />{t("cam.generator.generate")}</>}>
              <Cpu size={14} />{t("cam.generator.generating")}
            </Show>
          </button>
          <button type="button" onClick={saveAsToolpath} class="panel-btn panel-btn--block">
            <Save size={14} />{t("cam.generator.saveAsToolpath")}
          </button>
        </div>
        <div class="panel-grid panel-grid--2">
          <button type="button" class="panel-btn" onClick={() => { if (saveConfig(gen.settings)) gen.flash(t("cam.generator.configSaved")) }}>
            <Save size={14} />{t("cam.generator.saveConfig")}
          </button>
          <button
            type="button" class="panel-btn"
            onClick={() => {
              const saved = loadConfig()
              if (saved) { gen.replaceSettings(saved); gen.flash(t("cam.generator.configLoaded")) }
              else gen.flashError(t("cam.generator.configMissing"))
            }}
          >
            <Upload size={14} />{t("cam.generator.loadConfig")}
          </button>
        </div>
      </div>
    </div>
  )
}
