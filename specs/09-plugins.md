# WP9 — Plugin system (`packages/plugin-sdk`, `apps/sidecar/src/plugins`)

## Assistant extensions (2026-10-16)

Owner-requested assistant plugin management extends apps/sidecar/src/services/ai-plugins.ts and its tests: install a validated local manifest/source bundle, list installed Worker plugins and persist enable/disable with live tool refresh. Supported capabilities are ai:tool, ai:mod and ai:mode; unsupported capabilities are refused explicitly. Uploaded mod modules accompany the worker source, and enabled plugins contribute namespaced assistant modes. Existing browser CAD/CAM plugin installation and management remain available. Worker code is user-trusted and is not an OS sandbox. Status: implemented and verified at source-runtime level; plugin mod hooks and mode instructions are additionally verified through the compiled sidecar's live enable/disable flow.

Assistant contribution contract (separate from the browser CAD/CAM plugin manager):

- `contributes.mods[]` declares `{ id, title, description, entry }` and requires `ai:mod`. The entry is a plain `.js` filename, distinct from the plugin's worker entry. An upload carries its source in `files[entry]`, alongside `manifest` and `source`; missing and undeclared files are refused. Enabled modules are declared to the isolated nikcli host. The panel identifies them as `<pluginId>.<id>`; their lifecycle follows the plugin.
- `contributes.modes[]` declares `{ id, title, description, instructions }` and requires `ai:mode`. Instructions are bounded to 4,000 characters and stay server-side; the picker lists metadata under `<pluginId>:<id>`. Each turn resolves that id against the currently enabled plugins; an absent or disabled id falls back to `general`.
- Mod and mode ids use lowercase letters, digits, underscore and dash, start with a letter and contain at most 40 characters. Titles and descriptions are bounded to 120 and 500 characters. Install is inert; explicit activation persists the grant. Startup loading and contribution readers enforce the same supported-capability checks.

## Worker RPC lifecycle alignment (2026-10-09)

WP9 follow-up: correlate requests and replies, clean timeout/listener resources on interruption, settle all pending calls when a worker closes, guard admission after disposal, and scope Worker termination to the host layer. A post failure is a typed error. Real Worker bootstrap must announce readiness before host sends activation, because top-level asynchronous plugin loading can otherwise drop messages.


Status: in progress. **SDK done** (`packages/plugin-sdk`: capabilities, manifest Schema, context, `definePlugin`, `createTestHost`, `examples/hello-gear`, 26 tests). Host (`apps/sidecar/src/plugins/`) not started — needs WP3 contract and WP4 skeleton.

Legacy reference (behaviour only): `.reference/src/plugins/sdk/` (types, validation, templates, CLI), `.reference/src/plugins/core/{host,registry,api,messaging}/`, `.reference/src/server/storage/DatabasePluginStorage.ts`.

## 1. Model

A plugin is a folder or archive with a `plugin.json` manifest and an ES-module entry. Plugins are **untrusted code**. They run in a sandbox and can only act through a capability-based host API.

```jsonc
// plugin.json (validated by a Schema in plugin-sdk)
{
  "id": "com.example.gear-generator", "name": "Gear Generator", "version": "1.2.0",
  "apiVersion": "1",                    // plugin API major the plugin targets
  "entry": "dist/index.js",
  "capabilities": ["drawing:read", "drawing:write", "toolpath:read", "ui:panel", "storage"],
  "contributes": { "commands": [...], "panels": [...], "postProcessors": [...], "operations": [...] },
  "signature": "…"                      // optional; required for non-local installs (see §4)
}
```

## 2. SDK (`@cadcamfun/plugin-sdk`)

Public, versioned, dependency-light package that plugin authors import.

- Types and Schemas: `PluginManifest`, `Capability`, `PluginContext`, command/panel/operation/post-processor contribution shapes.
- `definePlugin({ activate(ctx) { … } })` helper; `ctx` exposes **only** the capabilities granted: `ctx.drawing` (read/patch via the same command patches as the UI), `ctx.toolpath`, `ctx.storage` (namespaced key-value), `ctx.ui` (register command/panel descriptors — declarative, no DOM access), `ctx.log`.
- `post-processor` contribution = a function `(program: Program, options) => string` using WP2 types, so third parties can add dialects.
- `operation` contribution = `{ schema, generate }` using WP2 types.
- A tiny test harness (`createTestHost`) so authors can unit-test plugins without the app.
- CLI later (not v6.0): `create-plugin` scaffold; templates folder retained as a stretch goal.

## 3. Host (sidecar)

