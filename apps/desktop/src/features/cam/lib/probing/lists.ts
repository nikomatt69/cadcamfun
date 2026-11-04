/**
 * The two list fields of the cycle editor (a rotary axis' angles, a plane's touch points) as text a person types: numbers separated
 * by spaces or semicolons (a comma is a decimal mark, as everywhere in the CAD fields), one point per line. An entry that does not
 * parse keeps the last good value and names the reason.
 */
import { formatNumber, parseNumberText } from "../../../cad/lib/numberText.ts"

export type ListParse<T> = { readonly ok: true; readonly value: ReadonlyArray<T> } | { readonly ok: false; readonly error: string }

const tokens = (text: string): string[] => text.split(/[\s;]+/).filter((token) => token !== "")

export const parseNumberList = (text: string, min = 1): ListParse<number> => {
  const out: number[] = []
  for (const token of tokens(text)) {
    const parsed = parseNumberText(token)
    if (!parsed.ok) return { ok: false, error: `'${token}': ${parsed.error}` }
    out.push(parsed.value)
  }
  return out.length < min ? { ok: false, error: `at least ${min} values` } : { ok: true, value: out }
}

export const formatNumberList = (values: unknown): string => (Array.isArray(values) ? values.map((v) => formatNumber(v)).join(" ") : "")

export const parsePointList = (text: string, min = 3): ListParse<{ readonly x: number; readonly y: number }> => {
  const out: Array<{ x: number; y: number }> = []
  for (const line of text.split(/\n/)) {
    const parts = tokens(line)
    if (parts.length === 0) continue
    if (parts.length !== 2) return { ok: false, error: `'${line.trim()}': a point is two numbers, X and Y` }
    const x = parseNumberText(parts[0]!), y = parseNumberText(parts[1]!)
    if (!x.ok) return { ok: false, error: `'${parts[0]}': ${x.error}` }
    if (!y.ok) return { ok: false, error: `'${parts[1]}': ${y.error}` }
    out.push({ x: x.value, y: y.value })
  }
  return out.length < min ? { ok: false, error: `at least ${min} points` } : { ok: true, value: out }
}

export const formatPointList = (points: unknown): string =>
  Array.isArray(points) ? points.map((p: { x?: unknown; y?: unknown }) => `${formatNumber(p.x)} ${formatNumber(p.y)}`).join("\n") : ""
