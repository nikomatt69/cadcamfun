import { createHash } from "node:crypto"
import { BadRequest, CamKernelResult, CamProgramDocument, combineCamOperations, type CamKernelRequest } from "@cadcamfun/api"
import { runKernelJobEffect } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { elementsOf } from "./ai-elements.ts"
import type { CamRunProgress } from "./cam-progress.ts"

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Preserve the existing stored-operation revision algorithm while sharing it with HTTP saves. */
export const drawingRevision = (loaded: { readonly id: string; readonly elements: ReadonlyArray<Record<string, unknown>>; readonly data: Record<string, unknown> }): string => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value
  return createHash("sha256").update(JSON.stringify(canonical({ drawingId: loaded.id, elements: loaded.elements, stock: loaded.data["stock"] ?? null }))).digest("hex")
}

/** The program (IR) of a G-code text, read in a worker: a saved program of any size never stops the sidecar's other requests. */
const programOf = (gcode: string, unreadable: string) =>
  runKernelJobEffect("cam-parse", { gcode, name: "Program" }).pipe(
    Effect.map((analysis) => analysis.program),
    Effect.mapError((error) => new BadRequest({ message: error.explained ? error.message : unreadable }))
  )

/**
 * The kernel job of an HTTP request: the snapshot adapter of core, plus what the request carries that the snapshot does not (the
 * tolerance gate and the process evidence). One function, so the run, the plan and the revalidation of a saved program agree.
 */
export const jobOfRequest = (payload: CamKernelRequest) => {
  const { progress: _progress, enforceTolerance, process, setupId: _setupId, ...snapshot } = payload
  const job = cam.kernel.jobOfSnapshot(snapshot)
  if (job.status === "failed") return job
  const value = {
    ...job.value,
    ...(enforceTolerance === true ? { quality: { ...job.value.quality, enforceTolerance: true } } : {}),
    ...(process !== undefined ? { process: process as cam.kernel.ProcessRequest } : {})
  }
  return { status: "ok" as const, value }
}

/** The artifact of one setup of a multi-setup run, or the run's issues; an id the job does not have is an issue, not a guess. */
export const setupResult = (ran: cam.kernel.CamResult<cam.kernel.SetupsArtifact>, setupId: string): cam.kernel.CamResult<cam.kernel.CamArtifact> => {
  if (ran.status === "failed") return ran
  const one = ran.value.setups.find((r) => r.id === setupId)
  if (one === undefined) return { status: "failed", issues: [{ tag: "InvalidInput", severity: "error", stage: "prepare", message: `The job has no setup '${setupId}' (it has ${ran.value.setups.map((r) => r.id).join(", ")})` }] }
  return { status: "ok", value: one.artifact }
}

/** The same request adapter serves preview generation and persistence revalidation. */
export const runKernelRequest = Effect.fn("cam.runKernelRequest")(function*(payload: CamKernelRequest, report?: (progress: CamRunProgress) => void) {
  const job = jobOfRequest(payload)
  if (job.status === "failed") return yield* new BadRequest({ message: job.issues.map((i) => i.message).join("; ") })
  // A request that lists setups runs the whole job and answers with the setup it names (`setupId`): a stored program is one setup, and
  // re-running the job (not the setup alone) is what reproduces it when the stock is carried from the setup before.
  const listed = job.value.setups
  if (listed !== undefined && payload.setupId === undefined && listed.length > 1) {
    return yield* new BadRequest({ message: `The request lists ${listed.length} setups (${listed.map((s) => s.id).join(", ")}): name the one to answer with in setupId` })
  }
  // In a scoped worker: the event loop keeps serving while the kernel works, a dropped request interrupts the fiber (its signal
  // terminates the worker) and a job that runs past its deadline is stopped.
  const result = yield* (listed === undefined
    ? runKernelJobEffect("cam-manufacture", job.value, report !== undefined ? { onProgress: report } : {})
    : runKernelJobEffect("cam-setups", job.value, report !== undefined ? { onProgress: report } : {}).pipe(Effect.map((ran) => setupResult(ran, payload.setupId ?? listed[0]!.id)))).pipe(
    Effect.mapError((error) => new BadRequest({ message: error.explained ? error.message : "The CAM kernel request could not be evaluated" })),
    // A dropped request interrupts the fiber: say so on the stream, since the code after the run never executes.
    Effect.onInterrupt(() => Effect.sync(() => report?.("cancelled")))
  )
  report?.(result.status === "failed" && result.issues.some((i) => i.tag === "Cancelled") ? "cancelled" : "done")
  return yield* Schema.decodeUnknownEffect(CamKernelResult)(result).pipe(Effect.mapError(() => new BadRequest({ message: "The CAM kernel returned an invalid artifact" })))
})

