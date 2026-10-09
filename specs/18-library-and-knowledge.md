# 18 — Libraries as the agent's knowledge

Status: v1 — describes materials, tools, machine configurations, stock setups, components, operations and toolpaths as first-class knowledge the agent consults, edits and version-controls. Source-grounded (`packages/db/src/schema.ts`, `packages/core/src/cam/machine.ts`, `tools/lib_lookup_*.ts`, `tools/cam_describe_machine.ts`, `tools/cad_describe_drawing.ts`, `packages/vcs/snapshot.ts`).

The principle: a CAD/CAM agent without a library is guessing. The library is what lets it say "the tool the user owns is the Sandvik R390 Ø 6 mm insert, max 12 000 RPM, not a generic 6 mm end mill"; "the stock is 100 × 60 × 12 mm Aluminium 6061-T6, 0.3 mm rough allowance"; "the machine is a Haas Mini Mill with work offsets G54..G59, G17, in mm". Spec 16 calls `lib_lookup_material` and `lib_lookup_tool` for that reason; this spec records what the agent knows, what it can change, and what it must never guess.

## 1. The library surface

`apps/sidecar/src/services/ai-elements.ts` (create / update / describe) covers the four canonical entities the agent may see; the VCS commit serialises them as `*.json` files under the directories documented in `13-vcs-actions-mobile.md` §2 (project layout).

```
project.json
drawings/<id>.json
components/<id>.json
toolpaths/<id>.json
materials/<id>.json
tools/<id>.json
machine-configs/<id>.json
costs/<id>.json
.cadcamfun/workflows/<name>.yml
```

### 1.1 Database tables (Drizzle)

`packages/db/src/schema.ts`:

- `Material` (`materialTable`, line 277) — `name`, `properties` (JSON), `isPublic`, `ownerId`, `organizationId`.
- `Tool` (`toolTable`, line 295) — `name`, `type`, `diameter`, `material`, `numberOfFlutes`, `maxRPM`, `coolantType`, `cuttingLength`, `totalLength`, `shankDiameter`, `notes`, `isPublic`.
- `MachineConfig` (`machineConfigTable`, line 378) — kinematics, post processor, work offsets.
- `Component` (`componentTable`, line 258) — a saved part the project reuses; named, owned, parameterised.
- `Toolpath` (`toolpathTable`, line 321) — `data` (the operation request + params + verification report), `gcode` (the committed program), `materialId`, `toolId`, `machineConfigId`, `thumbnail`.
- `ToolpathVersion` (`toolpathVersionTable`, line 347) — history of a toolpath's edits.
- `MaterialCost` (`materialCostTable`, line 679) — cost per unit for a material, used by `costs.ts`.

### 1.2 How the agent finds things

Tools the agent may call:

| Tool | Returns | Use |
| --- | --- | --- |
| `lib_lookup_material(query)` | material rows whose name/description match | "the user said 'aluminium 6061'"; the agent picks a specific row |
| `lib_lookup_tool(query)` | tools matching type/diameter/cutting length | "the Ø 6 mm end mill in aluminium" |
| `cam_describe_machine(projectId)` | the active machine: kinematics, axes, ops, zeros, work offsets, origins | the agent's view of what the post will emit |
| `cad_describe_drawing(projectId)` | counts, bounds, layers, selection, stock, materials/tools/configs referenced | full inventory of the model |
| `cam_list_operations(projectId)` | toolpaths with their ids, parameters, references | "what operations does this drawing already have?" |
| `memory_recall(prefix?)` | the agent's own notes (`ai.memory.*`) | "what did I save about this project before?" |

The lookup tools are read-only. To **change** a library item the agent calls a write tool (today: `cad_*` and `cam_*` tools; future: `lib_*` write tools, see §6).

### 1.3 What "the agent knows" means in concrete terms

A request like "machine this aluminium plate with the 6 mm carbide end mill the shop uses" is resolved by:

1. `lib_lookup_material("aluminium 6061")` → material row, with `properties` (density, Vc, fz, Kc).
2. `lib_lookup_tool({ type: "endmill", diameter: 6 })` → tool row with `numberOfFlutes`, `maxRPM`, `cuttingLength`, `shankDiameter`.
3. `cam_describe_machine(projectId)` → the kinematic envelope, work offsets, spindle max RPM, feed max.
4. `cam_suggest_parameters({ material: id, tool: id, operation: "pocket", diameter: 6, machineType: "mill" })` → pure `generator.suggestFor` that returns recommended `rpm`, `feed`, `stepdown`, `stepover`, `leaveForFinish`, plus warnings (cutter too long for the depth, RPM over the machine max, fz out of range).

Only after this dance does the agent call `cam_create_operation`. If `suggestParameters` reported the `RPM > machineMax` warning, the agent caps the RPM to `min(material.recommendedRPM, tool.maxRPM, machine.maxRPM)` and tells the user what it capped and why.

## 2. Materials — `lib_lookup_material`

### 2.1 What the row says

