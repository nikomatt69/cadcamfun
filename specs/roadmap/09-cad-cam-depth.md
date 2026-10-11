# RM-09 — CAD/CAM depth (parity slice)

Status: **pending**. Depends on: RM-02 (setup grouping exists before more operations). Design: `12-professional-cad-cam.md`, `14-cad-cam-parity-roadmap.md`, `20` Phase 6. Owners: WP1 `packages/core/src/cad`, WP2 `packages/core/src/cam`.

## Problem

Mesh chamfer/fillet/shell/sweep/loft and lathe ops are cited **done** in `21` §17; still **pending**: pencil/scallop/flowline, swept-cutter collision, parametric `fillet`/`shell`/`pattern-along-path` features. `12-professional-cad-cam.md` forbids calling this Fusion/hypermill equivalent.

Keep **core** as the deep module: pure functions, existing public interface is the test surface. Desktop/sidecar only gain Schema fields after core tests exist.

Do not add a B-rep kernel in this step (license + STEP gate in spec 12 §1). Mesh must not masquerade as exact geometry.

## Effect v4

- None in hot loops. Schema at `packages/api` / AI action edges only after core functions exist.
- Units: mm and radians internally.

## Deliverables (order)

1. Swept-cutter / holder collision in `cam.verify` (findings stay tagged codes).
2. Pencil / scallop / flowline as named mill operations, drop-cutter based.
3. Parametric features `fillet`, `shell`, `pattern-along-path` in history rebuild.
4. Skill/prompt updates only after RM-01 catalogue (same commit as the core tests).

## Verify

```bash
bun test packages/core
bunx tsc -p packages/core/tsconfig.json
```

Gates from spec 12: deliberate gouge detected; no marketing claim of parity.

## Change log

- v1: next core depth slice after setups work.
