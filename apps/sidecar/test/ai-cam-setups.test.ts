import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { buildRecipe, cam } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

/** RM-02: the assistant plans, saves and lists multi-operation setups through the same documents as the `camSetup` HTTP group. */
setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Setups" } })).body.id
})
afterAll(async () => { await app.dispose() })

const tool = (id: string, diameter: number) => ({ id, name: `Endmill ${diameter}`, kind: "endmill", diameter, flutes: 2, maxRpm: 18000 })
const op = (id: string, t: ReturnType<typeof tool>) => ({
  id, name: `Op ${id}`, elementIds: [id], tool: t, enabled: true, fromPreviousStock: false,
  params: { ...cam.generator.DEFAULT_SETTINGS, depth: 2, stepdown: 1, toolDiameter: t.diameter, operationType: "pocket" }
})
const setup = (operations: unknown[], over: Record<string, unknown> = {}) => ({
  id: "s", name: "Bracket", machineType: "mill", workOffset: "G54", post: { ...cam.program.DEFAULT_POST_CONFIG, postId: "fanuc" },
  grouping: "single", retractBeforeToolChange: false, operations, ...over
})

test("cam setup_plan answers the plan and the issues without geometry and without storing", async () => {
  const good = await run("cam", { action: "setup_plan", setup: setup([op("a", tool("t6", 6)), op("b", tool("t3", 3))]) })
  expect(good).toMatchObject({ ok: true, mutated: false, valid: true, plan: { toolChanges: 1 }, issues: [] })
  expect(good.plan.programs).toHaveLength(1)
  const bad = await run("cam", { action: "setup_plan", setup: setup([{ ...op("a", tool("t6", 6)), elementIds: [] }]) })
  expect(bad).toMatchObject({ ok: true, valid: false })
  expect(bad.issues[0].message).toMatch(/no elements/)
  expect((await run("cam", { action: "setup_list" })).setups).toEqual([])
})

test("cam_edit setup_save stores a setup, setup_list reads it, and an update names the revision it read", async () => {
  const first = await run("cam_edit", { action: "setup_save", name: "Bracket", setup: setup([op("a", tool("t6", 6))]) })
  expect(first).toMatchObject({ ok: true, created: true, name: "Bracket", projectId })
  const listed = await run("cam", { action: "setup_list" })
  expect(listed.setups).toEqual([expect.objectContaining({ id: first.setupId, name: "Bracket", operations: 1, workpieces: 1, grouping: "single" })])
  // The same document the HTTP group serves.
  const http = await app.call(`/api/projects/${projectId}/cam-setups/${first.setupId}`)
  expect(http.status).toBe(200)
  expect(http.body.updatedAt).toBe(first.updatedAt)

  const updated = await run("cam_edit", { action: "setup_save", name: "Bracket v2", setupId: first.setupId, baseUpdatedAt: first.updatedAt, setup: setup([op("a", tool("t6", 6)), op("b", tool("t3", 3))]) })
  expect(updated).toMatchObject({ ok: true, created: false, name: "Bracket v2" })
  const stale = await run("cam_edit", { action: "setup_save", name: "Lost", setupId: first.setupId, baseUpdatedAt: first.updatedAt, setup: setup([op("a", tool("t6", 6))]) })
  expect(stale.ok).toBe(false)
  expect((await app.call(`/api/projects/${projectId}/cam-setups/${first.setupId}`)).body.name).toBe("Bracket v2")
  expect((await run("cam_edit", { action: "setup_save", name: "x", setupId: "missing", setup: setup([op("a", tool("t6", 6))]) })).ok).toBe(false)
})

test("a project the acting user cannot reach is refused", async () => {
  const tools = buildTools(handlers, "not-a-project")
  expect(JSON.parse(await tools.find((t) => t.id === "cam")!.execute({ action: "setup_list" }, ctx))).toMatchObject({ ok: false })
  expect(JSON.parse(await tools.find((t) => t.id === "cam_edit")!.execute({ action: "setup_save", name: "x", setup: setup([op("a", tool("t6", 6))]) }, ctx))).toMatchObject({ ok: false })
})

