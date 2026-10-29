# 70 — Integrated plan: the next steps, 2026-10-29

Status: written 2026-10-29 (owner request: "plan the next steps and integrate them with logic and care"); revised the same day to absorb
[spec 68](68-cam-kernel-enterprise-gap-audit.md) and [spec 69](69-cam-enterprise-step-plan.md), written meanwhile by another session. This document **builds nothing**.
It merges three sequences into one order: the platform/AI roadmap (`roadmap/README.md`, RM-nn), the kernel plan of [62](62-execution-plan-2026-q4.md) and the CAM
enterprise steps A1–J4 of 69, using the real state in [67](67-real-state-2026-10-29.md).

Precedence: **inside the CAM kernel, spec 69 decides the order of its steps** (A1–J4 keep their ids here); **across lanes and for adapter windows, this document decides**;
62 keeps lanes, gates and the closing ritual; the detail specs (29, 41, 51–55, 58–61) keep the design. `roadmap/README.md` stays the index for RM rows.

## 1. Facts this plan stands on (checked 2026-10-29)

- RM-01's seam is built: 16 registered tools over `packages/ai/src/actions/*` (spec 26 targeted 12; the 2026-10-13 log closed the seam). Its own gate is
  **red**: `packages/ai/test/tool-prompts.test.ts` fails, prompt total 33 301 characters against a ceiling of 32 800.
- Mutation receipts exist for drawings (`AiMutationReceipt`, `drawing-repo.ts`); they are not generalised to CAM setups or other documents (RM-03 core).
- WP14 persistence is absent: no `cam.program` export, no `camSetup` API group, no desktop `setupStore`. API contract coverage is 121/184.
- Spec 58 T1–T3, T5, T7 and spec 55 E2, E3 are built; specs 59, 60, 61, 41 and 48 have no code.
- The four structural CAM blockers of spec 69/68 (verified there in code): `verified-program` needs every claim `passed`, so 5-axis and non-+Z setups end at
  `preview`; `ManufacturingJob` has one setup, one origin, box stock and no fixtures; surface machining is a height field; no associativity or templates.
- **Three different things are called "setup" in the tree**: WP14's `Setup` (stock + machine + post + ordered operations → programs, `14-multi-op-setup.md`),
  `ManufacturingSetup` in `cam/setup.ts` (work frame, stock, fixture envelopes, tool assemblies; used by the machine-aware view, spec 31) and the
  `setups[]` that spec 69 C1 adds to `ManufacturingJob` (`setupOrientation`, origin, work offset, operations per setup). See step 2 below.

## 2. Logic of the order

Five critical paths decide everything else; an item is early when it unblocks one of them, or when it is small, independent and visible.

| Path | Chain | Why it is critical |
| --- | --- | --- |
| **Evidence** | 55 E1 rest, E4–E8 (= 69 J1, J2, G1) → every "gate on the fixture set" | no area can state a level without it; nothing later may claim parity |
| **Documents** | RM-03 revisions/receipts → RM-02 persisted setups → RM-07 write recovery → RM-09 precision integration | writes that can be retried or lost make every later AI/CAM claim unsafe |
| **Proof → first credible claim** | 69 A3 → A4 → B1 → B2 → C1 → C2 → C3 → C4 → C5 → F4 → F5 (≈ 11 steps) | the first "5-axis multi-side part, verified, with fixtures" sentence |
| **Naming → associativity** | 69 E1 (= 41 N1–N3) → E3 → E4 → E5 | seven specs wait on naming; 69 E2 (the stale badge) may start before it |
| **Setup model** | one reconciled vocabulary (step 2) → 69 C1 and RM-02 persistence | otherwise two persisted shapes for the same thing |

Rules that keep the merge safe:

1. **One lane, one directory set** (62 §2 lanes, plus **P** and **A** below). Two lanes never edit the same files; `kernel/execute.ts` is shared by lanes M and I
   (I only adds fields and claim bases, M changes the pipeline; whoever lands second runs `kernel.test`).
2. **Adapter windows are serialised.** Generated API clients, the AI tool catalogue ceiling and the harness inventory are shared; one window at a time
   (`cd packages/api && bun run generate`, `bun test packages/api -u` reviewed). Windows are listed in §5 and an item says which it takes.
3. **Every item is a vertical slice** (core → API → sidecar → assistant action → desktop panel → tests) unless it is explicitly "core only".
4. **No item is accepted by a regenerated golden, a raised ceiling or a rewritten baseline.** If a gate is red, the code or the prompt is trimmed.
5. **A level moves only through `bun run corpus` (the full run, ≈ 40 s) then `bun run scorecard`.** A partial corpus run overwrites the git-ignored report and
   the scorecard then silently downgrades rows (lesson of the previous round).
