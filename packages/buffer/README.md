# Packed CAM playback

`@cadcamfun/buffer` is a pure TypeScript workspace package, with no Effect, core, browser,
filesystem or native dependencies. It defines the `CCBF` version-2 binary layout and its
encoder, decoder and validation rules. Version 1 is deliberately rejected: its f32 playback
coordinates/durations regressed fractional positions and segment boundaries.

## Current integration

The desktop declares this package as a workspace dependency. Its CAM playback builder fills
the package's typed-array views; View3D/ToolpathVisualizer, path colour buffers and resource
previews consume those views or materialize individual segments only when needed. They do
not retain an object per segment. Programs still arrive through the existing authenticated
sidecar API. This package does not add a binary HTTP endpoint or a second CAD/CAM algorithm.

The Rust/Tauri display-edge command is a separate `CGE1`/`CEL1` protocol. Its desktop adapter
is connected to CADCanvas and CAM View3D, with Three.js fallback and disposal cancellation.
Do not send a `CCBF` packet to that command.

## Writing and reading

```ts
import { allocatePlaybackBuffer, decodePlaybackBuffer } from "@cadcamfun/buffer"

const writer = allocatePlaybackBuffer(1, ["T1"])
writer.views.starts[0] = 0
writer.views.durations[0] = 2
writer.views.to.set([10, 0, -1])
// from, pathIndex, moveIndex, toolIndex and rapid already contain zeroes.
const bytes = writer.finalize(2, { x: 10, y: 0, z: -1 })
const playback = decodePlaybackBuffer(bytes)
```

`finalize` validates the filled sections and metadata before writing the header. Use its
returned bytes rather than sending an unfinished writer. `encodePlaybackBuffer(data)` copies
existing typed sections into a validated, canonical payload. `checkPlaybackInvariants(data)`
returns at most 64 diagnostic messages; decode/finalize reject the first invalid value.

## Precision and ownership

Times and CPU playback coordinates use f64; indices use u32 and rapid flags use u8. Each
segment costs 77 bytes before small alignment gaps and the tool table, about 77 MB for one
million segments. This is the packed payload size, not the entire application's heap usage.
GPU line positions/colours are constructed as f32 at the rendering boundary.

An aligned ordinary input is viewed without copying and keeps its whole backing buffer
alive. Release the decoded result when replacing a scene. Use `decodePlaybackBuffer(bytes,
{ copy: true })` to own a compact snapshot when the input is a slice of a much larger buffer
or must be reused. Unaligned and shared inputs are copied before validation. Callers must
coordinate concurrent writers; a copy is not an atomic snapshot of actively changing shared
memory. There is no cache, task registry, listener or background work in this package.

## Validation and limits

The decoder requires a supported version, zero flags/reserved words, exact section lengths,
canonical zero padding and valid UTF-8 tool identifiers. Unknown trailing bytes are rejected.
Timing/coordinates/header values must be finite, starts/durations non-negative, segments
non-overlapping and within the declared duration, toolpath indices ordered, tool references
valid, and rapid flags exactly zero or one. Zero-duration moves are supported.

Default ceilings are 512 MiB per payload, 65,536 tools and 16 MiB of tool-table bytes.
`BufferLimits` can lower them for a transport or small preview. Counts are checked before
allocation; alignment uses safe arithmetic rather than signed 32-bit bitwise truncation.
Limits apply per payload: the caller still owns download limits, concurrency and retention.

Failures use `BufferError`, with `_tag`, stable `reason` and an English message. The codec
does not repair malformed UTF-8, replace unsupported versions or coerce invalid counts.
Typed-array wire views require a little-endian host, checked explicitly.

## Checks

From the repository root:

```sh
bun --no-env-file check -p packages/buffer/tsconfig.json
bun --no-env-file test packages/buffer
bun --no-env-file check -p apps/desktop/tsconfig.json
```

Tests cover precision, ownership, Unicode, malformed envelopes and numeric data, resource
limits, overflow counts and disposal-safe integration in the desktop viewport suite.
