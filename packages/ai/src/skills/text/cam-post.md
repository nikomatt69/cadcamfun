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
