/**
 * The changes this package makes to the pinned host bundle, applied as the module is loaded (a Bun load plugin: nothing is
 * copied or written). Each patch replaces one marker that must occur exactly once. Every patch is mandatory: a bundle where
 * any marker is missing or ambiguous is refused with a report naming each patch (partial compatibility is an explicit error,
 * never a host that half works).
 *
 * 1. Images in tool results. `supportsMediaInToolResults` (nikcli `provider/transform.ts`) answers true for the Anthropic, Bedrock and Google SDKs, so a
 * tool result that carries an image (`cad`/`cam` action `vision`, the viewport capture) is sent as a `type: "content"` result
 * with a `media` item. This application routes the Anthropic protocol through the host's native executor, whose request
 * lowering (`session/llm/native-request.ts` `toolOutput`) only knows text in a tool result and refuses the request:
 * "<provider>/<model> cannot take this request: tool result content "media"". The turn failed, and so did every later one,
 * because the capture stayed in the conversation.
 *
 * With the answer false the host does what it already does for every OpenAI-shaped provider: it leaves the text in the tool
 * result and sends the images in a user message that follows it ("Attached image(s) from tool result:"), which the native
 * lowering accepts. The model gets the image either way; only the carrier changes.
 *
 * 2. Skills loaded during a turn. The host keeps loaded skills and instructions in a stable prefix and sends a change made
 * after it as a tail message carrying the whole body, on every request until the change is folded into the prefix
 * (`InstructionSync.foldDelivered`), which it does only when a turn starts. A turn here has no step cap (a `/goal` run, a
 * long build), so a skill loaded at its start was resent in full on every step: the model saw the same skills "reloaded"
 * dozens of times, said so at each step, and the bodies crowded the work out of its context. Folding also before each step
 * delivers such a change exactly once (on the step after the load) and then serves it from the prefix, as between turns.
 *
 * 3. One configuration file per Instance. Project configuration is disabled (it walks every ancestor folder), so all hosts
 * read one global file, and a project's permission map written there was read by whichever host loaded its configuration
 * next. With the patch the loader also reads `<instance directory>/nikcli.json`, the scratch file this application writes
 * for that project, and nothing else: no ancestor, no worktree file.
 *
 * 4. Registration handles. `NikCli.tools.register` dropped the handles the host's registry returns, so every publication
 * stacked another registration of each tool for the life of the process. It now answers one `close` for the batch, and
 * the runtime closes the previous batch once the next one is registered.
 *
 * 5. The environment section. The host describes a coding workspace (working directory, git, package manager, shell and
 * monitor rules), none of which exists here. The section keeps the date, the platform and the user's locale and language,
 * which the agent needs, and says what the workspace is instead. Instruction sync is untouched.
 */
export const MEDIA_RULE_MARKER = "return nativeProviders.includes(model.api.npm);"
export const STEP_INSTRUCTIONS_MARKER = "        const assembled = await InstructionSync.assemble({\n          sessionID,\n          projectID: session.projectID,"
export const INSTANCE_CONFIG_MARKER = [
  "      if (!Flag.NIKCLI_DISABLE_PROJECT_CONFIG) {",
  "        for (const resolved of projectFiles) {",
  "          result = mergeConfigConcatArrays(result, await loadFile(resolved));",
  "        }",
  "      }",
  ""
].join("\n")
export const REGISTRATION_MARKER = [
  '  const register = Effect248.fn("NikCli.tools.register")(function* (...tools) {',
  "    yield* Effect248.tryPromise({",
  "      try: () => withInstanceAsync({ directory, init: InstanceBootstrap }, () => runPromiseWithLayer(ToolRegistry.defaultLayer, withCurrentInstance(Effect248.gen(function* () {",
  "        const registry = yield* ToolRegistry.Service;",
  "        for (const tool of tools)",
  "          yield* registry.register(tool);",
  "      })))),"
].join("\n")
export const ENVIRONMENT_MARKER = "    async function environmentImpl(ctx, config) {\n      const project = ctx.project;"

/** The file the patched loader reads in each Instance's directory (`runtime.ts` writes it in the project's scratch folder). */
export const INSTANCE_CONFIG_FILE = "nikcli.json"

const ENVIRONMENT_REPLACEMENT = [
  "    async function environmentImpl(ctx, config) {",
  "      const loc = resolveLocale(config.locale);",
  "      const parts = [[",
  "        `<env>`,",
  "        `  Application: CADCAMFUN, a CAD/CAM workspace. The project is reached only through the CAD/CAM tools; there is no shell, source tree or package manager.`,",
  "        `  Platform: ${process.platform}`,",
  "        `  Today's date: ${new Date().toDateString()}`,",
  "        `  User locale: ${loc.locale}`,",
  "        `  User region: ${loc.region}`,",
  "        `  User timezone: ${loc.timezone}`,",
  "        `</env>`",
  "      ].join(`\n`)];",
  "      if (loc.replyLanguage) {",
  "        parts.push([",
  "          `<language>`,",
  "          `The user's language is ${loc.languageName} (${loc.replyLanguage}). Unless the user writes to you in another language or explicitly asks otherwise, write your responses in ${loc.languageName}.`,",
  "          `Keep code, identifiers, file paths, shell commands, and technical terms in their original form.`,",
  "          `</language>`",
  "        ].join(`\n`));",
  "      }",
  "      return parts;",
  "    }",
  "    async function nativeEnvironmentImpl(ctx, config) {",
  "      const project = ctx.project;"
].join("\n")

export interface HostPatch {
  readonly name: string
  readonly marker: string
  readonly replacement: string
}

