# Composing CAM programs

A real part has many operations. Plan them in this order and do not skip ahead.

1. Probe the work offset (cam_edit action create with `type: "probing"`). Use the result as the zero.
2. Face the top (`face`) to establish a reference plane.
3. Rough (`roughing` or `adaptive`), leaving a small allowance (0.1 to 0.3 mm).
4. Rest-machine what the big tool could not reach (`rest`) with a smaller tool. In `cam.manufacture` a surface operation with `mode: "rest"` works from the stock the earlier operations really left (no `restFrom` needed).
5. Finish floors and ledges first (`flat`, flat end mill), then the surface (`steep-shallow`, `scallop`, `parallel`, `waterline`, `spiral`, `radial`), cusp height from the scallop setting, climb milling.
6. Drill before tapping or reaming or thread milling (`drill`; peck cycle for deep holes, `cut: "ream"` for a fitted bore, `cut: "tap"` when the control taps rigidly).
7. Chamfer (kernel `deburr` width: 2D chamfer on outlines, pockets and holes) or engrave last.
8. Indexing (3+2) only after the bulk is removed.

## Picking an operation

- Closed outline, outside a part: `profile`.
- Closed outline, inside a recess: `pocket`.
- Hole pattern: `drill` (peck when depth is at least 3 times the diameter; pilot above 12 mm; ream a bore with an ISO fit, tap a threaded hole).
- Curved face: `steep-shallow` (waterline on walls, raster on flats) or `scallop` (constant 3D stepover on slopes, walls over 80° need a waterline); `spiral` / `radial` (with `center`) for round domes and bosses; pencil = rest finishing after a larger ball.
- Horizontal faces at size: `flat` (the kernel plans it on freeform parts with ledges).
- Deep pockets: `adaptive` then `rest`.
- Lathe body: `facing`, then `turning_od`, then `parting`; `threading_od` if needed.
- Five-axis mill: pick the machine by its rotary words. `trunnion-5ax` writes A+C, `trunnion-5ax-bc` writes B+C on the same cutting blocks (simultaneous). `cam.materials` lists each preset's `fiveAxis` layout, pivot and tilt range: choose from that, never guess. A `multiaxis` operation on a machine without `fiveAxis` fails.
- Reading a five-axis result: `stock.fiveAxis` is the voxel bracket of the turned moves (removed/remaining lower–upper, mm³, `voxelMm`); the height-field volumes do not cover those moves, and `material-removed` stays unresolved. Do not quote a single removed volume for a five-axis program.
- Lathe in its own mode: turning is X (diameter) and Z with the part turning in the chuck (C spins). A 5-axis lathe is a mill-turn centre: X/Y/Z plus a B milling head (B0 axial, B90 radial) and the C spindle positioned for milling. Turning-only programs carry no B/Y words; do not invent a B axis for them.
- Turning a profile: `cam.turn` previews an external piecewise-linear profile (diameter + z, z = 0 at the finished face, negative towards the chuck) from bar stock. Roughing bounds the local diameter cut, preserves cap intersections on tapers and returns stock profiles after each pass. Volumes obey `stockVolume = partVolume + unmachinedVolume + removedVolume`; the tail is retained, with no parting implied. The face is a zero-allowance skim. NC uses G18/G94/G97 and retracts outside the bar before axial return. This is an ideal point-tool preview, without insert/chuck/controller qualification; it never grants verified release. Invalid profiles or excessive computation are refused. Use `cam_edit.turn` with the same input and optional `expectedRevision` to save that identical NC for the desktop viewer; `cam.machine` with `machineType: "lathe"` and `operationId` reads it with its stored stock settings, while `cam.review` reports preview or stale. Do not regenerate it through the legacy generator.

## Picking a tool

Use library action lookup_tool. Confirm the cutter radius fits the smallest inside radius, the cutting length covers the depth, and RPM stays under both the tool and machine maximum.

`toolType` is what an operation says the cutter IS, and the generator reads it: {{toolTypes}}. Everything else (diameter, flutes, reach, materials) comes from the library row.

## Setups

A flip is a new setup with its own stock, origin, work offset, fixtures and tools. Never reuse the first setup's depths.

## Verifying each operation

For every operation: cam_edit action generate, then cam action analyze, then cam_edit action verify. Fix by cause, regenerate, verify again. After three rounds on the same finding, report the blocker. Report what was modelled; never write "safe".
