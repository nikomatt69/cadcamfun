import type { Mesh, Solid } from "@cadcamfun/core"

export interface MeshWorker {
  onmessage: ((event: MessageEvent<{ id: number; positions?: Float32Array; indices?: Uint32Array; error?: string }>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(input: { id: number; solid: Solid }): void
  terminate(): void
}

/** One CPU job at a time, with bounded admission and actual termination of stale scene work. */
export class MeshWorkerQueue {
  private worker: MeshWorker | undefined
  private current: { id: number; solid: Solid; install: (mesh: Mesh) => void } | undefined
  private readonly queue: Array<{ id: number; solid: Solid; install: (mesh: Mesh) => void }> = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private nextId = 0
  private disposed = false

  constructor(private readonly options: {
    create: () => MeshWorker
    onError: (message: string) => void
    timeoutMs?: number
    capacity?: number
  }) {}

  get pending(): number { return this.queue.length + (this.current ? 1 : 0) }

  submit(solid: Solid, install: (mesh: Mesh) => void): void {
    if (this.disposed) return
    if (this.pending >= (this.options.capacity ?? 128)) {
      this.fail("The 3D mesh queue is full. Reduce the scene complexity.")
      return
    }
    this.queue.push({ id: ++this.nextId, solid, install })
    this.drain()
  }

  reset(): void {
    clearTimeout(this.timer)
    if (this.worker) {
      this.worker.onmessage = null
      this.worker.onerror = null
      this.worker.onmessageerror = null
      this.worker.terminate()
    }
    this.worker = undefined
    this.current = undefined
    this.queue.length = 0
  }

  dispose(): void { this.disposed = true; this.reset() }

  private fail(message: string): void { this.reset(); this.options.onError(message) }

  private drain(): void {
    if (this.disposed || this.current || this.queue.length === 0) return
    try {
      if (!this.worker) {
        const worker = this.options.create()
        this.worker = worker
        worker.onmessage = (event) => {
          if (this.worker !== worker || event.data.id !== this.current?.id) return
          const job = this.current
          clearTimeout(this.timer)
          if (event.data.error || !(event.data.positions instanceof Float32Array) || !(event.data.indices instanceof Uint32Array)) {
            this.fail(event.data.error ?? "The mesh worker returned invalid geometry.")
            return
          }
          this.current = undefined
          try { job.install({ positions: event.data.positions, indices: event.data.indices }) }
          finally { this.drain() }
        }
        worker.onerror = (event) => {
          if (this.worker === worker) this.fail(event.message || "The mesh worker stopped unexpectedly.")
        }
        worker.onmessageerror = () => {
          if (this.worker === worker) this.fail("The mesh worker could not decode its response.")
        }
      }
      this.current = this.queue.shift()
      if (!this.current) return
      this.timer = setTimeout(() => this.fail("3D meshing timed out. Reduce the scene complexity."), this.options.timeoutMs ?? 15_000)
      this.worker.postMessage({ id: this.current.id, solid: this.current.solid })
    } catch (cause) { this.fail(cause instanceof Error ? cause.message : String(cause)) }
  }
}
