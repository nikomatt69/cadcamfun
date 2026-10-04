import { For, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js"
import type { Toolpaths } from "@cadcamfun/cam"

type Motion = Toolpaths.Motion
interface Point {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface SimulatorProps {
  readonly moves: ReadonlyArray<Motion>
  readonly lines: ReadonlyArray<number>
  /** Rapid traverse rate (mm/min) used to time G0 moves. */
  readonly rapidFeed: number
  /** Called with the source line of the move being executed. */
  readonly onLine?: (line: number) => void
  /** Jump to this move index (e.g. when a line is clicked in the editor). */
  readonly seekMove?: number
}

const origin: Point = { x: 0, y: 0, z: 0 }
const speeds = [1, 5, 20, 100] as const

/**
 * Top-view toolpath playback: the full path is drawn faded, the executed part on top (cuts
 * coloured by depth, rapids dashed), with the tool position interpolated in machine time.
 */
export function GcodeSimulator(props: SimulatorProps) {
  let canvas!: HTMLCanvasElement
  let host!: HTMLDivElement

  // Cumulative machine time (s) at the end of each move.
  const timeline = createMemo(() => {
    const ends: Array<number> = []
    let t = 0
    let p = origin
    for (const m of props.moves) {
      const d = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z)
      const rate = m._tag === "Rapid" ? props.rapidFeed : Math.max(m.f, 1)
      t += (d / rate) * 60
      ends.push(t)
      p = m
    }
    return ends
  })
  const total = () => timeline().at(-1) ?? 0

  const [time, setTime] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)
  const [speed, setSpeed] = createSignal<(typeof speeds)[number]>(5)

  /** Index of the move being executed at `t`, and the tool position. */
  const state = createMemo(() => {
    const t = time()
    const ends = timeline()
    let lo = 0
    let hi = ends.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid]! < t) lo = mid + 1
      else hi = mid
    }
    const index = Math.max(0, lo)
    const m = props.moves[index]
    if (!m) return { index: -1, pos: origin, feed: 0 }
    const prev = index > 0 ? props.moves[index - 1]! : origin
    const start = index > 0 ? ends[index - 1]! : 0
    const span = ends[index]! - start
    const k = span > 0 ? Math.min(1, Math.max(0, (t - start) / span)) : 1
    return {
      index,
      pos: { x: prev.x + (m.x - prev.x) * k, y: prev.y + (m.y - prev.y) * k, z: prev.z + (m.z - prev.z) * k },
      feed: m._tag === "Rapid" ? props.rapidFeed : m.f,
      rapid: m._tag === "Rapid",
    }
  })

  createEffect(
    on(
      () => state().index,
      (i) => {
        const line = props.lines[i]
        if (line !== undefined) props.onLine?.(line)
      },
    ),
  )
  createEffect(
    on(
      () => props.seekMove,
      (i) => {
        if (i === undefined) return
        setPlaying(false)
        setTime(i > 0 ? (timeline()[i - 1] ?? 0) : 0)
      },
      { defer: true },
    ),
  )
  // New program: rewind.
  createEffect(
    on(
      () => props.moves,
      () => setTime((t) => Math.min(t, total())),
      { defer: true },
    ),
  )

  let raf = 0
  let last = 0
  const tick = (now: number) => {
    const dt = last ? (now - last) / 1000 : 0
    last = now
    if (playing()) {
      const next = time() + dt * speed()
      if (next >= total()) {
        setTime(total())
        setPlaying(false)
      } else setTime(next)
    }
    raf = requestAnimationFrame(tick)
  }

  const bounds = createMemo(() => {
    let minX = 0
    let minY = 0
    let maxX = 1
    let maxY = 1
    let minZ = 0
    let maxZ = 0
    for (const m of props.moves) {
      minX = Math.min(minX, m.x)
      minY = Math.min(minY, m.y)
      maxX = Math.max(maxX, m.x)
      maxY = Math.max(maxY, m.y)
      minZ = Math.min(minZ, m.z)
      maxZ = Math.max(maxZ, m.z)
    }
    return { minX, minY, maxX, maxY, minZ, maxZ }
  })

  const draw = () => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = host.clientWidth
    const h = host.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = "#0b0c10"
    ctx.fillRect(0, 0, w, h)

    const b = bounds()
    const pad = 24
    const scale = Math.min((w - 2 * pad) / (b.maxX - b.minX || 1), (h - 2 * pad) / (b.maxY - b.minY || 1))
    const ox = pad + (w - 2 * pad - (b.maxX - b.minX) * scale) / 2
    const oy = pad + (h - 2 * pad - (b.maxY - b.minY) * scale) / 2
    const sx = (x: number) => ox + (x - b.minX) * scale
    const sy = (y: number) => h - (oy + (y - b.minY) * scale)

    // Origin axes
    ctx.lineWidth = 1
    ctx.strokeStyle = "#ef444480"
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(0))
    ctx.lineTo(sx(0) + 30, sy(0))
    ctx.stroke()
    ctx.strokeStyle = "#22c55e80"
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(0))
    ctx.lineTo(sx(0), sy(0) - 30)
    ctx.stroke()

    const depthColor = (z: number) => {
      const k = b.minZ < 0 ? Math.min(1, Math.max(0, z / b.minZ)) : 0
      return `hsl(${190 - 150 * k} 90% ${60 - 15 * k}%)`
    }
    const { index, pos } = state()
    const segment = (from: Point, to: Motion, done: boolean) => {
      ctx.beginPath()
      ctx.moveTo(sx(from.x), sy(from.y))
      ctx.lineTo(sx(to.x), sy(to.y))
      if (to._tag === "Rapid") {
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = done ? "#a1a1aa" : "#52525b"
        ctx.lineWidth = 1
      } else {
        ctx.setLineDash([])
        ctx.strokeStyle = done ? depthColor(to.z) : "#71717a"
        ctx.lineWidth = done ? 1.6 : 1
      }
      ctx.stroke()
    }
    let p: Point = origin
    props.moves.forEach((m, i) => {
      if (i < index) segment(p, m, true)
      else if (i === index) segment(p, { ...m, x: pos.x, y: pos.y, z: pos.z }, true)
      else segment(p, m, false)
      p = m
    })
    ctx.setLineDash([])

    // Tool
    if (index >= 0) {
      ctx.fillStyle = pos.z < 0 ? "#f59e0b" : "#e4e4e7"
      ctx.beginPath()
      ctx.arc(sx(pos.x), sy(pos.y), 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  onMount(() => {
    raf = requestAnimationFrame(tick)
    const ro = new ResizeObserver(draw)
    ro.observe(host)
    onCleanup(() => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    })
  })
  createEffect(() => {
    state()
    props.moves
    draw()
  })

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

  return (
    <div class="flex h-full flex-col">
      <div ref={host} class="relative min-h-0 flex-1">
        <canvas ref={canvas} class="absolute inset-0" data-testid="simulator" />
        <div class="absolute top-2 left-2 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-zinc-300">
          X {state().pos.x.toFixed(3)} Y {state().pos.y.toFixed(3)} Z {state().pos.z.toFixed(3)}
          <br />
          {state().rapid ? "G0" : "G1"} F{state().feed.toFixed(0)} · move {state().index + 1}/{props.moves.length}
        </div>
      </div>
      <div class="flex items-center gap-2 border-t border-zinc-800 p-2">
        <button
          class="w-16 rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-black"
          onClick={() => {
            if (time() >= total()) setTime(0)
            last = 0
            setPlaying((p) => !p)
          }}
        >
          {playing() ? "Pause" : "Play"}
        </button>
        <button
          class="rounded bg-zinc-800 px-2 py-1 text-xs"
          onClick={() => {
            setPlaying(false)
            setTime(0)
          }}
        >
          ⏮
        </button>
        <input
          type="range"
          class="flex-1 accent-[var(--accent)]"
          min={0}
          max={total()}
          step={total() / 2000 || 1}
          value={time()}
          onInput={(e) => setTime(Number(e.currentTarget.value))}
        />
        <span class="w-24 text-right font-mono text-[11px] text-zinc-400">
          {fmt(time())} / {fmt(total())}
        </span>
        <div class="flex gap-0.5">
          <For each={speeds}>
            {(s) => (
              <button
                class="rounded px-1.5 py-1 text-[11px]"
                classList={{
                  "bg-zinc-600 text-white": speed() === s,
                  "bg-zinc-800 text-zinc-400": speed() !== s,
                }}
                onClick={() => setSpeed(s)}
              >
                ×{s}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
