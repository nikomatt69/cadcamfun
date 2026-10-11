# 19 — Context Awareness Contract

Status: v2 — describes what the agent sees about the project, the unit system, the machine, the verification state, the selection and the user's intent, and what it must do to stay correct. Source-grounded in `packages/ai/src/workspace-context.ts`, `packages/ai/src/prompts/{system,workflows}.ts`, and `apps/desktop/src/state` (the editor snapshot store).

The principle: **the agent's effective view of the project is the workspace context renderer plus the system prompt plus the conversation history nikcli holds**. The renderer summarizes units, tolerances and current state; system and specialist prompts define behavioural rules. Fresh tool results, discovered schemas and loaded skills also reach the model and can supersede the snapshot. This spec records the contract: what is in the context, what is not, when the context is refreshed, and how the model must reason about it.

## 1. The contract in one paragraph

A snapshot of the editor (`ai.context.<projectId>`) is rendered as sectioned text inside a 6 000-character budget (`DEFAULT_CONTEXT_BUDGET` in `packages/ai/src/workspace-context.ts:12`). Sections come in priority order: document + units, selection, model, layers, stock, machine/controller/post/material/operation/tool/offset, toolpaths, verification state with first findings, G-code size, attached files, elements, G-code preview. When the budget runs out, the long low-value parts shrink first and say how much was omitted, so the model knows to call `cad_describe_drawing` rather than guess. The model never sees the raw JSON. Tool results are written through to the editor immediately and become part of the next context refresh.

## 2. What the desktop keeps

### 2.1 The snapshot

`apps/desktop/src/state` (per `08-ai.md` §"Workspace integration") keeps a JSON snapshot of the workspace in `ai.context.<projectId>`:

```ts
interface WorkspaceSnapshot {
  projectId?: string
  name?: string                       // drawing name
  page?: "cad" | "cam"
  viewMode?: "3d" | "2d"
  displayUnits?: "mm" | "in"          // what the user reads
  tolerance?: number                  // mm
  decimals?: number                   // user-visible decimals
  totalElementCount?: number
  omittedElementCount?: number        // when the renderer trimmed
  elements?: ReadonlyArray<{          // capped, newest on top
    id: string
    type: string
    name?: string
    x?: number; y?: number; z?: number
    width?: number; height?: number; depth?: number; radius?: number
  }>
  selectedIds?: ReadonlyArray<string>
  layers?: ReadonlyArray<{ name: string; visible?: boolean; locked?: boolean; active?: boolean }>
  activeLayer?: string
  workpiece?: { width: number; height: number; depth?: number; thickness?: number }
  cam: {
    machineType?: string
    controller?: string
    postProcessor?: string
    material?: string
    settings?: {
      operationType?: string
      toolType?: string
      toolDiameter?: number
      workOffset?: string
      // ...other settings bound to the active operation
    }
    toolpaths?: ReadonlyArray<{ id: string; name?: string; moveCount: number }>
    verification?: {
      state: "not-run" | "stale" | "ok" | "errors"
      errors?: number
      issues?: ReadonlyArray<{ code: string; message: string; line?: number }>
    }
    gcodeLines?: number
    gcodePreview?: string             // first lines, capped
  }
  attachments?: ReadonlyArray<string>
  notes?: ReadonlyArray<{ key: string; value: unknown }>     // rendered last in renderNotes
}
```

### 2.2 When the snapshot is written

- On every editor action that mutates entities (add / modify / delete / transform / group).
- On every CAM page action (create / update operation, generate, analyse, verify).
- **Not** continuously. The editor is the source of truth; the assistant panel can race with editor changes (`08-ai.md` §"Tool results show on screen" says "The live editor is copied into the stored drawing when a message is sent, not continuously; edits made in the editor while the assistant is answering are overwritten by its next tool result for the same element ids only.").

### 2.3 When the snapshot is read

- On every chat turn, before the model is prompted. The renderer's output is appended to the system prompt.
- On every specialist's prompt, scoped to that project.
- **Not** between retries of the same turn — the context is fixed per `hostChatStream` call; only the user message + attached files + system prompt change between attempts.

## 3. How the renderer reduces the world to text

Source: `packages/ai/src/workspace-context.ts`. The renderer is the only place the agent's view of the project is shaped.

