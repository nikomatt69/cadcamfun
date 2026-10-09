# WP11–WP13 — Git-style history, pull requests, workflows (Actions) and the iOS companion

Status: **WP11 and WP12 built and tested; WP13 builds for and runs in the iOS simulator**: companion gateway, pairing UI on the desktop, certificate-pinned Rust client, iOS shell and phone UI exist; the Xcode project is generated, and the `iOS` workflow compiles the app and launches it in an iPhone simulator on a real macOS runner. Not done: running on a device, signing/TestFlight, push notifications, access outside the LAN. Owner dirs: `packages/vcs`, `packages/workflow`, `apps/mobile`, plus the explicit additions to WP0 (`packages/db` schema), WP3 (`packages/api/src/groups/vcs.ts`) and WP4 (`apps/sidecar`) listed in §4.

## 1. Decisions

1. **Every CADCAMFUN project is a git repository.** History, branches, tags, diffs, pull requests and CI are all built on git's object model, not on the old `*Version` snapshot tables (which stay for the legacy routes).
2. **Git is the source of truth, SQLite is the working copy.** The database holds the checked-out state of the project; `commit` snapshots it into the repository, `checkout`/`merge`/`restore` write a tree back into it. A dirty working copy (database ≠ HEAD) blocks checkout, merge and restore, exactly like `git`.
3. **Byte-compatible with git.** Blobs, trees and commits use git's loose-object format and SHA-1, so an oid is identical here, in a `git clone`, and on GitHub. This is verified against the real `git` binary in `packages/vcs/test`. Consequence: the GitHub mirror needs no mapping tables.
4. **Collaboration is internal; GitHub is an optional mirror.** Users and organisations collaborate inside CADCAMFUN: access follows `Project` ownership / `UserOrganization` roles (members read, commit to branches, open and review pull requests; the owner or an org ADMIN/MANAGER moves shared branches and merges). `GitRepo.remote` (`owner/repo`) links a project to a GitHub repository that is synchronised with `push` / `pull`.
5. **Workflows look like GitHub Actions but cannot run code.** `uses:` names a registered CADCAMFUN step; there is no `run:` shell and no Docker. A workflow naming an unregistered step fails before any step runs.
6. **The phone is a companion, not a second app database.** iOS cannot spawn the Bun sidecar, so the phone is a thin client of a desktop that owns the data. The AI assistant on the phone works through the same tools as on the desktop and can only *propose*: it commits to `ai/*` branches and opens pull requests; a person merges.

## 2. Repository layout (what is committed)

```
project.json                    name, description, isPublic
drawings/<id>.json              one file per entity => diffs and merges stay local
components/<id>.json
toolpaths/<id>.json             includes the generated G-code
materials/<id>.json             library items the project's toolpaths use (material, tool, machine)
tools/<id>.json
machine-configs/<id>.json
costs/<id>.json                 production cost estimates of the toolpaths
.cadcamfun/workflows/<n>.yml    workflows, versioned with the model
```

**What is tracked, and why.** Everything that is part of a project's manufacturing state is in the tree: the project itself, its drawings, components and toolpaths (with G-code), the materials, tools and machine configurations those toolpaths reference, and their cost estimates. Library items are shared across projects, so applying a commit creates the ones that are missing and updates an existing one only when the current user owns it; owners and organisations are installation-specific and are not stored. Not tracked, on purpose: thumbnails (derived), comments and chat (conversation, not model state), uploaded binaries and per-user cost settings. Every history-changing action (commit, checkout, restore, pull-request open/merge) is also appended to the legacy `ActivityLog`, so it shows up in the same audit trail as every other change.

**History of one item.** `GET …/vcs/log?path=drawings/<id>.json` lists only the commits that touched that file, and `POST …/vcs/restore` with `paths` puts only those files back to an older version as a new commit, leaving the rest of the project as it is. The desktop exposes both from each drawing/component/toolpath card (History button) and from the project's Version control screen.

Canonical JSON (sorted keys, 2 spaces) keeps text diffs stable. Thumbnails are derived data and are not committed. `.json` files merge **structurally** (`mergeJson`): two people editing different properties of one drawing do not conflict; same property, or arrays, report a conflict with JSON pointers.

## 3. Packages

