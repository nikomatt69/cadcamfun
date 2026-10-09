# WP10 — Updates, packaging, CI, (deferred) sync

## Rust updater lifecycle alignment (2026-10-09)

WP10 follow-up: register and retrieve the same updater state type, bound/coalesce check requests, run checks serially in an async task, stop the task on application exit, check unsaved work before consuming pending updates, bound the network recheck and enforce the announced version before install. Installation errors retain the pending announcement for retry.


Status: packaging scripts and workflow validation implemented; signed cross-platform release acceptance remains unverified and blocked by owner-supplied signing configuration. This follow-up owns only `.github/workflows/`, `scripts/`, and the Tauri resources mapping. Updater runtime and database backup behaviour remain owned by their existing agents and are not verified here.

Legacy reference: `.reference/.github/workflows/desktop-build.yml`, `.reference/scripts/{build-desktop.sh,build-macos.sh,build-windows.bat,build-linux.sh}`, README "Auto-Updates" and "Distribution" sections.

## 1. Build pipeline

One reproducible script `scripts/build.ts` (Bun, not shell) run locally and in CI:

1. `bun install --frozen-lockfile`
2. `bun run typecheck && bun test packages apps`
3. Compile the sidecar for the host target triple into `apps/desktop/src-tauri/binaries/sidecar-<triple>` (`bun build --compile`; see `05-api-sidecar.md` §3).
4. Copy `packages/db/drizzle/` into `apps/desktop/src-tauri/resources/migrations/`.
5. `bun run --filter @cadcamfun/desktop build` (Vite) then `bunx tauri build`.
6. Emit SHA-256 checksums and a release-notes file from commit messages since the last tag.

Explicit target triples are passed to both Bun and Tauri. Rust `x86_64` maps to Bun `x64`; `aarch64` stays `aarch64`. Bundles are collected only from `<cargo-target-dir>/<triple>/release/bundle`, with the default Cargo directory under `src-tauri`. The output directory must be empty and outside the bundle tree. Installers and signatures are copied with deterministic flat names `<triple>--<original-basename>`; checksums use these exact copied names. Migration resources map `resources/migrations/` to runtime `migrations/`.

Scripts must fail fast, print each step, and never read `.env*`.

## 2. CI (GitHub Actions)

- `ci.yml` on PR/push: ubuntu runs install + typecheck + tests (including `cargo clippy`, `cargo test` for `src-tauri`); caches Bun and Cargo.
- `release.yml` on tag `v*`: matrix macOS (arm64 + x64), Windows x64, Linux x64 → build, sign, notarise, upload to a draft GitHub Release, generate the updater manifest.
- Linux packages `.deb`, `.rpm`, `.AppImage`; macOS `.dmg` (universal via two builds + `lipo`, or separate artefacts — decide and record here); Windows `.msi` + NSIS `.exe`.
- macOS uses separate arm64 and x64 installers, not a universal binary. Modern Tauri updater assets are `.app.tar.gz`, `.AppImage`, and NSIS `.exe`, with sibling `.sig` files.
- Manual releases require an existing `v`-prefixed tag input. The gate checks out that tag, installs Bun, verifies the checked-out commit and configured app version, and outputs immutable SHA/version/date metadata. Secret-bearing builds depend on this gate; branch pushes and fork release workflows are excluded. Windows imports the owner-provided certificate, passes its thumbprint to Tauri signing configuration, then removes it even on failure. No secret appears in an `if` expression.
- `updater-manifest.ts` validates object shapes and consistent version/date/notes, rejects duplicate platforms, and requires all four platform keys when merging. `stage-release.ts` checks each downloaded target's checksums, rejects unexpected/duplicate files, compares notes and signatures, verifies exact release URLs against copied assets, and stages one flat draft asset set with a combined `SHA256SUMS`. Published releases are not modified by a rerun. The release remains a draft until the owner verifies and publishes it; draft assets are not an active updater feed.
- Required secrets (names only, set by the owner in GitHub): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`. Workflows must not echo them and must not run on forks' PRs with secrets.

## 3. Auto-update

- `tauri-plugin-updater` with a static JSON manifest (`latest.json`) hosted on GitHub Releases (no custom server in v6.0; the old `api.cadcamfun.xyz/updates/check` endpoint is dropped unless open question 1 resolves otherwise).
- Signature verification mandatory (Tauri updater key pair); the public key is committed in `tauri.conf.json`, the private key only in CI secrets.
- Behaviour: check at launch and every 4 hours; show a non-blocking prompt with release notes; download progress events forwarded to the webview; "critical" flag in the manifest forces the prompt and blocks dismissal until applied; never interrupt an unsaved editor session (UI defers install until safe).
- Rollback: keep the previous installer link in the release notes; the sidecar's migrations are forward-only, so every release states whether a downgrade is safe.

## 4. Data safety on upgrade

- Before applying migrations, the sidecar copies `cadcamfun.db` to `<dataDir>/backups/cadcamfun-<yyyymmdd-hhmmss>-pre-migrate.db` (keep the last 5). Failure to back up aborts the migration with a typed error shown by the shell.
- Migration failures leave the original DB untouched (apply inside a transaction; test with a deliberately broken migration).

## 5. Deferred: sync

Offline-first with optional cloud sync is in the README but out of scope for v6.0. Constraints to honour now so it stays possible later: every synced row has a stable string id (already `uuid`), `updatedAt` on all mutable tables (already present), soft-delete is **not** used yet (add a `deletedAt` migration when sync starts), and writes go through repositories so a change-log hook can be added in one place.

## 6. Acceptance criteria

- `bun scripts/build.ts` on a clean macOS checkout produces a runnable `.app` and `.dmg`.
- CI green on a PR; a tagged dry-run produces draft release artefacts and a valid `latest.json` (signature verifies with the public key).
- The pre-migration backup is created and restorable (test).

### Verification recorded for this follow-up

- `bun --no-env-file test scripts`: final run reports 19 passing tests, zero failures, including pure mapping/gate/manifest/checksum regression tests and a four-target filesystem staging fixture with tamper detection (Bun also matches package script tests).
- `bunx --no-env-file tsc -p tsconfig.json`: passes without editing root configuration or other WPs.
- `actionlint .github/workflows/ci.yml .github/workflows/release.yml`: passes.
- Full build dry-run for `x86_64-apple-darwin`: passes and selects `bun-darwin-x64` and the target-specific bundle directory without signing credentials or writes.
- Not run: actual signed installers, notarization, GitHub publication, updater signature verification with a real key, runtime update flow, or backup/rollback acceptance. The committed updater key is still a placeholder; real bundling fails closed until the owner configures it and supplies the required secrets. No signing key was generated or invented.

## 7. Change log

- v1: initial spec.
- 2026-10-05: completed interrupted packaging follow-up: explicit architecture mapping and target paths, flat copied artifacts/checksums, tag/manual release gate, certificate thumbprint wiring, strict manifest merge and verified draft staging, helper/integration tests. Resource mapping now matches staged migrations. Root and other-WP sources unchanged; release acceptance is pending credentials and platform builds.
