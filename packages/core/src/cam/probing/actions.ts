/**
 * What a probe program does with its results (spec 73 §5.7): move the work offset, correct a rotation, write a tool's length or radius,
 * check characteristics against their limits, feed a size back into a tool's wear, report values. Each action becomes IR that decides
 * on the control with the same rule the host applies (`applyCorrection` / `policyCondition`, `evaluateInspection`), so a run on the
 * machine, in the IR executor and in the NC replay agree.
 *
 * Offsets are corrected along the machine axes: a work offset that carries its own rotation (Siemens RT, LinuxCNC R) turns the
 * correction with it on the control, which this module does not model, so a rotated offset is corrected with its rotation at zero.
 */
import { binary, call, num, type Condition, type Expr } from "../macro.ts"
import type { Move } from "../ir.ts"
import { policyCondition, policyProblem, type OffsetAxis, type WorkOffsetRef } from "../work-offset.ts"
import type { Characteristic, ProbeAction, ProbeContext, ProbeCycle, ProbeRoutine } from "./types.ts"
import { planProbeCycle } from "./cycles.ts"
import { characteristicProblem } from "./simulate.ts"

const DEG = Math.PI / 180

/** Alarm codes of the actions (a probe miss is 991, a protected-move contact 992). */
export const OFFSET_ALARM = 810
export const INSPECTION_ALARM = 820
export const WEAR_ALARM = 830

const sub = (a: Expr, b: number): Expr => (b === 0 ? a : binary("-", a, num(b)))
const not = (c: Condition): Condition => ({ ...c, cmp: ({ eq: "ne", ne: "eq", lt: "ge", ge: "lt", gt: "le", le: "gt" } as const)[c.cmp] })

const guarded = (cond: Condition | true | undefined, body: ReadonlyArray<Move>): Move[] =>
  cond === undefined ? [] : cond === true ? [...body] : [{ _tag: "If", condition: cond }, ...body, { _tag: "EndIf" }]

/** The condition under which a deviation `dev` is outside `lower..upper`: one comparison, `|dev - mid| > half`. */
export const outsideCondition = (dev: Expr, lower: number, upper: number): Condition =>
  ({ cmp: "gt", a: call("abs", sub(dev, (lower + upper) / 2)), b: num((upper - lower) / 2 + 1e-12) })

/** A characteristic's measured deviation as an expression in the IR's units (mm, degrees). */
const deviationOf = (c: Characteristic, routine: ProbeRoutine): { readonly dev: Expr; readonly lower: number; readonly upper: number; readonly single: boolean } => {
  const res = routine.results[c.result]
  if (res === undefined) throw new RangeError(`characteristic ${c.name}: the cycle has no result '${c.result}'`)
  const angle = routine.units[c.result] === "deg"
  const k = angle ? 1 / DEG : 1
  if (c.kind === "true-position") {
    const res2 = c.result2 === undefined ? undefined : routine.results[c.result2]
    if (res2 === undefined) throw new RangeError(`characteristic ${c.name}: a true position needs its second result`)
    const dev = binary("*", num(2), call("hypot", sub(res, c.nominal), sub(res2, c.nominal2 ?? 0)))
    return { dev, lower: c.lower, upper: c.upper, single: true }
  }
  return { dev: sub(res, c.nominal * k), lower: c.lower * k, upper: c.upper * k, single: false }
}

/**
 * The routine's moves followed by the moves of its actions. A result an action names that the cycle does not have, a policy that is
 * not valid or a rotation the IR cannot write (`g68`) is refused with a RangeError.
 */
