import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { t } from "../../i18n/index.ts"
import { boundingBox, DEFAULT_SNAP_SETTINGS, type Drawing, type Entity, type Snap, type Vec2 } from "@cadcamfun/core"
import { createEditorState } from "../../shared/state/editor.ts"
import { addEntities, removeEntities, type Command } from "../../shared/state/commands.ts"
import { createSpatialIndex, type SpatialItem } from "../spatial/grid.ts"
import { createCamera, cameraForBounds, gridStep, pan, resize, screenToWorld, ticksBetween, visibleBounds, worldToScreen, zoomAt } from "./camera.ts"
import { outlineDistance, paintEntity, renderEntity } from "./render.ts"
import { pickEntities, snapAt } from "./snap-pipeline.ts"
import { selectionBand, selectionOf, startTool, type Tool, type ToolId, type PointerEvent as ToolPointer } from "./tools/index.ts"

export interface Editor2DProps {
  readonly drawing: Drawing
  readonly onChange: (drawing: Drawing) => void
  readonly selectedTool: ToolId
}

export function Editor2D(props: Editor2DProps) {
  let canvas: HTMLCanvasElement | undefined
  const editor = createEditorState(props.drawing)
  const [camera, setCamera] = createSignal(createCamera(undefined, 4))
  const [revision, setRevision] = createSignal(0)
  const index = createSpatialIndex<SpatialItem>()
  let entities = new Map<string, Entity>()
  let tool: Tool | undefined
  let marker: Snap | undefined
  let frame = 0, space = false, dragging = false, last: Vec2 | undefined
  let text = "Text"
  const pointers = new Map<number, Vec2>()
  let emitted: Drawing | undefined
  const redraw = () => setRevision(v => v + 1)
  const activate = () => {
    tool = startTool(props.selectedTool, bounds => index.query(bounds).filter(id => !locked(id)), () => ({ selection: editor.selection().filter(id => !locked(id)), entity: id => entities.get(id) }), () => text)
    redraw()
  }
  const apply = (command: Command) => {
    emitted = editor.apply(command)
    props.onChange(emitted)
  }
  const locked = (id: string): boolean => {
    const entity = entities.get(id)
    return entity?.locked === true || editor.drawing().layers.find(l => l.id === entity?.layerId)?.locked === true
  }
  const commit = () => {
    if (!tool || tool.id === "select") return
    const command = tool.command(tool)
    if (!command) return
    // Gesture machines use local sequence ids; allocate document-unique ids at commit.
    if (["line", "rectangle", "circle", "ellipse", "arc", "polyline", "text", "dimension"].includes(tool.id)) {
      const additions = command.apply({ ...editor.drawing(), entities: [] }).entities.map(e => ({ ...e, id: crypto.randomUUID(), layerId: editor.drawing().layers.find(l => l.visible && !l.locked)?.id ?? e.layerId }))
      apply(addEntities(additions, command.label))
    } else apply(command)
    activate()
  }
  createEffect(() => {
    const incoming = props.drawing
    if (incoming !== emitted && incoming !== editor.drawing()) { editor.load(incoming); activate() }
  })
  createEffect(() => {
    const drawing = editor.drawing()
    entities = new Map(drawing.entities.filter(e => e.visible && drawing.layers.find(l => l.id === e.layerId)?.visible !== false).map(e => [e.id, renderEntity(e)]))
    index.build([...entities.values()].map(e => ({ id: e.id, bounds: boundingBox(e) })))
    redraw()
  })
  createEffect(() => { props.selectedTool; activate() })

  const screen = (e: PointerEvent | WheelEvent): Vec2 => {
    const rect = canvas?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }
  const pointer = (e: PointerEvent): ToolPointer => {
    const raw = screenToWorld(camera(), screen(e)), tolerance = 8 / camera().scale
    marker = props.selectedTool === "select" ? undefined : snapAt(raw, { index, entities, settings: { ...DEFAULT_SNAP_SETTINGS, tolerance, gridEnabled: true, gridSpacing: gridStep(camera().scale) } })?.snap
    return { point: marker?.point ?? raw, modifiers: { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }, hits: pickEntities(raw, index, entities, tolerance, outlineDistance).filter(id => !locked(id)), ...(marker ? { snap: marker } : {}) }
  }
  const down = (e: PointerEvent) => {
    canvas?.focus(); canvas?.setPointerCapture(e.pointerId)
    dragging = space || e.button === 1 || e.button === 2
    last = screen(e)
    pointers.set(e.pointerId, last)
    if (pointers.size > 1) { dragging = true; tool = tool?.start(); return }
    if (!dragging && e.button === 0 && tool) tool = tool.onPointerDown(pointer(e), tool)
    redraw()
  }
  const move = (e: PointerEvent) => {
    const next = screen(e)
    if (pointers.has(e.pointerId) && pointers.size === 2) {
      const before = [...pointers.values()]
      pointers.set(e.pointerId, next)
      const after = [...pointers.values()]
      const a = before[0], b = before[1], c = after[0], d = after[1]
      if (a && b && c && d) {
        const oldDistance = Math.hypot(a.x - b.x, a.y - b.y), newDistance = Math.hypot(c.x - d.x, c.y - d.y)
        const anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        setCamera(camera => pan(zoomAt(camera, oldDistance > 0 ? newDistance / oldDistance : 1, anchor), (c.x + d.x) / 2 - anchor.x, (c.y + d.y) / 2 - anchor.y))
      }
      redraw(); return
    }
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, next)
    if (dragging && last) setCamera(c => pan(c, next.x - (last?.x ?? next.x), next.y - (last?.y ?? next.y)))
    else if (tool) tool = tool.onPointerMove(pointer(e), tool)
    last = next; redraw()
  }
  const up = (e: PointerEvent) => {
    if (!dragging && tool) {
      tool = tool.onPointerUp(pointer(e), tool)
      if (tool.id === "select") editor.setSelection(selectionOf(tool))
      else if (tool.id !== "polyline") commit()
    }
    pointers.delete(e.pointerId)
    dragging = pointers.size > 0; last = [...pointers.values()][0]
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    redraw()
  }
  const key = (e: KeyboardEvent) => {
    if (props.selectedTool === "text" && !e.ctrlKey && !e.metaKey && (e.key.length === 1 || e.key === "Backspace")) {
      e.preventDefault(); text = e.key === "Backspace" ? text.slice(0, -1) : text === "Text" ? e.key : text + e.key; redraw(); return
    }
    if (e.code === "Space") { space = true; e.preventDefault(); return }
    if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
      e.preventDefault()
      emitted = e.shiftKey || e.key.toLowerCase() === "y" ? editor.redo() : editor.undo()
      props.onChange(emitted); activate(); return
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault(); if (editor.selection().length) { apply(removeEntities(editor.selection().filter(id => !locked(id)))); editor.setSelection([]); activate() } return
    }
    if (e.key.toLowerCase() === "f") { setCamera(c => cameraForBounds(index.bounds, c.width, c.height)); return }
    if (tool) tool = tool.onKey(e.key, tool)
    if (e.key === "Enter") { e.preventDefault(); commit() }
    redraw()
  }
  const paint = () => {
    const ctx = canvas?.getContext("2d")
    if (!ctx || !canvas) return
    const c = camera(), ratio = window.devicePixelRatio || 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const bounds = visibleBounds(c), step = gridStep(c.scale)
    ctx.strokeStyle = "#94a3b833"; ctx.lineWidth = 1; ctx.beginPath()
    for (const x of ticksBetween(bounds.minX, bounds.maxX, step)) { const p = worldToScreen(c, { x, y: 0 }); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, c.height) }
    for (const y of ticksBetween(bounds.minY, bounds.maxY, step)) { const p = worldToScreen(c, { x: 0, y }); ctx.moveTo(0, p.y); ctx.lineTo(c.width, p.y) }
    ctx.stroke()
    for (const id of index.query(bounds)) {
      const entity = entities.get(id)
      if (!entity) continue
      ctx.strokeStyle = editor.selection().includes(id) ? "#f59e0b" : props.drawing.layers.find(l => l.id === entity.layerId)?.color ?? "#94a3b8"
      ctx.lineWidth = editor.selection().includes(id) ? 2 : 1
      paintEntity(ctx, entity, c)
    }
    ctx.strokeStyle = "#38bdf8"; ctx.setLineDash([5, 3])
    for (const entity of tool?.preview(tool) ?? []) paintEntity(ctx, entity, c)
    ctx.setLineDash([])
    const band = tool ? selectionBand(tool) : undefined
    if (band) {
      const a = worldToScreen(c, band.from), b = worldToScreen(c, band.to)
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    }
    if (marker) { const p = worldToScreen(c, marker.point); ctx.strokeStyle = "#22c55e"; ctx.strokeRect(p.x - 4, p.y - 4, 8, 8) }
  }
  createEffect(() => { revision(); camera(); editor.selection(); if (canvas) { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint) } })
  onMount(() => {
    const observer = new ResizeObserver(() => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio))
      setCamera(c => resize(c, rect.width, rect.height)); redraw()
    })
    if (canvas) observer.observe(canvas)
    onCleanup(() => { observer.disconnect(); cancelAnimationFrame(frame) })
    redraw()
  })
  return <canvas ref={canvas} aria-label={t("viewport.editor2d")} tabIndex={0} style={{ width: "100%", height: "100%", display: "block", "touch-action": "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { pointers.clear(); dragging = false; activate() }} onContextMenu={e => e.preventDefault()} onWheel={e => { e.preventDefault(); setCamera(c => zoomAt(c, Math.exp(-e.deltaY * 0.001), screen(e))) }} onKeyDown={key} onKeyUp={e => { if (e.code === "Space") space = false }} onBlur={() => { space = false; dragging = false; pointers.clear() }} />
}
