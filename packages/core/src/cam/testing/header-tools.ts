/**
 * The tools a program's header comments describe (spec 32 §4.2): Fusion / HSM posts write `(T1 D=6. CR=0. - ZMIN=-5. - flat
 * end mill)` per tool, this app's generator `; Tool: endmill Ø6mm` for its one tool. The replay takes the cutter radius for
 * G41 / G42 from it, and the preview draws each tool of an imported program from it.
 */

export interface HeaderTool {
  readonly number: number
  readonly diameter: number
  readonly cornerRadius?: number
  /** The post's words for the tool (`flat end mill`, `drill`, `right hand tap`…). */
  readonly description?: string
}

export interface HeaderTools {
  readonly byTool: ReadonlyMap<number, HeaderTool>
  /** The diameter of the only tool of a generator program. */
  readonly single?: number
}

export const headerTools = (text: string): HeaderTools => {
  const byTool = new Map<number, HeaderTool>()
  const head = text.slice(0, 20_000)
  for (const m of head.matchAll(/[(;]\s*T\s*(\d+)\b([^)\n]*?)\bD\s*=\s*([\d.]+)([^)\n]*)/gi)) {
    const number = Number(m[1]), diameter = Number(m[3])
    if (!Number.isFinite(diameter) || diameter <= 0 || byTool.has(number)) continue
    const rest = m[4] ?? ""
    const cr = /\bCR\s*=\s*([\d.]+)/i.exec(rest)
    const parts = rest.split(/\s+-\s+/).map((p) => p.trim()).filter((p) => p.length > 0 && !/^[A-Z]+\s*=/i.test(p) && !/^CR\s*=/i.test(p))
    const description = parts.length > 0 ? parts[parts.length - 1] : undefined
    byTool.set(number, { number, diameter, ...(cr !== null && Number(cr[1]) > 0 ? { cornerRadius: Number(cr[1]) } : {}), ...(description !== undefined ? { description } : {}) })
  }
  const single = /[(;]\s*Tool:[^)\n]*?Ø\s*([\d.]+)\s*mm/i.exec(head)
  const d = single !== null ? Number(single[1]) : NaN
  return Number.isFinite(d) && d > 0 ? { byTool, single: d } : { byTool }
}
