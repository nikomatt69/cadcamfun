# 16 — CAD/CAM Agent Blueprint

Status: v1 — the agent's full shape, building on the analysis in `15-ai-agent-analysis.md` and the existing WP8 implementation (`packages/ai`).

This spec records the bespoke CAD/CAM agent in cadcamfun as one design: a primary agent (`cadcam`) backed by a deniable tool surface, four specialist sub-agents, ten skills, persistent memory, sessions that survive a dropped connection, and a workspace renderer that gives the model the project and nothing else. The goal is to make the agent a "CAD/CAM colleague": it knows what a mill is, what a tool change means, what the stock looks like, what the verification found, why a circular pattern is `rotateDegrees` + `about` + `copies`, not four typed cylinders. Every section cites the file that implements it.

## 1. High-level architecture

```
User ──► Desktop (Solid + Three viewport) ──► Sidecar (Bun + Effect + HttpApi)
                                                        │
                                                        ├─ cadcam AiService (packages/ai/src/service.ts)
                                                        │     ├─ AiCredentials         (08-ai.md §2)
                                                        │     ├─ AiCache               (cache.ts)
                                                        │     ├─ DirectModel           (direct-model.ts)
                                                        │     ├─ AiHost (singleton)    (nikcli/runtime.ts)
                                                        │     │     ├─ cadcam agent (deny-by-default)
                                                        │     │     ├─ 4 specialists: researcher/editor/modeler/machinist
                                                        │     │     ├─ 22 built-in tools + N extensions (plugin SDK)
                                                        │     │     └─ 10 skills + N user skills
                                                        │     └─ AiBackground (scheduler: 4 active / 16 queued)
                                                        └─ Sidecar services
                                                              ├─ ProjectRepo (cad/cam editing handlers)
                                                              ├─ ProjectVcs (vcs tools on top of packages/vcs)
                                                              ├─ WorkflowRunner (apps/sidecar/src/services/workflow-runner.ts)
                                                              └─ CompanionGateway (apps/sidecar/src/services/companion-gateway.ts)
```

Source: `packages/ai/src/{service.ts,index.ts}`, `apps/sidecar/src/services/{ai.ts,ai-elements.ts,ai-transform.ts,ai-vcs-tools.ts,project-vcs.ts,workflow-runner.ts,workflow-steps.ts,companion-gateway.ts}`.

## 2. The `cadcam` agent

### 2.1 Identity

- Host agent name: `cadcam` (`packages/ai/src/nikcli/config.ts:16`).
- Description: `"CAD/CAM assistant"`.
- System prompt: `packages/ai/src/prompts/system.ts` (units, tool-call hygiene, modelling, machining, workflow, delegation briefs, version control, files, asking, style).
- Permissions: `{ "*": "deny", ...registeredToolIds: "allow", skill: "allow", todowrite/todoread: "allow", create_goal/get_goal/update_goal: "allow", code_mode: "allow", task: "deny" }` (`packages/ai/src/nikcli/config.ts:82-100`).
- No built-in shell/file tools. The host test `08-ai.md` §"NikCli host tests" asserts `experimental.toolIDs()` for the agent contains none of `bash`, `edit`, `write`, `webfetch`.
- No step cap (`agent.steps ?? Infinity`), so a long CAD/CAM turn runs through model → machining → verification as one task. The turn is bounded by `compaction` (pinned defaults `auto: true`, `prune: true`), the goal budget the model sets itself, the user's abort, and the host's doom-loop guard.

### 2.2 What the agent sees

The agent's effective context is the workspace renderer (`packages/ai/src/workspace-context.ts`) plus the per-message system text plus the conversation history nikcli manages. Sections in priority order:

1. **Document and units.** "Workspace: CAD editor, drawing ... (project ...)." "Units: tool calls in mm; the user reads mm. Drawing tolerance X mm, N decimals shown. View: 3D."
2. **Selection.** Selected ids, total model count, layer list (visibility, locks), active layer, stock (W×H×D mm when set).
3. **Machining.** Machine type, controller, post, material, operation type, tool (`Ø` mm), work offset.
4. **Toolpaths.** First 8 with move counts.
5. **Verification.** State (`not-run | stale | ok | errors`); first 4 issues with line numbers.
6. **Files and G-code.** Total lines; attached file names.
7. **Elements.** First N (count clamped by budget), selected ones starred; remainder says "N not shown — call cad_describe_drawing".
8. **G-code preview.** First 12 lines.

