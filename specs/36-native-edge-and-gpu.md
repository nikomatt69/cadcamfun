# Native Edge and GPU — heavy CAD/CAM loads without regressions

Status: **design contract; packed playback and native display integration partially implemented; F0/F2 gates remain open**. Requested by the owner on 2026-10-20, after the Rust-shell
review of `apps/desktop/src-tauri` and the measured load analysis of the CAD/CAM viewport.

This spec owns the **contracts** of three seams that move heavy CAD/CAM work off the UI thread and off the
sidecar's single event loop. It owns no implementation status. The ordered work lives in
[`roadmap/12-native-edge-gpu.md`](roadmap/12-native-edge-gpu.md) (RM-12); this file is the design side of that
step and wins on contract, the roadmap wins on sequence.

## 1. Scope

### 1.1 What this spec is for

The desktop is slow with real parts. The measurements are not opinions:

| Observation | Where | Cost |
| --- | --- | --- |
| The sidecar runs one Bun event loop and calls the kernel synchronously | `apps/sidecar/src/http/toolpath-generator.ts:10` | one `manufacture` blocks `/health`, the AI stream and the SSE bus |
| `Playback.segments` and `Timeline.moves` are one JS object per move | `apps/desktop/src/viewport/view3d/playback.ts:3`, `packages/core/src/cam/viewer/timeline.ts:15` | ≈400 MB of heap for 1 M moves |
| The viewport draws one mesh and one canvas texture per toolpath point | `apps/desktop/src/viewport/view3d/view3d.tsx:589` | O(moves) draw calls and O(moves) textures |
| The "only what has run" view is a CPU draw range | `apps/desktop/src/viewport/view3d/view3d.tsx:698` | every playhead move re-derives the visible range |
| B-rep tessellation and boolean CSG run on the UI thread | `apps/desktop/src/features/cad/lib/createThreeObject.ts:46`, `:126` | the interface freezes during a scene rebuild |
| G-code interpretation is the largest single share of a 1 M-move load | `packages/core/src/cam/generator/analysis.ts:42` | 1.5 s (spec 32 change log) |

Three seams answer these. Each is a **seam** with at least two adapters, and each has a **fallback** that is the
current behaviour, so the default path never changes.

### 1.2 What this spec is not

- It is **not** a second CAD/CAM kernel. The kernel stays in `packages/core` as pure TypeScript
  (`specs/14-cad-cam-parity-roadmap.md:152`: *"Pure-TS core; no native addons in the hot geometry/CAM paths"*).
- It is **not** a native B-rep kernel. RM-09 forbids it (`roadmap/09-cad-cam-depth.md:11`).
- It is **not** a rewrite of the viewport in `wgpu`. The renderer seam below exists so a WebGPU backend can be
  evaluated *next to* the WebGL2 one, not instead of it.
- It is **not** permission to add a native dependency to the hot path speculatively. `specs/29-native-cam-kernel.md:237`
  governs: a native/WASM acceleration is an **Adapter behind a demonstrated hot seam with differential tests**;
  the hot seam here is *measured* in §5, not assumed.

### 1.3 The one-sentence design

> The Rust shell stops being a pure supervisor and becomes the **supervisor of native compute and the transport of
> heavy buffers**; the maths stays in TypeScript, the parallelism stays in Workers, and the GPU path becomes a
> second adapter behind a seam instead of a rewrite.

## 2. Architecture

### 2.1 Modules and interfaces

| Module | Interface | Implementation | Owners |
| --- | --- | --- | --- |
| `@cadcamfun/buffer` | `PlaybackBuffer`, `encodePlaybackBuffer`, `decodePlaybackBuffer` | packed SoA layout over an `ArrayBuffer` | RM-12 (new package) |
| CAM buffer route | `CamBufferGroup` / `CamBufferHandlers` | sidecar route returning `application/octet-stream` | RM-12 (WP3 + WP4) |
| `Renderer` | `createRenderer(options): Renderer` | `WebGl2Renderer` (default) and `WebGpuRenderer` (opt-in) | RM-12 (WP6) |
| Native edge service | ready-line protocol, one Bearer token | a separate Rust binary, supervised by the Tauri shell | RM-13 (later step) |

### 2.2 The three seams

