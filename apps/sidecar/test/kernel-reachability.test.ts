/**
 * Kernel reachability (spec 72, lane API): every kernel job the worker pool runs is either behind a typed HTTP route whose handler runs
 * it in the kernel worker queue, or named here as reached only through the assistant's catalogue (`POST /api/ai/actions/invoke`), with
 * the reason. A new kernel job fails this test until it is classified. Then the routes added for the jobs that had none: the drawing
 * sheet, the plan of a kernel request, the multi-setup job and the lathe job, each checked to run in a worker (the job history).
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { clearKernelJobCache, kernelJobHistory, type KernelJobName } from "@cadcamfun/ai"
import { Api, CadSheetReport, CamJobResult, CamKernelPlanResult, CamLatheResult } from "@cadcamfun/api"
import { buildRecipe } from "@cadcamfun/core"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { KERNEL_JOBS } from "../../../packages/ai/src/kernel-jobs.ts"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)

type Reach = { readonly route: string } | { readonly assistant: string }

/** Every kernel job, exhaustively (a job added to `KernelJobs` without an entry here is a type error and a test failure). */
const REACH = {
  "cam-manufacture": { route: "POST /api/toolpaths/manufacture" },
  "cam-plan": { route: "POST /api/toolpaths/plan" },
  "cam-generate": { route: "POST /api/toolpaths/generate" },
  "cam-parse": { route: "POST /api/toolpaths/parse" },
  "cam-verify": { route: "POST /api/toolpaths/verify" },
  "cam-verify-nc": { route: "POST /api/toolpaths/verify-nc" },
  "cam-collisions": { route: "POST /api/toolpaths/collisions" },
  "cam-job": { route: "POST /api/cam/jobs" },
  "cam-lathe": { route: "POST /api/cam/lathe" },
  "cad-analyze": { route: "POST /api/cad/exact/analyze" },
  "cad-step": { route: "POST /api/cad/exact/step" },
  "cad-setups": { route: "POST /api/cad/exact/setups" },
  "cad-hole": { route: "POST /api/cad/exact/hole" },
  "cad-assembly": { route: "POST /api/cad/exact/assembly" },
  "cad-rebuild": { route: "POST /api/cad/exact/rebuild" },
  "cad-import-step": { route: "POST /api/cad/exact/import-step" },
  "cad-sheet": { route: "POST /api/cad/sheet" },
  "cad-group": { assistant: "grouping of the assistant's edited elements into components (cad_edit), not a client operation" },
  "cad-normalize": { assistant: "normalisation of elements the model wrote before they are stored; the editor stores its own" },
  "parametric-diagnosis": { assistant: "diagnosis text for the model (cad.parametric_dfm and the review loop)" },
  "parametric-timeline": { assistant: "timeline edits of a stored part through the assistant's revisioned write path (cad_edit.parametric_timeline)" },
  "parametric-exact": { assistant: "exact report for the model; clients rebuild with POST /api/cad/exact/rebuild" },
  "parametric-edit": { assistant: "atomic parameter edits of a stored part through the assistant's revisioned write path (cad_edit.parametric_edit)" },
  "parametric-report": { assistant: "inspection summary for the model (cad.parametric_inspect)" },
  "acceptance": { assistant: "dimensional acceptance checks of the assistant's test cases (cad.parametric_test)" },
  "cad-naming": { assistant: "persistent-naming report for the model (cad.kernel_report)" },
  "cad-export-scene": { assistant: "export to a stored file (cam_edit.export); the editor exports locally and POST /api/cad/exact/step writes STEP" },
  "cad-export": { assistant: "export to a stored file (cam_edit.export)" },
  "cad-export-bodies": { assistant: "export to a stored file (cam_edit.export)" },
  "cam-export-stock": { assistant: "export of the simulated stock to a stored file (cam_edit.export)" },
  "cad-scene": { assistant: "shell, offset, distance, motion study and fastening edits of the assistant's scene (cad_edit), stored through its write path" }
} satisfies Record<KernelJobName, Reach>

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

/** The jobs that ran since `before`, by name. */
const ranSince = (before: ReadonlySet<string>) => kernelJobHistory().filter((j) => !before.has(j.id)).map((j) => ({ job: j.job, outcome: j.outcome }))
const mark = () => new Set(kernelJobHistory().map((j) => j.id))

