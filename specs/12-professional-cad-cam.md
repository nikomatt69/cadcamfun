# Professional CAD/CAM Architecture

Status: foundation hardening and a first verification module implemented; commercial parity not established.

## Evidence and scope

Official sources inspected on 2026-10-07:

- https://www.openmind-tech.com/en/cam/ describes hyperMILL drilling, 2.5D/3D/5-axis milling, turning, machine-specific postprocessors and simulation driven by generated NC code rather than only internal CAM data.
- https://www.mastercam.com/solutions/ describes 3-axis through simultaneous 5-axis machining, turning, mill-turn, wire EDM, Dynamic Motion toolpaths and GPU-accelerated simulation.
- Autodesk product-page requests returned HTTP 403 in the local fetch tool. Fusion claims must be backed by accessible official documentation before becoming acceptance requirements.

These are capability references, not comparative performance benchmarks or machine certifications. The existing WP1 scope explicitly excludes Boolean CSG and sketch constraints; WP2 excludes material removal, collision checking and 4/5-axis. Those exclusions conflict with broad professional parity and must be deliberately superseded in future work packages.

## Existing Modules and deepening

| Module | Existing Interface / Seam | Implemented improvement | Remaining limitation |
| --- | --- | --- | --- |
| Solid geometry | `meshOf`, `solidBounds` | Handedness-preserving axis mapping, actual torus surfaces, concave cap triangulation, ordered negative extrusion bounds, partial sweep extrema, tolerance-driven bounded subdivision | Triangle meshes are not exact B-rep solids; no STEP, Boolean, constraint or feature-history kernel |
| Drawing migration | `migrateDrawing`, `droppedEntities` | Strict current-document decode preserves entities and metadata; legacy reconstruction remains distinct | Interchange coverage and legacy formats need a larger fixture corpus |
| Drilling cycles | `expandCycle`, post emission | Shared cycle safety checks, numeric progress limits, pre-positioning lift, repeated-hole execution and dwell reset | R-plane clearance is not a fixture/tool-envelope proof |
| NC arcs | Post emission | Reject invalid geometry and unknown starts; precision-collapsed short arcs cannot accidentally become full circles | Controller-specific rounded geometry and full option validation remain |

Keep geometry and toolpath Implementation pure and I/O-free. The existing public Interface is the test surface; strengthen invariants there rather than duplicate checks in UI callers. Shared axis mapping and cycle checks improve Locality and Leverage without replacing the Bun/Effect/Solid/Tauri architecture.

## Engineering design layer (feature history, design rules, recipes)

Implemented on top of the mesh feature history (`packages/core/src/cad`), reachable by the assistant (`cad_parametric` actions `recipe`, `dfm`, `fastener`), the sidecar (same `historySchema`, no new routes) and the desktop Parametric panel (edge / corner / hole-kind controls, editors for sweep / loft / shell / fillet / grid, add-feature shortcuts, a Manufacturability section, a Recipes picker; the panel was driven in a DOM with a live store, not yet in the Tauri window):

