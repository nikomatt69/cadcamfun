# 17 — AI ⇄ VCS ⇄ Workflows integration

Status: v1 — describes the integration between the AI agent (spec 16), the git-style history (`packages/vcs` + WP11), the Actions-style workflow engine (`packages/workflow` + WP12), and the iOS companion gateway (WP13). The contract points are already implemented in `apps/sidecar/src/services/{ai-vcs-tools.ts,ai.ts,project-vcs.ts,workflow-runner.ts,workflow-steps.ts,companion-gateway.ts}`; this spec records them, the limits, and the rules no future change may break without going through the spec first.

The principle: **the agent never writes to `main`, never merges, never opens a pull request a person would not have wanted to see, never runs a workflow whose effect the user did not ask for**. Every CAD/CAM change is reviewable, every G-code is verified before it lands, and every workflow run is a function of the commit being checked, not the live database.

## 1. The two-sided contract

### 1.1 The agent's side

The agent calls seven project-scoped tools, declared in `apps/sidecar/src/services/ai-vcs-tools.ts:23-79`:

| Tool | Sidecar method | Effect |
| --- | --- | --- |
| `vcs_status` | `ProjectVcs.status` + `branches` + `listPullRequests` | read state |
| `vcs_start_change` | `ProjectVcs.createBranch("ai/<slug>", "main")` then `checkout` | start a change |
| `vcs_commit` | `ProjectVcs.commit` | record one commit on the current `ai/*` branch |
| `vcs_diff` | `ProjectVcs.diff(from?, to)` | entity-level diff |
| `vcs_open_pull_request` | `ProjectVcs.openPullRequest` + `WorkflowRunner.trigger(...{type: "pull-request", base: PR.base})` | open PR, run PR workflows |
| `vcs_list_pull_requests` | `ProjectVcs.listPullRequests` + `pullRequest` | list with reviews |
| `actions_run` | `WorkflowRunner.trigger(...{type: "manual"})` | run manual workflows |

The agent can also **read** VCS state with `vcs_status` and `vcs_diff`, but **cannot** checkout, restore, merge, push to GitHub, or hold a credentials session. Those routes either refuse AI actors (`main`, `restore`, `merge`), or the companion gateway refuses them outright (`/vcs/remote`, `push`, `pull`).

### 1.2 The history's side

`packages/vcs` is a byte-compatible git implementation in TypeScript:

- `object.ts` — git loose objects (blob, tree, commit, tag) and SHA-1, identical to `git` so an oid is identical here, in `git clone`, and on GitHub (`packages/vcs/test` asserts this against the real `git` binary).
- `store.ts` — `Backend` interface; `memoryBackend` backs tests, `ProjectVcs` backs it with SQLite (`GitObject` + `GitRef`, see `13-vcs-actions-mobile.md` §4 / WP0).
- `repository.ts` — commit, log, branch, tag, checkout, fast-forward merge, 3-way merge into any local branch, `restorePaths`, `revertTo`, `mergeBase`, `isAncestor`.
- `json.ts` — canonical JSON (sorted keys, 2 spaces) and `mergeJson` for 3-way structural JSON merge.
- `diff.ts` — `describeDiff`: entity, property pointer, before/after values.
- `snapshot.ts` — project ⇄ files: drawings / components / toolpaths / materials / tools / machine-configs / costs / workflows ⇄ `*.json` files and `.cadcamfun/workflows/*.yml`.
- `github.ts` + `transport.ts` — push / fetchBranch / pull, fast-forward-only enforcement.

### 1.3 The workflow engine's side

`packages/workflow`:

