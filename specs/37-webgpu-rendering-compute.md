# WebGPU rendering and compute for CAD and CAM

Status: **architecture proposal, inspected 2026-10-20; no WebGPU backend implemented or enabled by this document**.
Owner request: design rendering and compute WebGPU for CADCanvas and ToolpathVisualizer, retaining Tauri,
Rust, sidecar/API integration and avoiding regressions. This refines spec 36's GPU design, not the roadmap
sequence or completion status. Existing buffer transport and performance gates remain open.

## 1. Evidence and decisions

The installed Three.js is **0.180.0**, with `three/webgpu` and `three/tsl` exports. The implementation must
target that pinned release; current online examples alone are not version-matched evidence.

Current integration points:

- `apps/desktop/src/features/cad/components/CADCanvas.tsx`: synchronous WebGLRenderer initialization,
  demand-driven FrameScheduler, OrbitControls, TransformControls, selection and registered AI capture.
- `apps/desktop/src/viewport/view3d/view3d.tsx`: the ToolpathVisualizer's renderer; additionally owns
  four-view scissor rendering, local clipping, toolpath draw ranges and live stock updates.
- `apps/desktop/src/features/ai/lib/viewport-capture.ts`: synchronous fresh-frame capture;
  `features/ai/lib/vision.ts` consumes it synchronously inside an async request bridge.
- `viewport/view3d/stock-simulation.ts`: S1 vertical-mill height field with CPU mesh writes;
  `voxel-stock.ts`: distinct S2 rotary preview with CPU surface reconstruction.
- `packages/core/src/cam/sim/simulation.ts`: checkpoints and restoration of the field before a partial
  move. Accumulating partial cuts across frames changes the result and is not equivalent.
- `viewport/view3d/mesh-jobs.ts`: bounded worker admission, cancellation by termination and stale-id
  rejection already exist. B-rep tessellation in `createThreeObject.ts` still executes synchronously.

**Decision:** Three.js remains the scene framework. Add a shared viewport runtime with two rendering
adapters and a separate stock-preview compute interface. Keep CPU preparation in Workers, domain
operations in the existing sidecar/core, and bounded display-edge preparation in Rust/Tauri.

This is a deep module: deleting it would distribute initialization, backend selection, capture,
device-loss recovery and resource ownership across both viewports. Its leverage is shared lifecycle;
its locality is one policy for failure and disposal. Do not introduce forwarding wrappers for each
individual Three.js method.

## 2. Data flow and ownership

```text
Authenticated sidecar API -> revisioned domain program, motion, tools, stock
                              |                         |
                         CPU preparation Worker     CPU reference / verification
                              |
                  immutable display and simulation inputs
                              |
        CADCanvas / ToolpathVisualizer -> ViewportRuntime (per mounted canvas)
                                           |
                            render adapter + stock-preview adapter
                                           |
                              renderer-owned GPU resources

Tauri/Rust -> shell lifecycle + existing bounded display-edge command
```

GPU handles never cross HTTP, Tauri IPC or Worker messages. A separate native `wgpu` device/process
does not provide a portable shared GPUBuffer to the WebView renderer. No native GPU process or new
plugin is required for this phase; a future native compute adapter needs its own measured justification.

Use one renderer-owned device/resource domain per mounted canvas initially. Share immutable CPU inputs
and the preparation implementation, not live GPU allocations, between CAD and CAM. Do not create a
second compute-only device per viewport. The four-view CAM layout uses one renderer and four viewports.

The sidecar owns persisted domain results and authorization. GPU preview is a disposable derived view.
The binary CAM HTTP route remains an independent additive task: GPU evaluation can consume the current
JSON program and the already-connected buffer package without waiting for that transport optimization.

## 3. Modules and interface contracts

Proposed location: `apps/desktop/src/viewport/runtime/`. Both viewports consume this module. Backend-specific
resources stay private; callers keep their existing scene interaction and domain identities.

**ViewportRuntime** interface:

- Async creation with a caller AbortSignal and policy `webgl2 | webgpu-preview`.
- Report actual rendering backend, supported stock-preview modes and failure reason. Rendering support
  and compute support are separate capabilities, established by representative initialization probes.