6. **Nothing is committed unless the owner asks** (`CLAUDE.md`).

| Lane | Owns | Items |
| --- | --- | --- |
| **P — Platform** | `packages/api/src/groups`, `apps/sidecar/src/{http,repos}`, `packages/db` migrations (receipts only), `apps/desktop/src/features/cam/{lib,store}/setup*` | RM-02, RM-03, RM-04, RM-05 |
| **A — AI** | `packages/ai`, `apps/sidecar/src/services/ai*` | RM-01 close, RM-06, RM-07, RM-10, RM-11 |
| **N — Native shell** | `apps/desktop/src-tauri`, `.github/workflows` | spec 56, WP10 |

Lanes E, K, T, M, I, X, S are as in 62 §2. Lanes P, I and M all reach `packages/api` and `apps/sidecar` through the adapter windows of §5.

## 3. Wave 0 — the first items

### 3.0 Step 0 — hygiene (before anything below; S)

State 2026-10-29 evening: **0.1 done, 0.3 done, 0.2 partly** (see below). Baseline in [67 §5](67-real-state-2026-10-29.md). Four reds of `packages/ai` are the checkpoint actions without updated tests/expectations and the harness inventory awaits regeneration in W1; they are listed there with their owner.

| # | Item | Gate |
| --- | --- | --- |
| 0.1 | Bring the AI tool prompts back under the ceiling (501 characters over): shorten wording, remove duplication; remove no action or rule. **Done 2026-10-29**: redundant phrases cut in 10 prompt files (`confirm` parameter glosses repeated from the action text, duplicated pointers, example lists); a concurrent session's `tabs` text in `cam_edit.txt` then took the total to 32 822, a further cut in `library_edit.txt` restored it | `tool-prompts.test.ts` and `prompt-corpus.test.ts` green (19 pass) with the ceiling unchanged |
| 0.2 | Correct the remaining stale headers of 67 §2 (specs 26–29); roadmap and task board are already corrected | each header says what the tree says |
| 0.3 | **Done 2026-10-29** (67 §5). Record a baseline: `bun check -p` for `core`, `ai`, `api`, `sidecar`, `desktop`; tests of `packages/ai` and `packages/core` per file under 110 s; the full `bun run corpus` once | one dated line in 67 with the red/green list and the corpus result |

### 3.1 The first items, in order

"69 xN" is a step of spec 69; "62" is a row of spec 62's lists. Sizes: **S** one session, **M** 1–3, **L** several with a convergence risk.

| # | Item | Spec / step | Lane | Size | Depends | Window | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Step 0 above | 26, 67 | A | S | — | — | see 3.0 |
| 2 | **Setup vocabulary note (docs only)**: map WP14 `Setup`, `ManufacturingSetup` (`cam/setup.ts`) and the future `ManufacturingJob.setups[]` to one model; append it to `14-multi-op-setup.md` and to 69 C1; decide which type is persisted | 14, 69 C1 | I + P | S | — | — | each field of the three shapes is placed in exactly one owner type or marked derived; no code |
| 3 | **Honesty slices A2–A5** (any order; A3 → A4 first, they open the critical path): cutter compensation output, stepped tool assembly in the executor, rotary moves get a machine-clearance verdict, replay degrades with a declared bound | 69 A2–A5 | M | S–M each | — | A2's `compensation` option joins W1 if ready, else W3 | the gates of 69 A2–A5; existing `kernel.test` unchanged |
| 4 | **W1 batch**: profile tabs, lead types and spring pass in `OperationSpec` **+** part fingerprint, `programStatus`, stale badge **+** the stateless `cam.program` export and `camSetup` contract (plan/generate, no persistence). All are additive optional fields; one client regeneration | 69 A1, 69 E2 (= 59 A1–A2), RM-02 | M + I + P | M | 2 for the camSetup shape | **W1** | tab material in the replay and `no-gouge` passed; class table test, legacy programs `unknown`; `cam.program` exported |
| 5 | Factored Kienzle chain, per-move engagement (3-axis first) | 69 G0 (= 61 Z2 → Z1) | I | M | — | — | `cuttingData` unchanged on all tests; analytic engagement cases within the declared bound |
| 6 | Failure counters, designed coincidence in Booleans | 42 R0, R3 | K | M | — | — | seeded report; coplanar / coaxial same-domain Booleans without displacement; `fuzz.test.ts` unchanged |
| 7 | Generalise receipts and expected-revision writes to CAM setups and documents; `components/*` family | RM-03 | P | M | 2 (which type is persisted) | **W2** | forged context, stale revision and replayed receipt fail before execute; WP0 migration generated, applied to a copy of a real DB first |
| 8 | Finish the corpus (fuzz seeds, long thread, STEP/IGES/NC entry kinds) and add the nightly corpus + bench job; record the 200-hole plate against its 10 s budget | 55 E1 rest, 69 J2 | E | M | — | — | job in `.github/workflows`; CI fails on `wrong` and on > 20 % budget regression |
| 9 | **Tri-dexel stock** with declared bound (core only) | 69 B1 (= 53 V1) | M | L | — | — | tilted pocket volume within cell × area; ball cut on a sphere within one cell; sure/possible bracket kept |
| 10 | Public STEP/IGES set and the annotated CAM reference set | 69 J1 = G1 (= 55 E4–E5) | E | M | 8 | — | ≥ 30 entries with licences; annotated features for 54 R1 and the gate of 69 B3, F12 |
| 11 | **Rotary replay on the tri-dexel, fault injection, tolerance gate** → milestone M1 of spec 69 | 69 B2, B3, B4 (= 53 V2, V5) | M + E | L | 3 (A4), 9, 10 | W3 for B4 (claim field) | a 5-axis fixture reaches `verified-program` with every claim `passed`; an injected overcut fails it; 100 seeded overcuts over 30 clean fixtures, measured figures written even if lower; `quality.tolerance` below the budget blocks release with the term named |
| 12 | Provenance, edge/vertex keys, `resolve(ref)` | 69 E1 (= 41 N1–N3) | T | L | 58 T3 (built), 8, 10 | — | every result face maps to an operand face or `new`; keys stable under a 20 % upstream dimension change |

