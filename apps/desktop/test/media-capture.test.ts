/**
 * Screenshots and videos of the CAD canvas and the CAM preview: the pure rules (file names, even
 * video sizes, the container the webview can encode) and the two captures against a recording
 * double of the canvas, the stream and the recorder.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

installDom("http://localhost/cad")

const { registerViewportCapture } = await import("../src/features/ai/lib/viewport-capture.ts")
const capture = await import("../src/viewport/media-capture.ts")

const drawCalls: unknown[][] = []
const unregister: Array<() => void> = []

const liveCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  Object.defineProperty(canvas, "isConnected", { value: true })
  Object.defineProperty(canvas, "clientWidth", { value: width, configurable: true })
  Object.defineProperty(canvas, "clientHeight", { value: height, configurable: true })
  return canvas
}

let restoreCanvas = (): void => undefined
// Later files in the same process draw on the real prototype: the double goes when this file is done.
afterAll(() => { restoreCanvas() })

beforeAll(() => {
  const proto = Object.getPrototypeOf(document.createElement("canvas")) as Record<string, unknown>
  const original = Object.getOwnPropertyDescriptors(proto)
  restoreCanvas = () => { Object.defineProperties(proto, original) }
  proto.getContext = () => ({ fillStyle: "", fillRect: () => undefined, drawImage: (...args: unknown[]) => { drawCalls.push(args) } })
  proto.toBlob = function (callback: (blob: Blob | null) => void, type: string) { callback(new Blob(["png"], { type })) }
  proto.captureStream = () => ({ getTracks: () => [{ stop: () => undefined }] })
})

afterEach(() => {
  while (unregister.length > 0) unregister.pop()!()
  drawCalls.length = 0
})

describe("capture rules", () => {
  test("file names are sortable and carry the mode", () => {
    expect(capture.captureName("cad", "png", new Date(2026, 10, 2, 14, 5, 9))).toBe("cad-2026-11-02-140509.png")
    expect(capture.captureName("cam", "webm", new Date(2026, 0, 31, 0, 0, 0))).toBe("cam-2026-01-31-000000.webm")
  })

  test("video sizes are even and capped on the longest edge", () => {
    expect(capture.videoSize(801, 601)).toEqual({ width: 802, height: 602 })
    const big = capture.videoSize(3840, 2160)
    expect(big.width).toBe(1920)
    expect(big.height).toBe(1080)
    expect(capture.videoSize(0, 0).width).toBeGreaterThanOrEqual(2)
  })

  test("the first supported container wins, mp4 and webm map to their extension", () => {
    expect(capture.pickVideoType((type) => type.startsWith("video/webm"))).toBe("video/webm;codecs=vp9")
    expect(capture.pickVideoType((type) => type === "video/mp4")).toBe("video/mp4")
    expect(capture.pickVideoType(() => false)).toBeUndefined()
    expect(capture.extensionOf("video/mp4;codecs=avc1")).toBe("mp4")
    expect(capture.extensionOf("video/webm")).toBe("webm")
  })
})

describe("screenshot", () => {
  test("captures the live viewport of the mode as a PNG at its own resolution", async () => {
    const canvas = liveCanvas(1600, 900)
    unregister.push(registerViewportCapture("cad", () => ({ canvas })))
    const shot = await capture.takeScreenshot("cad")
    expect(shot.mime).toBe("image/png")
    expect(shot.name).toMatch(/^cad-\d{4}-\d{2}-\d{2}-\d{6}\.png$/)
    expect(shot.blob.size).toBeGreaterThan(0)
    expect(drawCalls[0]?.[0]).toBe(canvas)
  })

  test("the CAM mode ignores a CAD viewport", async () => {
    unregister.push(registerViewportCapture("cad", () => ({ canvas: liveCanvas(100, 100) })))
    await expect(capture.takeScreenshot("cam")).rejects.toMatchObject({ code: "unavailable" })
  })

  test("a viewport that is off screen is not captured", async () => {
    const canvas = liveCanvas(100, 100)
    Object.defineProperty(canvas, "clientWidth", { value: 0 })
    unregister.push(registerViewportCapture("cad", () => ({ canvas })))
    await expect(capture.takeScreenshot("cad")).rejects.toMatchObject({ code: "unavailable" })
  })
})

describe("video", () => {
  class FakeRecorder {
    static isTypeSupported = (type: string): boolean => type === "video/webm"
    state: "inactive" | "recording" = "inactive"
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(readonly stream: unknown, readonly options: { mimeType: string }) {}
    start() { this.state = "recording" }
    stop() {
      this.state = "inactive"
      this.ondataavailable?.({ data: new Blob(["frames"], { type: "video/webm" }) })
      this.onstop?.()
    }
  }

  test("records the viewport, stops into a webm file and releases the stream", async () => {
    const globals = globalThis as unknown as Record<string, unknown>
    const before = globals.MediaRecorder
    globals.MediaRecorder = FakeRecorder
    try {
      unregister.push(registerViewportCapture("cam", () => ({ canvas: liveCanvas(1001, 501) })))
      expect(capture.canRecord()).toBe(true)
      const recording = capture.startRecording("cam")
      const clip = await recording.stop()
      expect(clip.mime).toBe("video/webm")
      expect(clip.name).toMatch(/^cam-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/)
      expect(clip.blob.size).toBeGreaterThan(0)
      await expect(recording.stop()).rejects.toMatchObject({ code: "failed" })
    } finally { globals.MediaRecorder = before }
  })

  test("refuses to start without a viewport or without a recorder", () => {
    const globals = globalThis as unknown as Record<string, unknown>
    const before = globals.MediaRecorder
    globals.MediaRecorder = FakeRecorder
    try { expect(() => capture.startRecording("cad")).toThrow(/No viewport/) } finally { globals.MediaRecorder = before }
    globals.MediaRecorder = undefined
    try { expect(() => capture.startRecording("cad")).toThrow(/cannot record/) } finally { globals.MediaRecorder = before }
  })
})
