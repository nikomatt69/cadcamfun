import { describe, expect, test } from "bun:test"
import { classifyOpened, listenForOpenedFiles, openDelivered, readDelivered, type OpenedDeps } from "../src/app/open-file.ts"

const bytes = (text: string) => new TextEncoder().encode(text)
const fixture = (body: string) => {
  const calls: unknown[] = []
  const deps: OpenedDeps = {
    read: async () => bytes(body),
    addElements: (elements, selected) => { calls.push(["elements", elements, selected]) },
    setProgram: async (text) => { calls.push(["program", text]) },
    go: (path) => { calls.push(["route", path]) }
  }
  return { calls, deps }
}

describe("OS file delivery", () => {
  test("registered extensions are case insensitive on both path styles", () => {
    expect(classifyOpened("C:\\parts\\part.NC")).toBe("program")
    expect(classifyOpened("/parts/part.GCODE")).toBe("program")
    expect(classifyOpened("/parts/part.cadcam")).toBe("drawing")
    expect(classifyOpened("/parts.nc/notes.txt")).toBe("unsupported")
  })
  test("a drawing is added before navigation; invalid elements never reach the store", async () => {
    const good = fixture('{"elements":[{"id":"part","type":"cube"}],"selectedElementId":"part"}')
    expect(await openDelivered("/part.cadcam", good.deps)).toMatchObject({ kind: "drawing", count: 1 })
    expect(good.calls).toEqual([["elements", [{ id: "part", type: "cube" }], "part"], ["route", "/cad"]])
    for (const body of ["{", '{"elements":[]}', '{"elements":[null]}', '{"elements":[[]]}', '{"elements":[{"type":42}]}']) {
      const invalid = fixture(body)
      expect((await openDelivered("/bad.cadcam", invalid.deps)).kind).toBe("failed")
      expect(invalid.calls).toEqual([])
    }
  })
  test("program navigation waits for preservation of the old editor; a failed save blocks replacement", async () => {
    const f = fixture("G0 X1\nM30")
    expect(await openDelivered("/part.nc", f.deps)).toMatchObject({ kind: "program", lines: 2 })
    expect(f.calls).toEqual([["program", "G0 X1\nM30"], ["route", "/cam"]])
    const failed = fixture("G0 X2")
    expect(await openDelivered("/part.nc", { ...failed.deps, setProgram: async () => { throw new Error("save failed") } })).toMatchObject({ kind: "failed", reason: "apply-failed" })
    expect(failed.calls).toEqual([])
  })
  test("empty programs, read errors, and invalid UTF-8 never change the editor", async () => {
    const f = fixture(" \n")
    expect(await openDelivered("empty.nc", f.deps)).toMatchObject({ reason: "empty" })
    expect(await openDelivered("bad.nc", { ...f.deps, read: async () => { throw new Error("denied") } })).toMatchObject({ reason: "unreadable" })
    expect(await openDelivered("bad.nc", { ...f.deps, read: async () => new Uint8Array([0xff]) })).toMatchObject({ reason: "unreadable" })
    expect(f.calls).toEqual([])
  })
  test("listens before draining cold-start paths and processes a delivery during the first drain in order", async () => {
    let event: () => void = () => {}
    let listening = false
    let stopped = false
    let take = 0
    const paths: string[] = []
    const off = await listenForOpenedFiles(async (batch) => { paths.push(...batch) }, {
      listen: async (name, handler) => { expect(name).toBe("open-file"); listening = true; event = handler; return () => { stopped = true } },
      invoke: async (cmd) => {
        expect(cmd).toBe("take_opened_files")
        expect(listening).toBe(true)
        if (take++ === 0) { event(); return ["cold.nc"] }
        return ["warm.nc"]
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(paths).toEqual(["cold.nc", "warm.nc"])
    off(); event()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stopped).toBe(true)
    expect(take).toBe(2)
  })
  test("reads raw byte responses and propagates native rejection", async () => {
    expect(await readDelivered("a.nc", async () => bytes("G0").buffer)).toEqual(bytes("G0"))
    await expect(readDelivered("other.nc", async () => { throw new Error("not delivered") })).rejects.toThrow("not delivered")
  })
})
