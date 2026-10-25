# WP10 — Updates, packaging, CI, (deferred) sync

## Updater completion contract (2026-10-25)

Owner-requested scope covers the WP10 updater, its narrow WP5 command/permission wiring,
WP6 update prompt/state/i18n/tests and project close guard, and release documentation. Retain the official
`tauri-plugin-updater` for HTTPS downloads, signature verification and native installation.

- Serialize checks, downloads and application. Keep the latest status in native memory;
  `get_update_status` lets a listener recover the launch result after subscribing, without
  replacing a newer live event. Installed/restart and staged-download states survive checks.
- `install_update(unsavedWork: boolean)` downloads and verifies only, with a bounded
  timeout. `apply_update(unsavedWork: boolean)` applies the in-memory verified package.
  Both require an explicit unsaved-work answer. The UI flushes before download and again
  immediately before application, because users can keep editing during a download.
  Failed saves retain the verified package for retry. Installation runs off the async executor;
  native close/exit requests wait while replacement is running. Critical downloaded packages
  keep their required prompt across webview reloads.
- Windows installers exit the app themselves. Drain/reap the sidecar before invoking one;
  normal restarts also refuse to proceed if sidecar shutdown times out. macOS/Linux emit
  a restart-ready state after application. Configuration errors must never claim up-to-date.
- Tauri updater 2.13.1 supports Debian and RPM packages and automatically selects
  `{os}-{arch}-{installer}` before `{os}-{arch}`. Publish signed `linux-{arch}-deb` and
  `linux-{arch}-rpm` entries using the existing packages, plus `windows-{arch}-msi` entries
  so MSI installations retain their package type. Keep Windows base keys pointing to NSIS
  for older clients. Require all ten entries and their actual signed assets before publication.
  This supersedes older statements below excluding Linux from the updater feed; no AppImage
  or additional application plugin is needed. Pin the Rust updater minimum to 2.13.1.
- Validate real event payloads, preserve active update phases across manual checks,
  and enforce critical dismissal in the state reducer as well as the dialog.

Verification includes native unit tests/Clippy, desktop updater/IPC tests and typecheck,
release fixture rejection tests, workflow lint and production UI build. Actual replacement
of installed apps on each operating system remains a separate platform acceptance check;
do not describe local tests as proof of those installations.

## Rust updater lifecycle alignment (2026-10-09)

WP10 follow-up: register and retrieve the same updater state type, bound/coalesce check requests, run checks serially in an async task, stop the task on application exit, check unsaved work before consuming pending updates, bound the network recheck and enforce the announced version before install. Installation errors retain the pending announcement for retry.


Status: single-release consolidation implemented and locally verified; actual GitHub publication and cross-platform release acceptance remain unverified. This follow-up owns `.github/workflows/`, `.github/actions/`, `.github/actionlint.yaml`, `scripts/`, root release commands and README release instructions, the release lockfile and the Tauri resources mapping. Updater runtime and database backup behaviour remain owned by their existing agents and are not verified here.

### Single-release contract (2026-10-24)

