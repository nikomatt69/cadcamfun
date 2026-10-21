/**
 * External turning preview in diameter X and axial Z (face zero, negative towards the chuck).
 * The cutter is an ideal point: insert compensation and workholding are not qualified here.
 */
export interface TurnPoint {
  readonly diameter: number
  readonly z: number
}
export interface TurnStock {
  readonly diameter: number
  readonly length: number
}
/** The turning centre the plan runs on: what it holds and what it can cut. */
export interface TurningMachine {
  readonly id: string
  readonly name: string
  /** Largest bar the chuck takes, mm; 0 = the machine does not say. */
  readonly maxBarDiameter: number
  /** Longest bar the machine takes, mm; 0 = the machine does not say. */
  readonly maxBarLength: number
  /** Highest spindle speed, rpm; 0 = the machine does not say. */
  readonly maxRpm: number
  /** Highest programmable feed, mm/min; 0 = the machine does not say. */
  readonly maxFeed: number
}
export interface TurningJob {
  /** Ordered face-to-chuck, with non-increasing Z. */
  readonly profile: ReadonlyArray<TurnPoint>
  readonly stock: TurnStock
  /** Maximum diameter removed per roughing pass, mm. Default 4. */
  readonly stepdown?: number
  /** Diameter allowance for the finishing pass, mm. Default 0.4. */
  readonly allowance?: number
  readonly feedMmRev?: number
  readonly rpm?: number
  /** The turning centre: it bounds the bar and the spindle. */
  readonly machine?: TurningMachine
}
export interface TurnPass {
  readonly kind: "face" | "rough" | "finish"
  readonly diameter: number
  /** Cutting points; the face skim ends at diameter zero. */
  readonly points: ReadonlyArray<TurnPoint>
  /** Analytic volume change of the ideal stock, before NC rounding. */
  readonly removed: number
}
export interface TurningPlan {
  readonly release: "preview"
  readonly passes: ReadonlyArray<TurnPass>
  readonly stockVolume: number
  readonly partVolume: number
  /** Bar beyond the profile end; no parting operation is implied. */
  readonly unmachinedVolume: number
  readonly removedVolume: number
  /** Maximum diameter over the profile length: initial, then after every pass. */
  readonly stockAfter: ReadonlyArray<number>
  /** Profile-length stock: initial cylinder, then after every pass. Tail stays unchanged. */
  readonly stockProfiles: ReadonlyArray<ReadonlyArray<TurnPoint>>
  /** The spindle speed the plan runs at, rpm (the machine's ceiling when it is lower). */
  readonly rpm: number
  /** The feed the plan runs at, mm/min (the machine's ceiling when it is lower). */
  readonly feed: number
  /** The turning centre the plan was bounded by, when one was given. */
  readonly machine?: { readonly id: string; readonly name: string }
  readonly nc: string
  readonly issues: ReadonlyArray<string>
}
const f3 = (v: number): string => (Object.is(v, -0) ? 0 : v).toFixed(3)
const volumeOf = (profile: ReadonlyArray<TurnPoint>): number => {
  let v = 0
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!, b = profile[i]!
    v += Math.PI * (a.z - b.z) * (a.diameter ** 2 + a.diameter * b.diameter + b.diameter ** 2) / 12
  }
  return v
}
/** Split at each cap crossing so tapered spans keep their exact piecewise-linear envelope. */
const cappedProfile = (profile: ReadonlyArray<TurnPoint>, cap: number, above = true): TurnPoint[] => {
  const out: TurnPoint[] = []
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!, a = profile[i - 1]
    if (a !== undefined && (a.diameter - cap) * (p.diameter - cap) < 0) {
      const t = (cap - a.diameter) / (p.diameter - a.diameter)
      out.push({ diameter: cap, z: a.z + t * (p.z - a.z) })
    }
    out.push({ diameter: above ? Math.max(cap, p.diameter) : Math.min(cap, p.diameter), z: p.z })
  }
  return out
}