| WP | Package | Content |
| --- | --- | --- |
| WP11 | `packages/vcs` | `object.ts` git objects; `store.ts` `Backend` interface (+ memory); `repository.ts` commit, log, branch, tag, checkout, merge (fast-forward, 3-way, `mergeInto` for PRs), `revertTo`, diff; `json.ts` canonical JSON + 3-way JSON merge; `diff.ts` CAD-aware diff (`describeDiff`: entity, property pointer, before/after); `snapshot.ts` project ⇄ files; `github.ts` `push` / `fetchBranch` / `pull` over a `GitHubTransport` + `restTransport` (Git Data API, fine-grained token). Pure; uses `node:crypto` only. |
| WP12 | `packages/workflow` | YAML → `Workflow` (Effect Schema), triggers (`push` with branch/path globs, `pullRequest`, `manual`), job DAG (`needs`, levels, cycle check), step registry, `${{ steps.<id>.outputs.<k> }}` interpolation, `if: success|failure|always`, `continueOnError`, event stream for live UIs. |
| WP13 | `apps/mobile` | Solid + Vite, Tauri v2 iOS target. `companion/pairing.ts` (QR link, https + pinned certificate fingerprint), `client.ts` (fetch client of the sidecar API + assistant SSE stream), `store.ts` (secret store abstraction), screens: pair, projects, history, pull requests (diff, review, merge), Actions, assistant. |

### Step registry

A step is a pure function of the commit being checked (`ctx.files`) and its own `with:` parameters, never of the live database, so a run always reports on the tree that was pushed. `ctx` also carries `actor` — the account that dispatched the run — so a step that writes is attributed to whoever asked for it, not to the local profile.

Steps split in two, because the runner cannot depend on a service built above it:

- **Pure** (`apps/sidecar/src/services/workflow-steps.ts`, available to every layer that builds the runner): `project/validate`, `project/require-gcode`, `cam/verify`, `cam/gcode`.
- **Service-backed** (added through `WorkflowRunner.register`): `vcs/commit` and `notify/push`, registered by `workflow-service-steps-live.ts`, which owns `ProjectVcs` and `NotificationService`; `ai/prompt`, registered by `AiLive`.

| Step | `with:` | Fails on |
| --- | --- | --- |
| `project/validate` | — | an entity file that is not JSON, an `id` not matching the file name, a missing `name` |
| `project/require-gcode` | — | a toolpath in the commit with no G-code |
| `cam/verify` | `toolpath?`, `tolerance?`, `severity?` (`error` \| `warning`) | any `error` from the replay — rapid in material, gouge, uncut stock, shank/holder/fixture collision, below stock — plus warnings when `severity: warning` |
| `cam/gcode` | `toolpath?` | the committed G-code differs from what its stored generation request produces (a stale export) |
| `vcs/commit` | `message`, `files?` (`.cadcamfun/**` text files only) | a dirty working copy, a path outside `.cadcamfun/`, or an AI actor on `main` |
| `notify/push` | `title?`, `body?`, `outcome?` (`success` \| `failure`) | never: best-effort, writes a `WORKFLOW_PASSED` / `WORKFLOW_FAILED` row |
| `ai/prompt` | `prompt` (may embed `${{ files.<path> }}`), `system?`, `model?` | the model is unreachable or errors; the answer comes back as `outputs.text` |

`cam/verify` and `cam/gcode` read the generator request stored on each toolpath, so a run that uses them needs the toolpaths to have been generated. A toolpath that *cannot* be verified — a lathe job, no stored request — is listed in `skipped` and never counted as verified: an unverifiable toolpath is not a verified one. A workflow naming an unregistered step fails before any step runs; `ai/prompt` stays unregistered until the AI layer is up, which is why the registry test asserts its absence.

`WorkflowRunner.trigger(projectId, ref, event, { onEvent?, actor? })` takes the actor in an options object (it replaced a positional callback). `WorkflowRunner.steps()` lists what a workflow may name, for the workflow editor and for error messages.

Workflow example:

```yaml
name: Validate
on:
  push: { branches: [main, "ai/**"], paths: ["toolpaths/**"] }
  pullRequest: { branches: [main] }
  manual: {}
jobs:
  check:
    steps:
      - id: v
        uses: project/validate
      - uses: project/require-gcode
```

Registered steps (see §3): `project/validate`, `project/require-gcode`, `cam/verify`, `cam/gcode`, `vcs/commit`, `notify/push`, `ai/prompt`.

## 4. Backend integration (what exists)

