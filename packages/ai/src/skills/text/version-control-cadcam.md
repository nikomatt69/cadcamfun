# Version control for the agent

CAD/CAM edits do not require a branch or commit. Work on the checked-out branch, main included. Use version-control tools when requested or needed for a specific recovery; do not add repository preparation to every modelling task. A requested restore, commit or review still depends on its history action succeeding.

## Order of operations

1. Make and verify the requested CAD/CAM edits. Preserve pre-existing unrelated work.
2. Commit only when requested: inspect vcs action status/diff, then vcs_edit action commit with an imperative message saying what changed and why. Report the actual returned commit id.
3. For a requested review branch, use vcs_edit action start_change before editing (it requires a clean working copy), then commit and open the pull request. Do not discard existing work to obtain a clean branch. Opening the PR triggers pullRequest workflows.
4. An engineering checkpoint uses vcs_edit action checkpoint; it captures state without moving the branch. Saved state is not proof that its NC is currently verified.

## Refused actions

- Merging a pull request into `main` for an AI actor: a person merges.
- Merging a pull request whose latest verdict is `request-changes`.
- Pushing to GitHub: a person does that.

## Diff

vcs action diff returns entity-level changes (property path, before, after). Read it before writing a commit message or a pull request body.

## Restore

vcs_edit action restore rolls named ids back to an earlier commit; restore_checkpoint replaces an engineering checkpoint. Restore only on explicit request and native approval. Inspect available checkpoints and current expectedRevision before a checkpoint restore; afterward NC evidence may be stale and needs checking. Never silently revert a failed rebuild or unrelated edits.

## When version control fails

Report the failed action once and continue independent CAD/CAM work. A requested commit/restore/PR remains unfinished until it succeeds; do not report it as complete. Never retry unchanged failures or replay an ambiguous write before inspecting its outcome.