test("a fixture of three parts is planned, saved and read back with its work offsets; two parts on one register are an issue", async () => {
  const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }, { id: "w3", name: "Part 3", workOffset: "G56", placement: { x: 120, y: 0, z: 0 } }]
  const fixture = setup([op("a", tool("t6", 6)), op("b", tool("t3", 3))], { workpieces: parts })
  const plan = await run("cam", { action: "setup_plan", setup: fixture })
  expect(plan).toMatchObject({ ok: true, valid: true, plan: { toolChanges: 1 } })
  // Part first repeats the changes: 6 runs, 5 changes, and the plan says what the other order saves.
  const partFirst = await run("cam", { action: "setup_plan", setup: setup(fixture.operations, { workpieces: parts, workpieceOrder: "partFirst" }) })
  expect(partFirst.plan.toolChanges).toBe(5)
  expect(partFirst.plan.warnings.join(" ")).toMatch(/saves 4 tool changes/)

  const saved = await run("cam_edit", { action: "setup_save", name: "Vise of three", setup: fixture })
  expect(saved).toMatchObject({ ok: true, created: true })
  const http = await app.call(`/api/projects/${projectId}/cam-setups/${saved.setupId}`)
  expect(http.body.setup.workpieces).toEqual(parts)
  expect((await run("cam", { action: "setup_list" })).setups.find((s: { id: string }) => s.id === saved.setupId)).toMatchObject({ workpieces: 3 })

  const twice = await run("cam", { action: "setup_plan", setup: setup([op("a", tool("t6", 6))], { workpieces: [parts[0], { id: "w2", name: "Part 2", workOffset: "G54" }] }) })
  expect(twice).toMatchObject({ ok: true, valid: false })
  expect(twice.issues.map((i: { message: string }) => i.message).join(" ")).toMatch(/share G54/)
})

