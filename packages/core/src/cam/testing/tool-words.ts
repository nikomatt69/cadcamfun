/**
 * How a program names and changes its tools, read the same way by the interpreter, the viewer and the program analysis
 * (spec 69 G4b):
 *
 *   `T1 M6`, `M6 T1`, `T2` read lines before `M6`   ISO / Fanuc / Haas / Okuma / LinuxCNC: `T` selects, `M6` puts it in the spindle
 *   `T0101` with no `M6` anywhere                   a turret lathe: `T` is the change
 *   `T="ENDMILL6"` / `T=3`                          Siemens: a named tool takes the number of its first appearance (1, 2, ...)
 *   `TOOL CALL 4 Z S5000`                           Heidenhain Klartext (`decodeKlartext` writes it as `T4`)
 *
 * and how it names the operation a block belongs to (`(OP 3: Pocket 2 | T1 ...)`, `(OPERATION: Pocket 2)`, `; OP 3: Pocket 2`).
 */

export interface ToolChange {
  /** The tool number (a Siemens name gets the number of its first appearance). */
  readonly number: number
  /** The tool's name when the program gave one (`T="ENDMILL6"`). */
  readonly name?: string
  /** 1-based line of the change. */
  readonly line: number
}

export interface NamedTools {
  /** The text with `T="NAME"` and `T=n` written as `T<n>`. */
  readonly text: string
  readonly names: ReadonlyMap<number, string>
}

/** Writes Siemens `T="NAME"` / `T=3` as `T<n>`; the same name always gets the same number. */
export const nameTools = (text: string): NamedTools => {
  const names = new Map<number, string>()
  const known = new Map<string, number>()
  const out = text.replace(/\bT\s*=\s*(?:"([^"\n]+)"|(\d+))/gi, (_all, name: string | undefined, n: string | undefined) => {
    if (n !== undefined) return `T${n}`
    const have = known.get(name!)
    if (have !== undefined) return `T${have}`
    const next = known.size + 1
    known.set(name!, next)
    names.set(next, name!)
    return `T${next}`
  })
  return { text: out, names }
}

/** True when the program has an `M6` outside a comment: then `T` only selects. */
export const usesToolChangeWord = (text: string): boolean => /^[^;(\n]*\bM0?6\b/im.test(text)

const codeOf = (raw: string): string => raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").trim()

/** Every tool change of a program, in order, as the control would perform it. */
export const findToolChanges = (gcode: string): ToolChange[] => {
  const klartext = /\bBEGIN PGM\b/i.test(gcode)
  const named = nameTools(gcode)
  const changes: ToolChange[] = []
  const withM6 = usesToolChangeWord(named.text)
  let pending: number | undefined
  named.text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const code = codeOf(raw)
    if (code === "") return
    const push = (n: number): void => { changes.push({ number: n, ...(named.names.has(n) ? { name: named.names.get(n)! } : {}), line }) }
    if (klartext) {
      const call = /^\s*\d*\s*TOOL\s+CALL\s+(\d+)/i.exec(code)
      if (call !== null) push(Number(call[1]))
      return
    }
    const tWords = [...code.matchAll(/\bT\s*(\d+)\b/gi)].map((m) => Number(m[1]))
    if (tWords.length > 0) pending = tWords[tWords.length - 1]
    if (!withM6) { for (const n of tWords) push(n); return }
    if (/\bM0?6\b/i.test(code) && pending !== undefined) push(pending)
  })
  return changes
}

export interface OperationMarker {
  /** 1-based line of the comment. */
  readonly line: number
  readonly name: string
  /** The number in `OP 3:` when it has one. */
  readonly number?: number
}

const MARKER = /^\s*(?:\(|;|\*)?\s*OP(?:ERATION)?\s*(\d+)?\s*[:\-]\s*([^|)\n]*)/i
const MOTION = /[XYZABC]\s*[-+]?\d/i

/**
 * The comments that open an operation. Comments that follow each other with no motion between them name the same operation
 * (a kernel program writes `(OP 3: ...)`, `(OPERATION: ...)` and `(OP3 ...)` before its first move), the first one wins.
 */
export const findOperationMarkers = (gcode: string): OperationMarker[] => {
  const out: OperationMarker[] = []
  let moved = true
  gcode.split(/\r?\n/).forEach((raw, index) => {
    const m = MARKER.exec(raw)
    if (m !== null) {
      if (moved || out.length === 0) {
        out.push({ line: index + 1, name: (m[2] ?? "").trim() || `Operation ${out.length + 1}`, ...(m[1] !== undefined ? { number: Number(m[1]) } : {}) })
        moved = false
      }
      return
    }
    if (MOTION.test(codeOf(raw))) moved = true
  })
  return out
}
