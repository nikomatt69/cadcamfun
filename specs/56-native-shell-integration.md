# 56 — Native shell integration and Rust-side quality

Status: A–E3 implemented 2026-10-25. Focused verification is recorded in §5; F–H remain open. Owner: WP5 (`apps/desktop/src-tauri`) for
the Rust half, WP6 (`apps/desktop/src/app`) for the webview half, WP10 for CI and signing. Part of [spec 39](39-professional-parity-master-plan.md)
only through §7 (native compute), which waits for [spec 55](55-evidence-performance-qualification.md).

## 1. Origin and method

Four read-only audits of the Rust/Tauri side (plugin inventory, compute offload, sidecar/IPC boundary, build/release/security) were
run on 2026-10-25 against Tauri 2.12.1, tao 0.37.1, wry via `tauri-runtime-wry` 2.12.1. Every claim that decides a phase below was then
**re-checked in the dependency sources** (`~/.cargo/registry`) or in the repo. Where it could not be checked without running the packaged
app, the phase says so. Rules for the whole spec:

- **Additive.** Nothing existing is removed unless the phase proves it unused. The browser path (`!isTauri()`) keeps working.
- **TS stays the oracle** for every kernel (§7). No geometry moves to Rust without parity evidence.
- **Least privilege.** A capability or permission is added only for a feature that calls it, and removed when nothing calls it.

## 2. Verified findings and corrections

| # | Finding | How it was checked | Phase |
|---|---|---|---|
| 1 | **Cmd+Q on macOS bypasses the window close guard.** The predefined Quit item sends `terminate:`; tao 0.37.1 handles only `applicationWillTerminate` (`app_delegate.rs:130`, `AppState::exit`), which cannot be prevented and emits no `ExitRequested`. The webview's `onCloseRequested` flush (`project-session.ts`, `window-guard.ts`) therefore never runs, and `RunEvent::Exit` only signals the sidecar without waiting. | tao + muda sources | A |
| 2 | **Tray "Quit" reaches `ExitRequested`** (`app.exit(0)` → `request_exit` → `ExitRequested{code:Some(0)}`, and `prevent_exit` only ignores the restart code, `tauri/src/app.rs:90`). The graceful sidecar stop in `lib.rs:142` therefore works there. *Correction of audit 3.* What is missing on this path is the **webview flush**: `app.exit` closes no window. | tauri source | A |
| 3 | **Opened files are lost.** Rust emits `open-file` (`lib.rs:22,39,166`) for second launches and macOS `RunEvent::Opened`; nothing in `apps/desktop/src` listens. A cold start emits before the webview listens. `fileAssociations` registers `.cadcam`, `.nc`, `.gcode` (`tauri.conf.json:73`). | grep + code | B |
| 4 | **The sidecar port is baked into the client.** `clientLayer(endpoint)` (`App.tsx:64`) captures `baseUrl`; after a crash-restart on a new port the shell emits `sidecar-status` (`sidecar.rs:495`, payload `{state:"ready",port}`) but nobody listens, so every call and the SSE reconnect (`live-sync.ts`) keep hitting the old port. The token is generated once per app run (`setup`), so only the port changes. | code | C |
| 5 | **Exports are `<a download>` + blob URL at ~17 sites** (`ImportExportDialog.tsx:40`, `ExactModelPanel.tsx`, `drawing-export.ts`, `saved-program.ts`, `ToolpathDetailScreen.tsx`, `setupSheet.ts`, `MultiToolpathGenerator.tsx`, …). The Tauri builder registers no download handler (`tauri-runtime-wry` `pending.download_handler` is `None` unless `on_download` is used), which is the setup in which WKWebView drops blob downloads. **Not run in the packaged app: treated as likely, not proven.** The native commands `pick_file` / `save_file` exist and are granted but have no caller; `save_file` sends the text through JSON IPC and writes non-atomically (`commands.rs:263`). | code + wry | D |
| 6 | The webview imports no `plugin-fs` / `plugin-dialog` (only `api/core`, `api/event`, `api/window`, `plugin-log`, `-notification`, `-os`, `-shell`), yet `capabilities/main.json` grants five `fs:allow-*` on `$APPDATA`/`$DOCUMENT`/`$DOWNLOAD` (including write) and `dialog:default`. The Rust side uses `std::fs` and the dialog crate directly, which need no capability. | grep | E |
| 7 | CSP (`tauri.conf.json:36`) has `'unsafe-eval'` and lacks `object-src`, `base-uri`, `form-action`, `frame-ancestors`. | config | E |
| 8 | The macOS bundle's sidecar (Bun-compiled, 157 MB) is signed `flags=adhoc,runtime` with **no entitlements file**. Hardened runtime without `allow-jit` / `allow-unsigned-executable-memory` can stop a JIT-based binary. **Initial hypothesis only: the existing ad-hoc bundle now passes the isolated smoke (§4); Developer ID notarization remains unverified.** | `codesign -d` + smoke | E (verify) |
| 9 | Not handled at all: macOS App Nap during hidden-window jobs, sleep/wake, a wedged-but-alive sidecar (health is checked only at start; `MAX_RESTARTS = 1`), `panic = "abort"` with no panic hook, no `cargo-deny` / `cargo-audit` in CI. | grep + `Cargo.toml` | F, G |