- Attach/revise a scene with a generation token; resize; invalidate; submit a frame containing camera,
  playhead, clipping and optional four-view layout; capture a rendered frame asynchronously; dispose.
- Render has one submission owner. A scene revision invalidates stale preparation, capture and stock
  results. Disposal is idempotent and terminal; initialization that finishes after disposal frees itself.
- Preserve current demand-driven scheduling and visibility suspension. Do not install a second animation
  loop merely because Three.js examples use one.

**Render adapters:** existing WebGLRenderer and opt-in WebGPURenderer. The public seam includes scene
compatibility, not just `render(scene, camera)`. Each adapter owns material creation/updates, section
clipping, capture completion and renderer-specific cleanup. In particular, callers must not access
`renderer.renderLists` or assume `localClippingEnabled` is portable.

**StockPreview** interface: construct from revisioned simulation inputs; request a playhead; report
applied playhead, pending state, preview precision and missing tools; supply an adapter-owned draw object;
request diagnostics asynchronously; dispose. Adapters are CPU-reference execution in a Worker and GPU S1.
The old inline CPU path remains available while Worker parity is established. Shared protocol types
remain frontend-local unless a real sidecar route needs them; no new public API for internal GPU handles.

## 4. Backend selection, materials and capture

State machine: `initializing -> ready -> lost -> recovering -> ready-WebGL2`, with `disposed` terminal
from every state. Allow one recovery transition per mounted runtime, not an unbounded retry loop.

1. WebGL2 stays the shipped default. Explicit WebGPU evaluation initializes asynchronously and tests a
   representative scene, required material paths, clipping, capture and a small stock compute/readback.
2. Record the **actual** backend. WebGPURenderer can fall back internally to its own WebGL backend;
   successful creation does not prove native WebGPU or the required compute operations.
3. A failed compute probe keeps rendering usable and selects CPU stock. A failed render compatibility
   probe selects legacy WebGLRenderer. Availability is not inferred from an OS version or `navigator.gpu`.
4. Initialization timeout is a logical cancellation: retain a generation guard and dispose late-created
   resources. Reuse neither a failed renderer nor a canvas already configured for a different context
   mode. Recovery creates a fresh canvas, rebinds controls/capture, and restores camera and selection.
5. On loss, stop new compute work, invalidate the generation, preserve CPU inputs, and rebuild the
   display from those inputs. Expected destruction during teardown must not trigger recovery.

Retain built-in standard/basic/dashed-line/sprite materials where verified. Introduce a small material
policy for custom playhead and stock surfaces: GLSL customization for legacy WebGL and TSL/node materials
for WebGPU. TSL is not a drop-in `onBeforeCompile` replacement inside the old renderer.
Check the existing `instanceof MeshStandardMaterial` highlighting/tint assumptions against any converted
material; preserve emission, opacity, wireframe, depth ordering, units, clipping and color management.
Keep one resolved Three.js core; verify build imports/addons rather than globally aliasing `three` blindly.

Capture becomes Promise-based all the way through `registerViewportCapture`, `captureVisibleViewport`
and `vision.ts`. Resolve it only after the requested revision and frame are readable, before publishing
AI evidence. Retain project/revision checks after every async boundary. A backend's completion/readback
contract must be tested: an awaited JavaScript render/compute method is not automatically GPU completion.
Use a bounded on-demand capture target/readback if canvas capture cannot establish that contract.

## 5. CAD display and CAM toolpath preparation

The CCBF v2 payload remains f64 and unchanged. It is CPU playback data, **not** a ready-made GPU struct.
Prepare compact GPU attributes in a Worker, with local origins for coordinates and local time epochs
where f32 error would exceed the measured display budget. Apply the matching camera/model transforms;
preserve f64 source geometry, machine coordinates, picking and export. Large-coordinate and long-duration
programs must be precision fixtures. GPU upload still copies bytes; typed-array decoding is not zero-copy
CPU-to-GPU transport.

