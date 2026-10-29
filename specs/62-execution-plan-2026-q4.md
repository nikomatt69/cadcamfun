# 62 — Execution plan, Q4 2026: ordered work, lanes, gates, decisions

Status: written 2026-10-25. It refreshes [spec 39](39-professional-parity-master-plan.md) §1.3 (waves) against the **verified** state of [spec 57](57-parity-ledger-2026-10-25.md); where the two disagree on order,
this plan wins; on design, the detail specs win. The Rust / Tauri workstream is [spec 56](56-native-shell-integration.md) and is only pointed to here (§4). Nothing here is a parity claim.

## 1. What changed since spec 39, and why the order changes

1. **No area has a measured level yet.** Spec 55 E1–E3 (corpus, bench, scorecard) are all open (`bench:cam` is an informational first slice only). Every later gate "on the fixture set" needs them, so they go first.
2. **Three things were missing that need no naming kernel and give visible value early**: suppress / rollback in the history (spec 58 T1–T3), a stale-program badge (spec 59 A1–A2), and the per-move force and engagement (spec 61 Z1–Z2). They go in the first wave even though spec 39 never listed them.
3. **Spec 41 (naming) is the hub** of 45, 46, 47, 48, 49, 50, 54 R1 refs, 58 lineage and 59 A5, and it is still unbuilt. It stays large and cross-cutting; spec 58 T3 (lineage recorded during replay) removes part of its pressure and is done first.
4. **Built since 2026-10-24** and therefore removed from the plan: spec 51 F4 (swarf, cone / cylinder / flat walls) and F9 (TCP words), spec 54 C1 (post as data), H1 (setup sheet), part of R1 / R4, spec 40 U0 / U1 / U2 / U4 / U5 / U6 (U2 and R1 of 54 partial).

5. **CAM enterprise chapter (2026-10-29).** The CAM items of the waves below are broken down into closable steps A1–J4 in [spec 69](69-cam-enterprise-step-plan.md), from the gap audit of [spec 68](68-cam-kernel-enterprise-gap-audit.md); for CAM order, spec 69 wins over §3 (it adds the release path of 5-axis programs, the multi-setup job model, fixtures, tool assembly and cutter compensation, none of which the waves named).

## 2. Lanes: parallel work with disjoint directories

A lane may be run by one agent or session; two lanes never edit the same directory. Adapters (`packages/api`, `apps/sidecar`, `packages/ai`, `apps/desktop`) are shared by every lane and are **serialised**: one lane at a time
regenerates the API clients (`bun run generate`, `bun test packages/api -u`), because generated files conflict; an item that needs an adapter says so and takes the "adapter window".

| Lane | Owns | Items (specs) |
|---|---|---|
| **E — Evidence** | `packages/core/test/corpus/`, `scripts/` (bench, corpus, scorecard), WP1 + WP2 shared | 55 E1–E8 |
| **K — CAD kernel** | `cad/brep/*` | 42, 43, 44, 40 U3 / U7 |
| **T — Timeline and naming** | `cad/history*.ts`, `cad/brep/naming.ts`, `cad/sketch*.ts`, `cad/face-edit.ts` | 58, 41, 45, then 46 |
| **M — CAM kernel** | `cam/kernel/{execute,collision,motion,stock,head,turning}.ts`, `cam/operations`, `cam/model`, `cam/verify`, `cam/post` | 53, 51, 52, 54 C2 |
| **I — CAM intelligence** | `cam/kernel/{associativity,template,engagement,process}.ts` (new files), `cam/brep-part.ts`, `cam/setup-plan.ts`, `cam/generator/history-features.ts` | 59, 60, 61, 54 R1–R4 / L / Q |
| **X — Drawings and exchange** | `drawing/*`, `cad/brep/{step,iges,export-mesh}.ts`, `cad/{dxf,import-step}.ts` | 49, 50 (after 41 and 46) |
| **S — Simulation** | new `packages/core/src/sim-fea/` | 48 (after D3) |
| **N — Native shell** | `apps/desktop/src-tauri`, `.github/workflows`, `scripts/release*` | spec 56 (§4) |

Overlap to watch: lane I and lane M both touch `cam/kernel/execute.ts` (identity, claims); the rule is that lane I only **adds** fields and a claim basis, lane M changes the pipeline, and whichever lands second rebases and runs
`kernel.test`. Lane T and lane K both depend on `history-brep.ts` ↔ `brep/*`; T owns `history-brep.ts`, K owns `brep/*`.

## 3. Waves

