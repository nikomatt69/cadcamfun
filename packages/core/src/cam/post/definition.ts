/**
 * Post definitions (spec 54 C1): a post as **data**. A definition names a built-in dialect to start from and overrides what
 * differs: word and block templates, the unit and dwell words, arc formats, canned cycles, rotary axes and the tool-centre-point
 * commands. It is plain JSON, so it can be stored (as a library item), shared, validated with path-located messages and compiled
 * into the `Dialect` the shared emitter writes with: the emitter is the same code for every post, a definition only changes what
 * it is told.
 *
 * Templates are lines of printable ASCII (no control characters, at most 100 characters) with these placeholders:
 *   {tool}              the tool number of the tool change            (toolChange, firstToolChange, tcp blocks)
 *   {rpm}               the spindle speed, whole rpm                  (rigidTap prefix)
 *   {program}           the program name as an upper-case identifier  (begin)
 *   {programNumber}     the program number (metadata.programNumber, default 1000); {programNumber:4} pads to 4 digits  (begin)
 *
 * What a definition cannot express stays in code: the Heidenhain Klartext translation and the Siemens program name rules are
 * built-ins, and a definition may start from them with `base` but cannot rewrite them.
 */
import { Schema } from "effect"
import { fanucProgramNumber, fanucSubprograms } from "./fanuc.ts"
import { siemensProgramName } from "./siemens.ts"
import { fanucDialect } from "./fanuc.ts"
import { genericDialect } from "./generic.ts"
import { grblDialect } from "./grbl.ts"
import { haasDialect } from "./haas.ts"
import { heidenhainDialect } from "./heidenhain.ts"
import { linuxcncDialect } from "./linuxcnc.ts"
import { mazakDialect } from "./mazak.ts"
import { okumaDialect } from "./okuma.ts"
import { mitsubishiDialect } from "./mitsubishi.ts"
import { brotherDialect } from "./brother.ts"
import { siemensDialect } from "./siemens.ts"
import { emitProgram } from "./emitter.ts"
import type { Program } from "../ir.ts"
import type { ArcMode, Dialect, Post, PostId, TcpCodes } from "./types.ts"

const LINE_MAX = 100
/** Printable ASCII, no control character: a template can never smuggle a second line or a control byte into the program. */
const printable = /^[\x20-\x7E]*$/
const template = Schema.String.check(
  Schema.isMaxLength(LINE_MAX, { message: `a line is at most ${LINE_MAX} characters` }),
  Schema.isPattern(printable, { message: "a line is printable ASCII (no control character, no line break)" })
)
const lines = (max: number) => Schema.Array(template).check(Schema.isMaxLength(max, { message: `at most ${max} lines` }))
const gWord = Schema.String.check(Schema.isPattern(/^[GM]\d{1,3}(?:\.\d)?$/, { message: "a G or M code such as G43.4 or M128" }))

export const BASE_POSTS = ["generic", "linuxcnc", "fanuc", "haas", "grbl", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"] as const
const BASE_DIALECTS: Readonly<Record<(typeof BASE_POSTS)[number], Dialect>> = {
  generic: genericDialect, linuxcnc: linuxcncDialect, fanuc: fanucDialect, haas: haasDialect, grbl: grblDialect, siemens: siemensDialect, heidenhain: heidenhainDialect, okuma: okumaDialect, mazak: mazakDialect, mitsubishi: mitsubishiDialect, brother: brotherDialect
}

const Tcp = Schema.Union([
  /** A tool-length-offset code: `<code> H<tool>` on, `G43 H<tool>` off (Haas G234, Fanuc G43.4). */
  Schema.Struct({ kind: Schema.Literal("offset"), code: Schema.String.check(Schema.isPattern(/^G\d{1,3}(?:\.\d)?$/, { message: "a G code such as G43.4" })) }),
  /** Blocks of their own (Siemens TRAORI / TRAFOOF, Heidenhain M128 / M129); `end` closes a section left open at the end. */
  Schema.Struct({ kind: Schema.Literal("blocks"), on: template, off: template, end: Schema.optionalKey(template) })
])

export const PostDefinitionSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  name: Schema.String.check(Schema.isMinLength(1, { message: "a name" }), Schema.isMaxLength(60, { message: "a name of at most 60 characters" })),
  /** The built-in dialect the definition starts from. */
  base: Schema.Literals(BASE_POSTS),
  canned: Schema.optionalKey(Schema.Boolean),
  arcModes: Schema.optionalKey(Schema.Array(Schema.Literals(["ijk", "radius", "linearize"])).check(Schema.isMinLength(1, { message: "at least one arc format" }))),
  dwell: Schema.optionalKey(Schema.Literals(["seconds", "milliseconds"])),
  dwellWord: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[A-Z]$/, { message: "one capital letter" }))),
  rotary: Schema.optionalKey(Schema.Boolean),
  tcp: Schema.optionalKey(Schema.Union([Tcp, Schema.Literal(false)])),
  /** `false` takes rigid tapping away; `prefix` is the block written before the cycle (`{rpm}`). */
  rigidTap: Schema.optionalKey(Schema.Union([Schema.Struct({ prefix: Schema.optionalKey(template) }), Schema.Literal(false)])),
  subprograms: Schema.optionalKey(Schema.Literals(["fanuc", "none"])),
  uppercaseComments: Schema.optionalKey(Schema.Boolean),
  commentStyle: Schema.optionalKey(Schema.Literals(["paren", "semicolon"])),
  unitCodes: Schema.optionalKey(Schema.Struct({ mm: gWord, inch: gWord })),
  begin: Schema.optionalKey(lines(8)),
  setup: Schema.optionalKey(lines(16)),
  toolChange: Schema.optionalKey(lines(8)),
  /** The blocks of the first tool change when they differ from the others (a control without a tool changer). */
  firstToolChange: Schema.optionalKey(lines(8)),
  end: Schema.optionalKey(template),
  finish: Schema.optionalKey(lines(4))
})
export type PostDefinition = typeof PostDefinitionSchema.Type