CCBF alone is also insufficient simulation input: it lacks the original modal/probe state, cutter
profiles and rotary/arc semantics. Build a separate versioned, bounded **local** simulation plan from
the program, motion timeline, tools and stock using the existing reference rules. Never infer cutting
eligibility solely from a displayed chord or a `rapid` byte.

CAD CPU work: extend the existing Worker approach to B-rep tessellation/CSG. Return immutable arrays
plus face/edge identity mappings; install Three.js resources only in the owning viewport. Transfer only
Worker-owned arrays: transferring cached/shared source ArrayBuffers would detach data still in use.
Keep the Rust edge helper as an optional bounded display operation; it does not replace exact B-rep edges.

CAM drawing: build chunked line buffers with contiguous time ranges, spatial bounds and stable path/move
ids. Reuse them until the geometry revision changes. Point/arc markers use shared geometry and instancing;
labels use a bounded atlas/batched glyph representation and explicit visibility policy. Preserve label
content and selected-point identities; do not silently omit labels to claim parity. Draw calls scale with
visible chunks and material groups, not with every move. Do not promise one draw call for every scene.

**Playhead decision:** use coarse CPU chunk/draw-range rejection plus a uniform in the visible frontier
where useful. Existing `startedBy` is a binary search over two ordered arrays; it is not an O(n) rebuild.
A uniform-only path still submits invisible vertices and can regress large programs. Compare both on the
corpus. Preserve current full-segment-at-start semantics; partial-segment animation is a separate behavior
change. This refines spec 36's earlier blanket uniform requirement.

## 6. GPU compute: S1 first, explicit S2 extension

First supported compute slice: vertical, fixed-axis mill S1 height fields with known cutter profiles.
Lathe, printer, probe, unknown cutters and rotary programs retain their existing eligibility and preview
paths. S2 is a separate adapter extension, not an accidental vertical projection of a tilted cutter.

Use TSL through the initialized renderer and public storage-attribute/compute APIs verified against r180.
Render and compute consume the same GPU-resident field. Do not depend on private Three.js backend fields
to obtain a device. If a required public resource/lifecycle API is missing, record a compatibility blocker
or propose a tested version change; do not hide a private escape hatch in a caller.

S1 implementation contract:

1. Bin a bounded batch of ordered cutter samples into affected tiles on the CPU Worker. Preserve core
   sampling and cutting eligibility, including curved cutters, tool changes and missing-tool handling.
2. Dispatch one invocation per affected cell; that invocation owns the cell's output and examines its
   tile's candidate samples. Use bounded tiles/batches and ping-pong fields. Avoid concurrent non-atomic
   float writes from multiple tool samples to one cell. Shader work per invocation is bounded too.
3. Keep the field, derived normals and preview colors on the GPU. The stock draw object reads those
   resources directly; do not reconstruct/read back the complete mesh every frame.
4. Reproduce the reference's pre-move base restoration for partial moves. Checkpoints are bounded by
   **bytes**, not only count, and include revision, completed-move index and partial state. Rewind replays
   from a checkpoint; rapid seeks coalesce to the newest target without accumulating queued work.
5. Run volume/deviation reductions only when requested, with bounded asynchronous staging readback.
   Results carry applied time, revision and `preview` provenance; CPU verification remains authoritative
   for acceptance, collision/gouge reports, persisted decisions and machining output.

GPU f32 output is not promised bit-identical to the f64 CPU reference. Define display error acceptance
from stock resolution, declared tolerance and the measured fixture error, before enabling the adapter.
Do not report an out-of-range preview as a successful verified result. Unsupported precision/geometry
selects CPU simulation; GPU preview never changes G-code or kernel results.

S2 follow-up: budgeted sparse/dense bricks as appropriate to measured occupancy, uniquely owned voxel
writes or valid integer atomics, bounded surface extraction and mesh capacity, rotary frame semantics,
and CPU differential fixtures. Overflow must retain a valid CPU/last-complete view, never truncate the
surface silently. Full S2 delivery is a separate gate before claiming rotary GPU acceleration.

## 7. Scheduling, GPU limits and memory

