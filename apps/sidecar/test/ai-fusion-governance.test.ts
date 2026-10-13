import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FUSION_EXAMPLE_HISTORY } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

/**
 * The Fusion 360 features and the CAM coverage ride on tools that were already governed (`cad`, `cad_edit`, `cam`): the scope of a
 * bridge token and the operator's policy decide who may validate and who may create, whatever the history contains.
 */
const newFeatures = {
  parameters: { w: 30 },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "slot", kind: "slot", at: [0, 0], length: "w", width: 8 }] } },
    { id: "body", type: "extrude", sketch: "s", depth: 5, operation: "new" },
    { id: "ball", type: "primitive", element: "sphere", params: { radius: 4 }, at: [40, 0, 4], operation: "new" },
    { id: "spring", type: "coil", radius: 8, pitch: 4, turns: 3, wireDiameter: 1.5, offset: 8, operation: "new" },
    { id: "copy", type: "move", targets: ["ball"], translate: [20, 0, 0], copy: true }
  ]
}

describe("a scoped bridge token", () => {
  let app: Awaited<ReturnType<typeof makeApp>>
  let projectId: string
  beforeAll(async () => {
    app = await makeApp()
    projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Governed" } })).body.id
  })
  afterAll(async () => { await app.dispose() })
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "nikcli", projectId, mode } })).body.token as string
  const invoke = (token: string, tool: string, input: Record<string, unknown>) =>
    app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId, tool, input } })

  test("the action listing an outside client reads carries the new actions, each in its scope", async () => {
    const list = async (token: string) => (await app.call("/api/ai/actions", { auth: false, headers: { authorization: `Bearer ${token}` } })).body.tools as Array<{ id: string; actions: Array<{ name: string; kind: string }>; parameters: unknown }>
    const read = await list(await issue("read"))
    const write = await list(await issue("write"))
    const names = (tools: typeof read, id: string) => tools.find((t) => t.id === id)?.actions.map((a) => a.name) ?? []
    expect(names(read, "cad")).toEqual(expect.arrayContaining(["parametric_from_element", "parametric_validate"]))
    expect(names(read, "cad_edit")).toEqual([])
    expect(names(write, "cad_edit")).toEqual(expect.arrayContaining(["parametric_convert", "parametric_create"]))
    // The parameters are published, so a client can build the call: the history schema names the new shapes and features.
    const published = JSON.stringify(read.find((t) => t.id === "cad")!.parameters)
    for (const word of ["slot", "nurbs", "primitive", "coil", "combine", "split"]) expect(published, word).toContain(word)
  })

  test("a read token validates a history with the new features but cannot create the part", async () => {
    const token = await issue("read")
    const checked = await invoke(token, "cad", { action: "parametric_validate", history: newFeatures })
    expect(checked.status).toBe(200)
    expect(checked.body.result.ok).toBe(true)
    expect(checked.body.result.bodyCount).toBe(4)
    // Reading the parametric history of an element is a read; storing its twin is a write.
    const cube = await app.toolHandlers().then((h) => h.addElements(projectId, [{ type: "cube", width: 4, height: 4, depth: 4 }])) as { ids: string[] }
    const history = await invoke(token, "cad", { action: "parametric_from_element", elementId: cube.ids[0] })
    expect(history.status).toBe(200)
    expect(history.body.result.ok).toBe(true)
    const twin = await invoke(token, "cad_edit", { action: "parametric_convert", elementId: cube.ids[0] })
    expect(twin.status).toBe(400)
    expect(JSON.stringify(twin.body)).toContain("read-only")
    const refused = await invoke(token, "cad_edit", { action: "parametric_create", name: "Nope", history: newFeatures })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain("read-only")
  })

  test("a write token creates it, an invalid history is refused by the schema before anything is written, and the part is there", async () => {
    const token = await issue("write")
    const created = await invoke(token, "cad_edit", { action: "parametric_create", name: "Fusion part", history: FUSION_EXAMPLE_HISTORY })
    expect(created.status).toBe(200)
    expect(created.body.result.ok).toBe(true)
    const broken = await invoke(token, "cad_edit", { action: "parametric_create", name: "Broken", history: { parameters: {}, features: [{ id: "c", type: "coil", radius: 5, pitch: 1, turns: 2, wireDiameter: 2, operation: "new" }] } })
    expect(JSON.stringify(broken.body)).toMatch(/exceed the wire diameter|not build|error/i)
    const described = await invoke(token, "cad", { action: "describe" })
    const names = JSON.stringify(described.body)
    expect(names).toContain("Fusion part")
    expect(names).not.toContain("Broken")
  })
})

describe("the operator's policy", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-fusion-policy-"))
  mkdirSync(join(dataDir, "ai"), { recursive: true })
  writeFileSync(join(dataDir, "ai", "policy.json"), JSON.stringify([{ effect: "deny", action: "bridge.use", resource: "cad_edit.parametric_*" }]))
  let app: Awaited<ReturnType<typeof makeApp>>
  let projectId: string
  beforeAll(async () => {
    app = await makeApp({ dataDir })
    projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Policy" } })).body.id
  })
  afterAll(async () => { await app.dispose(); rmSync(dataDir, { recursive: true, force: true }) })
  const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })

  test("denying the parametric writes keeps validation and plain elements, and takes the creation away", async () => {
    expect((await invoke("cad", { action: "parametric_validate", history: newFeatures })).status).toBe(200)
    const denied = await invoke("cad_edit", { action: "parametric_create", name: "Denied", history: newFeatures })
    expect(denied.status).toBe(400)
    expect(JSON.stringify(denied.body)).toContain("AI policy")
    expect((await invoke("cad_edit", { action: "add", elements: [{ type: "wall", length: 100, thickness: 10, height: 50 }] })).status).toBe(200)
  })
})
