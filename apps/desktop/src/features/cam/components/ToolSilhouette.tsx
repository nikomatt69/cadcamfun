/**
 * Side view of a tool assembly to scale: the profile of `cam.kernel.assemblyProfile` mirrored about the spindle axis, each
 * part in its own colour (cutting zone, shank, holder; an assumed holder dashed). The same geometry the 3D playback revolves
 * and the replay checks, drawn as SVG so it shows wherever a tool is listed.
 */
import { For, createMemo, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"

const FILL: Readonly<Record<cam.kernel.AssemblyPart, string>> = { cutting: "#38bdf8", shank: "#b8bec6", holder: "#4b5563" }

export function ToolSilhouette(props: { readonly cutter: cam.kernel.Cutter; readonly showHolder?: boolean; readonly class?: string; readonly height?: number }): JSX.Element {
  const view = createMemo(() => {
    const profile = cam.kernel.assemblyProfile(props.cutter, { assumeHolder: props.showHolder !== false })
    const maxR = Math.max(...profile.points.map((p) => p.r), 1e-3)
    // One closed polygon per run of segments of the same part: right side up, then mirrored down on the left.
    const runs: Array<{ part: cam.kernel.AssemblyPart; points: Array<{ r: number; z: number }> }> = []
    for (let i = 0; i + 1 < profile.points.length; i++) {
      const part = profile.parts[i]!
      const last = runs[runs.length - 1]
      if (last !== undefined && last.part === part) last.points.push(profile.points[i + 1]!)
      else runs.push({ part, points: [profile.points[i]!, profile.points[i + 1]!] })
    }
    const polygons = runs.map((run) => {
      const right = run.points.map((p) => `${p.r},${-p.z}`)
      const left = [...run.points].reverse().map((p) => `${-p.r},${-p.z}`)
      return { part: run.part, points: [...right, ...left].join(" "), dashed: run.part === "holder" && profile.assumedHolder }
    })
    const pad = Math.max(maxR, profile.length) * 0.04
    return { polygons, box: `${-maxR - pad} ${-profile.length - pad} ${2 * (maxR + pad)} ${profile.length + 2 * pad}`, length: profile.length }
  })
  return (
    <svg class={props.class} height={props.height ?? 80} viewBox={view().box} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${props.cutter.name}: Ø${props.cutter.diameter}, ${props.cutter.fluteLength} mm flutes, ${props.cutter.stickout} mm stickout`} data-testid="tool-silhouette">
      <For each={view().polygons}>
        {(p) => <polygon points={p.points} fill={FILL[p.part]} fill-opacity={p.dashed ? 0.35 : 1} stroke="#1f2937" stroke-width={view().length / 400} stroke-dasharray={p.dashed ? `${view().length / 60}` : undefined} data-part={p.part} />}
      </For>
      <line x1="0" y1={0} x2="0" y2={-view().length} stroke="#ef4444" stroke-width={view().length / 600} stroke-dasharray={`${view().length / 50}`} />
    </svg>
  )
}