- `schema.ts` — `Workflow` (Schema), `parseWorkflow(source)`, `validateGraph` (unknown `needs`, cycles, duplicate step ids), `jobLevels` (Kahn's algorithm for parallel scheduling).
- `run.ts` — `runWorkflow(w, { registry, ctx, onEvent })`, `interpolate(value, outputs)` (`${{ steps.<id>.outputs.<k> }}`), `missingSteps(w, registry)` so a typo fails the workflow before anything runs.
- `trigger.ts` — `WorkflowTrigger` (push with branch/path globs, pullRequest with branch globs, manual).

Built-in steps today (`apps/sidecar/src/services/workflow-steps.ts:158-163`):

- `project/validate` — every entity file is valid JSON, `id` matches its filename, `name` is a string.
- `project/require-gcode` — every toolpath in the commit has G-code stored.
- `cam/verify` — replay every committed G-code program through `cam.verify.verifyToolpath` (`packages/core/src/cam/verify.ts`) and fail on error.
- `cam/gcode` — regenerate every committed program and compare to the committed G-code (must match; rejects stale exports).

Planned registrations listed in `13-vcs-actions-mobile.md` §3 + `specs/14-cad-cam-parity-roadmap.md` §3: `cam/sequence`, `vcs/commit`, `notify/push`, `ai/prompt`.

## 2. The integrated flow

This is the runbook every agent action follows: a single, repeatable choreography the UI can show, the test suite can verify, and the mobile companion can replay.

### 2.1 Phases of a CAD/CAM change initiated from any surface

```
UI / phone ─► chat ─► cadcam agent ─► vcs_* / cad_* / cam_* / actions_run
                                                          │
                                            ┌─────────────┴─────────────┐
                                            ▼                           ▼
                                    per turn (live)              between turns (history)
                                    - cadcam + 4 specialists     - vcs_commit / vcs_open_pull_request
                                    - cad_* / cam_* / verifiers  - actions_run (manual / pull_request / push)
                                    - WYSIWYG in editor + CAM page
```

### 2.2 The chat turn

`POST /api/ai/chat/stream` (desktop) or the same route through the companion gateway (phone) lands on `AiService.chat` (`packages/ai/src/service.ts:264-299`):

1. Render the workspace context (`packages/ai/src/workspace-context.ts`).
2. `ensureSession(projectHost, clientSessionId)` — bind the client id to a host session (the host owns the durable session).
3. `hostChatStream({...})` — subscribe to host events, prompt the model, and stream `AiEvent`s.
4. As tool calls return, the sidecar applies them to the live project (`ai-elements.ts`, `ai-transform.ts`, `ai.ts`) **and** writes through to the SQLite working copy. The editor sees the change.

### 2.3 Starting a change

When the model calls `vcs_start_change { topic: "wider plate 20mm" }`:

1. `slug("wider plate 20mm")` → `wider-plate-20mm`.
2. `ProjectVcs.createBranch("ai/wider-plate-20mm", "main")` — idempotent: if it exists, no-op.
3. `ProjectVcs.checkout` — applies the tree to the working copy (files → entities in DB). Fails if the working copy is dirty (the sidecar checks `vcs.status`).
4. From this point on, every `cad_*`/`cam_*` tool call writes to the `ai/*` branch's working copy.

The ai/vcs/tools actor is `{ kind: "ai", userId: <signed-in user> }`. The permission gate `ProjectVcs` refuses commit/restore/merge on `main` for an AI actor (`13-vcs-actions-mobile.md` §4 "Guards").

### 2.4 Committing

When the model calls `vcs_commit { message: "enlarge plate to 80x50 + 4 holes ring 32" }`:

1. `ProjectVcs.commit({ message }, actor)` writes the working copy as a new commit on `refs/heads/ai/<topic>`.
2. `ActivityLog` appends the change so it shows up in the same audit trail as every other change.
3. The sidecar pushes the commit to `PushWorkflow.trigger` only when the message comes from a person (not from an AI). For the AI, `vcs_commit` is the upstream gate.

### 2.5 Opening a pull request

`vcs_open_pull_request { title, body }`:

1. `ProjectVcs.openPullRequest({ title, body, head: currentBranch }, actor)`.
2. **Triggers** `WorkflowRunner.trigger(projectId, currentBranch, { type: "pull-request", base: PR.base })` immediately. `runner.trigger` returns the same shape as a `push` run; trigger failures never fail the user's operation (`13-vcs-actions-mobile.md` §4).
3. Triggers persist (`apps/sidecar/src/services/workflow-runner.ts`); every run gets a `WorkflowRun` row and an event stream.

### 2.6 Run-level details

- A step handler is a pure function of the commit being checked (`ctx.files`) and its own `with:` parameters — never of the live database. A run always reports on the exact tree that was pushed (`workflow-steps.ts` §"reading a toolpath out of a commit").
- A typo in `uses:` fails the run before any step runs. `missingSteps(w, registry)` is the gate (`packages/workflow/src/run.ts:51`).
- A program that cannot be verified (a lathe job, no stored generation request) is reported as **skipped**, never as passing (`workflow-steps.ts:108-111`).
- A commit with a `request-changes` review (latest verdict per reviewer) blocks the merge; `ProjectVcs.merge` returns the conflict (`13-vcs-actions-mobile.md` §4 "Guards").

### 2.7 What a phone can do

The companion gateway (`apps/sidecar/src/services/companion-gateway.ts`) is a **separate HTTPS listener** with a per-install self-signed P-256 cert, scoped revocable device tokens, route allow-list and a per-IP rate limit (`13-vcs-actions-mobile.md` §6). The allowed routes are exactly the ones the agent needs to propose a change:

- `GET /api/health`, `GET /api/projects`
- `GET /api/projects/:id/(vcs|pulls|actions)/**`
- `GET /api/ai/status`
- `POST /api/ai/chat/stream`, `POST /api/ai/chat/abort`, `POST /api/ai/permission/reply`

Everything else (credentials, plugins, files, billing, `/api/companion`, `/vcs/remote`, push, pull) **answers 403**. So a phone-initiated change lands on `ai/*`, opens a PR, runs `pullRequest` workflows; the desktop user is the one who reviews and merges.

## 3. Rules every future change must keep

These rules are baked into tests (`packages/vcs/test/*`, `packages/workflow/test/*`, `apps/sidecar/test/companion-chat-e2e.test.ts`). Any change that breaks them is a contract change and goes through the spec first.

| Rule | Where it lives | Why |
| --- | --- | --- |
| Oid compatibility with git | `packages/vcs/test/git.test.ts` | the GitHub mirror works without a mapping layer |
| AI actors cannot commit/restore/merge on `main` | `apps/sidecar/src/services/project-vcs.ts` `actor.kind === "ai"` | a person always reviews the agent's edits |
| `request-changes` review blocks merge | `apps/sidecar/src/services/project-vcs.ts` `merge` | review verdicts are honest |
| Workflow failures never fail the user's operation | `workflow-runner.ts` `trigger` | a typo in a workflow is not a typo in the user's action |
| Unknown `uses:` fails the workflow before any step runs | `packages/workflow/src/run.ts:51` | a typo never half-applies a change |
| A step is a pure function of `ctx.files` | `workflow-steps.ts` "reading a toolpath out of a commit" | a run always reports on the commit, not the live DB |
| Phone gateway refuses credential / plugin / GitHub routes | `apps/sidecar/src/services/companion-gateway.ts` `COMPANION_ROUTES` | the phone never holds a bearer or a GitHub token |
| Phone gateway rotates device tokens; revocation cuts on the next request | `companion-gateway.ts` revocation logic | revoking a device is a real cut-off |
| Oid of a fresh commit matches what `git` would emit | `packages/vcs/test/git.test.ts` | push/pull is bit-for-bit identical to GitHub |
| `PR.remoteNumber` reserved | `packages/vcs/test/git.test.ts`, `13-vcs-actions-mobile.md` §7 | GitHub mirror of PRs is the next concrete step |

## 4. The contract surface (what the agent can call)

| Endpoint | Effect | Method | Actor |
| --- | --- | --- | --- |
| `GET /api/projects/:id/vcs/status` | branch, dirty, branches, open PRs | read | person + AI |
| `GET /api/projects/:id/vcs/log?path=…` | file history | read | person + AI |
| `GET /api/projects/:id/vcs/branches` | branches + tips | read | person + AI |
| `GET /api/projects/:id/vcs/diff?from&to` | entity-level diff | read | person + AI |
| `POST /api/projects/:id/vcs/commit` | one commit on current | write | person + AI on `ai/*` |
| `POST /api/projects/:id/vcs/branches` | create branch | write | person + AI |
| `POST /api/projects/:id/vcs/checkout` | checkout branch | write | person only |
| `POST /api/projects/:id/vcs/restore` | restore paths | write | person only |
| `GET / PUT /api/projects/:id/vcs/remote` | link a GitHub repo | write | person only |
| `POST /api/projects/:id/vcs/push` `/pull` | sync with GitHub | write | person only |
| `GET / POST /api/projects/:id/pulls` | list / open | read / write | person + AI to open |
| `POST /api/projects/:id/pulls/:n/reviews` | review | write | person only |
| `POST /api/projects/:id/pulls/:n/merge` `/close` | merge / close | write | person only |
| `GET /api/projects/:id/actions/runs` | runs of the project | read | person + AI |
| `POST /api/projects/:id/actions/dispatch` | trigger `manual` workflows | write | person + AI |
| `POST /api/ai/chat/stream` | start/continue an agent turn | write | person + phone |
| `POST /api/ai/chat/abort` | abort the running turn | write | person + phone |
| `POST /api/ai/permission/reply` | reply to a permission request | write | person + phone |

## 5. What can be improved by the roadmap (spec 20)

1. **Built-in workflow steps for the agent's job** (`13-vcs-actions-mobile.md` §8 step 3): register `cam/sequence` (check `restFrom` / `prevTool` chain), `vcs/commit` (so workflows can spawn sub-changes), `notify/push` (push notifications on PR/Actions events).
2. **GitHub mirror of PRs** (`13-vcs-actions-mobile.md` §7): `PullRequest.remoteNumber` is reserved; a future WP closes the loop.
3. **Large binary assets (STL/DXF imports)** as git blobs (`packages/vcs/test` does not exercise them yet).
4. **Commit-graph caching** if projects grow past thousands of commits (`13-vcs-actions-mobile.md` §8 step 6).
5. **Drawn commit-graph view** in the editor (`13-vcs-actions-mobile.md` §8 step 2).
6. **Actions UI on desktop** for the version control screen (`apps/desktop/src/screens`).
7. **Permissions for push-trigger workflows** that post to `notify/*`.

## 6. Change log

- v1: documents the integration as it stands (WP11 + WP12 + WP8). Citations: every tool in §1, every rule in §3, every endpoint in §4.