One runtime submission owner serializes small compute batches and rendering. Retain one executing
stock batch and one replaceable requested playhead; superseded targets do not append commands forever.
Prioritize camera/selection rendering. Pause preview production when hidden; resume from the latest
requested state. CPU preparation and GPU execution are different forms of background work: asynchronous
submission alone does not move tessellation off the UI thread.

`computeAsync()` in installed r180 initializes if necessary and calls `compute()`; it is **not** a fence
that establishes completed device work. Use a verified backend completion/readback primitive to bound
in-flight batches, without introducing a blocking GPU wait into every render frame. Cancellation stops
future submissions and rejects stale results; already-submitted GPU work is not preempted by AbortSignal.

Read the created device's effective limits, not only adapter maxima: buffer/binding sizes, alignments,
texture dimensions, workgroup invocation/dispatch limits and required feature support. Tile/split large
inputs before allocation. A CPU payload's 512 MiB cap is not permission to allocate a single GPU binding.
The Three.js WebGL fallback has some transform-feedback compute support in r180; that does not establish
support for this storage-based stock algorithm. Probe the actual operation rather than its method name.

Each runtime owns a resource scope: scene geometries, materials, textures/atlases, storage attributes,
compute nodes, checkpoints, render targets, readback buffers, listeners and pending initialization.
Track estimated live bytes and peaks by category, release on scene revision/close, and enforce a configured
byte budget. Reserve headroom for swapchain/depth/driver allocations; WebGPU has no portable exact free-VRAM
query. A fallback transition must release the failed backend before rebuilding expensive resources.

Use the owner's lifecycle API: dispose Three.js-owned objects/compute nodes; destroy/unmap explicitly
allocated native WebGPU buffers/textures where applicable. Never destroy a renderer-owned device from a
stock adapter. No global cache of live GPU objects or unbounded retained checkpoint history. Intentional
immutable CPU caches have separate bounded ownership. Returned late resources are disposed, not installed.

## 8. Rollout and evidence required

Keep independent switches for rendering (`webgl2 | webgpu-preview`) and stock (`cpu | gpu-preview`).
Default to the currently shipped path until the corresponding gates pass. A rendering win does not
waive compute correctness, and compute failure does not require losing a usable viewport.

Implementation order:

1. Record baseline and fixtures on the actual Tauri WebViews; include simultaneous CAD/CAM, imports,
   one-million-move programs, long durations, distant origins and representative stock/cutters.
2. Introduce shared runtime lifecycle using the existing renderer. Preserve capture, clipping,
   selection, controls, resize, four-view and idle suspension through caller-facing tests.
3. Batch overlays and Worker preparation with the legacy renderer. Measure these wins separately.
4. Add opt-in WebGPU rendering, public material adaptation, async capture and loss recovery.
5. Add CPU Worker StockPreview adapter, then GPU S1 using the same contract and reference fixtures.
6. Extend to S2 only after its rotary, extraction, precision and memory gates pass.

Required evidence: p50/p95 input-to-frame and frame CPU time; GPU timings when supported and correctly
labelled; otherwise end-to-end timings; upload/readback bytes; draw calls; live resource counts and owned
bytes; peak process/JS memory; stock precision/deviation against the reference. Distinguish submission
timing from GPU execution timing. A faster renderer does not fix a blocked sidecar event loop.

Visual/interaction fixtures cover cut/rapid dash patterns, all color modes, playhead boundaries, labels,
wireframe, lighting/transparency, clipping, four-view, exact B-rep picking and camera/gizmo behavior.
Use declared image tolerances for cross-backend rasterization rather than demanding byte-identical
screenshots, while requiring exact domain identity and unchanged machining/export outputs.

Failure/lifecycle fixtures: loss during compute/capture, allocation/compile failure, denied adapter,
unmount during initialization, rapid seek and project changes, hidden/resumed viewports, unsupported tools,
and repeated open/rebuild/close cycles. Resource accounting returns to the bounded warm baseline; process
memory trends must be measured over cycles because driver/browser caches need not disappear immediately.
Browser tests alone do not prove packaged Tauri compatibility. Do not mark rendering, S1 or S2 delivered
until their real-WebView gates have evidence. This document contains no new benchmark results.

