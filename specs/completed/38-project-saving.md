# 38 — Project saving: how CAD and CAM reach the stored project, autosave, and recovery

Status: built (2026-10-24). Scope: `apps/desktop/src/features/projects`, `shared/state/autosave.ts`,
`features/cad/lib/{projectSnapshot,stored-revision,document-setup,draft,open-drawing}.ts`,
`features/cam/lib/saved-program.ts`, `apps/sidecar/src/repos/drawing-repo.ts`, `packages/api/src/groups/drawings.ts`.

## 1. What was there, and what was wrong with it

A project is a `Project` row that owns drawings, components, toolpaths and materials. The editor's state lives in module
stores (`useElementsStore`, `useLayerStore`, `useCADStore`, `useCamStore`, `useGeneratorStore`); the document store says
which `projectId`/`drawingId` is open.

| Resource | Saved by | Problem found |
|---|---|---|
| Drawing (CAD) | `syncProjectContents` → `PUT /api/drawings/:id` (only from the Save button / Ctrl+S on the CAD page) | blind write: replaced the whole `data`, so it **dropped server-owned fields** (the stock the assistant configured) and **overwrote** anything the assistant, the phone or another window had stored meanwhile |
| Layers, work origin, raw piece (workpiece), machine | layers were written but never read back; workpiece/origin/machine were not written at all | lost on reopen |
| CAM program | `SaveCamModal` only (dialog) | no way to update in place without the dialog; no autosave |
| Unsaved scratch drawing | nowhere | lost on close or crash |
| History | `DrawingVersion` table existed, nothing wrote it | a bad save could not be undone |
| Dirty state | none (only the CAM program had an editor/stored revision pair) | no indicator, no guard on close/update |

## 2. Design

One scheduling engine, two bindings, one stored-copy protocol.

```
shared/state/autosave.ts            createAutosave({ revision, save, enabled, intervalMs, canSave })
features/projects/lib/project-session.ts
    session.document   → drawing  (revision = hash of the payload that would be stored)
    session.program    → CAM program (revision = camEditorRevision())
    session.saveAll / saveInteractive / flush / start
```

### 2.1 Engine rules (`autosave.ts`)

- one write at a time; a request during a write runs after it, against the content as it is then;
- the saved revision is the one the write *carried*: an edit made during a write leaves the resource `dirty`, never `clean`;
- the interval timer is armed when the resource turns dirty and is **not** pushed back by further edits, so continuous editing
  still saves every interval and a crash loses at most one interval of work;
- a failed write keeps the resource dirty, is reported, and is retried with a doubling delay (15 s … 5 min); an error with
  `retryable === false` (a conflict, a missing destination) waits for the user;
- `canSave() === false` (no project yet) keeps the resource dirty and the timer idle.

### 2.2 Drawing

- **Revision**: `payloadRevision(drawingPayload(app))` plus the library component count; the selection is excluded (selecting a
  part is not an unsaved change). Inputs are compared by reference first, so hashing only happens after a real change.
