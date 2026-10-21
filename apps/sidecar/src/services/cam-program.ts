import { createHash } from "node:crypto"
import { BadRequest, CamKernelResult, CamProgramDocument, combineCamOperations, type CamKernelRequest } from "@cadcamfun/api"
import { KernelJobError, runKernelJob } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { elementsOf } from "./ai-elements.ts"

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Preserve the existing stored-operation revision algorithm while sharing it with HTTP saves. */
export const drawingRevision = (loaded: { readonly id: string; readonly elements: ReadonlyArray<Record<string, unknown>>; readonly data: Record<string, unknown> }): string => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value
  return createHash("sha256").update(JSON.stringify(canonical({ drawingId: loaded.id, elements: loaded.elements, stock: loaded.data["stock"] ?? null }))).digest("hex")
}

/** The same request adapter serves preview generation and persistence revalidation. */
export const runKernelRequest = Effect.fn("cam.runKernelRequest")(function*(payload: CamKernelRequest) {
  const job = cam.kernel.jobOfSnapshot(payload)
  if (job.status === "failed") return yield* new BadRequest({ message: job.issues.map((i) => i.message).join("; ") })
  // In a scoped worker: the event loop keeps serving while the kernel works, a dropped request interrupts the fiber (its signal
  // terminates the worker) and a job that runs past its deadline is stopped.
  const result = yield* Effect.tryPromise({
    try: (signal) => runKernelJob("cam-manufacture", job.value, { signal }),
    catch: (error) => new BadRequest({ message: error instanceof KernelJobError && error.reason !== "failed" && error.reason !== "crashed" ? error.message : "The CAM kernel request could not be evaluated" })
  })
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
    const program = yield* Effect.try({ try: () => cam.generator.analyseGcode(code).program, catch: () => new BadRequest({ message: "The saved G-code could not be parsed" }) })
    delete data["kernelArtifact"]; delete data["kernelRequest"]; delete data["operations"]
    snapshot = yield* Schema.decodeUnknownEffect(CamProgramDocument)({ ...data, gcode: code, program }).pipe(Effect.mapError(() => new BadRequest({ message: "Invalid updated toolpath document" })))
  }
  if (snapshot.operations?.length) {
    if (new Set(snapshot.operations.map((operation) => operation.id)).size !== snapshot.operations.length || combineCamOperations(snapshot.operations).gcode !== snapshot.gcode) {
      return yield* new BadRequest({ message: "Saved operations must have unique IDs and compose the stored G-code in order" })
    }
    const operations = yield* Effect.try({
      try: () => snapshot.operations!.map((operation) => ({ ...operation, program: cam.generator.analyseGcode(operation.gcode).program })),
      catch: () => new BadRequest({ message: "The saved operation G-code could not be parsed" })
    })
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
    output["program"] = snapshot.operations?.length ? snapshot.program : yield* Effect.try({ try: () => cam.generator.analyseGcode(snapshot.gcode).program, catch: () => new BadRequest({ message: "The saved G-code could not be parsed" }) })
  }
  return output
})
