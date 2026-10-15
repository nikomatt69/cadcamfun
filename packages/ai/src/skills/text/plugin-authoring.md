# Programming extensions (plugins)

When the user wants the app to do something new (a parametric generator, a custom post-processor, a command), write a plugin. A plugin is a folder with `plugin.json` and an ES module entry. It cannot be installed by a tool: give the user the files and tell them to add the folder in Plugins.

## plugin.json
- `id` reverse-DNS (`com.company.name`), `name`, `version` semver, `apiVersion: "1"`, `entry` (e.g. `index.js`).
- `capabilities`, only what the code uses: `drawing:read`, `drawing:write` (implies read), `toolpath:read`, `storage`, `ui:panel`.
- `contributes`: `commands` [{id, title, keybinding?}], `panels` [{id, title, entry}], `postProcessors` [{id, title, entry}: exported `(program, options) => string`], `operations` [{id, title, entry}: exported `{ schema, generate }`].

## Module
`export default definePlugin({ manifest, activate(ctx) { ... return () => cleanup } })`. Inside `activate` get each surface with `requireCapability(ctx, "drawing:write", "drawing")` (it throws a clear error when the manifest did not ask for it). Register commands and panels with `ui.registerCommand` / `ui.registerPanel`; keep state in `storage`; undo everything in the returned cleanup.

## Rules
- Units are mm and radians, like the tools. Pure functions for geometry so they can be tested.
- Ask for the least capability; no network, no files outside the plugin's own storage.
- Give a short test: the SDK has a test host, so show how to activate the plugin with it and assert what it registered.
- If the need is a one-off model or operation, do it with the tools instead; a plugin is for something the user will repeat.
