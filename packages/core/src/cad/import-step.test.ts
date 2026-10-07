import { describe, expect, test } from "bun:test"
import { closedLoops, extrudeDrawing } from "./import-drawing.ts"
import { readStepShapes } from "./import-step.ts"

const header = (unit = "SI_UNIT(.MILLI.,.METRE.)") =>
  `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n#900=(LENGTH_UNIT()NAMED_UNIT(*)${unit});\n`
const end = "ENDSEC;\nEND-ISO-10303-21;\n"
const pt = (id: number, x: number, y: number, z: number) => `#${id}=CARTESIAN_POINT('',(${x}.,${y}.,${z}.));\n`

/** A 40 x 20 x 5 plate with a Ø8 hole at (20,10): bottom face with two loops, top face. */
const plate = (unit?: string) =>
  header(unit) +
  [pt(1, 0, 0, 0), pt(2, 40, 0, 0), pt(3, 40, 20, 0), pt(4, 0, 20, 0), pt(5, 0, 0, 5), pt(6, 40, 0, 5), pt(7, 40, 20, 5), pt(8, 0, 20, 5), pt(9, 20, 10, 0), pt(10, 24, 10, 0)].join("") +
  [11, 12, 13, 14, 15, 16, 17, 18].map((v, i) => `#${v}=VERTEX_POINT('',#${i + 1});\n`).join("") +
  `#19=VERTEX_POINT('',#10);\n#20=LINE('',#1,#1);\n` +
  `#30=EDGE_CURVE('',#11,#12,#20,.T.);\n#31=EDGE_CURVE('',#12,#13,#20,.T.);\n#32=EDGE_CURVE('',#13,#14,#20,.T.);\n#33=EDGE_CURVE('',#14,#11,#20,.T.);\n#34=EDGE_CURVE('',#19,#19,#40,.T.);\n` +
  `#40=CIRCLE('',#41,4.);\n#41=AXIS2_PLACEMENT_3D('',#9,#42,#43);\n#42=DIRECTION('',(0.,0.,1.));\n#43=DIRECTION('',(1.,0.,0.));\n` +
  // outward normal is -Z, so the loop runs clockwise seen from above: 1 -> 4 -> 3 -> 2
  `#50=ORIENTED_EDGE('',*,*,#33,.F.);\n#51=ORIENTED_EDGE('',*,*,#32,.F.);\n#52=ORIENTED_EDGE('',*,*,#31,.F.);\n#53=ORIENTED_EDGE('',*,*,#30,.F.);\n#54=ORIENTED_EDGE('',*,*,#34,.T.);\n` +
  `#60=EDGE_LOOP('',(#50,#51,#52,#53));\n#61=EDGE_LOOP('',(#54));\n#62=FACE_OUTER_BOUND('',#60,.T.);\n#63=FACE_BOUND('',#61,.T.);\n` +
  `#70=ADVANCED_FACE('',(#62,#63),#71,.F.);\n#71=PLANE('',#72);\n#72=AXIS2_PLACEMENT_3D('',#1,#42,#43);\n` +
  `#75=ADVANCED_FACE('',(),#76,.T.);\n#76=PLANE('',#77);\n#77=AXIS2_PLACEMENT_3D('',#5,#42,#43);\n` +
  end

