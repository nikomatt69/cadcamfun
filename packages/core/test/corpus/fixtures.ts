/**
 * The corpus inputs that are built in code (spec 55 §2): set (a) are the project's own recipes, set (c) generated stress parts.
 * An entry names its source; its manifest hash is taken over the history this file builds, so an edit here or in a recipe
 * that changes the input is reported until the oracle is re-derived.
 */
import { buildRecipe } from "../../src/cad/recipes.ts"
import { model } from "../../src/cad/script.ts"
import type { History } from "../../src/cad/history.ts"

export type CorpusSource =
  | { readonly recipe: string; readonly input: Readonly<Record<string, unknown>> }
  | { readonly fixture: string }

/** Generated parts of set (c), by name. */
export const FIXTURES: Readonly<Record<string, () => History>> = {
  /** A 40 x 30 x 20 box with every edge rounded at 3 mm: the corner-blend Booleans of spec 42 R8. */
  "rounded-box": () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 20 })
    m.fillet({ radius: 3 })
    return m.build()
  },
  /** A 200 x 100 x 10 plate with a 20 x 10 grid of 5 mm through holes on a 10 mm pitch: many coaxial cuts in one Boolean. */
  "plate-200-holes": () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 200, 100), { depth: 10 })
    const holes = m.sketch("XY")
    for (let i = 0; i < 20; i++) for (let j = 0; j < 10; j++) holes.circle([5 + 10 * i, 5 + 10 * j], 5)
    m.extrude(holes, { depth: 10, operation: "subtract" })
    return m.build()
  },
  /** Half a revolved ring, shelled: the exact shell of a partial revolution is a refusal by design (history-brep). */
  "half-revolve-shell": () => {
    const m = model()
    const ring = m.revolve(m.sketch("XY").rectangle([10, 0], 10, 20), { axis: "y", angle: 180 })
    m.shell(ring, { thickness: 2 })
    return m.build()
  }
}

export const historyOf = (source: CorpusSource): History => {
  if ("recipe" in source) return buildRecipe(source.recipe, source.input).history
  const build = FIXTURES[source.fixture]
  if (build === undefined) throw new RangeError(`unknown corpus fixture '${source.fixture}'`)
  return build()
}
