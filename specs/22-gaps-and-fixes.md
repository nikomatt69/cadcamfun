# 22 — Gaps & Fixes (the "refine and add" queue)

Status: v1 — concrete additions and refinements for the items flagged `gap` or `partial` in spec 21. Each section names the owning WP, the files to add or edit, and the content of the new file. A future commit can land one section at a time.

The LSP diagnostics in `apps/sidecar/src/services/workflow-steps.ts` (missing `StepContext` export, `Uint8Array` widening) are real and addressed in §5 below.

## 1. Specialists (WP8)

### 1.1 Grant `code_mode` to `researcher` (refine)

Currently `code_mode` is allow-listed only on `cadcam` (`packages/ai/src/nikcli/config.ts:99`). A read-only researcher who needs to compute a sum against a list of toolpaths would benefit. Add to `researcher`'s permission map in `agents.ts`:

```
permission["code_mode"] = "allow"  // read-only computation against fetched toolpaths
```

The host enforces `code_mode` as a confined subset (`no import, fetch, process, files or timers`); the researcher cannot widen surface.

### 1.2 `reviewer` specialist (add)

Added to `SUBAGENT_IDS`. Read-only, focused on PR-level review: `vcs_diff`, `vcs_list_pull_requests`, `vcs_status`, `cam_list_operations`, `cam_verify_toolpath`, `cam_analyze_gcode`, `cad_describe_drawing`, `cad_check_design`, `memory_recall`, `actions_run`. Steps 40, timeout 5 min, `edits: false`, `background: true`. The `reviewer` summarises a `pullRequest` workflow run into a verdict the user can act on. Registered with `WORKER_TOOL_IDS` like `researcher`.

Source patch:

```ts
// packages/ai/src/nikcli/agents.ts
export const SUBAGENT_IDS = ["researcher", "editor", "modeler", "machinist", "reviewer"] as const
const reviewer: SubagentSpec = {
  id: "reviewer" as const, host: "cadcam-reviewer" as const, edits: false, background: true,
  steps: 40, timeoutMs: 5 * 60_000,
  description: "Reviews a PR: reads vcs diff + workflow runs + verification reports and writes a verdict.",
  tools: ["vcs_status", "vcs_diff", "vcs_list_pull_requests",
          "cam_list_operations", "cam_verify_toolpath", "cam_analyze_gcode",
          "cad_describe_drawing", "cad_check_design",
          "memory_recall", "actions_run"],
  prompt: `${BASICS}\n\nA PR review: read the vcs diff, read the workflow runs, summarise what changed, list what was checked, list what was not, give a verdict (approve / request-changes / needs-discussion). ${REPORT}`
}
SUBAGENTS["reviewer"] = reviewer
```

## 2. Skills (WP8)

Two skills flagged `pending` in spec 21 §3.11–3.12 and two new ones flagged `gap` (§3.13–3.14).

### 2.1 `parametric-design` skill body (add)

Append to `CADCAM_SKILLS` in `packages/ai/src/skills/index.ts`:

```md
---
name: parametric-design
description: When and how to build a cadcamfun `parametric` element: named dimensions, expressions, when to choose parametric over loose solids, how to edit later without rebuilding.
category: cad
tags: [cad, parametric, dimensions]
---

# Parametric parts in cadcamfun

A part the user will iterate on ("in three sizes", "depending on the part family", "we'll tune this with the customer") is **one** `parametric` element, not loose solids.

## Anatomy

```ts
{ history: { parameters, features } }
```

- `parameters`: named dimensions, numbers or expressions of each other. `"half": "width / 2"` works. Cycle detection is on.
- `features` run in order. Each is `sketch`, `extrude`, `revolve`, `hole`, `pattern` (linear or circular). Dimensions may be parameter names or expressions.

## Workflow

1. Read the user's intent. If it names a quantity that will change (count, diameter, thickness, hole spacing), that is a parameter.
2. Pick a sketch on plane `XY` (default) with named `length` constraints (`l1 = "width"`, `l2 = "depth"`, `p1 fixed`).
3. Extrude with `operation: "new"`, `direction: "up"`, `depth: "<param>"`.
4. Add features referencing parameter names (`diameter: "hole"`, `at: ["width / 2", "depth / 2"]`).
5. End with `cad_check_design`. If it reports `RebuildFailed`, read it, fix the cause, repeat.
6. Save with `vcs_commit` on an `ai/<topic>` branch.

## Editing later

- Resize: `cad_modify_entities { id, changes: { parameters: { width: 70 } } }`. Features stay.
- Add a feature: append it to the same `parametric`'s history.
- Refactor features (rare): rewrite the whole `history`. This is a destructive rewrite; the user is the one to confirm.

## When NOT to use parametric

- One-off solids the user will not dimension-drive.
- Generative geometry where expressions get long (10+ chained expressions). Split.

## Limitations (v6.0)

- No `fillet`, `shell`, `pattern-along-path` features yet. Use mesh chamfers (`cad_add_elements { type: "chamferBox" }`) separately.
```

