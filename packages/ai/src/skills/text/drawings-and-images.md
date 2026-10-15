# From drawings and images to 3D

Three kinds of input, three routes. Pick by what the user attached (the message lists "Attached files").

## DXF, SVG or STEP file
- cad_edit action import with `attachment` (the file name) and `depth` (mm). It chains lines and arcs into closed profiles, extrudes each outer profile from Z0 along +Z, makes circles and inner loops holes, and reports outlines it could not close. Ask for the thickness if the user gave none; it is the only thing a flat drawing cannot say.
- STEP (`attachment` is enough, the part brings its height): reads prismatic parts from the flat face looking down; its warnings say what it did not read (steps, pockets with a floor, slopes, curved faces). Report them, and if the part was modelled lying on another plane retry with `up: "y"` or `"x"`. It is not a full STEP kernel: do not promise free-form surfaces.
- DXF is read in its own units (`$INSUNITS`) and lands in mm; SVG needs `scale` (mm per SVG unit) when it is not 1: a 96 dpi export in px is 0.2646.
- Open outlines: report how many, offer a larger `gap` (mm) and say where the break probably is. Never close a profile by guessing.
- Several parts in one file become several solids; give each a clear `name` and, if the user wants them stacked or moved, use cad_edit action modify.
- Afterwards run cad action check, then continue to CAM.

## Image of a drawing or a photo
- Look first, then list what you read: every dimension with its unit, the view it belongs to, tolerances and notes. Say what is unreadable or missing instead of filling it in.
- Build from the numbers with cad_edit action add: the base solid from the overall size, features one by one (holes as cylinders and one boolean-subtract, pockets, fillets as spheres/tori or a revolution profile, chamfers as extrusion profiles). A hole with a tolerance gets the middle of the limits.
- Three-view drawings: front gives X and Z, top gives X and Y, side gives Y and Z. Check that the same size read from two views agrees; if not, ask which is right.
- A photo has no scale: ask for one known dimension, then derive the rest and label them as estimates.
- After building, compare against the numbers you read: cad action describe gives the bounds; report any difference.

## Sketch by hand
Treat it like a photo: ask for the scale, build the outline as an `extrusion` profile, then add features.