When the budget runs out, the model loses the element list and the G-code preview first. The renderer never invents fields (every section is guarded by `string|undefined` / `number|undefined` from `packages/ai/src/workspace-context.ts:15-18`).

### 2.3 What the agent can do

22 built-in tools (`packages/ai/src/tools/registry.ts:32-39`) plus the 4 `agent_task*` tools (`packages/ai/src/nikcli/background-tools.ts:84`) plus any extension tool registered through the plugin SDK (`buildTools(handlers, projectId, extensions)` in `tools/registry.ts:42-53`):

| Tool id | Kind | Confirms | Notes |
| --- | --- | --- | --- |
| `cad_add_entities` | mutation | — | 2D only; 5–15 entities per call |
| `cad_add_elements` | mutation | — | 3D/2D; up to 40 elements per call; `skipped[]` for invalid ones |
| `cad_import_drawing` | mutation | — | DXF/SVG text or attachment + depth; STEP is prismatic |
| `cad_modify_entities` | mutation | — | By id; send only the fields that change |
| `cad_transform_entities` | mutation | — | `dx/dy/dz/rotateDegrees/about` + `copies` for arrays |
| `cad_group_entities` | mutation | — | Component vs `group` (loose) |
| `cad_editor` | mutation | — | Layers, view, selection |
| `cad_delete_entities` | mutation | **yes** | `confirm: true` |
| `cad_describe_drawing` | read | — | Counts, bounds, layers |
| `cad_check_design` | read | — | `cad.checkModel` — sizes, booleans, rotations, duplicates, floats, out of stock |
| `cam_describe_machine` | read | — | Mill / lathe / printer, axes, zeros, probing |
| `cam_create_operation` | mutation | — | Type + params Schema |
| `cam_list_operations` | read | — | Per-drawing list |
| `cam_update_operation` | mutation | — | Settings re-decoded |
| `cam_suggest_parameters` | read | — | Pure `generator.suggestFor` |
| `cam_generate_gcode` | read | — | Stats + first N lines |
| `cam_analyze_gcode` | read | — | Static checks (no LLM) |
| `cam_verify_toolpath` | read | — | Replay on stock; holder/fixtures/target optional |
| `lib_lookup_material` | read | — | Library |
| `lib_lookup_tool` | read | — | Library |
| `memory_remember` | write | — | `ai.memory.*` keys |
| `memory_recall` | read | — | `ai.memory.*` prefix |
| `agent_task` | delegates | — | `agent?`, `background?` |
| `agent_tasks` | read | — | List (this project + parent session) |
| `agent_task_read` | read | — | One by id |
| `agent_task_cancel` | mutation | — | Stops the worker; slot held until it actually stops |

VCS + Workflows are tools of the sidecar (`apps/sidecar/src/services/ai-vcs-tools.ts:46-78`):

| Tool id | Kind | Confirms |
| --- | --- | --- |
| `vcs_status` | read | — |
| `vcs_start_change` | write | fails on dirty working copy |
| `vcs_commit` | write | refused on `main` for AI actor |
| `vcs_diff` | read | — |
| `vcs_open_pull_request` | write | triggers `pullRequest` workflows |
| `vcs_list_pull_requests` | read | — |
| `actions_run` | read | runs `manual` workflows |

### 2.4 Tool prompts (one `.txt` per tool)

Every tool ships with a `tools/prompts/<id>.txt` text file loaded as the description the model reads (`packages/ai/src/tools/define.ts`, referenced in `08-ai.md` §"One .txt prompt per tool"). Each prompt:

- Says what the tool is for and when to use it (and when not).
- Documents every parameter with its unit (`mm`, `deg`, `rad`, etc.).
- Names the operation types, tool types and materials that decode in the generator; every verification code is referenced; no false promise.
- Reports the shape of the result.
- Names the next tool in the loop.

`tool-prompts.test.ts` verifies "one file per tool, every parameter is documented, the prompts stay within a size limit, and nothing they promise is false."

### 2.5 What the agent cannot do

- Run a shell command (`bash`, `edit`, `write` are not in the permission allow-list).
- Access the user's project filesystem other than through the project-handler.
- Bypass permissions: `permission_mode: "default"` (no auto-approve).
- Move, write or delete files in `~/.config/nikcli` or `~/.nikcli` — `XDG_*_HOME` and `NIKCLI_TEST_HOME` are pointed at the app data dir; `NIKCLI_DISABLE_PROJECT_CONFIG=1` is on (`08-ai.md` §1.1).
- Touch `main` directly: `ProjectVcs` refuses AI actors on `main` for `commit`, `restore`, `merge` (`13-vcs-actions-mobile.md` §4).
- Run `actions_run` to install a plugin: plugins are installed by a person (see `plugins` skill).

