/** Project adaptation of the existing parametric kernel. Tests never persist a variant. */
import { createHash } from "node:crypto"
import { usesOf } from "@cadcamfun/core"
import { historySchema, parametricReport, type ParametricHandlerInput } from "@cadcamfun/ai"

export const historyRevision = (history: unknown): string => createHash("sha256").update(JSON.stringify(history)).digest("hex")

export const inspectParametric = (history: unknown) => {
  const decoded = historySchema.safeParse(history)
  if (!decoded.success) return { ok: false, error: "Stored parametric history is invalid.", problems: decoded.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) }
  return { ...parametricReport(decoded.data), history: decoded.data, revision: historyRevision(history), dependencies: Object.keys(decoded.data.parameters).map((name) => ({ name, ...usesOf(decoded.data, name) })) }
}

export const changeParameters = (history: unknown, parameters: Readonly<Record<string, number | string>>) => {
  const decoded = historySchema.safeParse(history)
  if (!decoded.success) return { ok: false as const, error: "Stored parametric history is invalid." }
  const unknown = Object.keys(parameters).filter((name) => !Object.hasOwn(decoded.data.parameters, name))
  if (unknown.length > 0) return { ok: false as const, error: `Unknown parameters: ${unknown.join(", ")}. Inspect the part first.` }
  const next = { ...decoded.data, parameters: { ...decoded.data.parameters, ...parameters } }
  return { ok: true as const, history: next, report: parametricReport(next) }
}

export const testParametric = (history: unknown, input: Extract<ParametricHandlerInput, { action: "test" }>) => {
  const cases = input.cases.map((c) => {
    const changed = changeParameters(history, c.parameters)
    if (!changed.ok) return { name: c.name, passed: false, error: changed.error }
    const report = changed.report
    const failures = [
      ...(!report.ok ? ["The variant did not rebuild successfully"] : []),
      ...(c.expectedBodies !== undefined && report.bodyCount !== c.expectedBodies ? [`Expected ${c.expectedBodies} bodies; got ${report.bodyCount}`] : []),
      ...(c.minVolumeMm3 !== undefined && (report.volumeMm3 === null || report.volumeMm3 < c.minVolumeMm3) ? ["Volume is below minVolumeMm3"] : []),
      ...(c.maxVolumeMm3 !== undefined && (report.volumeMm3 === null || report.volumeMm3 > c.maxVolumeMm3) ? ["Volume exceeds maxVolumeMm3"] : [])
    ]
    return { name: c.name, passed: failures.length === 0, failures, ...report }
  })
  return { ok: cases.every((c) => c.passed), revision: historyRevision(history), mutated: false, cases }
}
