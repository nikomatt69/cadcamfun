# Rust viewport preparation and output checks

This WP5 work is separate from the concurrently edited buffer/WebGPU implementation.
The shipped Rust shell now exposes `prepare_viewport_edges` through the main window's
Tauri capability. `guest-js/viewport-geometry.ts` is its binary guest adapter.
The shared `src/viewport/native-edges.ts` adapter is connected to CADCanvas through the CAD
factory and to ToolpathVisualizer through View3D mesh installation. Small/browser meshes
retain synchronous Three.js extraction; eligible desktop meshes use Rust, then invalidate once.

## Connecting the two viewports

The existing desktop API client (`src/app/client.ts` and `src/app/sidecar.ts`) obtains
the authenticated sidecar endpoint from Tauri and remains the source of domain data.
The intended flow is API/sidecar -> desktop display mesh -> raw Tauri preparation ->
desktop GPU buffer. The native helper does not read the database, expose another HTTP
route or alter API contracts. The viewport callers now implement those last two steps.

The viewport adapter calls `prepareViewportEdges` with an existing display mesh's
`Float32Array` positions, optional u16/u32 triangle indices and the original Three.js
edge threshold (CAM currently uses 25 degrees; preserve each CAD call's threshold).
The result is an xyz `Float32Array` suitable for a Three `BufferAttribute` with item size 3.
Requests copy display data; source arrays are never detached or modified.

Keep the existing Three/Worker adapter for unavailable native IPC, oversized meshes,
busy admission and timeouts. Retain geometry identity or a revision/AbortSignal across
the await, and discard stale results **before** creating GPU resources.
The adapter checks attribute identity/version as well as disposal, allocates no placeholder
GPU attribute, and admits one IPC job in the webview before packing any binary body. The guest adapter
checks cancellation before/after IPC; it does not pretend to interrupt a native thread.
Invalidate the owning viewport once when installing a result and dispose any replaced
line geometry. Do not retain every response in a cache.

Do not replace exact B-rep edges or their `brepEdge`/`brepFace` picking identifiers with
triangle feature edges. This helper is a display preparation adapter, not a tessellator,
normal generator, toolpath planner, exporter or replacement CAD/CAM kernel.

## Limits and lifecycle

- One admitted native job, no unbounded waiting queue. Busy requests return `viewport_busy`.
- Raw input at most 16 MiB; at most 250,000 triangles / 750,000 input vertices.
- Three-second cooperative production deadline, checked in validation, extraction and output.
- The blocking task owns the admission permit, so dropping the caller does not admit a second
  task while the first is still running. Rust-owned vectors/maps are dropped on every result path.
- Native response is `CEL1` plus endpoints. Main-window command registration, invoke handler
  and capability permission are all present; no filesystem or shell permission was added.

## Repeatable checks

From the repository root:

```sh
python3 apps/desktop/src-tauri/benches/output-framing.py --baseline-ref HEAD --out=/tmp/rust-framing.json
python3 apps/desktop/src-tauri/benches/viewport-edges.py --out=/tmp/rust-viewport-edges.json
bun --no-env-file test apps/desktop/src-tauri/guest-js
bun --no-env-file check -p apps/desktop/src-tauri/guest-js/tsconfig.json
```

From `apps/desktop/src-tauri`:

```sh
cargo fmt --all -- --check
cargo clippy --locked --offline --all-targets --all-features -- -D warnings
cargo test --locked --offline --all-features
```

The Python tools compile the **actual** Rust source with the desktop's release settings
(`opt-level=s`, one codegen unit, LTO), not a copy of an implementation. Edge checks use
the installed Three.js reference on indexed/non-indexed primitives, reversed/duplicate/
degenerate/non-manifold faces, seeded triangle soup and five angle thresholds.
The runner counts live allocations and checks balance after completed and failed requests;
it also checks 10,000 malformed requests. It is single-threaded and isolated, so allocations
from unrelated app threads cannot invalidate the counter. This is not a GPU/WebView leak test.

The edge **validation runner** permits 120 seconds per comparison to finish under host
contention; the production command retains its three-second timeout. Recorded native times
exclude IPC/packing/renderer installation. No FPS or end-to-end viewport speedup is claimed.
Benchmark p50/p95 must be taken on a quiet host before choosing an admission size threshold.
The two existing opt-in tests (real keychain and packaged sidecar) are not run by these commands.

## Memory review

No unbounded application-owned Rust cache or new task registry was introduced. The installed
shell plugin uses a bounded process event channel and raw buffered pipe reads; our forwarding
queue remains bounded at 256 events. Each line decoder bounds pending data to 16 KiB and
discards oversized lines through newline. The updater's request queue is bounded at one,
and shutdown takes and aborts its owned task. These are source-level ownership observations,
not proof that the whole application, its webview or GPU driver has no leaks.

New native preparation has no retained mesh cache. Its admission counter is an owned RAII
permit, and completed/error allocation balance is tested. The shared adapter tests
disposal or attribute replacement/update before both success and failure,
ensuring stale responses do not install attributes or schedule a frame. Full GPU resource
profiling across repeated scene replacement still needs a running app.

## Plugin decision (2026-10-20)

The [official Tauri IPC](https://v2.tauri.app/develop/calling-rust/) already supports raw request
and response bytes; no extra plugin is needed for this command. The installed
[shell plugin](https://v2.tauri.app/reference/javascript/shell/) already provides raw subprocess
output, and the [filesystem plugin](https://v2.tauri.app/plugin/file-system/) offers binary I/O.
Retain those capabilities rather than adding another HTTP/proxy path for local geometry.

The community [tauri-plugin-egui](https://github.com/clearlysid/tauri-plugin-egui) renders native
egui through wgpu in a Tauri-managed window. It does not accelerate the existing Solid/Three
viewports. Adopting it would be a separate renderer/UI integration, so it was not installed.
The [Wry wgpu example](https://github.com/tauri-apps/wry/blob/dev/examples/wgpu.rs) is similarly
a native composition example, not a drop-in accelerator for CADCanvas or ToolpathVisualizer.

## Validation recorded in this change

Rust: 72 tests passed, two pre-existing opt-in tests ignored; fmt and clippy passed.
Native display output: 50 Three.js reference cases / 250 runs agreed byte-for-byte, with
balanced isolated allocations and 10,000 malformed requests. API: 24 tests passed; sidecar
manufacture/persistence/verify: 21 passed. API, sidecar, buffer and desktop typechecks passed.
The extended desktop/buffer run passed 815 tests; its two failing boot hooks were caused
by denied local socket binding in the sandbox. The entire boot file passed separately
outside that sandbox (13 tests). Latest affected buffer/viewport/CAM/guest tests passed
80 cases; six async edge integration cases were rechecked after disposal/version/ownership
hardening. These are not native-window GPU profiling or packaged-app smoke results.
