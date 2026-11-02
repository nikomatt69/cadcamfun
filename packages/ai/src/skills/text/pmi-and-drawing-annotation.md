# PMI, GD&T and the title block

Tolerances, datums and surface finish can live on the model (PMI) and on the production sheet. Use this when the person asks for a toleranced drawing, datums, a feature control frame, a finish call-out or a filled-in title block.

## Where each thing lives
- PMI (product and manufacturing information) is stored with the drawing as one set: `{version: 1, annotations, captures}`. Read it with `cad` action `pmi_list` (the set, its `fingerprint` and `issues`). Check a candidate with `cad` action `pmi_validate` (nothing stored). Write with `cad_edit` action `pmi_set`.
- `pmi_set` REPLACES the whole set after validation. List first, change the list you read, send all of it back. Never send only the new annotation: the old ones are deleted.
- The title block is stored with the drawing too. `cad` action `title_block` returns the completed block and what it still lacks; `cad_edit` action `title_block_set` changes only the fields you give (`title`, `number`, `revision` up to 8 characters, `status`, `date` as YYYY-MM-DD, `createdBy`, `checkedBy`, `approvedBy`, `material`, `finish`, `standard`, `mass` in kg, `scale`, `projection` first|third, `units` mm|in; CAM documents also `machine`, `program`, `setup`). Never invent a person or an approval: leave `checkedBy` and `approvedBy` empty unless the person gave them.

## An annotation
Every annotation has `id` (unique), `captureId` (a capture of the set) and `refs`: stable references to the faces, edges or vertices it belongs to, `{body, kind: "face"|"edge"|"vertex", key}`. Get them from `cad` action `kernel` `op: "refs"` (skill cad-naming) and use the key, never a position. Only a `note` may have no refs. Kinds:
- `dimensional-size`: `nominal` (positive), `upper`, `lower` (signed deviations, mm; `upper` not below `lower`). A 10 H7 hole is nominal 10, upper 0.015, lower 0 (skill industrial-standards has the grades).
- `dimensional-location`: the same fields, for a distance between features.
- `geometric-tolerance`: `gdt {kind, value, diameter?, modifier?, datums?}`. `kind` is straightness, flatness, circularity, cylindricity, profile-line, profile-surface, parallelism, perpendicularity, angularity, position, concentricity, symmetry, runout or total-runout. `value` is the zone width in mm. Parallelism, perpendicularity, angularity, concentricity, symmetry and the two runouts REQUIRE `datums` (primary first, one capital letter each, none twice). A cylindrical zone (`diameter: true`) is only valid for position, concentricity, straightness, perpendicularity, parallelism, angularity and the runouts. `modifier` is "M" or "L".
- `datum`: `letter` (one capital, defined once). `datum-target`: `letter` of an existing datum and `target` (its name).
- `surface-texture`: `ra` and/or `rz` in micrometres, optional `lay` and `process`. `note`: `text`.
- Optional on any: `plane {origin, normal, up}` (normal and up perpendicular) to place it, `note`.
A capture is a named view `{id, name, annotationIds}` and must list exactly the annotations that name it.

## A good order
1. `cad` action `exact` for the faces, holes and bounds; `cad` action `kernel` `op: "refs"` for the references.
2. Datums first (the face the part is fixed on is A, the next B, the third C), then size and location, then the frames that cite the datums, then finish.
3. `pmi_validate`, fix every `issues` entry (`code`, `message`, `annotationId`), then `pmi_set`.
4. Put the same intent on the production sheet: `cad` action `drawing` (or `cad` action `workflow` `op: "sheet"`) takes `options.gdt` (frames: `spec`, world point `at`, `view` front|top|right), `options.datums` (`letter`, `at`, `side`) and `options.balloons` (`text`, `at`). A frame that cites a datum no `options.datums` entry defines is reported in the sheet `warnings`. Read `warnings` and the overlapping-text notes; they are not moved for you.

## What this does and does not do
- The tolerance on a hole or a face is information for people and for the next review: choosing it is an engineering decision. Take it from the person or the drawing; when you propose one, say it is a proposal and give the standard it comes from.
- PMI does not change the geometry and the toolpath does not read it. The CAM kernel compares a PMI `fingerprint` for staleness, but no saved program is tied to it yet: after a PMI change, tell the person to check the machining by hand.
- STEP export (`cad_edit` action `export`) does not carry the PMI set; the sheet PDF/SVG does carry what you pass in `options`.
- A reference that no longer resolves (skill cad-naming: `deleted`, `ambiguous`) leaves the annotation without a feature: report it, do not repoint it to a neighbour.