Audit claims **not adopted**: `opt-level = 3` for the shell (compute lives in the sidecar; the shell is 17 MB of a 177 MB bundle; the audit that
proposed it and the one that rejected it disagreed, the rejection stands); adding `tauri-plugin-store` / `sql` / `stronghold` / `http` /
`websocket` / `upload` / `persisted-scope` / `localhost` / `autostart` / `positioner` (the sidecar and the keyring already own those jobs, and each
adds attack surface or an unauthenticated port); replacing Drizzle; `memmap2` / `notify` (nothing watches files).

## 3. Design

### A. Quit goes through the window (Rust)

One native path, `menu::request_quit(app)`: if the main window exists it is shown, focused and `close()`d. That raises the webview's
`onCloseRequested` (flush of unsaved work with the 8 s budget and the "second request insists" rule of `window-guard.ts`), then the
existing last-window → `ExitRequested{None}` → graceful sidecar stop (`lib.rs`). With no window it falls back to `app.exit(0)`. The
window is shown first because the user may quit from the tray with the window hidden and must see a blocked-save message.
Replaces the predefined Quit item on every platform (a custom item `app.quit`, `CmdOrCtrl+Q`) and the tray's `app.exit(0)`. The decision is a
pure function (`quit_plan`) so it is tested without a window.

### B. Opened files (Rust queue + guarded read + webview router)

- **Rust** `OpenedFiles` state: a FIFO of pending paths and the set of paths the OS delivered. `forward_open_files` always records, then emits
  `open-file`. New commands: `take_opened_files() -> Vec<String>` (drains the queue; the webview calls it once after it is listening, which closes
  the cold-start race) and `read_opened_file(path) -> ipc::Response` (raw bytes). `read_opened_file` serves **only** a path the OS delivered,
  with a registered extension, and at most 64 MiB; it is the replacement for broad `fs` read grants (E). Windows/Linux cold start also reads
  `std::env::args()` in `setup` through the same filter.
- **Webview** `app/open-file.ts`: `classifyOpened(path)` (pure) → `drawing | program | unsupported` by extension; `openDelivered(path, deps)`:
  `.nc`/`.gcode` → compare/save current work with `session.saveAll("flush")` (including edits still inside the autosave debounce), detach the previous saved program and stale kernel/verification context, set the text and go to `/cam`; `.cadcam` → JSON with an `elements` array (the same envelope the import dialog
  reads) → `elementsStore.addElements` and go to `/cad`; anything else or a parse failure → a toast with the reason. Listening starts in the
  shell next to the menu listener; outside Tauri it is a no-op. Unsaved work is never overwritten: a drawing is **added** on the current active layer, and program replacement is refused when current work cannot be saved or changed during the save. External NC never autosaves into the previously opened resource.

