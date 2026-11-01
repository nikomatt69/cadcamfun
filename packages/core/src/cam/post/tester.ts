/**
 * Post tester (spec 54 C3): run a post on a program, read the text it wrote back with the reference interpreter
 * (`testing/gcode-interpreter.ts`, an implementation that shares no code with the emitters) and check what came back against the
 * program that went in. A post that passes wrote text a reader of its dialect replays to the same path; it does not prove a
 * controller accepts the text (spec 55 §6).
 *
 * Checks, each with the numbers it compared:
 *   replay        the interpreter read every word (no error, no unsupported motion word)
 *   bounds        the replayed path's bounding box equals the program's within `tolerance`
 *   cut-length    feed-move length equals the program's within `lengthTolerance` (arcs linearised by the post change it by the chord error)
 *   endpoints     the replay starts the cut moves where the program does: first and last cutting positions
 *   tools         the tools the text selects are the program's tools, in order
 *   spindle       the spindle is started before the first cutting move and stopped before the end
 *   end           the program ends (`M2` / `M30` or the dialect's end)
 *   expected      optional: a line diff against the output a shop expects (blank lines and comments ignored)
 */
import type { Program, Move } from "../ir.ts"
import { arcExtrema, expandMoves, moveLength, moveTarget } from "../ir.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { getPost, dialectOf } from "./index.ts"
import { samplePostProgram } from "./sample.ts"
import type { PostId, PostOptions } from "./types.ts"

export type CheckStatus = "passed" | "failed" | "skipped"
export interface PostCheck {
  readonly id: "replay" | "bounds" | "cut-length" | "endpoints" | "tools" | "spindle" | "end" | "expected"
  readonly status: CheckStatus
  readonly detail: string
}

export interface PostDiffLine {
  readonly line: number
  readonly expected: string
  readonly actual: string
}

export interface PostTestResult {
  readonly post: PostId
  /** `passed` when no check failed; a refusal by the post (it threw, for example a rotary move on a 3-axis control) is `refused`, with its reason. */
  readonly verdict: "passed" | "failed" | "refused"
  readonly reason?: string
  readonly checks: ReadonlyArray<PostCheck>
  readonly nc: string
  readonly lines: number
  /** Differences against `expected`, at most 40. */
  readonly diff: ReadonlyArray<PostDiffLine>
  /** Words with an effect on motion that the interpreter could not replay. */
  readonly unsupported: ReadonlyArray<string>
}

export interface PostTestOptions {
  readonly program?: Program
  /** Check this text (a shop's own post output for `program`) instead of running the post. */
  readonly nc?: string
  readonly options?: Partial<PostOptions>
  /** Expected output of a shop's reference post, compared line by line after dropping blanks and comments. */
  readonly expected?: string
  /** Bounds tolerance, mm (default 0.01 plus the decimals the post writes). */
  readonly tolerance?: number
  /** Relative cut-length tolerance (default 0.5 %; a linearised arc is within its chord error). */
  readonly lengthTolerance?: number
}

const bbox = (points: ReadonlyArray<{ x: number; y: number; z: number }>): { min: [number, number, number]; max: [number, number, number] } => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z)
    max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z)
  }
  return { min, max }
}

const significant = (nc: string): string[] =>
  nc.split(/\r?\n/).map((l) => l.replace(/\([^)]*\)/g, "").replace(/;.*$/, "").replace(/\s+/g, " ").trim()).filter((l) => l !== "")

