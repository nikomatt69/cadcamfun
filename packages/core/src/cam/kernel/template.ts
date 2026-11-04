/**
 * CAM templates (spec 60 P1-P3): a shop writes down how it machines once; `applyTemplate` turns recognised features into an
 * explained list of ordinary kernel `OperationSpec`s. Pure: no job is run here, `planJob` is untouched, and a template can never
 * lower a safety claim (a rule that sets cutting speeds, feeds or engagement limits is refused at validation).
 *
 *  - `CamTemplate` / `validateTemplate`: Effect Schema shape plus semantic checks, every problem with its path.
 *  - `selectTool`: constraints over candidate cutters, minimum holder stick-out that clears, fewest tool changes, closest
 *    rejected candidate reported when none fits.
 *  - `applyTemplate`: rules fire by priority then specificity; `trace` says why each rule matched or not, `unmatched` lists every
 *    feature no rule handled, every operation carries its `origin` (template@version, rule, feature).
 */
import { Schema } from "effect"
import { evaluate, ExpressionError, namesIn } from "../../cad/expr.ts"
import type { OperationSpec } from "./contracts.ts"
import type { Cutter, CutterKind } from "./cutters.ts"
import { OperationSpecSchema } from "./schema.ts"

/** Feature kinds a rule may name: only kinds the recognition really produces (spec 60 §3.1). */
export const TEMPLATE_FEATURE_KINDS = ["hole", "pocket", "island", "outline", "face", "boss", "freeform"] as const
export type TemplateFeatureKind = typeof TEMPLATE_FEATURE_KINDS[number]

/** Strategies a recipe can build from a feature. */
export const TEMPLATE_STRATEGIES = ["face", "adaptive", "pocket", "profile", "bore", "drill", "thread", "chamfer"] as const
export type TemplateStrategy = typeof TEMPLATE_STRATEGIES[number]

/** Parameters a template must never set: they would override the cutting-data limits (power, torque, deflection) the claims rest on. */
export const TEMPLATE_FORBIDDEN_PARAMS: ReadonlySet<string> = new Set(["rpm", "feed", "plungeFeed", "radialEngagement", "coolant"])

const CUTTER_KINDS = ["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer", "countersink", "boringbar", "tslot", "dovetail", "tapered", "lollipop", "barrel", "lens"] as const

const Range = Schema.Struct({ min: Schema.optionalKey(Schema.Finite), max: Schema.optionalKey(Schema.Finite) })
export type TemplateRange = typeof Range.Type

const Value = Schema.Union([Schema.Finite, Schema.Boolean, Schema.String, Schema.Struct({ expr: Schema.String })])
export type TemplateValue = typeof Value.Type

const ToolRule = Schema.Struct({
  kinds: Schema.Array(Schema.Literals(CUTTER_KINDS)).check(Schema.isMinLength(1)),
  /** Diameter range, mm. Expressions are not allowed here: pick by number or by `diameterFraction` of the feature's `D` / `R`. */
  diameter: Schema.optionalKey(Range),
  /** The cutter's diameter must be at most this fraction of the feature's corner radius (`R`) times two, or of its diameter `D`. */
  maxFractionOf: Schema.optionalKey(Schema.Struct({ of: Schema.Literals(["D", "R"]), fraction: Schema.Finite })),
  /** Extra length beyond the feature depth the flutes and the holder must clear, mm (default 1). */
  clearance: Schema.optionalKey(Schema.Finite)
})
export type TemplateToolRule = typeof ToolRule.Type

const Recipe = Schema.Struct({
  strategy: Schema.Literals(TEMPLATE_STRATEGIES),
  tool: ToolRule,
  params: Schema.optionalKey(Schema.Record(Schema.String, Value))
})
export type TemplateRecipe = typeof Recipe.Type

const When = Schema.Struct({
  kind: Schema.Literals(TEMPLATE_FEATURE_KINDS),
  diameter: Schema.optionalKey(Range), depth: Schema.optionalKey(Range), depthOverDiameter: Schema.optionalKey(Range), cornerRadius: Schema.optionalKey(Range),
  through: Schema.optionalKey(Schema.Boolean),
  /** An ISO 286 fit such as `H7`: only a feature with this fit matches. */
  fit: Schema.optionalKey(Schema.String),
  material: Schema.optionalKey(Schema.Array(Schema.String))
})
export type TemplateWhen = typeof When.Type