**Seam A — `native-buffer` (transport).** The sidecar can answer a CAM request with a packed binary buffer instead
of a JSON document. The desktop decodes it into typed-array views over the received `ArrayBuffer` — no JSON
parse, no intermediate objects, no copy. The Rust shell is *not* in this path by default: the webview already
holds the base URL and the bearer token (`apps/desktop/src/app/client.ts:12`), so a direct `fetch` is the
shortest path. A Rust proxy is admissible only if a measurement shows it wins.

**Seam B — `native-gpu` (the GPU path).** The renderer is chosen at runtime behind one interface. Both adapters
consume the same typed-array buffers, so the buffer format (§3) is the only thing they share.

**Seam C — `native-kernel` (native compute).** Deferred to a later roadmap step (RM-13). It is specified here so
the buffer format and the supervision machinery are ready for it, and so nobody adds native code ad hoc. Its
rules are in §7.

### 2.3 Depth, leverage, locality

- **Depth**: one buffer format, one renderer interface, one supervisor. A new consumer of packed CAM data does not
  invent a wire format; a new backend does not fork the viewport.
- **Leverage**: the Tauri shell already supervises a child process end to end — spawn, ready handshake, restart
  budget, graceful shutdown, reaping (`apps/desktop/src-tauri/src/sidecar.rs`). A native compute service reuses
  that machinery instead of inventing a second lifecycle.
- **Locality**: the fallback policy lives in exactly two places — the renderer factory and the capability flags.
  Every caller inherits it; no caller decides for itself.

## 3. The buffer format (contract)

`@cadcamfun/buffer` is the single definition of the packed layout. It is a **pure** package: no Effect, no I/O,
no dependencies. It is the only place that knows the byte order.

### 3.1 Envelope

All multi-byte values are **little-endian**. The header is fixed-size and the sections follow in a fixed order,
each padded to an 8-byte boundary.

| Offset | Size | Field | Type |
| --- | --- | --- | --- |
| 0 | 4 | magic `CCBF` | bytes |
| 4 | 2 | version (`2`) | u16 |
| 6 | 2 | flags (reserved, `0`) | u16 |
| 8 | 4 | segment count `n` | u32 |
| 12 | 4 | reserved | u32 |
| 16 | 8 | program duration (s) | f64 |
| 24 | 8 | end x | f64 |
| 32 | 8 | end y | f64 |
| 40 | 8 | end z | f64 |
| 48 | — | sections, in order | — |

### 3.2 Sections

| Order | Section | Type | Per segment |
| --- | --- | --- | --- |
| 1 | `starts` | f64 | 8 |
| 2 | `durations` | f64 | 8 |
| 3 | `from` | f64 × 3 | 24 |
| 4 | `to` | f64 × 3 | 24 |
| 5 | `pathIndex` | u32 | 4 |
| 6 | `moveIndex` | u32 | 4 |
| 7 | `toolIndex` | u32 | 4 |
| 8 | `rapid` | u8 (0/1) | 1 |

Total: **77 bytes per segment** plus a 48-byte header. For 1 M segments that is ≈77 MB, against the ≈200 MB of
JSON the same segments cost today.

After the fixed sections comes the **tool table**: a `u32` count, then for every tool a `u32` byte length and
its UTF-8 bytes. The table is last, so the fixed offsets above stay computable from the segment count alone,
and the tool ids travel with the segments that name them.

Version 2 preserves JavaScript double precision for playback coordinates and durations.
Version 1 used f32 for those fields and regressed fractional positions and segment boundaries;
it is rejected instead of silently interpreting its different layout. GPU line buffers remain f32.

### 3.3 Invariants

- `starts` is non-decreasing (zero-duration moves may share a start), and `starts[i] + durations[i] <= starts[i + 1]`.
- `rapid[i]` is `0` or `1`; nothing else may appear in that byte.
- `toolIndex[i]` names a tool in the tool table.
- `pathIndex` is non-decreasing, because segments are produced in toolpath order.
- A decoder that meets a wrong magic, an unknown version, a truncated body or a misaligned count **rejects** the
  buffer with a typed error. It never repairs it and never reads out of bounds.
- The format is versioned. A change that reorders a section, changes a width or changes the header size is a
  version bump. Version 2 is canonical: reserved flags/words and alignment padding are zero, the tool table
  contains valid UTF-8, and there are no unknown trailing bytes. Extensions require a new supported version.
- Numeric coordinates, timing and header values are finite; durations/starts are non-negative, segments do not
  overlap or extend past the declared duration, and toolpath indices do not decrease. A zero-duration move is valid.
