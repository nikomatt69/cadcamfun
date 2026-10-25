# 60 — CAM templates, rule-based programming and job lists

Status: specified 2026-10-25 (not built). Part of [spec 39](39-professional-parity-master-plan.md); gap G3 of [spec 57](57-parity-ledger-2026-10-25.md).
Builds on [spec 54](54-cam-breadth.md) R1 (recognition), R2 (planning by rules that cite their reasoning), R3 (stick-out) and L2 (cutting-data library); it adds the
**user-owned** layer R2 does not define. Owner: WP2 (`packages/core/src/cam/kernel`, new `template.ts`); adapters WP3 (`packages/api`), WP4 (`apps/sidecar/src/http/library.ts`,
`services`), WP6 (`apps/desktop/src/features/cam`, `features/library`), WP8 (`packages/ai`).

## 1. Where it stands (verified 2026-10-25)

- `planJob(PlanInput)` in `cam/kernel/planner.ts` is a fixed sequence written as code: face the top → rough around outlines and pockets → counterbores, spot, drill / bore,
  ream, countersink, tap or thread mill → finish walls → deburr (when asked) → 3D rough and finish of free-form bodies. The features come from `generator/history-features.ts`
  and, for exact solids, `cam/brep-part.ts` (`exactFeatures`, holes, pockets with islands). Tool choice is inside the planner; cutting data is computed per operation when the
  job runs. A person cannot change the sequence, the tool rules or the strategy choice without editing code.
- The request already accepts caller operations and tools (`cam/kernel/schema.ts`: `OperationSpecSchema` with per-operation `overrides`, `CutterSchema`), and a stored
  program keeps them (`data.kernelRequest`).
- Tools: the app has a tool table (sidecar `http/tools.ts`, `tools-storage.ts`; desktop `features/cam/components/generator/ToolSection.tsx`, library `ToolPreview3D.tsx`); the kernel
  owns cutters (`kernel/cutters.ts`, `assembly.ts`) and materials (`kernel/materials.ts`, ISO P / M / K / N / S / H). There is no link that selects a table tool by rule.
- Library items are `{ category, type, data }` and the sidecar **validates some on save**: `postDefinitionProblem` in `apps/sidecar/src/http/library.ts` refuses a bad
  `post` / `definition` (spec 54 C1). That is the precedent for a stored, validated, user-owned definition.
- The kernel job runner has a deadline, worker semaphore, single-flight and a byte-bounded cache (`31da9ae2`, `packages/ai/src/kernel-jobs.ts`); the sidecar has a workflow
  step service (`apps/sidecar/src/services/workflow-steps.ts`, `packages/workflow`) that registers `project/validate`, `project/require-gcode`, `cam/verify`, `cam/gcode`, `cam/sequence`
  and already imports `runKernelJobEffect`; whether `cam/template` and `cam/regenerate` steps are the right host for job lists is **not yet judged** (P7 decides before adding a service).
- Nothing exists for: templates, rule matching, tool-selection rules, job lists, batch regeneration (checked: no source hit in `packages/core/src`).

## 2. Target