const Rule = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60)),
  when: When,
  then: Schema.Array(Recipe).check(Schema.isMinLength(1)),
  priority: Schema.Finite,
  /** Another matching rule of lower precedence still fires when `false` (additive rules such as deburring). Default `true`: this rule handles the feature. */
  exclusive: Schema.optionalKey(Schema.Boolean),
  because: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(400))
})
export type TemplateRule = typeof Rule.Type

export const CamTemplateSchema = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  applies: Schema.optionalKey(Schema.Struct({
    process: Schema.optionalKey(Schema.Literals(["milling", "turning", "printing"])),
    machines: Schema.optionalKey(Schema.Array(Schema.String)),
    materials: Schema.optionalKey(Schema.Array(Schema.String))
  })),
  rules: Schema.Array(Rule).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  defaults: Schema.optionalKey(Schema.Record(Schema.String, Schema.Finite))
})
export type CamTemplate = typeof CamTemplateSchema.Type

/** What recognition tells a rule about one feature (CAD world mm, same coordinates as the plan). */
export interface TemplateFeature {
  readonly id: string
  readonly kind: TemplateFeatureKind
  /** Hole / boss / bore diameter. */
  readonly diameter?: number
  readonly depth?: number
  readonly top: number
  readonly bottom: number
  readonly cornerRadius?: number
  readonly through?: boolean
  readonly fit?: string
  /** Hole or bore centres. */
  readonly points?: ReadonlyArray<{ readonly x: number; readonly y: number }>
  /** Pocket / outline boundary, islands for a pocket. */
  readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number }>
  readonly islands?: ReadonlyArray<ReadonlyArray<{ readonly x: number; readonly y: number }>>
}

export interface TemplateProblem { readonly path: string; readonly message: string }

const FEATURE_NAMES: ReadonlySet<string> = new Set(["D", "R", "depth", "top", "bottom", "pitch"])