test("cam_edit setup_generate turns a saved fixture of three parts into one stored multi-tool program with a register per part", async () => {
  const id = (await app.call("/api/projects", { method: "POST", json: { name: "Vise" } })).body.id as string
  const tools = buildTools(handlers, id)
  const call = async (tool: string, input: unknown) => JSON.parse(await tools.find((t) => t.id === tool)!.execute(input, ctx))
  const added = await call("cad_edit", { action: "add", elements: [{ type: "rectangle", x: 0, y: 0, width: 40, height: 30, depth: 5, name: "Plate" }, { type: "circle", x: 0, y: 0, radius: 4, depth: 5, name: "Hole" }] })
  expect(added.ok).toBe(true)
  const [plate, hole] = added.ids as string[]
  const elementOp = (opId: string, elementId: string, t: ReturnType<typeof tool>) => ({ ...op(opId, t), elementIds: [elementId] })
  const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }, { id: "w3", name: "Part 3", workOffset: "G56" }]
  const fixture = setup([elementOp("a", plate!, tool("t6", 6)), elementOp("b", hole!, tool("t3", 3))], { workpieces: parts, stock: { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" } })
  const saved = await call("cam_edit", { action: "setup_save", name: "Vise of three", setup: fixture })
  expect(saved.ok).toBe(true)

  const generated = await call("cam_edit", { action: "setup_generate", setupId: saved.setupId })
  expect(generated).toMatchObject({ ok: true, setupId: saved.setupId, totals: { programs: 1, toolChanges: 1 } })
  expect(generated.programs).toHaveLength(1)
  expect(generated.programs[0]).toMatchObject({ operations: 2, toolpaths: 6, toolNumbers: [1, 2] })

  // The program is a stored row of the project: one text with the registers in order, and the IR that carries them.
  const row = (await app.call(`/api/toolpaths/${generated.programs[0].operationId}`)).body
  expect(row.projectId).toBe(id)
  const lines = String(row.gcode).split("\n").map((l) => l.trim())
  expect(lines.filter((l) => /^G55\b/.test(l))).toHaveLength(2)
  expect(lines.filter((l) => /^G56\b/.test(l))).toHaveLength(2)
  expect(String(row.gcode).match(/T\d+\s*M6/g)).toHaveLength(2)
  const document = row.data
  expect(document.format).toBe("cadcamfun-cam")
  expect(document.program.toolpaths.map((t: { workOffset?: string }) => t.workOffset)).toEqual(["G54", "G55", "G56", "G54", "G55", "G56"])
  expect(document.setupId).toBe(saved.setupId)

  // Every register is replayed against its own blank: three verdicts, stored with the program and read back by cam review. The elements are
  // outlines, so there is no finished solid to compare with: the release is a preview and says so, never a pass.
  const evidence = generated.programs[0].evidence
  expect(evidence.registers.map((r: { register: string }) => r.register)).toEqual(["G54", "G55", "G56"])
  expect(evidence.registers.every((r: { feedMoves: number }) => r.feedMoves > 0)).toBe(true)
  expect(generated.programs[0].release).toBe("preview")
  expect(evidence.notes.join(" ")).toMatch(/not a finished solid/)
  expect(row.data.setupEvidence.programHash).toBe(evidence.programHash)
  const reviewed = await call("cam", { action: "review", operationId: generated.programs[0].operationId })
  expect(reviewed).toMatchObject({ status: "preview", release: "preview", setupId: saved.setupId })
  expect(reviewed.registers).toHaveLength(3)

  // A setup that names an element the drawing does not have is refused with the element, nothing is stored.
  const broken = await call("cam_edit", { action: "setup_save", name: "Broken", setup: setup([elementOp("a", "gone", tool("t6", 6))]) })
  const refused = await call("cam_edit", { action: "setup_generate", setupId: broken.setupId })
  expect(refused.ok).toBe(false)
  expect(refused.error).toMatch(/gone/)
  expect((await call("cam_edit", { action: "setup_generate", setupId: "missing" })).ok).toBe(false)
})

test("setup_generate replays every register against the finished part: a pass needs the holder described, a blank that lacks part material blocks", async () => {
  const id = (await app.call("/api/projects", { method: "POST", json: { name: "Plates" } })).body.id as string
  const tools = buildTools(handlers, id)
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.id === name)!.execute(input, ctx))
  const plate = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 10, fastener: "M5", counterbore: true })
  const added = await call("cad_edit", { action: "add", elements: [{ type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: plate.history }] })
  expect(added.ok).toBe(true)
  const blank = (width: number, height: number, x: number, y: number) => ({ width, height, depth: 12, radius: 0, x, y, topZ: 0, allowance: 0, material: "aluminum" })
  const cutter = { id: "t6", name: "Endmill 6", kind: "endmill", diameter: 6, flutes: 2, maxRpm: 18000 }
  const generate = async (t: Record<string, unknown>, stock: ReturnType<typeof blank>) => {
    expect((await call("cam_edit", { action: "stock_set", stock })).ok).toBe(true)
    const operation = { ...op("a", cutter), elementIds: [added.ids[0]], tool: t, params: { ...cam.generator.DEFAULT_SETTINGS, depth: 4, stepdown: 2, toolDiameter: 6, operationType: "profile" } }
    const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }]
    const saved = await call("cam_edit", { action: "setup_save", name: "Plates", setup: setup([operation], { workpieces: parts }) })
    return call("cam_edit", { action: "setup_generate", setupId: saved.setupId })
  }
  // The part is centred on the blank (the stock centre is the origin): both registers replay clean; without a holder the release stays a preview.
  const bare = await generate(cutter, blank(76, 56, 30, 20))
  expect(bare.programs[0].evidence.registers.map((r: { register: string; verdict: string; gougeMm: number }) => [r.register, r.verdict, r.gougeMm])).toEqual([["G54", "clean", 0], ["G55", "clean", 0]])
  // Each register removed material from its own blank: the same moves, the same volume, not the sum of both on one blank.
  const [first, second] = bare.programs[0].evidence.registers as Array<{ removedMm3: number; stockMm3: number }>
  expect(first!.removedMm3).toBeGreaterThan(1000)
  expect(Math.abs(first!.removedMm3 - second!.removedMm3)).toBeLessThan(first!.removedMm3 * 0.02)
  expect(first!.stockMm3).toBeCloseTo(76 * 56 * 12, -3)
  expect(bare.programs[0].release).toBe("preview")
  expect(bare.programs[0].evidence.notes.join(" ")).toMatch(/No holder is described for Endmill 6/)
  const held = await generate({ ...cutter, holder: { diameter: 32, length: 40 } }, blank(76, 56, 30, 20))
  expect(held.programs[0].release).toBe("verified-program")
  // A blank that does not reach the part's far side lacks part material where the program cuts: a gouge, named with its NC line, blocks the release.
  const short = await generate({ ...cutter, holder: { diameter: 32, length: 40 } }, blank(40, 56, 10, 20))
  expect(short.programs[0].release).toBe("blocked")
  expect(short.programs[0].evidence.registers[0].findings[0]).toMatchObject({ kind: "gouge" })
  expect((await call("cam", { action: "review", operationId: short.programs[0].operationId })).status).toBe("blocked")
})

