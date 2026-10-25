# 41 — Persistent topological naming and lineage

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C6 and extends K7
of [spec 33](33-kernel-gap-analysis.md). Owner: WP1; adapters WP3, WP4, WP6, WP8.

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Problem

A parametric model is only as robust as its references. Today (verified):

- faces carry an optional `name` set by the feature that made them (`extrude.top`, `bore.side0.1`);
  `uniqueFaceNames` (`brep/naming.ts`) separates faces that share a name by their neighbours' names, then by position;
- push/pull and draft accept a face `name` (K7) and refuse a missing name instead of picking a nearby face;
- fillet / chamfer / shell open faces / hole placement / drawings / CAM selections still use points, boxes, axis-parallel
  filters or "near" hints (`BlendSelector`), which re-pick silently when upstream geometry moves;
- **edges and vertices have no names**; there is no record of what happened to a face across a later feature (split, merged,
  deleted, replaced).

## 2. Target

Every topological entity a user or tool can select has a **reference** that survives parameter edits and later features, and
resolution is explicit: it returns `exact`, `split(set)`, `merged(entity)`, `deleted(reason)` or `ambiguous(candidates)`.
Resolution never substitutes the nearest entity without saying so; a caller can opt into a documented heuristic and receives the
`heuristic` marker in the result.

## 3. Design

### 3.1 Entity key

```
Ref = { body: BodyId, kind: "face" | "edge" | "vertex", key: string }
key(face)   = <feature id>.<role>[.<index>]                 // made by the feature that created the surface
key(edge)   = edge( key(faceA), key(faceB) )[#k]            // the intersection of two named faces; #k orders several
key(vertex) = vertex( key(f1), key(f2), key(f3) )[#k]
```

Roles are assigned by each feature's generator, not by the entity's position in the tables (extrude: `top`, `bottom`,
`side<loop>.<segment>`; revolve: `lateral<segment>`, `start`, `end`; hole: `wall`, `floor`, `cone`; blend: `blend<edge key>`).

### 3.2 Lineage map

Every kernel operation that creates a result Brep from operands returns, next to the Brep, a **provenance table**:

```
Provenance = { faces: Array<{ result: number, from: Array<{ operand: 0 | 1, face: number, relation: "same" | "split" | "trimmed" | "reversed" | "offset" | "blend" | "new" }> }>,
               edges: ..., vertices: ... }
```

`booleanBrep`, `blendBrep`, `variableFillet`, `shellBrep`, `draftBrep`, `pushPullFace`, `extrudeProfile`, `revolve`, `sweep`,
`loft`, `sew`, `heal` produce it. The history keeps the composed lineage `(feature n−1 result) → (feature n result)` so a Ref made
at feature *k* is carried forward through every later feature (`resolve(ref, atFeature)`).

### 3.3 Resolution rules

1. `same` or `trimmed` or `offset` → `exact` (the entity keeps its key; a trimmed face stays the same face).
2. `split` into n pieces → `split(set)`; the consumer declares its policy (all pieces / the largest / fail). Default policy for
   fillet and shell: all pieces; for dimensions and mates: fail with `ambiguous`.
3. Several operand faces merged (coplanar same-domain faces united) → `merged(entity)` with the key of the lower operand.
4. No successor → `deleted(featureId)`; the dependent feature fails with an error naming the reference, the feature that removed
   it and (if known) the entity that replaced the region.
5. Two candidates with equal evidence → `ambiguous`. The tie-break by position of `uniqueFaceNames` stays only as the *name
   disambiguator inside one body*, never as a resolver across edits.

### 3.4 Stored form

The history stores refs in features (`edges: Ref[]`, `face: Ref`), plus the geometric hint (point on the entity at selection time)
used **only** to show the user a warning when the resolved entity moved far from the hint. Existing point / box selectors remain
accepted and are converted to refs at first rebuild (`migrate.ts`, version bump), with the conversion recorded.

## 4. Work items

| ID | Item | Gate |
|---|---|---|
| N1 | Provenance tables from Boolean, blend, shell, draft, push/pull, extrude, revolve, sweep, loft | each operation has a test where every result face maps to ≥ 1 operand face or `new`; faces count conserved (`split` pieces sum) |
| N2 | Edge and vertex keys (`brep/naming.ts`) | keys unique per body; stable across a 20 % dimension change of an upstream extrude |
| N3 | `resolve(ref)` with the five outcomes | table-driven test of each outcome |
| N4 | History stores refs; migration from selectors | existing `history-*.test.ts` unchanged; migrated history rebuilds to identical volume |
| N5 | Consumers: fillet / chamfer edges, shell open faces, draft / push-pull face, hole on face, sketch on face, mates | each consumer has an "edit upstream, same entity" test |
| N6 | Drawing dimensions and CAM face selections store refs (specs 49, 54) | dimension follows the entity through a parameter edit |
| N7 | AI schema: `ref` strings in the assistant history schema, `cad.resolve` read action | prompt budget respected (tool-prompts test) |
| N8 | Desktop: selection stores refs; broken-reference badge on the feature tree with the reason | happy-dom panel test; real window run recorded in the commit |

## 5. Gates (the suite that closes the spec)

`cad/history-naming-edits.test.ts`, 30 parametric edit scenarios, each: build, select by ref, edit an upstream dimension by
−20 % … +20 %, rebuild, assert the ref resolves to the *same feature-role entity* (identical key), assert the volume equals the
analytic volume. Plus: a feature that splits a selected face (resolves `split`), one that deletes it (`deleted` with feature id),
one that creates two equally good candidates (`ambiguous`); a randomised test perturbing 3 parameters of the recipe parts
(`recipes.ts`) 200 times with 0 silent re-picks.

## 6. Honest limits

- Reference stability across **topology-changing** edits (a hole that disappears because it breaks out of the wall) is reported,
  not repaired.
- Names assigned by imported STEP bodies are positional until the user renames; STEP `PRODUCT` / face names are kept when present.

## 7. Order

N1 → N2/N3 → N4 → N5 (fillet first, then shell and draft) → N7 → N6, N8. N1 is also what makes spec 43 blends testable.