### 8.1 Blocking non-regression gates

These requirements apply to the legacy-default refactor as well as the opt-in backend. A feature flag
alone does not protect users when shared lifecycle, material or capture code changes.

- **Freeze the reference before implementation.** Record the commit, lockfile, fixture hashes,
  settings, WebView/OS/GPU, warm/cold protocol and repeated samples. Compare old and new builds on the
  same machine and inputs. Set per-metric acceptance budgets and image/preview tolerances from that
  baseline before promotion; a blanket 20% threshold from spec 36 is not permission for every metric
  to deteriorate. Investigate noise with repeat runs rather than updating baselines to make checks pass.
- **Require domain equivalence.** Identical inputs retain the same document/face/edge/move identity,
  units, tool eligibility, machining program and exports. Reference CPU verification results are
  unchanged. Preview tolerances cannot excuse a change in authoritative results or a missing feature.
- **Exercise the actual callers.** CADCanvas, ToolpathVisualizer and AI vision capture must pass
  their interaction/lifecycle fixtures, including both viewports mounted simultaneously. Unit tests
  of a renderer factory alone cannot satisfy this gate. Capture must pair pixels and metadata from
  the same revision, not merely produce a non-empty image.
- **Check the supported combinations independently.** Legacy rendering/current CPU simulation is
  the control; WebGPU rendering with CPU stock isolates rendering changes; WebGPU rendering with GPU
  stock isolates compute changes. Forced fallback, unsupported-compute and interrupted recovery are
  required cases. Neither enabling nor disabling the experiment changes persisted document state.
- **Block on missing evidence or a failure.** Test/typecheck/build results, visual and numeric
  comparisons, latency/idle-work measurements, memory lifecycle runs and packaged Tauri smoke evidence
  must refer to the candidate being promoted. Unsupported platforms keep the legacy path. No default
  activation on the strength of browser-only tests, average FPS or a smaller JS heap alone.
- **Keep rollback exercised.** Switching back restores the legacy renderer and valid CPU stock at
  the requested time, camera, selection and scene revision, without reimporting a project. A failed
  compute adapter reports its state and uses CPU output; it cannot silently publish stale stock as
  current. Recovery and teardown tests prove that the replaced backend leaves no owned live resources.

Deliver rendering, GPU S1 and GPU S2 as separately reviewable increments. A failed correctness,
precision, interaction, memory or performance gate blocks that increment even if another metric improves.
Until those gates pass, report the backend as experimental and the corresponding verification as open.

## 9. References and scope of evidence

- [Three.js migration guide](https://threejs.org/manual/pages/webgpurenderer): current documentation,
  cross-checked against installed r180 for initialization/material and fallback behavior.
- [Pinned r180 renderer](https://github.com/mrdoob/three.js/blob/r180/src/renderers/common/Renderer.js):
  init, computeAsync, onDeviceLost and disposal implementation.
- [WebGPU device interface](https://gpuweb.github.io/types/interfaces/GPUDevice.html): device limits,
  loss notification and queue ownership.
- [WebGPU limits](https://gpuweb.github.io/types/interfaces/GPUSupportedLimits.html): resource and dispatch
  limits that the admission/splitting policy must respect.
- [WebGPU explainer](https://gpuweb.github.io/gpuweb/explainer/): timelines, mapping and failure model.

This is an evidence-informed design, not a claim that the proposed adapters, recovery or precision gates
already exist. No production renderer, API schema, dependency, default or roadmap status changes here.

## Change log

- 2026-10-20: owner-requested WebGPU architecture. Defined shared runtime and separate rendering/stock
  capabilities; preserved f64 CCBF and domain authority; specified GPU-resident S1, bounded scheduling,
  partial-move replay, disposal/loss recovery, AI capture integration and staged real-WebView gates.
- 2026-10-20: owner explicitly required non-regression assurance. Added blocking promotion gates for
  the legacy-default refactor and opt-in adapters, frozen reference evidence, caller-level parity,
  separately verified rendering/compute combinations and exercised rollback. No runtime code changed.
