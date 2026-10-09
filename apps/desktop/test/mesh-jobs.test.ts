import { describe, expect, test } from "bun:test"
import { MeshWorkerQueue, type MeshWorker } from "../src/viewport/view3d/mesh-jobs.ts"
import type { Solid } from "@cadcamfun/core"

const solid: Solid = { _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }
function fixture(options: { timeoutMs?: number; capacity?: number } = {}) {
  const workers: Array<MeshWorker & { sent: Array<{ id: number; solid: Solid }>; stopped: boolean }> = []
  const errors: string[] = []
  const queue = new MeshWorkerQueue({ ...options, onError: (message) => errors.push(message), create: () => {
    const worker: MeshWorker & { sent: Array<{ id: number; solid: Solid }>; stopped: boolean } = {
      onmessage: null, onerror: null, onmessageerror: null, sent: [], stopped: false,
      postMessage(request) { this.sent.push(request) }, terminate() { this.stopped = true }
    }
    workers.push(worker)
    return worker
  } })
  const answer = (index = 0) => {
    const worker = workers[index]
    const id = worker?.sent.at(-1)?.id
    if (!worker || id === undefined) throw new Error("Missing job")
    worker.onmessage?.({ data: { id, positions: new Float32Array([0, 0, 0]), indices: new Uint32Array([0]) } } as MessageEvent)
  }
  return { queue, workers, errors, answer }
}

describe("meshing IPC", () => {
  test("serializes CPU work and correlates replies", () => {
    const { queue, workers, answer } = fixture()
    let installed = 0
    queue.submit(solid, () => { installed++ })
    queue.submit(solid, () => { installed++ })
    expect(workers[0]?.sent).toHaveLength(1)
    workers[0]?.onmessage?.({ data: { id: 999 } } as MessageEvent)
    expect(installed).toBe(0)
    answer()
    expect(workers[0]?.sent).toHaveLength(2)
    answer()
    expect(installed).toBe(2)
    expect(queue.pending).toBe(0)
    queue.dispose()
  })

  test("scene reset terminates stale work and ignores a late response", () => {
    const { queue, workers, answer } = fixture()
    let installed = 0
    queue.submit(solid, () => { installed++ })
    const stale = workers[0]?.onmessage
    queue.reset()
    queue.submit(solid, () => { installed++ })
    stale?.({ data: { id: 1, positions: new Float32Array(), indices: new Uint32Array() } } as MessageEvent)
    expect(installed).toBe(0)
    expect(workers[0]?.stopped).toBe(true)
    answer(1)
    expect(installed).toBe(1)
    queue.dispose()
    queue.submit(solid, () => {})
    expect(workers).toHaveLength(2)
  })

  test("a dead worker clears all pending jobs and a subsequent request can restart", () => {
    const { queue, workers, errors } = fixture()
    queue.submit(solid, () => {})
    queue.submit(solid, () => {})
    workers[0]?.onerror?.({ message: "dead" } as ErrorEvent)
    expect(queue.pending).toBe(0)
    expect(workers[0]?.stopped).toBe(true)
    expect(errors).toEqual(["dead"])
    queue.submit(solid, () => {})
    expect(workers).toHaveLength(2)
    queue.dispose()
  })

  test("unresponsive and overloaded workers fail within a bounded budget", async () => {
    const timeout = fixture({ timeoutMs: 15 })
    timeout.queue.submit(solid, () => {})
    await new Promise((r) => setTimeout(r, 40))
    expect(timeout.queue.pending).toBe(0)
    expect(timeout.workers[0]?.stopped).toBe(true)
    expect(timeout.errors[0]).toContain("timed out")
    timeout.queue.dispose()
    const capacity = fixture({ capacity: 1 })
    capacity.queue.submit(solid, () => {})
    capacity.queue.submit(solid, () => {})
    expect(capacity.errors[0]).toContain("full")
    expect(capacity.queue.pending).toBe(0)
    capacity.queue.dispose()
  })
})