const same = (a: unknown, b: unknown): boolean => cam.kernel.canonicalJson(a) === cam.kernel.canonicalJson(b)
export const isPortableProgram = (data: unknown): boolean => record(data)["format"] === "cadcamfun-cam"

/** Validate recognized new payloads without changing the legacy free-form data contract. */
export const prepareCamProgramData = Effect.fn("cam.prepareProgramData")(function*(input: {
  readonly data: unknown; readonly gcode: string | null | undefined; readonly previous?: unknown;
  readonly drawing?: { readonly id: string; readonly data: unknown } | undefined
}) {
  const data = { ...record(input.data) }, old = record(input.previous)
  if (!isPortableProgram(data)) {
    const artifact = record(data["kernelArtifact"])
    if (artifact["nc"] !== undefined && artifact["nc"] !== input.gcode) {
      for (const key of ["kernelArtifact", "kernelRequest", "sourceRevision", "verification", "response"]) delete data[key]
      return data
    }
    if (artifact["nc"] !== undefined) {
      if (!same(data["kernelArtifact"], old["kernelArtifact"] ?? null)) return yield* new BadRequest({ message: "New native artifacts require a portable CAM program and captured source request" })
      delete data["sourceRevision"]
      if (old["sourceRevision"] !== undefined) data["sourceRevision"] = old["sourceRevision"]
      return data
    }
    return input.data
  }
  let snapshot = yield* Schema.decodeUnknownEffect(CamProgramDocument)(data).pipe(Effect.mapError(() => new BadRequest({ message: "Invalid CADCAMFUN toolpath document" })))
  if (snapshot.gcode !== input.gcode) {
    if (input.previous === undefined || old["gcode"] !== snapshot.gcode) return yield* new BadRequest({ message: "Toolpath document and G-code must contain the same program" })
    // Existing editor/API updates may send only new NC and the unchanged old document.
    const code = input.gcode ?? ""
    const program = yield* programOf(code, "The saved G-code could not be parsed")
    delete data["kernelArtifact"]; delete data["kernelRequest"]; delete data["operations"]
    snapshot = yield* Schema.decodeUnknownEffect(CamProgramDocument)({ ...data, gcode: code, program }).pipe(Effect.mapError(() => new BadRequest({ message: "Invalid updated toolpath document" })))
  }
  if (snapshot.operations?.length) {
    if (new Set(snapshot.operations.map((operation) => operation.id)).size !== snapshot.operations.length || combineCamOperations(snapshot.operations).gcode !== snapshot.gcode) {
      return yield* new BadRequest({ message: "Saved operations must have unique IDs and compose the stored G-code in order" })
    }
    const operations = yield* Effect.forEach(snapshot.operations, (operation) =>
      programOf(operation.gcode, "The saved operation G-code could not be parsed").pipe(Effect.map((program) => ({ ...operation, program }))))
    snapshot = { ...snapshot, operations, program: combineCamOperations(operations).program }
  }
  delete data["sourceRevision"]
  delete data["verification"]
  delete data["response"]
  if (snapshot.kernelArtifact) {
    let artifact = snapshot.kernelArtifact
    if (snapshot.kernelRequest) {
      const result = yield* runKernelRequest(snapshot.kernelRequest)
      if (result.status !== "ok" || result.value.release === "blocked" || !same(result.value, artifact) || !same(snapshot.program, artifact.program) || artifact.nc !== input.gcode) {
        return yield* new BadRequest({ message: "The saved kernel artifact does not match its source request and original NC" })
      }
      artifact = result.value
    } else if (!same(old["kernelArtifact"] ?? null, artifact) || artifact.nc !== input.gcode || !same(snapshot.program, artifact.program)) {
      // A legacy export can still be saved as ordinary NC; client-provided claims alone are not verification.
      delete data["kernelArtifact"]
    }
    if (data["kernelArtifact"] !== undefined) {
      data["kernelArtifact"] = artifact
      const drawing = input.drawing, source = snapshot.kernelRequest
      if (drawing && source) {
        const stored = record(drawing.data), elements = elementsOf(stored)
        const selected = source.elements.map((element) => elements.find((candidate) => candidate["id"] === element["id"]))
        if (selected.every((element) => element !== undefined) && same(selected, source.elements) && same(stored["stock"] ?? null, source.stock ?? null)) {
          data["sourceRevision"] = drawingRevision({ id: drawing.id, data: stored, elements })
        }
      } else if (old["sourceRevision"] !== undefined && same(old["kernelArtifact"], artifact)) data["sourceRevision"] = old["sourceRevision"]
    }
  } else {
    for (const key of ["kernelArtifact", "kernelRequest", "sourceRevision", "verification", "response"]) delete data[key]
  }
  const output = { ...data, ...Schema.encodeSync(CamProgramDocument)(snapshot) }
  if (data["kernelArtifact"] === undefined) {
    delete output["kernelArtifact"]; delete output["kernelRequest"]
    output["program"] = snapshot.operations?.length ? snapshot.program : yield* programOf(snapshot.gcode, "The saved G-code could not be parsed")
  }
  return output
})

