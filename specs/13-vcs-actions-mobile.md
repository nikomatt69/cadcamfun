# WP11–WP13 — Git-style history, pull requests, workflows (Actions) and the iOS companion

Status: **WP11 and WP12 built and tested; WP13 migrated to React Native + Expo Router**. The iOS 27 UI has been rebuilt around shared layout primitives, themed native stacks, responsive workspace previews and native modal sheets. The companion gateway and certificate-pinned local Expo module are integrated; unit and real-sidecar transport tests cover pairing, revocation, events and AI pull requests. The native Release built and installed on the physical iPhone Nikoemme on 2026-10-17; its pairing check awaits an unlocked device. Native simulator verification, TestFlight, push notifications and a hosted relay remain separate work. Owner dirs: `packages/vcs`, `packages/workflow`, `apps/mobile`, plus the explicit WP0/WP3/WP4 additions below.

## 1. Decisions

### Expo migration refinement (2026-10-11)

WP13 now owns the existing React Native/Expo Router migration in `apps/mobile`. Refine that app rather than restore the removed Tauri shell. Cross-WP integration includes the companion test imports and scoped gateway question/session-state routes in WP4, and Expo build/simulator workflows in WP0. The phone retains certificate-pinned HTTPS, scoped tokens in secure storage, and the same server-owned CAD/CAM assistant. The local `CompanionNet` Expo module requires a native development build: Expo Go can render an explanatory setup screen but cannot connect through an unpinned fallback. Startup, reconnect, request cancellation, SSE completion/recovery, native module loading, deep-link pairing, configuration and CI must agree with this runtime.

Commands from `apps/mobile`: `bun run ios` builds/installs the native app and starts Metro; `bun run ios:build` builds without Metro; `bun run ios:dev` starts Metro for an installed development build on localhost; `bun dev` starts Metro for the development client. `expo dev` is not an Expo CLI command. iOS simulator verification and signed device/TestFlight release are separate outcomes.

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
| WP13 | `apps/mobile` | React Native + Expo Router. `lib/pairing.ts`, `lib/client.ts`, `lib/native.ts` and local `modules/companion-net` own QR/deep-link pairing, pinned HTTPS, SSE and secure storage. Routes cover projects, history, pull requests, Actions, assistant, activity and settings. |

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

Owner refinement: use `/Volumes/SSD/Projects/nikcli/packages/mobile` as the assistant interaction reference. WP13 adds a searchable provider/model/thinking picker, persisted per-project agent/model/permission/context preferences, new-conversation control and session inspector using existing CADCAMFUN contracts. WP4 additionally owns the read-only `GET /api/ai/providers` companion allowance so model names, capabilities and supported thinking variants come from the same catalogue as desktop. Provider credentials remain on the paired desktop. Model, variant, permission mode and context selection travel on the next chat request and in persisted offline messages; selection never silently falls back to a different paid model. Install the signed Release on the connected physical iPhone Nikoemme after verification.

### Mobile assistant reliability (2026-10-17)

Owner-requested integration scope: WP13 owns the mobile transport, assistant lifecycle and reconnect presentation; WP8 owns interruption handling in the existing nikcli chat adapter; WP4 owns companion end-to-end regression fixtures. No new wire format or gateway privileges are required. A host interruption returned as a prompt result follows the same recovery rules as a rejected prompt. Stored completed answers are recovered before considering a retry; confirmed tool execution must never be replayed by resending the user's mutation. Switching mobile projects or reconnecting detaches the stream without stopping desktop work. Only the Stop action aborts the server turn. Reconnect restores stored tool results and pending permissions/questions through the existing scoped state/control endpoints. An uncertain delivery is never automatically queued for execution again.

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
- Route allow-list (`COMPANION_ROUTES`): `GET /api/health`, `GET /api/projects`, `/api/projects/:id/(vcs|pulls|actions)/**`, `GET /api/projects/:id/workspace/**`, `GET /api/ai/status|models|agents`, `POST /api/ai/chat/stream|chat/abort|chat/queue|permission/reply|sessions/control|sessions/state`. The read-only agent roster lets the phone select the same CADCAMFUN specialist as the desktop without exposing host configuration or credentials. Everything else (credentials, plugins, files, billing, `/api/companion`, the raw drawing/component/toolpath document routes…) answers 403. 10 failed authentications per minute from one address → 429.
- **Workspace preview (GET only).** `GET /api/projects/:id/workspace/drawings|components|toolpaths` returns summaries (id, name, subtitle, updatedAt) and never the stored `data` document. `…/drawings/:drawingId/preview` and `…/components/:componentId/preview` return a bounded triangle mesh (`positions`, `indices`, `normals`, per-element `parts`, `truncated`, `revision`) computed on the desktop with `elementMesh`. `…/toolpaths/:toolpathId` returns the G-code text and move stats. `…/toolpaths/:toolpathId/preview` returns coloured segments (`rapid` / `linear` / `circular`) whose `line` is the 1-based G-code row, plus the stock box. `…/library` lists the project's components and the materials, tools and machines its toolpaths reference. Caps are 80 000 triangles and 20 000 segments. POST, PUT and DELETE on these paths answer 403 at the gateway. Defining a component is an assistant prompt that still lands on an `ai/*` branch; the phone does not PUT geometry. The phone draws the payload with the local Expo module `modules/preview` (Metal). Camera, picking and G-code sync stay in JavaScript. Before anything reaches the GPU, the phone applies the same caps and refuses a payload that is non-finite, the wrong shape, or indexed outside its vertices. A toolpath playhead is a second, tiny upload so scrubbing does not reallocate the path.
- Revoking a device from the desktop cuts it off on the next request.
- Outside the home network: the gateway needs no relay when the phone can route to the desktop. The pairing screen takes any address for the desktop, so a private overlay network (Tailscale, WireGuard, a VPN) works as is: the phone still pins the certificate fingerprint and presents its device token. A hosted relay for users without such a network is not built; it would have to carry this same TLS stream end to end, never terminate it.

