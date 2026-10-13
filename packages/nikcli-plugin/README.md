# @cadcamfun/nikcli-plugin

A standalone [nikcli](https://github.com/) (terminal, another machine, CI) driving a **running CADCAMFUN**: the application's CAD/CAM
action catalogue as nikcli tools. Same tool ids and descriptions as the in-app assistant (`cad`, `cad_edit`, `cam`, `cam_edit`,
`library`, `parts`, `library_edit`, `memory`, `memory_edit`, `research`, `vcs`, `vcs_edit`), each carrying its actions behind `action`.

The list is read from the running application (`GET /api/ai/actions`), so the plugin never holds a second copy of the catalogue.
Calls go to `POST /api/ai/actions/invoke` and run the very tool definitions the embedded host registers, as the account that holds
the token, in the project you name.

## Use

```jsonc
// nikcli config
{ "plugin": [["file:///path/to/packages/nikcli-plugin/src/index.ts", { "url": "http://127.0.0.1:43111", "token": "<launch token>", "projectId": "<project id>" }]] }
```

or `CADCAMFUN_URL`, `CADCAMFUN_TOKEN` and `CADCAMFUN_PROJECT` in the environment. The token is the one the application was launched
with (the same bearer the windows use).

## What it will not do

- **Delete or replace work** (`cad_edit` `delete`, `library_edit` `delete`, `vcs_edit` `restore`, ...): in the application the host asks
  a person first, an outside client has no such prompt, and a `confirm: true` in the arguments is not an approval. The refusal says so.
- **Delegate** to the specialist agents (`agent`): they run model sessions inside the application.
- **Scope a token** to a project or to read-only: the token is the application's own bearer. Revocable, scoped tokens for external
  agents are the open part of RM-11 (`specs/roadmap/11-nikcli-bridge.md`).

## Compatibility

`test/compat.test.ts` reads the shapes this package relies on (`Plugin`, `PluginModule`, `Hooks.tool`, `tool()`) from
`@nikcli-ai/plugin`'s declarations in the repo's `.nikcli/` folder. `apps/sidecar/test/nikcli-plugin.test.ts` runs the plugin against the
real sidecar routes.