- **WP0** `packages/db`: tables `GitRepo` (HEAD, remote), `GitObject`, `GitRef` (all per project, cascade on project delete), `PullRequest`, `PullRequestReview`, `WorkflowRun`. Migration generated, not hand-edited.
- **WP4** `apps/sidecar`: `ProjectVcsRepo` (SQLite `Backend`, snapshot load/apply), `ProjectVcs` service (status, commit, log, branches, checkout, diff, restore, pull requests, reviews, merge), `WorkflowRunner` (list, trigger, runs; every run is persisted with its event stream), HTTP handlers, and the assistant tools.
- **WP3** `packages/api/src/groups/vcs.ts` (generated client/SDK and OpenAPI snapshot updated):

| Route | Purpose |
| --- | --- |
| `GET /api/projects/:id/vcs/status`, `/log`, `/branches`, `/diff?from&to` | read state |
| `POST …/vcs/commit` (`message`, optional workflow `files`), `/branches`, `/checkout`, `/restore` (`rev`, optional `paths`) | write state |
| `GET/PUT …/vcs/remote`, `POST …/vcs/push|pull` (header `x-github-token`) | GitHub mirror; desktop only, never offered to a paired phone |
| `GET/POST …/pulls`, `GET …/pulls/:n`, `POST …/pulls/:n/reviews`, `/merge`, `/close` | pull requests |
| `GET …/actions/runs`, `POST …/actions/dispatch` | Actions |

A commit/merge triggers the `push` workflows of the pushed branch; opening a PR triggers `pullRequest` ones. Trigger failures never fail the user's operation.
- **Guards**: an AI actor cannot commit, restore or merge on `main`; a review with `request-changes` (latest verdict per reviewer) blocks the merge; the API accepts non-model files only under `.cadcamfun/workflows/*.yml`; merge conflicts leave the repository untouched and return the conflicting paths and pointers.

## 5. AI companion flow

1. Phone: *"make the plate 20 mm wider and regenerate the pocket"* → `POST /api/ai/chat/stream` on the paired desktop.
2. Assistant (tools in `apps/sidecar/src/services/ai-vcs-tools.ts`): `vcs_status` → `vcs_start_change` (creates and checks out `ai/<topic>`; refuses on a dirty working copy) → `cad_*` / `cam_*` edits → `vcs_commit` → `vcs_open_pull_request` (+ `actions_run`).
3. Pull request opens → `pullRequest` workflows run (validation, G-code present, later `cam/verify`).
4. Phone shows the PR (entity/property diff, workflow status); the person approves and merges, or asks for changes in chat.
5. After the merge the desktop working copy is updated (when `main` is checked out) and, if a remote is set, `push` mirrors it to GitHub.

## 6. Transport and the iOS app

The sidecar listens on `127.0.0.1` only. A phone reaches it through the **companion gateway** (`apps/sidecar/src/services/companion*.ts`, built and tested end to end against a real sidecar process):

- Opt-in: Settings → Mobile companion (`/settings/companion`) turns it on and shows the pairing QR; off by default and re-enabled automatically after a restart only if it was on.
- Separate HTTPS listener (`0.0.0.0`, default port 8443) with a per-install self-signed P-256 certificate stored under `<dataDir>/companion/` (key `0600`). The QR carries the certificate's SHA-256 fingerprint; the phone pins it (no trust-on-first-use, no HTTP).
- **Scoped, revocable device tokens** (32 random bytes, only their SHA-256 is stored, compared in constant time; shown once, inside the QR). The gateway swaps in the sidecar's real bearer token when forwarding, so the phone never holds it.
- Route allow-list (`COMPANION_ROUTES`): `GET /api/health`, `GET /api/projects`, `/api/projects/:id/(vcs|pulls|actions)/**`, `GET /api/ai/status`, `POST /api/ai/chat/stream|chat/abort|permission/reply`. Everything else (credentials, plugins, files, billing, `/api/companion`…) answers 403. 10 failed authentications per minute from one address → 429.
- Revoking a device from the desktop cuts it off on the next request.
- Outside the home network: the gateway needs no relay when the phone can route to the desktop. The pairing screen takes any address for the desktop, so a private overlay network (Tailscale, WireGuard, a VPN) works as is: the phone still pins the certificate fingerprint and presents its device token. A hosted relay for users without such a network is not built; it would have to carry this same TLS stream end to end, never terminate it.

Phone side (`apps/mobile`):