Phone side (`apps/mobile`):

- Pairing reliability (2026-10-17, WP13): the Swift `request` bridge accepts exactly the six JavaScript transport arguments; Expo injects `Promise` only as the final native argument. Pinned URLSession connections wait for connectivity while iOS asks for local-network access. Scan, paste, manual entry and deep links surface the actual connection error instead of replacing bridge, certificate or authentication failures with an unreachable-host message. Verify a native Release round trip on a simulator or physical device as well as the mobile tests and typecheck. Tauri capabilities govern WebView IPC, not the Bun gateway's incoming TCP listener; sandboxed macOS distribution would separately require the server network entitlement.
- `modules/companion-net/ios/CompanionNetModule.swift` — local Expo module using ephemeral URLSession connections, pinned leaf-certificate SHA-256, HTTPS-only requests and incremental UTF-8/SSE delivery. Redirects and cross-origin paths are refused; cancellation closes the task and stream subscription.
- `modules/preview` — local Expo module (`CadPreview`) that draws the workspace mesh and toolpath lines with Metal. JavaScript uploads typed arrays and the camera matrix; the module does not orbit, pick or import the CAD kernel. It copies those arrays into private buffers, skips a draw that would read past them, and reports one stable sentence when Metal cannot start. Shader and command-buffer detail stays in the unified log (`com.cadcamfun.companion`).
- `lib/native.ts` — optional native-module loading keeps Expo Go imports from crashing routes. Native connection requires `CompanionNet`; unsupported platforms and web never silently replace pinning with ordinary fetch. SecureStore holds pairing credentials. Test clients inject an explicitly verified transport.
- Expo Router routes own pairing, project resources, assistant sessions, notifications and preferences. Reconnect retains credentials for an offline desktop, checks health without overlapping probes, and cancels stale resource/chat requests when the client/project/screen changes. `cadcamfun://pair` opens the dedicated pairing route without exposing the token in UI/logs.

`.github/workflows/ios.yml` generates the Expo iOS project, builds an unsigned Release simulator app with CocoaPods/Xcode, installs it, opens a real pairing deep link and checks gateway authentication and project reads. The CI mobile job typechecks, tests and exports the iOS JavaScript bundle. These replace commands for the removed Tauri/Rust mobile shell. Local native compilation and simulator startup must pass before recording that validation; the workflow definition alone is not proof of a successful CI run. Device/TestFlight signing still requires the owner's Apple team and certificates.

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

- 2026-10-17: a two-agent UI precision pass consolidated container-measured page/list/card gutters, native project toolbars and PR dismissal, 44pt touch targets, large-text header/status wrapping, stable loading-button geometry, safe-area camera/pairing flows and assistant composer geometry. Installed SDK-compatible @expo/ui 57.0.22 for an actual SwiftUI segmented Picker with an optional-module and large-text fallback. Project/workspace lists share refresh/error/empty presentation; assistant forms preserve drafts and explain approval scope; CAD/CAM reviews add camera/playback controls and constrained reading layouts; property diffs expose complete values in native sheets. The mobile suite has 94 passing tests; final native Release installation is tracked separately.