- **Isolation**: each enabled plugin runs in its own Bun `Worker` (decision pending in `00-overview.md` §7; Worker is the recommended default). The worker receives a restricted `ctx` over `postMessage` RPC; no `fs`, no network, no `process`, no dynamic `import` outside its own bundle (enforced by running the entry from a blob URL with a frozen global surface and an allow-listed RPC). Hard limits: wall-clock timeout per call (default 5 s), memory cap via worker `resourceLimits`, call-rate limit.
- **Lifecycle** as an Effect `Layer` + scoped fibers: `install → verify → enable → activate → (calls) → deactivate → disable → uninstall`. Crashing plugins are marked `faulted`, auto-disabled after 3 crashes in 10 minutes, and reported to the UI.
- **Registry**: `PluginRegistryEntry` and `PluginConfiguration` tables (already in the schema) store manifest, state, enabled flag and per-plugin config (validated by the manifest's config Schema). A `PluginRepo` service owns them.
- **Capability enforcement** is in the host, not the plugin: every RPC checks the plugin's granted capabilities; the user approves capabilities at install time (UI in WP6) and can revoke later.
- **HTTP**: the `plugins` group from `05-api-sidecar.md` §2 (list, install from file path, enable/disable, uninstall, config get/put, call command).
- Contributions are merged into the app: commands appear in the command palette, panels as declarative trees rendered by the UI, post-processors/operations are registered into WP2's registries at runtime.

## 4. Trust model

- Local development plugins (installed from a folder, flagged `dev: true`) skip signature checks and show a persistent "dev plugin" badge.
- Packaged plugins must carry an Ed25519 signature over the archive hash; the app ships with a trusted public-key list. Unsigned/unknown-signer plugins can be installed only after an explicit, scary confirmation. (Marketplace is deferred; the same check will apply to it.)

## 5. Testing

- SDK: manifest Schema accepts/rejects fixtures; `createTestHost` round-trips a sample plugin.
- Host: a plugin that tries each forbidden thing (read a file, `fetch`, infinite loop, allocate 1 GB, call a capability it lacks) is contained and reported with a typed error; a well-behaved sample plugin adds an entity via `ctx.drawing` and the change shows up in the drawing repo.
- Lifecycle: crash-loop auto-disable; uninstall removes registry rows and storage namespace.

## 6. Acceptance criteria

- Sample plugin `examples/hello-gear` (in `packages/plugin-sdk/examples/`) installs, adds a command and a post-processor, and both work end to end through the sidecar HTTP API.
- No capability can be exercised without being declared **and** granted.
- `bunx tsc` clean; tests above pass.

## 7. Change log

- 2026-10-16: Documented the mod/mode manifest and upload contracts. The compiled-extension regression exercises plugin mod hooks and contributed mode instructions through the real sidecar executable and a local simulated provider, including withdrawal after disable.

- 2026-10-16: Regression review: install, startup loading, mod declarations and mode listings now share the same supported-capability checks. An enabled manifest refused by the worker loader cannot publish mod code or mode instructions through the file readers. The regression fixture reproduces the former inconsistent admission with an unsupported drawing grant.

- 2026-10-16: The existing Worker host now has authenticated assistant management: validated manifest/index.js bundles install disabled, explicit activation persists consent and refreshes the central tool registry, and disable/removal revoke tools live. Worker execution, capabilities, timeout, persistence and HTTP/DOM flows pass. Only ai:tool is wired to this Worker adapter; browser CAD/CAM plugins retain their existing manager. Native mod actions use the app-owned isolated store and the compatibility/lifecycle gate in WP8. Worker code remains trusted local JavaScript, not an OS sandbox.

- v1: initial spec.
- SDK implemented (`packages/plugin-sdk`):
  - `CAPABILITIES` is a closed list; `effectiveCapabilities` resolves the one
    implication (`drawing:write → drawing:read`) so a grant never needs to repeat
    itself, and the manifest Schema deliberately does **not** cross-check
    capabilities.
  - `PluginManifestSchema` validates reverse-DNS id, semver, `apiVersion: "1"`,
    entry and contributions; `parseManifest` funnels invalid JSON into the same
    error channel as a Schema failure.
  - `PluginContext` exposes `drawing` / `toolpath` / `storage` / `ui` as
    **optional** surfaces: the host only materialises what was granted, and
    `requireCapability` throws the typed `CapabilityError` otherwise.
  - `createTestHost` enforces capabilities like the real host (a mock that grants
    everything would let a plugin pass its tests and fail at install time); it
    also collects commands/panels, namespaces storage per plugin and applies
    drawing patches.
  - `examples/hello-gear` ships `plugin.json` + module and is exercised end to end
    by the tests (command registered, storage written, post-processor turns a
    `Program` into text). The "installed through the sidecar HTTP API" part of §6
    still needs the WP4 host.
- HTTP group (`/api/plugins/*`) implemented in `apps/sidecar/src/http/plugins.ts`. It serves the **legacy browser-side plugin system** (legacy manifest with `main`/`permissions`, zip install, `bootstrap.js`, `serve`) over `PluginRegistryRepo`, with files under `<dataDir>/storage/plugins/<id>/`. It is independent of the worker host above: both use the `PluginRegistryEntry` table and each skips rows whose manifest it cannot decode. Deviations from legacy: unknown plugin → 404 (legacy answered 500 because it never set the error code), duplicate install → 409, invalid manifest → 400, `PUT/PATCH /update` applies `{ manifest, config }` (legacy passed the raw body to a lifecycle that required a package path), and the registry folder is `<dataDir>/plugins-registry`. Still open: exposing the SDK host (`PluginHost`) over HTTP for §6 (`hello-gear` end to end).

Plugin lifecycle failures preserve the typed `reason` and expose the same text as `Error.message`, so rejected promises and UI error boundaries report the closed-host cause rather than an empty error. This changes no plugin capabilities or lifecycle permission checks.

Worker RPC admission is bounded to 64 in-flight requests per plugin. Host disposal settles all outstanding requests immediately, including injected worker implementations that do not emit a crash on termination.