export const compileActions = (routine: ProbeRoutine, actions: ReadonlyArray<ProbeAction>, ctx: Pick<ProbeContext, "prefix" | "frame">): Move[] => {
  const out: Move[] = [...routine.moves]
  const name = (n: string) => ({ name: `${ctx.prefix}${n}` })
  const read = (n: string): Expr => { const e = routine.results[n]; if (e === undefined) throw new RangeError(`the cycle has no result '${n}' (it has ${Object.keys(routine.results).join(", ")})`); return e }
  actions.forEach((a, ai) => {
    switch (a.kind) {
      case "set-offset": {
        const problem = policyProblem(a.policy)
        if (problem !== undefined) throw new RangeError(`set-offset: ${problem}`)
        const linear = (Object.entries(a.axes) as Array<[OffsetAxis, string]>).filter(([axis]) => axis === "X" || axis === "Y" || axis === "Z")
        const angular = (Object.entries(a.axes) as Array<[OffsetAxis, string]>).filter(([axis]) => axis !== "X" && axis !== "Y" && axis !== "Z")
        const group = (axes: ReadonlyArray<[OffsetAxis, string]>, tag: string, tolerance: number | undefined, deg: boolean): void => {
          if (axes.length === 0) return
          const deltas = axes.map(([axis, result]) => {
            const v = name(`o${ai}${tag}${axis}`)
            const nominal = routine.nominal[result]
            if (nominal === undefined) throw new RangeError(`the cycle has no result '${result}'`)
            if ((routine.units[result] === "deg") !== deg) throw new RangeError(`set-offset: ${axis} cannot follow the ${routine.units[result] === "deg" ? "angle" : "length"} '${result}'`)
            out.push({ _tag: "Assign", variable: v, value: sub(read(result), nominal) })
            return { axis, value: { var: v } as Expr }
          })
          const m = name(`o${ai}${tag}m`)
          out.push({ _tag: "Assign", variable: m, value: deltas.length === 1 ? call("abs", deltas[0]!.value) : call("sqrt", deltas.map((d) => binary("*", d.value, d.value)).reduce((s, v) => binary("+", s, v))) })
          const policy = deg ? { ...a.policy, ...(a.policy.limit !== undefined ? {} : {}), deadband: undefined, limit: undefined } : a.policy
          const c = policyCondition(policy as typeof a.policy, { var: m }, tolerance)
          if (c.alarm !== undefined) out.push(...guarded(c.alarm, [{ _tag: "Alarm", code: OFFSET_ALARM, text: `${tag === "a" ? "ROTATION" : "OFFSET"} CORRECTION OUT OF RANGE` }]))
          // Under a tilted plane the measured deltas are in the plane's axes and the offset is in the machine's: each machine axis takes the
          // sum of the plane deltas along it (the frame's axes are its columns), so the offset moves the way the part is displaced.
          const frame = deg ? undefined : ctx.frame
          const written = frame === undefined ? deltas : (["X", "Y", "Z"] as const).flatMap((base) => {
            const key = base.toLowerCase() as "x" | "y" | "z"
            const terms = deltas.flatMap((d) => { const k = (d.axis === "X" ? frame.xAxis : d.axis === "Y" ? frame.yAxis : frame.zAxis)[key]; return Math.abs(k) < 1e-12 ? [] : [binary("*", num(k), d.value)] })
            return terms.length === 0 ? [] : [{ axis: base, value: terms.reduce((sum, t) => binary("+", sum, t)) }]
          })
          out.push(...guarded(c.write, written.map((d) => ({ _tag: "OffsetUpdate" as const, target: { kind: "work" as const, ref: a.ref }, axis: d.axis, mode: "add" as const, value: d.value }))))
        }
        group(linear, "l", a.policy.tolerance, false)
        group(angular, "a", a.policy.angleTolerance === undefined ? undefined : a.policy.angleTolerance / DEG, true)
        break
      }
      case "rotation": {
        if (a.via === "g68") throw new RangeError("rotation via G68 is not written by the IR: use the offset's rotation (offset-r) or the table (table-c)")
        if (a.ref === undefined) throw new RangeError("a rotation correction needs the work offset it goes into")
        if (routine.units[a.result] !== "deg") throw new RangeError(`rotation: '${a.result}' is not an angle`)
        const problem = policyProblem({ ...a.policy, ...(a.policy.tolerance === undefined && a.policy.angleTolerance !== undefined ? { tolerance: 0 } : {}) })
        if (problem !== undefined && !/tolerance/.test(problem)) throw new RangeError(`rotation: ${problem}`)
        const v = name(`o${ai}r`)
        out.push({ _tag: "Assign", variable: v, value: sub(read(a.result), routine.nominal[a.result] ?? 0) })
        const m = name(`o${ai}rm`)
        out.push({ _tag: "Assign", variable: m, value: call("abs", { var: v }) })
        const c = policyCondition({ ...a.policy, deadband: undefined, limit: undefined } as typeof a.policy, { var: m }, a.policy.angleTolerance === undefined ? undefined : a.policy.angleTolerance / DEG)
        if (c.alarm !== undefined) out.push(...guarded(c.alarm, [{ _tag: "Alarm", code: OFFSET_ALARM, text: "ROTATION CORRECTION OUT OF RANGE" }]))
        // A part turned by +t is aligned by turning the table by -t; the offset's own rotation takes +t.
        const value: Expr = a.via === "table-c" ? binary("-", num(0), { var: v }) : { var: v }
        out.push(...guarded(c.write, [{ _tag: "OffsetUpdate", target: { kind: "work", ref: a.ref }, axis: a.via === "table-c" ? "C" : "R", mode: "add", value }]))
        break
      }
      case "tool-offset":
        out.push({ _tag: "OffsetUpdate", target: { kind: "tool", tool: a.tool, quantity: a.quantity, part: a.part }, axis: "Z", mode: "set", value: read(a.result) })
        break
      case "inspect": {
        if (a.onFail === "flag") {
          if (a.flag === undefined) throw new RangeError("an inspection that flags needs the flag's name")
          out.push({ _tag: "Assign", variable: name(a.flag), value: 0 })
        }
        a.characteristics.forEach((c, ci) => {
          const problem = characteristicProblem(c)
          if (problem !== undefined) throw new RangeError(problem)
          const d = deviationOf(c, routine)
          const fail: Condition = d.single ? { cmp: "gt", a: d.dev, b: num(d.upper + 1e-12) } : outsideCondition(d.dev, d.lower, d.upper)
          const label = c.name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").slice(0, 30).trim()
          switch (a.onFail) {
            case "alarm": out.push(...guarded(fail, [{ _tag: "Alarm", code: INSPECTION_ALARM + Math.min(ci, 9), text: `${label} OUT OF TOLERANCE` }])); break
            case "stop": out.push(...guarded(fail, [{ _tag: "Message", text: `${label} OUT OF TOLERANCE` }, { _tag: "Stop", optional: false }])); break
            case "flag": out.push(...guarded(fail, [{ _tag: "Assign", variable: name(a.flag!), value: 1 }])); break
            case "continue": break
          }
        })
        break
      }
      case "wear-comp": {
        if (!(a.limit > a.deadband)) throw new RangeError("wear-comp: the limit must be larger than the deadband")
        const dev = name(`w${ai}d`)
        out.push({ _tag: "Assign", variable: dev, value: sub(read(a.result), a.nominal) })
        const mag: Expr = call("abs", { var: dev })
        out.push(...guarded({ cmp: "gt", a: mag, b: num(a.limit) }, [{ _tag: "Alarm", code: WEAR_ALARM, text: "WEAR CORRECTION BEYOND LIMIT" }]))
        out.push(...guarded({ cmp: "ge", a: mag, b: num(a.deadband) }, [{
          _tag: "OffsetUpdate", target: { kind: "tool", tool: a.tool, quantity: a.quantity, part: "wear" }, axis: "Z", mode: "add",
          value: binary("*", num(a.sense * a.gain), { var: dev })
        }]))
        break
      }
      case "report":
        out.push({ _tag: "Report", label: "PROBE", values: a.results.map((r) => ({ name: r.slice(0, 24), value: read(r) })) })
        break
    }
  })
  void not
  return out
}

