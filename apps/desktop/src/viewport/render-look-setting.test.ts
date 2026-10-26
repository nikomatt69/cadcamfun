import { expect, test } from "bun:test"

const store = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } })
store.set("viewport.lookTier", "high")

test("the tier is read from storage, set, stored, and an unknown value is ignored", async () => {
  const { lookTier, setLookTier, currentLookTier, LOOK_TIER_KEY } = await import("./render-look-setting.ts?fresh-module-for-this-file")
  expect(LOOK_TIER_KEY).toBe("viewport.lookTier")
  expect(lookTier()).toBe("high")
  setLookTier("low")
  expect(lookTier()).toBe("low")
  expect(currentLookTier()).toBe("low")
  expect(store.get(LOOK_TIER_KEY)).toBe("low")
  setLookTier("ultra")
  expect(lookTier()).toBe("low")
  expect(store.get(LOOK_TIER_KEY)).toBe("low")
})

test("with nothing stored the shared tier is the default one", async () => {
  store.clear()
  const { lookTier } = await import("./render-look-setting.ts?fresh-module-for-the-default")
  const { DEFAULT_LOOK_TIER } = await import("./render-look.ts")
  expect(lookTier()).toBe(DEFAULT_LOOK_TIER)
})
