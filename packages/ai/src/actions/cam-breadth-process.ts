/**
 * `cam` reads of the breadth lane: the lathe planner (`cam.lathe`), engagement and feed optimisation (`cam.process`) and the post
 * tester (`cam.post_test`). All three are pure computations on what the call carries (or on a stored operation's program): nothing is
 * stored, every claim says what it is bounded by, and what the core refuses comes back as an error with its reason.
 */
import { cam } from "@cadcamfun/core"
import { CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { runKernelJob } from "../kernel-job.ts"
import { defineWireAction, type ActionContext, type ActionSpec } from "./action.ts"

const BASIS = "Kienzle starting values (handbook order of magnitude, not a supplier's data) and a stock sampled at the declared cell: uncalibrated, not a prediction of a real machine"

const limitsFor = async (name: string | undefined, context: ActionContext): Promise<cam.kernel.MachineLimits> => {
  const preset = name !== undefined ? cam.kernel.findMachine(name) : undefined
  if (preset !== undefined) return preset.limits
  const profile = await context.handlers.machine?.(context.projectId)
  const base = cam.kernel.DEFAULT_MACHINE.limits
  return { ...base, ...(profile?.maxSpindleSpeed ? { maxRpm: profile.maxSpindleSpeed } : {}), ...(profile?.maxFeedRate ? { maxFeed: profile.maxFeedRate } : {}) }
}

const head = (text: string, lines: number): string => text.split("\n").slice(0, lines).join("\n")

export const CAM_BREADTH_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cam.lathe", kind: "read", parameters: CAM_ACTION_INPUTS["cam.lathe"],
    run: (input, context) => runKernelJob("cam-lathe", input, context.signal !== undefined ? { signal: context.signal } : {})
  }),
  defineWireAction({
    id: "cam.process", kind: "read", parameters: CAM_ACTION_INPUTS["cam.process"],
    run: async (input, context) => {
      let gcode = input.gcode
      if (gcode === undefined) {
        if (input.operationId === undefined) return { ok: false, error: "Send gcode or operationId." }
        if (context.handlers.operationProgram === undefined) return { ok: false, error: "Stored programs are not available in this host: send the program text as gcode." }
        const stored = await context.handlers.operationProgram(context.projectId, input.operationId)
        if (!stored.ok) return stored
        gcode = stored.gcode
      }
      const material = cam.kernel.findMaterial(input.material)
      if (material === undefined) return { ok: false, error: `Unknown material '${input.material}': use cam materials` }
      const t = input.tool
      const cutter: cam.kernel.Cutter = {
        id: "process", name: `${t.kind ?? "flat"} Ø${t.diameter}`, kind: t.kind ?? "flat", diameter: t.diameter, flutes: t.flutes, material: "carbide", coating: material.iso === "N" ? "none" : "altin",
        fluteLength: t.fluteLength ?? 3 * t.diameter, shankDiameter: t.shankDiameter ?? t.diameter, stickout: t.stickout ?? Math.max(10, 4 * t.diameter + 10),
        ...(t.cornerRadius !== undefined ? { cornerRadius: t.cornerRadius } : {})
      }
      const issues = cam.kernel.cutterIssues(cutter)
      if (issues.length > 0) return { ok: false, error: issues.join("; ") }
      const machine = await limitsFor(input.machine, context)
      const read = cam.programOfNc(gcode)
      if (read.program === undefined) return { ok: false, error: `The program cannot be read for engagement: ${read.errors.join("; ")}` }
      const s = input.stock
      if (!(s.maxX > s.minX && s.maxY > s.minY && s.maxZ > s.minZ)) return { ok: false, error: "The stock block needs maxX > minX, maxY > minY and maxZ > minZ." }
      const cell = Math.max(0.1, Math.min(1, Math.max(s.maxX - s.minX, s.maxY - s.minY) / 400))
      if (((s.maxX - s.minX) / cell) * ((s.maxY - s.minY) / cell) > 4_000_000) return { ok: false, error: `The stock would have more than 4 000 000 columns at a ${cell} mm cell: send a larger cell.` }
      const rpm = input.rpm ?? cam.kernel.cuttingData({ material, cutter, cut: "rough-side", machine }).rpm
      const stock = cam.kernel.stockBlock(s.minX, s.minY, s.maxX, s.maxY, s.minZ, s.maxZ, cell)
      const settings: cam.kernel.LoadSettings = { material, cutter, machine, rpm }
      const toolpaths: unknown[] = []
      const rebuilt: cam.Toolpath[] = []
      let worstBefore = 0, worstAfter = 0
      const claims = { before: [] as string[], after: [] as string[] }
      let bound = 0
      let saved = 0, cutBefore = 0
      for (const tp of read.program.toolpaths) {
        if (context.signal?.aborted) return { ok: false, error: "Cancelled." }
        const result = cam.kernel.optimizeFeeds({
          moves: tp.moves, stock, cutter, material, machine, rpm, mode: input.mode === "engagement" ? "chip" : input.mode,
          ...(context.signal !== undefined ? { signal: context.signal } : {})
        })
        const r = result.report
        claims.before.push(r.claimBefore); claims.after.push(r.claimAfter)
        worstBefore = Math.max(worstBefore, r.worstRatioBefore); worstAfter = Math.max(worstAfter, r.worstRatioAfter)
        bound = Math.max(bound, r.aeBound)
        cutBefore += r.cutSecondsBefore; saved += r.cutSecondsBefore - r.cutSecondsAfter
        const eng = result.engagement
        const worst = [...result.loadsBefore].filter((l) => l.status === "resolved").sort((a, b) => b.ratio - a.ratio).slice(0, 5)
          .map((l) => ({ move: l.index, ratio: Number(l.ratio.toFixed(3)), binding: l.binding, powerKw: Number(l.powerPeakKw.toFixed(3)), forceN: Math.round(l.forcePeak), deflectionMm: Number(l.deflectionPeak.toFixed(4)), aeMm: Number((eng?.perMove[l.index]?.aeMax ?? 0).toFixed(3)) }))
        toolpaths.push({
          name: tp.name, tool: tp.toolId, claim: r.claimBefore, worstRatio: Number(r.worstRatioBefore.toFixed(3)), worst,
          ...(input.mode !== "engagement" ? { optimised: { changed: r.changed, pieces: r.pieces, feedMin: r.feedMin, feedMax: r.feedMax, boundBy: r.bound, cutSecondsBefore: Number(r.cutSecondsBefore.toFixed(2)), cutSecondsAfter: Number(r.cutSecondsAfter.toFixed(2)), claim: r.claimAfter } } : {}),
          unresolved: r.unresolved
        })
        rebuilt.push({ ...tp, moves: [...result.moves] })
      }
      const sum = (list: string[]): string => (list.includes("failed") ? "failed" : list.includes("unresolved") ? "unresolved" : "passed")
      const out: Record<string, unknown> = {
        ok: true, mode: input.mode, uncalibrated: true, basis: BASIS, bound: { aeMm: Number(bound.toFixed(3)), cellMm: cell },
        claim: { before: sum(claims.before), worstRatioBefore: Number(worstBefore.toFixed(3)), ...(input.mode !== "engagement" ? { after: sum(claims.after), worstRatioAfter: Number(worstAfter.toFixed(3)) } : {}) },
        toolpaths
      }
      if (input.mode !== "engagement") {
        const postId = input.post ?? "generic"
        const post = cam.getPost(postId)
        if (post === undefined) return { ok: false, error: `Post '${postId}' is not implemented.` }
        let text: string
        try { text = post.emit({ ...read.program, toolpaths: rebuilt }) } catch (error) { return { ok: false, error: `The ${postId} post refuses the optimised program: ${error instanceof Error ? error.message : String(error)}` } }
        out.report = { cutSecondsBefore: Number(cutBefore.toFixed(2)), cutSecondsSaved: Number(saved.toFixed(2)), cutTimeSaved: cutBefore > 0 ? Number((saved / cutBefore).toFixed(4)) : 0, note: "Feed changes only; geometry is unchanged. Time is the programmed-feed sum without acceleration." }
        out.program = { lines: text.split("\n").length, programHash: cam.kernel.sha256(text), preview: head(text, 60) }
      }
      return out
    }
  }),
  defineWireAction({
    id: "cam.post_test", kind: "read", parameters: CAM_ACTION_INPUTS["cam.post_test"],
    run: (input) => {
      const ids = input.post === "all" ? (["generic", "linuxcnc", "fanuc", "haas", "mazak", "mitsubishi", "brother", "okuma", "siemens", "heidenhain", "grbl"] as const) : ([input.post] as const)
      let program: cam.Program | undefined
      if (input.gcode !== undefined) {
        const read = cam.programOfNc(input.gcode)
        if (read.program === undefined) return { ok: false, error: `The text cannot be read back into a program: ${read.errors.join("; ")}` }
        program = read.program
      }
      const results = ids.map((id) => {
        const r = cam.testPost(id, {
          ...(program !== undefined ? { program } : {}), ...(input.expected !== undefined ? { expected: input.expected } : {})
        })
        return {
          post: r.post, verdict: r.verdict, ...(r.reason !== undefined ? { reason: r.reason } : {}),
          checks: r.checks.map((c) => ({ ...c })), unsupported: [...r.unsupported], diff: r.diff.map((d) => ({ ...d })), lines: r.lines, preview: head(r.nc, 40)
        }
      })
      return { ok: true, results, basis: "Each post's text is replayed by the reference interpreter (an independent reader) and compared with the program that went in. A pass is not controller acceptance (qualification, spec 55)." }
    }
  })
]
