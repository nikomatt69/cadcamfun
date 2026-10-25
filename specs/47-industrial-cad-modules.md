# 47 — Industrial CAD modules: sheet metal, weldments, mold tools

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C10 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP1 (`cad/sheet-metal.ts`, new `cad/weldment.ts`, `cad/mold.ts`). Depends on
[41](41-persistent-topological-naming.md) and [43](43-general-blends-shell-offset.md).

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- `sheet-metal.ts` (296 lines): `sheetOutline`, `thickenPath`, `withHems`, `withEdgeFlanges`, `edgeFlangeReliefs`; history `sheet`
  feature (base flange + hems + edge flanges, exact in `history-brep.ts`); `flatPatternDxf` exists in core; per spec 33 it is
  reachable from the parametric report and the desktop panel (developed length, bend count, DXF per sheet feature).
- No weldment, structural-member, cut-list or mold module exists in core (`grep` for parting line / core / cavity found nothing).

## 2. Sheet metal

| ID | Item | Gate |
|---|---|---|
| SM1 | **Sheet-metal body model.** A sheet body = thickness, material, K-factor / bend allowance table, default bend radius, relief and corner style; the model keeps *bend* and *flat face* entities (so unfold can address them). | a bent L: bend line, radius, angle and allowance reported; BA = θ(R+K·T) to 1e-9 |
| SM2 | **Flange on any edge**, with angle, length (inside / outside / tangent), position (material inside / outside / bend outside), bend radius, miter at neighbours; **contour flange** (a profile swept along an edge chain); **jog, hem (all kinds), tab, bridge, lofted bend**. | flange on a free edge: exact B-rep, valid, bend radius and length as requested; mitered corner closes without gap |
| SM3 | **Corner relief and closure**: rectangular, circular, bend relief, tear, 2-bend corner, closed corner, butt / overlap, with gap parameter; automatic selection by rule (width ratio). | closed corner leaves the requested gap ±1e-6 mm |
| SM4 | **Unfold of a 3D sheet part** (multi-bend, with forming features marked as non-unfolded), producing a flat body with bend lines (up/down, angle, radius), cut-outs mapped, and `refold`. | `refold(unfold(p))` reproduces the body within 1e-6 mm at 200 sampled points; developed length of an S-bend equals Σ (flat + BA) |
| SM5 | **Flat pattern output**: DXF with bend lines on their own layer and annotation, plus the nesting-ready outline; bend table (angle, radius, direction, deduction) in the BOM / drawing. | DXF read back: outline area equals analytic flat area |
| SM6 | **Forming tools** (louver, lance, bead, extruded hole) from a library of parametric tools, exact. | each tool valid and its flat pattern keeps it as a mark |
| SM7 | **Sheet-metal rules for DFM** (min flange length ≥ 4 T + R, hole-to-bend ≥ 2.5 T + R, relief depth) added to `dfm.ts`. | violation fixtures flagged with the rule id |

## 3. Weldments and structural members

| ID | Item | Gate |
|---|---|---|
| W1 | **Profile library** (ISO / EN / ASME: square / rectangular / round tube, angle, channel, I-beam, flat bar) as parametric sketches with size tables; custom profile from a sketch. | 20×20×2 square tube area equals closed-form including corner radii |
| W2 | **Structural members along sketch paths** (lines / arcs, 3D sketch from spec 45 K4) with rotation, offset, corner treatment: miter, butt, trim to a face or another member. | a rectangular frame of four members mitered at 45°: volumes equal the analytic mitre prism; no interference at the joints |
| W3 | **End caps, gussets, weld beads** (fillet / groove weld features with symbol data), **cut list** (grouping by profile, length, angle cuts) and weld table. | cut list lengths match analytic member lengths; table emits ISO 2553 symbol data for drawings (spec 49) |

## 4. Mold and die tools

| ID | Item | Gate |
|---|---|---|
| MT1 | **Draft analysis** (uses spec 44 A1) and **undercut detection** along a pull direction: faces with negative draft, side-action regions as face sets with refs. | a drafted box: no undercut; a cross-hole: the hole's walls are flagged |
| MT2 | **Parting line** (silhouette loop along the pull direction, or user-chosen edges) and **parting surface** (extruded / ruled / tangent surface from the loop, spec 44 S3/S5). | box with a boss: the parting loop is the outer outline, surface valid |
| MT3 | **Core / cavity split** by Boolean (a block − part; split block with the parting surface), shut-off surfaces for through holes, **shrinkage scale** (non-uniform per axis), runner / gate stubs as simple features. | core ∪ cavity ∪ part = block exactly (volumes to 1e-8); parts separate along the pull direction without interference |

## 5. Honest limits

- Forming simulation (springback, thinning) is FEA territory and not promised here.
- Weldment structural analysis uses spec 48 beams only when that spec's beam elements land.
- Mould flow, cooling design and ejector systems are not included.

## 6. Order

SM1 → SM2 → SM3 → SM4 → SM5 → W1 → W2 → MT1 → MT2 → MT3 → SM6/SM7 → W3.
