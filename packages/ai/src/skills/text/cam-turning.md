# Turning on the lathe planner (cam lathe)

`cam lathe` plans a whole turned part and replays the NC it writes against the revolved stock. It stores nothing and its release is always `preview`: a verified plan is a proof against the dialect description and the stock, not a controller acceptance. Program in diameter X, Z0 on the finished face, negative Z towards the chuck. `cam turn` stays the quick point-tool preview; use `cam lathe` for real inserts, grooves, threads and parting.

## Describe the job
- `stock`: `diameter`, `length` (bar), `bore` (pilot hole of a drilled bar), `faceAllowance` (bar standing out beyond Z0, default 0.5).
- `contour`: the finished OUTSIDE profile, face to chuck, points `{diameter, z}`, non-increasing z. `bore`: the finished INSIDE profile (needs `stock.bore`).
- `tools`: each `{id, number, kind: turning|boring|grooving|threading|parting}`. Turning, boring and threading tools carry an ISO 1832 `insert` (CNMG120408: shape C = 80 degrees, IC 12.7, thickness 4.76, nose R0.8) and the holder `approach` angle (95 for PCLNR, 93 for DDJNR). Grooving and parting tools carry `bladeWidth` and `bladeLength`.
- `operations`, in order. `face` (depth per pass), `rough` (side external|internal, depth per pass, allowance {x,z}), `finish` (springPasses), `groove` (z of the +Z wall, width, diameter), `thread` (diameter, pitch, zStart, zEnd, standard metric|whitworth|trapezoidal, starts, infeed radial|flank|alternating, springPasses), `part` (z of the finished end, stubDiameter).
- `post`: `fanuc` (writes G71 / G70 / G75 / G76 canned cycles where the path equals the cycle, explicit moves elsewhere, and says which) or `siemens` (explicit moves, `G33 K` threads, no cycle: CYCLE95 needs a contour subroutine this writer does not make).

## What the planner does
- The tool path is the contour offset by the NOSE RADIUS (the tool reference point is the nose centre; set the offset register to the nose centre). Convex corners get the nose arc.
- A pocket the roughing insert cannot enter (its limit angle: a 55 degree insert at 93 degrees profiles 32 degrees down, an 80 degree at 95 only 5) is bridged and listed in the notes; cut it with a `groove` operation. A steeper wall than the tool can generate is a warning, never a silent gouge.
- A thread cuts constant-chip-area passes (first depth times root n), then the spring passes; the spindle runs at constant rpm (G97) for a thread, constant surface speed (G96) with a ceiling otherwise.
- Thread depth is from the standard (ISO 262 external 0.6134 P, internal 0.5413 P; Tr: 0.5 P plus clearance).

## Read the answer
- `verification.verdict` is `matches` only when the replay gouges nothing and leaves nothing beyond `volumeBound` (the raster cell, mm3), no rapid hits the part and the replayed thread lead equals the programmed pitch. `gougeVolume`, `leftVolume`, `removedVolume` against `expectedRemoved` (closed form of the revolved profile) are all in the answer: quote them.
- `leftVolume` counts un-faced bar too: run `face` first. A missing `finish` shows as leftVolume above the bound.
- Warnings and `explicit[]` (an operation written as moves although a cycle exists, with the reason) must reach the user.

## Do not
- Do not promise tool life, chip control or surface finish: none is modelled. Do not claim live tooling, C-axis, sub-spindle transfer or mill-turn: not built (spec 52 T7, M1-M4).
- Do not store the NC as verified: `cam_edit turn` saves the point-tool preview only.
