/**
 * The CAM "Preview" tab (legacy `GCodeViewer.tsx`): a 2D canvas that draws the XY path of the G-code with a grid,
 * pan (drag) and zoom (wheel), a simulation dot, the position/zoom card, the dimensions footer and the detailed
 * analysis below. The G-code is read by the pure `cam.viewer.previewPath`; this component only draws.
 */
import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { ChevronUp, Info } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"

const v = cam.viewer

export interface GCodeViewerProps {
  readonly width: string
  readonly height: string
  readonly gcode: string
  readonly isSimulating: boolean
}

/** Points per second the simulation dot advances at (legacy `simulationSpeed`). */
const SIMULATION_POINTS_PER_SECOND = 5

export default function GCodeViewer(props: GCodeViewerProps): JSX.Element {
  let container: HTMLDivElement | undefined
  let canvas: HTMLCanvasElement | undefined

  const path = createMemo(() => v.previewPath(props.gcode))
  const toolPath = () => path().points
  const stats = () => path().boundaries

  const [currentPoint, setCurrentPoint] = createSignal(0)
  const [scale, setScale] = createSignal(1)
  const [offset, setOffset] = createSignal({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = createSignal(false)
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 })
  const [showScrollTop, setShowScrollTop] = createSignal(false)
  const [additionalInfoVisible, setAdditionalInfoVisible] = createSignal(true)

  const fit = (): void => {
    if (!canvas || toolPath().length === 0) return
    const next = v.fitView(stats(), canvas.width, canvas.height)
    if (!next) return
    setScale(next.scale)
    setOffset({ x: next.offsetX, y: next.offsetY })
  }

  const resize = (): void => {
    if (canvas?.parentElement) {
      canvas.width = canvas.parentElement.clientWidth
      canvas.height = canvas.parentElement.clientHeight
    }
  }

  // A new program: back to the first point and refit the view to its bounds.
  createEffect(on(() => props.gcode, () => {
    setCurrentPoint(0)
    fit()
  }))

  const draw = (): void => {
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const points = toolPath()
    const k = scale()
    const o = offset()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (points.length === 0) return

    ctx.strokeStyle = "#e5e5e5"
    ctx.lineWidth = 0.5
    const gridSize = 10 * k
    const gridX = Math.floor(o.x % gridSize)
    const gridY = Math.floor(o.y % gridSize)
    for (let x = gridX; x < canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let y = gridY; y < canvas.height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    ctx.strokeStyle = "#cccccc"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(canvas.width / 2, 0)
    ctx.lineTo(canvas.width / 2, canvas.height)
    ctx.stroke()

    ctx.strokeStyle = "#2563eb"
    ctx.lineWidth = 2
    ctx.beginPath()
    points.forEach((point, index) => {
      const x = point.x * k + o.x
      const y = canvas!.height - (point.y * k + o.y) // flip Y
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    const current = currentPoint()
    if (props.isSimulating && current < points.length) {
      const point = points[current]!
      ctx.fillStyle = "#ef4444"
      ctx.beginPath()
      ctx.arc(point.x * k + o.x, canvas.height - (point.y * k + o.y), 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  createEffect(draw)

  // Simulation: the dot walks the points at a fixed rate.
  createEffect(() => {
    if (!props.isSimulating || toolPath().length === 0) return
    let frame = 0
    let last = 0
    const animate = (timestamp: number): void => {
      if (!last) last = timestamp
      if (timestamp - last > 1000 / SIMULATION_POINTS_PER_SECOND) {
        last = timestamp
        setCurrentPoint((index) => Math.min(index + 1, toolPath().length - 1))
      }
      if (currentPoint() < toolPath().length - 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  onMount(() => {
    resize()
    fit()
    const onResize = (): void => { resize(); draw() }
    window.addEventListener("resize", onResize)
    const onScroll = (): void => { setShowScrollTop((container?.scrollTop ?? 0) > 300) }
    container?.addEventListener("scroll", onScroll)
    onCleanup(() => {
      window.removeEventListener("resize", onResize)
      container?.removeEventListener("scroll", onScroll)
    })
  })

  const onMouseDown = (event: MouseEvent): void => {
    setIsDragging(true)
    setDragStart({ x: event.clientX, y: event.clientY })
  }
  const onMouseMove = (event: MouseEvent): void => {
    if (!isDragging()) return
    const dx = event.clientX - dragStart().x
    const dy = event.clientY - dragStart().y
    setOffset((previous) => ({ x: previous.x + dx, y: previous.y + dy }))
    setDragStart({ x: event.clientX, y: event.clientY })
  }
  const onMouseUp = (): void => { setIsDragging(false) }
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.1 : 0.1
    setScale((previous) => Math.max(0.1, previous + previous * delta))
  }

  const position = () => toolPath()[currentPoint()]

  return (
    <div
      ref={container}
      class="h-full w-full flex flex-col overflow-y-auto scrollbar-thin rounded-xl scrollbar-thumb-gray-300 scrollbar-track-transparent"
      style={{ "max-height": props.height || "800px" }}
    >
      <div class="relative flex-1" style={{ width: props.width, "min-height": "400px" }}>
        <canvas
          ref={canvas}
          class="absolute inset-0 cursor-move"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        />

        <Show when={!props.gcode}>
          <div class="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-80">
            <div class="text-center p-6 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-md">
              <h3 class="text-lg font-medium text-gray-900 mb-2">{t("cam.gen.viewer.noGcode")}</h3>
              <p class="text-gray-600">
                Import a G-Code file or generate one with the toolpath generator to display here.
              </p>
            </div>
          </div>
        </Show>

        <div class="absolute top-4 left-4 p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-80 rounded-md shadow-sm">
          <Show when={toolPath().length > 0}>
            <p class="text-sm font-medium">{t("cam.gen.viewer.position")}</p>
            <Show when={position()}>
              {(point) => (
                <p class="text-xs text-gray-600">
                  X: {point().x.toFixed(2)}, Y: {point().y.toFixed(2)}, Z: {point().z.toFixed(2)}
                </p>
              )}
            </Show>
            <div class="mt-2">
              <p class="text-xs text-gray-500">Zoom: {(scale() * 100).toFixed(0)}%</p>
            </div>
          </Show>
        </div>

        <div class="absolute top-4 right-4 space-y-2">
          <button
            class="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm hover:bg-gray-100 block"
            onClick={fit}
            title={t("cam.gen.viewer.resetView")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>

          <button
            class="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm hover:bg-gray-100 block"
            onClick={() => setAdditionalInfoVisible(!additionalInfoVisible())}
            title={additionalInfoVisible() ? "Nascondi dettagli" : "Mostra dettagli"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </div>

        <Show when={toolPath().length > 0 && additionalInfoVisible()}>
          <div class="absolute bottom-4 left-4 right-4 p-3 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-90 rounded-md shadow-sm text-xs">
            <div class="flex justify-between items-center">
              <div>
                <span class="font-medium">{t("cam.gen.viewer.dimensions")}</span> X: {stats().minX.toFixed(2)} -{" "}
                {stats().maxX.toFixed(2)}, Y: {stats().minY.toFixed(2)} -{" "}
                {stats().maxY.toFixed(2)}, Z: {stats().minZ.toFixed(2)} -{" "}
                {stats().maxZ.toFixed(2)}
              </div>
              <div class="flex space-x-4">
                <div><span class="font-medium">{t("cam.gen.viewer.rapidsColon")}</span> {path().rapidMoves}</div>
                <div><span class="font-medium">{t("cam.gen.viewer.linearColon")}</span> {path().linearMoves}</div>
                <div><span class="font-medium">{t("cam.gen.viewer.circularColon")}</span> {path().circularMoves}</div>
              </div>
            </div>

            <div class="mt-1 text-gray-500 flex items-center">
              <Info size={12} class="mr-1" />
              Use the mouse to move the view. Wheel to zoom.
            </div>
          </div>
        </Show>
      </div>

      {/* Dettagli statistici avanzati */}
      <Show when={toolPath().length > 0}>
        <div class="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mt-4 mx-2 mb-2">
          <h3 class="text-lg font-medium text-gray-900 mb-2">{t("cam.gen.viewer.analysis")}</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-3 bg-gray-50 rounded-md">
              <p class="text-sm font-medium text-gray-700">{t("cam.gen.viewer.totalPoints")}</p>
              <p class="text-xl font-bold text-blue-600">{toolPath().length}</p>
            </div>
            <div class="p-3 bg-blue-50 rounded-md">
              <p class="text-sm font-medium text-gray-700">{t("cam.gen.viewer.rapids")}</p>
              <p class="text-xl font-bold text-blue-600">{path().rapidMoves}</p>
            </div>
            <div class="p-3 bg-green-50 rounded-md">
              <p class="text-sm font-medium text-gray-700">{t("cam.gen.viewer.linear")}</p>
              <p class="text-xl font-bold text-green-600">{path().linearMoves}</p>
            </div>
            <div class="p-3 bg-purple-50 rounded-md">
              <p class="text-sm font-medium text-gray-700">{t("cam.gen.viewer.circular")}</p>
              <p class="text-xl font-bold text-purple-600">{path().circularMoves}</p>
            </div>
          </div>

          <div class="mt-4 p-3 bg-gray-50 rounded-md">
            <h4 class="text-sm font-medium text-gray-700 mb-2">{t("cam.gen.viewer.workDims")}</h4>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div><span class="font-medium">{t("cad.explorer.width")}</span> {(stats().maxX - stats().minX).toFixed(2)}{" "}{t("cad.millimeters")}</div>
              <div><span class="font-medium">{t("cad.explorer.height")}</span>{" "}{(stats().maxY - stats().minY).toFixed(2)} {t("cad.millimeters")}</div>
              <div><span class="font-medium">{t("cam.gen.viewer.depthColon")}</span> {(stats().maxZ - stats().minZ).toFixed(2)}{" "}{t("cad.millimeters")}</div>
            </div>
          </div>

          <div class="mt-4 p-3 bg-yellow-50 rounded-md">
            <h4 class="text-sm font-medium text-gray-700 mb-2">{t("cam.gen.viewer.tips")}</h4>
            <div class="flex flex-wrap gap-4 text-xs text-gray-600">
              <div class="flex items-center">
                <div class="w-4 h-4 bg-blue-100 mr-1 border border-blue-200"></div>
                <span>{t("cam.gen.viewer.tipMove")}</span>
              </div>
              <div class="flex items-center">
                <div class="w-4 h-4 bg-green-100 mr-1 border border-green-200"></div>
                <span>{t("cam.gen.viewer.tipZoom")}</span>
              </div>
              <div class="flex items-center">
                <div class="w-4 h-4 bg-purple-100 mr-1 border border-purple-200"></div>
                <span>{t("cam.gen.viewer.tipReset")}</span>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Pulsante Torna Su */}
      <Show when={showScrollTop()}>
        <button
          onClick={() => container?.scrollTo({ top: 0, behavior: "smooth" })}
          class="fixed bottom-6 right-6 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-all duration-300 z-10"
          aria-label={t("cam.gen.viewer.toStart")}
        >
          <ChevronUp size={20} />
        </button>
      </Show>

      {/* Spazio alla fine per garantire lo scrolling */}
      <div class="h-6"></div>
    </div>
  )
}
