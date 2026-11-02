# Constrained sketches, assemblies, drawing sheets and mesh files

One call, `cad` action `workflow`, with `op`. It computes from the values you send and stores nothing; lengths are mm, angles degrees.
To keep a result, write it into a part with `cad_edit` (a sketch with the same constraints in a parametric history, an assembly as component
elements), or hand the file back to the user.

## op `sketch`: solve before you store
Send `entities` (points are the unknowns; lines, circles, arcs, ellipses and splines name points by id) and `constraints`
(`{type, ...fields}`): fixed, coincident, horizontal, vertical, horizontalPoints, verticalPoints, distance, distanceX, distanceY, length,
parallel, perpendicular, equalLength, equalRadius, radius, diameter, angle (degrees), pointOnLine, pointOnCircle, midpoint, symmetric,
tangentLineCircle, tangentCircles, concentric, ellipseSize, pointOnEllipse, collinear. Add `driven: true` to a dimension to read its value
without constraining.
- `status`: fully-constrained (dof 0), under-constrained (`free` lists the points that still move, `freedom` how many directions),
  over-constrained (`redundant` names constraints that add nothing; harmless but remove them), conflicting (`conflictSet` is a minimal set
  that cannot hold together: change one of them), failed (did not converge: start nearer the intended shape).
- Dimension a sketch until `dof` is 0, then store it. A closed chain gives `profiles.areas` to check against what you expect.
- `drag: {entity, to}` moves a point (a line moves both ends, a circle its centre) with every constraint holding. `drag.reached: false`
  means the constraints forbid the target; `blockedBy` names them and the sketch sits at the nearest feasible pose. A constraint is never relaxed.
- The solver finds the solution nearest the drawn geometry, not every solution: draw roughly where you want it.

## op `assembly`: place, mate, check
`definitions` (box: corner at the origin; cylinder: base centre at the origin, axis z; or a `history`), `occurrences` (`at`, `rotate`,
`grounded`: ground at least one), `mates`. Features are given in the part's own frame: `{kind:"point",p}`, `{kind:"axis",origin,dir,radius?}`,
`{kind:"plane",origin,normal}` (outward). Instead of a feature an operand may name a `face` index of the definition's exact body (a box: 0 bottom, 1 top, 2 -y, 3 +y, 4 -x, 5 +x; a cylinder: its curved face is the axis).
Mate kinds: coincident (point-point, point-plane, point-axis, plane-plane with `offset`, `flip`; axis-axis), concentric, parallel, perpendicular,
distance (`value`), angle (`value`), tangent (cylinder axis with `radius` against a plane), lock (occurrence ids `a`, `b`), revolute and slider
(`value`, `limits {min,max}`), cylindrical (`angle`, `slide`), planar, ball. Planes face each other: for two faces that touch use normals that
point away from their solids and a coincident mate.
- Read `status` and `dof` (a pin in a hole with its shoulder seated leaves 1: the spin), `freedom` per occurrence, `redundantMates`,
  `conflictSet`. `placements` is the world pose of every occurrence: translation `t` and row-major rotation `m`.
- Variants and structure: an occurrence of a `history` definition takes `overrides` (`{w: 60}`: its parameters, rebuilt exactly for that copy only). `subAssemblies` (`{id, occurrences}`) are reusable groups placed by an occurrence whose `definition` is the group's id; mates, `placements` and `leaves` then name parts by path (`gearbox/bolt2`). Grounding a sub-assembly grounds every part in it: ground one part inside instead. `configurations` (`{name, parameters: {definitionId: {w: 80}}, suppressed: [paths], hidden}`) or a `designTable` (columns `name`, `definition.parameter`, `suppress:<path>`; rows) define named variants, and `configuration` picks the one that is solved and checked (mass, bom, interference, clearance); order of precedence: definition value, configuration, occurrence override. Compare variants by calling once per configuration.
- `checks`: interference (exact overlap volume per pair), mass (needs `density` on the definitions), bom, clearance.
- `drive: {joint, from, to, steps}` sweeps a revolute or slider mate; each step starts from the previous pose. `firstClash` is the first
  step where parts overlap (interference check, at most 60 steps). A step that cannot be solved ends the drive and says so.

## op `sheet`: the production drawing
`elementId` of a parametric part or an inline `history`; `options` are the `cad` action `drawing` options (size A4|A3|A2, views, iso, scale,
section, detail, notes, gdt, datums, balloons, title block fields). The result is a vector PDF (paths and Helvetica text, no raster) as
`data` base64 when it fits, with the views and every dimension text. Edit a dimension of the model and call again: the sheet is regenerated
from the model, so views and dimensions follow. `format: "svg"` returns the SVG. Characters outside WinAnsi are substituted and counted.

## op `mesh_import` and `mesh_export`
- `mesh_import`: STL (binary or ASCII), OBJ or 3MF as `attachment` (a text file) or `data` (base64). STL and OBJ carry no unit: give `unit`
  (default millimeter); 3MF declares its own. The mesh is welded, degenerate and duplicate triangles dropped, orientation made consistent and
  outward; `repair.maxHoleEdges` closes small holes. Read `solid` and `remaining` per mesh: a mesh that is not closed cannot be machined or
  printed as a solid. `requireSolid: true` refuses it with the defect list. Nothing is stored (`stored: false`); a mesh is geometry, no
  history is recovered, and it is not converted to exact surfaces.
- `mesh_export`: the exact bodies of a part as `format` stl, obj or 3mf (default 3mf, `unit` as written in the file). Each body reports its
  triangles, volume and whether it is a closed solid.

## Limits to say out loud
Sketches are 2D with point-based entities; NURBS splines, 3D sketches and sketch blocks are not in this call. Mates solve rigid
occurrences from their present pose (one solution, not all assembly modes). Sheet metal unfolding and weldment cut lists are not here.
