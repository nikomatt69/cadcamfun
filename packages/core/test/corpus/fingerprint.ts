/** The machine a corpus or bench run was measured on (spec 55 §3): timings are judged with the load they ran under. */
import { arch, cpus, loadavg, platform, totalmem } from "node:os"

export interface Fingerprint {
  readonly bun: string
  readonly platform: string
  readonly cpu: string
  readonly logicalCpus: number
  readonly totalMemoryBytes: number
  /** 1, 5 and 15 minute load averages at the start of the run. */
  readonly loadAverage: readonly [number, number, number]
}

export const fingerprint = (): Fingerprint => {
  const [one, five, fifteen] = loadavg()
  return {
    bun: Bun.version,
    platform: `${platform()}-${arch()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    loadAverage: [one ?? 0, five ?? 0, fifteen ?? 0]
  }
}

/** Load per logical CPU over the last minute: above 1 the run competed for the processors. */
export const loadPerCpu = (f: Fingerprint): number => f.loadAverage[0] / Math.max(1, f.logicalCpus)
