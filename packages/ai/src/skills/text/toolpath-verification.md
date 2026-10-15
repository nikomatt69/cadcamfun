# Reading a verification report

cam_edit action verify replays the G-code on a height-field model of the stock. It answers "does this program damage anything it knows about", never "is this safe on the machine".

| Code | Meaning | What to do |
| --- | --- | --- |
| RapidInMaterial | a G0 move enters the stock | raise the clearance / retract height of the operation; check the first approach |
| ShankCollision | stock above the flutes touches the shank | a longer cutter, less depth per pass, or a smaller stepdown to leave a wider hole |
| HolderCollision | the holder reaches the stock | more stickout, a slimmer holder, or less depth |
| FixtureCollision | the tool, shank or holder hits a fixture box | move the toolpath or the clamp; say which fixture |
| BelowStock | the tip goes below the stock bottom | reduce the depth; through cuts need a spoilboard |
| Gouge | cut below the finished part by more than the tolerance | wrong offset (inside/outside), too much depth, or a wrong tool diameter |
| UncutStock | stock left above the finished part (information) | normal after roughing; finishing passes are needed |
| ResolutionCoarsened | the grid was coarsened to fit the budget | features under one cell are not resolved: say so |
| InterpreterWarning | a line of the program could not be read and was skipped | that move was NOT verified; regenerate, or simplify the line the message names |

Always state what was modelled (`modelled` in the result): without a holder, fixtures or a target part those checks did not run. Volume and air-cut numbers are planning figures. An InterpreterWarning means part of the program was never replayed, so the rest of the report does not cover it. Never write "safe", "certified" or "collision-free": write "no errors found in what was modelled".
