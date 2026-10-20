# Parametric parts in cadcamfun

A part the user will iterate on ("in three sizes", "depending on the part family", "we'll tune this with the customer") is one parametric element, not loose solids.

## Anatomy

A parametric element holds `history: { parameters, features }`.

- `parameters`: named dimensions, numbers or expressions of each other (`"half": "width / 2"`). Cycles are rejected.
- `features` run in order: `sketch`, `extrude` (optional `edge` chamfer/fillet round the end faces, `corner` rounding of the profile and `taper` draft angle), `revolve`, `hole` (`kind`: simple, counterbore, countersink), `pattern` (linear, circular, grid, or `path`: copies ride the open chain of the sketch named by `path`, spaced by arc length and turned with its tangent), `mirror`, `sweep` (profile along a path sketch, optional `bendRadius` for pipe bends), `loft` (through sketch sections), `shell` (hollow an extrude, full revolve or sweep, optionally open) and `fillet` (round or chamfer edges between planar faces). A dimension is a parameter name or an expression.
- Sketches take parametric `shapes` (rectangle, circle, polygon, ellipse, slot, polyline, spline/Bezier/NURBS curve) as well as hand-built entities; more features exist beyond these: `primitive` (3D catalogue solids with parametric measures), `coil`, `move`, `scale`, `split`, `combine`. The `fusion-360-modelling` skill maps every Fusion 360 command to one of them.
- History is a JSON object, never a string. Features and constraints use `type`; sketch entities use `kind: point|line|circle|arc|ellipse|spline`. Lines use point IDs in `p1/p2`; circles use a point ID in `center`. An ellipse sizes with an `ellipseSize` constraint; a spline is a Catmull-Rom curve through its `points` (`closed: true` for a smooth profile). Validate with `cad` action `parametric_validate` before `cad_edit` action `parametric_create`, and send this exact example (a Ø20 cylinder) rather than inventing a rectangle entity:

```json
{"history":{"parameters":{"radius":10,"height":20},"features":[{"id":"profile","type":"sketch","plane":"XY","sketch":{"entities":[{"id":"origin","kind":"point","x":0,"y":0},{"id":"outline","kind":"circle","center":"origin","radius":10}],"constraints":[{"type":"fixed","point":"origin","x":0,"y":0},{"type":"radius","circle":"outline","value":"radius"}]}},{"id":"body","type":"extrude","sketch":"profile","depth":"height","operation":"new"}]}}
```

Send it to `cad` with `{"action":"parametric_validate","history":{...}}`. Change `parameters.height` to resize it; `cad_edit` `parametric_update` does that on an existing part with its revision.

## Workflow

1. If the user names a quantity that will change (count, diameter, thickness, hole spacing), make it a parameter.
2. Sketch on plane `XY` by default, with named lengths tied to parameters.
3. Extrude with `operation: "new"`, `direction: "up"`, `depth` set to a parameter name.
4. Add features that reference parameter names, then call cad action parametric_validate validate. Repair the reported paths and rebuild errors before create; switching to cad_edit action add cannot bypass the same history schema.
5. End with cad action check. On `RebuildFailed`, read the cause, fix it, repeat.
6. Save with vcs_edit action commit on the checked-out branch (see the version-control-cadcam skill).

## Standard parts and design rules

- cad action parametric_recipe generates (cad_edit action parametric_recipe_create stores it) mounting_plate, flange, l_bracket, stepped_shaft, enclosure, pipe_bend (long-radius bend by default, `bendRadius` 0 = mitred) or duct_transition from design inputs (fastener size, diameters, bolt count); holes follow ISO 273, counterbores ISO 4762 / DIN 974, keyways DIN 6885, and edge distance and spacing rules are enforced. Edit its parameters afterwards.
- cad action parametric_fastener returns thread, tap drill, clearance and counterbore sizes. cad action parametric_dfm returns the manufacturability findings for a process, cutter and material; fix errors before CAM.

## Exact model (B-rep)

- Every validate and recipe report carries `exact`: per body the exact solid's volume, area, centroid, `throughHoles`, face count and surface kinds (plane, cylinder, cone, sphere, torus, nurbs), or the `reason` the body has only its mesh. Quote volumes and masses from `exact`, not from the mesh `volumeMm3`. The report spends at most 1.5 s on it: a heavy part (many fillets) says "time budget" instead; then ask cad action `parametric_exact`, which takes up to a minute. Do not wait on it while building.
- cad action `parametric_exact` (`elementId` or `history`, `includeStep: true`) returns the same and the STEP AP214 file of the exact bodies, for the user's other CAD systems.
- Exact features: extrude (with rounded or bevelled profile corners, `taper`, filleted or chamfered end rims), revolve, sweep along lines and arcs (`bendRadius` bends), loft, hole (all kinds), `fillet` and chamfer of straight edges and of coaxial rims (plane, cylinder, cone), `shell` of an extrude, a full revolution or a sweep, `draft` and `pushpull` of a planar face, `mate`, the analytic catalogue solids (cube, cylinder, cone, sphere, hemisphere, torus, prism, pyramid) with their rotation, move, uniform scale, mirror, pattern, split, combine and every union, subtract and intersect. Only coil, rib, sheet, text, a modelled thread, drafts and push/pulls of curved faces, blends of non-coaxial curved edges, a non-uniform scale and the other catalogue solids keep the mesh alone: read the `reason` in the report and, when the part is for STEP, CAM features or inspection, build it from exact features and say which bodies are mesh-only. Do not avoid fillets, shells or sweeps for fear of losing exactness.
- The whole drawing, not one history: cad action `exact` (STEP imports, Booleans and parts together: per solid validity, volume, bounds, holes, and whether CAM will machine it by features or as a 3D surface job, with the reason) and cad action `assembly` (exact interference with clash volumes, bill of materials with mass, hole joints, fasteners still missing). Run them after a multi-part build and report the clashes and missing fasteners they name.

## Editing later

- Resize: cad action parametric_validate inspect, then update with the real elementId, returned expectedRevision and `parameters: {width:70}`. Features and element ID stay. Inspect again if the revision is stale.
- Add a feature: append it to the same parametric's history.
- Rewrite the whole history only when the user asks. It is destructive.

## When not to use parametric

- One-off solids the user will not dimension-drive.
- Expressions that chain beyond about ten steps. Split the part.

## Limitations

- Not available in a history: variable-radius fillets, fillets between non-coaxial curved faces (the exact model drops to the mesh), shell of a Boolean result, loft guide rails and tangency, pattern along a path. Say so instead of faking them.