## 3. The four specialist sub-agents

Source: `packages/ai/src/nikcli/agents.ts:11-168`. Each is a nikcli `Agent` record with `mode: "subagent"`, `steps`, `prompt`, and a permission map computed by `subagentPermission(spec, registeredToolIds)`.

| Specialist | `host` id | Edits | Background | Tools (curated) | Steps | Timeout |
| --- | --- | --- | --- | --- | --- | --- |
| `researcher` | `cadcam-worker` | no | yes | `cad_describe_drawing`, `cad_check_design`, `cam_list_operations`, `cam_suggest_parameters`, `cam_describe_machine`, `cam_analyze_gcode`, `lib_lookup_material`, `lib_lookup_tool`, `memory_recall`, `vcs_status`, `vcs_diff`, `vcs_list_pull_requests` | 40 | 5 min |
| `editor` | `cadcam-editor` | yes | no | `cad_describe_drawing`, `cad_modify_entities`, `cad_transform_entities`, `cad_group_entities`, `cad_editor`, `cad_delete_entities` (`confirm`), `cad_check_design`, `memory_recall`, `vcs_status`, `vcs_diff`, `vcs_list_pull_requests` | 40 | 8 min |
| `modeler` | `cadcam-modeler` | yes | no | `cad_describe_drawing`, `cad_add_elements`, `cad_add_entities`, `cad_import_drawing`, `cad_group_entities`, `cad_transform_entities`, `cad_check_design`, `memory_recall`, `vcs_status`, `vcs_diff`, `vcs_list_pull_requests` | 60 | 10 min |
| `machinist` | `cadcam-machinist` | yes | no | `cad_describe_drawing`, `cad_check_design`, `cam_describe_machine`, `cam_create_operation`, `cam_list_operations`, `cam_update_operation`, `cam_suggest_parameters`, `cam_generate_gcode`, `cam_analyze_gcode`, `cam_verify_toolpath`, `lib_lookup_material`, `lib_lookup_tool`, `memory_recall`, `vcs_status`, `vcs_diff`, `vcs_list_pull_requests`, `actions_run` | 60 | 10 min |

### 3.1 Dispatch rules