- Default resource limits are 512 MiB per payload, 65,536 tools and 16 MiB of tool-table bytes. Explicit caller
  limits may lower these ceilings. Counts are checked before alignment or allocation; arithmetic never truncates
  to signed 32-bit. The decoder rejects malformed data with `BufferError` before returning views.
- `allocatePlaybackBuffer` fills one owned payload and `finalize` validates it. `encodePlaybackBuffer` copies
  existing typed sections into a canonical payload. `decodePlaybackBuffer` validates then views aligned bytes,
  copying only for alignment, shared-memory safety or explicit ownership (`copy: true`). No cache is retained.

## 4. The renderer seam

The owner-requested [rendering and compute architecture](37-webgpu-rendering-compute.md) refines this
section's original sketch: the runtime also owns async initialization/capture, clipping, recovery and
resource disposal, while rendering and stock compute are separately probed capabilities. Its hybrid
chunk rejection/playhead policy supersedes the blanket uniform-only requirement below. It does not
change the default backend or claim implementation of F2.

### 4.1 Interface

The viewport asks for a renderer and never names a backend:

```ts
export interface Renderer {
  readonly backend: "webgl2" | "webgpu"
  readonly domElement: HTMLCanvasElement
  setSize(width: number, height: number, pixelRatio: number): void
  render(scene: Scene, camera: Camera): void
  dispose(): void
}
```

`createRenderer` picks the backend. The selection is **runtime feature detection**, never a build flag and never
an assumption about the operating system. An OS/browser version alone does not establish that the actual
WebView can initialize the required adapter, device, materials and features.

### 4.2 Fallback matrix

- The shipped/default path uses WebGL2 on every supported platform.
- An explicit WebGPU evaluation requires successful initialization in the running WebView,
  including the adapter/device and features the renderer uses; checking `navigator.gpu` alone is insufficient.
- Unavailable/failed initialization retains the existing WebGL2 path. Platform release numbers are not gates.

The WebGL2 adapter is the **default and only wired** adapter in RM-12. The WebGPU adapter is reachable only
through an explicit opt-in, so an evaluation of it can never change the shipped behaviour.

### 4.3 Rules for the adapters

- Both adapters consume the **same** typed arrays. A buffer is built once and drawn by either.
- The playhead is a **uniform**, not a draw range: the shader hides a segment whose start time is past the
  playhead. This is the behaviour `specs/32-machine-simulation-parity.md:269-273` already asks for, and it makes
  the playhead independent of the buffer's CPU layout.
- Overlays (points, arcs, labels) are **instanced**: one draw call for the whole set. A canvas texture per point
  is not acceptable at any move count.
- The WebGL2 adapter uses `onBeforeCompile` to inject the playhead uniform; the WebGPU adapter uses TSL. The
  *semantics* are identical and the visual regression gate (§5.4) proves it.

## 5. Measurement before claims

`specs/ai/09-evaluation-and-observability.md:46` forbids an arbitrary latency, memory or FPS target before a
baseline. This spec therefore fixes the **method** and not the numbers.

### 5.1 The bench harness

`scripts/bench/` runs the same load on a recorded configuration and writes a JSON report with `p50`, `p95`, the
sample count, warm/cold, the OS and the hardware. A committed baseline file is compared against it, and a
regression above **20 %** fails the check.

### 5.2 The corpus

`bench/corpus/` holds small, real inputs: G-code programs, CAM programs, meshes. They are committed, so the
numbers are reproducible and a change can be compared against a fixed input.

### 5.3 The budget that already exists

`specs/32-machine-simulation-parity.md:274-275` is the reference gate and is not renegotiated here:

- 1 M moves load ≤ 2 s and play at 60 fps on the reference Mac;
- S1 removal of a 300×200 stock at 0.25 mm stays ≥ 30 fps during 10 k moves/s of playback.

The budgets RM-12 adds are the ones it *creates*:

- the heap used by one 1 M-move program, measured before and after the typed-array change;
- the number of draw calls the viewport issues for a 1 M-move program;
- the p95 of the buffer route over the corpus.

### 5.4 The visual gate

The WebGL2 and WebGPU adapters must produce the same image for the same scene. The gate is a golden screenshot
of the CAM viewport over the corpus, compared per backend.

## 6. The sidecar's event loop

