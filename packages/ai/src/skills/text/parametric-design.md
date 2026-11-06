# Parametric parts in cadcamfun

A part the user will iterate on ("in three sizes", "depending on the part family", "we'll tune this with the customer") is one parametric element, not loose solids.

## Anatomy

A parametric element holds `history: { parameters, features }`.

- `parameters`: named dimensions, numbers or expressions of each other (`"half": "width / 2"`). Cycles are rejected.
- `features` run in order: `sketch`, `extrude` (optional `edge` chamfer/fillet round the end faces, `corner` rounding of the profile and `taper` draft angle), `revolve`, `hole` (`kind`: simple, counterbore, countersink), `pattern` (linear, circular, grid, or `path`: copies ride the open chain of the sketch named by `path`, spaced by arc length and turned with its tangent), `mirror`, `sweep` (profile along a path sketch, optional `bendRadius` for pipe bends), `loft` (through sketch sections), `shell` (hollow an extrude, full revolve or sweep, optionally open) and `fillet` (round or chamfer edges between planar faces). A dimension is a parameter name or an expression.
- Sketches take parametric `shapes` (rectangle, circle, polygon, ellipse, slot, polyline, spline/Bezier/NURBS curve) as well as hand-built entities; more features exist beyond these: `primitive` (3D catalogue solids with parametric measures), `coil`, `move`, `scale`, `split`, `combine`. The `fusion-360-modelling` skill maps every Fusion 360 command to one of them.
- History is a JSON object, never a string. Nested sketch.entities and sketch.constraints are arrays; centered/closed are actual booleans, not quoted strings. Features and constraints use type; sketch entities use kind: point|line|circle|arc|ellipse|spline. Lines use point IDs in p1/p2; circles use a point ID in center. An ellipse uses ellipseSize; a spline is a Catmull-Rom curve through points. Validate a new history with cad action parametric_validate before cad_edit action parametric_create. This working example is a Ø20 cylinder; adapt dimensions and construction to the actual task instead of copying unrelated geometry:

```json
{"history":{"parameters":{"radius":10,"height":20},"features":[{"id":"profile","type":"sketch","plane":"XY","sketch":{"entities":[{"id":"origin","kind":"point","x":0,"y":0},{"id":"outline","kind":"circle","center":"origin","radius":10}],"constraints":[{"type":"fixed","point":"origin","x":0,"y":0},{"type":"radius","circle":"outline","value":"radius"}]}},{"id":"body","type":"extrude","sketch":"profile","depth":"height","operation":"new"}]}}
```

Send it to `cad` with `{"action":"parametric_validate","history":{...}}`. Change `parameters.height` to resize it; `cad_edit` `parametric_update` does that on an existing part with its revision.

## Workflow

1. If the user names a quantity that will change (count, diameter, thickness, hole spacing), make it a parameter.
2. Sketch on plane `XY` by default, with named lengths tied to parameters.
3. Extrude with `operation: "new"`, `direction: "up"`, `depth` set to a parameter name.
4. Add features that reference parameter names, then call cad action parametric_validate. Switching to cad_edit action add cannot bypass the same history schema.
5. Read `verification` of every validate, create, update and edit answer before the next step: `verdict` (valid, review, failed), `volumeMm3` and `sizeMm` against your hand computation, `throughHoles` against the holes you meant, and every line of `attention` (a hole that removes no material, a union that left a separate lump, a sketch not fully constrained, literal sizes). A `review` is fixed or reported, never ignored. `exactPending` means the exact model did not finish in the interactive budget: call `parametric_exact` before quoting an exact volume, mass or STEP.
6. A refusal has `error` and `diagnosis`: `rootCauses` (the first failing feature, with a `hint`) or `removedLastSolid` (the feature whose cut ate the part). Fix that feature first; later "Not built" lines only follow from it. A rebuild failure of a variant leaves the stored part untouched.
7. Geometry is persisted by a successful create/update/edit, not by a prose report. Commit only when requested; see version-control-cadcam. Retain returned ids/revision for the next action.

## Design intent, in this order

