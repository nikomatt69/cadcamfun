import { afterAll, beforeAll, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"
let app: Awaited<ReturnType<typeof makeApp>>; let handlers: ToolHandlersShape; let projectId: string
const run = makeParametricRunner(() => handlers, () => projectId)
const tool = async (id: string, input: Record<string, unknown>) => {
  const d = buildTools(handlers, projectId).find((t) => t.id === id)!
  return JSON.parse(await d.execute(input as never, { sessionId: "s", projectId: "p", signal: new AbortController().signal })) as any
}
beforeAll(async () => { app = await makeApp(); handlers = await app.toolHandlers(); projectId = (await app.call("/api/projects", { method: "POST", json: { name: "x" } })).body.id })
afterAll(async () => { await app.dispose() })
const short = (label: string, o: any, n = 1500) => console.log("### " + label + "\n" + JSON.stringify(o).slice(0, n))
const sk = (id: string, shapes: unknown[], extra: object = {}) => ({ id, type: "sketch", plane: "XY", sketch: { shapes }, ...extra })
const plate = (extra: unknown[], params: object = {}) => ({
  parameters: { w: 60, h: 40, t: 8, ...params },
  features: [sk("s", [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "h" }]), { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" }, ...extra]
})
test("failures", async () => {
  const cases: Record<string, any> = {
    holeOutside: plate([{ id: "hl", type: "hole", plane: "XY", offset: "t", at: [200, 5], diameter: 6, depth: 4 }]),
    unknownParam: plate([{ id: "hl", type: "hole", plane: "XY", offset: "t", at: [10, 10], diameter: "dia", depth: 4 }]),
    cutAll: plate([sk("s2", [{ id: "c", kind: "rectangle", at: [-10, -10], width: 200, height: 200 }]), { id: "cut", type: "extrude", sketch: "s2", depth: 20, operation: "subtract" }]),
    twoBodiesUnion: plate([sk("s3", [{ id: "c", kind: "circle", at: [300, 300], diameter: 10 }]), { id: "far", type: "extrude", sketch: "s3", depth: 5, operation: "union" }]),
    bigFillet: plate([{ id: "f", type: "fillet", radius: 30, edges: { parallel: "z" } }]),
  }
  for (const [name, history] of Object.entries(cases)) {
    const c = await run({ action: "create", name, history })
    short(name + " create", { ok: c.ok, error: c.error, verification: c.verification, diagnosis: c.diagnosis, revision: c.revision, elementId: c.elementId }, 1600)
  }
  const ok = await run({ action: "create", name: "plain", history: plate([]) })
  const upd = await run({ action: "update", elementId: ok.elementId, expectedRevision: ok.revision, parameters: { nope: 3 } })
  short("unknown param", upd)
  const upd2 = await run({ action: "update", elementId: ok.elementId, expectedRevision: ok.revision, parameters: { t: -3 } })
  short("negative", { ok: upd2.ok, error: upd2.error, diagnosis: upd2.diagnosis })
}, 120000)