Parallel from day one (no shared files with the table above):

| Item | Spec | Lane | Gate |
| --- | --- | --- | --- |
| First CI run of `cargo-deny` / `cargo-audit`; pin tool versions, fix the 0.18 `deny.toml` schema | 56 §4 G | N | both jobs run and are green or fail with a recorded reason; then made blocking |
| Manual native smoke: App Nap, sleep/wake, Dock bar, packaged-window save-on-close | 56 F, archived 38 | N | a dated note in spec 56 §5; **not** assumed from mocked IPC |
| RM-01 "Required integration checks" that have no test yet | RM-01 | A | each check has a test or is listed as open; only then does the row go to `done` |
| Phase D of spec 69 (swept-profile cutters, holder library, tool data I/O, editable cutting data) | 69 D1–D4 | M | D1/D2 wait for 3 (A3); D3/D4 are independent |

After item 11 the sentence allowed by spec 69 §5 is milestone **M1** ("5-axis programs can reach `verified-program` on the corpus fixtures, with bounds"), and only if the
scorecard rows of A1–A5 and B1–B4 are at level 3.

## 4. Later waves (order, not dates)

Wave 1:
- **M (CAM job model):** 69 C1 (setups list) → C2 (stock model) → C3 (fixtures) → C4 (stock carried) → C5 (cross-setup coverage), C6, C7; this is the road to **M2 multi-side**.
  C1 must use the type decided in item 2 and shares its contract with RM-02 persistence, so the two take **W3** together.
- **P:** RM-02 persisted setups and completion (needs item 7 and item 2); RM-03 remaining families in the order of `roadmap/03-api-parity.md`.
- **A:** RM-06 context (needs RM-01 closed), RM-07 lifecycle and `start_session` / `settle_session` (needs item 7 receipts).
- **I:** 69 E4 (regenerate + diff, needs E1/E3 or the signature fallback), 69 G0b (feed optimisation), 69 H1 (templates; needs F12 kinds and decision D10 — decided).
- **K:** 42 R2 robust predicates. **T:** 58 T4/T6/T8 after naming settles.

Wave 2: 62 wave 2 (CAD blends/surfaces, sketch depth, 54 R-items) plus **M:** 69 F1–F8 (drop-cutter, undercuts, tool-axis, collision-aware, head machines → **M3**), **I:** 69 E5/E6, H2;
**P:** RM-04 desktop parity one vertical at a time, RM-05; **A:** RM-10, RM-11 rest.

Wave 3: 62 wave 3 plus 69 F9–F12, G1–G8, I1–I3 (**M5**), RM-08 (APNs owner-blocked), RM-12 native edge (needs spec 55 E2 numbers and the parity harness).

Horizon: unchanged from 62 §3 and 69 §2 (generative design, specialist 5-axis, other processes, STEP-NC, MTConnect, native compute, subdivision, rendering/animation media). 69 J3/J4 (scale, qualification) close **M6**.

## 5. Adapter windows