test("the HTTP generate routes of a setup replay each program per work offset when asked, with the same evidence as the assistant's", async () => {
  const id = (await app.call("/api/projects", { method: "POST", json: { name: "Http replay" } })).body.id as string
  const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55", placement: { x: 120, y: 0, z: 0 } }]
  const plate = { id: "plate", type: "rectangle", x: 0, y: 0, width: 40, height: 30, depth: 5, name: "Plate" }
  const fixture = setup([{ ...op("a", tool("t6", 6)), elementIds: ["plate"] }], { workpieces: parts, stock: { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" } })
  const saved = (await app.call(`/api/projects/${id}/cam-setups`, { method: "POST", json: { name: "Two parts", setup: fixture } })).body
  const url = `/api/projects/${id}/cam-setups/${saved.id}/generate`

  const plain = await app.call(url, { method: "POST", json: { elements: { plate } } })
  expect(plain.status).toBe(200)
  expect(plain.body.programs[0].evidence).toBeUndefined()

  const replayed = await app.call(url, { method: "POST", json: { elements: { plate }, evidence: true } })
  expect(replayed.status).toBe(200)
  const evidence = replayed.body.programs[0].evidence
  // Both registers were replayed, each against its own blank; the parts are also seen together in one frame.
  expect(evidence.registers.map((r: { register: string }) => r.register)).toEqual(["G54", "G55"])
  expect(evidence.programHash).toBe(cam.kernel.sha256(replayed.body.programs[0].gcode))
  expect(evidence.fixture.parts.map((q: { register: string; blank: { min: { x: number } } }) => [q.register, q.blank.min.x])).toEqual([["G54", -30], ["G55", 90]])
  expect(evidence.fixture.crossings).toEqual([])
  // A drawing with outlines only is never a verified program: the release says preview and why.
  expect(evidence.release).toBe("preview")
  expect(evidence.notes.join(" ")).toMatch(/not a finished solid/)
  // The stateless route takes the same flag.
  const stateless = await app.call("/api/cam/setups/generate", { method: "POST", json: { setup: fixture, elements: { plate }, evidence: true } })
  expect(stateless.body.programs[0].evidence.registers).toHaveLength(2)
})

const cycleTemplate = (rough: ReturnType<typeof tool>, finish: ReturnType<typeof tool>) => ({
  id: "pocket-cycle", name: "Pocket",
  steps: [
    { id: "rough", name: "Rough", tool: rough, params: { ...cam.generator.DEFAULT_SETTINGS, depth: 4, stepdown: 2, toolDiameter: rough.diameter, operationType: "pocket" } },
    { id: "finish", name: "Finish", tool: finish, dependsOn: ["rough"], params: { ...cam.generator.DEFAULT_SETTINGS, depth: 4, stepdown: 4, toolDiameter: finish.diameter, operationType: "contour" } }
  ]
})

test("a setup of operation templates is planned, saved, listed and generated as its expansion, and the plan says how many operations it has", async () => {
  const id = (await app.call("/api/projects", { method: "POST", json: { name: "Templates" } })).body.id as string
  const tools = buildTools(handlers, id)
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.id === name)!.execute(input, ctx))
  const added = await call("cad_edit", { action: "add", elements: [{ type: "rectangle", x: 0, y: 0, width: 40, height: 30, depth: 5, name: "Plate" }, { type: "rectangle", x: 60, y: 0, width: 30, height: 30, depth: 5, name: "Second" }] })
  const [plate, second] = added.ids as string[]
  const fixture = setup([], {
    templates: [cycleTemplate(tool("t6", 6), tool("t3", 3))],
    uses: [{ id: "pk", templateId: "pocket-cycle", elementIds: [plate, second], perElement: true }],
    stock: { x: 120, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" }
  })
  const plan = await call("cam", { action: "setup_plan", setup: fixture })
  expect(plan).toMatchObject({ ok: true, valid: true, operations: 4, plan: { toolChanges: 1 } })
  expect(plan.plan.programs[0].operations).toEqual(["pk[1]:rough", "pk[2]:rough", "pk[1]:finish", "pk[2]:finish"])
  const bad = await call("cam", { action: "setup_plan", setup: setup([], { ...fixture, uses: [{ id: "pk", templateId: "nope", elementIds: [plate!] }] }) })
  expect(bad.valid).toBe(false)
  expect(bad.issues[0].message).toMatch(/template nope/)

  const saved = await call("cam_edit", { action: "setup_save", name: "Two pockets", setup: fixture })
  expect(saved.ok).toBe(true)
  // The saved setup keeps the templates and the uses as written; the list counts the operations they make.
  const http = await app.call(`/api/projects/${id}/cam-setups/${saved.setupId}`)
  expect(http.body.setup.uses).toHaveLength(1)
  expect(http.body.setup.operations).toEqual([])
  expect((await call("cam", { action: "setup_list" })).setups.find((s: { id: string }) => s.id === saved.setupId)).toMatchObject({ operations: 4 })

  const generated = await call("cam_edit", { action: "setup_generate", setupId: saved.setupId })
  expect(generated).toMatchObject({ ok: true, totals: { programs: 1, toolChanges: 1 } })
  expect(generated.programs[0]).toMatchObject({ operations: 4, toolNumbers: [1, 2] })
  const row = (await app.call(`/api/toolpaths/${generated.programs[0].operationId}`)).body
  expect(String(row.gcode).match(/T\d+\s*M6/g)).toHaveLength(2)

  // The plan over HTTP and the HTTP generate route expand the same way.
  const httpPlan = await app.call("/api/cam/setups/plan", { method: "POST", json: { setup: fixture } })
  expect(httpPlan.body.programs[0].operations).toHaveLength(4)
  const elements = Object.fromEntries((added.elements as Array<{ id: string }>).map((e) => [e.id, e]))
  const stateless = await app.call("/api/cam/setups/generate", { method: "POST", json: { setup: fixture, elements } })
  expect(stateless.status).toBe(200)
  expect(stateless.body.programs[0].operationIds).toHaveLength(4)
  const missing = await app.call("/api/cam/setups/generate", { method: "POST", json: { setup: fixture, elements: { [plate!]: elements[plate!] } } })
  expect(missing.status).toBe(400)
  expect(missing.body.message).toMatch(/no element for/)
})

test("probePart stores the datum probe of every workpiece as the first program, and a setup that cannot be probed says why", async () => {
  const id = (await app.call("/api/projects", { method: "POST", json: { name: "Probe parts" } })).body.id as string
  const tools = buildTools(handlers, id)
  const call = async (name: string, input: unknown) => JSON.parse(await tools.find((t) => t.id === name)!.execute(input, ctx))
  const added = await call("cad_edit", { action: "add", elements: [{ type: "rectangle", x: 0, y: 0, width: 40, height: 30, depth: 5, name: "Plate" }] })
  const [plate] = added.ids as string[]
  const parts = [{ id: "w1", name: "Part 1", workOffset: "G54" }, { id: "w2", name: "Part 2", workOffset: "G55" }]
  const partProbe = { cycles: [{ kind: "z-surface", at: { x: 5, y: 5 }, expectedZ: 0 }, { kind: "corner", corner: { x: 0, y: 0 }, inside: false, xSense: 1, ySense: 1, depth: 5 }] }
  const base = setup([{ ...op("a", tool("t6", 6)), elementIds: [plate!] }], { workpieces: parts, stock: { x: 60, y: 50, z: 10, origin: { x: -30, y: -25, z: 0 }, material: "aluminum" } })

  // The plan names what the probe would do on each part before anything is generated.
  const plan = await call("cam", { action: "setup_plan", setup: { ...base, partProbe } })
  expect(plan.probe.toolNumber).toBe(2)
  expect(plan.probe.parts.map((q: { register: string; touches: number }) => [q.register, q.touches])).toEqual([["G54", 5], ["G55", 5]])
  expect((await call("cam", { action: "setup_plan", setup: base })).probe).toBeUndefined()
  // The plan also replays each probe on a blank displaced from where the setup puts it. These cycles stand inside the 60 x 50 blank (the corner at 0,0 is
  // not its corner), so the probe does not find the blank where it believes it is; cycles that meet the blank find it, with a rotation written to the register.
  expect(plan.probe.parts.map((q: { replay: { status: string } }) => q.replay.status)).toEqual(["stopped", "stopped"])
  expect(plan.probe.parts[0].replay.reason).toMatch(/protected move/)
  const matched = { cycles: [{ kind: "z-surface", at: { x: 0, y: 0 }, expectedZ: 0 }, { kind: "corner", corner: { x: -30, y: -25 }, inside: false, xSense: 1, ySense: 1, depth: 5, touchesPerEdge: 2 }], rotation: "g68" }
  const found = await call("cam", { action: "setup_plan", setup: { ...base, partProbe: matched } })
  expect(found.probe.parts.map((q: { replay: { status: string } }) => q.replay.status)).toEqual(["within", "within"])
  expect(found.probe.parts[0].replay).toMatchObject({ displacement: { x: 0.8, y: -0.6, z: 0.3, rotation: 0.5 }, g68: 0.5 })
  expect(found.probe.parts[0].replay.residualMm).toBeLessThan(0.05)

  const saved = await call("cam_edit", { action: "setup_save", name: "Probed", setup: { ...base, partProbe } })
  const generated = await call("cam_edit", { action: "setup_generate", setupId: saved.setupId, probePart: true })
  expect(generated.ok).toBe(true)
  expect(generated.programs).toHaveLength(2)
  expect(generated.programs[0]).toMatchObject({ kind: "probe", toolNumbers: [2] })
  expect(generated.programs[1].kind).toBeUndefined()
  expect(generated.programs[0].programNumber).not.toBe(generated.programs[1].programNumber)
  expect(generated.probe.parts).toHaveLength(2)
  const row = (await app.call(`/api/toolpaths/${generated.programs[0].operationId}`)).body
  const lines = String(row.gcode).split("\n").map((l: string) => l.trim())
  expect(lines.filter((l) => /^#5223=#5223\+/.test(l))).toHaveLength(1)
  expect(lines.filter((l) => /^#5243=#5243\+/.test(l))).toHaveLength(1)
  expect(row.data.probe.parts).toHaveLength(2)
  // Without the flag nothing about the probe is stored.
  const plain = await call("cam_edit", { action: "setup_generate", setupId: saved.setupId })
  expect(plain.programs).toHaveLength(1)
  expect(plain.probe).toBeUndefined()

  // Placed inline, the probe is inside the program that cuts the parts: one program, no separate probe program, and the replay runs the cuts only.
  const inlineSaved = await call("cam_edit", { action: "setup_save", name: "Probed inline", setup: { ...base, partProbe: { ...partProbe, placement: "inline" } } })
  const inlineGenerated = await call("cam_edit", { action: "setup_generate", setupId: inlineSaved.setupId, probePart: true })
  expect(inlineGenerated.ok, inlineGenerated.error).toBe(true)
  expect(inlineGenerated.programs).toHaveLength(1)
  expect(inlineGenerated.programs[0].kind).toBeUndefined()
  expect(inlineGenerated.programs[0].toolNumbers).toContain(2)
  const inlineRow = (await app.call(`/api/toolpaths/${inlineGenerated.programs[0].operationId}`)).body
  const inlineLines = String(inlineRow.gcode).split("\n").map((l: string) => l.trim())
  expect(inlineLines.filter((l) => /^#5223=#5223\+/.test(l))).toHaveLength(1)
  expect(inlineLines.filter((l) => /^#5243=#5243\+/.test(l))).toHaveLength(1)
  expect(String(inlineRow.gcode).search(/T2\s*M6/)).toBeLessThan(String(inlineRow.gcode).search(/T1\s*M6/))
  expect(inlineRow.data.setupEvidence.notes.join(" ")).toMatch(/without its probe cycles/)
  expect(inlineRow.data.setupEvidence.registers.map((r: { register: string }) => r.register)).toEqual(["G54", "G55"])

  // A setup with no part probe cannot be asked for one.
  const unprobed = await call("cam_edit", { action: "setup_save", name: "Plain", setup: base })
  const refused = await call("cam_edit", { action: "setup_generate", setupId: unprobed.setupId, probePart: true })
  expect(refused.ok).toBe(false)
  expect(refused.error).toMatch(/no partProbe/)

  // The HTTP routes take the same flag: the probe comes first, marked, and a setup without one is a 400.
  const element = (added.elements as Array<Record<string, unknown>>)[0]!
  const url = `/api/projects/${id}/cam-setups/${saved.setupId}/generate`
  const viaHttp = await app.call(url, { method: "POST", json: { elements: { [plate!]: element }, probePart: true } })
  expect(viaHttp.status).toBe(200)
  expect(viaHttp.body.programs.map((q: { kind?: string }) => q.kind)).toEqual(["probe", undefined])
  const denied = await app.call("/api/cam/setups/generate", { method: "POST", json: { setup: base, elements: { [plate!]: element }, probePart: true } })
  expect(denied.status).toBe(400)
  expect(denied.body.message).toMatch(/no partProbe/)
})
