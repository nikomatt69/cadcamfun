# AI-03 - Native workspace synchronization and review

Status: **specified; implementation pending**.
Stack: Effect **4.0.0-rc.112** and nikcli **@nikcli-ai/sdk-next 1.428.0** throughout.

## Authority and dependencies

Controlling step: [RM-04](../roadmap/04-desktop-parity.md), following [the existing sequence](../roadmap/README.md) and [process](../roadmap/00-how-to-follow.md).
Requires RM-03 routes for the vertical and persistent revision/receipt execution from [AI-02](02-setup-and-domain-parity.md).
Setup bindings require the relevant RM-02 setup contract; no UI invention of missing backend capabilities.
Read [umbrella](../28-native-ai-architecture.md), [UI](../06-desktop-ui.md) and [frontend parity](../12-frontend-clone-brief.md).
RM-04 implements receipt review UI; new precision geometric preview/measurement backend belongs only to [RM-09](../roadmap/09-cad-cam-depth.md).

## Source evidence

- [Approved plan](../../.nikcli/plans/1791820593388-shiny-garden.md), AI-03, calls for receipt reduction and honest review.
- [Editor sync](../../apps/desktop/src/features/ai/lib/editor-sync.ts) interprets tool-name suffixes and performs local persistent-looking undo.
- [Drawing context](../../apps/desktop/src/features/ai/lib/drawing-context.ts) pushes snapshots and has broad replacement fallback.
- [Stream](../../apps/desktop/src/features/ai/lib/stream.ts) and [store](../../apps/desktop/src/features/ai/store/store.ts) already recover via session/task polling.
- [Persisted state](../../apps/desktop/src/features/ai/store/persisted.ts) and [document store](../../apps/desktop/src/features/cad/store/documentStore.ts) are existing implementations to deepen.
Static inspection identifies risks; native responsiveness and regression success still need implementation evidence.

## Owners and contract-first amendments

- WP6: `apps/desktop/src/features/ai/`, `apps/desktop/src/features/cad/store/`, `apps/desktop/src/features/cad/lib/`, `apps/desktop/src/features/cam/store/`, `apps/desktop/src/features/cam/lib/`, `apps/desktop/test/`.
- Existing RM-04 screen scope remains `apps/desktop/src/app/` and `apps/desktop/src/features/*/screens/` when the touched vertical requires it.
- WP7 `apps/desktop/src/viewport/` is excluded unless RM-04 explicitly assigns a needed overlay integration first.
- WP3/WP4 receipt schema and execution remain RM-03-owned `packages/api/` and `apps/sidecar/`; WP0 persistence stays `packages/db/` under AI-02's amendment.
Amend RM-04 deliverables and affected UI contracts before adding review behaviour; missing backend contracts return to RM-03 owners first.
No Rust shell, mobile, core geometry or provider execution changes in this step; publication owns only this file.

## Module, Interface, Implementation

Module: deepen existing workspace synchronization/review rather than adding another editor mirror.
Interface: validated receipt/snapshot plus local document state -> apply, notify, reconcile or conflict.
Implementation: one document-scoped reducer, existing Solid stores and ApiClient adapter through the app ManagedRuntime.
Depth supplies leverage to streamed tools, reconnect recovery and human edits without exposing suffix dispatch.
Locality concentrates deduplication and revision rules; deleting the module would distribute them among transcript/render/store callers.
The receipt seam has stream and snapshot/recovery adapters; both use the same validated contract and interface tests.

## Precise contracts

