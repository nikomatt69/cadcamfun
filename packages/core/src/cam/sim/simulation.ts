/**
 * The stock simulation of a program, driven by the playback clock (spec 32 §4.5).
 *
 * The preview asks it for the material at the playhead's time; it applies the moves the program has
 * run by then and gives back the stock that is left. Scrubbing back replays from the last
 * checkpoint, so the state at a time is the same however the playhead got there.
 *
 * Rest stock across operations is automatic: one height field for the whole program, so the second
 * operation starts on what the first one left.
 */
import type { Program } from "../ir.ts"
import { timedIndexAt, type Timeline } from "../viewer/timeline.ts"
import { deviationOf, type DeviationResult } from "../verify/deviation.ts"
import { StockSim, type SimCutter, type SimMove, type StockBounds, type StockMesh } from "./stock-sim.ts"

export interface SimulationOptions {
  readonly program: Program
  /** The clock the simulation follows (the same one the preview plays). */
  readonly timeline: Timeline
  /** The cutter of every tool, by the toolpath's `toolId`. */
  readonly cutters: ReadonlyMap<string, SimCutter>
  /** The stock the program starts from. */
  readonly bounds: StockBounds
  /** The cell size, mm (default: the largest cutter's diameter / 10, at most 1 mm). */
  readonly cell?: number
}

/** The default cell size: fine enough to see the cut, coarse enough to stay interactive. */
export const defaultCell = (cutters: ReadonlyMap<string, SimCutter>): number => {
  let largest = 0
  for (const cutter of cutters.values()) largest = Math.max(largest, cutter.radius * 2)
  if (largest <= 0) return 1
  return Math.min(1, Math.max(0.05, largest / 10))
}

export class StockSimulation {
  readonly sim: StockSim
  /** The toolpaths whose cutter is unknown: their moves are not cut (and the preview says so). */
  readonly missingTools: ReadonlyArray<string>
  private readonly step: number
  private readonly checkpoints: Array<{ readonly index: number; readonly top: Float64Array }> = []
  /** The move that may be applied in part; the moves before it are applied entirely. */
  private appliedIndex = 0
  private appliedFraction = 0
  /** The field before the current move was applied, so it can be applied again with another fraction. */
  private currentBase: Float64Array | undefined
  private readonly checkpointEvery: number

  constructor(private readonly options: SimulationOptions) {
    const cutters = options.cutters
    const missing = new Set<string>()
    for (const path of options.program.toolpaths) if (!cutters.has(path.toolId)) missing.add(path.toolId)
    this.missingTools = [...missing]
    const cell = options.cell ?? defaultCell(cutters)
    this.sim = new StockSim(options.bounds, cell)
    this.step = cell
    // Enough checkpoints to scrub back quickly, few enough to keep the memory small.
    const moves = options.timeline.moves.length
    this.checkpointEvery = Math.max(16, Math.min(512, Math.ceil(moves / 64)))
    // The whole stock is the first checkpoint: scrubbing back before any move lands here.
    this.checkpoints.push({ index: 0, top: this.sim.snapshot() })
  }

  /** The time the playhead is at, and the material that is left there. */
  advanceTo(seconds: number): void {
    const timeline = this.options.timeline
    const index = timedIndexAt(timeline, seconds)
    if (index < this.appliedIndex) this.rewindTo(index)
    while (this.appliedIndex < index) {
      // A partial replay uses its own sample spacing. Discard those stamps before replaying the
      // full move, or curved cutters leave a different surface depending on the frame rate.
      if (this.currentBase !== undefined) this.sim.restore(this.currentBase)
      this.applyMove(this.appliedIndex, 1)
      this.appliedIndex++
      this.currentBase = undefined
      this.appliedFraction = 0
      this.checkpoint(this.appliedIndex)
    }
    if (index >= timeline.moves.length) { this.appliedFraction = 0; return }
    const fraction = this.fractionAt(index, seconds)
    if (fraction === this.appliedFraction) return
    if (this.currentBase === undefined) this.currentBase = this.sim.snapshot()
    this.sim.restore(this.currentBase)
    this.applyMove(index, fraction)
    this.appliedFraction = fraction
  }

  /** The material as it was at the start: the whole stock. */
  reset(): void {
    this.sim.reset()
    this.checkpoints.length = 0
    this.checkpoints.push({ index: 0, top: this.sim.snapshot() })
    this.appliedIndex = 0
    this.appliedFraction = 0
    this.currentBase = undefined
  }

  /** The remaining stock as a mesh. */
  mesh(): StockMesh {
    return this.sim.mesh()
  }

  /** The volume removed so far, mm³. */
  get removedVolume(): number {
    return this.sim.removedVolume
  }

  /** Counts the changes of the stock, so a viewer knows when to redraw it. */
  get version(): number {
    return this.sim.version
  }

  /** The volume of material left, mm³. */
  get remainingVolume(): number {
    return this.sim.volume()
  }

  /** How the stock left compares with the part it should become. */
  deviation(target: Float64Array, tolerance: number): DeviationResult {
    return deviationOf(this.sim.field, target, tolerance)
  }

  /** The part's top surface, as the simulation's columns see it. */
  rasterise(meshes: Parameters<typeof this.sim.field.rasterise>[0]): Float64Array {
    return this.sim.field.rasterise(meshes)
  }

  private applyMove(index: number, fraction: number): void {
    const move = this.options.timeline.moves[index]
    if (move === undefined || move.kind === "dwell" || move.state.probe) return
    const path = this.options.program.toolpaths[move.path]
    const cutter = path === undefined ? undefined : this.options.cutters.get(path.toolId)
    if (cutter === undefined || cutter.radius <= 0) return
    const sim: SimMove = {
      rapid: move.kind === "rapid",
      from: move.from,
      to: move.to,
      ...(move.center !== undefined ? { center: move.center, clockwise: move.clockwise } : {})
    }
    if (sim.rapid) return
    this.sim.cut(sim, cutter, this.step, fraction)
  }

  private fractionAt(index: number, seconds: number): number {
    const move = this.options.timeline.moves[index]
    if (move === undefined) return 1
    if (move.duration <= 0) return 1
    const t = (seconds - move.start) / move.duration
    return Math.max(0, Math.min(1, t))
  }

  /** Restores the last checkpoint at or before `index` and replays from there. */
  private rewindTo(index: number): void {
    let chosen: { readonly index: number; readonly top: Float64Array } | undefined
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.index <= index && (chosen === undefined || checkpoint.index > chosen.index)) chosen = checkpoint
    }
    if (chosen !== undefined) {
      this.sim.restore(chosen.top)
      this.appliedIndex = chosen.index
    } else {
      // No checkpoint before the target: start from the whole stock again.
      this.sim.reset()
      this.appliedIndex = 0
    }
    this.appliedFraction = 0
    this.currentBase = undefined
  }

  /** Keeps a checkpoint of the field every few moves, and at every operation boundary. */
  private checkpoint(index: number): void {
    const boundary = index < this.options.timeline.moves.length && this.options.timeline.moves[index]!.path !== this.options.timeline.moves[index - 1]?.path
    if (!boundary && index % this.checkpointEvery !== 0) return
    this.checkpoints.push({ index, top: this.sim.snapshot() })
    // Keep the memory bounded: the oldest checkpoints go first.
    while (this.checkpoints.length > 96) this.checkpoints.shift()
  }
}