const schemaProblems = (value: unknown): ReadonlyArray<TemplateProblem> => {
  try {
    Schema.decodeUnknownSync(CamTemplateSchema)(value)
    return []
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    // The schema error is multi-line with `at ["rules"][0]...` paths; keep each line that names one as a separate problem.
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    const out: TemplateProblem[] = []
    for (let i = 0; i < lines.length; i++) {
      const at = /^at (.+)$/.exec(lines[i]!)
      if (at !== null) out.push({ path: at[1]!.replace(/\["?([^"\]]+)"?\]/g, ".$1").replace(/^\./, ""), message: lines[i - 1] ?? "invalid" })
    }
    return out.length > 0 ? out : [{ path: "", message: lines[0] ?? "invalid template" }]
  }
}

const checkExpr = (source: string, names: ReadonlySet<string>, path: string, out: TemplateProblem[]): void => {
  try {
    for (const n of namesIn(source)) if (!names.has(n)) out.push({ path, message: `unknown name '${n}' (feature names: ${[...names].join(", ")})` })
    // Evaluating with every name at 1 catches syntax and function errors; a division by a name is not an error here.
    evaluate(source, (n) => (names.has(n) ? 1 : undefined))
  } catch (e) {
    out.push({ path, message: e instanceof ExpressionError ? e.message : String(e) })
  }
}

/** Every problem of a stored template, each with the path of the field. Empty: the template can be saved and applied. */
export const validateTemplate = (value: unknown): ReadonlyArray<TemplateProblem> => {
  const shape = schemaProblems(value)
  if (shape.length > 0) return shape
  const t = value as CamTemplate
  const out: TemplateProblem[] = []
  const names = new Set<string>([...FEATURE_NAMES, ...Object.keys(t.defaults ?? {})])
  const ids = new Set<string>()
  t.rules.forEach((rule, ri) => {
    const base = `rules.${ri}`
    if (ids.has(rule.id)) out.push({ path: `${base}.id`, message: `duplicate rule id '${rule.id}'` })
    ids.add(rule.id)
    for (const [key, range] of Object.entries(rule.when) as Array<[string, unknown]>) {
      const r = range as { min?: number; max?: number } | undefined
      if (r !== undefined && typeof r === "object" && !Array.isArray(r) && r.min !== undefined && r.max !== undefined && r.min > r.max) out.push({ path: `${base}.when.${key}`, message: "min is above max" })
    }
    rule.then.forEach((recipe, qi) => {
      const rp = `${base}.then.${qi}`
      if (recipe.tool.diameter !== undefined && recipe.tool.diameter.min !== undefined && recipe.tool.diameter.max !== undefined && recipe.tool.diameter.min > recipe.tool.diameter.max) out.push({ path: `${rp}.tool.diameter`, message: "min is above max" })
      for (const [key, v] of Object.entries(recipe.params ?? {})) {
        if (TEMPLATE_FORBIDDEN_PARAMS.has(key)) out.push({ path: `${rp}.params.${key}`, message: `'${key}' belongs to the cutting data; a template cannot set it` })
        if (typeof v === "object") checkExpr(v.expr, names, `${rp}.params.${key}.expr`, out)
      }
    })
  })
  return out
}

/* ------------------------------------------------------------------------------------------------------------------------- */

export interface ToolConstraints {
  readonly kinds: ReadonlyArray<CutterKind>
  readonly diameter?: TemplateRange
  /** Depth the flutes and the holder must reach below the holder face, mm (feature depth plus clearance). */
  readonly reach: number
  readonly maxDiameter?: number
}

/** A cutter of the tool table with how far its holder may be pulled out. */
export interface ToolCandidate {
  readonly cutter: Cutter
  /** Longest stick-out the holder allows, mm (default: the cutter's own). */
  readonly maxStickout?: number
  /** Stick-out is raised in steps of this size, mm (default 5). */
  readonly stickoutStep?: number
}

export type ToolSelection =
  | { readonly status: "ok"; readonly cutter: Cutter; readonly reused: boolean; readonly stickoutRaised: boolean }
  | { readonly status: "no-tool"; readonly constraint: string; readonly closest?: string }

/**
 * Chooses a cutter for a recipe. The stick-out is the smallest of the candidate's steps that clears `reach` (the minimum, never
 * more); a candidate whose flutes are shorter than `reach` is refused. Ties go to a tool already chosen (fewer tool changes), then
 * the larger diameter (stiffer), then the id. With no candidate the result names the failed constraint of the closest one.
 */
export const selectTool = (constraints: ToolConstraints, candidates: ReadonlyArray<ToolCandidate>, alreadyChosen: ReadonlySet<string> = new Set()): ToolSelection => {
  const fits: Array<{ cutter: Cutter; reused: boolean; raised: boolean }> = []
  const rejected: Array<{ id: string; failed: string; score: number }> = []
  for (const cand of candidates) {
    const c = cand.cutter
    const fail = (failed: string, score: number): void => { rejected.push({ id: c.id, failed, score }) }
    if (!constraints.kinds.includes(c.kind)) { fail(`kind ${c.kind} is not one of ${constraints.kinds.join(", ")}`, 0); continue }
    const d = constraints.diameter
    if (d?.min !== undefined && c.diameter < d.min) { fail(`diameter ${c.diameter} is under ${d.min}`, 1); continue }
    if (d?.max !== undefined && c.diameter > d.max) { fail(`diameter ${c.diameter} is over ${d.max}`, 1); continue }
    if (constraints.maxDiameter !== undefined && c.diameter > constraints.maxDiameter + 1e-9) { fail(`diameter ${c.diameter} is over ${constraints.maxDiameter.toFixed(3)} (feature limit)`, 1); continue }
    if (c.fluteLength < constraints.reach) { fail(`flute length ${c.fluteLength} is under the reach ${constraints.reach}`, 2); continue }
    const limit = Math.max(cand.maxStickout ?? c.stickout, c.stickout)
    const step = cand.stickoutStep ?? 5
    let stick = c.stickout
    while (stick < constraints.reach && stick < limit) stick = Math.min(limit, stick + step)
    if (stick < constraints.reach) { fail(`stick-out ${limit} (maximum) is under the reach ${constraints.reach}`, 3); continue }
    fits.push({ cutter: stick === c.stickout ? c : { ...c, stickout: stick }, reused: alreadyChosen.has(c.id), raised: stick > c.stickout })
  }
  if (fits.length === 0) {
    const closest = [...rejected].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0]
    return closest === undefined ? { status: "no-tool", constraint: "the tool table is empty" } : { status: "no-tool", constraint: closest.failed, closest: closest.id }
  }
  fits.sort((a, b) => Number(b.reused) - Number(a.reused) || a.cutter.stickout - b.cutter.stickout || b.cutter.diameter - a.cutter.diameter || a.cutter.id.localeCompare(b.cutter.id))
  const best = fits[0]!
  return { status: "ok", cutter: best.cutter, reused: best.reused, stickoutRaised: best.raised }
}

