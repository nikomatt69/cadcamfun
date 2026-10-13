/**
 * Modelling by program: a typed builder over the parametric history, shaped after the way Fusion 360's API is used from a script
 * (create a sketch, add shapes to it, extrude it, fillet the edges, pattern the result), so a part can be written as code, kept in a
 * file, parametrised with ordinary variables and replayed.
 *
 *   const m = model()
 *   m.param("width", 60).param("wall", 3)
 *   const base = m.extrude(m.sketch("XY").rectangle([0, 0], "width", 40), { depth: 12 })
 *   m.hole({ plane: "XY", offset: 12, at: [10, 10], diameter: 6, depth: 12 })
 *   m.fillet({ radius: 2 })
 *   const { bodies, issues } = m.rebuild()
 *
 * The builder only writes the `History` the rest of the system already understands (`build()` returns it), so a scripted part is
 * editable in the panel, driven by the assistant, rebuilt on a parameter change and machined exactly like one made any other way.
 * Every method returns the id of what it made; ids are generated (`sketch1`, `extrude2`, ...) unless `id` is given.
 *
 * `runModelScript` runs the source text of such a script. It evaluates JavaScript with the privileges of the caller: use it for
 * code the person wrote or read, never for text from another party.
 */
import type { Dimension } from "./expr.ts"
import {
  rebuild, type CombineFeature, type CoilFeature, type DimConstraint, type EdgeSelection, type EdgeTreatment, type CornerTreatment, type ExtrudeFeature,
  type Feature, type FilletFeature, type History, type HoleFeature, type LoftFeature, type MirrorFeature, type MoveFeature, type Operation, type PatternFeature,
  type PlaneName, type PrimitiveFeature, type RebuildResult, type RevolveFeature, type RibFeature, type ScaleFeature, type SheetFeature, type ShellFeature, type SplitFeature,
  type SweepFeature, type TextFeature, type ThreadFeature, type PushPullFeature, type DraftFeature, type MateFeature, type PlaneDefinition, type PlaneRef
} from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import type { SketchShape } from "./sketch-shapes.ts"

type Pair = readonly [Dimension, Dimension]
type Triple = readonly [Dimension, Dimension, Dimension]
type Distribute<T> = T extends unknown ? Omit<T, "id" | "type"> : never
/** The options of a feature: its fields without the id and type, which the builder sets. `id` may be given. */
type Options<F> = Distribute<F> & { readonly id?: string }

export class SketchBuilder {
  private readonly entities: SketchEntity[] = []
  private readonly constraints: DimConstraint[] = []
  private readonly shapes: SketchShape[] = []
  private count = 0

  constructor(private readonly id: string, private readonly plane: PlaneRef, private readonly offset: Dimension | undefined, private readonly commit: (sketch: SketchBuilder) => void) {}

  private next(kind: string, id: string | undefined): string { this.count += 1; return id ?? `${kind}${this.count}` }
  private shape(shape: SketchShape): this { this.shapes.push(shape); this.commit(this); return this }

  rectangle(at: Pair, width: Dimension, height: Dimension, options: { readonly centered?: boolean; readonly id?: string } = {}): this {
    return this.shape({ id: this.next("rectangle", options.id), kind: "rectangle", at, width, height, ...(options.centered !== undefined ? { centered: options.centered } : {}) })
  }
  circle(at: Pair, diameter: Dimension, options: { readonly id?: string } = {}): this { return this.shape({ id: this.next("circle", options.id), kind: "circle", at, diameter }) }
  polygon(at: Pair, sides: number, radius: Dimension, options: { readonly flats?: boolean; readonly rotation?: Dimension; readonly id?: string } = {}): this {
    return this.shape({ id: this.next("polygon", options.id), kind: "polygon", at, sides, radius, ...(options.flats !== undefined ? { flats: options.flats } : {}), ...(options.rotation !== undefined ? { rotation: options.rotation } : {}) })
  }
  ellipse(at: Pair, radiusX: Dimension, radiusY: Dimension, options: { readonly segments?: number; readonly id?: string } = {}): this {
    return this.shape({ id: this.next("ellipse", options.id), kind: "ellipse", at, radiusX, radiusY, ...(options.segments !== undefined ? { segments: options.segments } : {}) })
  }
  slot(at: Pair, length: Dimension, width: Dimension, options: { readonly angle?: Dimension; readonly id?: string } = {}): this {
    return this.shape({ id: this.next("slot", options.id), kind: "slot", at, length, width, ...(options.angle !== undefined ? { angle: options.angle } : {}) })
  }
  /** A closed outline through the points. */
  polyline(points: ReadonlyArray<Pair>, options: { readonly id?: string } = {}): this { return this.shape({ id: this.next("polyline", options.id), kind: "polyline", points }) }
  /** A spline through the points, a Bezier or a NURBS from control points. */
  curve(curve: "spline" | "bezier" | "nurbs", points: ReadonlyArray<Pair>, options: { readonly closed?: boolean; readonly chord?: boolean; readonly degree?: number; readonly divisions?: number; readonly id?: string } = {}): this {
    const { id, ...rest } = options
    return this.shape({ id: this.next("curve", id), kind: "curve", curve, points, ...rest })
  }
  /** An open chain of straight lines through fixed points: a sweep path, a rib's centre line, a sheet-metal profile. */
  path(points: ReadonlyArray<readonly [number, number]>, options: { readonly id?: string } = {}): this {
    const base = this.next("path", options.id)
    points.forEach(([x, y], k) => {
      this.entities.push({ id: `${base}.p${k}`, kind: "point", x, y })
      this.constraints.push({ type: "fixed", point: `${base}.p${k}`, x, y })
    })
    for (let k = 0; k + 1 < points.length; k++) this.entities.push({ id: `${base}.l${k}`, kind: "line", p1: `${base}.p${k}`, p2: `${base}.p${k + 1}` })
    this.commit(this)
    return this
  }
  /** A raw entity or constraint of the sketch solver, for what the shapes do not cover. */
  entity(entity: SketchEntity): this { this.entities.push(entity); this.commit(this); return this }
  constrain(constraint: DimConstraint): this { this.constraints.push(constraint); this.commit(this); return this }

