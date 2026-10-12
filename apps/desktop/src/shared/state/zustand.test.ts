import { describe, expect, test } from "bun:test"
import { createEffect, createRoot } from "solid-js"
import { create } from "./zustand.ts"

interface Counter { count: number; label: string; items: string[]; inc: () => void; add: (item: string) => void }
const make = () => create<Counter>((set, get) => ({
  count: 0, label: "a", items: [],
  inc: () => set((s) => ({ count: s.count + 1 })),
  add: (item) => set({ items: [...get().items, item] })
}))

describe("zustand-shaped store", () => {
  test("get/set merge shallowly and actions see current state", () => {
    const use = make()
    use.getState().inc(); use.getState().inc()
    use.getState().add("x")
    expect(use.getState().count).toBe(2)
    expect(use.getState().label).toBe("a")
    expect(use.getState().items).toEqual(["x"])
  })

  test("the reactive view tracks only the keys it reads", () => {
    const use = make()
    let countRuns = 0, labelRuns = 0
    // Solid runs a root's effects once its body returns, so the writes happen afterwards.
    const dispose = createRoot((d) => {
      const store = use()
      createEffect(() => { void store.count; countRuns++ })
      createEffect(() => { void store.label; labelRuns++ })
      return d
    })
    expect([countRuns, labelRuns]).toEqual([1, 1])
    use.setState({ count: 5 })
    expect([countRuns, labelRuns]).toEqual([2, 1])
    dispose()
  })

  test("a selector returns an accessor", () => {
    const use = make()
    createRoot((dispose) => {
      const items = use((s) => s.items)
      expect(items()).toEqual([])
      use.getState().add("y")
      expect(items()).toEqual(["y"])
      dispose()
    })
  })

  test("subscribe fires with next and previous, replace drops keys", () => {
    const use = make()
    const seen: Array<[number, number]> = []
    const off = use.subscribe((s, p) => seen.push([s.count, p.count]))
    use.getState().inc()
    off(); use.getState().inc()
    expect(seen).toEqual([[1, 0]])
    use.setState({ count: 9 } as Counter, true)
    expect("label" in use.getState()).toBe(false)
  })
})