/* ------------------------------------------------------------------------------------------------------------------------- */

export interface TemplateContext {
  readonly candidates: ReadonlyArray<ToolCandidate>
  /** Material class of the job (`P`, `M`, `K`, `N`, `S`, `H` or a name): matched against `when.material` and `applies.materials`. */
  readonly material: string
  readonly machine?: string
}

export interface OperationOrigin { readonly template: string; readonly version: number; readonly rule: string; readonly feature: string }
export interface TemplateOperation { readonly spec: OperationSpec; readonly origin: OperationOrigin; /** Why the rule fired. */ readonly because: string }

export interface TraceEntry {
  readonly feature: string
  readonly rule: string
  readonly verdict: "fired" | "no-match" | "no-tool" | "shadowed"
  readonly reason: string
}

export interface TemplateResult {
  readonly operations: ReadonlyArray<TemplateOperation>
  /** Tools chosen, in order of first use. */
  readonly tools: ReadonlyArray<Cutter>
  readonly notes: ReadonlyArray<string>
  /** Features no rule handled (nothing is dropped silently). */
  readonly unmatched: ReadonlyArray<string>
  readonly trace: ReadonlyArray<TraceEntry>
  /** Refusals of the template itself (does not apply, invalid). Operations are empty when set. */
  readonly refused?: string
}

const inRange = (r: TemplateRange | undefined, v: number | undefined): string | undefined => {
  if (r === undefined) return undefined
  if (v === undefined) return "the feature has no such value"
  if (r.min !== undefined && v < r.min) return `${v} is under ${r.min}`
  if (r.max !== undefined && v > r.max) return `${v} is over ${r.max}`
  return undefined
}

const specificity = (w: TemplateWhen): number => Object.keys(w).length

/** The first reason the rule does not match the feature, or undefined when it does. */
const mismatch = (w: TemplateWhen, f: TemplateFeature, material: string): string | undefined => {
  if (w.kind !== f.kind) return `kind ${f.kind} is not ${w.kind}`
  const checks: Array<[string, string | undefined]> = [
    ["diameter", inRange(w.diameter, f.diameter)], ["depth", inRange(w.depth, f.depth)], ["cornerRadius", inRange(w.cornerRadius, f.cornerRadius)],
    ["depth/diameter", inRange(w.depthOverDiameter, f.depth !== undefined && f.diameter !== undefined && f.diameter > 0 ? f.depth / f.diameter : undefined)]
  ]
  for (const [name, why] of checks) if (why !== undefined) return `${name}: ${why}`
  if (w.through !== undefined && f.through !== w.through) return `through is ${String(f.through)}, the rule wants ${w.through}`
  if (w.fit !== undefined && f.fit !== w.fit) return `fit is ${f.fit ?? "none"}, the rule wants ${w.fit}`
  if (w.material !== undefined && !w.material.includes(material)) return `material ${material} is not in ${w.material.join(", ")}`
  return undefined
}

const scopeOf = (f: TemplateFeature, defaults: Readonly<Record<string, number>>) => (name: string): number | undefined => {
  switch (name) {
    case "D": return f.diameter
    case "R": return f.cornerRadius ?? (f.diameter !== undefined ? f.diameter / 2 : undefined)
    case "depth": return f.depth ?? f.top - f.bottom
    case "top": return f.top
    case "bottom": return f.bottom
    default: return defaults[name]
  }
}

const num = (v: TemplateValue, scope: (n: string) => number | undefined): number | boolean | string => (typeof v === "object" ? evaluate(v.expr, scope) : v)

