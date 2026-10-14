/**
 * Evidence of the last generated program (`cam.generator.programRecord`): the result, every check run on the exact NC with
 * the line it points at, where the cutting data comes from (the kernel's material table row and the factors applied), the
 * inputs digest and the NC's SHA-256. Shown open whenever a program exists; an edit of the NC after generation marks it stale.
 */
import { For, Show, type JSX } from "solid-js"
import { ShieldCheck } from "lucide-solid"
import type { cam } from "@cadcamfun/core"
import { useGeneratorStore } from "../../store/generatorStore.ts"

type Reference = NonNullable<cam.generator.ProgramRecord["cuttingData"]["reference"]>

const STATUS: Readonly<Record<string, { readonly mark: string; readonly tone: string }>> = {
  passed: { mark: "✓", tone: "text-emerald-700 dark:text-emerald-400" },
  failed: { mark: "✗", tone: "text-red-700 dark:text-red-400" },
  unresolved: { mark: "?", tone: "text-amber-700 dark:text-amber-400" },
  "not-run": { mark: "–", tone: "text-gray-500" }
}

const RESULT: Readonly<Record<string, string>> = {
  passed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  warnings: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
}

const CHECK_LABEL: Readonly<Record<string, string>> = {
  generated: "Program generated",
  "cutting-data": "Cutting data",
  "safe-height": "Safe height above the stock",
  "no-rapid-in-material": "No rapid in material",
  "tool-clearance": "Shank / holder clearance",
  "within-stock": "Within stock and fixtures",
  "no-gouge": "No gouge of the part",
  "nc-interpretation": "NC interpreted independently"
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
  return (
    <Show when={gen.evidence}>
      {(e) => (
        <div class="workstation-section mb-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs space-y-2" data-testid="program-evidence">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <ShieldCheck size={18} class="text-emerald-600" />
              <span class="text-sm font-semibold">Program evidence</span>
            </div>
            <span class={`px-2 py-0.5 rounded font-medium ${RESULT[e().result] ?? ""}`} data-testid="evidence-result">{e().result}</span>
          </div>
          <Show when={gen.evidenceStale}>
            <div class="p-2 rounded bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" data-testid="evidence-stale">
              The NC was edited after generation: this record describes the generated program, not the current text. Generate again to check it.
            </div>
          </Show>
          <ul class="space-y-1">
            <For each={e().checks}>
              {(c) => (
                <li class="flex gap-2" data-testid={`evidence-check-${c.id}`}>
                  <span class={`w-3 font-bold ${STATUS[c.status]?.tone ?? ""}`} title={c.status}>{STATUS[c.status]?.mark ?? "?"}</span>
                  <span>
                    <span class="font-medium">{CHECK_LABEL[c.id] ?? c.id}</span>
                    <Show when={c.line !== undefined}><span class="opacity-70"> (line {c.line})</span></Show>
                    <span class="opacity-80">: {c.detail}</span>
                  </span>
                </li>
              )}
            </For>
          </ul>
          <div class="p-2 rounded bg-gray-50 dark:bg-gray-900/40 space-y-1">
            <div>
              <span class="font-medium">Cutting data: {e().cuttingData.status}</span> — {e().process.rpm} rpm · F{e().process.feed} · plunge {e().process.plunge} · ap {e().process.stepdown} mm
              <Show when={e().cuttingData.recommended}>{(r) => <span class="opacity-80"> (kernel: {r().rpm} rpm · F{r().feed} · plunge {r().plunge} · ap {r().stepdown} mm)</span>}</Show>
            </div>
            <Show when={e().cuttingData.reference}>{(ref) => <CuttingReferenceView reference={ref()} />}</Show>
          </div>
          <div class="font-mono text-[10px] opacity-70 break-all">
            <div>NC sha256 {e().program.sha256} · {e().program.lines} lines · {e().program.cutLength} mm cut · {e().program.estimatedSeconds} s</div>
            <div>inputs {e().inputs.digest} · {e().tool.type} Ø{e().tool.diameter} {e().tool.flutes}F · {e().inputs.material}</div>
          </div>
        </div>
      )}
    </Show>
  )
}
