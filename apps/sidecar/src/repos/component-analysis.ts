/**
 * The structural report behind `GET /api/components/:id/analysis` (legacy `analyzeComponent`). The complexity score is a plain
 * measure of the stored data (nesting depth, property count, references). Memory, render and load times are **rough
 * estimates from the JSON size**, as in legacy, not measurements: they only rank components against each other.
 */
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

const nestingDepth = (value: unknown, depth = 0): number => {
  if (!isObject(value)) return depth
  let max = depth
  for (const child of Object.values(value)) if (isObject(child)) max = Math.max(max, nestingDepth(child, depth + 1))
  return max
}
const propertyCount = (value: unknown): number => {
  if (!isObject(value)) return 0
  let n = 0
  for (const child of Object.values(value)) n += 1 + (isObject(child) ? propertyCount(child) : 0)
  return n
}

export const analyzeComponentData = (raw: unknown, type: string | null) => {
  const data = isObject(raw) ? raw : {}
  const refs = Array.isArray(data.references) ? data.references.length : 0
  const depth = nestingDepth(data)
  const properties = propertyCount(data)
  const complexity = Math.max(0, 100 - 5 * (Math.max(0, depth - 3) + Math.max(0, (properties - 10) / 5) + Math.max(0, refs - 2)))

  const jsonSize = JSON.stringify(data).length
  const memory = Math.round(jsonSize * 1.2)
  const render = 10 + (type === "mechanical" || type === "structural" ? jsonSize / 100 : 0)
  const load = 20 + render / 2
  const performance = Math.max(0, 100 - ((memory > 300 ? 5 : 0) + (render > 20 ? 10 : 0) + (load > 50 ? 5 : 0)))

  const web = !(type === "electronic" && data.requiresSpecialHardware)
  const mobile = jsonSize <= 100000
  const compatible = [web, mobile, true].filter(Boolean).length
  return {
    complexity: {
      score: Math.round(complexity),
      factors: [
        { name: "Nesting Depth", value: depth, benchmark: 3 },
        { name: "Property Count", value: properties, benchmark: 15 },
        { name: "Dependencies", value: refs, benchmark: 2 }
      ]
    },
    performance: {
      score: Math.round(performance),
      metrics: [
        { name: "Memory Usage", value: memory, unit: "KB", benchmark: 300 },
        { name: "Render Time", value: Math.round(render), unit: "ms", benchmark: 20 },
        { name: "Load Time", value: Math.round(load), unit: "ms", benchmark: 50 }
      ]
    },
    compatibility: {
      score: Math.round((compatible / 3) * 100),
      platforms: [{ name: "Web", compatible: web }, { name: "Mobile", compatible: mobile }, { name: "Desktop", compatible: true }]
    }
  }
}
