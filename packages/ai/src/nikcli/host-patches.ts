/**
 * The changes this package makes to the pinned host bundle, applied as the module is loaded (a Bun load plugin: nothing is
 * copied or written). Each patch replaces one marker that must occur exactly once; a bundle that no longer contains a marker
 * keeps that part unchanged, and one with none of them is loaded as it is.
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
 */
export const MEDIA_RULE_MARKER = "return nativeProviders.includes(model.api.npm);"
const MEDIA_RULE_REPLACEMENT = "return false;"
export const STEP_INSTRUCTIONS_MARKER = "        const assembled = await InstructionSync.assemble({\n          sessionID,\n          projectID: session.projectID,"
const STEP_INSTRUCTIONS_REPLACEMENT = `        InstructionSync.foldDelivered(sessionID);\n${STEP_INSTRUCTIONS_MARKER}`

const PATCHES: ReadonlyArray<readonly [marker: string, replacement: string]> = [
  [MEDIA_RULE_MARKER, MEDIA_RULE_REPLACEMENT],
  [STEP_INSTRUCTIONS_MARKER, STEP_INSTRUCTIONS_REPLACEMENT]
]

/** Applies every patch whose marker occurs exactly once; undefined when none applies, so nothing is guessed. */
export const patchHostSource = (source: string): string | undefined => {
  let out = source, any = false
  for (const [marker, replacement] of PATCHES) {
    const first = out.indexOf(marker)
    if (first === -1 || out.indexOf(marker, first + marker.length) !== -1) continue
    out = `${out.slice(0, first)}${replacement}${out.slice(first + marker.length)}`
    any = true
  }
  return any ? out : undefined
}

let registered = false
let applied = false

/** True once the host bundle was loaded through the patch (false when it was loaded unchanged, or not yet). */
export const hostPatchesApplied = (): boolean => applied

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
      const patched = patchHostSource(await bun.file(path).text())
      if (patched === undefined) return undefined
      applied = true
      return { contents: patched, loader: "js" }
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