export const planTurning = (job: TurningJob): TurningPlan => {
  const issues: string[] = []
  const { profile, stock } = job
  const stepdown = job.stepdown ?? 4, allowance = job.allowance ?? 0.4
  const feedMmRev = job.feedMmRev ?? 0.2, rpm = job.rpm ?? 800
  if (profile.length < 2 || profile.length > 200) issues.push("the profile needs 2 to 200 points (face to chuck end)")
  if (!Number.isFinite(stock.diameter) || stock.diameter <= 0 || stock.diameter > 500 || !Number.isFinite(stock.length) || stock.length <= 0 || stock.length > 2000) issues.push("the stock diameter and length must be finite and positive (at most 500 and 2000 mm)")
  if (!Number.isFinite(stepdown) || stepdown < 0.001 || !Number.isFinite(allowance) || allowance < 0 || !Number.isFinite(feedMmRev) || feedMmRev <= 0 || !Number.isFinite(rpm) || rpm < 1 || rpm > 20000 || feedMmRev * Math.round(rpm) < 0.001 || !Number.isFinite(feedMmRev * rpm)) issues.push("stepdown must be at least 0.001 mm, allowance non-negative, and feed and rpm finite and positive (rpm 1..20000)")
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!
    if (!Number.isFinite(p.diameter) || p.diameter <= 0) issues.push(`profile point ${i} has no finite positive diameter`)
    if (!Number.isFinite(p.z) || p.z > 0) issues.push(`profile point ${i} needs a finite non-positive z`)
    if (p.diameter > stock.diameter) issues.push(`profile diameter ${p.diameter} at z ${p.z} exceeds the stock diameter ${stock.diameter}`)
    if (i === 0 && p.z !== 0) issues.push("the profile must start at the finished face (z = 0)")
    if (i > 0 && p.z > profile[i - 1]!.z) issues.push(`profile z increases at point ${i}: the profile must run from the face towards the chuck`)
  }
  const lastZ = profile[profile.length - 1]?.z ?? 0
  if (!(lastZ < 0)) issues.push("the profile needs positive axial length")
  if (-lastZ > stock.length) issues.push(`the profile is ${-lastZ} mm long but the bar is ${stock.length} mm`)
  const machine = job.machine
  if (machine !== undefined) {
    // The machine holds the bar: a bar it cannot take is refused with the reason, never silently cut.
    if (machine.maxBarDiameter > 0 && stock.diameter > machine.maxBarDiameter) issues.push(`the ${stock.diameter} mm bar does not fit the chuck of ${machine.name} (max ${machine.maxBarDiameter} mm)`)
    if (machine.maxBarLength > 0 && stock.length > machine.maxBarLength) issues.push(`the ${stock.length} mm bar is longer than ${machine.name} takes (max ${machine.maxBarLength} mm)`)
  }
  const empty: TurningPlan = {
    release: "preview", passes: [], stockVolume: 0, partVolume: 0, unmachinedVolume: 0, removedVolume: 0,
    stockAfter: [], stockProfiles: [], rpm: 0, feed: 0, ...(machine !== undefined ? { machine: { id: machine.id, name: machine.name } } : {}),
    nc: "", issues
  }
  if (issues.length > 0) return empty
  // The spindle and the feed never exceed what the machine takes.
  const spindle = machine !== undefined && machine.maxRpm > 0 ? Math.min(Math.round(rpm), Math.round(machine.maxRpm)) : Math.round(rpm)
  const feed = Math.min(feedMmRev * spindle, machine !== undefined && machine.maxFeed > 0 ? machine.maxFeed : Number.POSITIVE_INFINITY)
  const target = cappedProfile(profile.map((p) => ({ diameter: p.diameter + allowance, z: p.z })), stock.diameter, false)
  const minimum = Math.min(...target.map((p) => p.diameter))
  const count = Math.ceil((stock.diameter - minimum) / stepdown)
  if (!Number.isFinite(count) || count > 10000) issues.push("roughing exceeds the 10000-pass computation budget")
  if (issues.length > 0) return empty

  const partVolume = volumeOf(profile)
  const stockVolume = Math.PI * (stock.diameter / 2) ** 2 * stock.length
  const unmachinedVolume = Math.PI * (stock.diameter / 2) ** 2 * (stock.length + lastZ)
  const cylinder = [{ diameter: stock.diameter, z: 0 }, { diameter: stock.diameter, z: lastZ }]
  const stockProfiles: TurnPoint[][] = [cylinder]
  const stockAfter: number[] = [stock.diameter]
  const passes: TurnPass[] = []
  let previousVolume = volumeOf(cylinder)
  const add = (kind: TurnPass["kind"], diameter: number, points: TurnPoint[], after: TurnPoint[]) => {
    const nextVolume = volumeOf(after)
    passes.push({ kind, diameter, points, removed: Math.max(0, previousVolume - nextVolume) })
    stockProfiles.push(after)
    stockAfter.push(Math.max(...after.map((p) => p.diameter)))
    previousVolume = nextVolume
  }
  // Stock already starts at Z0: this is a skim, with no invented facing allowance or removed volume.
  add("face", stock.diameter, [{ diameter: stock.diameter + 2, z: 0 }, { diameter: 0, z: 0 }], cylinder)
  for (let i = 1; i <= count; i++) {
    const diameter = Math.max(minimum, stock.diameter - i * stepdown)
    const points = cappedProfile(target, diameter)
    add("rough", diameter, points, points)
  }
  const finished = profile.map((p) => ({ ...p }))
  add("finish", Math.max(...finished.map((p) => p.diameter)), finished, finished)
  const removedVolume = passes.reduce((sum, pass) => sum + pass.removed, 0)
  const safeX = stock.diameter + 2
  // Explicit G94/G97 avoids inheriting feed/rev or CSS from a preceding program.
  const lines = ["(TURNING PREVIEW - IDEAL POINT TOOL - X DIAMETER)", "G18 G21 G90 G40 G94 G97", `M3 S${spindle}`]
  for (const pass of passes) {
    lines.push(`(${pass.kind.toUpperCase()})`, `G0 X${f3(safeX)}`, "G0 Z1.000")
    const first = pass.points[0]!
    lines.push(`G0 X${f3(first.diameter)}`, `G1 Z${f3(first.z)} F${f3(feed)}`)
    for (const p of pass.points) lines.push(`G1 X${f3(p.diameter)} Z${f3(p.z)} F${f3(feed)}`)
    // Radial retraction first: axial return outside the original bar cannot cross an uncut shoulder.
    lines.push(`G0 X${f3(safeX)}`, "G0 Z1.000")
  }
  lines.push("M5", "M30")
  return {
    release: "preview", passes, stockVolume, partVolume, unmachinedVolume, removedVolume, stockAfter, stockProfiles,
    rpm: spindle, feed, ...(machine !== undefined ? { machine: { id: machine.id, name: machine.name } } : {}),
    nc: lines.join("\n") + "\n", issues
  }
}