### C. The client follows the sidecar (webview)

`app/sidecar.ts` gains `trackSidecarStatus()` (Tauri only): on `{state:"ready",port}` it stores the live base URL and refreshes the cached
endpoint; on other states nothing changes. `followingFetch(endpoint, base = fetch)` is the transport given to `clientLayer` in the desktop
app: a request whose origin is the endpoint the client was built with is re-addressed to the **live** base URL. The Bearer token is unchanged
because it is stable for the app run. Result: calls and the SSE reconnect recover after a restart with no client rebuild. Pure and unit tested
(URL rewriting, ports, non-matching origins untouched).

### D. Native export

`shared/lib/save-file.ts` exposes `saveFile({ name, data, mime })`: in Tauri it calls `save_file` with the **raw bytes** (`invoke(cmd, bytes,
{ headers })`, no JSON copy; the file name travels percent-encoded in `x-file-name`); elsewhere it falls back to the existing anchor download,
so browser dev and tests are unchanged. Rust `save_file` becomes: raw request → save dialog → `validate_save_path` (unchanged) → write to a
temp file in the same directory, `fsync`, `rename` (atomic; a crash never leaves half a G-code file). Returns the chosen path or `None`
on cancel. All download call sites use this helper, including JSON, STL/OBJ/GLTF, STEP, DXF, BOM, NC, portable CAM and drawing SVG/PDF/setup sheets. The narrow `setupSheet.ts` export edit preserves its concurrent title-block changes. Blob URLs for PDF rendering and cursor images remain local rendering resources.

### E. Least privilege and release hygiene (config, no behaviour change)

- Remove the five `fs:allow-*` grants and `dialog:default` from `capabilities/main.json`, drop `tauri-plugin-fs` (crate and `init()`), keeping the
  `dialog` plugin crate (Rust `app.dialog()` uses it). A Bun lint test (`scripts/tauri-config.test.ts`) fails if a capability grants `fs:*`
  or `dialog:*` again without a matching JS import, if a `build.rs` command lacks its `allow-…` permission, or if a command is missing
  from `generate_handler!`.
