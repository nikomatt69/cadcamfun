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

## Integration order and acceptance gates

1. **Geometry kernel Module:** preserve mesh primitives as a rendering Adapter, introduce exact topology only through a documented kernel Seam. Select a kernel based on license, Bun/Tauri deployment and deterministic STEP round trips. Gate: Boolean/fillet/shell reference parts, valid manifold topology, measured dimensions and STEP re-import equality within declared tolerance. A mesh must never masquerade as exact geometry.
2. **Manufacturing setup Module:** immutable work coordinate frame, revisioned part/stock/fixture/tool-holder geometry and machine profile. Gate: all transformations and units have round-trip tests; changes invalidate derived toolpaths and verification evidence.
3. **Verification Module** (first version implemented, spec 04 §10: height-field stock removal, rapid / shank / holder / fixture / below-stock findings, gouge against target solids, AI tool and desktop tab; 3-axis only, no swept-volume collision against the finished part or machine kinematics): consume both Toolpath IR and emitted NC through their existing Seams. Start with the real interpreter Adapter, then add stock-removal and swept cutter/holder collision tests. Gate: detect deliberate gouges, remaining stock and fixture collisions, including arcs, helices and cycles. Path animation alone is not verification.
4. **Strategy Module:** extend current Profile/Pocket/Drill/Face/Engrave only after setup and stock evidence exist; add surface finishing, rest machining and engagement-bounded roughing. Gate: independent geometric no-gouge tests, declared chord/scallop tolerances and bounded computation on benchmark parts.
5. **Machine/post Module:** preserve existing generic/Fanuc/GRBL Adapters and deterministic goldens. Add explicit machine kinematics, axis travel, safe tool changes, holder clearance and controller limits before simultaneous multi-axis strategies. Gate: emitted-NC replay agrees with intended motion, then controller simulation and supervised machine dry runs on identified machines.
6. **Desktop integration:** expose verified capability and structured failures through documented API contracts before changing sidecar/UI-owned directories. Gate: desktop project-to-export workflow tests, stale-result invalidation, cancellation and large-part responsiveness.

No new kernel dependency, pretend simulator, empty strategy or unvalidated postprocessor is introduced by this hardening. Future machine validation needs actual machine/controller profiles, fixture/tool-holder dimensions and representative reference parts. Do not describe the present application as equivalent to Fusion, hyperMILL or Mastercam until these gates have reproducible evidence.

## Verification commands

```sh
bun test packages/core
bunx tsc -p packages/core/tsconfig.json
git diff --check -- packages/core specs/03-core-cad.md specs/04-core-cam.md specs/12-professional-cad-cam.md
```

New regression tests are beside the WP-owned CAD/CAM source. Existing golden NC files and existing assertions remain unchanged.