| Capability | Where | Honest limit |
| --- | --- | --- |
| Edge chamfer / fillet of the end-face edges of an extrusion, and rounding / bevelling of sharp profile corners (`extrude.edge`, `extrude.corner`) | `profile-shape.ts`, `history.ts` | Exact on prismatic extrusions of a sketch (the profile is lofted through inset copies). Not a general B-rep fillet: edges of revolved bodies, Boolean results or arbitrary faces cannot be filleted. A radius larger than the narrowest feature is refused with the reason. |
| Draft (`extrude.taper`, degrees, + narrows towards the far end; holes in the profile lean with it) | `profile-shape.ts`, `history.ts` | Prismatic extrusions only (the profile is lofted through inset copies); not combinable with `edge`; a drafted extrusion cannot be shelled. Draft on faces of other bodies is not available. |
| Counterbore and countersink holes, `mirror` feature | `history.ts` | The mirror reflects the tool of an earlier extrude / revolve / hole / mirror; there is no mirror of a whole body or of selected faces. |
| ISO metric fastener data (ISO 262 / 273 / 4762 / 7046, DIN 974), DIN 6885 keyways, ISO 286 tolerance grades | `fasteners.ts` | Tables, not a standards library: M2 to M30 coarse thread, form A keys for 6 to 75 mm shafts. |
| Design for manufacture (`analyzeManufacturability`): internal corner radius against the cutter, pocket depth ratio, drilled-hole ratio, hole edge distance and spacing, thin walls (ray sampling), machine envelope, turned slenderness, print overhang and small holes, under-constrained sketches, literal dimensions | `dfm.ts` | Rules of thumb with overridable limits, not a simulation: it does not model fixturing, tool holders, chatter, thermal effects or the actual machine, and thin-wall sampling can miss a localised thin spot between samples. A report with no errors does not certify a part. |
| Recipes (`mounting_plate`, `flange`, `l_bracket`, `stepped_shaft`, `enclosure`, `pipe_bend`, `duct_transition`) | `recipes.ts` | Seven generators that apply the rules above and return a fully constrained history; they enforce edge distance, spacing and keyway ranges and refuse impossible inputs. `pipe_bend` is a long-radius elbow by default (`bendRadius` 1.5 x the outside diameter, 0 = mitred) and refuses a bend that needs more straight run than there is. Ribs, lids, sheet-metal bends and other families are not generated yet. |
| `sweep` (profile along an open or closed path sketch, parallel-transport frames, optional `bendRadius` that rounds the path corners into tangent pipe bends, otherwise mitre stretch at path corners, nested loops = hollow), `loft` (resampled sections matched by start point, optional Catmull-Rom smoothing) | `sweep-loft.ts`, `history.ts` | Mesh solids with real caps. The path sketch holds ONE open chain of lines / arcs or one closed loop; a closed non-planar path can twist at the seam; `bendRadius` applies to open paths and is refused when a straight run is shorter than the bend's tangent length (the volume follows Pappus: area x centre-line length). A loft uses the largest loop of each section and resamples it, so sharp corners of very different sections are softened; no guide rails or tangency conditions. |
| `shell` (hollow an extrusion, a full 360 degree revolution or a sweep; open none / top / bottom / both) | `history.ts` | Exact on those three sources: an extrusion inset profile (holes grow), a revolution profile mirrored across its axis, moved inwards and cut back to the half-plane, a sweep of the inset profile (a closed hollow stops one wall short of each path end; open = path start / end). Not available on a Boolean result, a loft, a partial revolution or a drafted extrusion, and no per-face thickness. |
| `fillet` / chamfer of selected edges of any body (`edges`: parallel to an axis, inside a box, convex / concave, minimum length) | `edge-blend.ts`, `history.ts` | Edges are recovered from planar faces that meet at 25 degrees or more, so only straight edges between planes; an edge against a curved face is not a straight line and is not blended. Planar facets that meet at a shallow angle are grouped as one curved surface (a tessellated hole, cylinder or an earlier fillet): their rim edges are flagged `curved` and left out of a default selection (`edges.curved: true` takes them, one Boolean per facet, which is slow). A radius wider than the faces is refused with the edge named. Where three EQUAL fillets meet at a right-angled convex vertex the corner is a rolling-ball sphere octant (the tricylinder left by the three edge tools is cut back to the ball); any other vertex (unequal radii, chamfers, non-orthogonal faces, concave vertices) is still a mitred overlap of the tools, not a blend patch. A rim of a round hole is therefore not filleted by this feature (use `extrude.edge` with `holes: true` on an extrusion). |
| `pattern` kind `grid` (rows x columns) | `history.ts`, `dfm.ts` | Copies the tool of an earlier extrude / revolve / hole / sweep / loft / mirror; at most 500 copies. Copies whose bounding boxes do not overlap are applied in ONE Boolean (a 3 x 2 hole grid rebuilds in milliseconds); overlapping copies fall back to one Boolean each. This applies to linear and circular patterns too. |

