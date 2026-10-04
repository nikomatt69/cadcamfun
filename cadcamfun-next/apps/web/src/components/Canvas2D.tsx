import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Commands, Doc, Elements, Geometry, Transform, type Element, type Vec2 } from "@cadcamfun/core"
import { Toolpaths } from "@cadcamfun/cam"
import { useEditor } from "../editor/store"

interface View {
  readonly cx: number
  readonly cy: number
  /** Pixels per document unit. */
  readonly scale: number
}

type Draft =
  | { readonly kind: "line" | "rectangle" | "circle"; readonly start: Vec2; readonly current: Vec2 }
  | { readonly kind: "polyline"; readonly points: ReadonlyArray<Vec2>; readonly current: Vec2 }

const pathD = (points: ReadonlyArray<{ x: number; y: number }>, closed: boolean) =>
  points.length === 0 ? "" : `M${points.map((p) => `${p.x},${p.y}`).join("L")}${closed ? "Z" : ""}`

export function Canvas2D() {
  const ed = useEditor()
  let svg!: SVGSVGElement
  const [size, setSize] = createSignal({ w: 800, h: 600 })
  const [view, setView] = createSignal<View>({ cx: 50, cy: 50, scale: 4 })
  const [cursor, setCursor] = createSignal<Vec2>({ x: 0, y: 0 })
  const [draft, setDraft] = createSignal<Draft>()
  const [drag, setDrag] = createSignal<{ start: Vec2; current: Vec2 }>()
  let pan: { x: number; y: number; view: View } | undefined

  const toScreen = (p: Vec2): Vec2 => {
    const v = view()
    const { w, h } = size()
    return { x: (p.x - v.cx) * v.scale + w / 2, y: h / 2 - (p.y - v.cy) * v.scale }
  }
  const toWorld = (sx: number, sy: number): Vec2 => {
    const v = view()
    const { w, h } = size()
    return { x: (sx - w / 2) / v.scale + v.cx, y: (h / 2 - sy) / v.scale + v.cy }
  }
  const snapped = (p: Vec2): Vec2 => {
    if (!ed.snap()) return p
    const g = ed.grid()
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }
  }
  const eventPoint = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = svg.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  const fit = () => {
    const b = Doc.bounds(ed.doc())
    const { w, h } = size()
    if (!b) return setView({ cx: 50, cy: 50, scale: Math.min(w, h) / 120 })
    const s = Geometry.boundsSize(b)
    const c = Geometry.boundsCenter(b)
    setView({ cx: c.x, cy: c.y, scale: Math.min(w / Math.max(s.x, 1), h / Math.max(s.y, 1)) * 0.8 })
  }

  onMount(() => {
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry!.contentRect.width, h: entry!.contentRect.height }))
    ro.observe(svg)
    onCleanup(() => ro.disconnect())
    requestAnimationFrame(fit)
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        return e.shiftKey ? ed.redo() : ed.undo()
      }
      if (mod && e.key.toLowerCase() === "y") return ed.redo()
      if (e.key === "Escape") {
        setDraft(undefined)
        ed.setSelection(new Set<string>())
        return
      }
      if (e.key === "Enter") return finishPolyline(false)
      if (e.key === "Delete" || e.key === "Backspace") return ed.removeSelected()
      const modes: Record<string, Parameters<typeof ed.setMode>[0]> = {
        v: "select",
        h: "pan",
        l: "line",
        r: "rectangle",
        c: "circle",
        p: "polyline",
        d: "point",
      }
      const m = modes[e.key.toLowerCase()]
      if (m && !mod) {
        setDraft(undefined)
        ed.setMode(m)
      }
      if (e.key.toLowerCase() === "f" && !mod) fit()
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  const finishPolyline = (closed: boolean) => {
    const d = draft()
    if (d?.kind !== "polyline") return
    if (d.points.length >= 2) ed.add({ _tag: "Polyline", points: d.points, closed })
    setDraft(undefined)
  }

  const onPointerDown = (e: PointerEvent) => {
    const { sx, sy } = eventPoint(e)
    const p = snapped(toWorld(sx, sy))
    if (e.button === 1 || ed.mode() === "pan") {
      pan = { x: e.clientX, y: e.clientY, view: view() }
      svg.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    switch (ed.mode()) {
      case "select": {
        const id = (e.target as SVGElement).getAttribute?.("data-id")
        if (id) {
          const sel = new Set<string>(e.shiftKey || ed.selection().has(id) ? ed.selection() : [])
          if (e.shiftKey && sel.has(id)) sel.delete(id)
          else sel.add(id)
          ed.setSelection(sel)
          setDrag({ start: p, current: p })
          svg.setPointerCapture(e.pointerId)
        } else ed.setSelection(new Set<string>())
        return
      }
      case "point":
        return ed.add({ _tag: "Point", position: p })
      case "polyline": {
        const d = draft()
        if (d?.kind === "polyline") {
          const first = d.points[0]!
          const closeEnough = Geometry.distance(toScreen(first), toScreen(p)) < 8
          if (closeEnough && d.points.length >= 3) return finishPolyline(true)
          setDraft({ ...d, points: [...d.points, p], current: p })
        } else setDraft({ kind: "polyline", points: [p], current: p })
        return
      }
      default:
        setDraft({ kind: ed.mode() as "line" | "rectangle" | "circle", start: p, current: p })
        svg.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    const { sx, sy } = eventPoint(e)
    const raw = toWorld(sx, sy)
    const p = snapped(raw)
    setCursor(p)
    if (pan) {
      const s = pan.view.scale
      setView({ ...pan.view, cx: pan.view.cx - (e.clientX - pan.x) / s, cy: pan.view.cy + (e.clientY - pan.y) / s })
      return
    }
    const g = drag()
    if (g) setDrag({ ...g, current: p })
    const d = draft()
    if (d) setDraft({ ...d, current: p } as Draft)
  }

  const onPointerUp = () => {
    pan = undefined
    const g = drag()
    if (g) {
      setDrag(undefined)
      const dx = g.current.x - g.start.x
      const dy = g.current.y - g.start.y
      if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
        ed.execute(Commands.transformElements([...ed.selection()] as never, Transform.translate(dx, dy)))
      return
    }
    const d = draft()
    if (!d || d.kind === "polyline") return
    setDraft(undefined)
    const { start: a, current: b } = d
    if (Geometry.equals(a, b)) return
    if (d.kind === "line") ed.add({ _tag: "Line", start: a, end: b })
    if (d.kind === "rectangle" && a.x !== b.x && a.y !== b.y)
      ed.add({
        _tag: "Rectangle",
        origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      })
    if (d.kind === "circle") ed.add({ _tag: "Circle", center: a, radius: Geometry.distance(a, b) })
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { sx, sy } = eventPoint(e)
    const before = toWorld(sx, sy)
    const v = view()
    const scale = Math.min(500, Math.max(0.05, v.scale * Math.exp(-e.deltaY * 0.0015)))
    const { w, h } = size()
    setView({ scale, cx: before.x - (sx - w / 2) / scale, cy: before.y - (h / 2 - sy) / scale })
  }

  const gridLines = createMemo(() => {
    const v = view()
    const { w, h } = size()
    let step = ed.grid()
    while (step * v.scale < 8) step *= 5
    const a = toWorld(0, h)
    const b = toWorld(w, 0)
    const lines: Array<{ d: string; major: boolean }> = []
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
      const sx = toScreen({ x, y: 0 }).x
      lines.push({ d: `M${sx},0V${h}`, major: Math.round(x / step) % 10 === 0 })
    }
    for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
      const sy = toScreen({ x: 0, y }).y
      lines.push({ d: `M0,${sy}H${w}`, major: Math.round(y / step) % 10 === 0 })
    }
    return lines
  })

  const dragOffset = () => {
    const g = drag()
    return g ? { x: g.current.x - g.start.x, y: g.current.y - g.start.y } : { x: 0, y: 0 }
  }

  const elementPaths = (e: Element) => {
    const off = ed.selection().has(e.id) ? dragOffset() : { x: 0, y: 0 }
    return Elements.toPaths(e).map((p) => ({
      d: pathD(
        p.points.map((q) => toScreen({ x: q.x + off.x, y: q.y + off.y })),
        p.closed,
      ),
      point: e._tag === "Point" ? toScreen({ x: p.points[0]!.x + off.x, y: p.points[0]!.y + off.y }) : undefined,
    }))
  }

  const toolpathPaths = createMemo(() => {
    const out = ed.output()
    if (!out) return []
    const result: Array<{ d: string; rapid: boolean }> = []
    for (const tp of out.program.toolpaths) {
      let prev: Vec2 | undefined
      for (const m of Toolpaths.expand(tp.moves)) {
        const s = toScreen(m)
        if (prev) result.push({ d: `M${prev.x},${prev.y}L${s.x},${s.y}`, rapid: m._tag === "Rapid" })
        prev = s
      }
    }
    return result
  })

  const draftPath = () => {
    const d = draft()
    if (!d) return ""
    if (d.kind === "polyline") return pathD([...d.points, d.current].map(toScreen), false)
    if (d.kind === "line") return pathD([d.start, d.current].map(toScreen), false)
    if (d.kind === "rectangle") {
      const [a, b] = [d.start, d.current]
      return pathD([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }].map(toScreen), true)
    }
    const r = Geometry.distance(d.start, d.current) * view().scale
    const c = toScreen(d.start)
    return `M${c.x - r},${c.y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
  }

  const layerColor = (e: Element) => e.color ?? Doc.findLayer(ed.doc(), e.layerId)?.color ?? "#9ca3af"
  const origin = () => toScreen({ x: 0, y: 0 })

  return (
    <div class="relative h-full w-full overflow-hidden bg-[var(--canvas)]">
      <svg
        ref={svg}
        class="h-full w-full touch-none select-none"
        classList={{
          "cursor-crosshair": ed.mode() !== "select" && ed.mode() !== "pan",
          "cursor-grab": ed.mode() === "pan",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDblClick={() => finishPolyline(false)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g class="pointer-events-none">
          <For each={gridLines()}>
            {(l) => <path d={l.d} stroke={l.major ? "var(--grid-major)" : "var(--grid)"} stroke-width="1" />}
          </For>
          <path d={`M${origin().x},0V${size().h}`} stroke="#22c55e55" />
          <path d={`M0,${origin().y}H${size().w}`} stroke="#ef444455" />
        </g>
        <For each={ed.doc().elements.filter((e) => Doc.findLayer(ed.doc(), e.layerId)?.visible !== false)}>
          {(e) => (
            <For each={elementPaths(e)}>
              {(p) => (
                <g>
                  <Show
                    when={p.point}
                    fallback={
                      <path
                        d={p.d}
                        fill="none"
                        stroke={ed.selection().has(e.id) ? "var(--accent)" : layerColor(e)}
                        stroke-width={ed.selection().has(e.id) ? 2 : 1.5}
                        vector-effect="non-scaling-stroke"
                      />
                    }
                  >
                    {(pt) => (
                      <g stroke={ed.selection().has(e.id) ? "var(--accent)" : layerColor(e)} stroke-width="1.5">
                        <circle cx={pt().x} cy={pt().y} r="4" fill="none" />
                        <path d={`M${pt().x - 7},${pt().y}h14M${pt().x},${pt().y - 7}v14`} />
                      </g>
                    )}
                  </Show>
                  <path
                    d={p.point ? `M${p.point.x},${p.point.y}h0.01` : p.d}
                    data-id={e.id}
                    fill="none"
                    stroke="transparent"
                    stroke-width="12"
                    stroke-linecap="round"
                    class={ed.mode() === "select" ? "cursor-move" : "pointer-events-none"}
                  />
                </g>
              )}
            </For>
          )}
        </For>
        <g class="pointer-events-none">
          <For each={toolpathPaths()}>
            {(p) => (
              <path
                d={p.d}
                stroke={p.rapid ? "#facc15aa" : "#22d3ee"}
                stroke-width="1"
                stroke-dasharray={p.rapid ? "4 4" : undefined}
                fill="none"
              />
            )}
          </For>
          <path d={draftPath()} fill="none" stroke="var(--accent)" stroke-dasharray="5 4" stroke-width="1.5" />
        </g>
      </svg>
      <div class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 font-mono text-xs text-zinc-300">
        X {cursor().x.toFixed(2)} Y {cursor().y.toFixed(2)} {ed.doc().units} · zoom {view().scale.toFixed(2)}
      </div>
      <button
        class="absolute right-2 bottom-2 rounded bg-zinc-800/80 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
        onClick={fit}
        title="Fit view (F)"
      >
        Fit
      </button>
    </div>
  )
}
