/**
 * The visual capture the assistant's vision tool reads: what the user is looking at, as an image.
 *
 * Two kinds of source, one per mode (`cad`, `cam`):
 *
 * - a **viewport**: the live 3D/2D canvas (the CAD canvas, the CAM preview), captured synchronously
 *   after a fresh frame, without preserving every GPU buffer;
 * - a **program sheet**: the CAM program drawn as an image (its G-code and its toolpaths), for a
 *   mode whose viewport is not on screen. The CAM editor opens on the G-code, not on the preview,
 *   so without the sheet the CAM would have nothing to show.
 *
 * The newest source of a mode wins, and a viewport wins over a sheet: the preview draws the
 * toolpath the sheet can only describe. When the sheet is the only thing on screen it *is* the
 * capture, and the capture says so (`kind`).
 */

/** The live canvas of a viewport, with what the model needs to read it. */
export interface RenderCapture {
  readonly canvas: HTMLCanvasElement
  readonly camera?: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number] }
  readonly spatial?: Record<string, unknown>
  /** The rendered program's geometry text; hashed into the capture's program revision, never sent as text. */
  readonly programText?: string
}

/** The program sheet: a canvas the mode drew for the capture. */
export interface SheetCapture {
  readonly canvas: HTMLCanvasElement
}

interface Source<T> {
  readonly mode: "cad" | "cam"
  readonly render: () => T | undefined
}

const viewports = new Map<symbol, Source<RenderCapture>>()
const sheets = new Map<symbol, Source<SheetCapture>>()

/** Registers the canvas of a viewport; the returned function unregisters it. */
export const registerViewportCapture = (mode: "cad" | "cam", render: () => RenderCapture | undefined): (() => void) => {
  const key = Symbol(mode)
  viewports.set(key, { mode, render })
  return () => { viewports.delete(key) }
}

/** Registers the program sheet of a mode; the returned function unregisters it. */
export const registerProgramSheet = (mode: "cad" | "cam", render: () => SheetCapture | undefined): (() => void) => {
  const key = Symbol(mode)
  sheets.set(key, { mode, render })
  return () => { sheets.delete(key) }
}

/** The image of one capture, as the host carries it. */
export interface CaptureImage {
  readonly mime: "image/png"
  readonly data: string
  readonly width: number
  readonly height: number
}

/** What a capture is: the image of the viewport, the image of the program sheet, and what the scene says. */
export interface ViewportCapture extends CaptureImage {
  /** What the image shows: the live viewport, or the program sheet that stands in for it. */
  readonly kind: "viewport" | "sheet"
  readonly camera?: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number] }
  readonly spatial?: Record<string, unknown>
  readonly programText?: string
  /** The program sheet, when the capture is the viewport and the mode has a sheet. */
  readonly sheet?: CaptureImage
}

/** The newest source of a mode that answers with a usable frame. */
const newestFrame = <T>(sources: Map<symbol, Source<T>>, mode: "cad" | "cam", usable: (frame: T) => boolean): T | undefined => {
  for (const source of [...sources.values()].reverse()) {
    if (source.mode !== mode) continue
    const frame = source.render()
    if (frame === undefined || !usable(frame)) continue
    return frame
  }
  return undefined
}

const imageOf = (canvas: HTMLCanvasElement): CaptureImage => {
  const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height))
  const scaled = document.createElement("canvas")
  scaled.width = Math.max(1, Math.round(canvas.width * scale))
  scaled.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = scaled.getContext("2d")
  if (!ctx) throw new Error("Viewport capture could not create an image buffer.")
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
  const url = scaled.toDataURL("image/png")
  return { mime: "image/png", data: url.slice(url.indexOf(",") + 1), width: scaled.width, height: scaled.height }
}

const onScreen = (canvas: HTMLCanvasElement): boolean => canvas.isConnected && canvas.clientWidth > 0 && canvas.clientHeight > 0
/** A sheet is drawn off screen on purpose: it only has to exist and have pixels. */
const drawn = (canvas: HTMLCanvasElement): boolean => canvas.width > 0 && canvas.height > 0

export const captureVisibleViewport = (mode: "cad" | "cam"): ViewportCapture => {
  const frame = newestFrame(viewports, mode, (candidate) => onScreen(candidate.canvas))
  const sheet = newestFrame(sheets, mode, (candidate) => drawn(candidate.canvas))
  if (frame === undefined) {
    // Only the sheet is on screen: it is the capture.
    if (sheet === undefined) throw new Error(mode === "cam"
      ? "Open the CAM page before requesting vision."
      : "Open the CAD viewport before requesting vision.")
    return { ...imageOf(sheet.canvas), kind: "sheet" }
  }
  const image = imageOf(frame.canvas)
  return {
    ...image,
    kind: "viewport",
    ...(frame.camera ? { camera: frame.camera } : {}),
    ...(frame.spatial ? { spatial: frame.spatial } : {}),
    ...(frame.programText !== undefined ? { programText: frame.programText } : {}),
    ...(sheet !== undefined ? { sheet: imageOf(sheet.canvas) } : {})
  }
}
