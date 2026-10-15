# Workflows in cadcamfun

A `.cadcamfun/workflows/*.yml` file defines one workflow. Triggers (`on:`) are `push`, `pullRequest` or `manual`. Jobs run steps in order; a step may read an earlier step's outputs with `${{ steps.<id>.outputs.<key> }}`.

## Registered steps

- `project/validate`: every entity JSON parses, its id matches the file name, and it has a name.
- `project/require-gcode`: every toolpath has committed G-code.
- `cam/verify`: replays each program through the verifier; fails on errors.
- `cam/gcode`: regenerates each program from its stored request and compares with the committed G-code; fails when stale.

An unknown `uses:` fails the workflow before any step runs.

## Dispatching

- vcs_edit action run_workflows runs the manual workflows on the checked-out branch and returns their run ids.
- `pullRequest` workflows fire when a pull request is opened.
- `push` workflows fire on commit.

## Example

```yaml
name: validate-and-cut
on:
  push: { branches: [main, "ai/**"], paths: ["toolpaths/**"] }
  pullRequest: { branches: [main] }
jobs:
  qa:
    steps:
      - id: v  uses: project/validate
      - id: rg uses: cam/gcode
      - id: vf uses: cam/verify
      - id: m  uses: project/require-gcode
```

## Reading a run

Each run reports job-start, step and job-end events. A step has `uses`, a status (`success`, `failure` or `skipped`), and an optional message and outputs. A failing step never hides the verdict of the steps before it.