/** The geometry fields of a strategy come from the feature; the recipe's params add the numeric choices. */
const specFor = (strategy: TemplateStrategy, id: string, tool: string, f: TemplateFeature, p: Readonly<Record<string, number | boolean | string>>): OperationSpec | string => {
  const base = { id, tool, ...(p.stepdown !== undefined ? { stepdown: Number(p.stepdown) } : {}), ...(p.stepover !== undefined ? { stepover: Number(p.stepover) } : {}) }
  const allowance = p.allowance !== undefined ? { allowance: Number(p.allowance) } : {}
  const ring = f.boundary
  switch (strategy) {
    case "face": return { ...base, strategy: "face", bottom: f.bottom }
    case "drill": {
      if (f.points === undefined || f.points.length === 0) return "the feature has no hole centres"
      const cut = p.cut as "drill" | "spot" | "tap" | "ream" | undefined
      return { ...base, strategy: "drill", points: f.points.map((q) => ({ x: q.x, y: q.y })), top: f.top, bottom: p.bottom !== undefined ? Number(p.bottom) : f.bottom, ...(cut !== undefined ? { cut } : {}) }
    }
    case "bore": {
      const c = f.points?.[0]
      if (c === undefined || f.diameter === undefined) return "a bore needs a centre and a diameter"
      return { ...base, strategy: "bore", center: { x: c.x, y: c.y }, diameter: f.diameter, top: f.top, bottom: f.bottom, ...allowance }
    }
    case "pocket": case "adaptive": {
      if (ring === undefined) return "the feature has no boundary"
      const region = { boundary: ring.map((q) => ({ x: q.x, y: q.y })), ...(f.islands !== undefined && f.islands.length > 0 ? { islands: f.islands.map((i) => i.map((q) => ({ x: q.x, y: q.y }))) } : {}) }
      return strategy === "pocket"
        ? { ...base, strategy: "pocket", region, top: f.top, bottom: f.bottom, ...allowance, ...(p.finish !== undefined ? { finish: Boolean(p.finish) } : {}) }
        : { ...base, strategy: "adaptive", region, top: f.top, bottom: f.bottom, ...allowance }
    }
    case "profile": {
      if (ring === undefined) return "the feature has no boundary"
      const side = p.side === "inside" ? "inside" : "outside"
      return { ...base, strategy: "profile", loop: ring.map((q) => ({ x: q.x, y: q.y })), side, top: f.top, bottom: f.bottom, ...allowance, ...(p.finish !== undefined ? { finish: Boolean(p.finish) } : {}) }
    }
    case "chamfer": {
      if (ring === undefined) return "the feature has no boundary"
      return { ...base, strategy: "chamfer", loops: [{ points: ring.map((q) => ({ x: q.x, y: q.y })), side: p.side === "inside" ? "inside" : "outside" }], top: f.top, width: p.width !== undefined ? Number(p.width) : 0.5 }
    }
    case "thread": {
      const c = f.points?.[0]
      if (c === undefined || f.diameter === undefined || p.pitch === undefined) return "a thread needs a centre, a diameter and a pitch"
      return { ...base, strategy: "thread", center: { x: c.x, y: c.y }, diameter: f.diameter, pitch: Number(p.pitch), internal: p.internal !== false, top: f.top, length: f.depth ?? f.top - f.bottom }
    }
  }
}

/**
 * Applies a template to recognised features. Rules fire per feature by priority (higher first), then by specificity (more `when`
 * conditions first); the first matching exclusive rule that finds its tools handles the feature, non-exclusive rules before it fire
 * too. Operations are checked against `OperationSpecSchema`; a recipe that fails is reported in `trace` and not emitted.
 */
