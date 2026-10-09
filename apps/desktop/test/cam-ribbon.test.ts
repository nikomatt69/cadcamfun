/**
 * CamRibbon data tests — Fusion/Hypermill-style categorical ribbon.
 *
 * The ribbon is the visible top-level surface of the production-CAM
 * taxonomy: every strategy family must be reachable from it.
 */
import { describe, expect, test } from "bun:test"
import {
  RIBBON_GROUPS,
  RIBBON_ROUTES,
  RIBBON_TABS,
  type RibbonTabId
} from "../src/cam/components/CamRibbon.data.ts"

const ALL_TABS: ReadonlyArray<RibbonTabId> = ["home", "setup", "machining", "simulation", "post", "tools"]

describe("CAM ribbon", () => {
  test("every Fusion / Hypermill tab is present", () => {
    const expected: RibbonTabId[] = [...ALL_TABS]
    expect(RIBBON_TABS.map((tab) => tab.id)).toEqual(expected)
  })

  test("every tab has at least one group", () => {
    for (const id of ALL_TABS) {
      const groups = RIBBON_GROUPS[id]
      expect(groups.length).toBeGreaterThan(0)
      for (const group of groups) {
        expect(group.actions.length).toBeGreaterThan(0)
      }
    }
  })

  test("every action has a known route handler", () => {
    for (const id of ALL_TABS) {
      for (const group of RIBBON_GROUPS[id]) {
        for (const action of group.actions) {
          expect(RIBBON_ROUTES.has(action.route)).toBe(true)
        }
      }
    }
  })

  test("the machining tab exposes every Fusion-class strategy family", () => {
    const groups = RIBBON_GROUPS["machining"]
    expect(groups.length).toBeGreaterThanOrEqual(4)
    const titles = groups.map((g) => g.titleKey)
    expect(titles).toContain("cam.ribbon.group.profiling")
    expect(titles).toContain("cam.ribbon.group.surface")
    expect(titles).toContain("cam.ribbon.group.multi")
    expect(titles).toContain("cam.ribbon.group.lathe")
  })

  test("multi-axis strategy buttons are surfaced in the ribbon (Hypermill-style)", () => {
    const multi = RIBBON_GROUPS["machining"].find((g) => g.titleKey === "cam.ribbon.group.multi")
    expect(multi).toBeDefined()
    const ids = multi!.actions.map((a) => a.id)
    expect(ids).toContain("strategy-32")
    expect(ids).toContain("strategy-4")
    expect(ids).toContain("strategy-5swarf")
    expect(ids).toContain("strategy-5sim")
  })

  test("lathe turning group covers the production-class lathe ops", () => {
    const lathe = RIBBON_GROUPS["machining"].find((g) => g.titleKey === "cam.ribbon.group.lathe")
    expect(lathe).toBeDefined()
    const ids = lathe!.actions.map((a) => a.id)
    expect(ids).toContain("strategy-facing")
    expect(ids).toContain("strategy-turning")
    expect(ids).toContain("strategy-boring")
    expect(ids).toContain("strategy-threading")
    expect(ids).toContain("strategy-parting")
  })

  test("post tab covers Fanuc, Heidenhain, generic dialects", () => {
    const post = RIBBON_GROUPS["post"]
    expect(post.length).toBeGreaterThan(0)
    const routes = post[0]!.actions.map((a) => a.route)
    expect(routes).toContain("post-fanuc")
    expect(routes).toContain("post-heidenhain")
    expect(routes).toContain("post-gcode")
  })

  test("simulation tab opens verify / cycles / preview", () => {
    const sim = RIBBON_GROUPS["simulation"]
    expect(sim.length).toBeGreaterThan(0)
    const routes = sim[0]!.actions.map((a) => a.route)
    expect(routes).toContain("right-verify")
    expect(routes).toContain("right-cycles")
    expect(routes).toContain("active-preview")
  })
})
