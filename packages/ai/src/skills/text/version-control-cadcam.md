# Version control for the agent

Every project has a repository with a first commit on `main`. The cadcam agent edits and commits on the checked-out branch, `main` included. A branch is never required before editing.

## Order of operations

1. vcs action status: branch, dirty files, open pull requests.
2. Make the CAD and CAM edits.
3. Commit with a short imperative message saying what and why.
4. Only when the user asks for a reviewable change: start a change on an `ai/<topic>` branch before editing (it needs a clean working copy), commit there, then open the pull request with a title and body. This triggers the `pullRequest` workflows.

## Refused actions

- Merging a pull request into `main` for an AI actor: a person merges.
- Merging a pull request whose latest verdict is `request-changes`.
- Pushing to GitHub: a person does that.

## Diff

vcs action diff returns entity-level changes (property path, before, after). Read it before writing a commit message or a pull request body.

## Restore

vcs_edit action restore rolls named ids back to an earlier commit on the checked-out branch. Use it when a `RebuildFailed` is faster to revert than to repair.