`specs/35-ai-performance-audit.md` §5 (P1-6) already records the defect: `cam.kernel.runJob` is called
synchronously in `apps/sidecar/src/services/ai.ts`, although `packages/ai/src/kernel-job.ts` already provides a
Worker with a deadline and an abort. That defect is **not** in RM-12's scope, but RM-12 must not make it worse:
the buffer route runs the same synchronous core functions, so it inherits the same blocking behaviour.

RM-12 therefore states the rule for its own route: **the buffer route is a pure function of its input and does no
I/O**, so moving it behind the existing Worker (`runKernelJob`) is a change of *where* it runs, never of *what* it
computes. The follow-up that does the move is named in §8.

## 7. Native compute (deferred, but binding)

The rules that a future native edge service must satisfy are fixed here, so that when it is built it cannot be
built speculatively.

1. **Demonstrated hot seam.** The operation must appear in a §5 measurement as a share of the load that the
   current implementation cannot meet. A candidate is G-code interpretation (1.5 s of a 1 M-move load).
2. **Adapter, never a replacement.** The TypeScript implementation stays and stays the default. The native
   implementation is an Adapter behind an interface, selected by a capability flag
   (`CADCAMFUN_NATIVE=off|ops|all`, default `off`).
3. **Differential tests.** For every operation, a corpus-wide comparison against the TypeScript reference on the
   §5.2 corpus. A mismatch disables that operation, and the flag's default means a mismatch cannot reach a user.
4. **Same wire contract.** A native implementation must produce the §3 buffer byte-for-byte identically to the
   TypeScript one. The differential test compares bytes, not parsed values.
5. **Deployment and licence review.** A new Rust crate, and any dependency it pulls, goes through the same
   review as the rest of the release pipeline (spec 10), including the six native targets.
6. **No geometry.** Only parsing, encoding, and numeric bulk work are candidates. A B-rep or a geometry
   evaluation in Rust is out of scope (RM-09).

## 8. Consequences and non-goals

- The `packages/core` timeline keeps its object-per-move shape in RM-12. The desktop builds its own typed
  structure from the program, so the core's public interface is untouched.
- The AI kernel job stays inline in RM-12. Moving it behind the existing Worker is the first follow-up
  (`specs/35-ai-performance-audit.md` §6, phase 2, item 7).
- No `wgpu` crate, no `napi`, no FFI, and no new native dependency lands in RM-12. The separately authorized native display-edge helper is documented in spec 07;
  it adds no crate or kernel and does not implement the deferred native compute process.
- The sidecar's `application/octet-stream` responses are additive: the existing JSON routes keep working and
  keep their schemas.

## 9. Change log

- 2026-10-20: v1. Published after the Rust-shell review: the measured load table (§1.1), the three seams (§2.2),
  the buffer format (§3), the renderer seam and its fallback matrix (§4), the measurement method (§5) and the
  rules that bind a future native edge service (§7). Implementation is RM-12.
- 2026-10-20: §3.2 gained the `toolIndex` section and the trailing tool table. The tool id is what colours a
  segment and what `toolAt` reports, so it has to travel with the segments; a string per segment would have
  undone the packing.

- 2026-10-20: Owner requested completion of the existing packed-playback callers and API regeneration.
  Version 2 changes playback durations/coordinates to f64 after regression tests exposed f32 endpoint
  and boundary errors. GPU line buffers remain f32. CADCanvas and CAM View3D use the bounded native
  display-edge adapter from spec 07 with synchronous Three.js fallback; this does not activate WebGPU
  or complete the RM-12 performance/visual gates.
- 2026-10-20: Owner assigned completion and connection of the TypeScript buffer package. Added canonical
  encode/decode, validated finalization, finite numeric/ordering checks, explicit byte/tool ceilings,
  strict UTF-8 and padding validation, safe offset arithmetic, owned-copy decoding and bounded producer
  diagnostics. Desktop playback, CAM colour buffers and resource previews use the package; existing
  domain HTTP routes remain unchanged. Package lifecycle/ownership and transport scope are documented.
- 2026-10-20: Owner requested the rendering/compute WebGPU architecture. Spec 37 refines the renderer
  sketch with separate capability gates, CPU Worker and GPU stock adapters, async AI capture, bounded
  GPU memory/submissions and loss recovery. It corrects the uniform-only performance assumption;
  rendering, compute, HTTP transport and real-WebView gates remain unimplemented or unverified.
