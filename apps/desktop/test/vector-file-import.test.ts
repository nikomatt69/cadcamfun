import { describe, expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { vectorFileElements } from "../src/features/cad/lib/vector-file-import.ts"

const dxf = (entities: string, unit = 4): string => `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${unit}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
const line = (x: number): string => `0\nLINE\n8\noutline\n10\n0\n20\n0\n11\n${x}\n21\n0\n`
const point = (element: Record<string, unknown>, which: 1 | 2) => [element[`x${which}`], element[`y${which}`]]

describe("vector CAD import", () => {
  test("DXF converts declared inch units and preserves open lines and layer provenance", async () => {
    const result = await vectorFileElements(new File([dxf(line(2), 1)], "part.dxf"))
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0]).toMatchObject({ type: "line", sourceLayer: "outline", x1: 0, y1: 0, x2: 50.8, y2: 0 })
    expect(result.warnings.join(" ")).toContain("active CAD layer")
  })

  test("DXF approximates arcs as connected segments and reports unsupported entities", async () => {
    const arc = `0\nARC\n8\n0\n10\n0\n20\n0\n40\n10\n50\n0\n51\n90\n`
    const unknown = `0\nINSERT\n8\n0\n2\nblock\n`
    const result = await vectorFileElements(new File([dxf(arc + unknown)], "part.DXF"))
    expect(result.elements.length).toBeGreaterThan(2)
    expect(point(result.elements[0]!, 1)[0]).toBeCloseTo(10, 8)
    expect(point(result.elements.at(-1)!, 2)[1]).toBeCloseTo(10, 8)
    expect(result.warnings.join(" ")).toMatch(/INSERT/)
    expect(result.warnings.join(" ")).toMatch(/not exact curves/)
  })

  test("SVG physical viewBox size and offset become millimetres with Y flipped", async () => {
    installDom()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="10 20 100 50"><line x1="10" y1="20" x2="110" y2="70"/><text x="1" y="2">ignored</text></svg>`
    const result = await vectorFileElements(new File([svg], "drawing.svg"))
    expect(result.elements).toHaveLength(1)
    expect(point(result.elements[0]!, 1)).toEqual([0, 0])
    expect(point(result.elements[0]!, 2)).toEqual([100, -50])
    expect(result.warnings.join(" ")).toContain("text")
  })

  test("SVG default pixels, anisotropic viewBox, closed curves and approximation warning", async () => {
    installDom()
    const simple = await vectorFileElements(new File([`<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="96" y2="0"/></svg>`], "line.svg"))
    expect(simple.elements[0]!.x2 as number).toBeCloseTo(25.4, 10)
    const ellipse = await vectorFileElements(new File([`<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 10 10" preserveAspectRatio="none"><circle cx="5" cy="5" r="5"/></svg>`], "shape.svg"))
    expect(ellipse.elements.length).toBeGreaterThan(8)
    const starts = ellipse.elements.map((e) => point(e, 1)) as number[][]
    expect(Math.max(...starts.map((p) => p[0]!))).toBeCloseTo(20, 3)
    expect(Math.abs(Math.min(...starts.map((p) => p[0]!)))).toBeLessThanOrEqual(0.01)
    expect(Math.abs(Math.max(...starts.map((p) => p[1]!)))).toBeLessThanOrEqual(0.01)
    expect(Math.abs(Math.min(...starts.map((p) => p[1]!)) + 10)).toBeLessThanOrEqual(0.01)
    expect(ellipse.warnings.join(" ")).toMatch(/not exact curves/)
  })

  test("rejects empty, unsupported and invalid geometry instead of reporting success", async () => {
    installDom()
    await expect(vectorFileElements(new File(["bad"], "broken.dxf"))).rejects.toThrow(/DXF/i)
    await expect(vectorFileElements(new File([dxf(line(2)).replace("0\nEOF\n", "")], "truncated.dxf"))).rejects.toThrow(/EOF/)
    await expect(vectorFileElements(new File([dxf(line(2), 2)], "feet.dxf"))).rejects.toThrow(/Unsupported \$INSUNITS/)
    await expect(vectorFileElements(new File(["<svg><text>nothing</text></svg>"], "empty.svg"))).rejects.toThrow(/no supported geometry/i)
    await expect(vectorFileElements(new File([`<svg><circle cx="0" cy="0" r="5" transform="scale(2 3)"/></svg>`], "scaled.svg"))).rejects.toThrow(/transforms are not supported/)
    await expect(vectorFileElements(new File([`<svg><line x1="2mm" x2="3"/></svg>`], "units.svg"))).rejects.toThrow(/unitless/)
  })
})