- **Stored-copy protocol**: the editor remembers the `updatedAt` of the stored drawing it last saw (`stored-revision.ts`: set when
  a drawing is opened, read back by `reconcileFromStored`, or saved). A save sends it as `baseUpdatedAt`; the sidecar answers
  **409 Conflict** if anyone saved since. On a conflict the editor runs the existing `reconcileFromStored` (three-way merge of the
  assistant's elements into the open drawing) and writes again, up to 3 attempts, then raises a non-retryable
  `DocumentConflict`.
- **`mergeData: true`**: the editor save merges its keys into the stored document instead of replacing it, so the configured stock
  and any other key the editor does not own survive.
- **What travels with the drawing** (`drawingPayload`): `elements`, `layers`, `settings` (units, tolerance), **`setup`**
  (`workpiece`, `originOffset`, `selectedMachine`), `version`. `applyStoredDrawing` restores all of it on open and on restore.
- **Components**: the library components are added to the project by a manual save and whenever the local library grew; an
  unattended save does not list or create them.
- **Restore points**: the sidecar keeps the document a save replaced as a `DrawingVersion` when the newest one is older than
  10 minutes (30 kept, oldest pruned; tune with `CADCAMFUN_VERSION_INTERVAL_MS` / `CADCAMFUN_VERSION_LIMIT`). `updatedAt` is
  strictly increasing per drawing/toolpath, so two saves in one millisecond cannot be mistaken for one by the compare-and-swap; a restore (`POST /api/drawings/:id/versions/:versionId/restore`) first keeps the current
  document, so a restore can itself be undone. The CAD toolbar's history button opens the list.
- **Scratch work** (no project): cannot be autosaved. It is written to a recovery draft (`draft.ts`, one localStorage slot,
  debounced 1.2 s; an empty drawing clears it) and offered back — restored with a toast — the next time the CAD page opens with
  nothing requested. The status shows it as "Unsaved · not in a project".

### 2.3 CAM program

- Only a program that has a stored row (`savedProgram`) is autosaved: `updateSavedProgram` (also used by the dialog's "update"
  path, so there is one write path) snapshots the program, keeps the replaced one as a toolpath version (always for a manual
  save; at most every 10 minutes for autosave), then updates the row and records the written revision as the new baseline.
- The program write is a server-side compare-and-swap too: `PUT /api/toolpaths/:id` accepts `baseUpdatedAt` (409 `Conflict`), so a
  save cannot overwrite a program stored after the editor read it. Autosave **never** overwrites a program that changed elsewhere
  (`ProgramConflict`, non-retryable; the manual save overwrites and keeps the other version) and never replaces post-processed text the user saved from the Post tab (`savedProgram.postProcessed`).
- Ctrl+S on the CAM page updates a saved program in place (and the drawing it belongs to); otherwise it opens the dialog.

### 2.4 Linking

`saveAll` saves the drawing first, then the program; the toast says which of them were written. The summary shown in the status
line is the worst state of the two (`error` > `saving` > `dirty` > `clean`). The program is tied to its drawing through
`savedProgram.drawingId`, and the sidecar's `configureStock` already invalidates programs generated against a changed stock.

### 2.5 Window lifecycle

`session.start()` (called by the shell) flushes dirty work when the page is hidden (`visibilitychange`), on `pagehide`, and
asks `beforeunload`; in the Tauri shell `onCloseRequested` writes first (8 s limit) and closes with `destroy()` (permission
`core:window:allow-destroy`); a second close request within 20 s closes anyway, so the window is never trapped.
The close handler is `closeGuard` (`window-guard.ts`, unit-tested). Updates: `app/UpdatePrompt.tsx` listens to the shell's
`update://status`, and `installPendingUpdate` (`app/updates.ts`) writes unsaved work, then calls `install_update` with
`unsavedWork = session.hasUnsavedWork()`, so the shell refuses only what could not be written.

### 2.6 Settings

`autosave` (default on) and `autosaveMinutes` (1, 2, 5, 10, 15, 30; default 2) in the Settings → Language/General tab; the
status line shows `Saved 14:32` / `Unsaved changes` / `Saving…` / `Save failed` and a click saves now.

## 3. API additions

- `PUT /api/drawings/:id` accepts `baseUpdatedAt` (→ 409 `Conflict`) and `mergeData`; `PUT /api/toolpaths/:id` accepts `baseUpdatedAt` (→ 409).
- `GET /api/drawings/:id/versions`, `POST /api/drawings/:id/versions/:versionId/restore`.

## 4. Tests

`apps/desktop/test/autosave.test.ts` (engine, fake clock), `apps/desktop/test/project-session.test.ts` (real sidecar: merge on
conflict, stock preserved, setup/layers round trip, restore points, draft, CAM conflict and manual overwrite, `saveAll`),
`pushLiveDrawing` (the assistant's write) is a read-modify-write on `baseUpdatedAt` with up to 3 retries. The suite also proves the interval end to end
with real timers. Tests: `apps/sidecar/test/drawings.test.ts` (409, restore points and retention, merge, toolpath 409), `apps/desktop/test/window-guard.test.ts`
(close guard, update install), and the status-line / settings test at the end of `project-session.test.ts`.

## 4b. Verified in a real browser (2026-10-24)

The real sidecar process (`bun apps/sidecar/src/main.ts`), the Vite dev app and headless Chromium (Playwright) were run together
against a throw-away data directory. Observed: the status line reads `Saved hh:mm` after the drawing loads and stays clean; an edit
through the page's own store turns it to `Unsaved changes`; clicking it saves (stored value updated); Ctrl+S saves; a phone-style
write made between two saves is merged (both elements stored, the editor's edit kept); the interval set to 1 minute in the real
Settings UI fired an autosave exactly 60 s after the edit; one restore point existed afterwards. The Tauri-only parts (window
close, update banner) were exercised over a mocked IPC, not in a packaged window.

## 5. Open items

- Components and materials are per-project rows written on demand; they have no dirty state of their own.
- The Tauri paths (`onCloseRequested` → save → `destroy`, the `update://status` banner, `install_update` with `unsavedWork`) are
  tested through Tauri's real JS API over a mocked IPC (`apps/desktop/test/tauri-wiring.test.ts`); they have not been run in a
  packaged native window, which needs a manual check: edit a stored drawing and close the window at once.