  /** The id to pass to a feature. */
  toString(): string { return this.id }
  feature(): Feature {
    return { id: this.id, type: "sketch", plane: this.plane, ...(this.offset !== undefined ? { offset: this.offset } : {}), sketch: { entities: [...this.entities], constraints: [...this.constraints], ...(this.shapes.length > 0 ? { shapes: [...this.shapes] } : {}) } }
  }
}

const idOf = (ref: string | { toString(): string }): string => ref.toString()

export class ModelScript {
  private readonly parameters: Record<string, number | string> = {}
  private readonly features: Feature[] = []
  private counters: Record<string, number> = {}
  private bodies = false

  /** Defines or redefines a parameter: a number, or an expression of the others (`"width / 2"`). */
  param(name: string, value: number | string): this { this.parameters[name] = value; return this }

  private make(type: string, id: string | undefined): string {
    if (id !== undefined) return id
    this.counters[type] = (this.counters[type] ?? 0) + 1
    return `${type}${this.counters[type]}`
  }
  private put(feature: Feature): string {
    if (this.features.some((f) => f.id === feature.id)) throw new RangeError(`There is already a feature '${feature.id}'`)
    this.features.push(feature)
    return feature.id
  }
  /** `new` for the first solid, `union` after it, unless the caller chose. */
  private operation(given: Operation | undefined): Operation { const op = given ?? (this.bodies ? "union" : "new"); this.bodies = true; return op }

  /** Adds any feature as it is (the typed methods below are the usual way). */
  add(feature: Feature): string { return this.put(feature) }

  sketch(plane: PlaneRef, offset?: Dimension, options: { readonly id?: string } = {}): SketchBuilder {
    const id = this.make("sketch", options.id)
    const builder: SketchBuilder = new SketchBuilder(id, plane, offset, (b) => {
      const at = this.features.findIndex((f) => f.id === id)
      if (at < 0) this.features.push(b.feature())
      else this.features[at] = b.feature()
    })
    this.put(builder.feature())
    return builder
  }

