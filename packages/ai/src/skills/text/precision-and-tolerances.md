# Micron-level work

Dimensions keep every decimal you give, so precision is a matter of what you write and what you check.

## Writing the model
- 1 micron = 0.001 mm. Three different numbers, never mixed up: the nominal is the size the drawing names (25), the limits are the two sizes the part may measure (25 H7: 25.000 to 25.021 mm), and the target is the size you machine to, normally the middle of the limits (25 H7: 25.0105 mm; a 25 g6 shaft, limits 24.980 to 24.993 mm: 24.9865 mm). Dimension and label with the nominal and its fit; model and machine at the target; report a measurement against the limits.
- Round shapes are meshes: give `tolerance: 0.001` on every round element (or `segments`), otherwise a radius of 50 mm is off by 0.24 mm. If the result carries `warnings`, the mesh could not reach it: say the deviation it did reach.
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
- G-code is written to 0.001 mm: it cannot express anything finer, so a tolerance under about 3 microns is a matter for the machine, the tool and the setup, not for the program.
- Tool wear, tool deflection, thermal growth and the machine's own accuracy are not modelled. Say so; propose a first-off measurement and an offset correction.

## Checking it
- cam_edit action verify is exact in height and one cell wide sideways. For micron checks narrow `stock` to the feature (a few mm), `resolution` 0.002-0.005, `tolerance` 0.001, and give the finished part in `targetSolids`.
- A pass means "no gouge beyond the tolerance at that resolution", never "in tolerance on the machine".