describe("STEP prismatic reader", () => {
  test("a plate with a round hole becomes a solid and a hole of the right size", () => {
    const step = readStepShapes(plate())
    expect(step.warnings).toEqual([])
    expect(step.height).toBe(5)
    expect(step.zMin).toBe(0)
    const loops = closedLoops(step.shapes)
    expect(loops.loops).toHaveLength(1)
    expect(loops.loops[0]!.area).toBeCloseTo(800, 6)
    expect(loops.circles).toEqual([{ center: { x: 20, y: 10 }, radius: 4 }])
    const built = extrudeDrawing(step.shapes, { depth: step.height, baseZ: step.zMin })
    expect(built.stats).toMatchObject({ solids: 1, holes: 1 })
    expect(built.elements.find((e) => e["type"] === "boolean-subtract")!["operands"]).toEqual([0, 1])
  })

  test("inches and metres are converted to millimetres", () => {
    const inch = readStepShapes(plate("CONVERSION_BASED_UNIT('INCH',#1)"))
    expect(inch.scale).toBe(25.4)
    expect(inch.height).toBeCloseTo(127, 6)
    expect(readStepShapes(plate("SI_UNIT($,.METRE.)")).height).toBeCloseTo(5000, 6)
  })

  test("a part modelled with Y up is stood on its flat side", () => {
    // The same plate with y and z swapped: its thickness is along Y.
    const swapped = plate().replace(/CARTESIAN_POINT\('',\((\d+)\.,(\d+)\.,(\d+)\.\)\)/g, (_m, x, y, z) => `CARTESIAN_POINT('',(${x}.,${z}.,${y}.))`).replace("#42=DIRECTION('',(0.,0.,1.))", "#42=DIRECTION('',(0.,1.,0.))").replace("#43=DIRECTION('',(1.,0.,0.))", "#43=DIRECTION('',(1.,0.,0.))")
    expect(readStepShapes(swapped).shapes).toHaveLength(0)
    const stood = readStepShapes(swapped, { up: "y" })
    expect(stood.height).toBeCloseTo(5, 6)
    expect(closedLoops(stood.shapes).loops[0]!.area).toBeCloseTo(800, 4)
  })

  test("an arc in the outline follows the right side", () => {
    const text = header() +
      [pt(1, 0, 0, 0), pt(2, 10, 0, 0), pt(3, 10, 10, 0), pt(4, 0, 10, 0), pt(5, 0, 0, 3), pt(6, 10, 5, 0)].join("") +
      "#11=VERTEX_POINT('',#1);\n#12=VERTEX_POINT('',#2);\n#13=VERTEX_POINT('',#3);\n#14=VERTEX_POINT('',#4);\n#15=VERTEX_POINT('',#5);\n#20=LINE('',#1,#1);\n" +
      "#30=EDGE_CURVE('',#11,#12,#20,.T.);\n#31=EDGE_CURVE('',#12,#13,#40,.T.);\n#32=EDGE_CURVE('',#13,#14,#20,.T.);\n#33=EDGE_CURVE('',#14,#11,#20,.T.);\n" +
      "#40=CIRCLE('',#41,5.);\n#41=AXIS2_PLACEMENT_3D('',#6,#42,#43);\n#42=DIRECTION('',(0.,0.,1.));\n#43=DIRECTION('',(1.,0.,0.));\n" +
      // clockwise from above: A -> D -> C -> (arc, reversed) B -> A
      "#50=ORIENTED_EDGE('',*,*,#33,.F.);\n#51=ORIENTED_EDGE('',*,*,#32,.F.);\n#52=ORIENTED_EDGE('',*,*,#31,.F.);\n#53=ORIENTED_EDGE('',*,*,#30,.F.);\n" +
      "#60=EDGE_LOOP('',(#50,#51,#52,#53));\n#62=FACE_OUTER_BOUND('',#60,.T.);\n#70=ADVANCED_FACE('',(#62),#71,.F.);\n#71=PLANE('',#72);\n#72=AXIS2_PLACEMENT_3D('',#1,#42,#43);\n" + end
    const step = readStepShapes(text, { tolerance: 0.001 })
    const area = closedLoops(step.shapes, { tolerance: 0.001 }).loops[0]!.area
    // 10 x 10 square with the right edge bulged out by a half disc of radius 5.
    expect(area).toBeCloseTo(100 + (Math.PI * 25) / 2, 1)
  })

  test("what a prism cannot say is reported", () => {
    const text = plate().replace("#75=ADVANCED_FACE('',(),#76,.T.);", "#75=ADVANCED_FACE('',(),#76,.T.);\n#80=ADVANCED_FACE('',(),#81,.T.);\n#81=CYLINDRICAL_SURFACE('',#41,4.);")
    expect(readStepShapes(text).warnings.join(" ")).toContain("1 curved or free-form face")
    expect(readStepShapes("not a step file").warnings[0]).toContain("No STEP entities")
    expect(readStepShapes(header() + pt(1, 0, 0, 0) + end).warnings[0]).toContain("no vertices")
  })
})
