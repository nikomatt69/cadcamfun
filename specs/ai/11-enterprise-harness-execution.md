# AI-11 - Enterprise harness execution guide

Status: **partial implementation. Action contracts, structured output, role restrictions, host isolation, the prompt corpus, stored-program verification and worker-based dimensional acceptance have recorded evidence. Remaining work includes Effect handler migration, durable revisions/receipts, complete context propagation, durable session lifecycle, remaining heavy kernel paths and observability. The integration follow-up below records current checks; roadmap statuses are unchanged.**
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority

This guide details the work that turns the embedded nikcli host into a harness specialised for CADCAMFUN. It is an execution
guide over the existing contracts, not a task board: [the roadmap](../roadmap/README.md) and
[its process](../roadmap/00-how-to-follow.md) keep governing order, dependencies and owners, and the design contracts
([AI-01](01-actions-and-execution.md)–[AI-10](10-nikcli-and-plugin-adapters.md), specs `00`–`29`) keep governing contracts.
Each step below names the RM step it belongs to; it is implemented only inside that step's owner directories and after that
step's dependencies are satisfied. An RM step is never declared done only because its AI refinements are finished. Code,
repository documentation and tests are in English.

## Legend

| Mark | Meaning |
| --- | --- |
| **V** | Verified: confirmed by running a test or a measurement. |
| **C** | Code: behaviour identified by reading the real path; no dedicated regression yet. |
| **N** | New: a contract or implementation still to build. |
| **D** | Dependency: prerequisite before the step can start. |
| `[ ]` | Open TODO. |
| **Gate** | Evidence required to close a step. |

A capability is never marked **V** because a description, a prompt or a schema exists.

## Fixed decisions

- Keep the nikcli SDK, Effect rc.112 and the existing action catalogue.
- Reuse the existing B-rep (`packages/core/src/cad/brep/`), STEP exchange and CAM kernel. Added modules must concentrate real
  logic: no second processor, no second modeller.

## Discipline for every step

1. Read the contract and the calling path: caller → adapter → implementation → persistence.
2. Write the regression that exposes the concrete problem.
3. Change the contract before its consumers.
4. Implement one complete vertical.
5. Run the targeted tests and the typechecks.
6. Record results and limits; close a TODO only after its gate.

Delivery default: one branch and one draft pull request per step, opened as soon as the step has a meaningful diff, never
merged by the agent.

## Baseline

Measured on 2026-10-14 in a fresh cloud checkout of `main` (`78bd227`), Bun 1.4.2, before any Step 1 change.

- **V**: `typecheck` of `@cadcamfun/ai`, `@cadcamfun/api`, `@cadcamfun/sidecar` and `@cadcamfun/desktop` exit 0;
  `@cadcamfun/api generate:check` reports the generated clients up to date.
- **V**: `bun --no-env-file test packages/ai packages/api apps/sidecar/test apps/desktop/test` — see
  [Step 0 results](#step-0-results) for the counts and the failing tests of this run.
- Reported by the owner before this guide (not re-measured here): 106 tests on context, roles, catalogue and scheduler and
  47 tests on tools, prompts, skills, attachments, workflows and exact CAD passed; the host suite had 31 passing and one
  failing test whose expectation is an obsolete message (the normaliser turns `"{}"` into an object and correctly reports
  `history.parameters` and `history.features` missing); `runParametricExact` on the filleted plate took about 47.4 s and a
  50 ms timer stayed blocked until it finished (a local measurement of that workload, not a general statistic).
- **C**: no dedicated proof yet for concurrent configurations with different permissions, the document target of a turn,
  disabled context in the host, or verification of the stored program.

## Steps

### Step 0 — Inventory and baseline

D: none. Placement: preparation of RM-01. Code: `actions/catalogue.ts`, `tools/registry.ts`, `tools/prompts/index.ts`,
`skills/index.ts`.

- [x] Generate from the catalogue the inventory of actions and tool groups.
- [x] For each action record schema, handler, effect, roles, prompt, result and tests.
- [x] Inventory skills, main/specialist/mode/workflow prompts and commands.
- [x] Correct the specs that treat B-rep/STEP as absent or `start_session`/`settle_session` as present.
- [x] Formalise this guide as `specs/ai/11-enterprise-harness-execution.md`.
- [x] Preserve concurrent changes already present in the worktree.

Gate: every entry has an identified execution path; no capability is marked verified only because a description exists.

### Step 1 — Complete the contract of every action

D: Step 0. Placement: RM-01. Start: `packages/ai/src/actions/action.ts` (`ActionSpec`), `tools/action.ts`,
`tools/handlers.ts`, `packages/api/src/ai-actions.ts`. Today most implementations return `unknown`; inputs and results have
no uniform guarantee.

- [x] Add a result schema and effect metadata to `ActionSpec` (`contract`, from `ACTION_CONTRACTS` in `packages/api/src/ai-action-results.ts`).
- [x] Extend the authoritative Effect schemas; derive the nikcli representation from them.
- [x] Distinguish success, partial, refusal, conflict, cancellation and uncertain outcome (`packages/ai/src/actions/outcome.ts`).
- [x] Migrate by family: CAD → CAM → libraries/parts → memory/research → VCS/delegation. 83/83 actions declare input and result.
- [ ] Move domain handlers to Effect; keep the Promise conversion at the SDK seam only. Deferred to Step 5 (see below).
- [x] Keep the compatible argument normalisation, with no correction that changes units, identifiers or authority.
- [x] Update the failing host test to assert the missing fields and that the handler did not run, instead of an obsolete sentence.

Tests: extend `action-tool.test.ts`, `wire-schema.test.ts`, `tool-definitions.test.ts`, `packages/api/test/ai-actions.test.ts`.
Gate: every action validated on input and output; no arbitrary public result crosses the adapters as success.

Progress (2026-10-14):

- **V** `packages/ai/test/action-outcome.test.ts` (15 tests): every catalogue action has a contract; a CAD answer outside its
  declared result is `uncertain`, never success (a read says nothing changed, a write says to inspect before retrying); an add
  that skipped elements is `partial`; untagged refusals get the shared `{ ok: false, _tag, actionId, error }` shape and keep
  their details; a stale-revision answer is a `conflict`; typed conflicts pass unchanged; a throwing write is `uncertain`, a
  throwing read `refused`; cancellation before entry never runs the handler, an abort while a write runs is `uncertain`.
- **V** The contract found a real defect: `cad_edit.parametric_convert` answered without `mutation`, so the desktop's
  `opsFor` treated the new parametric twin as an update of an unknown id and never added it to the editor. The sidecar now
  answers `mutation: "add"` (`apps/sidecar/src/services/ai.ts`, regression in `ai-parametric-convert.test.ts`).
- Test fakes that answered shapes no real handler returns (`{ ok: true, count: 1 }` for `describeDrawing`, `{ ok: true, ids: [] }`
  for `addElements`) were updated to the contract.
- **V** CAM family (14 `cam` reads, 6 `cam_edit` writes) declares results. Verdicts are answers: a `cad.check`, a plan
  check, a saved review or a verification whose `ok` is false because the part or program failed matches its schema and
  is `succeeded`; only an `ok: false` that matches no result is a refusal. Tested on `cad.check` and `cam_edit.verify`.
- **V** Second real defect: `cam_edit.generate` presented a failed generation (empty program, reason in `stats.error`) as
  success with an empty preview. It now answers a refusal carrying the reason; the desktop tool row reads either form
  (`cam-edit.ts`, `ToolRow.tsx`, regression in `action-outcome.test.ts`).
- Open (C): the optional `ToolHandlers.machine` is still implemented by no host, so `cam.analyze` and `cam.cutting_data`
  use default limits instead of the project machine (inventory known gap; Step 5 binds the document and its machine).
- **V** Inputs: every action's parameters are one Effect schema in `@cadcamfun/api` (`ai-action-inputs.ts`, `ai-cad.ts`,
  `ai-parametric.ts`, `ai-cam.ts`, `ai-inspection.ts`); the nikcli schema is derived from it (`nikcliWireSchema`) and the seam
  decodes every call with it (`defineWireAction`), so the handler receives the decoded value (defaults, trimming, a flag sent
  as text). The parametric history has one declaration; the zod copy is gone and the sidecar decodes stored histories with
  `decodeHistory`. Equivalence: `action-inputs.test.ts` (31 actions) and `action-inputs-cad.test.ts` (27 actions); the
  Effect history agreed with the replaced zod one on all 562 histories of the ai and sidecar suites (396 accepted, 166 refused).
