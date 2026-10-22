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

// ------------------------------------------------------------------ internal turning (boring)

export interface BoringJob {
  /** Ordered face-to-chuck, non-increasing Z, on the finished internal profile (same convention as the external plan). */
  readonly profile: ReadonlyArray<TurnPoint>
  /** Declared pilot diameter the bore starts from: the hole already open when the boring begins, mm. */
  readonly pilot: number
  readonly stock: TurnStock
  /** Diameter opened per roughing pass, mm. Default 2. */
  readonly stepdown?: number
  /** Diameter allowance left by the roughing for the finishing pass, mm. Default 0.4. */
  readonly allowance?: number
  readonly feedMmRev?: number
  readonly rpm?: number
  /** The turning centre: it bounds the bar and the spindle. */
  readonly machine?: TurningMachine
}
export interface BorePass {
  readonly kind: "bore-rough" | "bore-finish"
  /** Largest bore diameter the pass opens. */
  readonly diameter: number
  /** The cavity boundary the pass leaves, face to chuck. */
  readonly points: ReadonlyArray<TurnPoint>
  /** Analytic volume change of the bore cavity, before NC rounding. */
  readonly removed: number
}
export interface BoringPlan {
  readonly release: "preview"
  readonly passes: ReadonlyArray<BorePass>
  /** The solid bar over its whole length, pilot hole not deducted, mm³. */
  readonly barVolume: number
  /** The declared pilot cavity over the profile length, already open at the start, mm³. */
  readonly pilotVolume: number
  /** The material the plan works on: the bar less its declared pilot hole, mm³. */
  readonly stockVolume: number
  /** The finished bore cavity over the profile length, mm³ (pilotVolume + removedVolume). */
  readonly boreVolume: number
  /** Material the passes actually remove, mm³. */
  readonly removedVolume: number
  /** Bar material left inside the profile length outside the finished bore, mm³. */
  readonly remainingVolume: number
  /** Bar beyond the profile end, still solid; no parting operation is implied. */
  readonly unmachinedVolume: number
  /** Bore boundary: the pilot cylinder, then after every pass. */
  readonly boreProfiles: ReadonlyArray<ReadonlyArray<TurnPoint>>
  /** Largest bore diameter over the profile length: the pilot, then after every pass. */
  readonly boreAfter: ReadonlyArray<number>
  readonly rpm: number
  readonly feed: number
  readonly machine?: { readonly id: string; readonly name: string }
  readonly nc: string
  readonly issues: ReadonlyArray<string>
}

/**
 * Internal turning: boring a declared pilot out to a finished internal profile in diameter X and axial Z (face zero, negative
 * towards the chuck). The bar is the same solid cylinder the external plan uses; the declared pilot hole is the void the bore
 * starts from, so the stock the plan works on is the bar less that hole and the cavity grows inward from the pilot towards the
 * profile. Every removed volume is analytic and the plan partitions the worked stock: removed + remaining + unmachined = stock.
 *
 * Release is `preview`. This is an ideal point tool: insert compensation, workholding, grooves, threading, parting, live tools,
 * the C axis, stock transfer and machine qualification are not certified here and are refused or out of scope, never assumed.
 */