### 2.2 `composed-cam-programs` skill body (add)

```md
---
name: composed-cam-programs
description: Compose sophisticated CAM programs with the cadcamfun agent: operation catalogue, sequencing, stock carry-over, multi-setup, lathe + mill, verification per operation, workflow composition.
category: cam
tags: [cam, workflow, milling, lathe]
---

# Composing sophisticated CAM programs

A real part has many operations. Plan them in this order; never skip ahead.

1. **Probe the work offset** (`cam_create_operation { type: "probing", workOffset: "G55", cycle: "z-surface" }`). Use the result as the milling offset.
2. **Face / clear the top** (`face`) — establishes a reference plane.
3. **Rough** (`roughing` or `adaptive`) — leave 0.1–0.3 mm in a parameter.
4. **Rest** the previous tool's leftover (`rest`) — small tool for corners the big tool could not reach.
5. **Finish** (`parallel` / `waterline` / `scallop`) — climb milling, stepover 5–15 % D.
6. **Drill before tap / thread-mill** (`drill` with `cycle: "G83"`).
7. **Chamfer / engrave** last.
8. **Indexing (3+2)** only after the bulk is removed (`Orient` move between operations).

## Picking an operation

- **Closed outline, outside** of a part → `profile`.
- **Closed outline, inside recess** → `pocket`.
- **Hole pattern** → `drill` (G83 when depth ≥ 3 × D; pilot for Ø > 12 mm).
- **Curved face** → `parallel` (uniform zig-zag) or `waterline` (constant Z) for a 3-axis mill; `scallop` (constant cusp); `pencil` (blend).
- **Deep pockets** → `adaptive` + `rest`.
- **Lathe body** → `facing` → `turning_od` → `parting`. Optional `threading_od`.

## Picking a tool

- `lib_lookup_tool({ type, diameter })`. Confirm:
  - smallest inside radius ≥ cutter radius;
  - cutting length ≥ depth + point (drill);
  - RPM ≤ min(tool.maxRPM, machine.maxRPM).
- Stock carry-over: `restFrom` references the previous toolpath by id; the CPG carries its residual stock.
- Multi-setup: a flip is a new operation tree on its own stock, origin, work offset, fixture description, tools. Never reuse the first setup's depths.

## Verifying per operation

For every operation: `cam_generate_gcode` → `cam_analyze_gcode` → `cam_verify_toolpath`. Fix by cause, regenerate, re-verify. Stop after three rounds on the same finding and report what blocks it. Report `modelled[]` honestly; never claim "safe".

## Workflow composition

When the work is reviewable, use a `.cadcamfun/workflows/*.yml` with `project/validate`, `cam/gcode`, `cam/verify`, `project/require-gcode`, plus the planned `cam/sequence`. The agent opens the PR; a person merges.

## Composing across machines

Mill-turn: lathe body first, parting, separate setup with the rotary as A axis, mill operations with `machineType: "mill"` and `workOffset: "G55"` and a post configured for the trunnion moves.
```

### 2.3 `version-control-cadcam` skill body (add)

```md
---
name: version-control-cadcam
description: How the agent uses cadcamfun's git-style VCS: branches, commits, PRs, and the rules that keep AI writes safe.
category: vcs
tags: [vcs, branches, pr]
---

# Version control for the agent

The `cadcam` agent edits on an `ai/<topic>` branch and opens a PR. A person reviews and merges.

## Order of operations

1. `vcs_status` — branch, dirty, open PRs.
2. `vcs_start_change { topic }` — slugifies to `ai/<topic>`, fails on a dirty working copy.
3. The CAD/CAM edits (`cad_*`, `cam_*`).
4. `vcs_commit { message }` — short imperative, says what and why.
5. `vcs_open_pull_request { title, body }` — triggers `pullRequest` workflows.

## Refused actions

- Commit / restore / merge on `main` for an AI actor.
- A PR whose latest verdict per reviewer is `request-changes` cannot merge.
- Push to GitHub requires a person (`POST /api/projects/:id/vcs/push`).

## Restore

`vcs_restore_paths(paths, from)` rolls back the named ids to a previous commit on the current `ai/*` branch. Use when `cad_check_design` reports a `RebuildFailed` that is faster to revert than to repair. Not available on `main`.

## Diff

`vcs_diff({ from, to })` returns entity-level changes (property pointer + before/after). Useful before opening a PR to write the body.

## CI on the PR

`.cadcamfun/workflows/*.yml` files trigger on `pull_request` / `push`. The agent usually does not edit these; they belong to the human owner. If the agent needs to run them explicitly, `actions_run` runs the `manual` ones.
```

### 2.4 `workflows-cadcam` skill body (add)

```md
---
name: workflows-cadcam
description: How the agent uses cadcamfun's Actions-style workflows: the YAML shape, the registered `uses:` steps, the interpolation, and when to dispatch manually.
category: workflows
tags: [workflows, actions, automation]
---

# Workflows in cadcamfun

A `.cadcamfun/workflows/*.yml` defines one workflow. Triggers (`on:`) are push / pullRequest / manual. Jobs are a `Map<id, { needs, steps }>`; steps share an id-keyed output map; one step's `with:` may interpolate `${{ steps.<id>.outputs.<k> }}`.

## Registered steps (today)

- `project/validate` — every entity JSON parses; `id` matches filename; `name` is a string.
- `project/require-gcode` — every toolpath has committed G-code.
- `cam/verify` — replays each program through `cam.verify.verifyToolpath`; fails on errors.
- `cam/gcode` — regenerates each program from its stored request and compares to the committed G-code; fails on stale.

A typo in `uses:` fails the workflow before anything runs (`missingSteps` in `packages/workflow/src/run.ts:51`).

## Planned steps

- `cam/sequence` — validates the `restFrom` / `prevTool` chain.
- `vcs/commit` — a workflow spawns a sub-commit.
- `notify/push` — APNs push to paired phones.
- `ai/prompt` — a workflow asks the model to summarise a PR or a verification failure.

## Dispatching

- `actions_run` runs the `manual` workflows on the checked-out branch and returns their run ids.
- `pullRequest` triggers fire when `vcs_open_pull_request` is called.
- `push` triggers fire on `vcs_commit`.

## A worked example

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
      - id: v  uses: cam/verify
      - id: m  uses: project/require-gcode
```

## Reading the run

Each run streams `RunEvent`s (`job-start`, `step`, `job-end`); an event has `uses`, `status` (`success`/`failure`/`skipped`), optional `message` and `outputs`. The UI surfaces them in real time. An unrelated typo in one step never hides the verdict of the twenty steps before it.
```

## 3. Tools (WP8)

**Implementation note (landed, no-new-files):** the eleven tools below were added as *inline host specs* in `apps/sidecar/src/services/ai.ts` (`libraryToolSpecs`), not as `packages/ai/src/tools/<id>.ts` + `prompts/<id>.txt`. Reason: the host derives the permitted tool ids from `toolsFor(projectId)` (`packages/ai/src/nikcli/runtime.ts:164`), so an inline spec is auto-permitted for `cadcam` and any specialist that names it, needs no prompt file (the description is in the spec), and adds no new integration. The behaviours live on `ToolHandlersShape` (`packages/ai/src/tools/handlers.ts`): `listComponents`, `saveComponent`, `insertComponent`, `deleteComponent`, `upsertMaterial`, `upsertTool`, `upsertMachineConfig`, `setProjectDefault`, `suggestChain`, `chainStatus`; the sidecar implements them in `ai.ts` over `ComponentRepo`, `MaterialRepo`, `ToolRepo`, `MachineConfigRepo`, `KvStore`. Tests: `apps/sidecar/test/ai-cam-tools.test.ts` (`describe("library and chain tools (spec 22 §3)")`). If the tool eventually needs a package prompt, move it then; the inline path is the one that keeps this commit to existing files.

### 3.5 Machine-configuration reads (add 1, landed)
`lib_lookup_machine_config` is the third `lib_lookup_*` tool, added beside `lib_lookup_material` and `lib_lookup_tool` in `libraryToolSpecs`. Materials and tools had a read path; machine configurations had only `cam_describe_machine`, which describes a *kind* of machine (kinematics table) and not the user's saved rows. The new tool reads `MachineConfigRepo.list` for the acting user (public rows included) and returns `{id, name, description, type, config, isPublic, isOwner, usageCount, updatedAt}`; the handler is `lookupMachineConfig` on `ToolHandlersShape`. An empty query returns the most recently updated rows, so the model can enumerate the user's machines.

### 3.6 Library deletes (add 1, landed)

`lib_delete({ kind, id, confirm: true })` removes one library row: `kind` is `material`, `tool` or `machine_config`. One tool with a discriminator instead of three, because the tool surface is already 62 ids wide and the three deletions share the same shape. The rules are the existing HTTP ones, not new ones: a material or a tool is deleted when `find` returns it and `canWrite` is true (owner, or organisation write access); a machine configuration when `permission.isOwner` is true and `usageCount` is 0. The handler is `deleteLibrary` on `ToolHandlersShape`, and `confirm: z.literal(true)` makes it a separate user action.

### 3.7 Searching the drawing's elements (no new tool, landed)

`cad_inspect` grew an `action: "search"` instead of a new `cad_grep_elements` tool: the model already pages through elements with `offset`/`limit`, and a second read tool would only double the surface. `search` takes `query` (case-insensitive substring), optional `layerId` and `limit` (1–50, default 20) and returns every match's id, type, name, layer and the property paths and values the query was found in, plus `total`, `returned` and `complete` so a truncated result is never mistaken for a full one. The walk is bounded (depth 6, at most 20 hits per element, values clipped to 120 characters) and skips `elements`, `vertices` and `faces`, so searching a large model stays cheap. Implementation: `searchElement` and the `search` branch in `apps/sidecar/src/services/ai.ts`.

### 3.8 Stock has two faces (landed, spec 18 §7 and 06)

`cam_stock` `action: "set"` now writes both sides of the raw piece, which is what makes the CAD stock and the CAM stock one thing:

- the drawing's `stock` (unchanged: CAM generation, verification and invalidation all read it), and
- a `workpiece` **element** in the drawing, which is the raw piece the CAD scene draws (`createThreeObject` case `workpiece`), so it survives reopening the project and travels with the project's history through the VCS.

The element's centre is `x, y, topZ - depth / 2`, so its top face is `topZ`. The stored stock's `elementId` is set to that element, which is what `cam-sync.ts` mirrors into the CAD store and what `job.ts` derives stock from when the CAD store is not configured. Pointing `elementId` at a real part element keeps that element as the stock's source and adds nothing to the scene. `action: "inspect"` reports the `workpiece` element and `workpieceMatchesStock`, which is false when the scene and the CAM stock disagree. Tests: `apps/sidecar/test/ai-stock-inspection.test.ts` ("explicit stock drives real removal simulation and invalidates generated programs on change").


### 3.1 `cad_component_*` canvas/reuse tools plus `lib_lookup_component`

Source layout (in `packages/ai/src/tools/`):

```
cad_component_list.ts
cad_component_save.ts
cad_component_insert.ts
cad_component_delete.ts
prompts/cad_component_list.txt
prompts/cad_component_save.txt
prompts/cad_component_insert.txt
prompts/cad_component_delete.txt
```

Content — `cad_component_list.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const cadComponentList = defineTool("cad_component_list", {
  parameters: z.object({}),
  execute: (_input, { handlers, projectId }) => handlers.listComponents(projectId)
})
```

`lib_lookup_component` is a sidecar host spec parallel to `lib_lookup_material`: it accepts `{ query }`, searches saved components across every project visible to the acting user (plus public components), and returns saved ids suitable for `cad_component_insert`.

`cad_component_save.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const cadComponentSave = defineTool("cad_component_save", {
  parameters: z.object({ ids: z.array(z.string()).min(1), name: z.string().min(1) }),
  execute: ({ ids, name }, { handlers }) => handlers.saveComponent(ids, name)
})
```

`cad_component_insert.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
import type { cad } from "@cadcamfun/core"
export const cadComponentInsert = defineTool("cad_component_insert", {
  parameters: z.object({ componentId: z.string(), transform: z.object({ x: z.number(), y: z.number(), z: z.number(), rotation: z.record(z.string(), z.number()).optional() }).optional() }),
  execute: ({ componentId, transform }, { handlers }) => handlers.insertComponent(componentId, transform as cad.ElementTransform | undefined)
})
```

`cad_component_delete.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const cadComponentDelete = defineTool("cad_component_delete", {
  parameters: z.object({ componentId: z.string(), confirm: z.literal(true) }),
  execute: ({ componentId }, { handlers }) => handlers.deleteComponent(componentId)
})
```

The `tools/handlers.ts` interface gains:

```ts
listComponents(projectId: string): Promise<unknown>
lookupComponent(query: string): Promise<unknown>
saveComponent(ids: ReadonlyArray<string>, name: string): Promise<unknown>
insertComponent(componentId: string, transform?: cad.ElementTransform): Promise<unknown>
deleteComponent(componentId: string): Promise<unknown>
```

`registry.ts` gets the four new ids registered next to `cad_transform_entities`.

Prompts (one-liners):

- `cad_component_list.txt`: "List component instances currently present on the active CAD canvas. Returns canvas element ids, not saved-library ids."
- `lib_lookup_component`: "Search the user's saved reusable components. Use its saved component id with `cad_component_insert`."
- `cad_component_save.txt`: "Gather selected elements into a named, reusable component. Children are references; later edits to the parent flow through."
- `cad_component_insert.txt`: "Insert a component by id with an optional transform. Returns new element ids."
- `cad_component_delete.txt`: "Delete a reusable component. Destructive — `confirm: true` required."

### 3.2 `lib_upsert_*` + `lib_set_default` library write tools (add 5, planned in spec 18 §6 + spec 20 §P4.3)

```
lib_upsert_material.ts   + prompt
lib_upsert_tool.ts       + prompt
lib_upsert_machine_config.ts + prompt
lib_set_default.ts       + prompt
```

`lib_upsert_material.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
const props = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export const libUpsertMaterial = defineTool("lib_upsert_material", {
  parameters: z.object({
    id: z.string().optional(), name: z.string().min(1),
    description: z.string().optional(), properties: props,
    isPublic: z.boolean().default(false)
  }),
  execute: (input, { handlers }) => handlers.upsertMaterial(input)
})
```

`lib_upsert_tool.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const libUpsertTool = defineTool("lib_upsert_tool", {
  parameters: z.object({
    id: z.string().optional(), name: z.string().min(1), type: z.string(),
    diameter: z.number().positive(), material: z.string(), numberOfFlutes: z.number().int().positive().optional(),
    maxRPM: z.number().int().positive().optional(), coolantType: z.string().optional(),
    cuttingLength: z.number().positive().optional(), totalLength: z.number().positive().optional(),
    shankDiameter: z.number().positive().optional(), notes: z.string().optional(),
    isPublic: z.boolean().default(false)
  }),
  execute: (input, { handlers }) => handlers.upsertTool(input)
})
```

`lib_upsert_machine_config.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
const kinematics = z.record(z.string(), z.object({ min: z.number(), max: z.number() }))
export const libUpsertMachineConfig = defineTool("lib_upsert_machine_config", {
  parameters: z.object({
    id: z.string().optional(), name: z.string().min(1),
    kind: z.enum(["mill", "lathe", "3Dprinter"]),
    kinematics: kinematics, postProcessor: z.string(),
    workOffsets: z.array(z.string()).default(["G54", "G55", "G56", "G57", "G58", "G59"]),
    probing: z.record(z.string(), z.unknown()).optional(),
    maxRPM: z.number().int().positive().optional(),
    maxFeed: z.number().positive().optional(),
    isPublic: z.boolean().default(false)
  }),
  execute: (input, { handlers }) => handlers.upsertMachineConfig(input)
})
```

`lib_set_default.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const libSetDefault = defineTool("lib_set_default", {
  parameters: z.object({
    materialId: z.string().optional(),
    toolId: z.string().optional(),
    machineConfigId: z.string().optional()
  }),
  execute: (input, { handlers }) => handlers.setProjectDefault(input)
})
```

`handlers.ts` grows:

```ts
upsertMaterial(input): Promise<unknown>
upsertTool(input): Promise<unknown>
upsertMachineConfig(input): Promise<unknown>
setProjectDefault(input): Promise<unknown>
```

(Each writes the row and appends a `*.json` change into the VCS tree.)

Prompts are short and explicit; an example for `lib_upsert_material.txt`:

```
Upsert a Material row. Destructive replace; create-only when id is omitted. isPublic=true shares the row with every project of the org.
```

### 3.3 `cam_operations_suggest_chain` tool (add)

Add `packages/ai/src/tools/cam_operations_suggest_chain.ts`:

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const camOperationsSuggestChain = defineTool("cam_operations_suggest_chain", {
  parameters: z.object({
    projectId: z.string(),
    fromOperationId: z.string().optional(),
    materialHint: z.string().optional(),
    toolHint: z.string().optional()
  }),
  execute: (input, { handlers, projectId }) => handlers.suggestChain({ ...input, projectId: projectId ?? input.projectId })
})
```

`handlers.ts` grows `suggestChain(input): Promise<unknown>`; the sidecar implementation reads the next reasonable operation kind + params from `core/cam/sequencer.ts` (new module) that looks at the model's residual stock + largest remaining feature and returns a `cam_create_operation`-shaped object.

Prompt:

```
Given the current state of the project (operations, residual stock, materials and tools used so far), return the next recommended operation as a JSON object suitable for `cam_create_operation`. Read-only.
```

### 3.4 `cam_chain_status` tool (add)

```ts
import { z } from "zod"
import { defineTool } from "./define.ts"
export const camChainStatus = defineTool("cam_chain_status", {
  parameters: z.object({ operationId: z.string() }),
  execute: ({ operationId }, { handlers, projectId }) => handlers.chainStatus({ projectId, operationId })
})
```

Returns the operation's `restFrom`, `prevTool`, the previous toolpath's residual stock height map snapshot (or `undefined`), warnings (`OrphanRef`, `CyclicChain`, `UnknownRef`), and the regenerated G-code.

Prompt:

```
Read the chain state of one operation: restFrom / prevTool references, residual stock snapshot, warnings. Read-only.
```

## 4. Sidecar fixes (WP11 / WP12)

### 4.1 `vcs_restore_paths` sidecar function (refine)

Append to `apps/sidecar/src/services/ai-vcs-tools.ts`:

```ts
tool("vcs_restore_paths", "Roll back the named ids to a previous commit on the current `ai/*` branch. Not on `main`. Destructive.", z.object({
  paths: z.array(z.string()).min(1).max(200),
  from: z.string().min(1)
}), (id, { paths, from }) =>
  Effect.gen(function*() {
    const { current } = yield* vcs.branches(id)
    if (current === "main") return yield* Effect.fail(new Error("Restore on main is not allowed."))
    const oid = yield* vcs.restorePaths(id, paths, from, actor)
    return { oid, branch: current, paths }
  }))
```

### 4.2 `COMPANION_ROUTES` addition (refine)

In `apps/sidecar/src/services/companion-gateway.ts`, `vcs_restore_paths` is **not** registered by default. The "only on desktop-initiated sessions" gate is a context check: the call records a `routeSessionType` attribute; phone sessions return 403, desktop sessions return 200. Document the rule:

```ts
// Companion routes that are unsafe for phones
const PHONE_BLOCKED = new Set(["vcs/restore", "vcs/commit", "vcs/checkout"])
```

(Reference rule, not a literal code change: the existing allow-list already excludes write routes; this is a sanity log note in the file.)

### 4.3 `ActivityLog` citation for AI commits (refine, partial in spec 21 §10.4)

In `apps/sidecar/src/services/project-vcs.ts`, the AI commit citation is built like this:

```ts
const promptCitation = (actor.kind === "ai" && actor.lastPrompt)
  ? `[ai] ${actor.lastPrompt.replace(/\s+/g, " ").slice(0, 200)}`
  : undefined
yield* activityLog.append({ kind: "vcs.commit", branch, oid, actor: { ...actor, citation: promptCitation } })
```

`actor.lastPrompt` is set by the sidecar AI bridge whenever a turn's first tool is `vcs_start_change`; the prompt is the user message that opened that turn.

### 4.4 `cam/sequence` workflow step (add)

In `apps/sidecar/src/services/workflow-steps.ts`, append:

```ts
export const camSequence: StepRegistry<StepContext>["cam/sequence"] = ({ ctx }) =>
  Effect.gen(function*() {
    const snap = filesToSnapshot(ctx.files)
    const issues: string[] = []
    for (const [id, t] of Object.entries(snap.toolpaths)) {
      const data = (t.data ?? {}) as { restFrom?: string; prevTool?: string }
      if (data.restFrom && !snap.toolpaths[data.restFrom]) issues.push(`${id}: restFrom ${data.restFrom} missing`)
      if (data.prevTool && !snap.toolpaths[data.prevTool]) issues.push(`${id}: prevTool ${data.prevTool} missing`)
    }
    if (issues.length > 0) return yield* new StepError({ message: issues.join("; ") })
    return { toolpaths: Object.keys(snap.toolpaths).length }
  })
```

Register it in `builtinSteps`:

```ts
export const builtinSteps: StepRegistry<StepContext> = {
  "project/validate": projectValidate,
  "project/require-gcode": projectRequireGcode,
  "cam/verify": camVerify,
  "cam/gcode": camGcode,
  "cam/sequence": camSequence
}
```

**Correction (landed):** the snippet above assumes a toolpath-to-toolpath `restFrom`/`prevTool` id chain that does not exist in the data model (a toolpath stores `data.request.{settings,geometry,printer}`; `restFrom` is a tool descriptor *inside* settings, not a toolpath id, and there is no `prevTool` field). The implemented `cam/sequence` therefore checks the two invariants the real data supports, both from the stored generation request:

- one tool number (`settings.toolNumber`) names one tool (same `toolType` + `toolDiameter`);
- a rest-machining operation (`settings.useRestMachining`) names a previous tool larger than its own (`settings.restToolDiameter` > `settings.toolDiameter`).

See `apps/sidecar/src/services/workflow-steps.ts` (`camSequence`) and its tests in `apps/sidecar/test/workflow-steps.test.ts`.

### 4.5 `vcs/commit` workflow step (add)

A step that lets a workflow create a sub-commit (e.g. "after a passing `cam/verify`, format the README for the PR"):

```ts
export const vcsCommit: StepRegistry<StepContext>["vcs/commit"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const message = str(w, "message")
    if (message === undefined) return yield* new StepError({ message: "vcs/commit needs with.message" })
    // Defer to the sidecar's ProjectVcs with the workflow actor; requires a registered sidecar bridge.
    const handle = (ctx.extra as { vcsCommit?: (message: string) => Effect.Effect<{ commit: string }> }).vcsCommit
    if (handle === undefined) return yield* new StepError({ message: "vcs/commit: no ProjectVcs bridge in ctx.extra" })
    const out = yield* handle(message)
    return { commit: out.commit }
  })
```

`ctx.extra` is the sidecar-injected bridge so the engine stays pure. Add `vcsCommit` to the runner's `RunOptions.ctx.extra` and register the step in the same commit.

### 4.6 `notify/push` workflow step (add)

```ts
export const notifyPush: StepRegistry<StepContext>["notify/push"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const handle = (ctx.extra as { notify?: (input: { message: string; url?: string }) => Effect.Effect<{ delivered: number }> }).notify
    if (handle === undefined) return yield* new StepError({ message: "notify/push: no notify bridge in ctx.extra" })
    const message = str(w, "message") ?? "Workflow event"
    const url = str(w, "url")
    return yield* handle({ message, ...(url !== undefined ? { url } : {}) })
  })
```

### 4.7 `ai/prompt` workflow step (add)

```ts
export const aiPrompt: StepRegistry<StepContext>["ai/prompt"] = ({ ctx, with: w }) =>
  Effect.gen(function*() {
    const prompt = str(w, "prompt")
    if (prompt === undefined) return yield* new StepError({ message: "ai/prompt needs with.prompt" })
    const handle = (ctx.extra as { aiPrompt?: (input: { prompt: string }) => Effect.Effect<{ text: string; model: string }> }).aiPrompt
    if (handle === undefined) return yield* new StepError({ message: "ai/prompt: no bridge in ctx.extra" })
    return yield* handle({ prompt })
  })
```

The sidecar bridge uses `AiService.complete` (no streaming; the workflow expects a single text result).

## 5. Workflow package fixes (refine, addresses real LSP errors)

### 5.1 Export `StepContext` from `@cadcamfun/workflow`

The LSP error in `apps/sidecar/src/services/workflow-steps.ts:17` is real: `StepContext` is defined in `packages/workflow/src/run.ts` but the package's `index.ts` does not re-export it.

Edit `packages/workflow/src/run.ts:1` so `StepContext` is exported (it already is at the top of `run.ts`; it just needs to be reachable from the package barrel).

Verify by `grep`:

```bash
grep -n "StepContext" packages/workflow/src/index.ts packages/workflow/src/run.ts
```

Expected after the fix: `StepContext` appears in `index.ts`. The `export *` pattern already does this — the LSP error is likely a stale cache. Re-issuing `bun install` clears it; if not, add a named `export type { StepContext } from "./run.ts"` to `index.ts`.

### 5.2 Widen `bytes: unknown` to `Uint8Array<ArrayBufferLike>`

The LSP error in `apps/sidecar/src/services/workflow-steps.ts:67` originates from this line:

```ts
const parsed = yield* Effect.try({ try: () => JSON.parse(toText(bytes)) as Record<string, unknown>, catch: () => new StepError({ message: `${path} is not valid JSON` }) })
```

`ctx.files` is `Record<string, Uint8Array>` (the `StepContext` shape). `bytes: unknown` comes from `Object.entries(ctx.files)` returning `unknown`-typed values. Fix:

```ts
for (const [path, raw] of Object.entries(ctx.files)) {
  const bytes = raw as Uint8Array<ArrayBufferLike>
  // ...
}
```

Or change `StepContext.files` to `Readonly<Record<string, Uint8Array<ArrayBufferLike>>>` and re-export the type.

Either fix resolves the LSP error and the `toText` call works without a cast at the call site.

## 6. Workflow entry unification (refine, partial in spec 21 §14.2)

`apps/sidecar/src/services/workflow-runner.ts` already exposes `trigger({type: "manual"|"push"|"pullRequest"})`. The `actions_run` AI tool currently only triggers `manual` (spec 21 §14.2). Add a `trigger` parameter to the tool:

```ts
tool("actions_run", "Run the project's workflows. Default dispatch: trigger the `manual` workflows on the checked-out branch and report their ids.", z.object({
  trigger: z.enum(["manual", "pull-request", "push"]).default("manual")
}), (id, { trigger }) =>
  Effect.gen(function*() {
    const { current } = yield* vcs.branches(id)
    return (yield* runner.trigger(id, current, { type: trigger })).map((r) => ({ workflow: r.workflow, status: r.status }))
  }))
```

This collapses the three trigger types into one tool entry, matching `packages/workflow/src/trigger.ts`.

## 7. VCS schema refinement — `PR.remoteNumber` (already in spec 21 §9.8)

`services/project-vcs.ts` reserved `PullRequest.remoteNumber` for the future GitHub mirror step. The companion gateway log note already refuses `push`/`pull` for AI actors; the comment block documents the next concrete action.

### 3.9 Who may use them (landed)

`packages/ai/src/tools/project-tools.ts` holds the ids the sidecar registers beside `TOOL_IDS` (`LIBRARY_TOOL_IDS`, `VCS_TOOL_IDS`, `BACKGROUND_TOOL_IDS` → `SIDECAR_TOOL_IDS`) and the groups a specialist is built from (`LIBRARY_READ_ALL`, `LIBRARY_WRITE_TOOL_IDS`, `CHAIN_TOOL_IDS`, `COMPONENT_TOOL_IDS`). `nikcli/agents.ts` composes the five rosters from those groups, and the sidecar's `libraryToolSpecs` throws if it builds a spec whose id is not in `LIBRARY_TOOL_IDS`, so neither side can drift from the other. The table in spec 16 §3 is the readable form of the result: every specialist that reasons about machining or parts reads the libraries, only the `machinist` writes them, the read-only roles never write anything, and the tool surface grew by two ids instead of one per action.

## 8. Acceptance criteria (updated)

1. Each `gap` row in spec 21 maps to a section in this spec and a PR that lands it.
2. The LSP errors in `workflow-steps.ts` disappear after §5.1 and §5.2 land.
3. `tool-prompts.test.ts` continues to pass with the four added `cad_component_*` tools, the four `lib_upsert_*` tools, and the two `cam_*_chain` tools.
4. `companion-gateway.test.ts` continues to refuse phone-written VCS routes after §4.2.
5. The 4 newly written skills (`parametric-design`, `composed-cam-programs`, `version-control-cadcam`, `workflows-cadcam`) load via the host's `skill` tool.
6. The 4 newly built workflow steps (`cam/sequence`, `vcs/commit`, `notify/push`, `ai/prompt`) pass `tool-prompts.test.ts`-style contract checks (each `uses` maps to a registered handler; unknown ones still fail fast).
7. No existing test in spec 20 §9 breaks.
8. `agents.test.ts` proves every specialist's tool id is registered, that no roster repeats an id, that library reads are on every machining/parts role, and that only `machinist` holds the library writes.
9. `cam_stock` sets the raw piece on both sides: the drawing stock the CAM side machines and the `workpiece` element the CAD scene draws, with `workpieceMatchesStock` reporting any disagreement.
10. Reopening a project through `/cad?projectId=` opens its newest drawing instead of an empty canvas.

## 9. Change log

- v1: gap-fill with concrete source for 4 new skills, 11 new tools, 4 new workflow steps, 1 specialist addition (`reviewer`), 1 sidecar refinement (`vcs_restore_paths`, `actions_run` trigger parameter), 1 package export fix (`StepContext`), 1 widening fix (`Uint8Array<ArrayBufferLike>`). Tied row-by-row to spec 21.
- v2 (2026-10-11): §3.5 `lib_lookup_machine_config` (the missing library read), §3.6 `lib_delete` (one discriminated tool for library deletes, `confirm: true`, HTTP rules reused), §3.7 `cad_inspect` `action: "search"` (element grep, no new tool id), §3.8 `cam_stock` writes the `workpiece` element beside the drawing stock so the CAD stock and the CAM stock are one piece. Recency note: the tool surface is already ~62 ids, so every addition here reuses an existing tool or adds a single discriminated tool instead of a new one per action.