/** A replay that did not run to the end: no verdict, no figures, the reason. */
export const failedReplay = (reason: string): cam.kernel.VerifyNcResult => ({
  complete: false, reasons: [`the replay did not finish: ${reason}`], findings: [], gouge: { volume: 0, depth: 0, rays: 0 }, left: { volume: 0, depth: 0, rays: 0 },
  detached: 0, stockVolume: 0, removedVolume: 0, cell: 0, errorBound: 0, threshold: 0, moves: 0, feedMoves: 0, verdict: "incomplete"
})

/**
 * The replay of a program a saved setup generated, as the jobs it needs (the program text once per workpiece register against that
 * workpiece's blank) and how their results become the evidence. The assistant runs the jobs as owned kernel jobs, the HTTP routes as
 * effects: one plan for both, so the release a program gets does not depend on who asked.
 */
export const setupReplayPlan = (setup: cam.program.Setup, program: cam.program.GeneratedProgram, geometryOf: (op: cam.program.Operation) => cam.generator.GeometryInput, configured: cam.generator.Stock | undefined) => {
  const replay = cam.program.setupReplay(setup, program, geometryOf, configured)
  const part = replay.part.map((m) => ({ positions: Float64Array.from(m.positions), indices: Uint32Array.from(m.indices) }))
  const jobs = replay.registers.map((register) => ({
    nc: program.gcode, part: part as never, stock: register.stock, register: register.register, cell: 0.25, tolerance: 0.05,
    tools: replay.tools.map((t) => ({ number: t.number, cutter: t.cutter as never }))
  }))
  return { jobs, finish: (results: ReadonlyArray<cam.kernel.VerifyNcResult>) => cam.program.setupEvidence(program.gcode, replay, results, program.tools) }
}

/** The same replay run through the kernel's worker queue, one register after the other; a register that cannot finish is a preview with the reason. */
export const replaySetupEffect = (setup: cam.program.Setup, program: cam.program.GeneratedProgram, geometryOf: (op: cam.program.Operation) => cam.generator.GeometryInput, configured: cam.generator.Stock | undefined) => {
  const plan = setupReplayPlan(setup, program, geometryOf, configured)
  return Effect.forEach(plan.jobs, (job) => runKernelJobEffect("cam-verify-nc", job).pipe(
    Effect.map((outcome) => ("error" in outcome ? failedReplay(outcome.error) : outcome)),
    Effect.catch((cause) => Effect.succeed(failedReplay(cause instanceof Error ? cause.message : String(cause))))
  )).pipe(Effect.map((results) => plan.finish(results)))
}