Sizes: **S** one focused session; **M** one to three; **L** several sessions with a real risk (an algorithm that may not converge). Sizes are order of effort, not dates. Every item is a **vertical slice** that finishes core, API, sidecar,
assistant action and desktop panel with tests (the 2026-10-24 gap round worked this way), and updates the item's row in spec 57 and the owning spec's state table.

### Wave 0 — evidence and early value (no owner decision blocks it)

| Item | Spec | Lane | Size | Depends | Gate |
|---|---|---|---|---|---|
| E1 corpus manifest + runner + refusal registry (sets a, c first) | 55 | E | M | — | `bun run corpus` writes the report; CI fails on `wrong` |
| E2 bench harness + budgets (grows `bench:cam`) | 55 | E | M | — | `bun run bench` JSON with median / p95 and machine fingerprint; comparison rule tested |
| E3 scorecard generator + honest baseline | 55 | E | S | E1, E2 | scorecard committed; first levels recorded as they are (expected many 1s and 2s) |
| T1–T3 timeline schema, suppress / rollback replay, lineage + `moveFeatureTo` | 58 | T | M | — | all existing `history-*.test.ts` unchanged; 24-kind suppress equivalence; refused move names the blocker |
| A1–A2 part fingerprint + `programStatus` + stale badge | 59 | I | S | 58 T2 (for suppressed features; A1 can start without it) | class table test; legacy returns `unknown` |
| Z2, Z1 factored Kienzle + per-move engagement | 61 | I | M | — | `cuttingData` unchanged on all tests; analytic engagement cases within the declared bound |
| R0, R3 failure counters, designed coincidence | 42 | K | M | — | seeded report; coplanar / coaxial same-domain Booleans without displacement |
| N-lane items | 56 | N | — | — | §4 |

**Exit of wave 0:** a scorecard exists with the true baseline; the history has suppress / rollback in core, the exact replay and the timeline panel; a program in the desktop shows `current` / `stale` / `unknown`; the engagement of a 3-axis program can be read per move.

### Wave 1 — foundations of proof and naming

| Item | Spec | Lane | Size | Depends | Gate |
|---|---|---|---|---|---|
| V1 tri-dexel stock with declared bound | 53 | M | L | — | tilted pocket volume within (cell × area); ball cut on a sphere within one cell |
| V2 + V5 final-NC proof with bounds, fault injection | 53 | M | L | V1 | 100 seeded overcuts detected, 0 false positives on 30 clean fixtures (target) |
| N1–N3 provenance, edge / vertex keys, `resolve(ref)` | 41 | T | L | 58 T3 | every result face maps to an operand face or `new`; keys stable under a 20 % upstream dimension change |
| T5–T7 edit in place, failure states with remedies, adapters | 58 | T | M | 58 T2 | fillet radius failure isolates one feature; remedy rebuilds |
| A3–A4 regenerate + diff | 59 | I | M | 59 A1–A2 | unchanged project regenerates to identical NC bytes |
| Z3 feed optimisation, `cutting-data` claim per move | 61 | I | L | Z1, Z2 | no move over a limit; geometry claims unchanged; `off` is byte-identical |
| P1, P3, P2 templates: format, application with trace, tool selection | 60 | I | M | 54 R1 (kinds) | dry run lists matched rules, unmatched features, no-tool reasons |
| R2 robust predicates | 42 | K | L | R0 | no regression in `fuzz.test.ts`; predicates exact on a degenerate corpus |
| E4, E5 public STEP / IGES set, CAM reference set with annotations | 55 | E | M | E1 | ≥ 30 entries with licences; annotated features for 54 R1 |

**Exit of wave 1:** the NC proof carries bounds; refs resolve through a parameter edit for fillet / chamfer / shell / hole consumers (N5 may follow); a changed model regenerates a program with a diff; a feed-optimised program has a measured
`cutting-data` claim; a template run explains itself.

### Wave 2 — breadth that rests on the foundations