- Decision (strictness): action inputs are strict at the host guard and at the seam, so a misspelt optional field is refused
  with its name instead of being dropped. Actions without parameters still take any object. Stored histories keep Effect's
  default (excess keys ignored), so an older document still loads.
- **V** Third defect, found by the equivalence tests: an Effect `Record` drops keys its key schema refuses, so
  `parametric_update` with a bad parameter name would have answered success without applying it. Parameter, primitive and
  recipe records now check names on the whole record (`namedRecord`) and refuse them; the JSON schema keeps `propertyNames`.
- Refusals name the fields: the catalogue pre-parse (`runAction`) and the seam both list each problem; unions report the
  variant the value meant (`tool-validation.ts`).
- Deferred (C): moving the domain handlers themselves to Effect belongs with Step 5, which rewrites the sidecar admission
  (`load`/`save`) the handlers sit on; today the Promise crossing is at the SDK seam and at each handler.
- Finding (C): `cad_edit.add_entities` and `cad_edit.modify` still pass sketch entities through `validated(EntityInput, ...)`,
  which drops `name` and `color` on 2D entities; kept as today's behaviour, recorded for Step 10.
- Effects classification (C): `cad_edit.editor` is kind `write` but touches only the interface; `agent.list` and `agent.read`
  are kind `write` with no effect (pinned in the test; Step 3).

### Step 2 — Separate structured data from tool text

D: Step 1. Placement: RM-01. Code: `tools/define.ts`, `nikcli/runtime.ts`, `nikcli/sdk-next.d.ts`, `nikcli/program-calls.ts`.
The pinned bundle already supports `output` and `result.value`; the application adapter mostly hands over JSON strings.

- [x] Extend the local types to the capabilities really present in the bundle.
- [x] Deliver the validated result in `value`.
- [x] Produce a separate bounded text for the model.
- [x] Make Code Mode consume the structured value.
- [x] Add total, returned, omitted, revision and artifact reference to previews.
- [x] Never truncate receipts, identities or JSON objects the consumers need.

Tests: `program-calls.test.ts`, `cam-wire.test.ts`, `tool-schemas-json-schema.test.ts`; new regressions for large results and
incomplete previews. Gate: a large result stays complete for Code Mode and persistence while the text declares what it omits.

Progress (2026-10-15):

- Most of this step arrived with #21: `sdk-next.d.ts` declares `ToolExecuteResult.value` and the `output` codec; the runtime
  declares `output` for every catalogue tool and returns `value` (the whole validated result) beside `output` (the bounded
  text, `tools/tool-output.ts`), with `metadata.truncated` so the host does not cut it again and `metadata.value` stored when
  the text is bounded.
- **V** The pinned bundle (`@nikcli-ai/sdk-next` 1.428.0, `Tool.encoded`) returns `result.value` to Code Mode when the tool
  declares `output`, and the text otherwise.
- **V** `tool-output.test.ts`: through the host adapter (`toSpec`) a 5,000-row result reaches `value` whole while the text stays
  within `MODEL_TEXT_BUDGET`, keeps identity, revision and totals, and lists each omission (path, total, returned).
- **V** `cam_edit.generate` previews a stored program: it answers `lines`, `previewLines`, `omittedLines`, `programHash` and
  `operationId` (the full program is read back with `cam.analyze` by `operationId`); the contract pins them
  (`action-outcome.test.ts`, `action-contracts.test.ts`).
- Open (C): two outcome classifiers exist, `actions/outcome.ts` (contract-aware, Step 1) and `actionOutcome` in
  `@cadcamfun/api` (used for the tool text). Resolved by the integration follow-up below: schema validation stays in the
  catalogue, while outcome classification delegates to the shared function.

### Step 3 — Enforce role limits in code