- Parameters first (named for meaning, derived ones as expressions: `"boreD": "bearingOD - 2 * wall"`), one fully constrained sketch per feature (`shapes`), features in a robust order: base solid, then large cuts and bosses, then holes and patterns, and rounds and chamfers last (they select edges the earlier features made, so reordering them earlier changes or loses the selection).
- Sizes from tables, not memory: `parametric_fastener` (clearance, tap drill, counterbore), `parametric_recipe` for standard parts, DIN 6885 keys, ISO 15 bearing seats. A hole near an edge keeps 1.5 x its diameter; check with `parametric_dfm` for the process before CAM.
- Reference by stable names (see cad-naming), not indexes; bind later changes with `parametric_edit` instead of rewriting the history.
- Dimension checks: compare returned size and volume with expected dominant shapes; mesh accuracy depends on tessellation and exact evidence may carry recovery warnings. Do not assert a fixed percentage guarantee. When variant testing is required, cad action parametric_test checks alternatives without mutating the stored part.

## When a build fails

| Message | Do |
| --- | --- |
| Unknown name 'x' | add the parameter or fix the spelling (the answer lists the defined ones) |
| fillet or chamfer not blended | radius below half the shortest adjacent edge and half the thinnest wall (the kernel does not always refuse an oversize radius: check `sizeMm`); fewer edges (`edges.within`, `parallel`); or a chamfer of the same size |
| shell leaves no cavity | wall below half the thinnest size, or open a face |
| size must be positive | a parameter or expression went to zero or negative: print the parameters, fix the one that did |
| cut leaves no solid (`removedLastSolid`) | shrink the cutting sketch or depth so it overlaps part of the body |
| disjoint lumps after a union | inspect contact and intended body count; correct the placement within design constraints, or keep a deliberate second body. Do not hide a dimensional change behind an arbitrary overlap |
| hole removes no material | plane, `offset` (the face height) and `at` must land on the body |

## Standard parts and design rules

- cad action parametric_recipe generates (cad_edit action parametric_recipe_create stores it) mounting_plate, flange, l_bracket, stepped_shaft, enclosure, pipe_bend (long-radius bend by default, `bendRadius` 0 = mitred) or duct_transition from design inputs (fastener size, diameters, bolt count); holes follow ISO 273, counterbores ISO 4762 / DIN 974, keyways DIN 6885, and edge distance and spacing rules are enforced. Edit its parameters afterwards.
- cad action parametric_fastener returns thread, tap drill, clearance and counterbore sizes. cad action parametric_dfm returns the manufacturability findings for a process, cutter and material; fix errors before CAM.

## Exact model (B-rep)

- Validate/recipe reports carry per-body exact evidence: volume, area, centroid, throughHoles, face count and surface kinds, or the mesh-only reason. Quote exact volume/mass only when the relevant body completed exact reconstruction; preserve Boolean recovery warnings. If the deterministic interactive work budget is exhausted, call cad action parametric_exact when exact evidence is needed. Its duration depends on geometry and worker load; continue independent work rather than inventing a time guarantee.
- cad action `parametric_exact` (`elementId` or `history`, `includeStep: true`) returns the same and the STEP AP214 file of the exact bodies, for the user's other CAD systems.
- Exact features: extrude (with rounded or bevelled profile corners, `taper`, filleted or chamfered end rims), revolve, sweep along lines and arcs (`bendRadius` bends), loft, hole (all kinds), `fillet` and chamfer of straight edges and of coaxial rims (plane, cylinder, cone), `shell` of an extrude, a full revolution or a sweep, `draft` and `pushpull` of a planar face, `mate`, the analytic catalogue solids (cube, cylinder, cone, sphere, hemisphere, torus, prism, pyramid) with their rotation, move, uniform scale, mirror, pattern, split, combine and every union, subtract and intersect. Coil, rib, sheet, text, a non-uniform scale, the capsule and a modelled thread (a faceted helicoid, volume within 0.2 % of the analytic thread; up to 24 turns when rebuilt interactively, longer ones in the STEP export and the CAM kernel) are exact too. The `draft` of the wall of a hole or the side of a boss along the pull is exact too (a cone, checked against the frustum volume; an undercut or a counterbore wall is refused). The `pushpull` of the same walls is exact too (a change of radius: out of the solid grows a boss and shrinks a hole), and so are the draft and push/pull of the side of a conical boss, of the dome that ends a round pin, and of a lone ball or ring. Only the draft and push/pull of other curved faces (a free-form face, a socket, a fillet band), blends of non-coaxial curved edges, the catalogue ellipsoid, and a thread too long for an interactive rebuild keep the mesh alone: read the `reason` in the report and, when the part is for STEP, CAM features or inspection, build it from exact features and say which bodies are mesh-only. Do not avoid fillets, shells or sweeps for fear of losing exactness.
- The whole drawing, not one history: cad action `exact` (STEP imports, Booleans and parts together: per solid validity, volume, bounds, holes, and whether CAM will machine it by features or as a 3D surface job, with the reason) and cad action `assembly` (exact interference with clash volumes, bill of materials with mass, hole joints, fasteners still missing). Run them after a multi-part build and report the clashes and missing fasteners they name.

