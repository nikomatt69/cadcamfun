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

## Checking
- cam action analyze with `machineType` catches what is illogical for the axes: Y on a lathe, X through the axis, a cut away from the chuck, a spindle that never started, cold extrusion, a build that goes down.
- cam_edit action verify simulates mills only.
