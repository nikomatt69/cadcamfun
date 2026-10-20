# WP5 — Tauri shell (`apps/desktop/src-tauri`)

## IPC alignment (2026-10-09)

WP5 hardening follows `23-ai-runtime-architecture.md`: bound forced-kill reaping, report unreaped children and suppress restart in that state; move synchronous keychain/path work off async/UI threads; remove blocking waits from the final native exit callback. Keep the 60-second readiness consistent with current code. WP10 updater changes are specified in `10-release-sync.md` before implementation.


Status: **M1 done, most of M2 done; lifecycle hardening and native preview preparation implemented** (see section 7; viewport callers are wired after the owner requested end-to-end integration; the real-binary graceful-shutdown test stays ignored until it can run in CI). Owner dir: `apps/desktop/src-tauri`. Updater wiring is shared with WP10 (WP10 edits only `tauri.conf.json` updater section and `src/updater.rs`).

Tauri v2, Rust 1.96 (installed). Use the Bun-installed CLI: `bunx tauri …` from `apps/desktop` (`@tauri-apps/cli`, `@tauri-apps/api`). No `cargo install tauri-cli`.

## 1. Responsibilities (keep the Rust small)

1. **Sidecar lifecycle** — spawn the Bun-compiled sidecar (`tauri-plugin-shell`, `externalBin: ["binaries/sidecar"]`), generate a 32-byte random token, pass `CADCAMFUN_TOKEN`, `CADCAMFUN_DATA_DIR` (Tauri `app_data_dir`), `CADCAMFUN_MIGRATIONS_DIR` (bundled resource). Parse the `{"event":"ready","port":N}` stdout line (timeout 60 s). Restart once on crash unless shutting down, then surface an error event to the webview. On exit send `{"event":"shutdown"}\n` on stdin, wait up to 2 seconds before kill fallback, and wait for process reaping before exit; stdin EOF remains the parent-death fallback.
2. **Commands exposed to the webview** (`#[tauri::command]`): `get_sidecar_endpoint() -> { baseUrl, token }`, `get_logs_dir()`, `open_path(path)`, `secret_get/secret_set/secret_delete(key)`, `pick_file(filters)`, `save_file(defaultName, contents)`.
3. **Secure storage** — OS keychain via the `keyring` crate (macOS Keychain, Windows Credential Manager, Secret Service on Linux) for AI API keys and (later) tokens; service name `com.cadcamfun.app`. Never store secrets in the SQLite DB or in plain files.
4. **Native menus** (File: New, Open, Save, Export G-code, Quit; Edit: Undo/Redo/Cut/Copy/Paste/Select all; View: zoom, view presets, toggle panels, devtools in debug; Window; Help) emitting `menu` events to the webview with stable ids (`file.new`, `view.zoom_in`, …); the UI maps ids to commands.
5. **System tray** — Show/Hide, Recent projects, Quit; app keeps the sidecar alive while hidden.
6. **File associations & deep links** — register `.cadcam` (project export) and `.nc`/`.gcode`; handle open-file events by forwarding the path to the webview. Single-instance plugin so a second launch focuses the existing window.
7. **Updater** (WP10) — `tauri-plugin-updater` with signature verification; check every 4 hours and at launch; critical updates flagged in the manifest force the prompt.

## 2. Security configuration

- `tauri.conf.json` CSP: `default-src 'self'; connect-src 'self' http://127.0.0.1:* ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:`. **No** `unsafe-eval`, no remote hosts in v6.0 (the old CSP allowed `cadcam.fun` and `unsafe-eval`; do not carry that over).
- Capabilities (Tauri v2 permissions) granted to the main window only: `core:default`, `shell:allow-spawn` scoped to the sidecar, `dialog:default`, `fs:allow-read/write` scoped to `$APPDATA/**`, `$DOCUMENT/**`, `$DOWNLOAD/**`, plus the custom commands above. No wildcard `fs` scope on `$HOME/**` (the old config used it).
- The token never touches disk or logs; log redaction for any line containing `Bearer`.

## 3. Project layout

```
apps/desktop/src-tauri/
  Cargo.toml  build.rs  tauri.conf.json  capabilities/main.json  icons/  binaries/ (gitignored, filled by sidecar build)
  src/main.rs  lib.rs  sidecar.rs  commands.rs  secrets.rs  menu.rs  tray.rs  updater.rs
```