export const planBoring = (job: BoringJob): BoringPlan => {
  const issues: string[] = []
  const { profile, stock, pilot } = job
  const stepdown = job.stepdown ?? 2, allowance = job.allowance ?? 0.4
  const feedMmRev = job.feedMmRev ?? 0.15, rpm = job.rpm ?? 800
  if (profile.length < 2 || profile.length > 200) issues.push("the profile needs 2 to 200 points (face to chuck end)")
  if (!Number.isFinite(stock.diameter) || stock.diameter <= 0 || stock.diameter > 500 || !Number.isFinite(stock.length) || stock.length <= 0 || stock.length > 2000) issues.push("the stock diameter and length must be finite and positive (at most 500 and 2000 mm)")
  if (!Number.isFinite(pilot) || pilot <= 0) issues.push(`the pilot diameter ${pilot} must be finite and positive`)
  else if (pilot >= stock.diameter) issues.push(`the pilot diameter ${pilot} is not inside the ${stock.diameter} mm bar: it breaks out`)
  if (!Number.isFinite(stepdown) || stepdown < 0.001 || !Number.isFinite(allowance) || allowance < 0 || !Number.isFinite(feedMmRev) || feedMmRev <= 0 || !Number.isFinite(rpm) || rpm < 1 || rpm > 20000 || feedMmRev * Math.round(rpm) < 0.001 || !Number.isFinite(feedMmRev * rpm)) issues.push("stepdown must be at least 0.001 mm, allowance non-negative, and feed and rpm finite and positive (rpm 1..20000)")
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!
    if (!Number.isFinite(p.diameter) || p.diameter <= 0) issues.push(`profile point ${i} has no finite positive diameter`)
    if (!Number.isFinite(p.z) || p.z > 0) issues.push(`profile point ${i} needs a finite non-positive z`)
    // A bore opens: a finished point below the pilot would need the tool to cut back into material the pilot already cleared.
    if (Number.isFinite(p.diameter) && Number.isFinite(pilot) && p.diameter < pilot) issues.push(`bore diameter ${p.diameter} at z ${p.z} is smaller than the pilot ${pilot}: boring opens the pilot, it does not close it`)
    // Breakout: the finished bore must stay inside the bar's outer wall.
    if (Number.isFinite(p.diameter) && p.diameter >= stock.diameter) issues.push(`bore diameter ${p.diameter} at z ${p.z} reaches the ${stock.diameter} mm bar: the bore breaks out`)
    if (i === 0 && p.z !== 0) issues.push("the profile must start at the finished face (z = 0)")
    if (i > 0 && p.z > profile[i - 1]!.z) issues.push(`profile z increases at point ${i}: the profile must run from the face towards the chuck`)
  }
  const lastZ = profile[profile.length - 1]?.z ?? 0
  if (!(lastZ < 0)) issues.push("the profile needs positive axial length")
  if (-lastZ > stock.length) issues.push(`the profile is ${-lastZ} mm long but the bar is ${stock.length} mm`)
  const machine = job.machine
  if (machine !== undefined) {
    if (machine.maxBarDiameter > 0 && stock.diameter > machine.maxBarDiameter) issues.push(`the ${stock.diameter} mm bar does not fit the chuck of ${machine.name} (max ${machine.maxBarDiameter} mm)`)
    if (machine.maxBarLength > 0 && stock.length > machine.maxBarLength) issues.push(`the ${stock.length} mm bar is longer than ${machine.name} takes (max ${machine.maxBarLength} mm)`)
  }
  const empty: BoringPlan = {
    release: "preview", passes: [], barVolume: 0, pilotVolume: 0, stockVolume: 0, boreVolume: 0, removedVolume: 0,
    remainingVolume: 0, unmachinedVolume: 0, boreProfiles: [], boreAfter: [], rpm: 0, feed: 0,
    ...(machine !== undefined ? { machine: { id: machine.id, name: machine.name } } : {}),
    nc: "", issues
  }
  if (issues.length > 0) return empty
  const spindle = machine !== undefined && machine.maxRpm > 0 ? Math.min(Math.round(rpm), Math.round(machine.maxRpm)) : Math.round(rpm)
  const feed = Math.min(feedMmRev * spindle, machine !== undefined && machine.maxFeed > 0 ? machine.maxFeed : Number.POSITIVE_INFINITY)
  const span = -lastZ
  const barArea = Math.PI * (stock.diameter / 2) ** 2
  const pilotArea = Math.PI * (pilot / 2) ** 2
  const barVolume = barArea * stock.length
  const pilotVolume = pilotArea * span
  // The worked stock is the bar less its declared pilot hole; the tail past the profile carries no pilot and is fully stock.
  const stockVolume = barVolume - pilotVolume
  const unmachinedVolume = barArea * (stock.length + lastZ)
  const pilotProfile: TurnPoint[] = [{ diameter: pilot, z: 0 }, { diameter: pilot, z: lastZ }]
  const boreVolume = volumeOf(profile)
  const remainingVolume = barArea * span - boreVolume
  // Roughing opens the pilot to the profile LESS the diameter allowance (the allowance is material it must leave on the
  // finished wall, so it is stock left *inside* the bore, not bore taken out of it) in diameter steps, floored at the open void.
  const target = cappedProfile(profile.map((p) => ({ diameter: Math.max(pilot, p.diameter - allowance), z: p.z })), pilot, true)
  const maximum = Math.max(...target.map((p) => p.diameter))
  const count = Math.ceil((maximum - pilot) / stepdown)
  if (!Number.isFinite(count) || count > 10000) issues.push("roughing exceeds the 10000-pass computation budget")
  if (issues.length > 0) return empty

  const boreProfiles: TurnPoint[][] = [pilotProfile]
  const boreAfter: number[] = [pilot]
  const passes: BorePass[] = []
  let previousVolume = pilotVolume
  const add = (kind: BorePass["kind"], points: TurnPoint[]) => {
    const nextVolume = volumeOf(points)
    // The cavity grows inward from the pilot, so a pass removes what the previous boundary did not already hold.
    passes.push({ kind, diameter: Math.max(...points.map((p) => p.diameter)), points, removed: Math.max(0, nextVolume - previousVolume) })
    boreProfiles.push(points)
    boreAfter.push(Math.max(...points.map((p) => p.diameter)))
    previousVolume = nextVolume
  }
  for (let i = 1; i <= count; i++) {
    const cap = pilot + i * stepdown
    add("bore-rough", cappedProfile(target, cap, false))
  }
  add("bore-finish", profile.map((p) => ({ ...p })))
  const removedVolume = passes.reduce((sum, pass) => sum + pass.removed, 0)
  const safeZ = 1.0
  // Explicit G94/G97 avoids inheriting feed/rev or CSS from a preceding program.
  const lines = ["(BORING PREVIEW - IDEAL POINT TOOL - X DIAMETER - FROM PILOT)", "G18 G21 G90 G40 G94 G97", `M3 S${spindle}`]
  for (const pass of passes) {
    lines.push(`(${pass.kind.toUpperCase()})`, "G0 Z1.000")
    const first = pass.points[0]!
    // Feed down the already-open bore to the face, then open it out along the profile. The pilot side is void, so this plunges in air.
    lines.push(`G0 X${f3(Math.min(pilot, first.diameter))}`, `G1 Z${f3(first.z)} F${f3(feed)}`)
    for (const p of pass.points) lines.push(`G1 X${f3(p.diameter)} Z${f3(p.z)} F${f3(feed)}`)
    // Retract axially out the open face through the void just bored; a radial move inside the bar would cross the outer wall.
    lines.push(`G0 Z${f3(safeZ)}`)
  }
  lines.push("M5", "M30")
  return {
    release: "preview", passes, barVolume, pilotVolume, stockVolume, boreVolume, removedVolume, remainingVolume,
    unmachinedVolume, boreProfiles, boreAfter, rpm: spindle, feed,
    ...(machine !== undefined ? { machine: { id: machine.id, name: machine.name } } : {}),
    nc: lines.join("\n") + "\n", issues
  }
}
