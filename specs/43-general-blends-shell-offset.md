# 43 — General blends, vertex blends, shell and offset of any body

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C3, C5, K2 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP1 (`cad/brep/{blend,shell,draft}.ts`, new `offset.ts` in `cad/brep`). Depends on
[42](42-kernel-robustness-booleans.md) (SSI, tangent contact) and [44](44-surface-modelling.md) (surface offset).

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- `blendBrep`/`blendCandidates`: constant fillet / chamfer of **straight edges** and **coaxial rims** (plane, cylinder, cone),
  chamfer with two distances or distance-angle, variable radius along a straight edge between two planes
  (`variableFillet`, circular cross-section law), equal right-angled vertex blend, sphere-plane and cone-plane rim blends.
- Refused with a reason: rims between two curved faces, tangent chains, non-coaxial curved edges (pipe T-junction), setbacks,
  blend junctions, trimmed caps.
- `shellBrep(brep, wall, { open })`: extrusions, full revolutions, sweeps. Refused for a Boolean result, a partial revolution,
  per-face thickness.
- `cad/brep/offset.test.ts` exists; `cad/offset.ts` (458 lines) is the 2D/mesh offset.

## 2. Work items

### 2.1 Blends

| ID | Item | Gate |
|---|---|---|
| B1 | **Rolling-ball fillet between any two faces** (analytic or NURBS). Spine = SSI of the two faces offset by r (spec 42 R5); contact curves = projection of the spine onto each face; blend surface = rolling-ball sweep as a rational/NURBS surface with exact circular section where both faces are analytic (cylinder–cylinder, cylinder–plane skew, cone–cylinder, sphere–cylinder, torus). | cylinder branch meeting a cylinder run at 90° (pipe T): valid B-rep, volume equals numerical integral of the rolling-ball section to 1e-4 relative, contact-curve normals match both faces to 1e-6 rad, STEP read back at 0.1 % |
| B2 | **Tangent chains.** Propagate the blend along edges tangent to the selected one (G1 chain) with automatic selection and optional "no propagation". | box with a rounded top outline: selecting one edge fillets the closed tangent loop; volume to 1e-9 against the analytic section |
| B3 | **Vertex blends** where 3 blended edges meet: setback (corner patch with a distance), and a smooth corner patch (NURBS, G1 to the three blends) for unequal radii and non-orthogonal corners; 4+ edges via the n-sided patch of spec 44 S4. | box corner with radii 2/3/4: valid, G1 across the patch (angle ≤ 1e-3 rad at 100 samples per boundary), volume within the bound of the patch |
| B4 | **Variable radius on curved edges** and with several control points (radius table over the edge parameter; linear or smooth law) and conic / curvature-continuous (G2) blend cross-sections as an option (`rho` parameter). | variable fillet on a circular edge with radii 1→3→1: continuity of the radius at control points, volume matches numeric integration to 1e-4 |
| B5 | **Face fillet and full-round fillet.** Blend between two non-adjacent faces / over a thin face (the middle face is consumed). | full round over a 2 mm rib: result width 2 mm, radius 1 mm |
| B6 | **Setback / corner chamfer** at convex and concave vertices for chamfers and fillets. | defined distance reproduced; valid solid |
| B7 | **Blend repair.** When the blend runs off a face (overflow), cap it by rolling over the neighbouring face (the SolidWorks "overflow" behaviours) or refuse with the face id. | overflow cases from the existing refusal list now succeed or refuse with ids |

Rules unchanged: the chosen radius is applied exactly or the operation refuses with a reason and leaves the body unchanged;
blend candidates are selected by refs (spec 41), not by box.

### 2.2 Offset and shell

| ID | Item | Gate |
|---|---|---|
| O1 | **Exact offset of analytic faces**: plane → plane, cylinder radius ± d, cone, sphere, torus (minor radius ± d), revolution / extrusion of an offset curve; neighbour re-intersection and edge reconstruction; inner offset collapse detection (radius < d). Lives in `cad/brep/offset.ts`. | box with a bore offset by 1 mm: analytic volume to 1e-9; collapsing radius → refusal naming the face |
| O2 | **NURBS surface offset with declared tolerance** (approximation by interpolation / least squares on a grid with adaptive refinement; result carries `maxError`); self-intersection and cusp detection (offset > local curvature radius). Shared with spec 44 S2. | offset of a bicubic patch at 0.5 mm: `maxError ≤ 1e-3` (target default) measured on a 50×50 sample against the ideal normal offset; offset beyond curvature radius is refused |
| O3 | **Shell of any body**: inward / outward offset of all faces, removal of open faces, trimming and healing via Booleans (cavity = offset body; result = body − cavity), handles Boolean results, lofts, partial revolutions. | shell of (box ∪ cylinder boss) with the top open: volume = V − V(offset body) to 1e-6 relative; wall thickness measured by `minimumDistance` equals the request within 1e-6 |
| O4 | **Per-face thickness** (multi-thickness shell) and **thicken** of surface bodies (spec 44). | two faces at 3 mm, rest 2 mm: wall distances verified per face |
| O5 | **Inside corner handling**: sharp inner offsets create fillets of radius 0 (kept sharp) or are rounded by `cornerStyle: "sharp" | "round"`. | the two styles give the analytic volumes |

## 3. Interfaces

```ts
blendBrep(b, refs: Ref[], spec: { radius: number | RadiusLaw; style: "fillet" | "chamfer" | "conic" | "full-round"; chain?: boolean; setback?: number }): BlendResult   // adds provenance (spec 41)
shellBrep(b, { wall: number | Map<Ref, number>; open: Ref[]; direction: "in" | "out"; cornerStyle })
offsetBrep(b, d, { faces?: Ref[] }): { brep: Brep, maxError: number }   // 0 for analytic faces
```

All results are `Brep | Refusal`; `Refusal = { reason: string, faces?: Ref[] }`. The history features (`fillet`, `shell`, new
`offset`) accept refs and expose the radius law; AI schema adds parameter names only (prompt budget).

## 4. Honest limits

- A blend between NURBS faces is approximated with a declared `maxError`; analytic–analytic is exact.
- Offsets with local radius smaller than the offset distance are refused, never clipped silently.
- Class-A curvature-continuous blends beyond the `conic`/G2 option are not promised.

## 5. Order

O1 → B1 (analytic pairs) → B2 → O3 → B3 → B4 → B5/B6 → O2 → O4 → B7. U3 of spec 40 turns the mesh-only cell exact once B1 lands.