- CSP: append `object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. **Not changed** until measured: dropping
  `'unsafe-eval'` and `freezePrototype: true` (they can break the 3D viewport, the AI chat or the code-mode runtime; bisect in a real app run).
- macOS entitlements: first run the signed bundle's sidecar with `scripts/smoke-sidecar.ts --binary <bundle>/Contents/MacOS/sidecar`. If it
  fails under the hardened runtime, add `Entitlements.plist` (`com.apple.security.cs.allow-jit`, `…allow-unsigned-executable-memory`) and
  `bundle.macOS.entitlements`; if it passes, record that and keep the file out. The result is written in §4.

### E2. Native clipboard (owner request, 2026-10-25)

Add `tauri-plugin-clipboard-manager` with only `clipboard-manager:allow-write-text`, register it in Rust, and share a `copyText`
helper across copy buttons. Browser mode continues to use `navigator.clipboard.writeText`. No clipboard read/image/history access. Notifications are narrowed to the installed bridge's three calls: `notification:allow-is-permission-granted`, `notification:allow-request-permission` and `notification:allow-notify`.
The owner explicitly requested useful native plugins while integration was in progress; clipboard supports current copy actions,
while the separately reviewed production reload guard is specified in E3. Process/store/sql/http/deep-link/global-shortcut remain unnecessary for the existing feature set.

### E3. Prevent accidental production reloads (owner request, 2026-10-25)

The community catalog review identifies `tauri-plugin-prevent-default` as useful for this editor shell. Integrate a compatible
pinned release with **only `Flags::RELOAD` in production**. Development reloads keep working. Do not use its blanket defaults:
Shift+Tab focus traversal, native/custom context menus, find, print and editing shortcuts must remain available. This plugin
injects an initialization script and needs no frontend IPC capability. Existing close/autosave guards remain authoritative.

### F. Process supervision (open)

(1) Rust pings `/health` every 10–15 s after `Ready`; three misses with a generous threshold → the existing stop/restart path; the restart
budget replenishes (one per 10 min of healthy time) instead of the hard `MAX_RESTARTS = 1`. (2) `NSProcessInfo.beginActivity(userInitiated)`
around CAM/kernel jobs (a Rust command + `cam.progress` listener) and a wake handler that re-probes `/health`. (3) Dock/taskbar progress via
`window.setProgressBar` / `setBadgeCount` (needs `core:window:allow-set-progress-bar`, `allow-set-badge-count`). (4) A pidfile in the data dir
so a wedged sidecar left by a crashed shell is refused/killed before the next spawn. Each process-lifecycle change needs a test on the stub sidecar; native power and progress integration also needs a platform smoke test.

### G. Quality gates (open)

`cargo-deny` (`deny.toml`: advisories, licences, bans, duplicate warnings; the licence list also feeds `THIRD_PARTY_NOTICES.md`) and
`cargo-audit` as CI jobs, non-blocking at first; a `std::panic::set_hook` that logs location and message before the abort; dev profile
`debug = "line-tables-only"`, `[profile.dev.package."*"] opt-level = 2`; a `rust-toolchain.toml` and an MSRV that matches the tree
(`rust-version = "1.77"` is stale); `timestampUrl` over https; an integration test that spawns the stub sidecar through the ready handshake.

### H. Larger boundary work (deferred, needs its own spec)

A Rust-owned `cadcam://` URI scheme that proxies to the sidecar (removes CORS and the token in JS, survives port changes, but does not stream);
a Rust SSE consumer feeding an `ipc::Channel` (keeps the stream alive while the window is hidden); binary framing (CGE1/CEL1 style) for
meshes and G-code with optional zstd. Cost L, medium risk, every call path affected: only behind a flag with the current path as fallback and only
after C has been in use.

## 4. Status

Integration ownership: this spec authorizes WP5 native commands/configuration, WP6 `src/app`, `src/shared/lib/save-file.ts`,
`src/i18n/en.shell.json`, `src/shared/lib/clipboard.ts`, clipboard callers and dependencies, desktop regression tests, and WP10 `scripts/tauri-config.test.ts`. Native export conversion also owns the
export functions in otherwise clean CAD/CAM/toolpath feature files; foreign edits are preserved and remaining sites are listed here.
No commit is required. F–H and native compute remain explicitly deferred.


| Phase | State |
|---|---|
| A quit via window | implemented; native menu and Rust checks pass |
| B opened files | implemented; cold-start, malformed input, bounded read and editor routing tests pass |
| C follow the sidecar | implemented; an existing typed client follows a new port, preserving auth/body/cancellation |
| D native export | helper, raw/atomic `save_file` and all download sites integrated; fallback/cancellation/failure/concurrency tests pass |
| E least privilege, CSP additions | implemented; configuration tests pass; ad-hoc bundle sidecar smoke passes |
| E2 native clipboard | implemented; all 8 callers use native write-only transport with browser fallback |
| E3 production reload protection | implemented in release only; plugin-generated script regression and native checks pass |
| F supervision, G gates, H boundary | open |

Entitlements verification: the existing ad-hoc signed hardened-runtime bundle sidecar started with no entitlements, reached ready in
1473.6 ms, completed `cad.parametric_test` with `accepted: true`, and shut down in 62.4 ms with exit 0. Run used temporary data and
AI offline. No entitlement file was added. This verifies that existing binary only, not a Developer ID/notarized release or the newly
compiled shell. New shell behavior is covered by Rust/frontend checks; packaged OS file association and native dialog interaction
still require a platform smoke test.

