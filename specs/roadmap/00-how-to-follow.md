# RM-00 — How to follow the roadmap

Status: **done** (process). Owners: every agent. Cited from `AGENTS.md` when the user or a spec says **the roadmap**.

## 1. When this applies

This folder is in force when any of these is true:

- The user cites "the roadmap", `specs/roadmap`, or an `RM-NN` id.
- A task says "follow the roadmap" / "next roadmap step".
- `AGENTS.md` "Roadmap" section is in the agent instructions.

If the user names a concrete bug or file outside the current step, fix that request. Do not drag unrelated RM work into the same change.

## 2. Read order

1. `specs/roadmap/README.md` — order and current step.
2. The current step spec (`01`–`11`).
3. Design specs that step cites (`14-multi-op-setup.md`, `26-tool-consolidation.md`, …).
4. `specs/01-conventions.md` before writing Effect or SQL.

Do not start from `20-integral-roadmap.md` or `21-integration-master-plan.md` as the sequence. Those are design checklists; **this folder is the sequence**. If they disagree, this folder wins on order; the design spec wins on contract. Record the conflict in the step Change log.

## 3. One step at a time

- Implement only the current step's deliverables.
- Do not "while here" land RM-09 fillets during RM-02.
- Parallel work is allowed only when `README.md` says so and owner directories do not overlap.

## 4. Owner directories

The step spec lists owner dirs. Same rule as `00-overview.md` §4: edit only those dirs plus the tiny shared files it names (`packages/api/src/index.ts`, `apps/sidecar/src/layers.ts`). Shared files: small `Edit` only, re-read immediately before editing.

## 5. Architecture checks (before adding a module)

1. Name the **module** and its **interface** (types, invariants, error modes, ordering) — not only the TypeScript signature.
2. Apply the **deletion test**. Pass-through modules are rejected.
3. Put tests on the **interface**, not on private helpers extracted only for mocks.
4. A new **seam** needs a second **adapter** in the same step, or an explicit note that the seam is hypothetical and why.

Vocabulary: module, interface, implementation, depth, seam, adapter, leverage, locality. Do not substitute "service", "API", or "boundary" for those.

## 6. Effect v4 checks (before writing Effect)

1. Confirm the idiom in `packages/db/node_modules/effect/ai-docs/src/` or an existing sibling file. Not memory.
2. `Context.Service` + explicit `Layer`. No hidden provision.
3. `Effect.fn("Name")` for reusable methods. `Effect.gen` inside, not a function that only wraps `Effect.gen`.
4. `Schema.decodeUnknownEffect` at HTTP/tool edges. `packages/core` stays pure.
5. Map foreign exceptions with `Effect.try` / `Effect.tryPromise` into a tagged error.

## 7. Finish a step

1. `bunx tsc -p <touched package>/tsconfig.json`
2. `bun test <package dir>`
3. The step's Verify command in its spec.
4. Mark the README row `done`. Append Change log on the step spec.

## Change log

- v1: process for citing the roadmap.
