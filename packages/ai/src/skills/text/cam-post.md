# Posts, the post tester and feed optimisation (cam post_test, cam process)

## Post tester: `cam post_test`
Runs a post on a program, reads the text it wrote back with the reference interpreter (a separate reader, not the emitter) and compares the replay with the program that went in.
- `post`: generic, linuxcnc, fanuc, haas, mazak, mitsubishi, brother, okuma, siemens, heidenhain, grbl, or `all` (a table of every post).
- `gcode` absent: the standard sample program (profile with an arc, dwell, two tools, peck drilling). With `gcode`: the text is read into a program (`programOfNc`), posted by the chosen post and checked, so it is also a conversion check. A tapping cycle, spindle-synchronised thread, probing move or G95/G96 text is refused with the reason.
- `expected`: the output a shop wants; a line diff (blank lines and comments ignored) is returned and a difference fails the verdict.
- Checks: `replay` (no unsupported motion word), `bounds` (including arc extremes), `cut-length`, `endpoints`, `tools`, `spindle`, `end`, `expected`. Verdict `passed`, `failed` (name the check) or `refused` (the post cannot write this program, e.g. a rotary move on GRBL: report its reason).
- A pass means a reader of the dialect replays the same path. It is NOT controller acceptance: say so.

## Feed optimisation: `cam process`
Measures how much of the cutter is in material at every step of a 3-axis program and judges the load there.
- Needs the program (`gcode` or a saved `operationId`), the cutter (`tool`: diameter, flutes, optional kind flat|ball|bull, cornerRadius, stickout), `material`, `machine` (preset id, else the project machine), the `stock` block (program Z0 is usually `maxZ`) and the spindle `rpm` (default from cutting data).
- `mode: engagement` only judges the program as written: per toolpath the worst moves with ratio (load over limit; above 1 is over), binding limit (power, torque, deflection), engagement ae and force. `claim.before` is `passed`, `failed` or `unresolved` (five-axis moves are unresolved, never extrapolated).
- `mode: chip` holds the chip thickness, `power` holds the spindle at 80 percent of its power: both write the largest feed per piece inside every limit, never above the machine maximum or three times the programmed feed, never below 40 percent unless a limit demands it, with corner slowdowns as caps and a slew between neighbours. The optimised program is posted with `post` and returned as a preview with its hash and `cutTimeSaved` (negative when the original overloaded the tool: say so).
- Every number is `uncalibrated` Kienzle handbook data on a stock sampled at `bound.cellMm`; the engagement bound (`bound.aeMm`) is added to the radial depth when judging. Never call a result a prediction of the real machine, and never promise tool life or chatter stability (not modelled).
- A tool that is overloaded by its own program is slowed, not rejected: report both claims.

## Foreign NC: `cam verify_nc`
Replays NC the kernel did not write (another CAM system, a hand edit, a shop post) against the part, the stock and the tools in the spindle, on the tri-dexel stock. Nothing is stored.
- `gcode` or a saved `operationId`; `part` inline as CAD `elements` or closed `meshes` (drawing coordinates); `origin` is the work zero in those coordinates, so the part, the stock and the program share one frame. `stock` is the block in the work frame (`maxZ` is usually the program's Z0).
- `tools`: one entry per tool number the program selects (`number`, `diameter`, `flutes`, optional `kind`, `holderDiameter` and `holderLength` so the holder is probed too). A feed move with a tool you did not describe gives verdict `incomplete`, never a guess.
- `machine` (a preset id) adds its travel and rotary table; a move outside the travel is a finding.
- Verdict `faults`: a gouge (with the first NC line that cuts below the part, and its depth), a rapid through material, or a travel violation. `incomplete`: nothing was found but the replay did not see every move (reasons are listed: an arc written with the table turned, an unknown tool, a part that is not closed). `clean`: every move was replayed and nothing was found.
- Every figure carries `errorBoundMm`; a deviation under `thresholdMm` (tolerance plus that error) is not reported. `left` is stock left beyond the part plus the allowance: it is information, not a fault.
- A clean replay is NOT controller acceptance and not a machine, vise or table collision check: say so. Use `cam job` for the full machine and fixture checks of a program the kernel writes.

## Why a program is stale: `cam review` modelChange
A saved kernel program keeps the elements it was made from. `cam review` compares them with the drawing now and returns `modelChange`:
- `current` (with `displayOnly`: elements renamed, recoloured or moved to another layer, which never change the machined shape), `stale` or `unknown` (a legacy program, or a request without its elements: the reason is given and the program is never called current).
- `stale` has a class: `topology` (elements added or removed), `geometry` (a shape or placement changed: the ids are in `changed`), `rigid` (the whole part moved by `move`: the program is right for the part but not for the machine zero, so move the work offset, do not regenerate blindly), `inputs` (the model is the same, a setting differs).
- The review status `stale` also fires on a pure rename (the drawing revision changed); `modelChange.status: current` then says the geometry is the same. Report both: do not regenerate a program whose model did not change.
