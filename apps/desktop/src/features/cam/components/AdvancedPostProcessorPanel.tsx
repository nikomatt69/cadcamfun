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
import { AlertTriangle, Check, Cpu, Eye, EyeOff, Loader, Save, Settings, Sliders } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t, type Key } from "../../../i18n/index.ts"
import { Badge, CheckRow, Field, Grid, Group, Note, NumberField, PanelCard, PanelSection, Segmented, Stat } from "../../../shared/components/panel/ui.tsx"
import { downloadFile } from "../../../shared/lib/save-file.ts"
import { gcodeSummary } from "../lib/gcode-summary.ts"
import "../../../styles/cam-panels.css"

type PostId = cam.PostId
type Result = cam.ConvertResult

/** Every post the core writes, with the control it is for. Label and description are read from the string table on access. */
const postTarget = (id: PostId, label: Key, about: Key): { readonly id: PostId; readonly label: string; readonly about: string } => ({
  id,
  get label() { return t(label) },
  get about() { return t(about) }
})

export const POST_TARGETS: ReadonlyArray<{ readonly id: PostId; readonly label: string; readonly about: string }> = [
  postTarget("fanuc", "cam.post.target.fanuc.label", "cam.post.target.fanuc.about"),
  postTarget("haas", "cam.post.target.haas.label", "cam.post.target.haas.about"),
  postTarget("siemens", "cam.post.target.siemens.label", "cam.post.target.siemens.about"),
  postTarget("heidenhain", "cam.post.target.heidenhain.label", "cam.post.target.heidenhain.about"),
  postTarget("linuxcnc", "cam.post.target.linuxcnc.label", "cam.post.target.linuxcnc.about"),
  postTarget("grbl", "cam.post.target.grbl.label", "cam.post.target.grbl.about"),
  postTarget("generic", "cam.post.target.generic.label", "cam.post.target.generic.about")
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
  // The page's selection is the target; what the program is written for is the reader's choice and stays.
  createEffect(on(() => props.controllerType, (next) => setTarget(next), { defer: true }))

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

  const figures: ReadonlyArray<readonly [Key, (f: cam.NcFigures) => string]> = [
    ["cam.post.panel.lines", (f) => String(f.lines)],
    ["cam.post.panel.bytes", (f) => String(f.bytes)],
    ["cam.post.panel.cutLength", (f) => f.cutLength.toFixed(1)],
    ["cam.post.panel.rapidLength", (f) => f.rapidLength.toFixed(1)],
    ["cam.post.panel.dwell", (f) => f.dwellSeconds.toFixed(2)],
    ["cam.post.panel.time", (f) => minutes(f.seconds)],
    ["cam.post.panel.toolsFigure", (f) => f.tools.map((n) => `T${n}`).join(" ") || "-"]
  ]
  const outputLines = (): number => outputGcode().split("\n").filter((line) => line.trim() !== "").length

  return (
    <div class="panel cam-post__panel" data-testid="advanced-post-processor">
      <header class="panel-header">
        <div class="cam-post__title">
          <h2 class="panel-header__title cam-panel-heading"><Cpu size={15} />{t("cam.post.panel.title")}</h2>
          <p class="panel-header__sub">{t("cam.post.panel.subtitle")}</p>
        </div>
        <div class="panel-header__tools">
          <Show when={result()}>
            {(current) => (
              <Badge tone={current().ok ? "ok" : "bad"}>
                {current().ok ? t("cam.post.panel.verifiedBadge") : t("cam.post.panel.refusedBadge")}
              </Badge>
            )}
          </Show>
        </div>
      </header>

      <div class="cam-post__setup">
        <div class="cam-program-summary" data-testid="post-input-summary">
          <Stat label={t("cam.panel.blocks")} value={String(summary().blocks)} />
          <Stat label={t("cam.panel.tools")} value={summary().tools.map(n => `T${n}`).join(" · ") || t("cam.panel.notSpecified")} />
          <Stat label={t("cam.panel.offsets")} value={summary().offsets.join(" · ") || t("cam.panel.notSpecified")} />
        </div>
        <Show when={summary().blocks === 0}><Note kind="warn">{t("cam.panel.noInput")}</Note></Show>
        <div class="cam-post__controls">
          <Field label={t("cam.post.panel.source")} for="post-processor-source">
            <select id="post-processor-source" class="panel-input" value={source()} data-testid="post-source"
              onChange={(event) => setSource(event.currentTarget.value as PostId)}>
              <For each={POST_TARGETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
            </select>
          </Field>
          <Field label={t("cam.post.panel.target")} for="post-processor-target">
            <select id="post-processor-target" class="panel-input" value={target()} data-testid="advanced-controller"
              onChange={(event) => { const value = event.currentTarget.value as PostId; setTarget(value); props.onControllerChange?.(value) }}>
              <For each={POST_TARGETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
            </select>
          </Field>
          <button type="button" class="panel-btn panel-btn--primary" onClick={() => void processGcode()} disabled={isProcessing() || summary().blocks === 0} data-testid="process-gcode">
            {isProcessing() ? <Loader class="cam-post__spin" /> : <Settings />}
            {isProcessing() ? t("cam.post.panel.converting") : t("cam.post.panel.convert")}
          </button>
        </div>
        <Note>{about(target())}</Note>
      </div>

      <PanelSection id="post-options" title={t("cam.post.panel.output", { post: label(target()) })} icon={Sliders} open={expanded().options} onToggle={() => toggleSection("options")}>
        <div class="cam-post__grid">
          <Group title={t("cam.post.panel.format")}>
            <Grid cols={2}>
              <Field label={t("cam.post.panel.decimals")} for="post-decimals">
                <NumberField id="post-decimals" value={decimals()} int accept={(v) => Number.isInteger(v) && v >= 0 && v <= 6} onValue={setDecimals} />
              </Field>
              <Field label={t("cam.post.panel.arcs")}>
                <Segmented label={t("cam.post.panel.arcs")} testId="post-arcs" value={arcMode()} onChange={setArcMode}
                  options={[["ijk", "I J K"], ["radius", "R"], ["linearize", t("cam.post.panel.arcs.lines")]]} />
              </Field>
            </Grid>
            <CheckRow id="post-numbered" checked={numbered()} onChange={setNumbered}>{t("cam.post.panel.numbered")}</CheckRow>
            <CheckRow id="post-header" checked={header()} onChange={setHeader}>{t("cam.post.panel.header")}</CheckRow>
            <CheckRow id="post-comments" checked={comments()} onChange={setComments}>{t("cam.post.panel.comments")}</CheckRow>
          </Group>
          <Group title={t("cam.post.panel.features")}>
            <CheckRow id="post-canned" checked={canned()} onChange={setCanned}>{t("cam.post.panel.canned")}</CheckRow>
            <Show when={subprogramCodes()}>
              <CheckRow id="post-subprograms" checked={subprograms()} onChange={setSubprograms}>{t("cam.post.panel.subprograms")}</CheckRow>
            </Show>
            <Show when={smoothingCodes()}>
              <CheckRow id="post-smoothing" checked={smoothing()} onChange={setSmoothing}>{t("cam.post.panel.smoothing")}</CheckRow>
              <Show when={smoothing()}>
                <Field label={t("cam.post.panel.tolerance")} unit="mm" for="post-tolerance">
                  <NumberField id="post-tolerance" value={tolerance()} accept={(v) => v > 0 && v <= 1} onValue={setTolerance} />
                </Field>
              </Show>
            </Show>
          </Group>
        </div>
      </PanelSection>

      <Show when={result()}>
        {(current) => (
          <PanelSection id="post-results-section" testId="post-results"
            title={current().ok ? t("cam.post.panel.verified") : t("cam.post.panel.refused")}
            icon={current().ok ? Check : AlertTriangle} open={expanded().results} onToggle={() => toggleSection("results")}>
            <Show when={current().ok}>
              <Note kind="ok" testId="post-verified">
                {t("cam.post.panel.verifiedNote", { deviation: current().deviation!.toFixed(4), allowed: current().allowed!.toFixed(4) })}
              </Note>
            </Show>
            <Show when={current().errors.length > 0}>
              <Note kind="bad" role="alert" testId="post-errors">
                <ul class="cam-post__list"><For each={current().errors}>{(error) => <li>{error}</li>}</For></ul>
              </Note>
            </Show>
            <Show when={current().before}>
              {(before) => (
                <div class="cam-post__figures-wrap">
                  <table class="cam-post__figures" data-testid="post-figures">
                    <caption>{t("cam.post.panel.figures")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("cam.post.panel.figure")}</th>
                        <th scope="col">{t("cam.post.panel.input")}</th>
                        <th scope="col">{t("cam.post.panel.outputColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={figures}>
                        {([name, show]) => {
                          const after = (): string => current().after !== undefined ? show(current().after!) : "-"
                          return (
                            <tr data-changed={after() !== show(before())}>
                              <td>{t(name)}</td>
                              <td>{show(before())}</td>
                              <td>{after()}</td>
                            </tr>
                          )
                        }}
                      </For>
                    </tbody>
                  </table>
                </div>
              )}
            </Show>
            <Show when={current().notes.length > 0}>
              <Note testId="post-notes">
                <p class="cam-post__note-title">{t("cam.post.panel.notes")}</p>
                <ul class="cam-post__list"><For each={current().notes}>{(note) => <li>{note}</li>}</For></ul>
              </Note>
            </Show>
            <div class="cam-post__result-actions">
              <button type="button" class="panel-btn" onClick={() => toggleSection("preview")} disabled={!outputGcode()} aria-pressed={expanded().preview}>
                {expanded().preview ? <EyeOff /> : <Eye />}
                {expanded().preview ? t("cam.post.panel.hidePreview") : t("cam.post.panel.showPreview")}
              </button>
              <button type="button" class="panel-btn" onClick={saveGcode} disabled={!current().ok}>
                <Save />
                {t("cam.post.panel.save")}
              </button>
            </div>
          </PanelSection>
        )}
      </Show>

      <Show when={result() && expanded().preview && outputGcode()}>
        <PanelCard title={t("cam.post.panel.program", { post: label(target()) })} actions={<Badge>{t("cam.post.panel.lineCount", { count: outputLines() })}</Badge>}>
          <pre class="panel-code cam-post__code" data-testid="post-preview">{outputGcode()}</pre>
        </PanelCard>
      </Show>
    </div>
  )
}
