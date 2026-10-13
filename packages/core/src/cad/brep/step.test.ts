import { describe, expect, setDefaultTimeout, test } from "bun:test"

// Kernel tests tessellate and integrate exact geometry; under a full-suite run the default 5 s is too short.
setDefaultTimeout(60_000)
import {
  arcControl,
  circleProfileLoop,
  extrudeProfile,
  makeBox,
  makeCone,
  makeCylinder,
  makeSphere,
  makeTorus,
  massProperties,
  parseStep,
  readStepBreps,
  rectangleProfileLoop,
  revolveProfile,
  validateBrep,
  writeStepBreps,
  type Brep
} from "./index.ts"

const PI = Math.PI
const IN = 25.4
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/**
 * Hand-written in the style CAD exporters produce: inch length unit (defined through a millimetre SI unit), degrees,
 * SEAM_CURVE with PCURVEs, planes whose ADVANCED_FACE same_sense is .F., an assembly placing the same "pin" twice with
 * ITEM_DEFINED_TRANSFORMATION, and a "cone" part on its own.
 */
const FIXTURE = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('test fixture'),'2;1');
FILE_NAME('asm.stp','2026-10-13T12:00:00',('a'),('b'),'x','y','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
/* units: inch through millimetre, degree through radian */
#40=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));
#41=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#40);
#43=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);
#42=(CONVERSION_BASED_UNIT('INCH',#41)LENGTH_UNIT()NAMED_UNIT(#43));
#44=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));
#45=PLANE_ANGLE_MEASURE_WITH_UNIT(PLANE_ANGLE_MEASURE(0.0174532925199433),#44);
#46=(CONVERSION_BASED_UNIT('DEGREE',#45)NAMED_UNIT(#43)PLANE_ANGLE_UNIT());
#49=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());
#47=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#42,'distance_accuracy_value','');
#48=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#47))GLOBAL_UNIT_ASSIGNED_CONTEXT((#42,#46,#49))REPRESENTATION_CONTEXT('Context #1','3D'));
/* pin: cylinder r = 0.5 in, h = 1 in */
#1=CARTESIAN_POINT('',(0.,0.,0.));
#2=DIRECTION('',(0.,0.,1.));
#3=DIRECTION('',(1.,0.,0.));
#4=AXIS2_PLACEMENT_3D('',#1,#2,#3);
#5=CYLINDRICAL_SURFACE('',#4,0.5);
#6=CARTESIAN_POINT('',(0.5,0.,0.));
#7=VERTEX_POINT('',#6);
#8=CARTESIAN_POINT('',(0.5,0.,1.));
#9=VERTEX_POINT('',#8);
#10=CIRCLE('',#4,0.5);
#11=CARTESIAN_POINT('',(0.,0.,1.));
#12=AXIS2_PLACEMENT_3D('',#11,#2,#3);
#13=CIRCLE('',#12,0.5);
#14=DIRECTION('',(0.,0.,1.));
#15=VECTOR('',#14,1.);
#16=LINE('',#6,#15);
#100=(GEOMETRIC_REPRESENTATION_CONTEXT(2)PARAMETRIC_REPRESENTATION_CONTEXT()REPRESENTATION_CONTEXT('2D SPACE',''));
#101=CARTESIAN_POINT('',(0.,0.));
#102=DIRECTION('',(0.,1.));
#103=VECTOR('',#102,1.);
#104=LINE('',#101,#103);
#105=DEFINITIONAL_REPRESENTATION('',(#104),#100);
#106=PCURVE('',#5,#105);
#107=CARTESIAN_POINT('',(6.28318530717959,0.));
#108=LINE('',#107,#103);
#109=DEFINITIONAL_REPRESENTATION('',(#108),#100);
#110=PCURVE('',#5,#109);
#17=SEAM_CURVE('',#16,(#106,#110),.PCURVE_S1.);
#18=EDGE_CURVE('',#7,#7,#10,.T.);
#19=EDGE_CURVE('',#9,#9,#13,.T.);
#20=EDGE_CURVE('',#7,#9,#17,.T.);
#21=ORIENTED_EDGE('',*,*,#18,.T.);
#22=ORIENTED_EDGE('',*,*,#20,.T.);
#23=ORIENTED_EDGE('',*,*,#19,.F.);
#24=ORIENTED_EDGE('',*,*,#20,.F.);
#25=EDGE_LOOP('',(#21,#22,#23,#24));
#26=FACE_OUTER_BOUND('',#25,.T.);
#27=ADVANCED_FACE('side',(#26),#5,.T.);
#28=PLANE('',#4);
#29=ORIENTED_EDGE('',*,*,#18,.F.);
#30=EDGE_LOOP('',(#29));
#31=FACE_OUTER_BOUND('',#30,.T.);
#32=ADVANCED_FACE('bottom',(#31),#28,.F.);
#33=PLANE('',#12);
#34=ORIENTED_EDGE('',*,*,#19,.T.);
#35=EDGE_LOOP('',(#34));
#36=FACE_OUTER_BOUND('',#35,.T.);
#37=ADVANCED_FACE('top',(#36),#33,.T.);
#38=CLOSED_SHELL('',(#27,#32,#37));
#39=MANIFOLD_SOLID_BREP('pin',#38);
#50=ADVANCED_BREP_SHAPE_REPRESENTATION('pin-brep',(#39,#4),#48);
#51=SHAPE_REPRESENTATION('pin',(#4),#48);
#52=SHAPE_REPRESENTATION_RELATIONSHIP('','',#51,#50);
#53=APPLICATION_CONTEXT('automotive');
#54=PRODUCT_CONTEXT('',#53,'mechanical');
#55=PRODUCT('PIN-01','Pin','',(#54));
#56=PRODUCT_DEFINITION_FORMATION('','',#55);
#57=PRODUCT_DEFINITION_CONTEXT('part definition',#53,'design');
#58=PRODUCT_DEFINITION('design','',#56,#57);
#59=PRODUCT_DEFINITION_SHAPE('','',#58);
#60=SHAPE_DEFINITION_REPRESENTATION(#59,#51);
/* assembly: two pins */
#70=SHAPE_REPRESENTATION('asm',(#4,#71,#76),#48);
#72=CARTESIAN_POINT('',(2.,0.,0.));
#71=AXIS2_PLACEMENT_3D('',#72,#2,#3);
#73=CARTESIAN_POINT('',(0.,3.,0.));
#74=DIRECTION('',(0.,-1.,0.));
#75=DIRECTION('',(1.,0.,0.));
#76=AXIS2_PLACEMENT_3D('',#73,#74,#75);
#77=ITEM_DEFINED_TRANSFORMATION('','',#4,#71);
#78=ITEM_DEFINED_TRANSFORMATION('','',#4,#76);
#79=(REPRESENTATION_RELATIONSHIP('','',#51,#70)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#77)SHAPE_REPRESENTATION_RELATIONSHIP());
#80=(REPRESENTATION_RELATIONSHIP('','',#51,#70)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#78)SHAPE_REPRESENTATION_RELATIONSHIP());
/* cone part: radius 1 in at z = 0, semi-angle 30 degrees, height 1 in */
#200=CONICAL_SURFACE('',#4,1.,30.);
#201=CARTESIAN_POINT('',(1.,0.,0.));
#202=VERTEX_POINT('',#201);
#203=CARTESIAN_POINT('',(1.57735026918963,0.,1.));
#204=VERTEX_POINT('',#203);
#205=CIRCLE('',#4,1.);
#206=CIRCLE('',#12,1.57735026918963);
#207=CARTESIAN_POINT('',(0.,0.,0.));
#208=DIRECTION('',(0.5,0.,0.866025403784439));
#209=VECTOR('',#208,1.);
#210=LINE('',#201,#209);
#211=EDGE_CURVE('',#202,#202,#205,.T.);
#212=EDGE_CURVE('',#204,#204,#206,.T.);
#213=EDGE_CURVE('',#204,#202,#210,.F.);
#214=EDGE_LOOP('',(#215,#216,#217,#218));
#215=ORIENTED_EDGE('',*,*,#211,.T.);
#216=ORIENTED_EDGE('',*,*,#213,.F.);
#217=ORIENTED_EDGE('',*,*,#212,.F.);
#218=ORIENTED_EDGE('',*,*,#213,.T.);
#219=FACE_OUTER_BOUND('',#214,.T.);
#220=ADVANCED_FACE('',(#219),#200,.T.);
#221=EDGE_LOOP('',(#222));
#222=ORIENTED_EDGE('',*,*,#211,.T.);
#223=FACE_BOUND('',#221,.F.);
#224=ADVANCED_FACE('',(#223),#28,.F.);
#225=EDGE_LOOP('',(#226));
#226=ORIENTED_EDGE('',*,*,#212,.T.);
#227=FACE_OUTER_BOUND('',#225,.T.);
#228=ADVANCED_FACE('',(#227),#33,.T.);
#229=CLOSED_SHELL('',(#220,#224,#228));
#230=MANIFOLD_SOLID_BREP('cone \\X2\\00E8\\X0\\ ''quoted''',#229);
#231=ADVANCED_BREP_SHAPE_REPRESENTATION('cone',(#230,#4),#48);
ENDSEC;
END-ISO-10303-21;
`

describe("STEP parser", () => {
  test("complex instances, comments, escaped and encoded strings", () => {
    const f = parseStep(FIXTURE)
    expect(f.records.get(42)!.parts.map((p) => p.name)).toEqual(["CONVERSION_BASED_UNIT", "LENGTH_UNIT", "NAMED_UNIT"])
    expect(f.records.get(230)!.parts[0]!.args[0]).toBe("cone è 'quoted'")
    expect(f.header.map((h) => h.name)).toEqual(["FILE_DESCRIPTION", "FILE_NAME", "FILE_SCHEMA"])
  })
  test("malformed data is a syntax error, not a silent partial read", () => {
    expect(() => parseStep("ISO-10303-21;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.;\nENDSEC;")).toThrow(SyntaxError)
  })
})

describe("STEP reader", () => {
  const r = readStepBreps(FIXTURE)
  test("units, schema and every instance of the assembly", () => {
    expect(r.warnings).toEqual([])
    expect(r.lengthScale).toBeCloseTo(25.4, 12)
    expect(r.schema).toContain("AUTOMOTIVE_DESIGN")
    expect(r.parts.map((p) => p.name).sort()).toEqual(["Pin", "Pin", "cone"])
  })
  test("pins: valid exact solids placed by their transforms (mm)", () => {
    const pins = r.parts.filter((p) => p.name === "Pin")
    const centroids = pins.map((p) => {
      const rep = validateBrep(p.brep)
      expect(rep.issues.map((i) => i.message)).toEqual([])
      const mp = massProperties(p.brep)
      expect(rel(mp.volume, PI * (0.5 * IN) ** 2 * IN)).toBeLessThan(1e-9)
      return mp.centroid
    })
    const sorted = centroids.sort((a, b) => a.x - b.x)
    // Instance 1: translated by (2, 0, 0) in; its axis stays Z.
    expect(sorted[1]!.x).toBeCloseTo(2 * IN, 8)
    expect(sorted[1]!.z).toBeCloseTo(0.5 * IN, 8)
    // Instance 2: at (0, 3, 0) in with the pin axis along −Y.
    expect(sorted[0]!.y).toBeCloseTo(3 * IN - 0.5 * IN, 8)
    expect(sorted[0]!.z).toBeCloseTo(0, 8)
    expect(pins[0]!.brep.faces.map((f) => f.name).sort()).toEqual(["bottom", "side", "top"])
  })
  test("cone with a degree semi-angle, a reversed bound and a reversed edge", () => {
    const cone = r.parts.find((p) => p.name === "cone")!.brep
    const rep = validateBrep(cone)
    expect(rep.issues.map((i) => i.message)).toEqual([])
    const r1 = IN, r2 = 1.57735026918963 * IN, h = IN
    expect(rel(massProperties(cone).volume, (PI * h / 3) * (r1 * r1 + r1 * r2 + r2 * r2))).toBeLessThan(1e-9)
    expect(cone.faces[0]!.surface.kind === "cone" && Math.abs(cone.faces[0]!.surface.semiAngle - PI / 6) < 1e-12).toBe(true)
  })
})

describe("STEP round trip", () => {
  const roundTrip = (name: string, b: Brep) => {
    const text = writeStepBreps([{ name, brep: b }], { timestamp: "2026-10-13T00:00:00" })
    const back = readStepBreps(text)
    expect(back.warnings).toEqual([])
    expect(back.parts.length).toBe(1)
    const p = back.parts[0]!
    expect(p.name).toBe(name)
    const rep = validateBrep(p.brep)
    expect(rep.issues.map((i) => i.message)).toEqual([])
    expect(rel(massProperties(p.brep).volume, massProperties(b).volume)).toBeLessThan(1e-9)
    expect(p.brep.faces.map((f) => f.surface.kind)).toEqual(b.faces.map((f) => f.surface.kind))
    expect(p.brep.faces.map((f) => f.name)).toEqual(b.faces.map((f) => f.name))
    return text
  }
  test("primitives", () => {
    roundTrip("box", makeBox(10, 20, 30))
    roundTrip("cylinder", makeCylinder(5, 10))
    roundTrip("sphere", makeSphere(7))
    roundTrip("torus", makeTorus(10, 3))
    // A narrowing cone is written with a positive semi-angle and a flipped axis.
    const t = roundTrip("frustum", makeCone(5, 2, 6))
    expect(/CONICAL_SURFACE\('',#\d+,5\.,0\.4/.test(t)).toBe(true)
  })
  test("sweeps, including rational B-spline profiles (complex entities)", () => {
    roundTrip("plate", extrudeProfile({ loops: [rectangleProfileLoop(0, 0, 40, 30), circleProfileLoop({ x: 20, y: 15 }, 6)] }, 8))
    roundTrip("ring", revolveProfile({ loops: [rectangleProfileLoop(5, 0, 8, 10)] }, PI / 2))
    const arc = arcControl(10, 0, PI)
    const blob = extrudeProfile({
      loops: [[
        { kind: "nurbs", data: { degree: 2, knots: arc.knots, points: arc.points, weights: arc.weights } },
        { kind: "line", a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }
      ]]
    }, 5)
    expect(rel(massProperties(blob).volume, (PI * 100) / 2 * 5)).toBeLessThan(1e-9)
    const text = roundTrip("half-disc", blob)
    expect(text).toContain("RATIONAL_B_SPLINE_CURVE")
  })
})
