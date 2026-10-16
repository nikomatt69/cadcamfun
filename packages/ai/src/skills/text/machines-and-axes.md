# Machines, axes and zeros

The same drawing becomes a different program on each machine. Program as if the TOOL moves round a fixed workpiece (ISO 841); what differs is what turns and what is made. Call cam action machine for the exact table.

| | Mill | Lathe | 3D printer |
| --- | --- | --- | --- |
| What turns | the tool (spindle) | the workpiece (chuck) | nothing |
| Process | removes material | removes material | adds material |
| Axes | X Y Z | X (diameter) Z, no Y | X Y Z, E (filament) |
| +Z | up, away from the part | away from the chuck | up the build |
| Z0 | top of the stock | finished front face | the plate |
| A cut goes | to negative Z, then in XY | -Z towards the chuck, X towards the axis | Z up, layer by layer |
| Plane | G17 | G18 | G17 |

## Zeros
- Mill: choose the origin (`originType`: stock centre, stock corner, machine zero, custom) and the work offset (`workOffset` G54..G59: G54 is the default and is not written). Several parts or setups use different offsets.
- Lathe: `latheZero` is the finished face (stock at negative Z) or the chuck face (Z grows towards the front). Moving towards the chuck is -Z in both.
- Printer: `bedOrigin` is the plate's front-left corner or its centre (delta printers); the part is always set down on the plate (bottom at Z0) and centred, and it is reported if it does not fit (`bedWidth`, `bedDepth`).

## Touch probes and tool setters
- `toolType` probe or toolsetter, operation `probing`, spindle OFF. Cycles: zSurface, edgeX, edgeY, corner, bore, boss, toolLength. The stylus is a ball: contact is half a tip diameter before the surface; the cycles correct for it (`probeStylus`).
- The result goes into the chosen work offset, so probing and machining share `workOffset`. `probeDialect`: linuxcnc (G38.2, G10 L20) or fanuc (G31, macro variables).
- Probe first, machine after: a program that measures its own zero removes setup error. Say which offset it wrote.

## What the CAM preview shows
The preview draws each program on its machine, and the checks use the same geometry. Read it with cam action vision (its `spatial` has the machine, the mapping, the tool in program and display coordinates, the spindle and the findings).

| | Mill | Lathe | 3D printer |
| --- | --- | --- | --- |
| Turns | the tool (M3: clockwise seen from the spindle looking down) | the bar with the chuck (M3: clockwise seen from the headstock) | nothing |
| Fixed | the part, clamped | the tool (it only travels in X and Z) | the bed (or it moves, by `printerKinematics`) |
| Drawn | stock, vise / clamps / plate, table | chuck, jaws, the bar being turned live, the insert | bed, build volume, nozzle, deposited beads |
| Picture | as programmed, Z up | spindle axis horizontal, chuck on the left, +Z to the right, X drawn as a radius (up for a rear turret, down for a front one) | as programmed |

The machine shown comes from the generator's output, the kernel (mill), or the G-code's own words; a mismatch is flagged. Lines the replay cannot run (G70-G76 lathe cycles) make a "partial preview".

## Running a program on its machine
cam action machine with `gcode` (or `operationId`), optional `params` (the workholding below, a mill `stock`) and `at` (seconds) answers the kinematics for that program: what turns and in which sense, where the tool is at `at` (program and preview coordinates, spindle, rpm, line), the set-up findings, the turned part (Z ranges and diameters) or the printed layers. Use it to check a change before writing it, and to explain what the preview shows.

## Workholding
Set it with the operation's params (cam_edit create / update), then the preview updates:
- Mill: `workholding` vise | clamps | plate | none; `viseJawAxis` x (jaws along X, clamping across Y) | y; `clampDepth` mm gripped (0 = a third of the stock, 3-10 mm); `parallelsHeight`; `viseJawHeight`. Keep the deepest cut above the jaws (stock top - depth > stock bottom + clampDepth) or cut outside the jaws.
- Lathe: `latheTurret` rear | front, `chuckType` 3-jaw | 4-jaw | collet, `gripLength`, `stockBore`, `tailstock`. Stickout = stockLength - gripLength; above 4 x the diameter use the tailstock. Never feed into the jaws: Z stays in front of the grip.
- Printer: `printerKinematics`, `buildHeight`, `bedWidth`, `bedDepth`, `bedOrigin`.
- `workholdingConfigured: true` makes it real: drawn solid, checked, and passed to the verifier as fixtures. Until then it is an assumption (translucent) and its findings are warnings. Say which it is.

## Checking
- cam action analyze with `machineType` catches what is illogical for the axes: Y on a lathe, X through the axis, a cut away from the chuck, a spindle that never started, cold extrusion, a build that goes down.
- cam_edit action verify simulates mills only; it includes the configured vise / clamps as fixtures.
- Set-up findings: MILL_INTO_VISE / CLAMP / PARALLEL / TABLE, LATHE_INTO_CHUCK / TAILSTOCK, PRINTER_OFF_BED / ABOVE_VOLUME / FIRST_LAYER_HIGH.