export interface DefinitionIssue {
  /** Where in the definition, as a path (`toolChange[1]`), empty for the whole. */
  readonly path: string
  readonly message: string
}

const KNOWN = {
  begin: ["program", "programNumber"], setup: [], toolChange: ["tool"], firstToolChange: ["tool"], end: [], finish: [], rigidTap: ["rpm"], tcp: ["tool"]
} as const
const PLACEHOLDER = /\{([A-Za-z]+)(?::(\d{1,2}))?\}/g

/** The placeholders of a template that this field does not know, with where they are. */
const unknownPlaceholders = (text: string, allowed: ReadonlyArray<string>): string[] => {
  const out: string[] = []
  for (const m of text.matchAll(PLACEHOLDER)) if (!allowed.includes(m[1]!) || (m[2] !== undefined && m[1] !== "programNumber")) out.push(m[0])
  // A brace that is not a placeholder is a typo, not text: the program would carry it.
  if (text.replace(PLACEHOLDER, "").match(/[{}]/)) out.push("a brace outside a placeholder")
  return out
}

const fill = (text: string, values: { readonly tool?: number; readonly rpm?: number; readonly program?: Program }): string =>
  text.replace(PLACEHOLDER, (_all, name: string, width: string | undefined) => {
    if (name === "tool") return String(values.tool ?? 0)
    if (name === "rpm") return String(Math.round(values.rpm ?? 0))
    if (name === "program") return values.program === undefined ? "" : siemensProgramName(values.program)
    if (name === "programNumber") return String(values.program === undefined ? 1000 : fanucProgramNumber(values.program)).padStart(width === undefined ? 1 : Number(width), "0")
    return ""
  })

