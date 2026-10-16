import { describe, expect, test } from "bun:test"
import { decodeSettings, generateToolpath } from "../../src/cam/generator/index.ts"
import { KINEMATICS, ORIGINS, checkAxes } from "../../src/cam/machine.ts"

const geometry = (selected: Array<Record<string, unknown>> = []) => ({
  geometryType: "selected", rectangleWidth: 100, rectangleHeight: 50, circleRadius: 25, polygonSides: 6, polygonRadius: 30, customPath: "", selectedElements: selected,
  stock: { width: 120, height: 80, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 1 }
})
const printer = { infillDensity: 20, infillPattern: "grid", supportType: "minimal", shellCount: 2, printResolution: "standard", printOrientation: "original" }
const run = (settings: Record<string, unknown>, selected: Array<Record<string, unknown>> = []) =>
  generateToolpath({ settings: decodeSettings(settings), geometry: geometry(selected), printer } as never).response.gcode
const probe = (patch: Record<string, unknown> = {}) => run({ operationType: "probing", toolType: "probe", ...patch })

describe("touch probes", () => {
  test("the tool types and the operation exist for a mill, and only for a mill", () => {
    expect(() => decodeSettings({ toolType: "probe" })).not.toThrow()
    expect(() => decodeSettings({ toolType: "toolsetter" })).not.toThrow()
    expect(KINEMATICS.mill.operations).toContain("probing")
    expect(KINEMATICS.lathe.operations).not.toContain("probing")
  })

  test("a probe is a sensor: the spindle never starts, and it is stopped first", () => {
    for (const probeCycle of ["zSurface", "edgeX", "edgeY", "corner", "bore", "boss", "toolLength"]) {
      const gcode = probe({ probeCycle })
      expect(gcode, probeCycle).toContain("M5 ; Spindle off")
      expect(gcode, probeCycle).not.toMatch(/\bM0?[34]\b/)
      expect(checkAxes(gcode, "mill").filter((i) => i.severity === "error"), probeCycle).toEqual([])
    }
  })

  test("Z surface: probe down, then the contact becomes Z0 in the chosen work offset", () => {
    const g54 = probe({ probeCycle: "zSurface", probeSearch: 12, probeFeed: 80 })
    expect(g54).toMatch(/G38\.2 Z-12\.000 F80/)
    expect(g54).toContain("G10 L20 P1 Z0.000")
    expect(probe({ probeCycle: "zSurface", workOffset: "G56" })).toContain("G10 L20 P3 Z0.000")
    expect(probe({ probeCycle: "zSurface", workOffset: "G56" })).toMatch(/^G56 ; Work offset$/m)
  })

  test("the stylus is a ball: an edge contact is half a tip diameter before the edge", () => {
    expect(probe({ probeCycle: "edgeX", probeStylus: 4 })).toContain("G10 L20 P1 X-2.000")
    expect(probe({ probeCycle: "edgeY", probeStylus: 3 })).toContain("G10 L20 P1 Y-1.500")
    const corner = probe({ probeCycle: "corner", probeStylus: 6 })
    expect(corner).toContain("G10 L20 P1 X-3.000")
    expect(corner).toContain("G10 L20 P1 Y-3.000")
  })

  test("the Fanuc dialect uses G31 and writes the offset through the macro variables of the work offset", () => {
    const z = probe({ probeCycle: "zSurface", probeDialect: "fanuc", workOffset: "G55" })
    expect(z).toMatch(/G31 Z-10\.000 F100/)
    expect(z).not.toContain("G38.2")
    expect(z).toContain("#5243 = #5243 + #5063 - 0.000")
    expect(probe({ probeCycle: "edgeX", probeDialect: "fanuc" })).toContain("#5221 = #5221 + #5061 - -2.000")
  })

  test("bore and boss: four touches, centre from each pair, diameter corrected by the tip", () => {
    const bore = probe({ probeCycle: "bore", probeFeatureSize: 30, probeStylus: 4 })
    expect(bore.match(/G38\.2/g)).toHaveLength(4)
    expect(bore).toContain("#103 = [#101 + #102] / 2")
    expect(bore).toContain("#107 = #102 - #101 + 4.000")
    const boss = probe({ probeCycle: "boss", probeFeatureSize: 30, probeStylus: 4 })
    expect(boss.match(/G38\.2/g)).toHaveLength(4)
    expect(boss).toContain("#107 = #102 - #101 - 4.000")
    expect(boss).toContain("G0 X-")
  })

  test("a tool setter measures the tool that is loaded", () => {
    const g = probe({ probeCycle: "toolLength", toolType: "toolsetter", toolNumber: 7 })
    expect(g).toContain("T7 M6")
    expect(g).toContain("G10 L10 P7")
    expect(probe({ probeCycle: "toolLength", probeDialect: "fanuc" })).toContain("#500 = #5063")
  })
})

