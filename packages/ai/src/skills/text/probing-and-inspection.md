# Touch probing, work offsets and in-process inspection

## A probe is a sensor
- It is a tool in the spindle that must never turn under power: no M3 or M4, no coolant, spindle oriented when the probe asks for it (M19 through `orientSpindle`). `cam_edit probe` refuses a program that would start the spindle.
- A protected move stops on an unexpected touch; a touch that finds nothing within `search` is a missed touch and an alarm, not a measurement. Never read a missed report as a pass.
- The ball is not the point: the control reports the ball centre, so every surface is the centre plus the calibrated stylus radius in that direction. A probe that was never calibrated measures with the nominal radius: say so.

## Which cycle for which feature
| Feature | Cycle | Results |
| --- | --- | --- |
| Top face | `z-surface` | `z` |
| Side face | `edge` | `x`, `y`, along its normal |
| Outside or pocket corner | `corner` | `x`, `y`, and `rotation` with `touchesPerEdge: 2` |
| Hole, bore | `bore` | `x`, `y`, `diameter` |
| Round boss | `boss` | `x`, `y`, `diameter` |
| Slot | `pocket` | centre and `width` |
| Rib | `web` | centre and `width` |
| Rectangular block or pocket | `rectangle` | centre, `sizeX`, `sizeY` |
| Straight face out of square | `edge-angle` | `angle` |
| Face flatness and tilt | `plane` | `z`, `tiltA`, `tiltB`, `flatness` |
| Reference ball | `sphere` | centre |
| Tool length, radius, broken tool | `tool-length`, `tool-radius`, `broken-tool` | needs the machine's tool setter |
| Stylus calibration | `stylus-calibrate` | ring gauge, sphere or height |
| Rotary axis | `rotary-axis` | pivot and axis direction |

Send `feature {elementId, hint?}` and let the kernel choose from the part: it reads the element's solid, approaches from outside and says `chosenBecause`. Send `operation` (a cycle) only when the feature is not modelled. Angles on the wire are degrees. `depth` is how far below the top a side touch meets the wall.

A stylus must fit: the ball must clear a bore or a slot with room to search. The planner refuses one that does not; take a smaller stylus, do not shrink the search.

## Work offsets
- Offsets are machine state: they live on the machine configuration (`workOffsetTable`), per machine and per setup, never in the project. Name the machine with `machineConfig`.
- `workOffset` names what the cycle measures into: `G54`..`G59`, `G54.1 P3` (Haas `G154 P3`), Siemens `G505`..`G599` (G58 and G59 are not settable frames there), LinuxCNC `G59.1`..`G59.3`, Heidenhain `preset 4`. The address follows the control; an offset the control does not have is refused with the reason.
- Heidenhain writes presets only through its own cycles; GRBL only through `G10 L20`, with `update: set`.
- Without `workOffset` the program measures and moves nothing. That is the right default for inspection.

Update modes (`update`): `set` writes the correction; `report` never writes (a report-only run has nothing to apply); `update-within-tolerance` writes only inside `tolerance`; `alarm-outside-tolerance` stops beyond it. A correction larger than the policy's limit is a wrong datum or a crash, an alarm in every mode but `report`.

## Inspection
`checks` are characteristics: `name`, `kind` (`size`, `position`, `true-position`, `flatness`, `angle`), `result` (the cycle's result name), `nominal`, `lower`, `upper` (deviations, lower usually negative; an angle in degrees). Take nominals and limits from the PMI (`cad pmi_list`) or from the fit (ISO 286, skill industrial-standards), not from a guess. The report's verdict is one word: `pass`, `warn` (inside but using most of the band), `fail`, `missed`, `incomplete`. A failed check is an answer to report, not an error to retry.

## Tilted planes (5-axis)
`frame {a, b, c}` runs the cycle in a tilted plane, degrees. The control's tilted plane (G68.2, CYCLE800, PLANE SPATIAL) must be declared on the machine (`tiltedPlane`). Probing a tilted face measures in the plane and transforms back to the base work offset: report what the base offset moved by, not the tilted figure.

## Rotary calibration
A `rotary-axis` cycle measures a reference ball at several angles (at least three, spanning at least 20 degrees) and fits the true pivot and the axis direction. Give a `safeZ` above the ball at every angle. The result is written to the machine with `probe_apply`, never to a setup, and never to a machine parameter of the control: it replaces the pivot the kernel plans with. `calibrationError` on `probe_run` simulates a table that is not where the control believes.

## Tool setter
Tool cycles use `toolSetter` of the machine (top level, machine coordinates). Without one they are refused. A broken-tool check compares the length to the tool table within `brokenTolerance`.

## Machine configuration
`library_edit upsert_machine_config` takes `probing` (`stylusDiameter`, `toolNumber`, `feeds`, `overtravel`, `backoff`, `doubleTouch`, `orientSpindle`, `macroStyle`, `tiltedPlane`, `offsets`), `toolSetter`, `workOffsetTable`, and `rotaryCalibration` with the `rotary` block. `stylusDiameter` wins over the older `stylusRadius`. Leave out what the machine does not state.

## The loop
1. `cam_edit probe` stores the operation with its program, for the machine's control (`dialect` overrides it). Pass `expectedRevision` when you read one.
2. `cam_edit probe_run` simulates it on the modelled part and keeps the report. `misplace {x,y,z,a,b,c}` models a part that is not where the program thinks; the offset correction should recover it.
3. `cam_edit probe_apply` with the `reportId` and `mode: add` writes the correction. `mode: set` writes the report's values and needs a report measured on that machine. It refuses a failed, missed, incomplete or stale report and a report of another machine; on a conflict read the table and call again.
4. `cam review` reads the latest verdict: `unverified` before any report, `stale` after the drawing or the program changed.

A change of the drawing makes the operation stale: store it again, do not reuse the old report.

## What a report proves
A simulated report is the modelled part on the modelled machine, replayed from the program text. It is not a measurement of the real part and not controller acceptance: the vendor syntax is read from the manuals, not run on a control. Say so whenever you report it. Native cycles (Heidenhain 4xx, Siemens CYCLE97x, Renishaw G65) are not replayed.

## Dialects
`fanuc`, `haas`, `mazak`, `mitsubishi`, `brother` (G31, skip variables), `okuma`, `siemens` (MEAS), `heidenhain` (TCH PROBE), `linuxcnc` (G38.2), `grbl` (G38.2 with L20). A dialect that cannot write what the cycle needs is refused by name.
