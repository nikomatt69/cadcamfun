/** One owned frame at a time. A moving camera requests another frame until damping settles. */
export class FrameScheduler {
  private frame: number | undefined
  private suspended = false
  private closed = false

  constructor(
    private readonly draw: () => boolean,
    private readonly request: (callback: FrameRequestCallback) => number,
    private readonly cancel: (id: number) => void,
  ) {}

  invalidate = (): void => {
    if (this.closed || this.suspended || this.frame !== undefined) return
    this.frame = this.request(() => {
      this.frame = undefined
      if (this.closed || this.suspended) return
      if (this.draw()) this.invalidate()
    })
  }

  suspend(value: boolean): void {
    this.suspended = value
    if (value && this.frame !== undefined) {
      this.cancel(this.frame)
      this.frame = undefined
    }
    if (!value) this.invalidate()
  }

  dispose(): void {
    this.closed = true
    if (this.frame !== undefined) this.cancel(this.frame)
    this.frame = undefined
  }
}