- The parent (`cadcam`) picks the specialist by name; the default is `researcher`. Unknown or `worker` → `researcher`; `cadcam-editor` → `editor`; `cadcam-modeler` → `modeler`; `cadcam-machinist` → `machinist`. The model can write the agent with `subagent_type` (nikcli's `task` parameter) or the host name; both are accepted.
- Editors run in the parent's turn: the call waits and returns the specialist's report; the report's entity edits are mirrored into the editor by `apps/sidecar/src/services/ai-elements.ts` (create/update) and `ai-transform.ts` (transforms/grouping); the CAM page re-reads the operation after the call (`08-ai.md` §"Tool results show on screen").
- The researcher runs in the background; the call returns a `taskId` and the parent sees the report when it polls `POST /api/ai/sessions/state` (or when it wakes via the host's "background report" event).
- One editing specialist per project at a time. The runtime-wide scheduler (`BackgroundTaskManager`, max `4 active / 16 queued`, scope `(projectId, parentSessionId)`) ensures that.
- Specialists read the project's version-control state but never start a change, commit or open a pull request; those stay with `cadcam`.

### 3.2 Specialist prompts

Each prompt embeds `BASICS` and `REPORT` (`agents.ts:31-44`):

- Millimetres everywhere. Angles in radians in tool calls except an element's `rotation`, which is in degrees.
- Never invent an entity id, a tool, a material, an operation type.
- Tool calls as plain JSON (arrays are arrays, numbers are numbers).
- Do exactly the job. If it cannot be done as stated, report and stop.
- Cannot delegate, create goals, commit or open pull requests.
- Final report: "Done | Checked | Not done / not verified" with the data behind each line.

`modeler` adds modelling discipline ("decompose before you build"; base body, then subtractive features, then secondary parts, then details; standard parts from the catalogue; parametric for parts the user will resize; design for the machine). `machinist` adds machining discipline (setup first; face or clear the top, rough, finish, drill, chamfer; one operation at a time end to end; fix by cause, not symptom; "no errors found in what was modelled", never "safe").

## 3.5 Parametric drawings

Source: `packages/ai/src/element-catalog.ts` (the `parametric` element spec) + `packages/core/src/cad/parametric.ts` (history, features, expressions, `rebuild()`).

The agent must be able to build a parametric part when the user asks for a part whose dimensions will change later ("a plate with M holes on a ring of Ø D, where M, D and thickness are named parameters"), and edit it later without rebuilding it from scratch.

### 3.5.1 What a parametric part is

A single `parametric` element holds a `history`:

```ts
{
  history: {
    parameters: {
      width: 60, depth: 40, thick: 8,
      hole: 5,                    // mm, diameter of each hole
      count: 4, ringD: 40,        // M holes on a circle of diameter ringD
      finish_mm: 0.3              // CAM-related, kept here so changes propagate
    },
    features: [
      { id: "plate", type: "sketch", plane: "XY",
        sketch: { entities: [/* rectangle with named lengths */],
                   constraints: [/* length l1="width", l2="depth", fixed p1 */] } },
      { id: "body",  type: "extrude", sketch: "plate",
        depth: "thick", operation: "new", direction: "up" },
      { id: "h1",    type: "hole", plane: "XY", offset: "thick",
        at: ["width / 2", "depth / 2"], diameter: "hole", depth: "thick" },
      { id: "ring",  type: "pattern", feature: "h1", kind: "circular",
        centre: ["width / 2", "depth / 2"], count: "count",
        step: { angle: 360 } }                  // spans the whole ring
    ]
  }
}
```

`parameters` are numbers or expressions of each other (`"half": "width / 2"`, `"ringR": "ringD / 2"`). `features` are evaluated in order through `rebuild()` (in `core`) and re-run on every parameter change; the topology is recomputed, not the inputs. A `dimension` may be a number or an expression; cycle detection is in `packages/core/src/cad/expressions.ts`.

A change of one parameter later is `cad_modify_entities { parameters: { width: 70 } }` (named dimensions merge into the history, the features stay). The agent sends a whole `history` only when the **features themselves** change.

### 3.5.2 When the modeler must reach for `parametric`

- The user says "in three sizes" / "depending on the part family" / "with named dimensions" / "we'll tune this with the customer".
- The part has features that are dimension-driven (hole pattern count, ring diameter, wall thickness, rib spacing, fillet radius).
- The part is a "platform" the user iterates on (a bracket family, a fixture plate family, a housing).
- The CAM program depends on dimensions that will move: leave a finish allowance in a parameter (`"rough_mm": 0.3`) so feed/stepdown adjustments stay live.
- A changeable size is asymmetric (a "wall" on one side or a local pocket) — wrap the side into its own `parametric` for surgical edits.

The modeler skill (`cad-3d-modeling` § Recipes → "Part the user will change the dimensions of") spells out a worked example. The modeler must follow this exact pattern and not build the part from loose solids; rebuilding a parametric plate from cylinders would lose the topology the CAM side depends on.

### 3.5.3 Editing parametric parts with the agent

- **Resize**: `cad_modify_entities({ id, changes: { parameters: { width: 70 } } })`. The features stay, the model rebuilds.
- **Add a feature**: `cad_add_elements` with the new feature appended to the same `parametric`'s history, addressed by the part's `id`. The agent reads the existing history with `cad_describe_drawing` first; never overwrite without reading.
- **Refactor the feature order**: `cad_modify_entities({ id, changes: { history: { parameters, features } } })`. The agent must rewrite the whole history; this is destructive and the tool registers a `cad_modify_parametric_features` capability under a future major version.
- **Check**: `cad_check_design` after every change. A parametric that no longer rebuilds is reported as a `RebuildFailed` issue and the user is told.

### 3.5.4 Parametric limits the agent states honestly (v6.0)

- **Fillet / chamfer / shell / pattern-along-path**: planned v6.2+ features (`specs/14-cad-cam-parity-roadmap.md` §5.1). The agent uses mesh chamfers (`cad_describe_drawing` will not invent a feature that does not exist).
- **Loves-me-loves-me-not**: an inconsistent parameter set (a 5 mm wall on a 3 mm part) is a question for the user, not something to quietly fix.
- **Cross-feature dependencies**: the agent keeps expressions local; an expression that references a feature id is supported, but a chain longer than ~10 expressions should be split.

## 3.6 Sophisticated composed CAM programs

A "sophisticated composed CAM program" is a project whose toolpath list is more than a handful of operations: a face mill + a rough + a finish + several drills + a chamfer + an engrave + a 3D-surface pass + an adaptive rest + a thread mill, on multiple set-ups, on different machines (a lathe + a mill), with a probing cycle first to set the work offset. The agent must be able to design and write such a program end to end, with the dependencies between operations (stock left by the rough feeds the finish, the previous tool's leftover drives the rest), with parameters and tolerances driven by the part.

### 3.6.1 Operation catalogue the agent may pick from

| Kind | Operation | Tool hint | Skill |
| --- | --- | --- | --- |
| 2.5D mill | `profile`, `pocket`, `drill` (G81/G82/G83/G73), `face`, `engrave` | `lib_lookup_tool` | `cam-operation-workflow`, `drilling-and-holes` |
| Mill 3D | `roughing`, `parallel`, `waterline`, `adaptive`, `rest`, `pencil`, `scallop`, `flowline` | ball/bull-nose end-mill; depth drives stepdown | `cam-operation-workflow`, `cutting-parameters` |
| Thread | `thread-mill` (helical; ISO metric pitch), `tap` | tap holder, thread mill | `cam-operation-workflow` |
| Lathe | `facing`, `turning-od`, `turning_id`, `parting`, `grooving`, `threading_od` | per lathe kinematics (in `cam.machine`) | `machines-and-axes` |
| Indexing (3+2) | any 2.5D / 3D inside an `Orient` (AC/BC trunnion) | `cam.ir.Orient` | `machines-and-axes` |
| Probing | `z-surface`, `edge-x`, `edge-y`, `corner`, `bore`, `boss`, `tool-length` | touch probe + stylus radius | `machines-and-axes` |
| 3D printer | single pass | slicer not built | `machines-and-axes` |

`cam_create_operation` accepts `type` + `params`; `cam_update_operation` re-decodes with the same Schema (`08-ai.md` §"Tool catalogue"). The schema in `packages/core/src/cam/operations/` is the single source of truth for what the generator can do. A tool the agent names that the schema does not know becomes a `cam_unknown_operation` error and the call is retried with a corrected kind, not repeated unchanged.

### 3.6.2 Sequencing rules the agent follows

The `cam-operation-workflow` skill says "follow the loop"; the agent composes that loop across operations:

1. **Probe first, machine after.** A program that measures its own zero removes setup error. `cam_create_operation` `type: "probing"` with `workOffset: "G55"` writes the result; the milling operations that follow use `workOffset: "G55"`.
2. **Facing / clearing the top, before rough.** `face` then `roughing` (or `adaptive`) leaves a known reference plane; later operations index off it.
3. **Rough, then finish.** Leave `0.1–0.3 mm` in a parameter (`"finish_mm"`). Finish with light stepdown, climb milling, stepover `5–15 % D`.
4. **Drill before tap or thread-mill.** Peck depth is `3 × D`; pilots for `> Ø 12 mm`.
5. **Engrave / chamfer last.** They touch a finished surface and would be ruined by anything after them.
6. **Indexing after the bulk is removed.** A 3+2 face on a trunnion is a re-orient with its own clearance; the IR's `Orient` is a "move" the post inserts between operations.

### 3.6.3 Stock carry-over (adaptive / rest)

`packages/core/src/cam/{cpg,generator}.ts` (per `04-core-cam.md`) keeps a stock model between operations. Each operation's `restFrom` can name the previous one; the rest is computed against its leftover, not the original stock. The agent must:

- For a bulk-then-finish pair, set the rough's `leaveForFinish: "finish_mm"` (the parameter).
- For an adaptive clear that leaves pockets too deep for the next end-mill, add a `rest` operation named after the previous tool (`prevTool: "endmill-8"`).
- Cross-operation tool changes are emitted by the post; the agent does not write tool tables.

### 3.6.4 Multiple set-ups

A flip of the part is a new operation tree with its own stock (the box now sits on its previously-machined face), origin, work offset, fixture description and tool list. The agent calls `cam_describe_machine` for each setup's zeros. A second setup never reuses the first setup's depths.

### 3.6.5 Verification per operation

`cam_verify_toolpath(operationId, { tool, fixtures, targetSolids, tolerance })` is the right check on every operation before moving on; the agent runs it after each operation, fixes the cause, moves on, and stores the verification report on the operation (`data.verification`) so the user sees the result in the Verify tab. The strict pattern is:

1. Create the operation (`cam_create_operation`).
2. Read the params back (`cam_list_operations`).
3. Generate G-code (`cam_generate_gcode`).
4. Static analyse (`cam_analyze_gcode`).
5. Simulate on the stock (`cam_verify_toolpath`).
6. Update by cause, regenerate, verify again. Stop after three rounds on the same finding and report it.

### 3.6.6 Composing a workflow

A `validate-and-cut` workflow (`.cadcamfun/workflows/*.yml`, see `packages/workflow/src/schema.ts`) wires these checks into the VCS pipeline:

```yaml
name: validate-and-cut
on:
  push:        { branches: [main, "ai/**"], paths: ["toolpaths/**"] }
  pullRequest: { branches: [main] }
jobs:
  qa:
    steps:
      - id: v  uses: project/validate
      - id: rg uses: cam/gcode
      - id: v  uses: cam/verify          # replays every committed program
      - id: m  uses: project/require-gcode
```

A `cam/sequence` step (planned; `specs/14-cad-cam-parity-roadmap.md` §3 step §"Workflow" and `13-vcs-actions-mobile.md` §3) would be the explicit step for "are these operations sequenced correctly?"; it would receive the project's `toolpaths/*.json` and `steps[]` files. Until it exists, the `machinist` specialist performs the same job with `cam_list_operations`, `cam_describe_machine`, and the operations' stored `restFrom`/`prevTool` references.

### 3.6.7 Picking the right operation

The agent picks the right operation by reading the geometry first:

- **2.5D planar feature with closed contours** → `profile` or `pocket`. Pick `profile` when the path is the outside of a part; `pocket` when the path is the inside of a recess.
- **Hole pattern** → `drill`, with `cycle: "G83"` if depth ≥ 3 × D. For Ø > 12 mm, pilot + `drill` or helical ramp with `pocket`.
- **Open top face** → `face` first to establish a reference plane.
- **Curved face that needs finishing** → `parallel` or `waterline` for a 3-axis mill; `scallop` for a uniform cusp; `pencil` for a blend.
- **Part with deep pockets and a narrow neck** → `adaptive` rough (engagement-bounded) + `rest` (the small tool for the corners the big tool could not reach).
- **Threaded feature on a mill** → `thread-mill` (helical, ISO metric pitch). `tap` only on through holes in soft materials.
- **Lathe body** → `facing` (cross-pass over the face), `turning_od` (radial passes along the profile), `parting` (radial cut at Ø).
- **Touch probe routine** → `z-surface`, then `corner` or `bore`, then `tool-length` — every check writes a work offset.

### 3.6.8 Picking the right tool

The agent never invents a tool. It calls `lib_lookup_tool` and picks from the catalogue:

- **End-mill** (flat, ball, bull-nose, V): the workhorse for `profile`, `pocket`, `face`, `engrave`, `parallel`, `waterline`. Bull-nose for finish passes that leave a fillet; ball for 3D surfaces.
- **Drill**: standard jobber; long-reach for deep holes; spotting for shallow pilots.
- **Tap / thread-mill**: thread-mill for harder materials and larger sizes.
- **Chamfer / engraving**: 90° / 60° spot drill or chamfer mill, V-point for engrave.

Diameter constraints the agent enforces:

- Smallest internal radius ≥ cutter radius (the smallest inside corner is checked before the cut).
- Narrowest slot ≥ cutter diameter (or the toolpath uses a smaller cutter).
- Spindle speed and feed are bounded by `lib_lookup_tool` ranges; a `cam_suggest_parameters` cross-check is the safety net.

### 3.6.9 Composing across machines (mill-turn, lathe + mill)

A part that ends as a turned body with a milled flat is two machines in one program file:

- Lathe operations first (the cylindrical body).
- Parting (or stop) before the mill side.
- A separate setup with the part held in a 4th-axis trunnion (rotary as A axis) for the mill side.
- The mill operations use a different work offset (G55) and a different post-processed IR with `Orient`-set trunnion angles.

The agent calls `cam_describe_machine` for both machines, asks the user which tools of each library to use (or warns when none match), and writes the operations with the right `machineType`, `workOffset`, and `controller`. The post emits the matching dialect for each block.

### 3.6.10 Limits and honest notes the agent states

- `cam_verify_toolpath` simulates mills only. A lathe job is **never** simulated; the agent says "lathe program, not verified".
- A 4/5-axis continuous program is out for v6 (planned `12-professional-cad-cam.md`).
- The verification reports what it modelled (`modelled[]`); without a holder, fixtures or a target it says so, and the agent tells the user.

## 4. Skills

Source: `packages/ai/src/skills/index.ts:213-224`. Ten built-in skills, written as `SKILL.md` files in `<configDir>/skills/<name>/`. The model loads them with nikcli's `skill` tool (allowed in the permission map).

| Skill | Trigger | Content (abridged) |
| --- | --- | --- |
| `cad-3d-modeling` | any CAD task | conventions, recipes (block-with-hole, revolution, sweep, parametric plate with hole pattern, car/bracket, DXF/SVG/STEP import), design space, after-modelling checklist |
| `cam-operation-workflow` | any CAM task | the loop: describe, lookup, suggest, create, generate, analyse, verify, fix |
| `toolpath-verification` | reading a `cam_verify_toolpath` result | every code (RapidInMaterial, ShankCollision, HolderCollision, FixtureCollision, BelowStock, Gouge, UncutStock, ResolutionCoarsened), its cause, its fix, "what was modelled" |
| `cutting-parameters` | cutting data | Vc table (aluminium/brass/plastics/steel/stainless/titanium/hardwood), fz, stepdown, stepover, plunge, finishing strategy, machine limits |
| `drilling-and-holes` | drill operations | G81/G82/G83/G73, peck rules, point length, large-hole rule, ordering, `cuttingLength` for verification |
| `precision-and-tolerances` | micron work | 1 µm = 0.001 mm, ISO 286 IT6/IT7/IT8 by range, tolerances on round shapes, finishing strategy, verification limits |
| `machines-and-axes` | any machine program | mill/lathe/printer axes, ISO 841, work offsets, probe cycles, dialect G38.2/G31, machine-specific analyser pass |
| `drawings-and-images` | DXF/SVG/STEP/image/photo/sketch | which tool, what to ask, image scale, photo scale, three-view checks, after-build compare |
| `plugin-authoring` | writing an extension | `plugin.json` shape, `definePlugin`, capabilities, contribution model, tests |
| `stock-and-fixtures` | setup | stock box, origins, work offsets, fixture descriptions, holder, second setups |

### 4.1 User skills

`packages/ai/src/skills/user.ts` validates user-uploaded `SKILL.md` files (front matter `name`, `description` ≤ 300 chars, body ≤ 20 000 chars, at most 50 user skills). Reserved names are refused. Files live in `<dataDir>/ai/skills/<name>/`, are written next to the built-ins with a `.user-skill` marker (so a deleted skill is purged on the next host write), and the live host reloads via `runtime.reloadSkills()`. API: `GET/PUT/DELETE /api/ai/skills` (`08-ai.md` §"User skills").

A skill is text: it cannot run code or widen permissions.

## 5. Sessions

Source: `packages/ai/src/nikcli/chat.ts`, `packages/ai/src/service.ts`.

- `createHostSession(host, title)` creates a nikcli session in the right project's host. The sidecar stores a map clientSessionId → {host, hostSessionId} in `Ref<Map<...>>`.
- `hostChatStream(input)` returns a stream of `AiEvent`s that the UI consumes. The events are: `delta`, `tool_call`, `tool_result`, `permission_request`, `done`, `error`, plus extended events (`step`, `reasoning`, `tool_progress`, `todo`, `goal`, `retry`, `compacted`).
- `hostChatStream`'s pump subscribes to host events **before** prompting, with a 5 s "connected" deadline, a 2 s idle grace, and a heartbeat every 5 s. After up to 4 host retries, the sidecar gives up on one call and resumes the turn (up to 5 times; `isTransientFailure`).
- After the model answers, the stream checks the host's continuation rules (`continuationFor(state, text, finish)`):
  - Open todo items.
  - Last tool call failed (not retried).
  - "Let me build the wheels:" — the last sentence announces work but no tool call was made.
  - `finish: "length"` — the model's output was cut by the limit.
- Each nudge is a synthetic `parts: [{type: "text", text: nudge}]`. Up to 50 nudges per turn (`DEFAULT_AUTO_CONTINUES`). A nudge that produces no tool call within the next step counts as a stall; up to 2 stalls.
- `sessionState(sessionId, projectId?)` reads the host's own record: `busy`, `text`, optional `error`, optional `tasks[]` (id, agent, description, status, background, text). The client polls this after a dropped connection.
- `abort(sessionId)` resolves the client's id through the map and calls the host's `session.abort`.
- `queue({ sessionId, message, delivery })` admits the message to the host's pending queue (`queue`) or steers it in immediately (`steer`); the running turn picks it up.

### 5.1 Sessions on the mobile companion

`apps/mobile/src/companion/client.ts` is the same `CompanionClient` the desktop uses, plus `pinnedFetch` (`src/companion/native.ts`) for the iOS keychain pinning. The phone's user can:

- Pair with the desktop (QR + per-device token).
- Stream chat (`POST /api/ai/chat/stream`).
- Read state and tasks (`POST /api/ai/sessions/state`).
- Approve permissions (`POST /api/ai/permission/reply`).
- Abort (`POST /api/ai/chat/abort`).

The phone cannot install plugins, change credentials, push to GitHub, or read secrets. The companion gateway allow-list (`COMPANION_ROUTES`) enforces this (`13-vcs-actions-mobile.md` §6).

## 6. Continuous-agent contract

The `BackgroundToolsRunner` (`packages/ai/src/nikcli/background-tools-runner.ts`) is the runner that makes a specialist do its work. A specialist is started with `agent_task { agent, prompt, background? }`:

- Foreground (default for editor/modeler/machinist): the runner creates a child session in the host of the project, prompts the specialist with the prompt and the specialist's agent, awaits the result, removes the child session. Tool calls in the child are forwarded to the parent's stream with an `agent` field and a call id prefixed by the child session id (`event-mapper.ts#adoptChildSession`).
- Background (default for researcher): the runner uses `session-prompt.promptAsync({delivery: "queue"})`; the result wakes the parent session asynchronously. A background report appears in the chat via polling (about 2 s) on `POST /api/ai/sessions/state`.

Cancellation keeps the slot until the worker actually stops. Shutdown cancels everything. Cancellation does not wake the parent. The runner exposes `dispose()` and `cancelForParent(parentSessionId)`. The sidecar's `POST /api/ai/sessions/remove` handler calls `cancelForParent` to stop the workers of an aborted parent.

Honest limits: a specialist does not see the conversation (the prompt is its whole context); nested delegation, a per-call model override, and session continuation across aborts are not implemented. The specialist's own text is not streamed (only its tool calls are). Background reports are polled.

## 7. Provider + credential model

- Providers: anthropic, openai, minimax, gateway (`BUILTIN_PROVIDER_IDS`), each with its base URL / protocol / catalogue. Any other provider comes from models.dev and is served by the host.
- Resolution: `resolveModel(model, { configured, forceGateway })` (`packages/ai/src/models.ts`); the rule is "direct vendor when its key is configured, otherwise gateway; `forceGateway` routes everything through the gateway".
- Credentials: `PUT /api/ai/credentials` validates the id syntactically and against `GET /api/ai/providers`. Keys are pushed into the embedded nikcli host via `provider.api.set` and into `DirectModel`'s in-memory map. Keys are written atomically to `<dataDir>/ai/credentials.json` (mode 0600) on every set/clear. Shutdown clears the host's copy only, never the file.
- The host's `<cache>/models.json` seed runs at most once (only when missing, only when `catalogue.network` is on) and never blocks boot (`08-ai.md` §2).

## 8. Acceptance criteria

1. `cadcam` agent: `experimental.toolIDs()` contains none of `bash`, `edit`, `write`, `webfetch`, `read`, `glob`, `grep` (no built-in shell/file tools).
2. With a sentinel file in a fake `~/.config/nikcli`, the host never reads it.
3. Each of the 22 built-in tools has a `tools/prompts/<id>.txt` whose documented parameters and operation types all decode in the generator.
4. The 4 specialists exist in the host config with the curated tool lists; the editing lock is enforced (one editor per project).
5. The 10 skills exist as `<configDir>/skills/<name>/SKILL.md`.
6. A scripted tool call → handler → result → final text round-trip works through the embedded host (`hostChatStream`) with no real provider (`MockLanguageModelV4`).
7. The credential file is mode 0600, never written outside `<dataDir>/ai/credentials.json`, and the host's copy clears on shutdown.
8. `bunx tsc -p packages/ai/tsconfig.json` is clean.
9. The schema for `AiEvent` covers `delta`, `tool_call`, `tool_result`, `permission_request`, `done`, `error` plus `step`, `reasoning`, `tool_progress`, `todo`, `goal`, `retry`, `compacted`.

## 9. Change log

- v1: blueprint grounded in the WP8 source; cites every implementation file.