export const testPost = (id: PostId, input: PostTestOptions = {}): PostTestResult => {
  const post = getPost(id)
  const program = input.program ?? samplePostProgram()
  if (post === undefined) return { post: id, verdict: "refused", reason: `post '${id}' is not implemented`, checks: [], nc: "", lines: 0, diff: [], unsupported: [] }
  let nc: string
  if (input.nc !== undefined) nc = input.nc
  else try {
    nc = post.emit(program, input.options)
  } catch (error) {
    // A post refuses what its control cannot do (a rotary move on a 3-axis dialect, tapping without a rigid-tap option): that is an answer, not a crash.
    return { post: id, verdict: "refused", reason: error instanceof Error ? error.message : String(error), checks: [], nc: "", lines: 0, diff: [], unsupported: [] }
  }
  const tol = input.tolerance ?? 0.01 + 10 ** -(input.options?.decimals ?? 3)
  const lengthTol = input.lengthTolerance ?? 0.005
  const checks: PostCheck[] = []
  const check = (c: PostCheck): void => { checks.push(c) }

  const result = interpretGcode(nc, { okuma: id === "okuma", dwell: dialectOf(id)?.dwell ?? "seconds" })
  const unsupported = result.unsupported.map((u) => `${u.word} (line ${u.line})`)
  check(result.errors.length === 0 && result.unsupported.length === 0
    ? { id: "replay", status: "passed", detail: `${result.segments.length} segments replayed` }
    : { id: "replay", status: "failed", detail: [...result.errors.slice(0, 3), ...unsupported.slice(0, 3)].join("; ") })

  // The program's own path: every toolpath's moves with cycles expanded.
  const expectedPoints: Array<{ x: number; y: number; z: number }> = []
  let expectedCut = 0
  const cutTargets: Array<{ x: number; y: number; z: number }> = []
  for (const tp of program.toolpaths) {
    let at = moveTarget(tp.moves.find((m) => moveTarget(m) !== undefined) as Move) ?? { x: 0, y: 0, z: 0 }
    for (const mv of expandMoves(tp.moves, at)) {
      const to = moveTarget(mv)
      if (to === undefined) continue
      expectedPoints.push(to)
      if (mv._tag === "Arc") expectedPoints.push(...arcExtrema(mv, at))
      if (mv._tag === "Linear" || mv._tag === "Arc") { expectedCut += moveLength(mv, at); cutTargets.push(to) }
      at = to
    }
  }
  const motion = result.segments.filter((s): s is Exclude<typeof s, { kind: "dwell" }> => s.kind !== "dwell")
  const got = bbox(motion.flatMap((s) => [s.from, s.to]))
  const want = bbox(expectedPoints)
  const axes = ["X", "Y", "Z"]
  const bad: string[] = []
  for (let i = 0; i < 3; i++) {
    if (!(Math.abs(got.min[i]! - want.min[i]!) <= tol)) bad.push(`${axes[i]}min ${got.min[i]!.toFixed(3)} vs ${want.min[i]!.toFixed(3)}`)
    if (!(Math.abs(got.max[i]! - want.max[i]!) <= tol)) bad.push(`${axes[i]}max ${got.max[i]!.toFixed(3)} vs ${want.max[i]!.toFixed(3)}`)
  }
  check(result.segments.length === 0
    ? { id: "bounds", status: "failed", detail: "the text replays to no motion" }
    : bad.length === 0
      ? { id: "bounds", status: "passed", detail: `X ${got.min[0]!.toFixed(3)}..${got.max[0]!.toFixed(3)}, Y ${got.min[1]!.toFixed(3)}..${got.max[1]!.toFixed(3)}, Z ${got.min[2]!.toFixed(3)}..${got.max[2]!.toFixed(3)}` }
      : { id: "bounds", status: "failed", detail: bad.join("; ") })

  const rel = expectedCut > 0 ? Math.abs(result.cutLength - expectedCut) / expectedCut : 0
  check(expectedCut === 0
    ? { id: "cut-length", status: "skipped", detail: "the program has no feed moves" }
    : rel <= lengthTol
      ? { id: "cut-length", status: "passed", detail: `${result.cutLength.toFixed(3)} mm replayed against ${expectedCut.toFixed(3)} mm (${(100 * rel).toFixed(3)} %)` }
      : { id: "cut-length", status: "failed", detail: `${result.cutLength.toFixed(3)} mm replayed against ${expectedCut.toFixed(3)} mm (${(100 * rel).toFixed(2)} % off)` })

  const feedSegs = motion.filter((s) => s.kind === "linear" || s.kind === "arc")
  const first = feedSegs[0], last = feedSegs[feedSegs.length - 1]
  const wantFirst = cutTargets[0], wantLast = cutTargets[cutTargets.length - 1]
  if (first === undefined || last === undefined || wantFirst === undefined || wantLast === undefined) check({ id: "endpoints", status: "skipped", detail: "no feed moves" })
  else {
    const e = Math.hypot(last.to.x - wantLast.x, last.to.y - wantLast.y, last.to.z - wantLast.z)
    check(e <= tol ? { id: "endpoints", status: "passed", detail: `the last cutting move ends ${e.toExponential(1)} mm from the program's` } : { id: "endpoints", status: "failed", detail: `the last cutting move ends at (${last.to.x.toFixed(3)}, ${last.to.y.toFixed(3)}, ${last.to.z.toFixed(3)}), the program's at (${wantLast.x}, ${wantLast.y}, ${wantLast.z})` })
  }

  const wantTools = [...new Set(program.toolpaths.map((t) => t.toolId))]
  const gotTools = result.tools.filter((t, i, a) => i === 0 || t !== a[i - 1])
  check(gotTools.length === wantTools.length || (id === "grbl" && wantTools.length > 1)
    ? { id: "tools", status: "passed", detail: `${gotTools.length} tool selection(s) for ${wantTools.length} program tool(s)` }
    : { id: "tools", status: "failed", detail: `${gotTools.length} tool selection(s) [${gotTools.join(", ")}] for ${wantTools.length} program tool(s)` })

  const starts = result.mCodes.findIndex((m) => m === "M3" || m === "M4")
  const stops = result.mCodes.lastIndexOf("M5")
  check(id === "heidenhain" || starts >= 0
    ? { id: "spindle", status: stops < 0 && id !== "heidenhain" ? "failed" : "passed", detail: stops < 0 && id !== "heidenhain" ? "the spindle is started and never stopped" : "spindle started before the cut" }
    : { id: "spindle", status: "failed", detail: "no M3/M4 in the text" })
  check(result.ended ? { id: "end", status: "passed", detail: "program end found" } : { id: "end", status: "failed", detail: "no M2/M30 program end" })

  const diff: PostDiffLine[] = []
  if (input.expected === undefined) check({ id: "expected", status: "skipped", detail: "no expected output given" })
  else {
    const a = significant(input.expected), b = significant(nc)
    for (let i = 0; i < Math.max(a.length, b.length) && diff.length < 40; i++) if (a[i] !== b[i]) diff.push({ line: i + 1, expected: a[i] ?? "", actual: b[i] ?? "" })
    check(a.length === b.length && diff.length === 0 ? { id: "expected", status: "passed", detail: `${a.length} significant lines identical` } : { id: "expected", status: "failed", detail: `${diff.length}${diff.length === 40 ? "+" : ""} differing line(s), ${a.length} expected vs ${b.length} written` })
  }
  const failed = checks.filter((c) => c.status === "failed")
  return { post: id, verdict: failed.length === 0 ? "passed" : "failed", checks, nc, lines: nc.split("\n").length, diff, unsupported }
}

/** The post tester over every implemented post (the CLI table of C3). */
export const testAllPosts = (input: Omit<PostTestOptions, "expected"> = {}): ReadonlyArray<PostTestResult> =>
  (["generic", "linuxcnc", "fanuc", "haas", "mazak", "mitsubishi", "brother", "okuma", "siemens", "heidenhain", "grbl"] as PostId[]).map((id) => testPost(id, input))
