/**
 * The steps a workflow can `uses:`. A step is a pure function of the commit being checked (`ctx.files`)
 * and its own `with:` parameters — never of the live database — so a run always reports on the exact
 * tree that was pushed, not on whatever the working copy holds when the step happens to execute.
 *
 * Steps come in two kinds:
 *
 *  - **pure** steps, which need nothing but those files and `@cadcamfun/core`. They are `builtinSteps`
 *    and work in every layer that builds the runner, including tests that never start the assistant.
 *  - **service-backed** steps, which need a service the runner cannot depend on without a cycle (the
 *    assistant is built *above* the runner). They are added with `WorkflowRunner.register` once their
 *    service exists, so a workflow naming one is a hard error until then, never a silent no-op.
 */
import { cam } from "@cadcamfun/core"
import { filesToSnapshot, toText, type Entity } from "@cadcamfun/vcs"
import { Effect } from "effect"
import { StepError, type StepRegistry } from "@cadcamfun/workflow"
import type { Actor } from "./project-vcs.ts"

/**
 * What a step sees: the commit being checked, never the live database.
 */
export interface StepContext {
  readonly projectId: string
  readonly ref: string
  readonly sha: string
  readonly files: Readonly<Record<string, Uint8Array>>
  /** The account the run acts as; steps that write use it so history is attributed to the caller. */
  readonly actor: Actor
}

const WORKFLOW_DIR = ".cadcamfun/workflows/"

// ── `with:` parameters ────────────────────────────────────────────────────────
// Read defensively: a malformed parameter skips what it configures rather than failing the run, so a
// typo in one step never hides the verdict of the twenty steps before it.

const str = (w: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const v = w[key]
  return typeof v === "string" && v.trim() !== "" ? v : undefined
}
const num = (w: Readonly<Record<string, unknown>>, key: string): number | undefined => {
  const v = w[key]
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

// ── reading a toolpath out of a commit ───────────────────────────────────────

/** The generator request stored beside a toolpath's G-code; `undefined` when it was never generated here. */
const requestOf = (toolpath: Entity): Record<string, unknown> | undefined => {
  const data = toolpath.data
  if (data === null || typeof data !== "object") return undefined
  const request = (data as Record<string, unknown>).request
  return request !== null && typeof request === "object" ? (request as Record<string, unknown>) : undefined
}

const gcodeOf = (toolpath: Entity): string | undefined => (typeof toolpath.gcode === "string" && toolpath.gcode !== "" ? toolpath.gcode : undefined)

const label = (toolpath: Entity): string => (typeof toolpath.name === "string" && toolpath.name !== "" ? toolpath.name : toolpath.id)

/** Toolpaths of the commit, narrowed to one id when the step names it. */
const selected = (ctx: StepContext, w: Readonly<Record<string, unknown>>): readonly Entity[] => {
  const all = filesToSnapshot(ctx.files).toolpaths
  const only = str(w, "toolpath")
  return only === undefined ? all : all.filter((t) => t.id === only)
}

// ── built-in steps ───────────────────────────────────────────────────────────

/**
 * Every entity file must be valid JSON with an `id` matching its file name and a `name`.
 * Workflow YAML is not re-checked here: `WorkflowRunner` parses it before any step runs, and an
 * unparseable one is recorded as an `invalid` run rather than as this step's verdict.
 */
const projectValidate: StepRegistry<StepContext>["project/validate"] = ({ ctx }) =>
  Effect.gen(function*() {
    const issues: string[] = []
    for (const [path, bytes] of Object.entries(ctx.files)) {
      if (path.startsWith(WORKFLOW_DIR) || !path.endsWith(".json")) continue
      const parsed = yield* Effect.try({ try: () => JSON.parse(toText(bytes)) as Record<string, unknown>, catch: () => new StepError({ message: `${path} is not valid JSON` }) })
      const m = /^(drawings|components|toolpaths)\/(.+)\.json$/.exec(path)
      if (m && parsed.id !== m[2]) issues.push(`${path}: id does not match file name`)
      if (m && typeof parsed.name !== "string") issues.push(`${path}: missing name`)
    }
    if (issues.length > 0) return yield* new StepError({ message: issues.join("; ") })
    const snap = filesToSnapshot(ctx.files)
    return { issues: 0, drawings: snap.drawings.length, workflows: Object.keys(ctx.files).filter((p) => p.startsWith(WORKFLOW_DIR) && /\.ya?ml$/.test(p)).length }
  })

/** Fails when a toolpath in the commit has no G-code, i.e. the export is stale or was never run. */
const projectRequireGcode: StepRegistry<StepContext>["project/require-gcode"] = ({ ctx }) =>
  Effect.gen(function*() {
    const toolpaths = filesToSnapshot(ctx.files).toolpaths
    const missing = toolpaths.filter((t) => !gcodeOf(t)).map((t) => t.id)
    if (missing.length > 0) return yield* new StepError({ message: `Toolpaths without G-code: ${missing.join(", ")}` })
    return { toolpaths: toolpaths.length }
  })

/**
 * `cam/verify` — replays every committed G-code program through the reference interpreter and fails on
 * anything that could ruin the part or the machine: a rapid inside the stock, a gouge, a shank or
 * fixture collision, material left behind. This is the step that makes a run worth trusting: everything
 * else in a commit is a declaration, this one is evidence.
 *
 * `with: { toolpath?, tolerance?, severity? }` — `severity` is `error` (default) or `warning`.
 * A program that cannot be verified (a lathe job, no stored generation request) is reported as skipped,
 * never as passing: an unverifiable toolpath is not a verified one.
 */
export const camVerify: StepRegistry<StepContext>["cam/verify"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const severity = str(w, "severity") ?? "error"
    const tolerance = num(w, "tolerance")
    const toolpaths = selected(ctx, w)
    const issues: string[] = []
    const skipped: string[] = []
    let verified = 0
    for (const toolpath of toolpaths) {
      const name = label(toolpath)
      const gcode = gcodeOf(toolpath)
      const request = requestOf(toolpath)
      if (gcode === undefined) { skipped.push(`${name}: no G-code in the commit`); continue }
      if (request === undefined) { skipped.push(`${name}: no generation request stored`); continue }
      const built = cam.verify.verifyRequestFor(request as never, gcode, { ...(tolerance !== undefined ? { tolerance } : {}) })
      if (!built.ok) { skipped.push(`${name}: ${built.error}`); continue }
      const report = cam.verify.verifyToolpath(built.request)
      verified++
      for (const issue of report.issues) {
        if (issue.severity === "error" || (severity === "warning" && issue.severity === "warning")) {
          issues.push(`${name}: ${issue.message}${issue.line === undefined ? "" : ` (line ${issue.line})`}`)
        }
      }
    }
    if (issues.length > 0) return yield* new StepError({ message: issues.join("; ") })
    return { verified, toolpaths: toolpaths.length, skipped }
  })