Each version has one GitHub release (`v<version>`), matching nikcli's
[`desktop-release.yml`](https://github.com/nikcli/nikcli/blob/live-main/.github/workflows/desktop-release.yml).
All six targets' installers and signatures, one combined
`SHA256SUMS`, release notes and `latest.json` belong to that release. Builders
produce Actions artifacts only. The final publish job downloads all six installer
artifacts, verifies their checksums, target prefixes, package formats and common
notes, validates updater signatures and URLs against those actual assets, then
creates the draft after verification, uploads everything and publishes it last. Missing or invalid
platform output prevents publication. Updater and Homebrew URLs use the base
version tag. No platform-specific releases or tags are created. Historical platform
tags remain excluded from version and changelog discovery. Existing published
releases are not modified by this change.

### CI orchestration and asset-first creation (2026-10-24)

The `ci-pipeline.yml` owns the visible job sequence, following nikcli's
[`ci-pipeline.yml`](https://github.com/nikcli/nikcli/blob/live-main/.github/workflows/ci-pipeline.yml):
`validate` → `publish` (prepare metadata and tag) → `desktop` (build all six
targets) → `publish-release` (verify assets, create the release and publish it).
`publish.yml` is reusable metadata preparation only and must not publish npm or create a GitHub release. npm publication belongs to completion after asset verification.
`publish-release.yml` is the reusable completion job. A new release is created
only after all installer artifacts and the merged updater manifest are built and
verified locally. An existing draft can be resumed; a published release or a failed
lookup other than a missing release stops completion. Build or verification failure
must leave no new GitHub release, including drafts. `scripts/release` dispatches
`ci-pipeline.yml` with an explicit release flag; a default manual CI run and PRs
only validate. Automatic main pushes keep the patch bump and anti-loop filters.

### Release completion contract (2026-10-22)

- Bun 1.4.4 is the repository toolchain and minimum supported runtime. All Actions setups read the root `packageManager`; runtime checks, contributor instructions and web docs use the same version.
- Keep nikcli's checkout, workflows, secrets and release history unchanged. Only inspect its GitHub secret/variable names; GitHub does not expose stored secret values. Reuse compatible credentials only when supplied or already accessible to CADCAMFUN. Keep the CADCAMFUN updater key paired with its own committed public key.
- Updater signing is mandatory. Platform certificates are optional: use ad-hoc signing on macOS and unsigned Windows installers when absent. An Apple team ID alone is shared account metadata, not a partial certificate setup; reject incomplete certificate/notarization credentials when signing is requested.
- All six builders produce identical release notes (including a common platform signing summary), so strict updater manifest merging can compare their metadata.
- Use the running Bun executable for nested build commands, preserve Windows executable extensions in temporary compile paths, and refresh the API reference before workspace typechecking. Lint workflows in CI and before publishing.
- Install actionlint 1.7.12 with its pinned upstream download script through `.github/actions/setup-actionlint`; both CI and publish use this action. `taiki-e/install-action` remains for supported Rust tools only.
- Serialize publication across versions and branches. Publish the release only after every platform succeeds and the updater manifest is attached. Like nikcli, publish the optional Homebrew cask afterwards; a tap failure is reported as a warning. Preserve prerelease status, skip stable cask updates for prereleases and use a valid cask in `Casks/cadcamfun.rb`.

Legacy reference: `.reference/.github/workflows/desktop-build.yml`, `.reference/scripts/{build-desktop.sh,build-macos.sh,build-windows.bat,build-linux.sh}`, README "Auto-Updates" and "Distribution" sections.

## 1. Build pipeline

One reproducible script `scripts/build.ts` (Bun, not shell) run locally and in CI:

1. `bun install --frozen-lockfile --os=* --cpu=*` so cross-target optional native dependencies are present (the same approach used by nikcli's builders).
2. Regenerate the API reference, then `bun run typecheck`. Tests run in CI validation, outside the build script.
3. Compile the sidecar for the host target triple into `apps/desktop/src-tauri/binaries/sidecar-<triple>` (`bun build --compile`; see `05-api-sidecar.md` §3).
4. Copy `packages/db/drizzle/` into `apps/desktop/src-tauri/resources/migrations/`.
5. `bun run --filter @cadcamfun/desktop build` (Vite) then `bunx tauri build`.
6. Emit SHA-256 checksums and a release-notes file from commit messages since the last tag.

Explicit target triples are passed to both Bun and Tauri. Rust `x86_64` maps to Bun `x64`; Rust `aarch64` maps to Bun `arm64`. Bundles are collected only from `<cargo-target-dir>/<triple>/release/bundle`, with the default Cargo directory under `src-tauri`. The output directory must be empty and outside the bundle tree. Installers and signatures are copied with deterministic flat names `<triple>--<original-basename>`; checksums use these exact copied names. Migration resources map `resources/migrations/` to runtime `migrations/`.

Scripts must fail fast, print each step, and never read `.env*`.

## 2. CI (GitHub Actions)

- `ci-pipeline.yml` on main pushes, PRs and manual dispatch: call reusable `ci.yml` for validation, then orchestrate `publish.yml` (metadata), `release.yml` (desktop assets) and `publish-release.yml` (publication) as separate jobs. Successful main pushes in the canonical repository use a patch bump and `prevalidated: true`. Explicit manual release runs pass the requested bump/version through the same jobs. Release commits (`release: v…`) and generated/update housekeeping commits do not trigger another publication. PRs and manual validation runs do not publish.
- `ci.yml` is reusable and also runs directly on non-main branch pushes and manual dispatch: ubuntu runs install + typecheck + tests (including `cargo clippy`, `cargo test` for `src-tauri`); caches Bun and Cargo. Main pushes and PRs use the pipeline entry point to avoid duplicate validation runs. Main pipelines are not cancelled by a newer push while publication is running.
- `publish.yml` is reusable metadata preparation: resolve the version, stamp the workspace, write the changelog, commit/push the release metadata and tag it. It does not create a GitHub release or publish npm. `publish-release.yml` verifies the built assets, publishes npm, creates or resumes the draft, uploads all assets, publishes the release and updates the optional Homebrew cask.
- `release.yml` is called by `ci-pipeline.yml` with the resolved tag (and can be dispatched by hand to rebuild an existing tag): six-target matrix for macOS, Windows and Linux on arm64 + x64 → build, sign, notarise, upload Actions artifacts and generate the updater manifest. Manual dispatch produces artifacts only; `publish-release.yml` owns GitHub publication. It follows nikcli's native-runner approach: both macOS targets use `macos-14` (Intel is cross-compiled), Windows ARM uses `windows-11-arm`, and Linux ARM uses `ubuntu-22.04-arm`.
- `build-platforms.yml` on a `build/**` branch or manual dispatch uses the same six native targets to produce downloadable installer artifacts without requiring release/updater signing credentials. Like nikcli's desktop scripts, the sidecar is prepared for the explicit Rust target before Tauri bundles on the matching native runner.
- Linux packages `.deb` and `.rpm` (the same set as nikcli's desktop; no AppImage). macOS builds separate `.app` + `.dmg` artifacts per architecture so Tauri also emits the updater `.app.tar.gz`. Windows packages `.msi` + NSIS `.exe`.
- macOS uses separate arm64 and x64 installers, not a universal binary. Updater assets are `.app.tar.gz` and NSIS `.exe`, with sibling `.sig` files. Linux releases carry the packages only; the in-app updater has no Linux entry.
- Manual releases require an existing `v`-prefixed tag input. The gate checks out that tag, installs Bun, verifies the checked-out commit and configured app version, and outputs immutable SHA/version/date metadata. Secret-bearing builds depend on this gate; branch pushes and fork release workflows are excluded. Windows imports the owner-provided certificate, passes its thumbprint to Tauri signing configuration, then removes it even on failure. No secret appears in an `if` expression.
- `updater-manifest.ts` validates object shapes and consistent version/date/notes, rejects duplicate platforms, and requires the macOS and Windows updater keys when merging. `stage-release.ts` checks each downloaded target's checksums, rejects unexpected/duplicate files, compares notes and signatures for updater platforms, verifies exact release URLs against copied assets, and stages all six platforms into a single flat asset set with combined `SHA256SUMS`. Linux contributes packages without updater entries. Published releases are not modified by a rerun. The version release remains a draft until the final publish job; draft assets are not an active updater feed.
- Required secrets (names only, set by the owner in GitHub): `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`. Workflows must not echo them and must not run on forks' PRs with secrets.

## 2.1 Release pipeline (nikcli parity, 2026-10-22)

The release is driven the way nikcli drives its own: **one command starts it, and the
version, the changelog and the publishing are the pipeline's job**, not the owner's.

```bash
./scripts/release patch     # 6.0.0 -> 6.0.1
./scripts/release minor     # 6.0.0 -> 6.1.0
./scripts/release major     # 6.0.0 -> 7.0.0
./scripts/release 6.2.0     # an explicit version
```

`scripts/release` triggers `ci-pipeline.yml` with `release=true`. The visible sequence is:

1. **`validate`** — validate the workspace and workflows.
2. **`publish`** — prepare the version, changelog, commit and tag through `publish.yml`.
3. **`desktop`** — build and sign all six targets as Actions artifacts and merge the updater manifest through `release.yml`.
4. **`publish-release`** — verify every installer and the manifest, publish npm, create the GitHub draft, attach the complete asset set and publish it, then update the optional Homebrew cask.

The GitHub release is created only after all desktop jobs and asset verification
succeed. Upload failure leaves a resumable draft. An existing public release is
never modified. Manual CI dispatch defaults to validation only; PRs never publish.

### The version is one version

A release has exactly one version. It lives in `apps/desktop/src-tauri/tauri.conf.json`
and every other holder mirrors it: the workspace `package.json` files that carry a
version, `apps/desktop/src-tauri/Cargo.toml`, the desktop package entry in `Cargo.lock`, and `apps/mobile/app.json`.
`scripts/release-version.ts` is the only place that decides the version and writes it
everywhere.

A release moves forward from what was published: the bump is applied to the newer of the
version in the tree and the newest release tag, so a tree that lags behind a published
release still produces a version that was never used, and an explicit version that was
already published is refused. `bun run release:version --bump=patch` prints the version
a release would take, `--check` fails when the holders disagree, and `--stamp` writes
one version everywhere.

### The changelog comes from the commits

`scripts/changelog.ts` groups the commits since the previous release by the area they
touched (Core, Desktop, Sidecar, Mobile, Database, API, AI, Web, Version control,
Workflows, Identity, Buffer, Integrations, Build and release, Documentation), drops the
housekeeping commits, and writes the notes into `CHANGELOG.md` under a marker-delimited
"Unreleased" block. The same notes are the body of the GitHub release and the
`RELEASE_NOTES.md` of the build, so the three can never drift apart. No model and no
network are involved: the notes are produced from the commit messages alone, exactly as
nikcli's `--raw` mode does in CI.

### What the pipeline publishes

- **npm** — the workspace packages that are not private (the nikcli plugin). A version
  that is already on the registry is skipped, so a re-run is harmless; a prerelease goes
  to the `next` tag, a release to `latest`. A rate-limited registry is retried.
- **GitHub release** — one version release (`v6.0.1`) carries all six targets,
  signatures, combined checksums, release notes and `latest.json` for the in-app updater.
- **Homebrew** — a cask for the two macOS builds, generated from the checksums the
  release build already verified, and pushed to the tap repository as
  `Casks/cadcamfun.rb`, which is where Homebrew looks for a cask.

### The updater feed is the version release

The in-app updater reads `https://github.com/nikomatt69/cadcamfun/releases/latest/download/latest.json`:
the stable version release is the one GitHub marks as the latest, and it carries the merged,
signed manifest. The endpoint is written in `tauri.conf.json` and is the same
repository the publish workflow releases to; a feed that pointed at another repository
would resolve to nothing, so `scripts/release-target.test.ts` checks the two against
each other.

### The tap is optional

The cask is a second way to install the application. A missing tap repository or a
missing token skips it, and a tap that cannot be written is a warning: the release is
already public at that point, and the next release writes the cask again. A
prerelease never moves the stable cask forward.

### The CI plumbing is nikcli's

`.github/actions/setup-bun` and `.github/actions/setup-git-committer` are the two
composite actions the release uses: Bun is set up from the `packageManager` field of the
root manifest and cached, and the release commit is made with an identity (the runner
image has none). `bun run lint:workflows` runs `actionlint` over every workflow with
`.github/actionlint.yaml` naming the repository variables they may read; the same check
runs in CI and before a release.

### Secrets and variables

| Name | Kind | Needed for | Without it |
| --- | --- | --- | --- |
| `NPM_TOKEN` | secret | publishing the npm package | the release warns and continues |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | signing the updater bundles | the bundle fails |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | secret | signing and notarising the macOS builds | ad-hoc signing when absent (a team ID alone is allowed); incomplete signing credentials fail |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` | secret | signing the Windows builds | unsigned installers when absent; incomplete credentials fail |
| `HOMEBREW_TAP_REPOSITORY` | variable (`owner/name`) | the Homebrew cask | the cask is skipped, the release completes |
| `HOMEBREW_TAP_BRANCH` | variable | the branch of the tap (default `main`) | `main` is used |
| `HOMEBREW_TAP_TOKEN` | secret | pushing the cask to the tap | the cask is skipped |
| `GITHUB_TOKEN` | built-in | pushing the release commit and the tag, creating and publishing the release | — (the workflow asks for `contents: write`) |

The built-in `GITHUB_TOKEN` can only write to *this* repository, so the Homebrew tap —
another repository — needs its own token.

Read-only GitHub inspection on 2026-10-22 confirmed that CADCAMFUN already has
`APPLE_TEAM_ID`, `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
Its tap variables target `nikomatt69/homebrew-tap`, branch `main`. After the owner's
authorization, the authenticated local GitHub token was verified to have tap write
access and stored as CADCAMFUN's `HOMEBREW_TAP_TOKEN`. The owner then supplied a
CADCAMFUN npm token, verified against npm's identity endpoint as `cadcamfunv2` and
stored only as CADCAMFUN's `NPM_TOKEN`. The owner selected the matching
`@cadcamfunv2` scope. This release follow-up also owns the mechanical package-name
replacement in `packages/nikcli-plugin`, its sidecar dependency/imports, desktop bridge
labels and web package documentation/index/tests. The plugin contract in spec 27 is
updated first; tool ids, bridge routes and authentication behaviour stay unchanged.
The published name is `@cadcamfunv2/cadcamfun-nikcli-plugin`; this uses the npm
account's personal scope and does not require an organization. Internal `@cadcamfun/*`
workspaces and base `@nikcli-ai/*` dependencies retain their names.
No nikcli files, GitHub secrets, variables or workflows were changed.

## 3. Auto-update

- `tauri-plugin-updater` with a static JSON manifest (`latest.json`) hosted on GitHub Releases (no custom server in v6.0; the old `api.cadcam.fun/updates/check` endpoint is dropped unless open question 1 resolves otherwise).
- Signature verification mandatory (Tauri updater key pair); the public key is committed in `tauri.conf.json`, the private key only in CI secrets.
- Behaviour: check at launch and every 4 hours; show a non-blocking prompt with release notes; download progress events forwarded to the webview; "critical" flag in the manifest forces the prompt and blocks dismissal until applied; never interrupt an unsaved editor session (UI defers install until safe).
- Rollback: keep the previous installer link in the release notes; the sidecar's migrations are forward-only, so every release states whether a downgrade is safe.

## 4. Data safety on upgrade

- Before applying migrations, the sidecar copies `cadcamfun.db` to `<dataDir>/backups/cadcamfun-<yyyymmdd-hhmmss>-pre-migrate.db` (keep the last 5). Failure to back up aborts the migration with a typed error shown by the shell.
- Migration failures leave the original DB untouched (apply inside a transaction; test with a deliberately broken migration).

## 5. Deferred: sync

Offline-first with optional cloud sync is in the README but out of scope for v6.0. Constraints to honour now so it stays possible later: every synced row has a stable string id (already `uuid`), `updatedAt` on all mutable tables (already present), soft-delete is **not** used yet (add a `deletedAt` migration when sync starts), and writes go through repositories so a change-log hook can be added in one place.

### Synthetic demo storage on Cloudflare (2026-10-20)

The owner authorized uploading a synthetic demo database to Cloudflare while keeping
the account/login service separate. This is an artifact upload, not user database
sync. Generate a fresh file with WP0's `packages/db/src/demo-cli.ts` into a new
temporary directory; never upload `data/`, the real database, backups, credentials,
or a previously used application database. The fixed synthetic fixtures contain
no real user content. Authentication tables in the artifact remain empty.

Use a dedicated private R2 bucket `cadcamfun-demo-data`, object
`demo/cadcamfun-demo.db`. No public domain, `r2.dev` access, Worker binding, or user
upload endpoint is needed. Keep one object at this fixed key on future refreshes
rather than accumulating timestamped copies. R2 encrypts objects at rest with
Cloudflare-managed keys and supports TLS transfers; this is not client-side
encryption or anonymisation of real user data. The existing identity D1/KV service
is unchanged and its personal-data processing needs separate privacy assessment.

Verify the uploaded object by downloading it to the same temporary directory and
comparing SHA-256 with the generated file. Record the object path, size, checksum
and public-access status after verification. No Cloudflare token belongs in the
repository. Run Wrangler from the temporary directory to avoid project environment
files and use the existing authenticated Cloudflare account.

## 6. Acceptance criteria

- `bun scripts/build.ts` on a clean macOS checkout produces a runnable `.app` and `.dmg`.
- CI green on a PR; a tagged dry-run produces draft release artefacts and a valid `latest.json` (signature verifies with the public key).
- The pre-migration backup is created and restorable (test).

### Verification recorded for this follow-up

- 2026-10-24 asset-first CI follow-up: 81 script tests pass (405 assertions), including the reusable workflow dependency graph, manual patch/explicit-version dispatch and dry-run without dispatch. CLI completion tests prove that invalid assets trigger no GitHub calls, release creation follows verification, existing drafts resume, lookup/create/upload failures prevent publication, published releases remain unchanged and prerelease flags are preserved. All 15 workspace typechecks and root scripts pass; API reference generation/freshness, seven workflow lint checks, shell syntax and whitespace checks pass. CI now runs the release regression suite. No commit, push, npm publish or real GitHub release was performed.

- 2026-10-24 single-release consolidation: `bun --no-env-file test scripts` passes 74 tests (351 assertions). Filesystem fixtures cover all six targets, combined checksum verification, matching notes and signatures, missing or unexpected targets/packages, tampered assets, historical platform URLs and manifest version/platform mismatch. Completion is exercised through the actual CLI with a local fake `gh`: exactly one asset upload to the version tag precedes publication; invalid output, an already published release and upload failure prevent publication; prereleases preserve their status and do not become latest. The six build planners pass. Workspace typechecking passes for all 15 packages and root scripts, followed by a root check after the final test changes. All six workflows pass actionlint. API reference generation and freshness verification pass; the generated reference is included. No commit, push, GitHub release or tap update was performed; live platform builds and updater installation were not exercised by this change.

- 2026-10-22 actionlint installer fix: executed the shared action's exact Bash step in a temporary directory, downloaded the official 1.7.12 binary and confirmed its version. That downloaded binary validates all six workflows; shell syntax and diff whitespace checks pass. The previous GitHub run already passed workspace typechecking, Rust checks and companion validation before the unsupported actionlint installer stopped the workspace job.
- 2026-10-22 CI pipeline/Bun 1.4.4 follow-up: frozen-lockfile installation succeeds without a lockfile change; 57 script tests pass, including build plans for all six targets with no test command. All six workflows pass actionlint; root scripts and web documentation pass typechecking, including docs-index and API-reference freshness checks. The API reference was regenerated and is unchanged. Workspace typechecking currently reports `TS2322` in the separately modified `packages/core/src/cad/sketch-edit.test.ts:98` (`Dimension` versus `number`); no CAD source was changed by this follow-up. No cross-platform installers or release publication were run.
- 2026-10-22 completion: `bun --no-env-file test scripts` passes 57 tests, including all six build planners, staging/tamper checks, signing plans, version/lockfile stamping and npm outcome handling. `bun --no-env-file run typecheck` passes across all 15 workspace packages and root scripts (13 packages reused cached checks); the API reference was regenerated first and its freshness check remains enabled. Workflow lint passes for all five workflows. `ruby -c` accepts both one- and two-architecture generated casks. A real `bun-darwin-arm64` sidecar was compiled into a temporary directory with every required nikcli host patch applied. Actual cross-platform installer signing, publication and updater installation were not run.
- Final npm scope verification: renamed the public plugin and every workspace consumer/documentation reference to `@cadcamfunv2/cadcamfun-nikcli-plugin`, regenerated the Bun lockfile and workspace links, and confirmed no old plugin-name references remain in app/package/script sources or spec 27. The combined release/plugin/bridge/docs suite passes 98 tests (798 assertions). All 15 workspace typechecks and root scripts pass again after API reference regeneration; five workflows pass lint. `npm pack --dry-run --json --ignore-scripts` produces the expected `@cadcamfunv2` package with exactly the README, manifest and three source files. The supplied token authenticates `cadcamfunv2`; GitHub secret-name inspection confirms both `NPM_TOKEN` and `HOMEBREW_TAP_TOKEN` in CADCAMFUN. No npm package, GitHub release or commit was published during verification.
- 2026-10-22 release target: `bun --no-env-file scripts/release-version.ts --bump=patch` resolves `6.0.1` from the tree, `--check` reports one version across the holders, and `./scripts/release --dry-run` names the version and the repository without dispatching a workflow. The dispatch of the pipeline was exercised once and cancelled during the validation step: no tag, no release and no commit reached the repository.

Earlier checkpoints:

- `bun --no-env-file test scripts`: final run reports 19 passing tests, zero failures, including pure mapping/gate/manifest/checksum regression tests and a four-target filesystem staging fixture with tamper detection (Bun also matches package script tests).
- `bunx --no-env-file tsc -p tsconfig.json`: passes without editing root configuration or other WPs.
- `actionlint .github/workflows/ci.yml .github/workflows/release.yml`: passes.
- Full build dry-run for `x86_64-apple-darwin`: passes and selects `bun-darwin-x64` and the target-specific bundle directory without signing credentials or writes.
- At the 2026-10-05 checkpoint, actual signed installers, notarization, GitHub publication, updater signature verification, runtime update flow and backup/rollback acceptance had not run. The updater key was still a placeholder; the local signing follow-up below supersedes that key configuration status.

## 7. Change log

- 2026-10-24 follow-up: expose preparation, desktop builds and completion as separate jobs in `ci-pipeline.yml`; defer GitHub release creation until all six targets pass asset verification. Manual release commands dispatch the full CI pipeline.

- 2026-10-24: replace six platform releases plus an index with one release per version, following nikcli's desktop artifact uploads. Consolidate installers, signatures and checksums before publication; point updater and Homebrew downloads at the same version tag. Historical releases remain unchanged.
- 2026-10-23: Linux desktop packages match nikcli: `.deb` and `.rpm` only. The AppImage bundler aborts on the aarch64 Bun sidecar, so Linux platform releases no longer carry an updater artifact. The in-app updater manifest is macOS and Windows.
- v1: initial spec.
- 2026-10-22: fixed the failed actionlint installation in CI and publish. The Rust installer does not support actionlint and falls back to looking for a nonexistent crate; both workflows now use a shared action invoking actionlint's official version-pinned binary installer.
- 2026-10-22: updated the repository toolchain to Bun 1.4.4, including the runtime minimum, CI/iOS setup, release-version expectations and current documentation. CI and iOS derive the Bun version from `package.json` to keep every build aligned.
- 2026-10-22: removed tests from the local/release build script; its check step only regenerates the API reference and typechecks. Added nikcli-style `ci-pipeline.yml`: validate once, then automatically publish a patch release with all six desktop variants on main pushes. Reused the existing CI and publish workflows, with repository/event gates and release-commit loop prevention; PRs remain validation-only.
- 2026-10-22: expanded the main repository README at the owner's request with product scope, architecture, source setup, validation commands, configuration, data lifecycle, privacy, companion/plugin usage, release operations and licensing links. Platform release availability and acceptance are described separately from configured automation; no enterprise certification or support guarantee is asserted.
- 2026-10-22: configured the owner-supplied npm token only in CADCAMFUN and reused local GitHub credentials for its Homebrew tap secret. At the owner's request, the published plugin uses the personal `@cadcamfunv2` scope throughout the workspace, app labels, docs and spec 27; no npm organization is required. Base nikcli and internal `@cadcamfun/*` packages retain their names. Scope follow-up verified with 98 tests, workspace typecheck and npm package dry-run.
- 2026-10-22: release target, pipeline plumbing and npm rules. The updater feed pointed at `nikomatt69/cadcamfun-tauri`, a repository that does not exist, so the in-app updater could never find a release: it now reads `nikomatt69/cadcamfun`, the repository the publish workflow releases to, and `scripts/release-target.test.ts` holds the two against each other. The release gate accepts the `workflow_call` the publish pipeline makes (it knew only tag pushes and manual dispatch, so the new pipeline could not start). The Homebrew cask is written to `Casks/cadcamfun.rb`, where Homebrew looks for a cask, and a tap that cannot be written is a warning instead of a release that stays a draft. A release moves forward from what was published (the newer of the tree and the newest tag), a version that npm already has is skipped, a rate-limited registry is retried, and a rebase that two releases caused is resolved on the files the release owns. `.github/actions/setup-bun` and `.github/actions/setup-git-committer` (nikcli's composite actions) give the release its Bun and its git identity, `bun run lint:workflows` runs actionlint over every workflow, and the README documents where the installers are. 57 script tests, the workspace typecheck and the workflow lint pass; no release was published and nothing was committed by this follow-up.
- 2026-10-22: completed nikcli-style release follow-up: fixed build type errors, common six-platform signing notes, optional platform certificates, empty Apple environment cleanup, Windows compile filenames and nested Bun executable resolution. Serialized publication, validated workflows in CI/publish, preserved prerelease status, stamped the Rust lockfile and corrected Homebrew architecture blocks and cask location. Verified workspace typecheck, release regression tests, workflow lint, Ruby cask syntax and a real Apple Silicon sidecar compile with mandatory host patches. Signed cross-platform installers, publication and updater installation remain unverified; no release or commit was created during this follow-up.
- 2026-10-20: created private R2 bucket `cadcamfun-demo-data` (Western Europe location hint) and uploaded a freshly generated synthetic database to `demo/cadcamfun-demo.db`: 581,632 bytes, SHA-256 `d0cd407945ac1c52847a13b1c7d476e0659236ff9e3eb9b820d49b17181fab16`. Downloaded the remote object and verified the same digest. Confirmed `r2.dev` access disabled and no custom domains attached. Only fixed invented profile/project rows were generated; real application databases and identity D1/KV data were not uploaded or modified. The seven WP0 storage/demo regression tests pass (24 assertions). R2 encryption uses provider-managed keys; no client-side encryption or user database synchronization was introduced.
- 2026-10-05: completed interrupted packaging follow-up: explicit architecture mapping and target paths, flat copied artifacts/checksums, tag/manual release gate, certificate thumbprint wiring, strict manifest merge and verified draft staging, helper/integration tests. Resource mapping now matches staged migrations. Root and other-WP sources unchanged; release acceptance is pending credentials and platform builds.

## Local updater signing configuration (2026-10-10)

The owner explicitly authorized generating an updater key pair and storing it in an ignored root file. `tauri-signing.json` holds the public key, encrypted private key and password with owner-only file permissions. The public key is configured in `tauri.conf.json`. The build loads local credentials only for bundling; explicit environment signing credentials take precedence as a pair. CI continues to use its secrets. Apple/Windows platform certificates are separate from updater signing and remain required for platform-signed releases. No local credentials are logged or committed.

Verification: Tauri CLI `signer generate` created the pair and `signer sign` signed a temporary payload. Verification against the configured public key succeeded and rejected an altered payload. Credential permissions are `0600`, Git ignores the file, the 19 signing/release helper tests pass, and root TypeScript checking and bundle dry-run pass. Actual installer bundling, notarization and updater installation remain unverified in this follow-up.
