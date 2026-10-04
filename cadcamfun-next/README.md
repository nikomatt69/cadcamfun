# CADCAMFUN Next

A ground-up rebuild of CADCAMFUN: browser CAD/CAM for CNC milling with an AI assistant,
built on **Effect 4**, **SolidJS** and **Bun**. The AI layer is the Effect-native LLM core from
[nikcli](https://github.com/nikcli/nikcli).

```
apps/web          SolidJS + Vite 8 + Tailwind 4 workstation (2D editor, 3D preview, CAM, AI chat)
packages/core     CAD domain: Schema-typed elements, layers, documents, commands, undo history
packages/cam      CAM: tools/materials/machines, feeds & speeds, toolpaths, post-processors, G-code parser
packages/ai       CAD/CAM agent: 10 typed tools over a live Workspace, streamed tool loop
packages/llm      Provider-agnostic LLM client + tool runtime (vendored from nikcli, ported to Effect 4.0.0)
packages/server   Bun HTTP server: Effect HttpApi (OpenAPI), SQLite persistence, SSE chat endpoint
```

## Quick start

```sh
bun install
cp .env.example .env        # optional: AI uses your nikcli login, or set a provider key here
bun run dev                 # API on :8787, web on http://localhost:5173
```

Production: `bun run build && bun run start` serves the API and the built app from one process.
API docs: `/api/docs` (Scalar), spec at `/api/openapi.json`.

```sh
bun run test        # all packages
bun run typecheck
```

## Architecture

- **One domain model, end to end.** Every shape, command, operation and API payload is an Effect
  `Schema`. The same schemas validate HTTP bodies, database rows, AI tool parameters (as JSON
  Schema) and UI edits, so an invalid document cannot be stored, sent or produced by the model.
- **Pure core, effects at the edges.** `core` and `cam` are pure functions returning
  `Effect`s with typed errors (`ElementNotFound`, `LayerLocked`, `ToolpathError`, …). Documents
  are immutable; undo/redo is structural sharing, not diffing.
- **Commands are the only write path.** UI, AI agent and sync all go through
  `Commands.apply`, so every edit is serialisable, replayable and undoable.
- **Services and layers.** `CamLibrary`, `Workspace`, `AiModel`, `CadAgent`, `Projects` are
  `Context.Service`s; tests swap layers (in-memory SQLite, scripted LLM) instead of mocking.
- **Typed client for free.** The web app talks to the server through `AtomHttpApi`, derived
  from the same `HttpApi` contract, exposed to Solid via `@effect/atom-solid`.
- **AI that edits through tools, not text.** The agent can only change the design via the
  same commands as the UI. Each chat turn streams text, tool calls and results over SSE, then
  the edited document, which the editor commits as a single undoable step.

## CAM

| Operation | What it does |
| --- | --- |
| Profile | Outside / inside / on-line contour, tool-radius offset (Clipper2), climb or conventional, multi-pass |
| Pocket | Concentric offset clearing from centre outwards, step-over in × tool diameter |
| Drill | Points and circle centres, nearest-neighbour ordering, optional pecking |
| Engrave | Follows geometry exactly |
| Facing | Zig-zag raster over the selection or stock |

Feeds & speeds come from cutting speed and chip load (`cam/src/feeds.ts`), clamped to the
machine. Post-processors: GRBL, Fanuc (O-number, N-numbers, G43, G28), LinuxCNC, Marlin. The
G-code parser (G0–G3, I/J and R arcs, G20/21, G90/91) powers analysis and round-trip tests.

Known limits of this first cut: CAM assumes millimetres; pockets do not yet treat inner shapes as
islands; no tabs, ramps/helical entries or adaptive clearing yet.

## AI assistant

If nikcli is installed, the assistant reuses its login: API keys and unexpired OAuth tokens from
nikcli's `auth.json` and the default `provider/model` from its global `nikcli.json` (same paths
as nikcli: `NIKCLI_DATA_DIR`, `XDG_DATA_HOME/nikcli`, `~/.local/share/nikcli`). Environment
variables override it. Configure with `CADCAMFUN_AI_PROVIDER` (`anthropic` default, `openai`, `openrouter`, `google`,
`xai`), `CADCAMFUN_AI_MODEL` and the provider's API key variable. Tools: `get_document`,
`add_shapes`, `transform_elements`, `delete_elements`, `list_library`, `get_cam_setup`,
`configure_cam`, `add_operation`, `remove_operation`, `generate_gcode`.

## Provenance

`packages/llm` is copied from `nikcli/packages/llm` (MIT). Changes for Effect 4.0.0 stable:
`effect/unstable/*` imports moved to `effect/*`, `Config.redacted` → `Config.Redacted`, and schema
statics attached with `withStatics` (Effect 4 schemas expose `make` as a prototype getter). Recorded
provider tests that depend on nikcli's HTTP recorder were dropped.