Icons: generate from `public/icon.png` (`bunx tauri icon public/icon.png`). Bundle identifier `com.cadcamfun.app`, product name `CADCAM FUN`.

## 4. Milestones

- **M1 (skeleton, can start immediately in wave 1)**: window loads the Vite dev URL; `get_sidecar_endpoint` returns a **stub** endpoint from a tiny Bun script that implements `/health`; sidecar spawn/ready-line/kill logic complete with Rust unit tests for the stdout parser.
- **M2**: real sidecar binary integrated (after WP4), menus, tray, secrets, file associations.
- **M3**: updater, signing/notarisation config (WP10).

## 5. Acceptance criteria

- `bunx tauri dev` opens the app on macOS; the UI shows sidecar status "ready"; closing the window leaves **no** orphan sidecar process (check with `pgrep`).
- `cargo clippy -- -D warnings` and `cargo test` pass in `src-tauri`.
- `bunx tauri build` produces a `.app`/`.dmg` on macOS containing the sidecar binary and migrations resource.
- Secrets round-trip through the keychain on macOS; the commands return typed errors, never panic.

## Rust output throughput (2026-10-20)

Owner-requested scope: WP5 Rust only, independent of the concurrent buffer/WebGPU work.
Deepen the existing sidecar output module instead of adding a hypothetical process adapter.
The interface remains `LineBuffer::push`: arbitrary raw byte chunks yield complete UTF-8-lossy
lines; incomplete lines stay bounded to 16 KiB; an oversized line is discarded through its
next newline; CRLF, empty lines, ready-line handoff, credential redaction and process reaping
keep their existing semantics. Scan newline-delimited slices and copy each slice in bulk.
Complete lines in a chunk should not first be copied into `pending`.

Verification: differential framing tests, the existing Rust suite and Clippy, plus an isolated
optimized microbenchmark against the Git baseline. The benchmark reports paired p50/p95 on
the same host, covers fragmented output and oversized lines, and does not claim an FPS or
end-to-end CAD/CAM gain. No new Rust dependency, renderer or IPC protocol is required.
The existing release profile remains unchanged: shell logging measurements do not justify
changing code-generation settings for the whole desktop application.

### Shared viewport preparation

Expose `prepare_viewport_edges` as an additive, raw-byte Tauri command for the CADCanvas
and ToolpathVisualizer integration owners. This is display-only feature-edge extraction,
matching the installed Three.js r180 `EdgesGeometry`; it never changes CAD solids, CAM moves,
units, normals, picking identifiers or export data. The command runs on `spawn_blocking`,
admits at most one job, has input/triangle limits and a cooperative deadline, and returns a
typed error on unsupported data or overload. Callers retain their existing Three.js path
as fallback and must ignore results after geometry disposal/replacement. The owner's follow-up
request to regenerate and connect everything authorizes narrow WP6 integration in the shared
display-edge adapter, CAD factory/canvas invalidation and CAM mesh installation. Existing API
clients are regenerated from the contract; no additional HTTP geometry route is needed.
There is no automatic renderer switch. The separate native kernel executable
chosen in spec 36 remains a later increment; this small preview helper adds no process or crate.

Wire contract: request `CGE1`, little-endian u32 vertex count at 4, u32 index count at 8,
f64 threshold angle in degrees at 12, zero u32 flags at 20, followed by xyz f32 positions
and optional u32 triangle indices. No indices means non-indexed triangles. Response `CEL1`,
u32 line-vertex count at 4, followed by xyz f32 endpoints. Degrees are confined to this
Three.js display interface; the CAD/CAM kernel is untouched. Exact byte length is checked.
All coordinates must be finite and quantizable to safe integers at Three.js's 1e-4 weld
precision. Output must agree byte-for-byte with Three.js on the regression corpus, including
degenerate, duplicate, non-manifold, reversed and non-indexed faces.

## 6. Change log

- 2026-10-20: Follow-up connected the shared native display adapter to CADCanvas and View3D/ToolpathVisualizer,
  with existing thresholds, browser/small-mesh fallback, single invalidation and disposal cancellation.
  Regenerated both API clients (289 Promise / 294 Effect operations), completed packed-playback consumers
  and fixed precision loss with version-2 double-precision playback sections (GPU buffers remain f32).
  Rust validation: fmt/clippy passed; 72 tests passed, two existing opt-in tests ignored.
