/** Repeatable, informational microbenchmarks for existing TypeScript CAM hot paths. */
import { cpus, loadavg, platform, totalmem, arch } from "node:os"
import { HeightField } from "../packages/core/src/cam/verify/heightfield.ts"
import { verifyToolpath } from "../packages/core/src/cam/verify/verify.ts"
import { sampleNodes } from "../packages/core/src/cam/operations/surface-field.ts"

const arg = (name: string, fallback: number): number => {
  const value = Number(Bun.argv.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback)
  if (!Number.isInteger(value) || value < 3 || value > 30) throw new Error(`${name} must be an integer from 3 to 30`)
  return value
}

const runs = arg("--runs", 7)
const box = { minX: -25, maxX: 25, minY: -20, maxY: 20, minZ: -12, maxZ: 0 }
const gcode = ["G21", "G90", "G0 X-24 Y-19 Z2", "G1 Z-2 F200"]
for (let row = 0; row < 600; row++) {
  const y = -19 + row * 0.05
  const x = row % 2 === 0 ? 24 : -24
  gcode.push(`G1 X${x} Y${y.toFixed(3)} F600`)
}
const program = gcode.join("\n")

const workloads: Record<string, () => number> = {
  "stock-removal": () => {
    const field = new HeightField(500, 400, -25, -20, 50, 40, -12, 0)
    const cutter = { radius: 3, flat: false, profile: (r: number) => 3 - Math.sqrt(Math.max(0, 9 - r * r)) }
    for (let i = 0; i < 2_400; i++) field.cut(cutter, -24 + (i % 160) * 0.3, -19 + Math.floor(i / 160) * 0.03, -2)
    return field.volume()
  },
  "drop-cutter-grid": () => {
    const samples = sampleNodes((x, y) => 2 * Math.sin(x / 12) * Math.cos(y / 9), { x0: -50, y0: -40, x1: 50, y1: 40 }, 0.15)
    return samples.reduce((sum, value) => sum + value * value, 0)
  },
  "gcode-verification": () => {
    const result = verifyToolpath({
      gcode: program,
      stock: box,
      tool: { kind: "endmill", diameter: 6 },
      fixtures: [],
      tolerance: 0.05,
      resolution: 0.5
    })
    if (!result.ok) throw new Error(`verification fixture was rejected: ${result.issues.map((issue) => issue.message).join("; ")}`)
    return result.stats.removedVolume
  }
}

const percentile = (values: number[], p: number): number => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? 0
const report: Record<string, unknown> = {}
for (const [name, run] of Object.entries(workloads)) {
  run() // warm caches and JIT before collecting samples
  const timings: number[] = []
  let checksum = 0
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    checksum = run()
    timings.push(performance.now() - started)
  }
  report[name] = { runs, p50Ms: Math.round(percentile(timings, 0.5) * 10) / 10, p95Ms: Math.round(percentile(timings, 0.95) * 10) / 10, checksum: Number(checksum.toFixed(6)) }
}

console.log(JSON.stringify({
  informational: true,
  bun: Bun.version,
  platform: `${platform()}-${arch()}`,
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCpus: cpus().length,
  totalMemoryBytes: totalmem(),
  loadAverage: loadavg(),
  fixture: { gcodeLines: gcode.length, stock: box, stockRemovalCuts: 2400, surfaceGridStepMm: 0.15, surfaceGridBoundsMm: [-50, -40, 50, 40] },
  results: report
}, null, 2))