| Window | Takes | Regenerates | Opens when | Closes when |
| --- | --- | --- | --- | --- |
| **W1** | item 4 (69 A1 + E2 + `camSetup` stateless; plus A2's option if ready) | API clients, harness inventory | item 1 is green | clients regenerated once, `packages/api` tests updated with `-u` and the diff reviewed |
| **W2** | item 7 (RM-03 receipts + `components/*`) | API clients; WP0 migration generated and applied | W1 closed | same |
| **W3** | 69 C1 + RM-02 persistence (one shared setup contract), 69 B4 claim field, 58 T4/T6 contracts, RM-07 control actions | API clients, AI catalogue | W2 closed and item 2 decided | same |

Kernel-only items (3 without a contract field, 5, 6, 9, 11 without B4, 12) take **no** window; if one adds a contract field it queues behind the open window.
69's own rule "C8: adapter window per step" is read as: each C step prepares its contract in core, and the windows above carry them in batches.

## 6. Owner decisions, now versus later

**Decided 2026-10-29 (owner: "ok" to the recommendations):**

- **D12** — legacy `cam/generator/*` programs stay read-only with status `unknown`. No automatic conversion (it would change the NC bytes). "Regenerate with the kernel" may be added later as an explicit user action, only for operations the kernel really covers. This **narrows 69 E6**: that step no longer includes "convert or retire".
- **D9** — regeneration policy of a stale program is `ask`. `auto-safe` becomes an opt-in per project only after 59 A3–A4 (regenerate + diff) work; `never` stays available.
- **D10** — templates are library items (category `cam-template`), per user, no new table. The format carries a scope field from the start so an organisation scope can be added without a migration once identity and organisations (spec 30, RM-03) are closed.

Still open:

| Decision | Needed for | Default if unanswered | When to ask |
| --- | --- | --- | --- |
| D13 default stock for scans | 69 C2 | box from mesh bounds, `part-model` term labelled | before wave 1 |
| D14 fixture library source | 69 C3 | user-supplied bodies only, nothing bundled | before wave 1 |
| D1 retire the mesh rebuild | 40 U7, 58 T4 simplification | keep as `legacyMesh` | before 58 T4 |
| D3 FEA solver language | 48 | TypeScript, sparse Cholesky + PCG | before wave 3 |
| D7 qualification partner | 69 J4, any level above `verified-model` | none | when a release claim is planned |
| D11 calibration data | 69 G0c | everything `uncalibrated` | wave 2 |
| WP0 columns for Taylor / tool life | 69 D4, G0c | values travel in the request only | wave 2 |
| D2, D4, D5, D6 | horizon | as in 57 §4 | not now |

## 7. How an item closes (inherited, not redefined)

[62 §8](62-execution-plan-2026-q4.md) and 69 §1 apply. Lane P and A items also update the RM index row and the step spec's change log
(`roadmap/00-how-to-follow.md`); a changed surface updates the design spec's state table; a CAM item updates its row in `packages/core/test/corpus/parity.json`
and runs the full corpus before the scorecard. Nothing is marked `done` on a header alone.

## 8. Risks specific to this merge

- **Adapter contention** between lanes I, M, P and A is the main cost of merging the sequences; mitigated by §5 and by batching additive fields (W1).
- **Setup vocabulary** (item 2): if skipped, RM-02 persistence and 69 C1 would store two shapes of the same concept and the AI actions (`cam.setups`) would name both.
- **Item 7 touches the database.** The migration is generated by `bun run db:generate`, applied to a copy first, never edited by hand.
- **Evidence debt hides regressions.** Until item 8 lands, a green suite is the only guard; say so in any report instead of implying a measured level.
- **Naming (item 12) is large.** It starts only when items 8 and 10 give it a corpus, and ships `resolve` with its five outcomes before any consumer migrates (62 §7).
- **`kernel/execute.ts` is the hot file** of items 3, 5 and 11; one lane at a time, `kernel.test` after each landing, kernel suites per file under 110 s.
- **Shared checkout.** Other sessions edit it concurrently (spec numbers 68/69 were taken while this plan was written): stage explicit paths, never `git stash`, check `ls specs` before numbering a new spec.
- **Stale text returns.** Only the statuses verified on 2026-10-29 are facts; any other header is still a claim.

## 9. Change log

- 2026-10-29: created as spec 68; merged the RM sequence and the spec 62 sequence; added lanes P/A and adapter windows; recorded the red prompt-size gate of RM-01.
- 2026-10-29: renumbered to 70 (68 and 69 were taken by the CAM enterprise audit and step plan). Absorbed 69's phases: A2–A5 and B1–B4 enter wave 0, C1–C5 and D, E, F, G, H, I, J are placed in waves 1–3; added the setup-vocabulary item and the third critical path; D12 narrows 69 E6; D13/D14 added to the decision table.
- 2026-10-29: owner accepted the recommended D9, D10 and D12 (see §6).
- 2026-10-29: step 0.1 and 0.3 executed; the prompt ceiling is green again and the baseline is recorded in 67 §5. Remaining step-0 reds are listed there with their owners.
