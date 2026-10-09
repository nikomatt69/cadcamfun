/** Captures the existing renderer synchronously after a fresh frame, without preserving every GPU buffer. */
export interface RenderCapture {
  readonly canvas: HTMLCanvasElement
  readonly camera?: { position: readonly [number, number, number]; target: readonly [number, number, number] }
  readonly spatial?: Record<string, unknown>
  readonly programText?: string
}
const sources = new Map<symbol, { mode: "cad" | "cam"; render: () => RenderCapture | undefined }>()
export const registerViewportCapture = (mode: "cad" | "cam", render: () => RenderCapture | undefined): (() => void) => {
  const key = Symbol(mode)
  sources.set(key, { mode, render })
  return () => { sources.delete(key) }
}

export const captureVisibleViewport = (mode: "cad" | "cam") => {
  for (const source of [...sources.values()].reverse()) {
    if (source.mode !== mode) continue
    const frame = source.render()
    if (!frame || !frame.canvas.isConnected || frame.canvas.clientWidth === 0 || frame.canvas.clientHeight === 0) continue
    const scale = Math.min(1, 1280 / Math.max(frame.canvas.width, frame.canvas.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(frame.canvas.width * scale)); canvas.height = Math.max(1, Math.round(frame.canvas.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Viewport capture could not create an image buffer.")
    ctx.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL("image/png")
    return { data: url.slice(url.indexOf(",") + 1), width: canvas.width, height: canvas.height, ...(frame.camera ? { camera: frame.camera } : {}), ...(frame.spatial ? { spatial: frame.spatial } : {}), ...(frame.programText !== undefined ? { programText: frame.programText } : {}) }
  }
  throw new Error(`Open the ${mode.toUpperCase()} viewport before requesting vision.`)
}
