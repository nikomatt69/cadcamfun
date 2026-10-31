# Stable references to faces, edges and vertices

An index (`face 3`) changes the moment an upstream dimension or feature changes. A reference names the entity by the feature
that made it (`face:plate|plate.top`, `edge:plate|edge(plate.side0.0,plate.top)`), so it survives an edit. Use references for
anything you will come back to: a fillet edge, an open face of a shell, the face a hole sits on, a datum.

## The three calls (tool `cad`, action `kernel`)
1. `op: "refs"` with `elementId` (or `history`), optional `body`, `kinds`, `limit`: the references the model offers, with a point on each (`at`). Pick by the point and the key, not by position in the list.
2. `op: "resolve"` with `refs` made earlier and either `parameters` (the edited dimensions) or `after` (the edited history): what became of each reference. Without `parameters`/`after` it follows the reference to the end of the same history (`madeAfter` names the feature it was made after).
3. `op: "health"`: the naming health of every body and the Boolean report of the build.

## Reading a `resolve` result
- `exact`: the same entity; use `index` and `key`. `moved` is a warning that it sits far from where it was picked: tell the person.
- `split`: the entity was cut into pieces (`indices`, `keys`). Say so; fillet and shell take all pieces, a dimension or a mate must ask which one.
- `merged`: it became part of a larger entity (coplanar faces united); `absorbed` names what it joined, `withOtherBody` is true when the other face belongs to another body.
- `deleted`: no successor. `feature` names the feature that removed it; report it and ask what to do, do not pick a neighbour.
- `ambiguous`: equal candidates (a position-ordinal key whose neighbours changed, e.g. a pattern that gained a copy). Ask or choose by a stated rule; never guess silently.

## Health
- `unnamedFaces > 0`: references to those faces (and their edges) cannot be made; a body imported without names is positional.
- `ordinalKeys > 0`: some keys end in `#k`, stable only while the geometry is (copies of a pattern). Prefer references to the pattern's seed.
- `booleans.recoveredByDisplacement > 0`: an operand was nudged by a few parts per million to break a degenerate contact; the exact volume is approximate there. Say so, and suggest modelling the contact as an overlap.
- `booleans.failed > 0`: a Boolean was refused after every recovery; the body has no exact model (see `bodies[].reason`).

## Rules
- Store references, not indices, in anything that outlives one call.
- A reference that resolves `deleted` or `ambiguous` blocks the dependent change: report the reason, never substitute the nearest entity.
- The tool reports; it does not edit. Apply the change with `cad_edit` once the references are exact.