describe("reachability gate", () => {
  test("every kernel job is classified, and each route it names is in the API contract", () => {
    expect(Object.keys(KERNEL_JOBS).sort()).toEqual(Object.keys(REACH).sort())
    const spec = OpenApi.fromApi(Api) as unknown as { readonly paths: Record<string, Record<string, unknown>> }
    for (const [job, reach] of Object.entries(REACH) as ReadonlyArray<[string, Reach]>) {
      if ("assistant" in reach) { expect(reach.assistant.length, job).toBeGreaterThan(20); continue }
      const [method, path] = reach.route.split(" ") as [string, string]
      expect(spec.paths[path]?.[method.toLowerCase()], `${job}: ${reach.route}`).toBeDefined()
    }
  })
})

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const history = () => JSON.parse(JSON.stringify(recipe.history)) as unknown

describe("POST /api/cad/sheet", () => {
  const post = (json: unknown, auth = true) => app.call("/api/cad/sheet", { method: "POST", json, auth })

  test("is authenticated and needs exactly one source", async () => {
    expect((await post({ history: history() }, false)).status).toBe(401)
    expect((await post({})).status).toBe(400)
    expect((await post({ history: history(), drawingId: "d", elementId: "e" })).status).toBe(400)
    expect((await post({ drawingId: "d" })).status).toBe(400)
    const bad = await post({ history: { parameters: {}, features: [{ id: "x", type: "no-such-feature" }] } })
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).toContain("Invalid parametric history")
  })

  test("draws the sheet of an inline history in the kernel worker", async () => {
    clearKernelJobCache()
    const before = mark()
    const response = await post({ history: history(), options: { size: "A3", title: "Plate" } })
    expect(response.status).toBe(200)
    const sheet = Schema.decodeUnknownSync(CadSheetReport)(response.body)
    expect(sheet.svg).toContain("<svg")
    expect(sheet.size.width).toBe(420)
    expect(sheet.views.length).toBeGreaterThanOrEqual(3)
    expect(sheet.dimensions.length).toBeGreaterThan(0)
    expect(sheet.drawing).toBeDefined()
    expect(ranSince(before)).toContainEqual({ job: "cad-sheet", outcome: "completed" })
  })

  test("draws a stored parametric part with the drawing's title block, the request's options winning", async () => {
    const project = (await app.call("/api/projects", { method: "POST", json: { name: "Sheets" } })).body.id as string
    const created = await app.call(`/api/projects/${project}/drawings`, {
      method: "POST", json: { name: "Bracket drawing", data: { elements: [{ id: "part", type: "parametric", name: "Plate", history: history() }, { id: "box", type: "cube", width: 1, height: 1, depth: 1 }], titleBlock: { title: "Stored title", number: "DWG-42" } } }
    })
    expect(created.status).toBe(201)
    const drawingId = created.body.id as string
    const stored = await post({ drawingId, elementId: "part" })
    expect(stored.status).toBe(200)
    expect(stored.body.svg).toContain("DWG-42")
    expect(stored.body.svg).toContain("Stored title")
    const overridden = await post({ drawingId, elementId: "part", options: { title: "Override" } })
    expect(overridden.body.svg).toContain("Override")
    expect((await post({ drawingId, elementId: "missing" })).status).toBe(404)
    expect((await post({ drawingId, elementId: "box" })).status).toBe(400)
    expect((await post({ drawingId: "nope", elementId: "part" })).status).toBe(404)
  })
})

const snapshot = { schemaVersion: 1, id: "plan-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5, x: 0, y: 0, z: 0 }] }

describe("POST /api/toolpaths/plan", () => {
  const post = (json: unknown, auth = true) => app.call("/api/toolpaths/plan", { method: "POST", json, auth })
  test("answers the operations the kernel would run, without running them, in a worker", async () => {
    expect((await post(snapshot, false)).status).toBe(401)
    expect((await post({ ...snapshot, elements: [] })).status).toBe(400)
    clearKernelJobCache()
    const before = mark()
    const response = await post(snapshot)
    expect(response.status).toBe(200)
    const plan = Schema.decodeUnknownSync(CamKernelPlanResult)(response.body)
    if (plan.status !== "ok") throw new Error(JSON.stringify(plan.issues))
    expect(plan.value.operations.length).toBeGreaterThan(0)
    expect(plan.value.operations.every((o) => typeof o["strategy"] === "string")).toBe(true)
    const ran = ranSince(before)
    expect(ran).toContainEqual({ job: "cam-plan", outcome: "completed" })
    expect(ran.some((r) => r.job === "cam-manufacture")).toBe(false)
  })
  test("an unknown material is a failed plan with the kernel's issue, not a server fault", async () => {
    const response = await post({ ...snapshot, material: "missing" })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: "failed", issues: expect.arrayContaining([expect.objectContaining({ tag: "UnknownMaterial" })]) })
  })
})