D: Steps 1–2. Placement: RM-01. Code: `nikcli/agents.ts`, `primaries.ts`, `permission-modes.ts`, `config.ts`. The verifier
receives `cam_edit` today although its prompt forbids creating and updating operations.

- [x] Separate an action's canonical identity from its exposure in tool groups.
- [x] Create the verifier's dedicated exposure, derived from the same generate and verify actions.
- [x] Exclude create/update/stock/manufacture from the verifier.
- [x] Keep reviewer and researcher read-only.
- [x] Classify report, memory, interface, workflow and external effects explicitly.
- [x] Keep native approval and deny rules in every mode.

Tests: `agents.test.ts`, `policy.test.ts`, `specialists-host.test.ts`. Gate: requests forbidden to a role are refused even when
the model ignores its prompt entirely.

Progress (2026-10-15):

- **V** Items 1–3 arrived with #21: `ACTION_EXPOSURES` gives `cam_verify` (`cam_edit.generate`, `cam_edit.verify`) to the
  verifier, which no longer holds `cam_edit`; the canonical action id stays `cam_edit.*`.
- **V** Item 5 arrived with #23: `ACTION_CONTRACTS` declares effects per action (`report`, `memory`, `interface`, `workflow`,
  `external`, ...); `cad_edit.editor` touches `interface` and `drawing`, `agent.list`/`agent.read` are reads.
- **V** Item 6, the real gap: in auto mode the host sends an `ask` with pattern `*` to the model classifier, so a destructive
  tool could run without a person. Destructive and approval-flagged tools now carry `HUMAN_APPROVAL` (`{ "**": "ask" }`,
  `permission-modes.ts`), which auto mode routes to a human prompt; deny rules are evaluated before the classifier.
- **V** `agents.test.ts` regression: in every agent and mode, destructive tools carry `HUMAN_APPROVAL`, a policy denial is never
  turned into allow or ask, the verifier never holds `cam_edit`, reviewer and researcher hold no write tool.

### Step 4 — Fix host configuration and lifecycle

D: compatibility contract fixed. Placement: WP8/RM-01 refinement; WP10 amendment for the compiler. Start:
`packages/ai/src/nikcli/runtime.ts`, `isolation.ts`, `host-patches.ts`, `scripts/compile-sidecar.ts`.

- [x] Keep global provider/skills/defaults separate from project-specific permissions.
- [x] Read only the scratch file the app generated for the current Instance.
- [x] Keep discovery of external and ancestor configurations disabled.
- [x] Extend the SDK registration seam to keep and close handles.
- [x] Do not recreate the Instance on a tool update.
- [x] Block inherited authentication and database overrides.
- [x] Replace the native coding environment while keeping date, locale and instruction sync.
- [x] Return a report per mandatory patch; partial compatibility is an explicit error.

Tests: `host-bootstrap.test.ts`, `tool-registry-host.test.ts`, `isolation.test.ts`, `host-surface.test.ts`,
`host-patches.test.ts`. New regressions: two projects with different allow-lists; concurrent reload; repeated
replacement/removal; DB/auth sentinels; execution of the compiled binary. Gate: isolation proved with different
configurations, stale registrations released, identical adaptations in development and compiled builds.

Progress (2026-10-15):

- **V** The bug: every host read one global `nikcli.json`, rewritten with the permission map of whichever project was
  configured last; a host that loaded its configuration afterwards ran with another project's allow-list. Now
  `splitHostConfig` (`config.ts`) writes the shared part (providers, defaults, policies, compaction) to the global file and
  the project's agents to `<scratch>/nikcli.json`; the `instance-config-file` host patch makes the loader read that file
  for its Instance only. Project config stays disabled, so no ancestor or worktree file is discovered.
- **V** `registration-handles` patch: `NikCli.tools.register` returns one `close` for its batch; the runtime closes the previous
  batch after registering the next, so a tool that left the set is unregistered (not only denied) and publications no longer
  stack registrations. A publication reloads configuration in place (`InstanceReload`), never recreating the Instance.
- **V** `isolation.ts` scrubs inherited `NIKCLI_DB`, `NIKCLI_AUTH_CONTENT`, server/sign-in credentials, plugin autoload and
  model overrides.
- **V** `cad-environment` patch: the environment section keeps date, platform, locale, timezone and reply language and drops the
  working directory, git, package manager and shell/monitor rules. Instruction sync is untouched.
- **V** `host-patches.ts` reports each of the five patches (`applied`, `missing`, `ambiguous`); a bundle missing any is refused
  with `HostPatchError`, at import and at compile time (`scripts/compile-sidecar.ts`).