| Item | Spec | Lane | Size | Depends |
|---|---|---|---|---|
| N4–N8 history refs, consumers, drawings / CAM refs, AI `resolve`, desktop broken-ref badge | 41 | T | L | N1–N3 |
| T4 incremental rebuild (`ReplayState`) | 58 | T | L | 58 T2–T3 (after naming settles) |
| B1–B3, O1, O3 rolling-ball blend, tangent chains, vertex blends, offset / shell of any body | 43 | K | L | 42 R5 (SSI) for B1 / O2 |
| S1–S2, S7, A1–A2 trim, thicken, stitch with gaps, analysis | 44 | K | L | 42 R5 |
| F1–F3, F7–F9 B-rep contacts, tool-axis strategies, collision-aware generation, head machines in `execute.ts`, TCP gate | 51 | M | L | 53 V1 / V2 |
| V6, V4 stock between setups, machine collision claim | 53 | M | M | V1 |
| R1 rest, R2, R3, R4 rest (bosses / slots / grooves, rules, stick-out, WCS) | 54 | I | L | 55 E5, 41 N6 |
| P4–P5, P7 capture, job lists, workflow decision | 60 | I | M | P1–P3 |
| A5 operation matching | 59 | I | M | 41 N6 (refs) or signature fallback |
| Z5–Z6 tool life, calibration record | 61 | I | M | Z3; WP0 decision for columns |
| K1–K3, K6–K8 sketch depth and interactive solve | 45 | T | L | 41 |

### Wave 3 — modules and exchange (need naming and assemblies)

46 A1–A5 (occurrence model, mates, in-context, configurations — A5 uses 58 T8), 47 SM1–SM7 / W / MT, 49 G / D / T / O (associative drawings, vector PDF), 50 X1–X10 (AP242, PMI, mesh import, IGES depth), 52 T / M / P (turning and mill-turn, after
53), 54 C2 / C3 / L1 / L2 / L3 / Q1–Q4, 48 F1–F8 (FEA, after D3), 61 Z4 / Z7.

### Horizon (not scheduled; decisions first)

Generative design / topology optimisation (G6; needs spec 48 F1–F5 passing), specialist five-axis packages (D4), wire EDM / laser / plasma / waterjet / nesting (D5), subdivision modelling (D6), rendering and animation media (G7, out of scope), native compute behind the
kernel job seam (spec 56 §7, needs E2 and the parity harness).

## 4. Workstream N — Rust, Tauri and CI (spec 56)

Not duplicated here. Spec 56 §3–§10 is the design, the status table and the plugin / crate verdicts. State on 2026-10-25, after the lifecycle and quality passes (Rust: 129 unit + 6 stub-sidecar tests, clippy `-D warnings` and fmt clean; `bun test scripts` 103 pass; re-run by the coordinator):

| Spec 56 phase | State | What the plan adds |
|---|---|---|
| F process supervision | **implemented** (health probe, proportional restart budget, wake by clock gap, pidfile with identity check, panic hook, App Nap lease around kernel runs, indeterminate Dock bar) | **Not verified, needs a GUI or platform smoke:** App Nap in Activity Monitor, a real sleep/wake, the Dock bar, the Windows and Linux branches. Follow-up (S): Dock progress as the share of operations done instead of indeterminate; an OS wake notification needs `unsafe`, which `[lints.rust] unsafe_code = "forbid"` rules out, so the clock-gap detector stays. |
| G quality gates | **implemented**, with one gap: `deny.toml`, `rust-toolchain.toml`, `clippy.toml`, `[lints]`, dev profile, https timestamp, stub-sidecar integration test, tauri-config lint | `cargo-deny` and `cargo-audit` CI jobs are non-blocking and have **never run** (not installed locally; tool pins and the 0.18 `deny.toml` schema are unverified, the Windows and Linux licence graph is unconfirmed). First task of lane N: run them in CI and triage. Also open (S): make the `sidecar` module public so the integration test drives the real supervisor; `pick_file`, `secret_delete`, `set_recent_projects` are granted without a webview caller (listed in `PENDING_CALLER`); `core:default` is probably wider than needed (needs a real app run); `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-updater` are in `package.json` but never imported. |
| I owner-requested qualification (signed bundle smoke, health, performance evidence, save recovery, security configuration) | specified, in progress | I.3 (performance evidence) **must reuse spec 55 E2** (`bench:cam` is the seed) instead of a second bench command |
| H Rust-owned `cadcam://` scheme, SSE over `ipc::Channel`, binary framing | deferred | after C has been in use |
| §7 native compute (height-field, drop-cutter, replay in WASM first) | blocked | needs spec 55 E2 numbers and `packages/core/test/parity/`; amend spec 36 §7.6 first |

Coupling to this plan: Z3 (feed optimisation) and spec 53 V1 are exactly the bulk numeric seams §7 names; their benchmarks go through E2 so the question "does Rust pay" has numbers.

## 5. The next ten items (in order)