Still missing for the kernel gate in step 1 above: an exact B-rep (fillets against curved faces, variable radius, vertex blends other than the equal right-angled case, shell of a Boolean result or any body, draft of faces that are not an extrusion's walls, loft guide rails and tangency), exact STEP export, and assemblies with mates.

## Integration order and acceptance gates

1. **Geometry kernel Module** (a mesh CSG, a constraint sketch solver and a parametric history exist, spec 03 §7b; the gate below is NOT met: no exact B-rep, fillet, shell, or STEP round trip): preserve mesh primitives as a rendering Adapter, introduce exact topology only through a documented kernel Seam. Select a kernel based on license, Bun/Tauri deployment and deterministic STEP round trips. Gate: Boolean/fillet/shell reference parts, valid manifold topology, measured dimensions and STEP re-import equality within declared tolerance. A mesh must never masquerade as exact geometry.
2. **Manufacturing setup Module:** immutable work coordinate frame, revisioned part/stock/fixture/tool-holder geometry and machine profile. Gate: all transformations and units have round-trip tests; changes invalidate derived toolpaths and verification evidence.
3. **Verification Module** (first version implemented, spec 04 §10: height-field stock removal, rapid / shank / holder / fixture / below-stock findings, gouge against target solids, AI tool and desktop tab; 3-axis only, no swept-volume collision against the finished part or machine kinematics): consume both Toolpath IR and emitted NC through their existing Seams. Start with the real interpreter Adapter, then add stock-removal and swept cutter/holder collision tests. Gate: detect deliberate gouges, remaining stock and fixture collisions, including arcs, helices and cycles. Path animation alone is not verification.
4. **Strategy Module** (surface roughing / parallel / waterline **rest roughing from a previous tool** and **adaptive (engagement-bounded) clearing** implemented, spec 04 §12; rest finishing / pencil and thread milling implemented; still missing: stock-model rest carried between operations, 4/5-axis): extend current Profile/Pocket/Drill/Face/Engrave only after setup and stock evidence exist; add surface finishing, rest machining and engagement-bounded roughing. Gate: independent geometric no-gouge tests, declared chord/scallop tolerances and bounded computation on benchmark parts.
5. **Machine/post Module** (indexed 3+2 on a trunnion table implemented, spec 04 §13: rotary angles from the work frame, program in machine coordinates; still missing: kinematic collision checking, head-tilt machines, controller tilted-plane cycles, simultaneous 5-axis): preserve existing generic/Fanuc/GRBL Adapters and deterministic goldens. Add explicit machine kinematics, axis travel, safe tool changes, holder clearance and controller limits before simultaneous multi-axis strategies. Gate: emitted-NC replay agrees with intended motion, then controller simulation and supervised machine dry runs on identified machines.
6. **Desktop integration:** expose verified capability and structured failures through documented API contracts before changing sidecar/UI-owned directories. Gate: desktop project-to-export workflow tests, stale-result invalidation, cancellation and large-part responsiveness.

No new kernel dependency, pretend simulator, empty strategy or unvalidated postprocessor is introduced by this hardening. Future machine validation needs actual machine/controller profiles, fixture/tool-holder dimensions and representative reference parts. Do not describe the present application as equivalent to Fusion, hyperMILL or Mastercam until these gates have reproducible evidence.

## Verification commands

```sh
bun test packages/core
bunx tsc -p packages/core/tsconfig.json
git diff --check -- packages/core specs/03-core-cad.md specs/04-core-cam.md specs/12-professional-cad-cam.md
```

New regression tests are beside the WP-owned CAD/CAM source. Existing golden NC files and existing assertions remain unchanged.
