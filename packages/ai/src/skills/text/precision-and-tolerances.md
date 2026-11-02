# Micron-level work

Preserve meaningful input precision and distinguish numerical geometry, machining targets and measured acceptance. A detailed decimal value is not evidence of achieved manufacturing accuracy.

## Writing the model
- 1 micron = 0.001 mm. Keep three numbers separate: nominal drawing size, acceptance limits and an explicitly chosen machining target. For example, 25 H7 gives 25.000 to 25.021 mm and a midpoint of 25.0105 mm; a midpoint is a candidate target, not an instruction to alter nominal CAD. Preserve the design nominal/fit, report the chosen machining allowance or offset separately, and compare actual measurements against the limits.
- Worked shaft example: 25 g6, limits 24.980 to 24.993 mm: 24.9865 mm is the candidate midpoint; retain the 25 mm nominal and validate the applicable fit table/edition for the drawing.
- Round geometry may have an exact body plus a display/export tessellation. Choose supported tolerance/segments for the required artifact; do not force micron meshes on unrelated parts. Read achieved deviation and warnings instead of assuming requested tolerance was reached.
- Never round for readability. Report sizes with the decimals that matter.

## ISO 286 tolerance grades (micron, nominal size ranges in mm)
| Range | IT6 | IT7 | IT8 |
| --- | --- | --- | --- |
| 3-6 | 8 | 12 | 18 |
| 6-10 | 9 | 15 | 22 |
| 10-18 | 11 | 18 | 27 |
| 18-30 | 13 | 21 | 33 |
| 30-50 | 16 | 25 | 39 |
| 50-80 | 19 | 30 | 46 |
An H hole starts at its nominal size and goes up by the grade; a shaft size has its own fundamental deviation (g, h, k...): look the letter up, do not guess.

## Machining it
- Roughing leaves 0.1-0.3 mm; one or two finishing passes take 0.05-0.2 mm with a light stepdown. Set `tolerance` 0.001 or finer and `finishingPass` true.
- Check the actual post's coordinate precision and rounding in stored NC; legacy output commonly uses 0.001 mm. A finer requested tolerance does not increase the written precision or prove machine accuracy.
- Tool wear, tool deflection, thermal growth and the machine's own accuracy are not modelled. Say so; propose a first-off measurement and an offset correction.

## Checking it
- cam_edit action verify (cam_verify for the dedicated verifier) uses sampled stock/target geometry. Give targetSolids, suitable resolution/tolerance and the actual stock bounds; read cell size, coarsening and modelling limits. A local crop is a partial study and cannot replace full-program fixture, stock and travel coverage.
- A pass means "no gouge beyond the tolerance at that resolution", never "in tolerance on the machine".