  extrude(sketch: string | SketchBuilder, o: { readonly depth: Dimension; readonly direction?: "up" | "down" | "symmetric"; readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly edge?: EdgeTreatment; readonly corner?: CornerTreatment; readonly taper?: Dimension; readonly id?: string }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("extrude", id), type: "extrude", sketch: idOf(sketch), operation: this.operation(operation), ...rest } as ExtrudeFeature)
  }
  revolve(sketch: string | SketchBuilder, o: { readonly axis: "x" | "y" | { readonly line: string }; readonly angle?: Dimension; readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("revolve", id), type: "revolve", sketch: idOf(sketch), operation: this.operation(operation), ...rest } as RevolveFeature)
  }
  hole(o: Options<HoleFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("hole", id), type: "hole", ...rest } as HoleFeature) }
  pattern(o: Options<PatternFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("pattern", id), type: "pattern", ...rest } as PatternFeature) }
  mirror(o: Options<MirrorFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("mirror", id), type: "mirror", ...rest } as MirrorFeature) }
  sweep(profile: string | SketchBuilder, path: string | SketchBuilder, o: { readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly bendRadius?: Dimension; readonly id?: string } = {}): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("sweep", id), type: "sweep", profile: idOf(profile), path: idOf(path), operation: this.operation(operation), ...rest } as SweepFeature)
  }
  loft(sections: ReadonlyArray<string | SketchBuilder>, o: { readonly smooth?: boolean; readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly id?: string } = {}): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("loft", id), type: "loft", sections: sections.map(idOf), operation: this.operation(operation), ...rest } as LoftFeature)
  }
  shell(feature: string, o: { readonly thickness: Dimension; readonly open?: "none" | "top" | "bottom" | "both"; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, ...rest } = o
    return this.put({ id: this.make("shell", id), type: "shell", feature, ...rest } as ShellFeature)
  }
  fillet(o: { readonly radius: Dimension; readonly edges?: EdgeSelection; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, ...rest } = o
    return this.put({ id: this.make("fillet", id), type: "fillet", ...rest } as FilletFeature)
  }
  chamfer(o: { readonly size: Dimension; readonly edges?: EdgeSelection; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, size, ...rest } = o
    return this.put({ id: this.make("chamfer", id), type: "fillet", radius: size, style: "chamfer", ...rest } as FilletFeature)
  }
  primitive(o: Omit<Options<PrimitiveFeature>, "operation"> & { readonly operation?: Operation }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("primitive", id), type: "primitive", operation: this.operation(operation), ...rest } as PrimitiveFeature)
  }
  coil(o: Omit<Options<CoilFeature>, "operation"> & { readonly operation?: Operation }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("coil", id), type: "coil", operation: this.operation(operation), ...rest } as CoilFeature)
  }
  move(o: Options<MoveFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("move", id), type: "move", ...rest } as MoveFeature) }
  scale(o: Options<ScaleFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("scale", id), type: "scale", ...rest } as ScaleFeature) }
  split(o: Options<SplitFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("split", id), type: "split", ...rest } as SplitFeature) }
  combine(o: Options<CombineFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("combine", id), type: "combine", ...rest } as CombineFeature) }
  rib(sketch: string | SketchBuilder, o: { readonly thickness: Dimension; readonly depth: Dimension; readonly direction?: "up" | "down" | "symmetric"; readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("rib", id), type: "rib", sketch: idOf(sketch), ...(operation !== undefined ? { operation } : {}), ...rest } as RibFeature)
  }
  sheet(sketch: string | SketchBuilder, o: { readonly thickness: Dimension; readonly width: Dimension; readonly bendRadius?: Dimension; readonly side?: "centre" | "left" | "right"; readonly hems?: SheetFeature["hems"]; readonly direction?: "up" | "down" | "symmetric"; readonly operation?: Operation; readonly targets?: ReadonlyArray<string>; readonly id?: string }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("sheet", id), type: "sheet", sketch: idOf(sketch), operation: this.operation(operation), ...rest } as SheetFeature)
  }
  thread(o: Options<ThreadFeature>): string { const { id, ...rest } = o; this.bodies = true; return this.put({ id: this.make("thread", id), type: "thread", ...rest } as ThreadFeature) }
  text(o: Omit<Options<TextFeature>, "operation"> & { readonly operation?: Operation }): string {
    const { id, operation, ...rest } = o
    return this.put({ id: this.make("text", id), type: "text", operation: this.operation(operation), ...rest } as TextFeature)
  }
  /** A work plane; pass the returned id as the `plane` of a sketch, hole or text. */
  plane(from: PlaneDefinition, options: { readonly id?: string } = {}): string { return this.put({ id: this.make("plane", options.id), type: "plane", from }) }
  draft(o: Options<DraftFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("draft", id), type: "draft", ...rest } as DraftFeature) }
  mate(o: Options<MateFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("mate", id), type: "mate", ...rest } as MateFeature) }
  pushPull(o: Options<PushPullFeature>): string { const { id, ...rest } = o; return this.put({ id: this.make("pushpull", id), type: "pushpull", ...rest } as PushPullFeature) }

  /** The history written so far (a copy: later calls do not change it). */
  build(): History { return { parameters: { ...this.parameters }, features: [...this.features] } }
  /** The bodies, issues and flat patterns of the part. */
  rebuild(): RebuildResult { return rebuild(this.build()) }
}

/** A new, empty model. */
export const model = (): ModelScript => new ModelScript()

/**
 * Runs the source of a modelling script and returns its history. The source is a function body that receives `m` (a `ModelScript`) and
 * `Math`; it builds the part by calling `m`, and may `return` another `ModelScript` or a `History` to use that instead. Runs with the
 * caller's privileges: only for code the person wrote or reviewed. Throws what the script throws.
 */
export const runModelScript = (source: string): History => {
  const m = new ModelScript()
  const run = new Function("m", "Math", `"use strict";\n${source}`) as (m: ModelScript, math: Math) => unknown
  const out = run(m, Math)
  if (out instanceof ModelScript) return out.build()
  if (typeof out === "object" && out !== null && "features" in out && "parameters" in out) return out as History
  return m.build()
}
