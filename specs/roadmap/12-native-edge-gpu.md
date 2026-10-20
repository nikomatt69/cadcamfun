# RM-12 — Native edge and GPU (heavy loads without regressions)

Status: **pending**. Depends on: RM-01. Design: [`36-native-edge-and-gpu.md`](../36-native-edge-and-gpu.md), [`32-machine-simulation-parity.md`](../32-machine-simulation-parity.md), [`23-ai-runtime-architecture.md`](../23-ai-runtime-architecture.md). Owners: WP5 `apps/desktop/src-tauri`; WP6 `apps/desktop/src/viewport`; WP3 `packages/api/src/groups` plus `packages/api/src/index.ts`; WP4 `apps/sidecar/src/http` plus `apps/sidecar/src/layers.ts`; **new** WP `packages/buffer`.

## Problem

The desktop is slow with real parts, and the cost is measured, not guessed. A 1 M-move program spends ≈400 MB of
JavaScript heap on one object per move (`apps/desktop/src/viewport/view3d/playback.ts:3`,
`packages/core/src/cam/viewer/timeline.ts:15`), draws one mesh and one canvas texture per toolpath point
(`apps/desktop/src/viewport/view3d/view3d.tsx:589`), rebuilds the "only what has run" range on the CPU
(`view3d.tsx:698`), and tessellates B-rep plus boolean CSG on the UI thread
(`apps/desktop/src/features/cad/lib/createThreeObject.ts:46`, `:126`). The wire carries JSON where a packed buffer
would do.

**Deletion test:** deleting the packed-buffer module would force every consumer to re-invent a byte layout, and
deleting the renderer seam would force the WebGPU evaluation to fork the viewport. The module concentrates a
contract that three consumers would otherwise duplicate.

**Leverage:** one buffer format serves the sidecar (encode), the desktop (decode) and a future native edge
service. **Locality:** the backend choice and the fallback live in one factory, not in every call site.

## What this step is not

Not a CAD/CAM kernel in Rust, not a native B-rep kernel, not a `wgpu` rewrite of the viewport. The kernel stays
pure TypeScript in `packages/core` (`14-cad-cam-parity-roadmap.md:152`); RM-09 owns the CAD/CAM depth slice.

## Deliverables (order inside this step)

### 0 — Measure

1. `scripts/bench/` — a harness that runs a load on a recorded configuration and writes a JSON report with
   `p50`, `p95`, sample count, warm/cold, OS and hardware (the shape `specs/ai/09-evaluation-and-observability.md:46`
   asks for).
2. `bench/corpus/` — small, committed, real inputs (G-code, CAM programs, meshes).
3. `bench/baseline.json` — the committed reference numbers, and a check that fails above a **20 %** regression.
4. `packages/buffer` — the pure module: layout, encode, decode, typed-array views. Tests on the interface:
   round trip, version rejection, truncation rejection, invariant checks.

### 1 — Packed buffers on the wire and in the viewport

5. `packages/api/src/groups/cam-buffer.ts` — a `CamBufferGroup` whose success schema is a binary payload, plus the
   one-line registration in `packages/api/src/index.ts` (shared file: small edit, re-read immediately before).
6. `apps/sidecar/src/http/cam-buffer.ts` — the route, returning `application/octet-stream`, plus the one-line
   registration in `apps/sidecar/src/layers.ts` (shared file: small edit). The existing JSON routes keep working.
7. `apps/desktop/src/viewport/view3d/buffer-client.ts` — fetch the binary route with the bearer token and wrap the
   `ArrayBuffer` in the package's views (no copy).
8. `apps/desktop/src/viewport/view3d/playback.ts` — the playback becomes typed arrays over the package's layout.
   The `packages/core` timeline keeps its shape; the desktop derives its own typed structure from the program, so
   the core's public interface is untouched.

### 2 — The GPU path

9. `apps/desktop/src/viewport/view3d/renderer.ts` — the `Renderer` interface, the `WebGl2Renderer` adapter
   (**default and only wired**) and the `WebGpuRenderer` adapter (explicit opt-in only).
10. The playhead becomes a **uniform** instead of a draw range, in both adapters.
11. Overlays become **instanced**: one draw call for the whole set, and no canvas texture per point.
12. The stock height field moves to a compute path where the backend offers one; the WebGL2 adapter keeps the
    current CPU path.
13. B-rep tessellation and boolean CSG move off the UI thread into the existing mesh Worker.

### 3 — The Rust side

14. `apps/desktop/src-tauri/src/child.rs` — the supervision of a child process extracted from `sidecar.rs` into a
    generic module: spawn, ready handshake, restart budget, graceful shutdown, reaping. **Behaviour does not
    change**: the same protocol, the same timeouts, the same tests.
15. `sidecar.rs` becomes the Bun-sidecar adapter of that module. The rule "two adapters make a real seam" is met
    by the native edge service that RM-13 adds.

## Effect v4

- The sidecar route wraps a pure core function; a throw becomes a tagged error, never a 500 with a stack trace.
- `packages/buffer` and `packages/core` stay pure: no Effect, no I/O.
- The desktop decodes with the package's own decoder; no `JSON.parse` on the hot path.

## Out of scope

- A native edge service, any `wgpu`/`napi`/FFI dependency, and any new native crate (RM-13, ruled by
  `36-native-edge-and-gpu.md` §7).
- Moving `cam.kernel.runJob` off the sidecar's event loop (`35-ai-performance-audit.md` §6 phase 2 item 7) — named
  here as the first follow-up, not delivered here.
- Any change to the core kernel's public interface, and any change to `packages/core/src/cam`.

## Verify

```bash
bun check -p packages/buffer/tsconfig.json
bun check -p packages/api/tsconfig.json
bun check -p apps/sidecar/tsconfig.json
bun check -p apps/desktop/tsconfig.json
bun test packages/buffer packages/api apps/sidecar apps/desktop
cd apps/desktop/src-tauri && cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test --all-features
```

Gates: the bench check reports no regression above 20 % against `bench/baseline.json`; the 1 M-move heap budget of
`36-native-edge-and-gpu.md` §5.3 is met; the WebGL2 and WebGPU golden screenshots agree; the Rust suite is
unchanged in behaviour (the same number of tests, the same protocol).

## Change log

- v1: published with `36-native-edge-and-gpu.md`. Measure first, then packed buffers, then the GPU path, then the
  Rust supervisor extraction. The native edge service is deliberately deferred to RM-13.

- 2026-10-20: Owner separately requested Rust/Tauri hardening, then explicit API/client regeneration
  and completion of the already-started playback callers. Those additive integrations are recorded
  in spec 07 and spec 36. Packed format v2 preserves f64 playback precision. This row stays pending: its
  F0 baseline, binary HTTP transport and F2 visual/performance gates are not completed by that slice.
