# Industrial standards and design rules

Reference for a part that has to look and behave like a professional one. These are starting values from the standards and common shop practice; a value from the user, the material library or the machine always wins, and a stress, deflection or fatigue claim is never made from them.

The values below are condensed from these editions: ISO 2768-1:1989 and ISO 2768-2:1989, ISO 286-1:2010 and ISO 286-2:2010, ISO 15:2017, ISO 21920-2:2021 and ISO 1302:2002, ISO 273:1979, ISO 4762:2004, ISO 10642:2004, DIN 76-1:2016, DIN 6885-1:1968, ISO 54:1996. They are design starting points; for a contract drawing the edition the customer names, and the standard itself, decide.
## General tolerances, ISO 2768-1 (linear, +/- mm)
| Range (mm) | f fine | m medium | c coarse | v very coarse |
| --- | --- | --- | --- | --- |
| 0.5-3 | 0.05 | 0.1 | 0.2 | - |
| 3-6 | 0.05 | 0.1 | 0.3 | 0.5 |
| 6-30 | 0.1 | 0.2 | 0.5 | 1.0 |
| 30-120 | 0.15 | 0.3 | 0.8 | 1.5 |
| 120-400 | 0.2 | 0.5 | 1.2 | 2.5 |
| 400-1000 | 0.3 | 0.8 | 2.0 | 4.0 |
ISO 2768-2 adds the geometric classes H, K, L for straightness, flatness, perpendicularity, symmetry and run-out. Default: 2768-mK for machined parts, f for precision parts, c for sheet metal and welded work.

## Fits (ISO 286, hole basis)
- H7/f7 free running, H7/g6 sliding, H7/h6 locating clearance, H7/k6 transition (light tap), H7/n6 and H7/p6 interference (press), H7/s6 shrink or heavy press.
- Shaft basis (h6, h7 shafts) only when one shaft carries several parts with different fits.
- Capability by process: rough milling IT11-IT12, finish milling IT8-IT10, turning IT7-IT8, boring IT6-IT7, reaming IT7, grinding IT5-IT6, honing IT5. The grade tables are in the `precision-and-tolerances` skill.
- Rolling bearings (ISO 15): housing bore H7, shaft k5 or m5 when the inner ring turns with the load, j5 or h5 when it floats; shoulder height at least the bearing's minimum shoulder, never up to the inner ring's full face.

## Surface finish, Ra (ISO 21920 / ISO 1302)
Rough milling 6.3 um, finish milling 1.6-3.2 um, turning 0.8-3.2 um, reaming 0.8-1.6 um, ground 0.2-0.8 um, honed 0.1-0.4 um. Seal and bearing seats 0.4-0.8 um; do not specify a finer finish than the function needs, it costs.

## Threads and fasteners
| Size | Pitch (coarse) | Tap drill | Clearance fine / medium / coarse (ISO 273) | Cap screw head D x height (ISO 4762) |
| --- | --- | --- | --- | --- |
| M3 | 0.5 | 2.5 | 3.2 / 3.4 / 3.6 | 5.5 x 3 |
| M4 | 0.7 | 3.3 | 4.3 / 4.5 / 4.8 | 7 x 4 |
| M5 | 0.8 | 4.2 | 5.3 / 5.5 / 5.8 | 8.5 x 5 |
| M6 | 1.0 | 5.0 | 6.4 / 6.6 / 7 | 10 x 6 |
| M8 | 1.25 | 6.8 | 8.4 / 9 / 10 | 13 x 8 |
| M10 | 1.5 | 8.5 | 10.5 / 11 / 12 | 16 x 10 |
| M12 | 1.75 | 10.2 | 13 / 13.5 / 14.5 | 18 x 12 |
| M16 | 2.0 | 14 | 17 / 17.5 / 18.5 | 24 x 16 |
- Counterbore for a cap screw: head diameter + 1 mm, depth head height + 0.5 mm. Countersunk screws: 90 degrees (ISO 10642), head diameter about 2 x D.
- Thread engagement 1.0 x D in steel, 1.5 x D in aluminium, 2 x D in plastic; a blind tapped hole is drilled 1.5 x D deeper than the thread (plus the point). Thread relief per DIN 76. Edge distance at least 1.5 x D from hole centre, hole spacing at least 2.5 x D.
- Read the real numbers with `cad` action `parametric_fastener` and put the holes in with the `hole` feature, then check `cad` action `assembly` for fasteners still missing.

## Standard parts and preferred sizes
- Preferred numbers ISO 3 (R10): 1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10 and the decades; use them for free dimensions.
- Gear modules ISO 54: 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20; pressure angle 20 degrees; at least 17 teeth without profile shift.
- Parallel keys DIN 6885 form A (shaft D to key b x h): 8-10: 3 x 3, 10-12: 4 x 4, 12-17: 5 x 5, 17-22: 6 x 6, 22-30: 8 x 7, 30-38: 10 x 8, 38-44: 12 x 8, 44-50: 14 x 9; key depth in the shaft about 0.6 x h.
- Edges: break all sharp edges (ISO 13715) 0.2-0.5 x 45 degrees; chamfer the lead-in of every bore and shaft end.

## Design for the process
- **Milling**: inside corner radius above the cutter radius (aim for 1.3 x); pocket depth at most 4 x cutter diameter, 6-8 x with a long tool at reduced data; milled wall at least 1.5 mm, 0.8 mm absolute minimum in aluminium; no square internal corners or blind features a tool cannot reach; one clamping where features share a tolerance.
- **Drilling**: depth at most 5 x diameter for a standard drill, peck from 3 x, deep-hole drill beyond 10 x; flat-bottom holes cost a second tool; the drill exits perpendicular to the surface.
- **Turning**: unsupported length at most 3 x diameter, up to 8 x with a tailstock; give shoulders a fillet at least 0.4 mm; groove width at least 1.5 x the insert width; faces for chucking at least 10 mm.
- **Sheet metal**: inside bend radius at least the thickness (steel) or 1-2 x (aluminium); flange at least 4 x thickness; bend relief at least the thickness; hole centre at least 2.5 x thickness + bend radius from a bend; K-factor 0.33 (tight) to 0.5.
- **Cast and moulded**: uniform wall (2-4 mm moulded plastic, 3-6 mm cast aluminium), draft 1-3 degrees, outside fillet at least 0.5 x wall, rib thickness 50-60% of the wall, no sharp inside corners.
- **FDM print**: wall at least 2 x nozzle (0.8 mm), overhangs under 45 degrees stand unsupported, holes undersized by 0.2-0.4 mm.

## Materials (designation, density; the library's value wins)
EN AW-6082 aluminium 2.70 g/cm3, EN AW-7075 2.81, S235JR steel 7.85, C45 / 1.0503 7.85, 1.4301 (AISI 304) 7.9, 1.2379 tool steel 7.7, Ti-6Al-4V 4.43, brass CuZn39Pb3 8.4, PA6 1.14, POM 1.41. Machining groups per ISO 513: P steel, M stainless, K cast iron, N non-ferrous, S heat-resistant and titanium, H hardened.

## In the report
State the standard behind each choice in a few words ("fit H7/g6 on the pin, ISO 2768-mK elsewhere, M6 clearance 6.6 per ISO 273"), list the assumptions, and say that the part is dimensioned by rule, not analysed.
