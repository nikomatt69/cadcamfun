import { describe, expect, test } from "bun:test"
import { analyseGcode } from "./generator/index.ts"
import { programTools } from "./program-tools.ts"
import { toolKindOf } from "./operation-tools.ts"

const resolve = (code: string) => {
  const parsed = analyseGcode(code)
  return { ...parsed, tools: programTools(parsed.program, parsed.motion, code) }
}

describe("operation-aware imported tooling", () => {
  test("drill, tap, boring and probe operations get their own physical tools", () => {
    const a = resolve("G21 G90 G17\nT1 M6\nG0 X0 Y0 Z5\nG81 Z-10 R2 F100\nG80\nT2 M6\nG84 Z-8 R2 F100\nG80\nT3 M6\nG85 Z-8 R2 F100\nG80\nT4 M6\nG38.2 Z-1 F50\nM30")
    expect([...a.tools.values()].map((t) => toolKindOf(t.model))).toEqual(["drill", "tap", "boringBar", "probe"])
    for (const tool of a.tools.values()) {
      expect(tool.source).toBe("inferred")
      expect(tool.model.assumed).toContain("type")
      expect(tool.issues).toEqual([])
    }
  })

  test("a single path's header tool number comes from its motion track", () => {
    const a = resolve("(T7 D=8.5 CR=0. - drill)\nG21 G90\nT7 M6\nG0 X0 Y0 Z5\nG81 Z-10 R2 F100\nG80\nM30")
    const tool = a.tools.get(a.program.toolpaths[0]!.toolId)!
    expect(tool.source).toBe("header")
    expect(tool.model).toMatchObject({ family: "mill", shape: "drill", diameter: 8.5 })
  })

  test("a declared end mill is preserved and its tapping conflict is reported", () => {
    const a = resolve("(T2 D=6. CR=0. - flat end mill)\nG21 G90\nT2 M6\nG0 Z5\nG84 X0 Y0 Z-10 R2 F100\nG80\nM30")
    const tool = [...a.tools.values()][0]!
    expect(tool.model).toMatchObject({ family: "mill", shape: "flat", diameter: 6 })
    expect(tool.issues.map((i) => i.code)).toEqual(["TOOL_CANNOT_DO_OPERATION"])
  })

  test("the generator's single-tool header is recognized when imported as plain NC", () => {
    const a = resolve("; Tool: drill Ø8.5mm\nG21 G90\nG0 Z5\nG1 Z-10 F100\nG0 Z5\nM30")
    expect([...a.tools.values()][0]).toMatchObject({ source: "header", model: { family: "mill", shape: "drill", diameter: 8.5 } })
  })

  test("tool reuse keeps one model and exposes incompatible cycle demands", () => {
    const a = resolve("G21 G90\nT1 M6\nG0 Z5\nG81 X0 Y0 Z-5 R2 F100\nG80\nT2 M6\nG1 X10 F100\nT1 M6\nG84 X20 Y0 Z-5 R2 F100\nG80\nM30")
    const drill = [...a.tools.values()].find((t) => t.operations.includes("mill/drill"))!
    expect(toolKindOf(drill.model)).toBe("drill")
    expect(drill.operations).toEqual(["mill/drill", "mill/tap"])
    expect(drill.issues).toHaveLength(1)
  })

  test("comments and decimal G codes cannot invent cycles; free cuts remain assumed", () => {
    const a = resolve("(G84 tap)\nG21 G90\nG0 Z5\nG1 X10 F100 ; G81 drill\nM30")
    expect([...a.tools.values()][0]).toMatchObject({ source: "assumed", operations: [] })
  })

  test("mill-turn live drilling uses a drill while the turning path keeps its insert", () => {
    const code = "G18 G90 G21\nT1 M6\nG0 X50 Z2\nG1 X40 F100\nG1 Z-20\nT2 M6\nG17\nG0 X20 Y10 Z5 B90 C45\nG81 Z-10 R2 F100\nG80\nM30"
    const parsed = analyseGcode(code)
    const tools = [...programTools(parsed.program, parsed.motion, code, "lathe").values()]
    expect(tools.map((tool) => tool.model.family)).toEqual(["lathe", "mill"])
    expect(tools[1]!.model).toMatchObject({ shape: "drill" })
  })
})
