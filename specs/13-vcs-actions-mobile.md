# WP11–WP13 — Git-style history, pull requests, workflows (Actions) and the iOS companion

Status: **WP11 and WP12 built and tested; WP13 scaffolded** (client library tested, UI builds, iOS project not generated). Owner dirs: `packages/vcs`, `packages/workflow`, `apps/mobile`, plus the explicit additions to WP0 (`packages/db` schema), WP3 (`packages/api/src/groups/vcs.ts`) and WP4 (`apps/sidecar`) listed in §4.

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
.cadcamfun/workflows/<n>.yml    workflows, versioned with the model
```

Canonical JSON (sorted keys, 2 spaces) keeps text diffs stable. Thumbnails are derived data and are not committed. `.json` files merge **structurally** (`mergeJson`): two people editing different properties of one drawing do not conflict; same property, or arrays, report a conflict with JSON pointers.

## 3. Packages

| WP | Package | Content |
| --- | --- | --- |
| WP11 | `packages/vcs` | `object.ts` git objects; `store.ts` `Backend` interface (+ memory); `repository.ts` commit, log, branch, tag, checkout, merge (fast-forward, 3-way, `mergeInto` for PRs), `revertTo`, diff; `json.ts` canonical JSON + 3-way JSON merge; `diff.ts` CAD-aware diff (`describeDiff`: entity, property pointer, before/after); `snapshot.ts` project ⇄ files; `github.ts` `push` / `fetchBranch` / `pull` over a `GitHubTransport` + `restTransport` (Git Data API, fine-grained token). Pure; uses `node:crypto` only. |
| WP12 | `packages/workflow` | YAML → `Workflow` (Effect Schema), triggers (`push` with branch/path globs, `pullRequest`, `manual`), job DAG (`needs`, levels, cycle check), step registry, `${{ steps.<id>.outputs.<k> }}` interpolation, `if: success|failure|always`, `continueOnError`, event stream for live UIs. |
| WP13 | `apps/mobile` | Solid + Vite, Tauri v2 iOS target. `companion/pairing.ts` (QR link, https + pinned certificate fingerprint), `client.ts` (fetch client of the sidecar API + assistant SSE stream), `store.ts` (secret store abstraction), screens: pair, projects, history, pull requests (diff, review, merge), Actions, assistant. |

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

Built-in steps today: `project/validate`, `project/require-gcode`. Planned registrations (the registry is the extension point, `WorkflowRunner.layer(registry)`): `cam/verify`, `cam/gcode`, `ai/prompt`, `vcs/commit`, `notify/push`.

## 4. Backend integration (what exists)

- **WP0** `packages/db`: tables `GitRepo` (HEAD, remote), `GitObject`, `GitRef` (all per project, cascade on project delete), `PullRequest`, `PullRequestReview`, `WorkflowRun`. Migration generated, not hand-edited.
- **WP4** `apps/sidecar`: `ProjectVcsRepo` (SQLite `Backend`, snapshot load/apply), `ProjectVcs` service (status, commit, log, branches, checkout, diff, restore, pull requests, reviews, merge), `WorkflowRunner` (list, trigger, runs; every run is persisted with its event stream), HTTP handlers, and the assistant tools.
- **WP3** `packages/api/src/groups/vcs.ts` (generated client/SDK and OpenAPI snapshot updated):

| Route | Purpose |
| --- | --- |
| `GET /api/projects/:id/vcs/status`, `/log`, `/branches`, `/diff?from&to` | read state |
| `POST …/vcs/commit` (`message`, optional workflow `files`), `/branches`, `/checkout`, `/restore` | write state |
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

The sidecar listens on `127.0.0.1` only. Reaching it from a phone needs a **companion gateway** — *not built yet*, and security-sensitive, so it is specified here before any code:

- Opt-in in Settings → Companion; off by default; shows a QR `cadcamfun://pair?host=…&token=…&fp=…&name=…`.
- HTTPS only, with a per-install self-signed certificate; the phone pins its SHA-256 fingerprint from the QR (no trust-on-first-use, no plain HTTP).
- A separate **scoped token** (revocable, listed in Settings), accepted only for an allow-list of route families: `projects` (read), `vcs`, `pulls`, `actions`, `ai/chat*`. Everything else (credentials, plugins, files, billing…) is refused.
- LAN first; remote access later through a tunnel/relay that carries only the same TLS stream end-to-end.
- Offline desktop: the phone shows the last synced GitHub mirror (read-only) through `restTransport`; edits wait for the desktop.

iOS project steps (need macOS + Xcode, therefore not done here): `bunx tauri ios init` in `apps/mobile`; add a Keychain-backed `SecretStore` command (replace `browserStore`); a `fetch` implementation with certificate pinning; QR scanning plugin; App Transport Security exception for the local-network host; push notifications for PR/Actions events (APNs via GitHub-like webhook relay, later).

## 7. GitHub mirror

`restTransport` + `push`/`pull` are implemented and tested against an in-memory remote that enforces fast-forward-only updates and verifies every object hash. Not done: HTTP routes (`PUT /vcs/remote`, `POST /vcs/push|pull`), storing the token in the OS keychain (never in SQLite), mirroring PRs to GitHub PRs (`PullRequest.remoteNumber` is reserved), and a live check that GitHub's Git Data API reproduces the exact commit oid for a given author/committer date (unit tests prove the hash logic, not GitHub's behaviour).

## 8. Limits and next steps

1. Companion gateway + pairing UI in the desktop (WP4/WP5/WP6).
2. History/branches/PR panels in the desktop UI (WP6) over the new API; commit graph view.
3. Register `cam/verify`, `cam/gcode`, `ai/prompt` workflow steps; `needs`-scoped outputs if workflows grow.
4. GitHub routes and PR mirroring (§7); `deletedAt`/sync interplay with `10-release-sync.md` §5 (git history supersedes the change-log idea there).
5. Large binary assets (STL/DXF imports): store as blobs; packfile/delta compression is not implemented (object count per project stays small; revisit with real data).
6. `log` is O(history) per call and `isAncestor` walks the graph; fine for thousands of commits, add commit-graph caching if projects grow beyond that.

## 9. Change log

- v1: initial design and implementation of WP11/WP12, sidecar integration, API group, assistant tools, mobile scaffold.
