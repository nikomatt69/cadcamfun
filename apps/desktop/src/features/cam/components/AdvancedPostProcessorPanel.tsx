import { downloadFile } from "../../../shared/lib/save-file.ts"
/**
 * Post-processor panel: converts the editor's NC text into the program of another control (or rewrites it for the same one with
 * other output options).
 *
 * The work is the core's conversion kernel (`cam.convertNc`): the text is replayed by the reference interpreter in the source
 * control's dialect, rebuilt as toolpaths, written by the target post and replayed again; the panel shows the figures measured on
 * both replays, the largest distance between the two feed paths, what the output does differently, and refuses (with the reason)
 * what cannot be converted without changing the cut. Nothing here edits text on its own.
 */
import { For, Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { AlertTriangle, Check, Cpu, Eye, Loader, Save, Settings, Sliders } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"
import { CheckRow, Field, Note, NumberField, PanelSection, Segmented, Stat } from "../../../shared/components/panel/ui.tsx"
import { gcodeSummary } from "../lib/gcode-summary.ts"
import "../../../styles/cam-panels.css"

type PostId = cam.PostId
type Result = cam.ConvertResult

/** Every post the core writes, with the control it is for. */
export const POST_TARGETS: ReadonlyArray<{ readonly id: PostId; readonly label: string; readonly about: string }> = [
  { id: "fanuc", label: "Fanuc", about: "Fanuc 0i / 30i: % and O number, G43 H, canned cycles with M29 rigid tapping, G43.4 tool tip control, M98 subprograms, AICC smoothing (G5.1 Q1)." },
  { id: "haas", label: "Haas NGC", about: "Haas Next Generation Control: Fanuc family, G234 TCPC, M98 subprograms, G187 accuracy control." },
  { id: "siemens", label: "Siemens 840D sl", about: "Sinumerik native language: MPF header, ; comments, G71, T then D1, TRAORI, CYCLE832; drilling as moves, threads milled." },
  { id: "heidenhain", label: "Heidenhain Klartext", about: "TNC 640 / TNC7 conversational: L, CC + C circles, TOOL CALL, cycle 9 dwell, cycle 32 tolerance, M128, LBL subprograms; millimetres, G54 preset." },
  { id: "linuxcnc", label: "LinuxCNC", about: "LinuxCNC 2.8 / 2.9: % delimiters, G43 H, seconds on G4 / G82, canned drilling, G64 P blending, M2; threads milled." },
  { id: "grbl", label: "GRBL", about: "GRBL 1.1: three axes, no tool changer (M0 pause), no canned cycles, M2." },
  { id: "generic", label: "Generic ISO", about: "Plain ISO G-code: the reference output the other posts are compared with." }
]

export interface AdvancedPostProcessorPanelProps {
  readonly onControllerChange?: ((controller: PostId) => void) | undefined
  readonly initialGcode: string
  /** The control the program is written for: the default target. */
  readonly controllerType: PostId
  /** Receives the converted program and its measured figures. */
  readonly onProcessedGcode: (gcode: string, result?: Result) => void
}

const minutes = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`

export default function AdvancedPostProcessorPanel(props: AdvancedPostProcessorPanelProps): JSX.Element {
  const [inputGcode, setInputGcode] = createSignal(props.initialGcode)
  const [outputGcode, setOutputGcode] = createSignal("")
  const [isProcessing, setIsProcessing] = createSignal(false)
  const [result, setResult] = createSignal<Result | null>(null)
  const [source, setSource] = createSignal<PostId>(props.controllerType)
  const [target, setTarget] = createSignal<PostId>(props.controllerType)
  const [decimals, setDecimals] = createSignal(3)
  const [numbered, setNumbered] = createSignal(false)
  const [arcMode, setArcMode] = createSignal<cam.ArcMode>("ijk")
  const [canned, setCanned] = createSignal(true)
  const [subprograms, setSubprograms] = createSignal(false)
  const [smoothing, setSmoothing] = createSignal(false)
  const [tolerance, setTolerance] = createSignal(0.01)
  const [header, setHeader] = createSignal(true)
  const [comments, setComments] = createSignal(true)
  const [expanded, setExpanded] = createSignal({ options: true, results: true, preview: false })

  createEffect(on(() => props.initialGcode, (next) => {
    if (next !== inputGcode()) {
      setInputGcode(next)
      setOutputGcode("")
      setResult(null)
    }
  }, { defer: true }))
  createEffect(on(() => props.controllerType, (next) => { setTarget(next); setSource(next) }, { defer: true }))

  const toggleSection = (section: keyof ReturnType<typeof expanded>): void => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const processGcode = async (): Promise<void> => {
    if (!inputGcode()) return
    setIsProcessing(true)
    setResult(null)
    try {
      await Promise.resolve()
      const converted = cam.convertNc(inputGcode(), {
        source: source(), target: target(), comments: comments(),
        post: {
          decimals: decimals(), arcMode: arcMode(), useCannedCycles: canned(), subprograms: subprograms(), header: header(),
          ...(numbered() ? { lineNumbers: { start: 10, step: 10 } } : {}),
          ...(smoothing() ? { smoothing: tolerance() } : {})
        }
      })
      setOutputGcode(converted.code)
      setResult(converted)
      if (converted.ok) props.onProcessedGcode(converted.code, converted)
    } finally {
      setIsProcessing(false)
      setExpanded((prev) => ({ ...prev, results: true }))
    }
  }

  const saveGcode = (): void => {
    if (!outputGcode()) return
    const date = new Date().toISOString().slice(0, 10)
    const extension = target() === "heidenhain" ? ".h" : target() === "siemens" ? ".mpf" : ".nc"
    downloadFile({ name: `${target()}_${date}${extension}`, data: outputGcode(), mime: "text/plain" })
  }

  const summary = createMemo(() => gcodeSummary(inputGcode()))
  const about = (id: PostId): string => POST_TARGETS.find((p) => p.id === id)?.about ?? ""
  const label = (id: PostId): string => POST_TARGETS.find((p) => p.id === id)?.label ?? id
  const smoothingCodes = (): boolean => cam.dialectOf(target())?.smoothing !== undefined || target() === "heidenhain"
  const subprogramCodes = (): boolean => cam.dialectOf(target())?.subprograms !== undefined || target() === "heidenhain"

  return (
    <div class="panel cam-post__panel" data-testid="advanced-post-processor">
      <div class="cam-post__setup">
        <h2 class="panel-header__title cam-panel-heading">
          <Cpu size={15} />
          Post-Processor
        </h2>

        <div class="cam-program-summary" data-testid="post-input-summary">
          <Stat label={t("cam.panel.blocks")} value={String(summary().blocks)} />
          <Stat label={t("cam.panel.tools")} value={summary().tools.map(n => `T${n}`).join(" · ") || t("cam.panel.notSpecified")} />
          <Stat label={t("cam.panel.offsets")} value={summary().offsets.join(" · ") || t("cam.panel.notSpecified")} />
        </div>
        <Show when={summary().blocks === 0}><Note>{t("cam.panel.noInput")}</Note></Show>
        <div class="cam-post__controls">
          <Field label="Written for" for="post-processor-source">
            <select id="post-processor-source" class="panel-input" value={source()} data-testid="post-source"
              onChange={(event) => setSource(event.currentTarget.value as PostId)}>
              <For each={POST_TARGETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
            </select>
          </Field>
          <Field label={t("cam.panel.controller")} for="post-processor-target">
            <select id="post-processor-target" class="panel-input" value={target()} data-testid="advanced-controller"
              onChange={(event) => { const value = event.currentTarget.value as PostId; setTarget(value); props.onControllerChange?.(value) }}>
              <For each={POST_TARGETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
            </select>
          </Field>
          <button class="panel-btn panel-btn--primary" onClick={() => void processGcode()} disabled={isProcessing() || summary().blocks === 0} data-testid="process-gcode">
            {isProcessing() ? <Loader size={18} class="mr-2 animate-spin" /> : <Settings size={18} class="mr-2" />}
            {isProcessing() ? "Converting..." : "Convert"}
          </button>
        </div>
        <Note>{about(target())}</Note>
      </div>

      <PanelSection id="post-options" title={`${label(target())} output`} icon={Sliders} open={expanded().options} onToggle={() => toggleSection("options")}>
        <Show when={expanded().options}>
          <div class="cam-post__grid">
            <div class="space-y-2">
              <Field label="Decimals" for="post-decimals">
                <NumberField id="post-decimals" value={decimals()} int accept={(v) => Number.isInteger(v) && v >= 0 && v <= 6} onValue={setDecimals} />
              </Field>
              <Segmented label="Arcs" testId="post-arcs" value={arcMode()} onChange={setArcMode}
                options={[["ijk", "I J K"], ["radius", "R"], ["linearize", "Lines"]]} />
              <CheckRow id="post-numbered" checked={numbered()} onChange={setNumbered}>Block numbers (N10, step 10)</CheckRow>
              <CheckRow id="post-header" checked={header()} onChange={setHeader}>Header comments (program, units, operations)</CheckRow>
              <CheckRow id="post-comments" checked={comments()} onChange={setComments}>Keep the program's comments</CheckRow>
            </div>
            <div class="space-y-2">
              <CheckRow id="post-canned" checked={canned()} onChange={setCanned}>Canned cycles where the control has them</CheckRow>
              <Show when={subprogramCodes()}>
                <CheckRow id="post-subprograms" checked={subprograms()} onChange={setSubprograms}>Repeated toolpaths as subprograms</CheckRow>
              </Show>
              <Show when={smoothingCodes()}>
                <CheckRow id="post-smoothing" checked={smoothing()} onChange={setSmoothing}>High-speed contour smoothing</CheckRow>
                <Show when={smoothing()}>
                  <Field label="Contour tolerance" unit="mm" for="post-tolerance">
                    <NumberField id="post-tolerance" value={tolerance()} accept={(v) => v > 0 && v <= 1} onValue={setTolerance} />
                  </Field>
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </PanelSection>

      <Show when={result()}>
        {(current) => (
          <PanelSection id="post-results-section" testId="post-results" title={current().ok ? "Converted and verified" : "Not converted"} icon={current().ok ? Check : AlertTriangle} open={expanded().results} onToggle={() => toggleSection("results")}>
            <Show when={expanded().results}>
              <div class="p-4 pt-0 space-y-3">
                <Show when={current().errors.length > 0}>
                  <Note kind="bad" role="alert" testId="post-errors">
                    <ul class="list-disc list-inside"><For each={current().errors}>{(error) => <li>{error}</li>}</For></ul>
                  </Note>
                </Show>
                <Show when={current().ok}>
                  <Note kind="ok" testId="post-verified">
                    The output replays to the same feed path: largest distance {current().deviation!.toFixed(4)} mm (rounding allows {current().allowed!.toFixed(4)} mm).
                  </Note>
                </Show>
                <Show when={current().before}>
                  {(before) => (
                    <table class="panel-table" data-testid="post-figures">
                      <thead><tr><th /><th>Input</th><th>Output</th></tr></thead>
                      <tbody>
                        <For each={[
                          ["Lines", (f: cam.NcFigures) => String(f.lines)],
                          ["Bytes", (f: cam.NcFigures) => String(f.bytes)],
                          ["Cut length (mm)", (f: cam.NcFigures) => f.cutLength.toFixed(1)],
                          ["Rapid length (mm)", (f: cam.NcFigures) => f.rapidLength.toFixed(1)],
                          ["Dwell (s)", (f: cam.NcFigures) => f.dwellSeconds.toFixed(2)],
                          ["Estimated time", (f: cam.NcFigures) => minutes(f.seconds)],
                          ["Tools", (f: cam.NcFigures) => f.tools.map((n) => `T${n}`).join(" ") || "-"]
                        ] as const}>
                          {([name, show]) => (
                            <tr><td>{name}</td><td>{show(before())}</td><td>{current().after !== undefined ? show(current().after!) : "-"}</td></tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  )}
                </Show>
                <Show when={current().notes.length > 0}>
                  <Note testId="post-notes">
                    <ul class="list-disc list-inside"><For each={current().notes}>{(note) => <li>{note}</li>}</For></ul>
                  </Note>
                </Show>
                <div class="cam-post__result-actions">
                  <button type="button" class="panel-btn" onClick={() => toggleSection("preview")} disabled={!outputGcode()}>
                    <Eye size={16} class="mr-2" />
                    {expanded().preview ? "Hide Preview" : "Show Preview"}
                  </button>
                  <button type="button" class="panel-btn" onClick={saveGcode} disabled={!current().ok}>
                    <Save size={16} class="mr-2" />
                    Save program
                  </button>
                </div>
              </div>
            </Show>
          </PanelSection>
        )}
      </Show>

      <Show when={result() && expanded().preview && outputGcode()}>
        <div class="p-4">
          <h3 class="text-lg font-medium mb-2">{label(target())} program</h3>
          <div class="panel-code">
            <pre class="text-sm font-mono whitespace-pre-wrap" data-testid="post-preview">{outputGcode()}</pre>
          </div>
        </div>
      </Show>
    </div>
  )
}
