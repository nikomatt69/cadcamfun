# Agent guide

- Runtime and package manager: Bun. Tests: `bun test` per package; `bun run test` at the root.
- Effect 4.0.0 stable: import HTTP from `effect/http`, `effect/http-api`, SQL from `effect/sql`,
  atoms from `effect/reactivity` (not `effect/unstable/*`).
- Domain data are Effect `Schema`s. Add a field to the schema first; everything else derives from it.
- Never mutate a `CadDocument`; produce a `Command` and go through `Commands.apply` / `History.execute`.
- Errors are `Schema.TaggedError`s returned in the error channel, not thrown.
- Services: `Context.Service` + static `layer`; tests provide layers (`CamLibrary.layer`,
  `TestLLM`, `SqliteClient.layer({ filename: ":memory:" })`).
- `packages/llm` is vendored from nikcli; keep changes minimal so upstream fixes can be ported.