describe("zeros and offsets, by machine", () => {
  test("a mill program selects its work offset unless it is the default G54", () => {
    expect(run({ operationType: "contour" }, [{ id: "r", type: "rectangle", x: 0, y: 0, z: 0, width: 20, height: 10, layerId: "l" }])).not.toMatch(/^G5[4-9] ; Work offset/m)
    expect(run({ operationType: "contour", workOffset: "G58" }, [{ id: "r", type: "rectangle", x: 0, y: 0, z: 0, width: 20, height: 10, layerId: "l" }])).toMatch(/^G58 ; Work offset$/m)
  })

  test("a lathe zero on the chuck moves every Z by the stock length and keeps the direction", () => {
    const face = run({ machineType: "lathe", toolType: "turning", operationType: "turning", depth: 2, stepdown: 1, stockLength: 60 })
    const chuck = run({ machineType: "lathe", toolType: "turning", operationType: "turning", depth: 2, stepdown: 1, stockLength: 60, latheZero: "chuck" })
    // The chuck grips 20 mm of the 60 mm bar: the turning stops 2 mm in front of the jaws (spec 31).
    expect(face).toContain("G1 Z-38.000")
    expect(face).toContain("; Limited to Z-38.000: the chuck grips 20.000 mm of the 60.000 mm bar")
    expect(chuck).toContain("G1 Z22.000")
    expect(chuck).toContain("; Z zero is the chuck face")
    const zs = (g: string) => [...g.matchAll(/^G[01] .*?\bZ(-?[\d.]+)/gm)].map((m) => Number(m[1]))
    expect(zs(chuck).map((z, i) => z - 60)).toEqual(zs(face))
    // Moving towards the chuck is still -Z: the turning feed ends lower than it starts.
    expect(chuck.indexOf("Z62.000")).toBeLessThan(chuck.indexOf("G1 Z22.000"))
  })

  test("a printer zero at the plate centre centres the part on X0 Y0; at the corner on the middle of the plate", () => {
    const cube = [{ id: "c", type: "cube", x: 40, y: -30, z: 5, width: 20, height: 20, depth: 2, layerId: "l" }]
    const xs = (g: string) => [...g.matchAll(/^G1 X(-?[\d.]+) Y(-?[\d.]+) Z0\.200 /gm)].map((m) => [Number(m[1]), Number(m[2])] as const)
    const corner = xs(run({ machineType: "3dprinter", operationType: "standard", toolType: "standard", bedWidth: 200, bedDepth: 180 }, cube))
    const centre = xs(run({ machineType: "3dprinter", operationType: "standard", toolType: "standard", bedWidth: 200, bedDepth: 180, bedOrigin: "center" }, cube))
    const mid = (points: ReadonlyArray<readonly [number, number]>) => [(Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2, (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2]
    expect(mid(corner)).toEqual([100, 90])
    expect(mid(centre)).toEqual([0, 0])
  })

  test("a part larger than the plate is reported, not silently printed", () => {
    const big = [{ id: "c", type: "cube", x: 0, y: 0, z: 0, width: 300, height: 50, depth: 2, layerId: "l" }]
    expect(run({ machineType: "3dprinter", operationType: "standard", toolType: "standard", bedWidth: 200 }, big)).toContain("WARNING: the part (300.0 x 50.0 mm) does not fit")
  })

  test("every machine offers origins, each one named in the settings it sets", () => {
    for (const kind of ["mill", "lathe", "3dprinter"] as const) {
      expect(ORIGINS[kind].choices.length).toBeGreaterThanOrEqual(2)
      for (const choice of ORIGINS[kind].choices) expect(() => decodeSettings({ machineType: kind, [ORIGINS[kind].setting]: choice.value }), `${kind}:${choice.value}`).not.toThrow()
    }
    expect(ORIGINS.mill.offsets).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"])
  })
})