- 2026-10-20: Owner narrowed this session to Rust/Tauri while another session owns buffer/WebGPU and viewport edits.
  Added bounded raw-IPC `prepare_viewport_edges`, the main-window permission/registration and a guest adapter for
  CADCanvas/ToolpathVisualizer integration. Display edge output matches installed Three.js r180 byte-for-byte on
  50 cases (250 successful runs); an isolated allocation counter returns to baseline after successes, partial-work
  failures and 10,000 malformed requests. No new crate/plugin or kernel/renderer change. Added repeatable source-level
  framing benchmarks; process-output framing uses bulk slices with a small-fragment path, and log severity parsing
  validates metadata without retaining its JSON tree. Memory review and plugin decisions are recorded in
  `apps/desktop/src-tauri/benches/README.md`. These checks do not prove WebView/GPU leak freedom or viewport FPS gains.
- v4 focused lifecycle: shell now sends exactly `{"event":"shutdown"}\n` on stdin and gives the child up to 2 seconds to exit before force-kill. It waits for the plugin's process wait/reap notification before allowing exit or restart; shutdown suppresses restart. Raw-byte newline decoding is stateful, bounded to 16 KiB per incomplete line, and survives the ready-to-monitor handoff; errors and logs are redacted before publication. Real-binary graceful shutdown is not verified by this work (the integration test remains ignored).
- v3 (superseded by v4): the interrupted implementation used `{"command":"shutdown"}\n` and a 5-second grace period, with plugin process wait/reap coordination and stdin EOF as the parent-death fallback.
- v1: initial spec.
- v2: M1 implemented and verified on macOS with a stub sidecar; menu, tray, secrets, dialogs, single-instance and open-file forwarding implemented (M2 minus real sidecar and bundling). Placeholder UI is SolidJS (`solid-js` + `vite-plugin-solid`). Added section 7 (status, deviations, open items).

## 7. Status

Focused lifecycle checks: `cargo fmt --check`, `cargo test` (60 passed, 2 ignored: OS keychain and real-binary parent contract), and `cargo clippy --all-targets -- -D warnings` passed on macOS. Native UI, packaged builds and the real-binary graceful drain were not run in this pass.

### Done and verified (macOS, `bunx tauri dev` with the stub sidecar)

- `src-tauri/`: `Cargo.toml`, `build.rs`, `tauri.conf.json` (strict CSP, no `unsafe-eval`, `devCsp` only adds localhost and `unsafe-inline` scripts for Vite), `capabilities/main.json` (scoped fs, scoped `shell:allow-spawn`, one permission per custom command), icons generated from `public/icon.png`.
- `sidecar.rs`: spawn through `tauri-plugin-shell`, 32-byte hex token per launch, env `CADCAMFUN_TOKEN/DATA_DIR/MIGRATIONS_DIR`, bounded raw-byte ready-line decoder, 60 s ready timeout, restart once unless shutting down, graceful stdin shutdown with a 2-second kill fallback and process-reap coordination. Logs, process errors and failure status messages redact credential markers or the token. State changes are emitted as the `sidecar-status` event (`{state: starting|ready|restarting|failed, ...}`); `get_sidecar_endpoint` waits for ready. The decoder/lifecycle changes are covered by Rust unit tests, not a new native UI smoke test.
- `commands.rs`, `secrets.rs`, `menu.rs`, `tray.rs`, `lib.rs`: all commands from section 1, plus `set_recent_projects(projects)` (rebuilds the tray "Recent projects" submenu; items emit `menu` with id `tray.recent.<projectId>`). Menu ids: `file.new|open|save|export_gcode`, `view.zoom_in|zoom_out|zoom_fit|preset_top|preset_front|preset_right|preset_iso|toggle_left_panel|toggle_right_panel|toggle_console`, `help.documentation|open_logs`. `open-file` event carries paths of `.cadcam/.nc/.gcode` from launch args (single-instance) and macOS open-file events.
- Stub: `src-tauri/stub/stub-sidecar.ts`, built by `bun apps/desktop/scripts/build-stub-sidecar.ts [--if-missing]` into `src-tauri/binaries/sidecar-<triple>`; hooks `STUB_NO_READY=1`, `STUB_CRASH_AFTER_MS=n`. `tauri:dev` builds it only if no binary exists, so the real sidecar is never overwritten.
- Verified: window shows "Sidecar: ready ... stub:true"; killing the sidecar once restarts it (new port, UI refreshes via event), a second kill yields `failed`; cmd+Q leaves no sidecar; `kill -9` of the shell leaves no sidecar (stdin EOF); keychain round trip passes (`cargo test -- --ignored`).

