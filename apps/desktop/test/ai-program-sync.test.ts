import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { resetStores } from "./helpers/reset-stores.ts"
import { actionKey, mirrorToolResult, reconcileCoalesced, type EditorOwner } from "../src/features/ai/lib/editor-sync.ts"
import { operationIdOf } from "../src/features/ai/lib/cam-sync.ts"
import { persistDrawingContext } from "../src/features/ai/lib/drawing-context.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"

const hole = (n: number) => ({ id: `h${n}`, type: "cylinder", layerId: "default", x: n, y: 0, z: 0, radius: 2, height: 5 })
const owner: EditorOwner = { projectId: "p", drawingId: "d1", generation: 0, current: () => true }

beforeEach(() => {
  for (const element of [...useElementsStore.getState().elements]) useElementsStore.getState().deleteElement(element.id)
})
afterEach(() => resetStores())

describe("calls made inside a code_mode program reach the editor like direct ones", () => {
  test("the sync key is tool.action, for a direct call and for an inner call alike", () => {
    expect(actionKey("cad_edit", { action: "add", elements: [] })).toBe("cad_edit.add")
    expect(actionKey("cam_edit", { action: "generate", operationId: "o1" })).toBe("cam_edit.generate")
    expect(actionKey("code_mode", { code: "return 1" })).toBe("code_mode")
    expect(actionKey("cad_edit.add", { action: "add" })).toBe("cad_edit.add")
    expect(actionKey("cad", undefined)).toBe("cad")
  })

  test("each inner result mirrors its elements once, in order", () => {
    for (let n = 1; n <= 5; n++) {
      const applied = mirrorToolResult(actionKey("cad_edit", { action: "add" }), true, JSON.stringify({ ok: true, elements: [hole(n)] }), owner)
      expect(applied?.added).toBe(1)
    }
    expect(useElementsStore.getState().elements.map((e) => e.id)).toEqual(["h1", "h2", "h3", "h4", "h5"])
  })

  test("a CAM operation is found from the action key's input, or from the create result", () => {
    expect(operationIdOf("cam_edit.generate", { operationId: "op-7" }, JSON.stringify({ ok: true }))).toBe("op-7")
    expect(operationIdOf("cam_edit.create", {}, JSON.stringify({ ok: true, operationId: "op-9" }))).toBe("op-9")
    expect(operationIdOf("cam_edit.verify", { operationId: "op-7" }, JSON.stringify({ ok: false, error: "x" }))).toBeUndefined()
  })
})

describe("reconcileCoalesced", () => {
  const makeApp = (stored: () => ReadonlyArray<Record<string, unknown>>) => {
    const reads = { count: 0 }
    const app = {
      client: { drawings: { get: () => ({ _read: true }) } },
      runtime: { run: async () => { reads.count++; await new Promise((resolve) => setTimeout(resolve, 5)); return { data: { elements: stored() } } } }
    }
    return { app, reads }
  }

  test("a burst of results costs one read in flight and one more afterwards, and ends in the stored state", async () => {
    let elements: Array<Record<string, unknown>> = []
    const { app, reads } = makeApp(() => elements)
    const calls: Array<Promise<void>> = []
    for (let n = 1; n <= 60; n++) {
      elements = [...elements, hole(n)]
      calls.push(reconcileCoalesced(app, owner))
    }
    await Promise.all(calls)
    expect(reads.count).toBeLessThanOrEqual(2)
    expect(useElementsStore.getState().elements).toHaveLength(60)
  })

  test("a later call starts a new read once the first settled", async () => {
    const { app, reads } = makeApp(() => [hole(1)])
    await reconcileCoalesced(app, owner)
    await reconcileCoalesced(app, owner)
    expect(reads.count).toBe(2)
  })
})

describe("the drawing context the assistant stores", () => {
  test("is plain JSON even when an element has no name or a setting is undefined (the typed client refuses `undefined`)", async () => {
    useElementsStore.getState().addElement({ id: "nameless", type: "cube", layerId: "default", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 } as never)
    let sent: unknown
    const app = {
      settings: { settings: () => ({ units: "mm", tolerance: 0.01, decimals: 3, postProcessor: undefined }) },
      client: { kv: { set: (input: { payload: { value: unknown } }) => { sent = input.payload.value; return { _kv: true } } } },
      runtime: { run: async () => undefined },
      recents: () => []
    }
    await persistDrawingContext(app as never, "project-1")
    expect(sent).not.toBeUndefined()
    // The typed client's schema refuses `undefined` anywhere, even as an object value that JSON.stringify would drop.
    const undefinedAt = (value: unknown, path: string): string | undefined => {
      if (value === undefined) return path
      if (value === null || typeof value !== "object") return undefined
      for (const [key, item] of Object.entries(value)) { const found = undefinedAt(item, `${path}.${key}`); if (found) return found }
      return undefined
    }
    expect(undefinedAt(sent, "context")).toBeUndefined()
    expect(JSON.stringify(sent)).toContain("nameless")
  })
})