export const HOST_PATCHES: ReadonlyArray<HostPatch> = [
  { name: "media-in-tool-results", marker: MEDIA_RULE_MARKER, replacement: "return false;" },
  { name: "fold-instructions-per-step", marker: STEP_INSTRUCTIONS_MARKER, replacement: `        InstructionSync.foldDelivered(sessionID);\n${STEP_INSTRUCTIONS_MARKER}` },
  {
    name: "instance-config-file",
    marker: INSTANCE_CONFIG_MARKER,
    replacement: `${INSTANCE_CONFIG_MARKER}      if (Flag.NIKCLI_DISABLE_PROJECT_CONFIG) {\n        result = mergeConfigConcatArrays(result, await loadFile(path120.join(ctx.directory, ${JSON.stringify(INSTANCE_CONFIG_FILE)})));\n      }\n`
  },
  {
    name: "registration-handles",
    marker: REGISTRATION_MARKER,
    replacement: [
      '  const register = Effect248.fn("NikCli.tools.register")(function* (...tools) {',
      "    return yield* Effect248.tryPromise({",
      "      try: () => withInstanceAsync({ directory, init: InstanceBootstrap }, () => runPromiseWithLayer(ToolRegistry.defaultLayer, withCurrentInstance(Effect248.gen(function* () {",
      "        const registry = yield* ToolRegistry.Service;",
      "        const handles = [];",
      "        for (const tool of tools)",
      "          handles.push(yield* registry.register(tool));",
      "        const close = () => withInstanceAsync({ directory, init: InstanceBootstrap }, () => runPromiseWithLayer(ToolRegistry.defaultLayer, withCurrentInstance(Effect248.gen(function* () {",
      "          for (const handle of handles.splice(0))",
      "            yield* handle.close;",
      "        }))));",
      "        return { close };",
      "      })))),"
    ].join("\n")
  },
  { name: "cad-environment", marker: ENVIRONMENT_MARKER, replacement: ENVIRONMENT_REPLACEMENT }
]

export type HostPatchStatus = "applied" | "missing" | "ambiguous"
export interface HostPatchReport { readonly name: string; readonly status: HostPatchStatus }

export class HostPatchError extends Error {
  constructor(readonly report: ReadonlyArray<HostPatchReport>) {
    super(`The nikcli host bundle is not compatible with this application: ${report.filter((entry) => entry.status !== "applied").map((entry) => `${entry.name} (${entry.status})`).join(", ")}. Every host patch is required.`)
    this.name = "HostPatchError"
  }
}

/** Applies every patch and reports each one; the source is returned only when all of them applied. */
export const applyHostPatches = (source: string, patches: ReadonlyArray<HostPatch> = HOST_PATCHES): { readonly report: ReadonlyArray<HostPatchReport>; readonly source?: string } => {
  let out = source
  const report = patches.map(({ name, marker, replacement }): HostPatchReport => {
    const first = out.indexOf(marker)
    if (first === -1) return { name, status: "missing" }
    if (out.indexOf(marker, first + marker.length) !== -1) return { name, status: "ambiguous" }
    out = `${out.slice(0, first)}${replacement}${out.slice(first + marker.length)}`
    return { name, status: "applied" }
  })
  return report.every((entry) => entry.status === "applied") ? { report, source: out } : { report }
}

/** The patched source; throws `HostPatchError` (with the report) when any patch does not apply. */
export const patchHostSource = (source: string): string => {
  const { report, source: patched } = applyHostPatches(source)
  if (patched === undefined) throw new HostPatchError(report)
  return patched
}

let registered = false
let lastReport: ReadonlyArray<HostPatchReport> | undefined

/** True once the host bundle was loaded with every patch applied (false when it was refused, or not loaded yet). */
export const hostPatchesApplied = (): boolean => lastReport !== undefined && lastReport.every((entry) => entry.status === "applied")
/** The report of the last load of the host bundle through the plugin, one entry per patch. */
export const hostPatchReport = (): ReadonlyArray<HostPatchReport> | undefined => lastReport

/** The host bundle's module path, in any package layout. */
export const HOST_BUNDLE_FILTER = /[\\/]@nikcli-ai[\\/]sdk-next[\\/]index\.js$/

/**
 * The patch as a Bun plugin. It is used twice, because there are two ways the bundle reaches a process: loaded from `node_modules`
 * (the dev server and the tests: `registerHostPatches`), and compiled into the sidecar executable (`bun build --compile`, see
 * `scripts/compile-sidecar.ts`). In the executable the bundle is embedded when it is built and is never loaded again, so a plugin
 * registered at run time never sees it: the patch has to be part of the build too.
 */
export const hostPatchesPlugin = {
  name: "cadcam-nikcli-host-patches",
  setup: (build: { onLoad: (options: { filter: RegExp }, callback: (args: { path: string }) => Promise<{ contents: string; loader: "js" } | undefined>) => void }) => {
    build.onLoad({ filter: HOST_BUNDLE_FILTER }, async ({ path }) => {
      const bun = (globalThis as { Bun?: { file: (path: string) => { text: () => Promise<string> } } }).Bun
      if (bun === undefined) return undefined
      const { report, source } = applyHostPatches(await bun.file(path).text())
      lastReport = report
      // Refusing here fails the import (and the compile) with the report, instead of running a host that half works.
      if (source === undefined) throw new HostPatchError(report)
      return { contents: source, loader: "js" }
    })
  }
}

/** Registers the plugin once per process; a no-op outside Bun. */
export const registerHostPatches = (): void => {
  if (registered) return
  registered = true
  const bun = (globalThis as { Bun?: { plugin?: (plugin: unknown) => void } }).Bun
  bun?.plugin?.(hostPatchesPlugin)
}
