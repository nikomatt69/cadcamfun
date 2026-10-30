# WP14 — Multi-operation setups (many tools, many programs)

Status: **in progress**. Owner dirs: `packages/core/src/cam/program` (+ `post`, `analysis`), `packages/api/src/groups/cam-setup.ts`, `apps/sidecar/src/http/cam-setup.ts`, `apps/desktop/src/features/cam/{lib/setup.ts,store/setupStore.ts}`. Depends on WP2 (operations, posts, verifier) and WP3 (API contract).

## 1. The problem

The v6 generator takes one operation per request (`POST /api/toolpaths/generate` → `GenerateRequest { settings, geometry }`), and the desktop multi-toolpath panel stitches the resulting texts together (`combineGCode`, `apps/desktop/src/features/cam/lib/multiToolpath.ts`). Concatenating full programs is not a program: each block carries its own header, `G21`, `M30` and `%`, no tool change is emitted, and no pocket number is assigned. The machine cannot run it.

## 2. The model

```
Setup        = stock + machine + post config + grouping policy + ordered Operations
Operation    = element ids + strategy/parameters + one Tool (+ optional pocket)
ToolTable    = pocket (T1..Tn) -> Tool (library reference), derived from the operations
Program      = one emitted .nc grouping operations; tool changes between them
```

```
Operations ──► planPrograms ──► PlannedProgram[] ──► generateSetup ──► GeneratedProgram[] (text + IR)
                (pure, no      (grouping, pockets,    (per operation: the existing
                 geometry)      ordering, numbering)     generator, then ONE emit per program)
```

Two things the plan deliberately keeps apart:

- **`single` grouping** — one program, tool changes inside it (what most machines want).
- **`perTool` / `perOperation` grouping** — one file per tool / per operation (operator preference, machine memory limits).

Both come from the same planner, so the UI can offer all of them without a second code path.

## 3. Contracts (`packages/core/src/cam/program`)

```ts
// op.ts
Operation = { id, name, elementIds: string[], params: ToolpathSettings, tool: Tool,
              pocket?: int, enabled: boolean, fromPreviousStock: boolean }

// setup.ts
Setup = { id, name, machineType, workOffset, stock: Stock, post: PostConfig,
          grouping: "single" | "perTool" | "perOperation",
          retractBeforeToolChange: boolean, operations: Operation[] }
PostConfig = { postId: "generic" | "fanuc" | "grbl", decimals, useCannedCycles, arcMode,
               header, tolerance, lineNumbers?, stamp?, programNumberBase }

// tooltable.ts
ToolTableEntry = { pocket: number, tool: Tool, operationIds: string[] }
buildToolTable(operations): { entries: ToolTableEntry[], warnings: string[] }
assignPockets(operations): Map<operationId, pocket>      // explicit pocket, else first use

// plan.ts
PlannedProgram = { name, programNumber, toolNumbers: number[], operations: string[] }
SetupPlan      = { programs: PlannedProgram[], toolTable: ToolTableEntry[],
                    toolLoads: number, toolChanges: number, warnings: string[] }
planPrograms(setup): SetupPlan                            // pure: no geometry, no clock

// programs.ts
GeneratedProgram = { name, programNumber, gcode, program: Program, stats: GcodeStats,
                     warnings: string[], operationIds: string[], toolNumbers: number[] }
GeneratedSetup   = { programs: GeneratedProgram[], toolTable: ToolTableEntry[],
                     totals: { programs, toolLoads, toolChanges, cutLength, rapidLength, estimatedSeconds },
                     warnings: string[] }
generateSetup(setup, geometryOf: (op) => GeometryInput): GeneratedSetup
```

Semantics:

- **One emit per program.** Each operation is generated through the existing generator (`cam.generator.generateToolpath`), its IR moves become one `Toolpath` of a single `Program`, and that program is emitted **once** by the post — which already writes `G80`/`M5`/`M9`/`T<n> M6`/`G43 H<n>`/`M3 S…`/coolant per tool change (`post/emitter.ts`). No string concatenation anywhere.
- **`toolId` is the Tool identity** (library id when there is one): `validate(program, machine)` already reports `MissingTool` against `machine.tools` by id. The pocket number is emission metadata, passed as the new `PostOptions.toolNumbers` override so a carousel's T numbers are honoured instead of first-use numbering.
- **Ordering.** The setup order is the machining order. Within a `perTool` group the operations stay in setup order; `planPrograms` warns when a tool appears in non-adjacent operations (an avoidable extra tool change) and exposes `reorderByTool(operations)` for the UI to fix it.
- **Retract before a tool change** (`retractBeforeToolChange`): raises Z to the highest Z the program reached before `M5`/`M9`/`T… M6`. Opt-in: the goldens of `04-core-cam.md` must not move.
- **Program numbers.** `post.programNumberBase` (default 1000) + index; written into `metadata.programNumber` (read by the fanuc `O` number) and used in the program name.
- **`fromPreviousStock`.** An operation that continues the tool before it gets that operation's real diameter as `restToolDiameter` instead of the hand-typed one, when it is a rest/rest-finishing `3d_surface` pass. It assumes the previous operation cut at the same Z levels with the same allowance (documented limit of `04-core-cam.md` §12); a height-field carryover between operations is out of scope.
- **Validation.** `validateSetup(setup)` returns issues (duplicate pocket, an operation without elements, rpm above `tool.maxRpm`, a group with no enabled operation). It is reported, not thrown: the UI shows problems next to the offending row.

## 4. API (`packages/api`)

New group `camSetup` (additive; the legacy routes of `05-api-sidecar.md` are untouched):

| Route | Body | Result |
| --- | --- | --- |
| `POST /api/cam/setups/plan` | `{ setup }` | `SetupPlan` (dry run, no geometry needed) |
| `POST /api/cam/setups/generate` | `{ setup }` | `GeneratedSetup` |
| `POST /api/cam/setups/validate` | `{ setup }` | `{ issues }` |

`generate` resolves `elementIds` on the caller side (the request carries the resolved elements), because the core is I/O-free.

## 5. As built

- `program/{op,setup,tooltable,plan,programs}.ts`, exported as `cam.program`.
- `PostOptions.toolNumbers?: Record<string, number>` and `PostOptions.retractBeforeToolChange?: boolean` in `post/types.ts`; `emitProgram` applies both. Defaults keep the existing output byte-identical.
- `analyseGcode` reports one `Toolpath` per tool change (the reference interpreter now returns tool changes with their line), so a multi-tool `.nc` parsed back keeps its tools for the viewport, the verifier and the AI tools.
- Built 2026-10-30 (spec 72 steps 1.1, 1.2): `cam/program/{op,setup,tooltable,plan,programs}.ts` exported as `cam.program` (plus `geometryFor`,
  `reorderByTool`, `groupsOf`); `packages/api/src/{cam-setup.ts,groups/cam-setup.ts}` with `POST /api/cam/setups/{plan,validate,generate}`; sidecar
  `http/cam-setup.ts` (generate runs inline, not in a worker); desktop `lib/setup.ts`, `api/setup.ts`, `store/setupStore.ts`; the multi-toolpath panel
  downloads through `camSetup.generate`. `combineGCode` is deprecated and stays for the legacy text view.
- Open: DB persistence of a setup (after RM-03), AI actions `setup_plan` / `setup_generate` (after RM-01), desktop controls for grouping / post /
  retract (the store holds the choices, no UI sets them yet), `generate` in a worker, `fromPreviousStock` is the diameter hand-over only.

## 6. Change log

- v1: contracts and semantics (this document).