### 3.1 Sections in priority order

1. **Document + units** — `Workspace: <page>, drawing "<name>" (project ...). Units: tool calls in mm; the user reads <mm|in>. Drawing tolerance <N> mm (<N µm>), <D> decimals. View: <3d|2d>.`
2. **Selection** — `Model: <count> elements (<breakdown>); <sel> selected (<ids>).` Starred ids, hidden ones counted.
3. **Layers** — `Layers: <name>(hidden)(locked), <name>, ... ; active <name>.`
4. **Stock** — `Stock: W×H×D mm.` (only when set).
5. **Machining** — `CAM: machine <kind>, controller <c>, post <p>, material <m>, operation <op>, tool <type> Ø<D>, offset <G5N>.`
6. **Toolpaths** — `Toolpaths: name (N moves), name (N moves), ... (+N more).`
7. **Verification** — `Verification: <state>[ | <N> errors [<code>@L<line>, ...>]].`
8. **G-code** — `G-code: <N> lines.`
9. **Files** — `Attached files: <name>, ... .`
10. **Elements** — `Elements (* = selected; <N> not shown — call cad_describe_drawing):\n<rows>`.
11. **G-code preview** — `G-code start (<kept> of <N> lines):\n<preview>`.

### 3.2 Budget enforcement

`head = sections 1–9`. `left = budget - head.length`. Section 10 prioritizes selected elements and takes up to 70 % of `left`. Section 11 takes the rest, capped at 12 original G-code lines. A final strict cap applies to all sections, retaining only complete lines so identifiers are never partially published. Truncation explicitly instructs inspection; tiny budgets may contain only part of that marker. Layer names are bounded and the first 12 layers are listed. Default workspace budget is 6,000 characters; saved-note budget is 1,500 characters including headers and omission notices.

### 3.3 Defensive encoding

Every field uses `str(undefined → undefined)`, `num(undefined → undefined)`, `rec(not-object → {})`, `arr(not-array → [])`. The renderer never invents a value (`packages/ai/src/workspace-context.ts:15-25`). Sections whose data is missing are dropped or marked unknown. Missing display units and model counts do not imply mm or an empty drawing. Missing entity types/IDs remain unknown; unrecognized verification states are explicitly unknown, never passed. Labels have line breaks/control characters removed and names are JSON-quoted. Structured saved notes retain JSON fields, with bounded values and no accidental `[object Object]` conversion. Tool identifiers are kept whole or omitted. Finite model values retain source precision, including sub-micron tolerances; they are not rounded to three decimals.

## 4. The system prompt's role

`packages/ai/src/prompts/system.ts` is appended to the message as `system`. It tells the model:

- **Units.** "Tool calls in mm; the user reads `<displayUnits>`." This matches the renderer's "Units:" line.
- **Tool-call hygiene.** Plain JSON, arrays-as-arrays, numbers-as-numbers. A failed call is information; resend with the named cause, never repeat verbatim.
- **Modelling discipline.** 5–15 elements per `cad_add_elements` call, 40 max. Decompose before you build. Base body first, features, secondary parts, details. Read back with `cad_describe_drawing` between groups.
- **Machining discipline.** Setup first. One operation at a time, end to end. Fix by cause, never by symptom. Stop after three rounds on the same finding and report the cause.
- **Delegation briefs.** "Use `agent_task` for the heavy jobs; one specialist per call; pass it the entity ids it needs; the specialist does not see this conversation."
- **Version control.** Always call `vcs_status` first. `vcs_start_change` BEFORE edits on `ai/<topic>`. `vcs_commit` AFTER edits. `vcs_open_pull_request` to surface the work. Never commit to `main`, never merge.
- **Files.** Attach a DXF/SVG/STEP via `cad_import_drawing { attachment, depth }` (or `up` for STEP). Say when an attachment was unread.
- **Asking.** When the prompt is ambiguous, ask one question, not three. Never impersonate the user's silence as agreement.
- **Style.** Concise responses in the user’s language, reporting changed entity IDs and values with units, checked evidence and remaining limitations.

The system prompt is built once per turn and not edited; the model's behavioural rules do not drift within a turn.

## 5. Mode / skill / context: what the model picks

### 5.1 Mode picker

