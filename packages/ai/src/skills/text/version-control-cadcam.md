# Version control for the agent

The cadcam agent edits on an `ai/<topic>` branch and opens a pull request. A person reviews and merges.

## Order of operations

1. vcs action status: branch, dirty files, open pull requests.
2. Start a change on an `ai/<topic>` branch. Do not edit on a dirty working copy.
3. Make the CAD and CAM edits.
4. Commit with a short imperative message saying what and why.
5. Open the pull request with a title and body. This triggers the `pullRequest` workflows.

## Refused actions

- Commit, restore or merge on `main` for an AI actor.
- Merging a pull request whose latest verdict is `request-changes`.
- Pushing to GitHub: a person does that.

## Diff

vcs action diff returns entity-level changes (property path, before, after). Read it before writing the pull request body.

## Restore

vcs_edit action restore rolls named ids back to an earlier commit on the current `ai/*` branch. Use it when a `RebuildFailed` is faster to revert than to repair. Not available on `main`.