Dependency compatibility: `cargo metadata --locked --offline --filter-platform aarch64-apple-darwin` reports maximum declared host
MSRV 1.90 (Tauri and clipboard plugin). The shell manifest now declares 1.90 rather than 1.77; the installed compiler is 1.96.

## 5. Tests (definition of done for A–E3)

Latest focused verification (2026-10-25):

- `cargo test --locked --offline --all-features --jobs 2`: 94 unit tests pass, native menu harness passes; two existing tests remain
  ignored (real OS keychain and compiled real-binary parent contract).
- `cargo clippy --locked --offline --all-targets --all-features --jobs 2 -- -D warnings` and `cargo fmt --check`: pass.
- Native frontend/configuration/editor regression selection: 83 tests pass, including current typed client port recovery, raw export,
  cancellation/failure behavior, clipboard, queued OS delivery and preservation/detachment of saved programs on external NC open.
- `bun --no-env-file check -p apps/desktop/tsconfig.json`: pass (API reference regenerated first); API reference `--check`: pass.
- Frontend production build passed again after async export-dialog refinements (`vite build`, 7m 34s under concurrent load). Existing chunk-size, dependency annotation and browser externalization warnings remain; no build errors.
- One broader run initially hit a sandbox socket restriction and was rerun with the required approval. A save-dialog wait timed out
  under concurrent build load, passed in isolation, and now has the same 30-second integration budget as the surrounding actions.
  The final focused 83-test run passes under concurrent build load.


- Rust: `quit_plan` cases; `OpenedFiles` (queue drains once, only delivered paths readable, extension and size limits, symlink to a foreign
  file refused); `save_file` atomic write (temp file renamed, failed validation leaves no file, existing file replaced whole); percent-decode;
  `cargo clippy --all-targets -D warnings` and `cargo fmt --check` as in CI (`.github/workflows/ci.yml:182`).
- Webview (bun): `classifyOpened`, `openDelivered` with fakes (G-code, drawing JSON, invalid JSON, unsupported), `followingFetch` rewriting,
  `saveFile` fallback outside Tauri and raw-bytes call inside it.
- Config: `scripts/tauri-config.test.ts` (capabilities, handler list, CSP directives); native reload prevention tests inspect the plugin-generated initialization script and ensure normal editor/focus/context-menu shortcuts remain enabled.

## 6. Not in scope

Anything that changes document or kernel behaviour; `tauri-plugin-deep-link` and `global-shortcut` (no cloud/share feature
needs them yet); `tauri-plugin-process` (the custom `restart_app` covers it).

## 7. Native compute (the Rust acceleration question)

Allowed only as an Adapter behind a measured hot seam, per [spec 29](29-native-cam-kernel.md) §11 and [spec 36](36-native-edge-and-gpu.md) §7:
TS stays the default and the oracle, flag `CADCAMFUN_NATIVE=off|ops|all`, byte-comparing differential tests, a licence and six-target
release review. The seam is `KERNEL_JOBS` (`packages/ai/src/kernel-jobs.ts:90`) with its deadline, cancel, cache and single-flight. Kernel
closures (`CuttingProfile.profile`, the `value()` callbacks of `surface-field.ts`) must become data (a tabulated cutter profile) before they can cross.

1. **Measure first**: `bun run bench` of spec 55 §3 does not exist yet; without it no number below is a claim. Build it before any Rust.
2. **Parity harness first**: `packages/core/test/parity/` runs each op through TS and the adapter, comparing `Float64Array`s bitwise (items 1–2), by
   area / Hausdorff (item 4) and with the milling fingerprints; a mismatch disables that op through the flag.