| Field | Source | Meaning for the agent |
| --- | --- | --- |
| `name` | `materialTable.name` | what the user calls it |
| `description` | `materialTable.description` | free text |
| `properties` | `materialTable.properties` (JSON) | structured: density, unit cost, recommended Vc, recommended fz, machineability rating, Kc1, Mc, hardness, ISO classification |
| `isPublic` | `materialTable.isPublic` | library vs personal |
| `ownerId` / `organizationId` | same | scope |

### 2.2 What the agent must do

- **Never invent a material.** A name like "aluminium" without a specific alloy in the user's library produces a question back to the user, not a guess.
- **Confirm with `properties`.** When `cam_suggest_parameters` uses a material property, the agent reads it back in the response (`Vc`, `fz`, `coolant`) and quotes it; it does not paraphrase.
- **Save material updates as a workflow-level change.** A material edit affects every committed toolpath that references it; the agent updates through `vcs_commit` and the change lands on the same `ai/*` branch.

## 3. Tools — `lib_lookup_tool`

### 3.1 What the row says

| Field | Source | Meaning for the agent |
| --- | --- | --- |
| `name` | `toolTable.name` | human-readable |
| `type` | `toolTable.type` | `endmill`, `ball-endmill`, `bull-nose`, `drill`, `tap`, `thread-mill`, `chamfer`, `spot-drill`, `engraving` |
| `diameter` | `toolTable.diameter` (mm) | the cut's width |
| `material` | `toolTable.material` | HSS, carbide, diamond-coated, … |
| `numberOfFlutes` | `toolTable.numberOfFlutes` | feeds depend on this |
| `maxRPM` | `toolTable.maxRPM` | hard ceiling |
| `coolantType` | `toolTable.coolantType` | flood / mist / none |
| `cuttingLength` | `toolTable.cuttingLength` | the flutes' length; deep cuts break when flutes run out |
| `totalLength` | `toolTable.totalLength` | the tool's body length (stickout) |
| `shankDiameter` | `toolTable.shankDiameter` | the holder collision check |
| `notes` | `toolTable.notes` | human hints |

### 3.2 Picking the right tool

A picking algorithm the agent executes (in text):

1. Read the geometry → identify the operation kind (profile, pocket, drill, etc.).
2. Read the operation's smallest feature (smallest inside radius for a profile/pocket; smallest hole for a drill) → pick a tool whose `diameter ≤ 2 × smallestInsideRadius`.
3. Read the operation depth → confirm `cuttingLength ≥ depth + pointLength` (drill) or `cuttingLength ≥ stepdown × passes`.
4. Read the material → pick a tool whose `material` suits: carbide for steel, HSS ok for aluminium, diamond for composites.
5. Read the spindle ceiling from `cam_describe_machine` → cap RPM to `min(tool.maxRPM, machineMax)`.

### 3.3 What the agent cannot do (today)

- A **separate** `lib_*` write tool to create or edit library rows directly. Today the agent edits the DB through `cad_*`/`cam_*` tools that target a project, or via VCS commits that re-apply files. Future WP: a `lib_upsert_material`, `lib_upsert_tool`, `lib_upsert_machine_config` (see §6).

## 4. Machine configurations — `cam_describe_machine`

Source: `packages/core/src/cam/machine.ts`. The agent reads the project's active machine to bound everything:

| Field | Meaning |
| --- | --- |
| `kind` | `mill`, `lathe`, `3Dprinter` |
| `axes` | `X`, `Y`, `Z`, `A`, `B`, `C`, `U`, `V`, `W` with limits and sense |
| `maxRPM`, `maxFeed` | ceilings |
| `workOffsets` | `G54..G59`; which one is the default |
| `zeros` | per operation (lathe: face / chuck; mill: stock top / corner / centre; printer: plate centre / corner) |
| `postProcessor` | emulator id (fanuc, grbl, heidenhain, linuxcnc, …) |
| `probing` | touch probe config (cycles, dialate G38.2/G31, stylus radius) |
| `toolChanger` | tool table bounds |
| `coolant` | available modes |

**The agent reads this before any machine-conditional decision**: spindle ceiling, axis envelope, work offset naming, post dialect, probe availability. Lathe/lathe + mill programs branch on `kind`; a probing routine is unreachable without probe + spindle-off + work-offset write.

## 5. Components — reusable, parametric, versioned

### 5.1 What a Component is

A `Component` is a saved part: a `component` element the user has named, parameterised and stored so other projects can reuse it. The agent uses the catalogue (`cad_component_list`, `cad_component_save`, `cad_component_insert`, `cad_component_delete` per `08-ai.md` §"Tool catalogue"):

- `cad_component_list` — read all components in the project (or library).
- `cad_component_save` — capture selected elements into a reusable component.
- `cad_component_insert` — insert a component by id; the agent specifies `transform` and the tool creates fresh element ids.
- `cad_component_delete` — needs `confirm: true`.

### 5.2 Repeated parts in the catalogue