- 2026-10-17: rebuilt the WP13 mobile layout using the Expo native UI, Apple Design and Emil design-engineering guidance: shared responsive geometry and semantic palette, a native stack for each tab, project search/cards and workspace shortcuts, grouped settings, filtered activity, keyboard-safe assistant and adaptive CAD/CAM review layouts. Fixed press targets losing parent flex/background styles, segmented selection offsets, settings switches nested in disabled rows, duplicate modal wrappers, and toast gesture callbacks crossing into React from the UI runtime. Connection state uses the native iOS tab accessory instead of covering navigation. Native sheets scroll above the keyboard; loading and feedback honor accessibility preferences. Typecheck, 94 mobile tests and iOS JavaScript export pass. This entry records source/bundle validation, not a new device build or visual inspection.

- 2026-10-17: fixed the CompanionNet request ABI: Expo's injected Promise now follows the six JavaScript arguments instead of being counted as a seventh caller-supplied argument. Pinned sessions wait for connectivity during the local-network permission prompt, and pairing callers receive the actual bridge, certificate or authentication error. Mobile TypeScript, 79 mobile tests and 15 gateway/real-sidecar tests pass. Expo built the Release with zero errors and installed it on the physical iPhone Nikoemme using `--configuration Release --no-bundler`; CoreDevice confirms the app is installed. The automatic launch reported that the device is locked, so on-device pairing remains unverified until it is unlocked. The separate simulator build was interrupted to prioritize the requested physical-device installation.
- 2026-10-15: the preview module enforces the phone caps, refuses non-finite or out-of-range geometry before Metal sees it, and updates the toolpath playhead without reuploading the path. GPU failures report one stable sentence; the Metal log keeps the compiler and command-buffer detail.
- 2026-10-15: companion workspace preview. The phone lists designs, components, toolpaths and the project library, and draws desktop-computed meshes and G-code-linked toolpath polylines. Document routes and every workspace write stay off the allow-list. The drawer is the local Expo module `modules/preview`.
- 2026-10-15: the 3D view is a purpose-built Expo module (`modules/preview`, Metal) rather than a generic WebGL package.
- 2026-10-11: pairing QR now lists every private IPv4 (Wi-Fi, iPhone Personal Hotspot, Tailscale CGNAT). The phone races them, pins TLS on the data-delegate path, and warms local-network permission via Bonjour so a scan on cellular 5G / hotspot is not silently dropped. Scan, paste, deep-link and manual entry share that path.
- 2026-10-11: nikcli-grade mobile architecture, CADCAMFUN domain: split server context/provider with bootstrap (projects + AI), exponential-backoff probes, background/auth-required connectivity, stale-client guard and offline-queue drain; centralised SecureStore storage; offline assistant queue with foreground drain; transcript pending/queued helpers; biometrics module; use-host-resource + use-copied-feedback hooks; GlobalErrorBoundary, ConnectionStatus, IconCircleButton, SheetShell; settings shows connection pill + queued count, assistant queues while offline. Mobile unit tests (56), TypeScript and iOS export pass; device Release verification in progress.
- 2026-10-11: aligned the Expo assistant with the nikcli mobile interaction model while retaining CADCAMFUN-specific tools: full-width assistant transcript, inspectable CAD/CAM/VCS/Actions tool cards, steer-during-run composer, project quick actions, and read-only specialist selection through the companion gateway. The gateway still refuses credentials, provider mutation, skills mutation and unrestricted host routes.
- 2026-10-11: refined the existing Expo migration: optional native loading, pinned async transport and UTF-8/SSE cleanup, typed AI recovery/diagnostics/questions, offline pairing retention, secure-state hydration, cancellable resources, scoped chat sessions, deep-link pairing, notification/review fixes and keyboard/gesture-safe sheets. Replaced obsolete mobile Tauri CI with Expo export and native simulator build/roundtrip. Use the official SDK 57 scene-support plugin for Xcode/iOS 27 instead of naming a nonexistent scene class. Mobile unit tests (48), TypeScript, JavaScript export and real HTTPS companion tests pass; native device build verification is recorded separately.
- v1: initial design and implementation of WP11/WP12, sidecar integration, API group, assistant tools, mobile scaffold.


## Account identity integration (2026-10-16)

Owner-requested cross-WP scope and verification are defined in `30-identity.md`. Add dedicated CADCAMFUN OAuth account sign-in to desktop and mobile while retaining scoped companion pairing and local profile access.