/** The structural and the semantic problems of a value that should be a post definition, each with its path. Empty when it is one. */
export const definitionIssues = (value: unknown): ReadonlyArray<DefinitionIssue> => {
  let decoded: PostDefinition
  try {
    decoded = Schema.decodeUnknownSync(PostDefinitionSchema)(value)
  } catch (cause) {
    // The schema names the place as `at ["begin"][0]`: it becomes the path `begin[0]`, and the line before it the message.
    const text = cause instanceof Error ? cause.message : String(cause)
    const rows = text.split("\n")
    const found: DefinitionIssue[] = []
    rows.forEach((row, i) => {
      const at = /^\s*at (.+)$/.exec(row)
      if (at !== null) found.push({ path: at[1]!.replace(/\["([^"]+)"\]/g, ".$1").replace(/^\./, ""), message: (rows[i - 1] ?? "invalid").trim() })
    })
    return found.length > 0 ? found : [{ path: "", message: rows[0]!.trim() }]
  }
  const issues: DefinitionIssue[] = []
  const check = (path: string, texts: ReadonlyArray<string> | undefined, allowed: ReadonlyArray<string>) =>
    texts?.forEach((t, i) => { for (const bad of unknownPlaceholders(t, allowed)) issues.push({ path: `${path}[${i}]`, message: `${bad} is not a placeholder of ${path} (${allowed.length === 0 ? "none" : allowed.map((a) => `{${a}}`).join(", ")})` }) })
  check("begin", decoded.begin, KNOWN.begin)
  check("setup", decoded.setup, KNOWN.setup)
  check("toolChange", decoded.toolChange, KNOWN.toolChange)
  check("firstToolChange", decoded.firstToolChange, KNOWN.firstToolChange)
  check("finish", decoded.finish, KNOWN.finish)
  if (decoded.end !== undefined) check("end", [decoded.end], KNOWN.end)
  if (typeof decoded.rigidTap === "object" && decoded.rigidTap.prefix !== undefined) check("rigidTap.prefix", [decoded.rigidTap.prefix], KNOWN.rigidTap)
  if (typeof decoded.tcp === "object" && decoded.tcp.kind === "blocks") {
    check("tcp.on", [decoded.tcp.on], KNOWN.tcp)
    check("tcp.off", [decoded.tcp.off], KNOWN.tcp)
    if (decoded.tcp.end !== undefined) check("tcp.end", [decoded.tcp.end], KNOWN.tcp)
  }
  if (decoded.firstToolChange !== undefined && decoded.toolChange === undefined) issues.push({ path: "firstToolChange", message: "needs toolChange: it is what the later tool changes write" })
  if (decoded.tcp !== undefined && decoded.tcp !== false && decoded.rotary === false) issues.push({ path: "tcp", message: "a control without rotary axes has no tool-centre-point command" })
  if (decoded.unitCodes !== undefined && decoded.unitCodes.mm === decoded.unitCodes.inch) issues.push({ path: "unitCodes", message: "the millimetre and the inch code are the same" })
  if (decoded.commentStyle === "semicolon" && decoded.begin?.some((l) => l.startsWith("("))) issues.push({ path: "begin", message: "a line that starts with a parenthesis is a comment on a control whose comments are parentheses, not on this one" })
  return issues
}

/** The dialect a definition describes, or why it cannot be one. */
export const compileDefinition = (value: unknown): { readonly ok: true; readonly dialect: Dialect; readonly post: Post; readonly definition: PostDefinition } | { readonly ok: false; readonly issues: ReadonlyArray<DefinitionIssue> } => {
  const issues = definitionIssues(value)
  if (issues.length > 0) return { ok: false, issues }
  const d = Schema.decodeUnknownSync(PostDefinitionSchema)(value)
  const base = BASE_DIALECTS[d.base]
  const t = d.tcp
  const tcp: Dialect["tcp"] = t === undefined ? base.tcp
    : t === false ? undefined
      : t.kind === "offset" ? t.code
        : { on: (n: number) => fill(t.on, { tool: n }), off: (n: number) => fill(t.off, { tool: n }), ...(t.end !== undefined ? { end: (n: number) => fill(t.end!, { tool: n }) } : {}) } satisfies TcpCodes
  const rt = d.rigidTap
  const rigidTap: Dialect["rigidTap"] = rt === undefined ? base.rigidTap
    : rt === false ? undefined
      : rt.prefix === undefined ? {} : { prefix: (rpm: number) => fill(rt.prefix!, { rpm }) }
  const toolChange = d.toolChange === undefined ? base.toolChange
    : (n: number, first: boolean) => (first && d.firstToolChange !== undefined ? d.firstToolChange : d.toolChange!).map((l) => fill(l, { tool: n }))
  const dialect: Dialect = {
    ...base,
    ...(d.canned !== undefined ? { canned: d.canned } : {}),
    ...(d.arcModes !== undefined ? { arcModes: d.arcModes as ReadonlyArray<ArcMode> } : {}),
    ...(d.dwell !== undefined ? { dwell: d.dwell } : {}),
    ...(d.dwellWord !== undefined ? { dwellWord: d.dwellWord } : {}),
    ...(d.rotary !== undefined ? { rotary: d.rotary } : {}),
    ...(d.uppercaseComments !== undefined ? { uppercaseComments: d.uppercaseComments } : {}),
    ...(d.commentStyle !== undefined ? { commentStyle: d.commentStyle } : {}),
    ...(d.unitCodes !== undefined ? { unitCodes: d.unitCodes } : {}),
    ...(d.begin !== undefined ? { begin: (program: Program) => d.begin!.map((l) => fill(l, { program })) } : {}),
    ...(d.setup !== undefined ? { setup: d.setup } : {}),
    ...(d.end !== undefined ? { end: d.end } : {}),
    ...(d.finish !== undefined ? { finish: d.finish } : {}),
    toolChange,
    ...(d.subprograms === "none" ? { subprograms: undefined } : d.subprograms === "fanuc" ? { subprograms: fanucSubprograms } : {})
  }
  // `tcp` and `rigidTap` may be taken away, so they are set last: an `undefined` must not fall back to the base's value.
  const final: Dialect = { ...dialect, tcp, rigidTap }
  return { ok: true, dialect: final, post: { id: d.base as PostId, emit: (program, options = {}) => emitProgram(program, options, final) }, definition: d }
}