- Consume authoritative versioned receipts from RM-03; committed state is never inferred from tool-name suffixes or transcript prose.
- Reducer checks receipt identity, owner/project/drawing and revision before/after before applying any persistent change.
- Duplicate receipt IDs are no-ops; matching document/base revision applies once and advances to the recorded revision.
- Another open document receives cache invalidation/notification only, never mutation of the visible canvas.
- Future/out-of-order revisions, retention gaps and unknown bases trigger authoritative snapshot reconciliation, not guessed patches.
- Preserve local unsaved edits; offer explicit reconcile/rebase/discard choices or conflict, never blind snapshot overwrite.
- Snapshot fetch/push failures distinguish forbidden, unavailable, conflict and confirmed missing-document outcomes.
- Only confirmed absence may offer explicit create/replacement with write authority; no network/auth failure automatically changes drawing.
- Persistent undo/redo crosses application execute with expected revision and yields a receipt; selection/viewport undo remains UI-owned.
- Review state is `idle`, `pending`, `accepted`, `rejected`, `stale`, `conflict` or `failed`, with document/base revision and source identity.
- Pending overlays/diffs are non-authoritative and cannot enter committed stores, exports or verified artifact state.
- Accept invokes a supported write action with current authority/revision/native approval; reject drops the candidate without a mutation.
- Existing candidates may be displayed where supported; missing precision-preview capability is visibly unavailable until RM-09.
- RM-04 must not implement a geometric candidate evaluator or claim measured quality absent backend evidence.
- Reports show requested/achieved or unsupported evidence exactly as supplied; visually attractive geometry is not an acceptance result.
- Persisted transcripts/session state decode versioned schemas, bounded content and scoped owner/document identity before restoration.
- Clear-visible-transcript is local presentation; delete-host-conversation is a distinct owner-validated operation, not silent aliasing.
- Keep native permission/question interactions and disconnect recovery; polling remains fallback until replay/push guarantees pass in RM-07.

## Deliverables

1. Replace persistent suffix mirroring with the typed receipt reducer and snapshot reconciliation.
2. Add conflict/stale/error states preserving concurrent human edits and preventing broad drawing replacement.
3. Implement existing-capability diff/overlay accept/reject UI with explicit unavailable precision-preview state.
4. Route persistent undo/redo through the authoritative mutation seam; preserve local view/selection operations.
5. Validate scoped persisted assistant state and distinguish transcript clearing from host conversation deletion.
6. Verify receipt replay, native review interactions and responsiveness while preserving the established visual language.

## Non-goals

No restyling, new routes, geometric precision backend, invented quality report, exact kernel or mobile companion work.
No second planner/provider loop, session lifecycle replacement or implementation of future RM-07 durable replay here.

## Migration and failure handling

Legacy transcript entries remain readable via explicit version decoder but cannot be replayed as authoritative mutations.
Legacy tool results without receipts request a fresh snapshot; do not synthesize trustworthy actor/revision metadata.
Document switches invalidate pending visible review state; late child outcomes stay associated with their original document.
On failed accept, keep candidate/error available without committing; unknown committed outcome reconciles by operation key.
Reopen loads DB revision before applying later receipts; corrupted persisted state is quarantined/reset locally, never sent as authority.

## Tests

Exercise reducer interface with duplicate/out-of-order receipts, other documents, late children and gap recovery.
Cover concurrent human edits, conflict/forbidden/offline snapshot errors and confirmed absence requiring explicit creation.
Assert failed/rejected/stale candidates do not commit, persistent undo/reopen matches DB, and local viewport changes do not persist.
Retain workspace/editor-sync/recovery/lifecycle/app-mount fixtures and native permission/question restoration coverage.
Run separate Tauri/WebKit review/responsiveness smoke checks; Bun DOM fixtures cannot establish native frame behaviour.

## Verify

Desktop manifest confirms `typecheck` and `build`; these are future implementation commands, run with Monitor.
Native smoke evidence is recorded separately under existing RM-04 rules; no browser/Playwright suite is introduced.

```sh
bun --no-env-file run --filter @cadcamfun/desktop typecheck
bun --no-env-file test apps/desktop/test
bun --no-env-file run --filter @cadcamfun/desktop build
git diff --check
```

## Acceptance checklist

- [ ] RM-03 receipt persistence and routes land before UI adoption.
- [ ] Duplicate/late/foreign-document receipts cannot corrupt visible or saved geometry.
- [ ] Concurrent edits, persistent undo/reopen and error-category reconciliation are verified.
- [ ] Review uses supported evidence only; new precision backend remains RM-09-owned.
- [ ] Persisted state, native UX and existing visual-language gates pass before RM-04 completion.

## Change log

- 2026-10-12: specified native receipt review and safe reconciliation; separated RM-04 UI from RM-09 precision backend; implementation pending.