- **V** Tests: `host-instances.test.ts` (two projects with different allow-lists, repeated replacement and removal, concurrent
  reloads, same client after reloads), `isolation.test.ts` (DB/auth sentinels, Instance file read, shared file without agents),
  `host-patches.test.ts` (report, refusal, each patch's effect).
- **V** The sidecar compiled through `compile-sidecar.ts` reports all five patches and the executable contains the patched code.
  Open (C): running the compiled executable end to end is left to Step 11.

### Step 5 — Bind document and revisions to execution

D: RM-01; persistence under RM-03, setup per RM-02. Start: `apps/sidecar/src/services/ai.ts`, `acting-user.ts`,
`drawing-repo.ts`, `packages/api/src/ai-actions.ts`. `load()` picks the drawing from the shared snapshot today; `save()`
applies no CAS.

- [x] Introduce the trusted actor/project/drawing/session/turn binding.
- [x] Add the drawing to the application request and check it before admission.
- [x] Remove the first-drawing fallback for admitted invocations.
- [x] Propagate the binding to tools, Code Mode, children and the bridge.
- [ ] Separate persisted revision, content hash and history revision.
- [x] Apply CAS and receipt in the same transaction as the change.
- [ ] Record invalidations and the confirmed result; deduplicate by operation key and digest.
- [ ] Update the observed revision only after a valid receipt.

Tests: `acting-user.test.ts`, `drawings.test.ts`, `ai-parametric.test.ts`; new proofs on two drawings of one project, retry and
crash after commit. Gate: a second window cannot change the turn's target; a concurrent change yields a conflict without
overwrite.

Progress (2026-10-15):

- **V** Binding: `StreamChatBody.drawingId` and `BridgeInvokeBody.drawingId` (clients regenerated). The sidecar checks the
  drawing belongs to the turn's accessible project before admission (`checkDrawing`, `http/ai.ts`); `ActingUser.bind` stores it
  with the owner and every invocation carries it (`ActingUser.drawing()`), so Code Mode inner calls and child sessions inherit
  it. The bridge keys its session by drawing, so concurrent calls on two drawings never share a binding. The desktop sends the
  drawing open when the turn is sent (`store.ts`, `stream.ts`).
- **V** `load()` (`services/ai.ts`): a bound turn acts on its drawing only; the editor snapshot another window wrote is not read,
  and a bound drawing that is gone is refused, never replaced. Unbound calls (older clients) keep the snapshot rule.
- **V** CAS: `DrawingRepo.writeIfUnchanged` compares the content hash the tool read with the stored one and writes in the same
  transaction; a mismatch is `DrawingConflict` and nothing is overwritten. `configureStock` checks the same way. `save()` answers
  the receipt (`previousHash`, `contentHash`, `updatedAt`).
- **C** Three identities, named: `drawingContentHash` (the stored document, what CAS compares), `drawingRevision` (CAM source:
  elements and stock), `historyRevision` (one element's parametric history). A persisted, monotonic revision column, stored
  receipts with invalidations and deduplication by operation key need the WP0 revision/receipt migration RM-03 owns; they are
  left open here, as is surfacing the receipt to the editor's observed revision.
- **V** Tests: `ai-drawing-binding.test.ts` (two drawings with the snapshot naming the other: the tool writes the bound one; a
  missing bound drawing is refused; a concurrent save is a conflict, not overwritten; a fresh read writes with a receipt),
  `ai.test.ts` (a drawing of another project, a missing drawing, or a drawing without a project are refused before any model call).
- Open (C): a second turn on the *same* conversation rebinds its drawing for the turns after it; one conversation open in two
  windows is still one conversation.

### Step 6 — One context module

D: RM-01; RM-06. Step 5's persistent binding serves integrated writes. Code: `apps/sidecar/src/http/ai.ts`
(`contextFor`), `workspace-context.ts`, `project-context.ts`, `nikcli/project-files.ts`, `service.ts`.

- [x] Extract `contextFor` into an Effect module `AiContext`, reusing the renderers.
- [x] Define `ContextRequest`, `ContextSource`, `ContextManifest` and `ContextAssembly`.
- [x] Acquire authorised sources before rendering them.
- [x] Distinguish requirements, current observations, UI snapshots, memory and references.
- [x] Apply one aggregate budget, labels and omissions included.
- [x] Deliver habits once, through this module.
- [x] Invalidate caches after Brain and source updates.
- [x] Order notes by effective timestamp.
- [ ] Propagate `includeContext` through `ChatInput`, binding, goal, queue/steer and tasks.
- [ ] Prepare fresh briefings for specialists, separate from model/variant inheritance.
- [ ] Scope memory and attachments by actor/project/session; use stable attachment identities.

Tests: `workspace-context.test.ts`, `ai.test.ts`, `specialists-host.test.ts`, `workspace-sessions.test.ts`; new
`context-assembly.test.ts`. Gate: the provider's effective requests carry no duplicated or foreign sources; disabled context
also excludes the native automatic injection.

Progress (2026-10-15):

- **V** `packages/ai/src/context-assembly.ts`: `ContextSource` (kind: requirement, observation, ui-snapshot, memory,
  reference), `ContextRequest`, `ContextManifest`, `ContextAssembly`; `assembleContext` orders by kind, drops duplicates (same
  id or text) and empties, applies one aggregate budget (`CONTEXT_BUDGET`) with truncation markers and a `<context_omitted>`
  note inside the budget, and reports what it included, cut and left out. `notesByRecency` orders notes by `updatedAt`.
- **V** `apps/sidecar/src/services/ai-context.ts` (`makeAiContext`) replaces the inline `contextFor`: it checks the actor reaches
  the project before reading any stored source, acquires each source once with the existing renderers, and acquires nothing
  but the client's text when `includeContext` is false.
- **V** `profile-reminder` host patch: the host no longer appends the profile and `habits.md` to every request, so the habits
  reach the model once (through the assembly) and not at all when context is disabled. `context-native.test.ts` reads the
  provider's effective requests: zero occurrences with context disabled, one with the assembled block.
- **V** A Brain consolidation invalidates the cached memory and habits files (`service.ts`).
- Open (C): `includeContext` is not yet carried by the session binding into queue/steer, `/goal` continuations and background
  tasks (today they add no stored context of their own); fresh specialist briefings, actor/session scoping of notes (today per
  project) and stable attachment identities remain.

### Step 7 — Refine every prompt and skill

D: inventory and action contract. WP8 text review; memory/context integrated in their RM steps. Code: `prompts/system.ts`,
`prompts/workflows.ts`, `prompts/modes/*`, `nikcli/prompts/*`, `tools/prompts/*`, `skills/index.ts`.

- [x] Move main, provider, workflow and skill texts into separate files.
- [x] Keep typed loaders and one composition.
- [x] Fix modes that suggest obsolete nested actions.
- [x] Replace 2D-only workflows with contracts matching the real capabilities.
- [x] Fix every instruction that confuses nominal, limits and target.
- [x] Label cutting heuristics and simulation limits.
- [x] Attach sources and editions to engineering data.
- [x] Validate every JSON example against the catalogue.
- [x] Run every significant geometric example against the kernel.
- [x] Keep separate budgets for static prompts, descriptions and loaded skills.

Tests: `prompts.test.ts`, `modes.test.ts`, `tool-prompts.test.ts`, `skills.test.ts`, `workflows.test.ts`,
`fusion-modelling.test.ts`. Gate: every inventory entry reviewed; executable examples work and no text promises an
unsupported capability.

Progress (2026-10-15):

- **V** One corpus (`prompts/corpus.ts` `promptCorpus`) lists every text the model reads: base system prompt, modes,
  model-family styles, specialists, tool descriptions, skills and one-shot workflows. `prompt-corpus.test.ts` walks it:
  every `tool action name`, `tool.name` and `tools.x({ action })` reference resolves in the catalogue; no prose uses the
  retired nested `action: "..."` form; every quoted parametric history builds through `cad.parametric_validate`; each kind
  stays inside its own budget (`PROMPT_BUDGETS`). The inventory lists the test against every prompt file.
- **V** Fixed: the CAD and CAM modes and the planner, machinist, modeler and verifier prompts named retired nested actions
  (`inspect_elements` + `action: "search"`, `parametric_validate` + `action: "dfm" | "recipe" | "fastener"`,
  `cam.stock` + `action: "inspect"`) and said `cam.stock` sets the stock (it reads; `cam_edit.stock_set` sets).
- **V** Skills live in `skills/text/<name>.md` (placeholders `{{elementCatalogue}}`, `{{toolTypes}}`, `{{fusionExample}}` filled
  from the code; an unknown one throws), workflows in `prompts/workflows/*.txt`, model-family styles in
  `prompts/family/*.txt`. The migrated skill bodies were compared with the previous ones: identical except one trailing
  newline.
- **V** Workflows: the design review and suggestions no longer limit the drawing to 2D; each user prompt names exactly the
  fields of its output schema (the old ones asked for `estimated_savings`, `depth_of_chi_mm`, `next_step`, which the
  decoder rejects); G-code optimisation and cutting parameters say they are an unsimulated proposal and heuristic
  starting values.
- **V** Engineering data: the standards skill names the edition of each standard it condenses; the precision skill
  separates nominal, limits and target (the g6 example is now the exact middle of its limits).
- Limit: semantic review of the prose is by reading; the tests catch names, examples, contracts and budgets, not every
  wrong sentence.

### Step 8 — Separate program generation from verification

D: revisions/receipts and relevant setup; RM-02/RM-03/RM-09 integration. Code: `apps/sidecar/src/services/ai.ts`
(`verifyOperation`), `actions/cam-edit.ts`, `operationProgram`, `reviewOperation`, `drawing-context.ts`.

- [x] Make `verifyOperation` read the persisted NC.
- [x] Remove program generation and replacement from the verifier.
- [x] Bind reports to the NC hash and to the revisions of the manufacturing inputs.
- [x] Record the report through CAS on the checked identities.
- [x] Make verifications stale also when the setup changes and the NC text stays identical.
- [x] Expose effective resolution, coverage and omissions.

Tests: `ai-cam-tools.test.ts`, `ai-cad-to-gcode-e2e.test.ts`, `cam-kernel.test.ts`, `cam-verify.test.ts`. Gate: verifying a
program does not change its bytes; a change of program or inputs invalidates the report.

Progress (2026-10-15):

- **V** Already in place before this step (Steps 2 and 5): `verifyOperation` replays the program stored on the operation and
  never generates, replaces or rewrites NC; the report carries `programHash`, the identity of the rebuilt manufacturing
  request (geometry, stock, settings) and the drawing revision, and it is recorded with `toolpaths.updateWhere` only while
  all three still hold; `coverage` gives the effective and requested resolution and the issues omitted; `cam.review`
  reports `stale` when any of them moved.
- **V** New gate test `apps/sidecar/test/ai-verify-binding.test.ts`: verifying leaves the stored bytes identical and the report
  bound to their hash; a stock change written by another writer, with the NC text byte-for-byte unchanged, makes the review
  `stale`, makes `operationProgram` refuse the program and makes a new verification refuse to replay it until the program is
  generated again; an NC change with every input unchanged also makes the report stale.
- Limit: the machine configuration is not a verification input yet (project defaults store a machine id that no CAM path
  reads); when RM-09 makes it one, it has to enter the request identity the report is bound to.

### Step 9 — Durable sessions and tasks

D: RM-01 and RM-03 receipts; execution in RM-07. Code: `background-tasks.ts`, `background-tools-runner.ts`, `chat.ts`,
`service.ts`, `events.ts`, desktop `stream.ts`.

- [x] Persist the enqueue before execution and the outcome before delivery.
- [ ] Keep owner, attempt, lease, heartbeat and receipt references. (owner and attempt done; lease, heartbeat and receipts wait for RM-03/RM-07)
- [ ] Add event sequences and an explicit resync answer.
- [x] Recover readers with a bounded policy; reconcile uncertain editors.
- [x] Keep children's reports before the native session is removed.
- [ ] Stop depending on the last 40 message entries to rebuild a long turn.
- [ ] Really implement `start_session`/`settle_session` (spec 25 §2.3, absent today), with budget, consolidation and retention policies.
- [x] Cancellation and removal wait for effects to stop before declaring completion.

Tests: `runtime-lifecycle.test.ts`, `background-tasks.test.ts`, `background-parent-link.test.ts`, `ai-recovery.test.ts`,
`ai-project-sessions.test.ts`. Gate: crash and reconnect do not duplicate changes; lost events require reconciliation, not blind
replay.

Progress (2026-10-15):

- **V** `BackgroundTaskManager` takes a `BackgroundTaskJournal` (sidecar: `kvTaskJournal`, one key-value row per task under
  `ai.tasks.<id>`). The enqueue is written before the runner starts (a failed write means the task never runs), the
  specialist's report is written through `report` before its native session is removed, and the outcome is written before
  the completion hook delivers it; a delivery that went through is recorded (`delivered`).
- **V** `recover()` (called once by `makeAiBackgroundLayer` after the runner and hook are installed): an interrupted reader runs
  again up to `MAX_TASK_ATTEMPTS`; an interrupted editor is never replayed and is reported to its parent as uncertain, to be
  reconciled against the current revision; a settled outcome not yet delivered is delivered once; delivered records older
  than `TASK_RETENTION_MS` are pruned. A crash therefore does not duplicate a document change.
- **V** Tests: `background-journal.test.ts` (order of writes, failed journal, cancellation settles after the runner stops,
  recovery matrix and idempotence), `apps/sidecar/test/ai-task-journal.test.ts` (round trip through the key-value store,
  undecodable rows skipped, an interrupted edit reported and not replayed).
- Open: event sequence numbers and a resync answer for the desktop stream; leases and heartbeats (one process owns the
  journal today); receipt references (RM-03); rebuilding a long turn without the last-40-messages window; real
  `start_session`/`settle_session` (spec 25 §2.3) with budget, consolidation and retention.

### Step 10 — Geometric acceptance and heavy work

D: RM-02 for core; RM-03/RM-06 for integration; RM-09. Code: `packages/ai/src/parametric.ts`,
`apps/sidecar/src/services/ai-parametric.ts`, `packages/core/src/cad/history-brep.ts`, `cad/brep/budget.ts`,
`cam/verify/verify.ts`.

- [x] Distinguish a valid rebuild from dimensional acceptance.
- [x] Measure requested features through identified references and frames.
- [x] Separate topological genus from the number of requested holes.
- [x] Keep full numeric values in structured results.
- [ ] Declare capabilities and limits of mesh, B-rep and STEP. (per check: `method` exact / mesh / recognition; a full capability table is open)
- [x] Run expensive pure work in a scoped worker with a deadline on the whole job.
- [x] On cancellation end the job; nothing persists before commit.
- [x] Prove equivalence between the inline and the worker path.

Tests: `parametric-exact.test.ts`, `parametric-engineering*.test.ts`; new `kernel-job.test.ts` and dimensional acceptance
tests. Gate: a part with the right volume but a wrong measure is rejected; heartbeat and cancellation keep working during the
heavy workload.

Progress (2026-10-15):

- **V** `packages/ai/src/acceptance.ts` `acceptPart`: checks `extent` (world-frame size of all bodies or one), `hole` (the hole a
  history `hole` feature asked for, found by `brep.recognizeHoles` on that feature's axis in its plane frame; diameter, depth,
  through), `hole_count` (recognised holes) and `volume` (exact when every body is exact). Each result carries nominal,
  limits, the measured value at full precision, reference, frame and method; `accepted` needs every check to pass, and an
  `unmeasured` check (no exact model, a work-plane hole, a later move or scale) is never accepted. `holes` reports requested
  holes, recognised holes and genus apart.
- **V** Contract: `ParametricTestCase.checks` (`@cadcamfun/api`); `cad.parametric_test` runs them and a case passes only when the
  rebuild, the volume band and every check pass. Tool description updated within its budget.
- **V** `kernel-job.ts` `runKernelJob`: one worker per job (`kernel-worker.ts`), a deadline on the whole job, abort terminates the
  worker; the jobs are pure, so a cancelled job leaves nothing. `compile-sidecar.ts` adds the worker as an entry point with the
  repository as build root; a probe compiled with it ran the acceptance job inside the executable (`accepted: true`, measured 8).
- **V** Tests: `dimensional-acceptance.test.ts` (accepted part; right volume, wrong bore and length rejected; axis identity and
  a later move unmeasured; a slot has genus 1 and zero holes; unmeasured never accepted), `kernel-job.test.ts` (inline equals
  worker; heartbeat keeps beating during a heavy job; deadline; cancellation within a second; failure reason; compiled worker
  URL), `apps/sidecar/test/ai-parametric-acceptance.test.ts` (end to end through `cad.parametric_test`).
- Open: holes on work planes, after moves and in patterns; extents in a part frame other than world; a declared capability
  table for mesh, B-rep and STEP; moving `parametric_exact` and the validation report itself into kernel jobs.

### Step 11 — Evaluation and final gate

D: previous increments; RM-10/RM-11 per roadmap.

- [x] Full coverage of the inventory, plugins and bridge included. (83/83 actions mentioned by a test; see the open note on
  dedicated regressions)
- [x] Versioned corpus: plate, bracket, shaft, flange, pocket, assembly, STEP import and negative cases.
- [ ] Bounded traces with identity and provenance, without secrets or full parts.
- [x] Distinguish estimated/reported tokens and known/unavailable cost. (`AiAnalytics`; the legacy `userUsage` route is open)
- [x] Run the compiled sidecar, not only inspect the bundle.
- [x] Record baseline and comparison of latency, memory and stalls.
- [x] Keep evaluation with real models separate and authorised with a budget.

Progress (2026-10-15):

- **V** Coverage: `apps/sidecar/test/ai-cam-chain.test.ts` covers the four actions no test named (`cam.machine`,
  `cam.chain_suggest`, `cam.chain_status`, `cam.vision`); the inventory reports 83/83. Writing it found a real fault:
  `chain_status` and `chain_suggest` read the store's most-recently-updated-first list as the chain, so the "predecessor" of an
  operation was the one created after it and a suggestion without a starting point continued the oldest operation. Both now
  use creation order (`chainOrder` in `apps/sidecar/src/services/ai.ts`).
- **V** Corpus: `packages/ai/test/eval/corpus.v1.json` (version 1: plate, flange, bracket, stepped shaft, pocket, two-body
  assembly, STEP round trip of the plate and the assembly, four negative cases) run by `eval-corpus.test.ts`. Nominal values
  are worked out from the request (ISO 273 clearance, volumes by hand), not copied from a measurement. A published version is
  never edited: new cases go in a new version. The flange case records that the centre bore is a recognised hole (seven, not
  six).
- **V** Tokens and cost: `AnalyticsEvent.tokenSource` (`reported` | `estimated`; legacy callers count as reported) and
  `costUsd` (absent means unknown); `stats.tokens` keeps the two apart and `stats.cost` gives the known total and how many
  responses had no cost, so a missing price is never a zero. Test in `analytics.test.ts`.
- **V** Compiled sidecar: `scripts/smoke-sidecar.ts` compiles the executable, starts it on a throw-away data directory with
  the AI offline, holds stdin like the shell, and drives it over HTTP through the action route: a recipe part is created and
  `cad.parametric_test` runs its dimensional checks in the kernel worker inside the executable (accepted), while health is
  polled to see the stall. Shutdown is the shell's own (`shutdown` event, then stdin closes).
- **V** Baseline (this container, Linux x64, two runs): ready 1.87–1.97 s; health p50 1.0–1.1 ms, p95 1.6–3.4 ms;
  `cad.describe` p50 5.7–6.3 ms, p95 137–139 ms (the first calls); `cad.parametric_test` with checks 1.19–1.24 s, slowest
  health answer during it 22–39 ms over 2300+ samples; RSS 182–185 MB at ready, 364–374 MB after the job; clean shutdown in
  84–92 ms, exit 0. Compare a later run with `bun --no-env-file scripts/smoke-sidecar.ts --json`.
- **C** Real models: nothing in this step calls a model. An evaluation with real models is a separate run that needs the
  owner's authorisation, a named provider and model, and a token/cost budget fixed before it starts; its results are recorded
  apart from this baseline.
- Open: bounded traces with identity and provenance; the legacy `GET /api/analytics/user-usage` still answers zero totals that
  read as "free" instead of "unknown" (a contract change); several actions are covered only by a test that mentions them, not
  by a dedicated regression; plugin and bridge coverage beyond the existing `nikcli-plugin`/`ai-bridge*` tests.

## Common closing commands

```bash
bun --no-env-file run --filter @cadcamfun/ai typecheck
bun --no-env-file run --filter @cadcamfun/api typecheck
bun --no-env-file run --filter @cadcamfun/sidecar typecheck
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file run --filter @cadcamfun/api generate:check
bun --no-env-file test packages/ai packages/api apps/sidecar/test apps/desktop/test
git diff --check
```

When the core changes, add the typecheck and tests of `packages/core`. Migrations are generated by WP0; clients are regenerated
only after a contract change.

Final gate: every TODO has recorded evidence; every action, tool, prompt and skill is covered; no conflict, partial result,
stale verification or unsupported capability can be presented as completed work.

## Integration follow-up (2026-10-15)

The owner requested continuing the partially integrated harness without adding regression tests. The worktree was clean
at admission. This pass deepens the existing RM-01 adapters and result consumers; it does not start later roadmap work or
close RM-01 on the strength of AI refinements alone.

- **C → V** The HTTP bridge called `HostToolSpec.execute`, which returns the model's bounded text. It now consumes
  `executeWithFiles().value`, with the same complete JSON encoding used by the wire (optional `undefined` fields omitted),
  and keeps a fallback for text-only extensions. Large reads no longer become preview objects at the HTTP adapter.
- **C → V** The primary event mapper read complete stored values, but the specialist mapper read preview text; both now use
  the same full-answer extraction. Session recovery no longer slices each result at 16,000 characters, and desktop wire
  decoding no longer slices result JSON at 256,000 characters. Model preview budgets remain separate from these consumers.
- **C → V** The catalogue and tool text disagreed on invalid-result uncertainty, stale tags and incomplete reads. Validated
  results and normalised failures now use shared `actionOutcome`; `ActionResultInvalid` is uncertain and `ActionStale` is a
  conflict. A committed envelope must decode against `ActionCommitted` and its receipt must name the executing action.
- **V** A temporary runtime probe outside the repository checked four shared/catalogue outcome pairs, two invalid or
  mismatched receipts, and an unshortened 300,000-character result through specialist → desktop, session recovery and the
  HTTP bridge backed by the real in-memory repositories. No regression file was added or edited.
- **V** Existing targeted suites: 65 tests passed across nine files (action outcomes, CAM wire, event mapping, Code Mode,
  tool output, shared contracts, bridge/governance and desktop recovery).
- **V** Existing compiled-sidecar smoke ran on macOS arm64 and exited 0: dimensional acceptance ran in the embedded worker;
  ready 8,017.5 ms, health p50/p95 1.0/1.7 ms, `cad.describe` p50/p95 8.6/326.3 ms, acceptance job 1,719.9 ms, maximum health
  response during the job 180.7 ms over 1,792 samples, shutdown 74.5 ms. RSS is unavailable (`/proc` is absent on macOS).
  This run overlapped the suite and is not directly comparable to the earlier Linux baseline. No model was called.

Remaining integration limits are explicit: Promise domain handlers, the absent project-machine handler (analysis and cutting
data still use their documented default limits), durable revisions/receipts/deduplication (RM-03),
`includeContext` propagation and actor-scoped context (RM-06), task leases/event resync/session lifecycle (RM-07), remaining
exact/validation workloads outside workers and dimensional coverage (RM-09), and bounded provenance traces (RM-10).
Drawing targeting is guaranteed when the caller supplies `drawingId`; legacy calls without it still resolve the editor
snapshot or an unambiguous project, and a later turn may rebind a conversation. These paths are not a claim of complete
immutable turn ownership or crash-safe write recovery.

## Step 0 results

### Inventory

The generated inventory is [11-harness-inventory.md](11-harness-inventory.md), produced from the modules themselves by
`packages/ai/test/helpers/harness-inventory.ts`; `packages/ai/test/harness-inventory.test.ts` fails when it is stale, when an
action loses its execution path or when a tool prompt stops naming one of its actions. Findings (all **C** unless marked):

- **83 actions in 13 tools**, not 81: read 46, write 33, destructive 4. The tools are `cad` (20), `cad_edit` (12), `cam` (14),
  `cam_edit` (6), `library` (5), `parts` (3), `library_edit` (5), `memory` (2), `memory_edit` (2), `research` (2), `vcs` (3),
  `vcs_edit` (5), `agent` (4).
- **81/83 actions reach every implementation they call.** The two exceptions share one gap: `cam.analyze` and
  `cam.cutting_data` call the optional handler `ToolHandlers.machine`, which no host implements, so `cam.analyze` analyses
  without the project's machine and `cam.cutting_data` clamps to the default machine limits. Recorded in the test as a known
  gap; it belongs to Step 1 (CAM family) or Step 8.
- **0/83 actions declare a result schema** (`ActionSpec.run` returns `unknown`): Step 1.
- **83/83 actions are named in the `Actions` section of their tool prompt.** Whether the text is correct is Step 7.
- **62/83 actions are mentioned by at least one test file**; 21 are mentioned by none (listed as **none** in the inventory).
  A mention is not a dedicated regression: no action is **V** from this inventory.
- **Role finding (C)**: the `verifier` holds the whole `cam_edit` tool (create, update, manufacture, stock_set included) while
  its prompt forbids creating or updating operations; `optimizer` holds it too. Step 3.
- **18 built-in skills**, not 17 (plus user skills from the store). **39 prompt files**: 8 base layers, 5 modes, 13 tool
  prompts, 13 specialist/host prompts (9 roles, `basics`, `report`, `compaction`, `memory`). **5 one-shot workflow
  templates** in `prompts/workflows.ts`, whose header still states that only 2D entities exist (Step 7). **32 composer
  commands** in `apps/desktop/src/features/ai/lib/commands.ts`, including `/goal`, routed to the host's own command.

### Spec corrections

- [Spec 25](../25-project-ai-context.md): `start_session` / `settle_session` are absent from the API contract, the sidecar and
  the desktop; the Status line claimed them implemented. Corrected; owned by Step 9 under RM-07.
- [Spec 12](../12-professional-cad-cam.md) and [AI-08](08-precision-modelling-and-cam.md): stated that no exact B-rep or STEP
  existed. The native kernel `packages/core/src/cad/brep/` (spec 03 §7c) reads and writes STEP and `history-brep.ts` replays
  the documented exact feature set. Corrected; gate 1 of spec 12 stays open because no reference-corpus evidence is recorded.
  [Spec 03](../03-core-cad.md) already documents the kernel (§7c) and needed no change.

### Worktree

The cloud checkout was clean at start; no concurrent change had to be preserved. Running the suite rewrites
`packages/plugin-sdk/examples/hello-gear/index.js` (a build output of the example); that change is not part of this step.

### Baseline test run

`bun --no-env-file test packages/ai packages/api apps/sidecar/test apps/desktop/test` on `78bd227` (before the inventory test
was added): **V** 1741 pass, 1 fail, 1742 tests in 237 files, 324 s.

- The one failure is `apps/desktop/test/cam-kernel.test.ts` › "the kernel plan is editable…": a 4 s UI wait in
  `apps/desktop/test/helpers/live-app.ts` timed out after 30 s under full-suite load. **V**: the same file passes 5/5 in
  isolation. Not root-caused; recorded as load-sensitive, not as a flake.
- **V**: the owner-reported host failure does not reproduce on `78bd227`: `packages/ai/test/nikcli-host.test.ts` passes
  19/19, including "malformed history is rejected…" (commit `2d71260` keeps the history hint the test expects). The Step 1
  TODO stands: that test asserts phrases (`history as a JSON object`, `No mutation`), not the missing fields and the absence
  of a handler call.
- **V**: `packages/ai/test/parametric-exact.test.ts` passes 5/5 in 6.2 s wall time in isolation. The 47.4 s
  `runParametricExact` workload on the filleted plate is not part of that file and was not re-measured; Step 10 owns it.
- **V**: the new `packages/ai/test/harness-inventory.test.ts` passes 4/4; `@cadcamfun/ai` typecheck stays clean.
- **V** after the CAM family: `packages/ai` 682/682, `apps/sidecar` 442/442, `apps/desktop` 705/706 (the one failure is the
  baseline `cam-kernel.test.ts` 30 s UI wait under load); `api`, `ai` and `desktop` typechecks clean. Inventory: 52/83
  actions declare a result.

## Change log

- 2026-10-15: integration follow-up without new regression files: complete HTTP/specialist/recovery/desktop results,
  shared outcome classification, validated commit envelopes, existing-suite verification and compiled-sidecar execution.
  Later roadmap dependencies and open TODOs remain open.
- 2026-10-14: published the guide (Steps 0–11, legend, discipline, closing commands) and closed Step 0: generated inventory
  with a staleness/execution-path test, baseline typechecks, spec corrections for B-rep/STEP and `start_session`/`settle_session`.
  No RM row status changed.
- 2026-10-14: Step 1 progress: outcome contract and classifier; CAD and CAM families migrated (52/83 results); fixed
  `parametric_convert` missing `mutation` and `cam_edit.generate` reporting a failed generation as success.
- 2026-10-14: closed Step 1: every action's input declared once in Effect and decoded at the seam; strict inputs; fixed
  parameter names silently dropped by `Record`; handler migration to Effect deferred to Step 5.
- 2026-10-15: closed Step 2: verified the bundle's `value`/`output` path, end-to-end regression for a large result, and
  `cam_edit.generate` declares what its preview omits and the hash of the stored program.
- 2026-10-15: closed Step 3: destructive tools require a human in every permission mode (auto no longer routes them to the
  classifier); regression over every agent and mode for approval, denials, verifier exposure and read-only roles.
- 2026-10-15: closed Step 4: per-Instance configuration file, registration handles closed on replacement, inherited
  DB/auth overrides blocked, CAD environment section, five mandatory host patches with a report.
- 2026-10-15: Step 5 gate: turn bound to the drawing it was admitted for (request, admission, tools, Code Mode, children,
  bridge), compare-and-swap writes with receipts; persisted revision, stored receipts and deduplication left to RM-03.
- 2026-10-15: Step 6 progress: one context assembly with manifest and aggregate budget, authorised acquisition in the
  sidecar, habits delivered once with the host's automatic reminder disabled, notes by recency, Brain cache invalidation.
- 2026-10-15: closed Step 7: one prompt corpus checked against the catalogue, the kernel, the workflow schemas and separate
  budgets; retired nested actions removed; skills, workflows and family styles moved to text files; standards editions.
- 2026-10-15: closed Step 8: gate test for a report bound to the stored program and its inputs (setup change with identical
  NC, NC change with identical inputs, verification never writes NC); machine configuration recorded as the open input.
- 2026-10-15: Step 9 progress: background-task journal (enqueue before run, report before session removal, outcome before
  delivery), bounded recovery of readers, uncertain editors reported instead of replayed, retention.
- 2026-10-15: closed Step 10: dimensional acceptance in `cad.parametric_test` (identified references, full values, genus apart
  from hole count) and kernel jobs in a worker with deadline and cancellation, compiled into the sidecar.
- 2026-10-15: Step 11: coverage of the four untested CAM actions (fixed the chain order they reported), versioned evaluation
  corpus v1 with STEP round trip and negative cases, reported/estimated tokens and known/unknown cost kept apart, compiled
  sidecar smoke with a latency, memory and stall baseline. Open: traces, the legacy usage route, Step 6/9/10 open items.