- `native/` — Rust crate `cadcamfun-companion-net`: reqwest + rustls with a custom verifier that accepts only the pinned leaf certificate, https-only, no redirects, JSON and streamed (SSE) responses. Tests (fmt, clippy `-D warnings`, 6 tests incl. rejection of a different certificate) run on any OS and in CI.
- `src-tauri/` — Tauri v2 iOS shell: commands `companion_request`, `companion_stream` (Tauri `Channel`), `secret_get|set|delete` (iOS Keychain via `keyring`), QR scanner plugin, `Info.ios.plist` (local-network and camera usage strings), CSP without any network `connect-src`, icons generated.
- `src/companion/native.ts` — `pinnedFetch` routes the unchanged `CompanionClient` through those commands; `keychainStore` keeps the pairing in the Keychain; plain browsers fall back to `fetch` + web storage for development.

The `.github/workflows/ios.yml` workflow runs `tauri ios init` and `tauri ios build --debug --target aarch64-sim` on `macos-latest` (verified: both succeed), then runs a real sidecar on the runner with the gateway on, boots an iPhone simulator, installs the build and launches it with `--pair-link <link>` (the shell reads this launch argument; only the process launcher can set it on iOS). The job fails unless, from the desktop side, the device token was accepted over the pinned-TLS connection (`lastSeen` set), the app listed the projects (`GET /api/projects` reached the sidecar) and the app process is still alive (verified in the macOS run: the sidecar log shows the app's `GET /api/health` and `GET /api/projects` arriving through the gateway). The assistant is not driven from the simulator UI (no model credentials on the runner, no UI automation); it is covered end to end on Linux by `apps/sidecar/test/companion-chat-e2e.test.ts` (next paragraph). It uploads the generated Xcode project and a simulator screenshot as artifacts. Still to do by the owner, because they need an Apple developer team and certificates: set `APPLE_DEVELOPMENT_TEAM`, `ios:dev` on a device, then TestFlight signing. The `src-tauri` crate compiles and passes clippy `-D warnings` for the host (Linux CI job `mobile-native`, with the web assets built and the Tauri config and capabilities validated by `tauri-build`). The iOS-only Keychain module was type-checked for `aarch64-apple-ios`; the full iOS target cannot be checked off macOS (`ring` needs `xcrun`), so the manual `ios-check` job does that on a Mac runner.

**The assistant from the phone, end to end.** `companion-chat-e2e.test.ts` boots the real sidecar process (embedded nikcli host), points MiniMax at a scripted OpenAI-compatible server through `CADCAMFUN_AI_MINIMAX_BASE_URL` (also usable for a regional endpoint or a corporate proxy), pairs a phone client over pinned TLS and sends a chat message through the gateway. The scripted model calls `vcs_start_change`, `cad_add_entities`, `vcs_commit`, `vcs_open_pull_request`; the test then reads, as the phone, an open AI pull request on an `ai/*` branch with the drawing change in it, checks that `main` still holds only the human commit, and that merging is a separate action by a person. It uses the same `CompanionClient` code as the app. It proves the plumbing and the guard rails, not the quality of a real model's decisions.

## 7. GitHub mirror

`restTransport` + `push`/`pull` are implemented and tested against an in-memory remote that enforces fast-forward-only updates and verifies every object hash. The HTTP routes (`GET/PUT /vcs/remote`, `POST /vcs/push|pull`) exist: the desktop screen keeps the GitHub token in the OS keychain and sends it per request; the sidecar never stores it, and the companion gateway refuses these routes. Not done: mirroring PRs to GitHub PRs (`PullRequest.remoteNumber` is reserved), and a live check that GitHub's Git Data API reproduces the exact commit oid for a given author/committer date (unit tests prove the hash logic, not GitHub's behaviour).

## 8. Limits and next steps

1. Run the iOS shell on a device (Mac), APNs push for PR/Actions events, remote access beyond the LAN.
2. Desktop UI: `Version control` screen (`/projects/:id/history`: changes + commit, history with property-level diffs and restore, branches, pull requests with review/merge, Actions runs, GitHub push/pull) and per-item History buttons are built; a drawn commit-graph view and in-editor (CAD/CAM) history panels are not.
3. `needs`-scoped outputs if workflows grow (today step outputs are shared run-wide, keyed by step id).
4. GitHub routes and PR mirroring (§7); `deletedAt`/sync interplay with `10-release-sync.md` §5 (git history supersedes the change-log idea there).
5. Large binary assets (STL/DXF imports): store as blobs; packfile/delta compression is not implemented (object count per project stays small; revisit with real data).
6. `log` is O(history) per call and `isAncestor` walks the graph; fine for thousands of commits, add commit-graph caching if projects grow beyond that.

## 9. Change log

- v1: initial design and implementation of WP11/WP12, sidecar integration, API group, assistant tools, mobile scaffold.
