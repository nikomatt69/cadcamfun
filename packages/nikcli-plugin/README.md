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

or `CADCAMFUN_URL`, `CADCAMFUN_TOKEN` and `CADCAMFUN_PROJECT` in the environment. Create the token in the application (Settings → AI → Standalone nikcli): it is for the open project, read-only or read-write, opens only
the action bridge, expires, and can be revoked there. (The application's own launch token also works and opens everything; prefer a scoped one.)

## What it will not do

- **Delete or replace work** (`cad_edit` `delete`, `library_edit` `delete`, `vcs_edit` `restore`, ...): in the application the host asks
  a person first, an outside client has no such prompt, and a `confirm: true` in the arguments is not an approval. The refusal says so.
- **Delegate** to the specialist agents (`agent`): they run model sessions inside the application.
- **Go beyond its scope**: a bridge token is for one project and, when read-only, reaches only read actions. The operator can narrow
  further with nikcli policy statements in `<data dir>/ai/policy.json` (`bridge.use`, `tool.use`).

## Compatibility

`test/compat.test.ts` reads the shapes this package relies on (`Plugin`, `PluginModule`, `Hooks.tool`, `tool()`) from
`@nikcli-ai/plugin`'s declarations in the repo's `.nikcli/` folder. `apps/sidecar/test/nikcli-plugin.test.ts` runs the plugin against the
real sidecar routes.