## Editing later

- Resize: cad action parametric_inspect, then cad_edit action parametric_update with the real elementId, returned revision as expectedRevision and parameters: {width:70}. Features and element ID stay. Reinspect on stale revision; do not invent a replacement revision.
- Anything else, on the stored part, with `cad_edit` `parametric_edit` (elementId, expectedRevision, `edits`, all or nothing): `set_parameter` (adds a new name too), `rename_parameter` (formulas follow), `remove_parameter`, `set_dimension` (feature, path from `parametric_inspect`, number or expression: bind a literal to a parameter), `insert_feature` (new id, after a feature or at the end), `replace_feature` (same id and type, full definition), `remove_feature` (`cascade: true` when dependents go with it), `rename_feature`, `group_features`, `ungroup_features`. A rebuild error the edits cause refuses the list and names it. Never rewrite the whole history to change one thing; the user must ask for that.
- Hole `thread` {designation, depth, fit}, `tolerance` {upper, lower} and `fit` (H7) are drawing data: the drawing prints them, the geometry stays the tap drill or nominal diameter.

## Variants of one part (configurations)

- A configuration is a named set of parameter values plus the suppressed features; one is shown, and showing it writes its values and suppressions into the part, so the drawing, CAM and exports see that variant. Define them with `parametric_edit` in one atomic list: `add_configuration {name, values: {width: 100}, suppress: ["hole1"]}` starts from the state the part shows now (the first one also keeps that state as `default`) and becomes the shown variant; one `add_configuration` per row is a design table. `set_configuration` changes a variant without showing it (`clear` makes a value follow the current one again), `activate_configuration {id}` shows one, `rename_configuration`, `remove_configuration`.
- A plain parameter edit while a variant is shown changes that variant, never the others. `values` take existing parameters only (add the parameter first with `set_parameter` in the same list). Removing a feature or renaming a parameter follows through every variant.
- Read: cad `parametric_configurations` (elementId) is the design table, only the parameters and suppressed features that differ; `compare: true` rebuilds each variant on its own and measures it (volume, mass, bounds, centre of gravity, problems) without changing what is stored. Compare before recommending a variant; quote its numbers, not the shown part's.

## Mass, centre of gravity, sketch freedom

- Give the part a `material` (a library grade or designation: aluminium, EN AW-6061, S235JR, PA6; `parametric_create` takes it, `cad_edit` `modify` changes it). The verification then carries `massG` = volume x library density (same source as `volumeMm3`: quote it only when `volumeSource` is exact, else call `parametric_exact`), `material.densityGcm3` and `centerOfGravityMm` (exact bodies, part frame, before the element's x/y/z). A material the library does not know yields no mass and says so in `attention`; cad `exact` gives the same `massG` per part and in `totals`.
- `verification.sketches` lists every sketch that is not fully constrained with its `dof` (degrees of freedom left), `freePoints`, `conflicts` and `redundant` constraints. Under-constrained: `add_sketch_constraint {feature, constraint: {type: "length", line: "l2", value: "depth"}}` until `dof` is 0. Over-constrained: `remove_sketch_constraint {feature, index}` or `set_constraint_driven` (a reference dimension measures and constrains nothing). A constraint that clashes is refused with the names that cannot hold together. `parametric_inspect` with `feature` set to a sketch lists each constraint (index, name, state ok / redundant / conflict / driven, measured value of a reference).

## When not to use parametric

- One-off solids the user will not dimension-drive.
- Expressions that chain beyond about ten steps. Split the part.

## Limitations

- Not available in a history: fillets between non-coaxial curved faces (the exact model drops to the mesh), shell of a Boolean result, loft guide rails and tangency. Say so instead of faking them. Variable-radius fillets (`radiusEnd` on straight edges) and patterns along a path (`kind: "path"`) exist.