1. **Spec 55 E1–E3** — corpus runner, bench, scorecard baseline (lane E). Without it nothing below can state its progress.
2. **Spec 58 T1–T3** — suppress / rollback / lineage graph (lane T).
3. **Spec 59 A1–A2** — part fingerprint, `programStatus`, stale badge in `KernelSection` and the toolpath list (lane I; adapter window 1 with item 2's schema change, one regeneration of the clients).
4. **Spec 61 Z2 → Z1** — factored Kienzle chain, per-move engagement (lane I).
5. **Spec 42 R0 + R3** — failure counters and designed coincidence (lane K).
6. **Spec 53 V1** — tri-dexel stock with a declared bound (lane M).
7. **Spec 55 E4–E5** — public STEP / IGES set and the annotated CAM reference set (lane E), feeding 54 R1 and 53 V2.
8. **Spec 53 V2 + V5** — final-NC proof with bounds (lane M).
9. **Spec 41 N1–N3** — provenance, keys, `resolve` (lane T), using 58 T3's lineage.
10. **Spec 61 Z3** and **spec 60 P1 / P3 / P2** — feed optimisation, then templates with dry run (lane I; they share the `execute.ts` rule of §2).

Lane N runs in parallel from the start with spec 56 F and G.

## 6. Owner decisions that block waves

Defaults of spec 39 §4 and spec 57 §4 stand until answered. Decisions are **not** blockers of waves 0–1 except where marked.

| Decision | Needed before | If not answered |
|---|---|---|
| D8 history schema: superset or migration | 58 T1 (wave 0) | read-compatible superset (default), no migration |
| D10 template storage scope | 60 P1 (wave 1) | library item, per user / organisation |
| D11 calibration data source | 61 Z6 (wave 2) | none: everything stays `uncalibrated` |
| D1 retire the mesh replay | 40 U7, and 58 T4 simplification | keep as flagged `legacyMesh` |
| D9 regeneration policy | 59 A4 (wave 1) | `ask` |
| D12 legacy generator programs: keep read-only, convert on request, or retire | none now; blocks spec 59 §6 follow-up and any claim that "one structure" holds | keep, status `unknown`, no conversion |
| D3 FEA solver language | 48 (wave 3) | TypeScript, sparse Cholesky + PCG |
| D7 qualification partner | any release level above `verified-model` | none |
| D4, D5, D6, D2 | horizon items | not started |
| WP0: Taylor columns on `toolTable` | 61 Z5 persistence | values travel in the request only |

## 7. Risks

- **Naming (spec 41) is the critical path** of seven specs and cross-cuts history, B-rep operations, drawings, CAM and AI; mitigation: lineage first (58 T3), the five outcomes of `resolve` tested before any consumer migrates, every consumer item with an "edit upstream, same entity" test.
- **Boolean robustness (42 R2 / R3 / R5)** is on the path of every CAD item; the fuzz harness is the guard; no item is accepted by a regenerated golden.
- **Adapter conflicts** (generated clients, the AI tool catalogue ceiling in `packages/ai/test/tool-prompts.test.ts`, the harness inventory): serialised adapter windows; parameter names only; the inventory is regenerated by its script, not edited.
- **Shared checkout and load.** Kernel suites are run per file under 110 s; judge timings against budgets, not absolute history; never `git stash` or reset a checkout other sessions are editing; check `git log --stat` before assuming a change is uncommitted.
- **Claims without evidence.** A level is written only by the scorecard generator after E3; a PR that changes a level quotes the gate.
- **Desktop verification.** Panel work is tested in happy-dom against the real sidecar; a Tauri-window run is recorded when done and is **not** assumed.

## 8. How an item closes

1. The gate test exists, fails before the change, passes after. 2. `bun check -p packages/core/tsconfig.json` clean; touched adapter packages typecheck; clients regenerated when a contract changed. 3. Existing suites of the touched area are
green and listed. 4. The item's row in spec 57 and the state table of its spec are updated with the commit and the evidence. 5. Refusals are added to the spec's honest-limits list and to the corpus refusal registry (E1). 6. Nothing is committed unless the owner asks
(CLAUDE.md); when asked, the commit goes to local main and nothing is pushed unless the owner asks for that too.

## 9. Change log

- 2026-10-29: the order of §5 is merged with the RM roadmap in [70](70-integrated-next-steps-2026-10-29.md); items 1 and 2 are built in part (spec 55 E2–E3 built, E1 partial; spec 58 T1–T3 built), the rest of §5 continues there. Lanes and gates of this plan are unchanged.
- 2026-10-25: created with specs 57–61.
- 2026-10-29: pointer to the CAM enterprise step plan (spec 69).