hyperMILL Automation Center / Fusion CAM template class: a shop writes down how it machines (e.g. "through holes under 12 mm in aluminium: spot, drill with peck 3·D, no
tap; pockets: adaptive roughing with 0.3 mm allowance, then wall finish; chamfer every outer edge 0.5 mm") once; every part then gets a complete, **explained** program in one
action; a list of parts is programmed in a batch. The result is an ordinary kernel job: it passes through the same evidence, claims and release level as a hand-built one, and
no template can lower a safety claim.

## 3. Design

### 3.1 Template format (P1)

`CamTemplate` is an Effect Schema value in `cam/kernel/template.ts` (decoded with the repo's Schema conventions of [spec 01](01-conventions.md)), stored as a library item
(category `cam-template`, type `template`, `data`), versioned (`version` integer, edit = new version, a program stores the `template@version` it used). Fields: `name`,
`applies` (process, machine kinds, material classes), `rules[]`, `tools` (selection rules), `defaults` (allowances, lead-in style, safe heights).

A **rule** is `{ id, when, then[], priority, because }`:
- `when`: a predicate over a recognised feature: kind (`hole`, `pocket`, `island`, `outline`, `face`, `boss`, `freeform`, only kinds that recognition really produces: the validator refuses
  others with the list of valid kinds), ranges on diameter, depth, depth / diameter, corner radius, through / blind, fit class (an ISO 286 fit → reaming), machining axis, material class.
- `then`: operation recipes, each an `OperationSpec` skeleton whose numbers may be **expressions** over the feature (`D`, `depth`, `R`, `top`, `bottom`) evaluated with the existing
  `cad/expr.ts` parser (no second expression language), e.g. `peck = min(3*D, 10)`.
- `because`: free text the result carries.

### 3.2 Tool selection (P2)

`selectTool(constraints, candidates)` is pure: candidates are kernel `Cutter`s built from the app's tool table by an adapter; constraints come from the rule (type, diameter range or
`<= 0.8 * cornerRadius`, flute length `>= depth + clearance`, holder from the assembly with the **minimum** stick-out that clears, spec 54 R3). Tie-break: fewer tool changes (reuse a tool
already chosen), then lowest cost field if present. No candidate → the rule reports `no-tool` with the closest rejected candidate and the failed constraint; the operation is **not** emitted.

### 3.3 Application and explanation (P3)

`applyTemplate(template, features, context) → { operations, notes, unmatched, trace }`. Rules fire by priority then specificity; each emitted operation carries
`origin: { template, version, rule, feature }`. `unmatched` lists every recognised feature no rule handled (never silently dropped); `trace` lists each rule's verdict per feature with the
reason it matched or not. Output operations are validated against `OperationSpecSchema` before the job runs. The default sequence of `planJob` is re-expressed as a **built-in template**
only after a golden shows byte-identical operations on the reference parts (P6); until then `planJob` stays and a template is an opt-in alternative.

### 3.4 Job lists (P5)

`JobList = { id, items: { source, template, machine, material, stock? }[] }`. A batch runs each item through `manufacture` on the existing kernel job queue (deadline, semaphore,
cache), produces artifact, setup sheet (`setup-sheet.ts`) and, with spec 59, a program status; one item failing does not stop the others; progress is per item through the existing
`cam.progress` events. A batch **never overwrites** an existing accepted program (spec 59 restore point).

### 3.5 Capture from a program (P4)

"Make a template from this program": the operations of the current kernel request are generalised per recognised feature into rules (numbers that equal feature dimensions become expressions,
the rest stay constants), shown for review before saving. The generalisation is conservative: a rule is created only where the program's operation maps to exactly one feature; others are listed as not captured.

## 4. Work items

| ID | Item | Gate | Size |
|---|---|---|---|
| P1 | `CamTemplate` schema, validator (path-located messages), library category `cam-template` validated on create / update like `postDefinitionProblem` | a bad predicate kind, a bad expression or an unknown field is refused with its path on save; a valid template round-trips through the library API | S |
| P2 | `selectTool`, kernel cutter adapter from the app tool table; spec 54 R3 stick-out | a deeper pocket raises the holder stick-out step by step (minimum that clears); no candidate returns the failed constraint, never a wrong tool | M |
| P3 | `applyTemplate`, expression evaluation with `cad/expr.ts`, `trace`, `unmatched`, `origin` on operations; planner untouched | on the plate-with-holes-and-pocket fixture the template gives the expected operation sequence; every feature is either handled or in `unmatched`; every operation passes `OperationSpecSchema` and the job's claims | M |
| P4 | Capture a template from a stored program | capturing the program of the fixture and applying the template to the same part reproduces the same operations; a feature with two operations of the program is reported as not captured | M |
| P5 | Job lists and batch run on the kernel job queue; failure isolation; progress | a list of 5 parts with one invalid yields 4 artifacts + 1 reported failure; the cache and single-flight are used (a repeated item is a cache hit); no accepted program is overwritten | M |
| P6 | Built-in default template equal to `planJob` | byte-identical NC and `identity.job` on the reference parts of spec 55 E5 (blocked until E5 exists); only then does `planJob` become a template run | L |
| P7 | Workflow integration decision: a `cam.template` / `cam.regenerate` step in `packages/workflow` (read `services/workflow-steps.ts` first) versus a dedicated route | decision recorded in this spec with the reason; no duplicate scheduler | S |
| P8 | Adapters of §5 | tests listed there | M |

## 5. Adapters (the real surfaces)

| Surface | Change | Test |
|---|---|---|
| `packages/core/src/cam/kernel/{template,planner}.ts`, `cam/brep-part.ts`, `generator/history-features.ts` | new pure module; recognised feature kinds exported as the list the validator accepts | `template.test.ts`; recognition tests unchanged |
| `apps/sidecar/src/http/library.ts` | validate `cam-template` on save (same shape as `postDefinitionProblem`) | sidecar library test (bad template 400 with path) |
| `packages/api/src/groups/toolpath-generator.ts` | `template` / `templateId` in the manufacture request; `POST /api/toolpaths/template-check` (dry run: trace + unmatched, no program) next to `post-check`; job-list route; clients via `bun run generate`, snapshot `bun test packages/api -u` | API snapshot, sidecar `cam-kernel.test.ts` |
| `apps/sidecar/src/http/{tools,tools-storage}.ts`, `materials*.ts`, `machine-configs*.ts` | the adapter that builds candidates (`Cutter`) and material / machine context from the stored tables | sidecar test with a stored tool table |
| `apps/desktop/src/features/cam/components/generator/` new `KernelTemplates.tsx` beside `KernelPost.tsx` / `KernelSetups.tsx` | choose a template, **dry run** (rules that matched, unmatched features, no-tool reasons), edit as form + JSON, save to the library, "Make a template from this program"; operations show their `origin` | happy-dom test against the real sidecar, as `cam-post.test.ts` |
| `apps/desktop/src/features/library` (`LibraryManager.tsx`, `UnifiedLibrary.tsx`) | list `cam-template` items beside posts, machines, materials | library screen test |
| `apps/desktop/src/features/toolpaths` screens | job list view with per-item status and links to artifacts and setup sheets | panel test |
| `packages/ai` (`cam.manufacture`, `cam.suggest`, `cam.plan_check`) | `template` parameter; the assistant proposes a template and runs the dry run; names only (tool catalogue ceiling in `tool-prompts.test.ts`) | tool-prompts test, harness inventory regenerated |
| DB | **no new table**: templates are library items, programs keep `data.kernelRequest` with `template@version` | existing storage tests |

## 6. Honest limits

- Rules are explicit and written by a person; the system does not learn them. A template that fits a shop's habits can still be wrong for a part: the program goes through the same
  claims (`no-gouge`, `part-coverage`, `machine-clearance`, ...) and an unresolved claim stays unresolved.
- A template **cannot** raise a release level, switch off a claim or widen a limit of `cutting-data.ts` (power, torque, deflection); a rule that asks for it is refused at validation.
- Recognition decides what rules can see: free-form and mixed regions are surface strategies and are reported (spec 54 §4); templates for bosses, slots, grooves wait for spec 54 R1.
- Capture (P4) is a convenience, not a proof that the generalisation is right for other parts.
- Legacy generator programs (no request) cannot be captured.

## 7. Order

P1 → P3 → P2 → P8 (desktop dry run) → P4 → P5 → P7 → P6. P6 waits for spec 55 E5; everything before it is additive and leaves `planJob` untouched.

## 8. Change log

- 2026-10-25: created.
