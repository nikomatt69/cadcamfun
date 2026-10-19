# Fusion 360 commands in cadcamfun

Every command a designer reaches for in Fusion 360 has a counterpart in the parametric history. Use it instead of loose solids whenever the user may change a size, and tie every measure to a named parameter.

## Sketch (a `sketch` feature on plane XY, YZ or ZX, with an `offset`)

- Put profiles in `sketch.shapes` (no points to place, no constraints to write; fully constrained; every measure takes a number or an expression of the parameters):
  - 2-point or centre rectangle: `{id, kind:"rectangle", at:[x,y], width, height, centered?}`
  - circle: `{kind:"circle", at, diameter}`; polygon: `{kind:"polygon", at, sides, radius, flats?, rotation?}`; ellipse: `{kind:"ellipse", at, radiusX, radiusY}`
  - slot: `{kind:"slot", at, length, width, angle?}` (length is end to end, round ends included); any outline: `{kind:"polyline", points:[[x,y],...]}`
  - spline through points: `{kind:"curve", curve:"spline", points}`; control-point spline: `curve:"nurbs"` (degree 3 by default) or `curve:"bezier"`. An open curve is a sweep path; `chord:true` closes it with a straight line to make a profile; `closed:true` closes a spline or nurbs smoothly.
- Hand-built `entities` and `constraints` (point, line, circle, arc; tangent, parallel, symmetric, ...) are for drawings the shapes cannot express. A shape's points are named `<id>.p0`, `<id>.v1`, ... when you need to constrain against them.
- Two shapes in one sketch, one inside the other, make a ring: the inner loop is a hole.

## Work planes (Construct)

- A sketch, hole or text lies on XY, YZ, ZX or on the id of an earlier `plane` feature: `{id:"top", type:"plane", from:{kind:"offset", base:"XY", distance:"height"}}`, `{kind:"angle", base:"XY", angle:30, about:"u"}` (a tilted plane), `{kind:"points", points:[p1,p2,p3]}`, or **sketch on a face**: `{kind:"face", near:[x,y,z], normal:[0,0,1]}` puts the plane on the planar face of an existing body at its centre (a top face reads like XY, so sketch coordinates are measured from the face centre) and follows the face when a parameter changes. Use it for bosses, pockets, holes and text on a face instead of guessing offsets.

## Create

- Extrude (one side, `direction` down or symmetric, `taper` draft, `edge` and `corner` chamfer or fillet, `operation` new, union, subtract or intersect): `extrude`. A cut through the part: `subtract` with `direction:"symmetric"` and a depth larger than the part.
- Revolve (about the plane's x or y axis, or a line of the sketch; `angle` in degrees): `revolve`. Sweep (a profile sketch along a path sketch, `bendRadius` for pipe bends): `sweep`. Loft through two or more sketches, `smooth` optional: `loft`.
- Coil, spring or helix about Z: `coil` (radius, pitch above the wire diameter, turns, wireDiameter, round or square, right or left hand).
- Rib / web: `rib` (an earlier sketch with OPEN line chains drawn on the face the rib stands on; `thickness`, `depth`; united by default). Sheet metal: `sheet` (one open line chain is the profile; `thickness`, `width`, inside `bendRadius`, material `side` left/right/centre of the line); the flat pattern length is returned as `flatPatterns` by the validation report.
- Modelled thread: `thread` (`kind` external = a threaded rod, internal = the cutter of a tapped hole; `diameter`, ISO `pitch`, `length`, `at` [x,y], `offset` = start height along Z; handedness; `cut: true` cuts an external thread into the shaft that is already there). Pitches from the fastener tables (M8 1.25, M10 1.5): ask `parametric_fastener`.
- Text (emboss or engrave): `text` (`text`, cap `height`, `depth`, `plane` and `offset` at the face, `at`, `align`; operation union raises it, subtract with direction down cuts it in).
- Every solid of the 3D catalogue (box, cylinder, cone, sphere, ellipsoid, torus, prism, pyramid, hemisphere, capsule, gear, extrusion, revolution, sweep, loft, spring, bolt, screw, nut, washer, wall, floor, window, door, column, roof, stair): `primitive` with `params` (the same fields as the 3D elements: width, height, depth, radius, tubeRadius, sides, moduleValue, teeth, ...), `at` (the centre), `rotation` (degrees) and `operation`, so a catalogue solid can also cut.
- Make what is already drawn parametric: `cad` `parametric_from_element` returns the history of an element (its measures become named parameters, a flat shape gets a `depth`, a component becomes one feature per part), `cad_edit` `parametric_convert` stores the twin and leaves the original for you to delete once it is checked. Use it whenever the user asks to make something parametric or to change a drawn part by its dimensions.
- Hole (simple, counterbore, countersink; sized from the fastener tables with `parametric_fastener`): `hole`.

## Modify and arrange

- Fillet and chamfer edges: `fillet` (`style`, `edges` selection). A chamfer takes one setback (`radius`) on both faces, two distances (`radius` and `secondDistance`, the callout "2 x 1"), or a distance and an angle (`radius` and `angle` in degrees, "2 x 30°"): the first setback goes on the more horizontal of the two faces, the second on the other. Shell: `shell` (`open` top, bottom or both). Draft: `taper` on the extrude.
- Press Pull a flat face: `pushpull` (`near` a point on the face, `normal` to choose the top or the bottom, `distance` positive grows the body, negative cuts it; holes in the face stay; a curved face such as a boss side or a hole wall is offset along its normals, so a cylinder changes radius).
- Draft one face of any body: `draft` (`near` a point on the face, `angle`, `pull` direction, `neutral` plane position; positive leans the wall inward above the neutral plane; a curved face is drafted one way, neutral at its base or top, so a boss becomes a cone). Join two bodies rigidly face to face: `mate` (`body` moves its `face` flush against `to.face`, `offset` gap, `spin` degrees = revolute, `slide` [u,v] = slider, `limits` for the range of motion; an overlap of the two bodies is reported); both bodies must exist (operation new for the second).
- Combine bodies by id: `combine` (join, cut, intersect; `keepTools`). Split Body with a plane: `split`. Move/Copy: `move` (rotate in degrees, then translate; `copy`). Scale: `scale` (one factor or three).
- Rectangular and circular pattern: `pattern` (linear, grid, circular) of an earlier tool, or `bodies` to copy whole bodies; mirror: `mirror` through XY, YZ or ZX at an offset, of a tool or of `bodies` (`join: true` turns half of a symmetric part into the part: model the half, mirror it joined).

## Parameters

- Fusion's Change Parameters is `parameters`: numbers or expressions (`"half": "width / 2"`, `"pitch": "wire * 2.5"`, units mm cm m in deg rad, functions sin cos sqrt min max ...). Name them for what they mean, not "d1".
- Change a size later with `cad_edit` `parametric_update`; try variants first with `cad` `parametric_test` (nothing is written). A shape's measures are also reachable one by one (width, diameter, radius, length, angle).

## What is not there

Sheet-metal flanges with hems, flat-pattern DXF export and relief cuts (`sheet` makes the bent strip and reports its flat length), thread cosmetics on a cylinder that is not along Z (a modelled thread runs along Z), joints beyond the face `mate` (rigid, revolute by `spin`, slider by `slide`; no cam, gear or motion study). Say so and use the nearest feature rather than inventing a field.

## Example (it builds: a plate with a slot and three posts)

```json
{{fusionExample}}
```

Validate with `cad` action `parametric_validate`, read the issues, then `cad_edit` action `parametric_create`.

