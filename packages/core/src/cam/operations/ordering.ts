/**
 * Visit order of the chains of one operation (spec 69 F11): the shared bridge from an operation's paths to `kernel/linking.ts`.
 * The operation keeps cutting every chain exactly as before; only the order, and for chains that may run either way the direction,
 * change, so the non-cutting travel between them is shorter.
 */
import { Schema } from "effect"
import type { Vec2 } from "../../cad/vec.ts"
import { planLinks, type LinkChain } from "../kernel/linking.ts"

export const OrderingSchema = Schema.Literals(["input", "shortest"])
export type Ordering = typeof OrderingSchema.Type

export interface OrderedItem<T> {
  readonly item: T
  /** Run the chain end to start (only ever true for items declared reversible). */
  readonly reversed: boolean
}

/**
 * `items` in the order that shortens the links between them. The tour starts from the first item's start, so the first chain is
 * the one the operation would have cut first; `ordering: "input"` returns the items untouched.
 */
export const orderChains = <T>(items: ReadonlyArray<T>, ordering: Ordering, ends: (item: T) => { readonly start: Vec2; readonly end: Vec2; readonly reversible: boolean }): ReadonlyArray<OrderedItem<T>> => {
  if (ordering === "input" || items.length < 3) return items.map((item) => ({ item, reversed: false }))
  const chains: LinkChain[] = items.map((item) => ends(item))
  const plan = planLinks(chains, { from: chains[0]!.start })
  return plan.steps.map((s) => ({ item: items[s.chain]!, reversed: s.reversed }))
}