export const applyTemplate = (template: CamTemplate, features: ReadonlyArray<TemplateFeature>, context: TemplateContext): TemplateResult => {
  const problems = validateTemplate(template)
  if (problems.length > 0) return { operations: [], tools: [], notes: [], unmatched: features.map((f) => f.id), trace: [], refused: `invalid template: ${problems.slice(0, 3).map((p) => `${p.path}: ${p.message}`).join("; ")}` }
  const applies = template.applies
  if (applies?.machines !== undefined && context.machine !== undefined && !applies.machines.includes(context.machine)) {
    return { operations: [], tools: [], notes: [], unmatched: features.map((f) => f.id), trace: [], refused: `template '${template.name}' does not apply to machine ${context.machine}` }
  }
  if (applies?.materials !== undefined && !applies.materials.includes(context.material)) {
    return { operations: [], tools: [], notes: [], unmatched: features.map((f) => f.id), trace: [], refused: `template '${template.name}' does not apply to material ${context.material}` }
  }
  const rules = [...template.rules].sort((a, b) => b.priority - a.priority || specificity(b.when) - specificity(a.when) || a.id.localeCompare(b.id))
  const defaults = template.defaults ?? {}
  const operations: TemplateOperation[] = []
  const trace: TraceEntry[] = []
  const notes: string[] = []
  const unmatched: string[] = []
  const chosen = new Map<string, Cutter>()
  for (const f of features) {
    let handled = false
    let done = false
    for (const rule of rules) {
      if (done) { if (mismatch(rule.when, f, context.material) === undefined) trace.push({ feature: f.id, rule: rule.id, verdict: "shadowed", reason: "a higher rule already handled the feature" }); continue }
      const why = mismatch(rule.when, f, context.material)
      if (why !== undefined) { trace.push({ feature: f.id, rule: rule.id, verdict: "no-match", reason: why }); continue }
      const scope = scopeOf(f, defaults)
      const emitted: TemplateOperation[] = []
      let failure: string | undefined
      rule.then.forEach((recipe, qi) => {
        if (failure !== undefined) return
        let params: Record<string, number | boolean | string>
        try {
          params = Object.fromEntries(Object.entries(recipe.params ?? {}).map(([k, v]) => [k, num(v, scope)]))
        } catch (e) { failure = `recipe ${qi}: ${e instanceof Error ? e.message : String(e)}`; return }
        // How far below the holder face the cutter must reach: down to the recipe's own bottom, nothing for a surface-skimming cut.
        const cutDepth = recipe.strategy === "chamfer" || recipe.strategy === "face" ? 0 : typeof params.bottom === "number" ? f.top - params.bottom : f.depth ?? f.top - f.bottom
        const reach = cutDepth + (recipe.tool.clearance ?? 1)
        const frac = recipe.tool.maxFractionOf
        const limitBase = frac === undefined ? undefined : frac.of === "D" ? f.diameter : f.cornerRadius !== undefined ? f.cornerRadius * 2 : undefined
        const sel = selectTool({ kinds: recipe.tool.kinds, ...(recipe.tool.diameter !== undefined ? { diameter: recipe.tool.diameter } : {}), reach, ...(limitBase !== undefined && frac !== undefined ? { maxDiameter: limitBase * frac.fraction } : {}) }, context.candidates, new Set(chosen.keys()))
        if (sel.status === "no-tool") { failure = `no tool for recipe ${qi}: ${sel.constraint}${sel.closest !== undefined ? ` (closest: ${sel.closest})` : ""}`; return }
        const id = `${rule.id}.${f.id}.${qi}`
        const built = specFor(recipe.strategy, id, sel.cutter.id, f, params)
        if (typeof built === "string") { failure = `recipe ${qi}: ${built}`; return }
        try { Schema.decodeUnknownSync(OperationSpecSchema)(built) } catch (e) { failure = `recipe ${qi} gives an invalid operation: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`; return }
        const prior = chosen.get(sel.cutter.id)
        // A tool reused with a longer stick-out than first chosen replaces the first choice, so the tool table has one entry per id.
        if (prior === undefined || sel.cutter.stickout > prior.stickout) chosen.set(sel.cutter.id, sel.cutter)
        if (sel.stickoutRaised) notes.push(`${id}: holder stick-out raised to ${sel.cutter.stickout} mm to reach ${reach.toFixed(2)} mm`)
        emitted.push({ spec: built, origin: { template: template.name, version: template.version, rule: rule.id, feature: f.id }, because: rule.because })
      })
      if (failure !== undefined) { trace.push({ feature: f.id, rule: rule.id, verdict: "no-tool", reason: failure }); notes.push(`${rule.id} on ${f.id}: ${failure}`); continue }
      operations.push(...emitted)
      trace.push({ feature: f.id, rule: rule.id, verdict: "fired", reason: rule.because })
      handled = true
      if (rule.exclusive !== false) done = true
    }
    if (!handled) unmatched.push(f.id)
  }
  return { operations, tools: [...chosen.values()], notes, unmatched, trace }
}

/* ------------------------------------------------------------------------------------------------------------------------- */
/* Capture from a program (spec 60 P4)                                                                                         */

export interface CaptureResult {
  readonly template: CamTemplate
  /** Operations that map to exactly one feature and became recipes. */
  readonly captured: ReadonlyArray<string>
  /** Operations left out, each with the reason (maps to no feature or to several, or has a strategy a recipe cannot build). */
  readonly notCaptured: ReadonlyArray<{ readonly operation: string; readonly reason: string }>
}

type P2 = { readonly x: number; readonly y: number }
const same2 = (a: P2, b: P2): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
const sameRing = (a: ReadonlyArray<P2>, b: ReadonlyArray<P2>): boolean => a.length === b.length && a.every((p, i) => same2(p, b[i]!))