/**
 * `cam/gcode` — regenerates every committed program from the generation request stored with it and
 * compares the result against the G-code that is actually in the commit. They must match: a program
 * whose settings were edited without regenerating is a stale export, and shipping it cuts something
 * other than what the commit describes.
 *
 * `with: { toolpath? }` — one program instead of all of them.
 */
export const camGcode: StepRegistry<StepContext>["cam/gcode"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const stale: string[] = []
    const skipped: string[] = []
    let matched = 0
    const toolpaths = selected(ctx, w)
    for (const toolpath of toolpaths) {
      const name = label(toolpath)
      const gcode = gcodeOf(toolpath)
      const request = requestOf(toolpath)
      if (gcode === undefined) { skipped.push(`${name}: no G-code in the commit`); continue }
      if (request === undefined) { skipped.push(`${name}: no generation request stored`); continue }
      // `stamp` is deliberately dropped: it is a header comment, not part of what is being checked.
      const outcome = cam.generator.generateToolpath({ ...request, stamp: undefined } as never)
      if (outcome.error !== undefined) { skipped.push(`${name}: ${outcome.error}`); continue }
      if (outcome.response.gcode.trim() === gcode.trim()) matched++
      else stale.push(`${name}: the committed G-code does not match its generation request`)
    }
    if (stale.length > 0) return yield* new StepError({ message: stale.join("; ") })
    return { matched, toolpaths: toolpaths.length, skipped }
  })

/**
 * `cam/sequence` — checks the operation chain a commit describes, from the generation requests stored with each
 * toolpath (the same source `cam/gcode` regenerates from). Two invariants that ruin a part or a machine:
 *
 *  - one tool number must name one tool: a `TN` used by two different diameters or types is a collision waiting to
 *    happen at the tool change;
 *  - a rest-machining operation (`useRestMachining`) must name a previous tool larger than its own
 *    (`restToolDiameter` > `toolDiameter`); a smaller or equal one has nothing to leave behind.
 *
 * Pure: reads only the commit. `with: { toolpath? }` narrows it to one program.
 */
export const camSequence: StepRegistry<StepContext>["cam/sequence"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const toolpaths = selected(ctx, w)
    const issues: string[] = []
    const toolsByNumber = new Map<number, Set<string>>()
    for (const toolpath of toolpaths) {
      const request = requestOf(toolpath)
      if (request === undefined) continue
      const settings = (request.settings ?? {}) as Record<string, unknown>
      const name = label(toolpath)
      const toolNumber = typeof settings.toolNumber === "number" ? settings.toolNumber : undefined
      const diameter = typeof settings.toolDiameter === "number" ? settings.toolDiameter : undefined
      const toolType = typeof settings.toolType === "string" ? settings.toolType : "?"
      if (toolNumber !== undefined && diameter !== undefined) {
        const set = toolsByNumber.get(toolNumber) ?? new Set<string>()
        set.add(`${toolType} ${diameter} mm`)
        toolsByNumber.set(toolNumber, set)
      }
      const rest = typeof settings.restToolDiameter === "number" ? settings.restToolDiameter : undefined
      if (settings.useRestMachining === true && rest !== undefined && diameter !== undefined && rest <= diameter) {
        issues.push(`${name}: rest machining needs a previous tool larger than ${diameter} mm, but restToolDiameter is ${rest} mm`)
      }
    }
    for (const [number, tools] of toolsByNumber) if (tools.size > 1) issues.push(`T${number} is two tools: ${[...tools].join(", ")}`)
    if (issues.length > 0) return yield* new StepError({ message: issues.join("; ") })
    return { toolpaths: toolpaths.length, tools: toolsByNumber.size }
  })

/**
 * The steps that need nothing but the commit. They are pure, so they are available to every layer that
 * builds the runner — including the tests that never start the assistant.
 */
export const builtinSteps: StepRegistry<StepContext> = {
  "project/validate": projectValidate,
  "project/require-gcode": projectRequireGcode,
  "cam/verify": camVerify,
  "cam/gcode": camGcode,
  "cam/sequence": camSequence,
}