3. Candidates in order: height-field stock removal and replay (`verify/heightfield.ts:70`, `kernel/execute.ts`, per-column `min` and `sqrt`, can be
   bit-identical; compute `removed` as initial minus final height because the sum is order dependent); drop-cutter grid sampling
   (`surface-field.ts:99,200`, cap `MAX_SURFACE_SAMPLES` = 80 M, about two minutes by the code's own comment; batch API `tipGrid`); the print
   vocabulary of the G-code replay (`print/verify.ts`, 1 M moves = 1.5 s, a 125 MB program 95 s). Shape: WASM in the kernel worker first (the CSP already
   allows `wasm-unsafe-eval`; all six targets, no signing change), a napi / edge binary only if threads are needed.
4. Deferred until measured and until the byte-golden G-code policy is decided: 2D offset (`i_overlay`, joins differ), mesh Boolean (the manifold WASM
   build; truth moves to B-rep, spec 40).
5. **Stays in TS**: B-rep Boolean / tessellation / intersection (`truck` is immature, `opencascade-rs` is LGPL and fights persistent naming,
   spec 41), machine collision, drawing hidden-line removal, STL import / weld.
6. **Spec amendment required before work starts**: spec 36 §7.6 and RM-09 say "no geometry in Rust". Height-field and drop-cutter rasters are numeric bulk
   work; the wording must say so explicitly (CLAUDE.md: cross-WP changes go through the specs first).

## 8. Catalog review (2026-10-25, three parallel reviewers)

Reviewed the [official catalog](https://v2.tauri.app/plugin/), its community sections, and the
[official plugins workspace](https://github.com/tauri-apps/plugins-workspace), then checked primary manifests, permission definitions
and the installed locked packages. Catalog inclusion alone does not establish Tauri v2 compatibility.

- Integrated: official clipboard-manager (text write only) and narrowly configured community prevent-default (E3).
- Reuse before adding crates: installed Opener for revealing completed exports, and Notifications for long CAM completion; these
  are follow-up UI features, not new plugin requirements.
- Conditional features: official global-shortcut for optional window activation; autostart for an opted-in companion host;
  deep-link for validated project/auth routes. No unused capabilities are granted for those future features.
- [Tauri Specta](https://docs.rs/tauri-specta/2.0.0-rc.26/tauri_specta/) is a promising binding generator, not a plugin requiring
  runtime permissions. Exact RC pins and separate validation of raw IPC are required before migration.
- [CrabNebula DevTools](https://v2.tauri.app/develop/debug/crabnebula-devtools/) is a possible opt-in development profiler;
  it can capture secret command payloads/responses and conflicts with some loggers. Use isolated fixtures before adoption.
- [MCP bridge](https://github.com/hypothesi/mcp-server-tauri) requires its own debug integration and newer compatible Tauri patch;
  its broad execution permissions and default network binding are unsuitable for production capabilities.
- [nosleep in the catalog](https://github.com/pevers/tauri-plugin-nosleep/blob/main/Cargo.toml) still depends on Tauri 1 RC;
  reject it for this Tauri 2 shell. Process supervision/App Nap remains phase F.
- Community tracing overlaps native log/sidecar telemetry; dragout needs published API and platform verification; Sentry needs
  explicit diagnostics/privacy configuration. None is enabled implicitly in this integration.

## 9. Change log

- 2026-10-25: continued the interrupted integration; completed OS file delivery, guarded quit, sidecar port following, atomic raw-byte
  exports and browser fallbacks. Fixed concurrent temp-file collisions and bounded reads while preserving concurrent work.
- 2026-10-25: added write-only native clipboard at the owner's request; audited capabilities/configuration, strengthened CSP without
  breaking dynamic local scripts, corrected capability schema paths and declared Rust MSRV. Verified existing signed bundle sidecar.
- 2026-10-25: reviewed official/community catalogs with three parallel tasks; integrated selective production reload protection with a generated-script regression test; narrowed notification permissions to the actual bridge calls.