const plate = { id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8 }
const jobBase = { material: "6061", part: { elements: [plate] }, quality: { resolution: 0.4 } }

describe("POST /api/cam/jobs", () => {
  const post = (json: unknown, auth = true) => app.call("/api/cam/jobs", { method: "POST", json, auth })
  test("plans a two-setup job with its coverage in a worker; the schema refuses a malformed job", async () => {
    expect((await post({ op: "plan", ...jobBase, setups: [{ id: "top" }] }, false)).status).toBe(401)
    expect((await post({ op: "plan", ...jobBase, setups: [] })).status).toBe(400)
    expect((await post({ op: "verify", ...jobBase, setups: [{ id: "top" }] })).status).toBe(400)
    const before = mark()
    const response = await post({ op: "plan", ...jobBase, setups: [{ id: "top" }, { id: "bottom", orientation: "-Z" }] })
    expect(response.status).toBe(200)
    const result = Schema.decodeUnknownSync(CamJobResult)(response.body)
    expect(result.ok).toBe(true)
    expect(result.setups).toHaveLength(2)
    expect(result.coverage?.["uncoveredMm2"]).toBe(0)
    expect(ranSince(before).map((r) => r.job)).toContain("cam-job")
  })
  test("an unknown machine preset is an answer with the reason", async () => {
    const response = await post({ op: "plan", ...jobBase, machine: "no-such-machine", setups: [{ id: "top" }] })
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(false)
    expect(response.body.error).toContain("Unknown machine preset")
  })
})

const shaft = {
  stock: { diameter: 30, length: 60 },
  contour: [
    { diameter: 18, z: 0 }, { diameter: 20, z: -1 }, { diameter: 20, z: -18 }, { diameter: 26, z: -24 }, { diameter: 26, z: -28 },
    { diameter: 22, z: -28 }, { diameter: 22, z: -32 }, { diameter: 26, z: -32 }, { diameter: 26, z: -45 }
  ],
  tools: [
    { id: "T1", number: 1, kind: "turning", insert: "CNMG120408", approach: 95 },
    { id: "T2", number: 2, kind: "turning", insert: "DNMG150604", approach: 93 },
    { id: "T3", number: 3, kind: "grooving", bladeWidth: 3, bladeLength: 12 },
    { id: "T4", number: 4, kind: "threading", insert: "TNMG160408", noseRadius: 0.1 },
    { id: "T5", number: 5, kind: "parting", bladeWidth: 3, bladeLength: 15 }
  ],
  operations: [
    { kind: "face", tool: "T1" }, { kind: "rough", tool: "T1", depth: 2 }, { kind: "finish", tool: "T2" },
    { kind: "groove", tool: "T3", z: -28, width: 4, diameter: 22 },
    { kind: "thread", tool: "T4", diameter: 20, pitch: 1.5, zStart: 3, zEnd: -16 },
    { kind: "part", tool: "T5", z: -45 }
  ]
}

describe("POST /api/cam/lathe", () => {
  const post = (json: unknown, auth = true) => app.call("/api/cam/lathe", { method: "POST", json, auth })
  test("plans, writes and replays a shaft in a worker", async () => {
    expect((await post(shaft, false)).status).toBe(401)
    const before = mark()
    const response = await post(shaft)
    expect(response.status).toBe(200)
    const result = Schema.decodeUnknownSync(CamLatheResult)(response.body)
    expect(result.operations.map((o) => o.kind)).toEqual(["face", "rough", "finish", "groove", "thread", "part"])
    expect((result.verification as { verdict: string }).verdict).toBe("matches")
    expect(ranSince(before)).toContainEqual({ job: "cam-lathe", outcome: "completed" })
  })
  test("a refused plan is a 400 with the planner's reason; a malformed operation never reaches the kernel", async () => {
    const missing = await post({ ...shaft, operations: [{ kind: "face", tool: "T9" }] })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toContain("T9")
    expect((await post({ ...shaft, operations: [{ kind: "thread", tool: "T4" }] })).status).toBe(400)
  })
})

test("a job part with both elements and meshes is a 400 at the route", async () => {
  const response = await app.call("/api/cam/jobs", { method: "POST", json: { op: "plan", ...jobBase, part: { elements: [plate], meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }] }, setups: [{ id: "a" }] } })
  expect(response.status).toBe(400)
  expect(response.body.message).toContain("exactly one")
  expect((await app.call("/api/cam/jobs", { method: "POST", json: { op: "plan", ...jobBase, part: {}, setups: [{ id: "a" }] } })).status).toBe(400)
})