/** The corrections the host would apply for `set-offset` actions given the results (core units), for comparing with the IR run. */
export const offsetDeltas = (routine: ProbeRoutine, results: Readonly<Record<string, number>>, action: Extract<ProbeAction, { readonly kind: "set-offset" }>): Partial<Record<OffsetAxis, number>> =>
  Object.fromEntries((Object.entries(action.axes) as Array<[OffsetAxis, string]>).map(([axis, r]) => [axis, (results[r] ?? NaN) - (routine.units[r] === "deg" ? (routine.nominal[r] ?? 0) * DEG : routine.nominal[r] ?? 0)]))

/**
 * The one probing a control without variables can do (GRBL): touch a surface once and make the tip read what the drawing says there
 * (`G10 L20`, spec 73 §5.3: `set` only, no policy, no result to read). A face along an axis or the top of a part; anything that needs a
 * computed value is refused.
 */
export const grblTouchOff = (cycle: ProbeCycle, ref: WorkOffsetRef, ctx: ProbeContext): Move[] | { readonly refused: string } => {
  if (cycle.kind !== "z-surface" && cycle.kind !== "edge") return { refused: `a ${cycle.kind} needs computed results, which a control without variables cannot hold` }
  const p = ctx.probe
  const single: ProbeContext = { ...ctx, probe: { ...p, doubleTouch: false } }
  const r = planProbeCycle(cycle, single)
  if ("refused" in r) return r
  const touch = r.contacts[0]!
  const axis = cycle.kind === "z-surface" ? "Z" : Math.abs(touch.direction.x) > 0.999999 ? "X" : Math.abs(touch.direction.y) > 0.999999 ? "Y" : undefined
  if (axis === undefined) return { refused: "G10 L20 sets one axis: an angled face needs computed results" }
  const key = axis.toLowerCase() as "x" | "y" | "z"
  const moves: Move[] = []
  for (const m of r.moves) {
    if (m._tag === "Assign") continue
    if (m._tag === "Probe" && m.kind === "touch") {
      const { store: _store, ...bare } = m
      moves.push(bare, { _tag: "OffsetUpdate", target: { kind: "work", ref }, axis, mode: "set", reads: true, value: touch.expected[key] })
      continue
    }
    moves.push(m)
  }
  return moves
}
