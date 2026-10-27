/** Repeatable, informational microbenchmarks for existing TypeScript CAM hot paths. */
import { cpus, loadavg, platform, totalmem, arch } from "node:os"
import { CAM_GCODE_LINES, CAM_STOCK, CAM_WORKLOADS } from "../packages/core/test/bench/cam-workloads.ts"

const arg = (name: string, fallback: number): number => {
  const value = Number(Bun.argv.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback)
  if (!Number.isInteger(value) || value < 3 || value > 30) throw new Error(`${name} must be an integer from 3 to 30`)
  return value
}

const runs = arg("--runs", 7)
const workloads = CAM_WORKLOADS

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
  fixture: { gcodeLines: CAM_GCODE_LINES, stock: CAM_STOCK, stockRemovalCuts: 2400, surfaceGridStepMm: 0.15, surfaceGridBoundsMm: [-50, -40, 50, 40] },
  results: report
}, null, 2))