`packages/ai/src/prompts/modes.ts` + `SUGGESTED_PROMPTS` map a mode name (`"general" | "cad" | "cam" | "gcode" | "toolpath"`) to starter questions. The `cadcam` agent's mode is implicit (always `cadcam`), but the system prompt varies by intent.

### 5.2 Skills (on-demand)

The model picks a `skill` from the catalogue (built-in + user). Skills are listed to the model by nikcli from `<configDir>/skills/<name>/SKILL.md`. The agent loads one when it needs the playbook; the system prompt does not embed the playbook text (which would burn the budget).

### 5.3 Specialist selection

`agent_task { agent }` defaults to `researcher`. The model names a specialist when the work warrants it. The dispatch rules (spec 16 §3.1) ensure editors run one at a time and the researcher runs in the background.

### 5.4 User intent -> tool path

A natural-language intent is mapped to a tool sequence by `skills/*` (CAD-side: `cad-3d-modeling`; CAM-side: `cam-operation-workflow`). The skills embed the pattern as text; the model follows it. The pattern is also enforced by `tools/prompts/<id>.txt` (each tool says "after calling me, do X next").

## 6. Unit and measurement awareness

### 6.1 Internal units are mm and radians

Per `01-conventions.md` §1: "Units: **millimetres and radians internally**; convert only at the UI/G-code boundary." Tool calls use mm; arc / revolution angles use radians; an element's `rotation` is in degrees. The renderer prints `Units: tool calls in mm; the user reads mm.` so the model never doubts.

### 6.2 The renderer exposes what the user sees

`displayUnits: "mm" | "in"`; the renderer prints "Units: tool calls in mm; the user reads **in**." The system prompt repeats it. A request "the 1 inch plate" is a 25.4 mm plate — the model converts and says so.

### 6.3 Tolerance

`Drawing tolerance <N> mm (<N> µm>), <D> decimals`. The agent uses the drawing tolerance as the default for round shapes (`cad_add_elements { ... tolerance: snapshot.tolerance }`) and for verification (`cam_verify_toolpath { tolerance: snapshot.tolerance }`). For micron work the agent reads the `precision-and-tolerances` skill.

### 6.4 Decimals

`<D>` decimals the user sees; the renderer reports it but does not round the model-side values. The agent keeps every decimal a measurement carries; rounding is for the display.

### 6.5 Bounds, sizes, distances

Every numeric value in tool calls is in mm or rad. The agent must not write a number with a unit symbol (`50mm` is **wrong**; `50` is right). Coordinates of points are in the project's global frame.

## 7. Selection and live-state awareness

### 7.1 Selected ids

The renderer prints the selection ids; `cad_describe_drawing` returns them with their full shape. The agent either edits the selection (default) or names the ids it wants (`cad_modify_entities { id, changes }`). The system prompt says "act on the selection when nothing else is named."

### 7.2 Page

`page: "cad" | "cam"` tells the agent whether the user is in CAD or CAM mode. CAD-side tools write to entities; CAM-side tools write to operations. A mixed request ("build this then machine it") can continue through both phases in one host turn, checking each phase before proceeding.

### 7.3 View mode

`viewMode: "3d" | "2d"` matches the user's viewport; the agent does not need to switch it. A 2D request is a sketch; a 3D request is a part.

### 7.4 Active layer

The active layer is the layer a new `cad_add_elements` writes to by default. A request "in the **Wheels** layer" forces the agent to pass `layer: "Wheels"`; the tool creates the layer if missing.

## 8. Verification awareness

### 8.1 Verification state in the renderer

`cam.verification.state ∈ { "not-run", "stale", "ok", "errors" }`. Issues print with their code and line number. The renderer keeps the first 4 (`workspace-context.ts:91-95`).

### 8.2 What the agent does with each state

- `not-run`: just generated? call `cam_verify_toolpath`. The user hasn't seen a verdict yet.
- `stale`: G-code has changed since the last verification; re-verify before reporting anything green.
- `ok`: say what passed, with what was modelled (`modelled[]` from `cam.verify`).
- `errors`: list the first N issues; propose fixes by cause; never claim a fix without a re-verify.

### 8.3 Verification report on the operation