### Deviations

- Closing the window quits the app (acceptance criterion: no orphan). The tray Show/Hide hides the window but the sidecar stays alive; "hide on close" is a possible M2 setting.
- Shutdown requests a graceful drain over stdin (`{"event":"shutdown"}\n`); `CommandChild::kill` remains the fallback after 2 seconds. The WP4 sidecar now honours that command, stdin EOF and `SIGTERM`/`SIGINT`, cancelling its stdin reader so the process can exit and running the database checkpoint/close finalizers; this is verified by `apps/sidecar/test/process.test.ts` (three real-process modes, WAL drained, data persisted across restart). Driving the drain through the Rust shell with the compiled binary is still covered only by the ignored real-binary test.
- Custom commands are opt-in per capability (`AppManifest::commands` in `build.rs`); new commands need an `allow-<name>` entry in `capabilities/main.json`.
- `shell:allow-spawn` is granted to the webview per section 2 although only Rust spawns the sidecar; it can be removed without code changes if the UI never needs it.
- `open_path` only opens existing files under `$APPDATA`, the log dir, `$DOCUMENT`, `$DOWNLOAD`, `$DESKTOP`, and refuses executable types.
- `keyring` is pinned to 3.6 (4.x split into per-platform crates); Tauri crates are the 2.x line (3.0 alpha exists on crates.io).
- `build.rs` needs `binaries/sidecar-<triple>` to exist even for `cargo clippy/test`: run `bun apps/desktop/scripts/build-stub-sidecar.ts` first.
- WP10's `updater.rs` and plugin registration are present. Updater, configuration and resources were not changed or integration-verified during this focused lifecycle work.

### Left for M2/M3

- Real sidecar binary, `bunx tauri build` (.app/.dmg) containing sidecar and migrations (resource mapping `packages/db/drizzle/` to `migrations/` is configured but unbuilt), file-association behaviour on a packaged build, tray/menu interaction (built, not clicked headlessly), Windows/Linux keychain backends untested.
- M3: packaged updater verification and signing/notarisation remain outside this lifecycle verification.

## Window material, plugins and distribution notes

- **Plugins in the shell:** `tauri-plugin-liquid-glass` (macOS 26 `NSGlassEffectView`, vibrancy on older macOS, no-op on Windows and Linux), `tauri-plugin-window-state` (size, position and maximised state saved on exit and restored on launch; checked on the real app), `tauri-plugin-os` (the UI asks the platform before asking for the material) and the existing log, dialog, fs, opener, shell, updater and single-instance plugins. Permissions are in `capabilities/main.json`; `tauri-build` validates them at build time.
- **Glass:** `tauri.conf.json` has `macOSPrivateApi: true` and a transparent `main` window (no opaque `backgroundColor`). The UI sets `<html data-glass>` after the plugin accepted the effect (`app/glass.ts`), the setting `glass` (Settings > Language) turns it off again, and `styles/glass.css` only applies under that attribute.
- **Mac App Store:** both `macOSPrivateApi` (needed for a transparent window) and the plugin use private Apple API, which App Store review can reject. The plugin is the cargo feature `liquid-glass` (default on) with its own capability file `capabilities/glass.json`, listed in `app.security.capabilities` of `tauri.conf.json`. An App Store build is made like this (checked: the shell compiles this way): `cargo build --no-default-features`, remove `"macos-private-api"` from the `tauri` dependency line in `Cargo.toml` (`tauri-build` reads that line, so it cannot be switched by a feature), and use `tauri.appstore.conf.json` (`macOSPrivateApi: false`, opaque `main` window, only the `main` capability). The UI already degrades to opaque surfaces when the plugin is missing or fails. Direct distribution (the current release channel, with the updater) is not affected.
- **Webview log:** the webview's console and uncaught errors are forwarded to the shell log (`[webview]` lines next to `[sidecar]`).


Effect sidecar log records are single-line JSON on stderr. The supervisor reads `level` and preserves INFO/WARN/ERROR severity, with the existing token redaction applied before native publication. Unknown stderr remains WARN.
