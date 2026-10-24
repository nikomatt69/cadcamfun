/**
 * Evidence of the last generated program (`cam.generator.programRecord`): the result, every check run on the exact NC with
 * the line it points at, where the cutting data comes from (the kernel's material table row and the factors applied), the
 * inputs digest and the NC's SHA-256. Shown open whenever a program exists; an edit of the NC after generation marks it stale.
 */
import { For, Show, type JSX } from "solid-js"
import { CircleCheck, CircleHelp, CircleX, Minus, ShieldCheck } from "lucide-solid"
import { Dynamic } from "solid-js/web"
import type { cam } from "@cadcamfun/core"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Badge, Note } from "./ui.tsx"

type Reference = NonNullable<cam.generator.ProgramRecord["cuttingData"]["reference"]>

const STATUS_ICON = { passed: CircleCheck, failed: CircleX, unresolved: CircleHelp, "not-run": Minus } as const

const RESULT_TONE: Readonly<Record<string, "ok" | "warn" | "bad">> = { passed: "ok", warnings: "warn", failed: "bad" }

const CHECK_LABEL: Readonly<Record<string, string>> = {
  generated: "Program generated",
  "cutting-data": "Cutting data",
  "safe-height": "Safe height above the stock",
  "no-rapid-in-material": "No rapid in material",
  "tool-clearance": "Shank / holder clearance",
  "within-stock": "Within stock and fixtures",
  "no-gouge": "No gouge of the part",
  "nc-interpretation": "NC interpreted independently",
  "bed-fit": "Inside the plate and build height",
  "heated-start": "Heated before extruding",
  "layers-rise": "Layers only rise",
  "wall-coverage": "Walls complete in every layer",
  "skin-coverage": "First and last layer covered",
  "no-spill": "No bead outside the part",
  filament: "Filament matches the beads"
}

const num = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000))

/** The material table row the cutting data was read from, with the columns and the factors the calculation applied. */
export function CuttingReferenceView(props: { readonly reference: Reference }): JSX.Element {
  return (
    <div class="text-[11px] leading-snug space-y-0.5" data-testid="cutting-reference">
      <div><span class="font-medium">Source:</span> table {props.reference.table}, row <code>{props.reference.row}</code> ({props.reference.rowName})</div>
      <div><span class="font-medium">Columns:</span> {Object.entries(props.reference.columns).map(([k, v]) => `${k} ${num(v)}`).join(" · ")}</div>
      <div><span class="font-medium">Factors:</span> {Object.entries(props.reference.factors).map(([k, v]) => `${k} ×${num(v)}`).join(" · ")}</div>
      <div class="opacity-70">{props.reference.basis}</div>
    </div>
  )
}

export function EvidenceSection(): JSX.Element {
  const gen = useGeneratorStore()
  const printer = () => gen.settings.machineType === "3dprinter"
  return (
    <Show when={gen.evidence}>
      {(e) => (
        <section class="panel-section" data-testid="program-evidence" data-open="true">
          <div class="panel-section__head" style={{ cursor: "default" }}>
            <ShieldCheck size={14} class="panel-section__icon" />
            <h3 class="panel-section__title">Program evidence</h3>
            <Badge tone={RESULT_TONE[e().result] ?? "warn"} testId="evidence-result">{e().result}</Badge>
          </div>
          <div class="panel-section__body">
            <Show when={gen.evidenceStale}>
              <Note kind="warn" testId="evidence-stale">The NC was edited after generation: this record describes the generated program, not the current text. Generate again to check it.</Note>
            </Show>
            <ul class="panel-checks">
              <For each={e().checks}>
                {(c) => (
                  <li data-testid={`evidence-check-${c.id}`}>
                    <Dynamic component={STATUS_ICON[c.status as keyof typeof STATUS_ICON] ?? CircleHelp} size={12} class={`panel-checks__mark panel-checks__mark--${c.status}`} aria-label={c.status} />
                    <span>
                      <strong>{CHECK_LABEL[c.id] ?? c.id}</strong>
                      <Show when={c.line !== undefined}><span class="panel-hint"> (line {c.line})</span></Show>
                      <span class="panel-hint">: {c.detail}</span>
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={!printer()}>
              <div class="panel-group">
                <div>
                  <strong>Cutting data: {e().cuttingData.status}</strong>
                  <span class="panel-hint"> {e().process.rpm} rpm, F{e().process.feed}, plunge {e().process.plunge}, ap {e().process.stepdown} mm</span>
                  <Show when={e().cuttingData.recommended}>{(r) => <span class="panel-hint"> (kernel: {r().rpm} rpm, F{r().feed}, plunge {r().plunge}, ap {r().stepdown} mm)</span>}</Show>
                </div>
                <Show when={e().cuttingData.reference}>{(ref) => <CuttingReferenceView reference={ref()} />}</Show>
              </div>
            </Show>
            <div class="panel-mono">
              <div>NC sha256 {e().program.sha256} · {e().program.lines} lines · {e().program.cutLength} mm {printer() ? "of bead" : "cut"} · {e().program.estimatedSeconds} s</div>
              <div>inputs {e().inputs.digest} · {printer() ? "3D printer" : `${e().tool.type} Ø${e().tool.diameter} ${e().tool.flutes}F`} · {e().inputs.material}</div>
            </div>
          </div>
        </section>
      )}
    </Show>
  )
}