`data.verification` on the toolpath row is the source of truth (per `08-ai.md` §"Tool results show on screen"). The agent stores the full report there; the UI reads it for the Verify tab.

### 8.4 What the agent never claims

- "Safe", "certified", "collision-free". The verification reports what it modelled (`modelled[]`); the agent writes "no errors found in what was modelled" (`packages/ai/src/skills/index.ts:85`).
- "In tolerance on the machine" for micron work. The verification is at the chosen resolution and tolerance; tool wear, thermal growth, machine accuracy are not modelled (`precision-and-tolerances` skill).

## 9. Honesty and recovery

### 9.1 The agent reports what it did

Every model answer ends with what was changed, what was checked, what was not done or not verified, and never claims a change a tool result did not confirm. This is in the system prompt and in every specialist's `REPORT`.

### 9.2 The agent restores from a dropped connection

The turn belongs to the host session (`packages/ai/src/nikcli/chat.ts`). A dropped UI does not abort the turn. The UI recovers by polling `POST /api/ai/sessions/state`. The agent's answer appears when the turn finishes; the editor reflects the changes from the tool calls the host carried out.

### 9.3 The agent retries on transient failure, gives up on real failure

`isTransientFailure` recognises overload, rate limit, 5xx, timeout, network, dropped connection. The agent retries (resume curve, up to 5). Auth, quota, context-length, model errors are not transient; the agent reports and stops.

### 9.4 The agent asks when the prompt is ambiguous

When the prompt names a dimension that is missing ("the hole should be 5 mm too deep for the stock") or a choice the prompt does not pin down ("which of these three materials"), the agent asks one question and stops that branch. The system prompt enforces this.

## 10. Acceptance criteria

1. `renderWorkspaceContext(snapshot)` never invents a value; missing data is omitted or explicitly unknown.
2. The renderer budget is 6 000 chars by default; passing `budget: N` shrinks proportionally. The element list never claims to be exhaustive when the budget omitted rows.
3. The system prompt's units line matches the renderer's units line on every turn.
4. A 1-inch request converts to 25.4 mm before any tool call.
5. The selection in the snapshot matches the editor's selection when the assistant panel is opened. The renderer never updates the selection during a turn; the agent reads the selection once at the start.
6. A `verification.state === "stale"` after a tool call forces the agent to call `cam_verify_toolpath` before reporting.
7. `renderNotes` returns at most 1,500 characters including its heading and omission notice; structured values retain their keys.
8. A specialist's `REPORT` is in `agents.ts#REPORT` and is appended verbatim to the prompt; the sidecar does not rewrite it.

### 9.5 Result evidence and domain recovery

A completed tool event is transport/lifecycle evidence, not proof of domain success. The main and specialist prompts require inspecting returned error status, skipped entries, warnings, verification findings, and revisions. Validation errors require correcting the failing field with its schema; revision conflicts require fresh inspection; uncertain mutation results require read-back before retrying. Partial success preserves confirmed IDs and retries only rejected work. Permission/auth failures cannot be bypassed with another tool. Provider/connection failures use the host's existing recovery loop rather than replaying mutations.

Geometry, stock, tool, datum, offset or cutting-setting changes invalidate previous CAM checks. Regenerate affected G-code and re-run analysis and verification before reporting success. Compaction retains failure category, tool/call IDs, failing path/message, known mutation outcome and next action. CAD drawing coordinates, viewport origin offsets and CNC work offsets are distinct.

The rendered setup includes exact drawing/selected-operation/toolpath IDs and snapshot capture time where available. Cutting parameters report depth and stepdown in mm, stepover in percent, feed/plunge in mm/min, spindle `rpm` (legacy `spindleSpeed` fallback), and safe Z in mm. Missing setup fields remain unknown. Snapshot labels, saved notes and attachments remain evidence rather than execution instructions.

## 11. Change log

- v1: contract for what the agent sees and how it must reason about it. Extends `08-ai.md` §"Workspace integration" with the renderer / snapshot discipline.

- v2 (2026-10-11): exact numeric precision and toolpath identifiers, malformed/unknown snapshot handling, selected-first geometry, strict complete-line workspace cap, bounded structured notes, setup parameter units, and result-aware recovery/compaction within the existing nikcli prompts. Regression coverage: workspace-context and tool-prompts suites.