/** The features an operation's geometry belongs to. */
const featuresOf = (op: OperationSpec, features: ReadonlyArray<TemplateFeature>): ReadonlyArray<TemplateFeature> => {
  switch (op.strategy) {
    case "drill": return features.filter((f) => f.kind === "hole" && f.points !== undefined && op.points.every((p) => f.points!.some((q) => same2(p, q))))
    case "pocket": case "adaptive": return features.filter((f) => f.kind === "pocket" && f.boundary !== undefined && sameRing(f.boundary, op.region.boundary))
    case "profile": return features.filter((f) => (f.kind === "outline" || f.kind === "boss" || f.kind === "island") && f.boundary !== undefined && sameRing(f.boundary, op.loop))
    case "chamfer": return features.filter((f) => f.boundary !== undefined && op.loops.some((l) => sameRing(f.boundary!, l.points)))
    case "bore": case "thread": return features.filter((f) => f.points?.[0] !== undefined && same2(f.points[0], op.center))
    case "face": return features.filter((f) => f.kind === "face")
    default: return []
  }
}

/**
 * Generalises a program into a template: an operation that maps to exactly one feature becomes a recipe of a rule for features of
 * that kind and size; numbers that follow the feature (a drill bottom offset from the feature's bottom) become expressions. The
 * result is conservative: it reproduces the program on the same part and on parts with features of equal kind and size, and it
 * says which operations it left out. Not a proof that the generalisation suits other parts.
 */
export const captureTemplate = (name: string, operations: ReadonlyArray<OperationSpec>, features: ReadonlyArray<TemplateFeature>, cutters: ReadonlyArray<Cutter>): CaptureResult => {
  const rules = new Map<string, TemplateRule>()
  const captured: string[] = []
  const notCaptured: Array<{ operation: string; reason: string }> = []
  for (const op of operations) {
    const hit = featuresOf(op, features)
    if (hit.length !== 1) { notCaptured.push({ operation: op.id, reason: hit.length === 0 ? "its geometry belongs to no recognised feature" : `its geometry belongs to ${hit.length} features` }); continue }
    const f = hit[0]!
    const cutter = cutters.find((c) => c.id === op.tool)
    if (cutter === undefined) { notCaptured.push({ operation: op.id, reason: `tool ${op.tool} is not in the tool table` }); continue }
    if (op.strategy === "thread" || op.strategy === "engrave" || op.strategy === "surface" || op.strategy === "multiaxis" || op.strategy === "probe") { notCaptured.push({ operation: op.id, reason: `a ${op.strategy} operation cannot be a recipe` }); continue }
    const params: Record<string, TemplateValue> = {}
    if (op.stepdown !== undefined) params.stepdown = op.stepdown
    if (op.stepover !== undefined) params.stepover = op.stepover
    if ("allowance" in op && op.allowance !== undefined) params.allowance = op.allowance
    if (op.strategy === "drill") {
      if (op.cut !== undefined && op.cut !== "drill") params.cut = op.cut
      const delta = op.bottom - f.bottom
      if (Math.abs(delta) > 1e-9) params.bottom = { expr: `bottom ${delta < 0 ? "-" : "+"} ${Math.abs(delta)}` }
    }
    if (op.strategy === "profile") { params.side = op.side; if (op.finish !== undefined) params.finish = op.finish }
    if (op.strategy === "pocket" && op.finish !== undefined) params.finish = op.finish
    if (op.strategy === "chamfer") params.width = op.width
    const key = `captured-${f.id}`
    const existing = rules.get(key)
    const recipe: TemplateRecipe = { strategy: op.strategy, tool: { kinds: [cutter.kind], diameter: { min: cutter.diameter, max: cutter.diameter } }, params }
    if (existing !== undefined) { rules.set(key, { ...existing, then: [...existing.then, recipe] }); captured.push(op.id); continue }
    const when: TemplateWhen = {
      kind: f.kind,
      ...(f.diameter !== undefined ? { diameter: { min: f.diameter, max: f.diameter } } : {}),
      ...(f.depth !== undefined ? { depth: { min: f.depth, max: f.depth } } : {}),
      ...(f.through !== undefined ? { through: f.through } : {})
    }
    rules.set(key, { id: key, when, then: [recipe], priority: 10, because: `captured from the program: ${op.name ?? op.id}` })
    captured.push(op.id)
  }
  const template: CamTemplate = { name, version: 1, rules: [...rules.values()] }
  return { template, captured, notCaptured }
}