The `modeler` skill (`packages/ai/src/skills/index.ts:38-46`) says "Standard parts (gear, spring, bolt, screw, nut, washer) come from the catalogue with their real size; do not fake them from cylinders." The agent's `cad_add_elements` can take a `gear`, `spring`, `bolt`, `screw`, `nut`, `washer` element with the catalogue size (e.g. `size: "M8"`) and the editor inserts the real part. That is the user-level library for mechanical standards.

### 5.3 What the agent must remember across sessions

`memory_remember { key, value }` writes to `ai.memory.<projectId>.<key>`. The agent uses it to persist:

- The user's preferences (units they read, postprocessor they like, default tolerance).
- Project notes ("the spindle is tapped M10 at the top of the column").
- Lessons learned ("for this alloy, climb + 5 % stepover works better; conventional leaves a burr").

`memory_recall(prefix?)` reads them back. Notes are bounded (`renderNotes` in `packages/ai/src/workspace-context.ts:138-149`: 1 500 characters, newest first).

## 6. Future write tools for the library

A focused v6.x WP closes the gap the agent has today (read-only on the library, except through project operations):

| Tool | Effect |
| --- | --- |
| `lib_upsert_material({ id?, name, properties, ... })` | create or update a material row; `confirm: true` for deletes |
| `lib_upsert_tool({ id?, type, diameter, material, ... })` | create or update a tool row; `confirm: true` for deletes |
| `lib_upsert_machine_config({ id?, name, kinematics, post, ... })` | create or update a machine; `confirm: true` for deletes |
| `lib_attach_component({ componentId, projectId, transform })` | save a part into the project catalogue |
| `lib_set_default({ materialId?, toolId?, machineConfigId? })` | mark a library item as the project's default (per project, versioned) |

These land in the same WP11+ library migration that schedules the GitHub asset mirror (`13-vcs-actions-mobile.md` §8).

## 7. Operations / toolpaths — what the agent remembers about them

### 7.1 Storage

A `Toolpath` row (`toolpathTable`):

- `data` (JSON): `{ request, verification, meta }` — the generation request, the verification report, the user-visible notes.
- `gcode`: the committed G-code text.
- `thumbnail`: derived, not committed.
- `materialId`, `toolId`, `machineConfigId`: references; agent updates these when the user changes material/tool/machine.
- `drawingId`: the drawing it belongs to.

### 7.2 What the agent sees

For each toolpath:

- **Type** (`type`, `operationType`).
- **Parameters** (`data.request` — structured).
- **G-code** (`gcode` — committed, can be diffed).
- **Verification** (`data.verification` — last `cam_verify_toolpath` report).

The agent's `cam_list_operations` returns the per-drawing list; `cam_update_operation` re-decodes parameters with the generator Schema; `cam_generate_gcode` re-runs from `data.request` and updates `gcode` and `data.verification`.

### 7.3 What the agent must not do

- Re-write the committed G-code without re-running `cam_generate_gcode` (the workflow's `cam/gcode` step would then fail because the committed G-code doesn't match the request).
- Treat a `gcode`-less toolpath as usable: the workflow's `project/require-gcode` will block the PR.
- Forget to update the `data.verification` after `cam_verify_toolpath`; the operation's card in the Verify tab reads it from there (`08-ai.md` §"Tool results show on screen").

## 8. Where the VCS carries library state

The directories in the repository tree (see `13-vcs-actions-mobile.md` §2 and `packages/vcs/snapshot.ts`):

- `materials/<id>.json` — material rows the project's toolpaths reference (one file per material the project uses; shared across projects by reference).
- `tools/<id>.json` — same for tools.
- `machine-configs/<id>.json` — same for machine configurations.
- `components/<id>.json` — saved reusable parts.

The "apply a commit creates the ones that are missing and updates an existing one only when the current user owns it; owners and organisations are installation-specific and are not stored" rule from `13-vcs-actions-mobile.md` §2 still holds: every library item the agent creates lands in the project's commit, not in a different repo.

## 9. Acceptance criteria

1. `lib_lookup_material("aluminium 6061")` returns the row, including `properties`.
2. `cam_suggest_parameters({ material, tool, operation, machine })` returns `rpm ≤ min(tool.maxRPM, machine.maxRPM)` and `feed ≤ machine.maxFeed`.
3. A `cam_verify_toolpath` that does not get `tool.cuttingLength` for a deep drill reports a `ShankCollision` risk; the agent tells the user which `tool.cuttingLength` value the verification did not know about.
4. A toolpath whose `gcode` does not match the regenerated G-code (`cam_generate_gcode`) is rejected by the workflow's `cam/gcode` step (`workflow-steps.ts:147`).
5. `memory_remember(key, value)` survives a sidecar restart (backed by `KvStore` / `LocalKeyValue` / SQLite).
6. The agent never claims a "library write" without the corresponding `lib_*` tool existing (until spec 16 §6 ships). Today, library writes go through a PR review by a person.

## 10. Change log

- v1: documents the library as the agent's knowledge; defines what the agent knows, picks and writes; maps existing tools; defers write tools to a v6.x library WP.
