/**
 * STEP AP242 export (spec 72 P4-1, P4-3): the exact B-rep writer's file with
 *  - the AP242 schema name (`AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF`),
 *  - a colour per solid (`COLOUR_RGB` -> `STYLED_ITEM`, collected in a `MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION`),
 *  - a presentation layer per solid (`PRESENTATION_LAYER_ASSIGNMENT`),
 *  - the PMI set of the model as the repository's semantic PMI subset (`pmi/step-pmi.ts`: dimensional size/location, geometric
 *    tolerance, datum, surface texture, notes, with their face/edge refs and a text fallback per annotation).
 *
 * Honest limits: the PMI instances are the subset of `pmiToStep`, not the full ISO 10303-47/-109 graph (no
 * `DIMENSIONAL_CHARACTERISTIC_REPRESENTATION` tree, no presentation geometry); `readStepBreps` ignores them and `stepToPmi` reads them back.
 * No validation properties are written. The file has not been read by a third-party AP242 reader in this repository's tests.
 */
import { writeStepBreps, type StepWriteOptions } from "../brep/step.ts"
import type { Brep } from "../brep/brep.ts"
import { pmiToStep } from "../../pmi/step-pmi.ts"
import type { PmiSet } from "../../pmi/pmi.ts"

export const AP242_SCHEMA = "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }"

export interface Ap242Part {
  readonly name: string
  readonly brep: Brep
  /** Colour, each channel 0..1. */
  readonly colour?: { readonly r: number; readonly g: number; readonly b: number }
  /** Presentation layer name. */
  readonly layer?: string
}

export interface Ap242Options extends StepWriteOptions {
  readonly pmi?: PmiSet
}

const str = (s: string): string => `'${s.replace(/'/g, "''")}'`
const chan = (v: number): string => {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`STEP colour channel ${v} is outside 0..1`)
  const s = String(Math.round(v * 1e6) / 1e6)
  return s.includes(".") ? s : `${s}.`
}

/** Writes parts as an AP242 file with colours, layers and semantic PMI. Throws like `writeStepBreps` for loose bodies. */
export const writeStepAp242 = (parts: ReadonlyArray<Ap242Part>, options: Ap242Options = {}): string => {
  const base = writeStepBreps(parts.map((p) => ({ name: p.name, brep: p.brep })), options)
  const lines = base.split("\n")
  const si = lines.findIndex((l) => l.startsWith("FILE_SCHEMA"))
  if (si < 0) throw new Error("STEP writer output has no FILE_SCHEMA")
  lines[si] = `FILE_SCHEMA((${str(AP242_SCHEMA)}));`
  const end = lines.lastIndexOf("ENDSEC;")
  let maxId = 0
  const solids = new Map<string, number>()
  let context = 0
  for (const l of lines) {
    const m = /^#(\d+)=(.*);$/.exec(l)
    if (m === null) continue
    const id = Number(m[1])
    maxId = Math.max(maxId, id)
    const solid = /^(?:MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS|SHELL_BASED_SURFACE_MODEL)\('((?:[^']|'')*)'/.exec(m[2]!)
    if (solid !== null) solids.set(solid[1]!.replace(/''/g, "'"), id)
    if (context === 0 && m[2]!.includes("GEOMETRIC_REPRESENTATION_CONTEXT")) context = id
  }
  const add: string[] = []
  const next = (body: string): number => { add.push(`#${++maxId}=${body};`); return maxId }
  const styled: number[] = []
  for (const p of parts) {
    const solid = solids.get(p.name)
    if (solid === undefined) continue
    if (p.colour !== undefined) {
      const c = next(`COLOUR_RGB('',${chan(p.colour.r)},${chan(p.colour.g)},${chan(p.colour.b)})`)
      const fc = next(`FILL_AREA_STYLE_COLOUR('',#${c})`)
      const fa = next(`FILL_AREA_STYLE('',(#${fc}))`)
      const sf = next(`SURFACE_STYLE_FILL_AREA(#${fa})`)
      const ss = next(`SURFACE_SIDE_STYLE('',(#${sf}))`)
      const su = next(`SURFACE_STYLE_USAGE(.BOTH.,#${ss})`)
      const ps = next(`PRESENTATION_STYLE_ASSIGNMENT((#${su}))`)
      styled.push(next(`STYLED_ITEM('colour',(#${ps}),#${solid})`))
    }
  }
  if (styled.length > 0 && context > 0) next(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.map((s) => `#${s}`).join(",")}),#${context})`)
  const layers = new Map<string, number[]>()
  for (const p of parts) {
    const solid = solids.get(p.name)
    if (solid !== undefined && p.layer !== undefined) layers.set(p.layer, [...(layers.get(p.layer) ?? []), solid])
  }
  for (const [name, ids] of layers) next(`PRESENTATION_LAYER_ASSIGNMENT(${str(name)},'',(${ids.map((i) => `#${i}`).join(",")}))`)
  if (options.pmi !== undefined) {
    const offset = maxId
    for (const l of pmiToStep(options.pmi).split("\n")) {
      if (l === "") continue
      const m = /^#(\d+) = (.*)$/.exec(l)
      if (m === null) throw new Error(`unexpected PMI line: ${l}`)
      const id = offset + Number(m[1])
      add.push(`#${id}=${m[2]}`)
      maxId = Math.max(maxId, id)
    }
  }
  lines.splice(end, 0, ...add)
  return lines.join("\n")
}
