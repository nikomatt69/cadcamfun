/**
 * The one change this package makes to the pinned host bundle, applied as the module is loaded (a Bun load plugin: nothing is
 * copied or written, and a bundle that no longer contains the marker is loaded unchanged).
 *
 * `supportsMediaInToolResults` (nikcli `provider/transform.ts`) answers true for the Anthropic, Bedrock and Google SDKs, so a
 * tool result that carries an image (`cad`/`cam` action `vision`, the viewport capture) is sent as a `type: "content"` result
 * with a `media` item. This application routes the Anthropic protocol through the host's native executor, whose request
 * lowering (`session/llm/native-request.ts` `toolOutput`) only knows text in a tool result and refuses the request:
 * "<provider>/<model> cannot take this request: tool result content "media"". The turn failed, and so did every later one,
 * because the capture stayed in the conversation.
 *
 * With the answer false the host does what it already does for every OpenAI-shaped provider: it leaves the text in the tool
 * result and sends the images in a user message that follows it ("Attached image(s) from tool result:"), which the native
 * lowering accepts. The model gets the image either way; only the carrier changes.
 */
export const MEDIA_RULE_MARKER = "return nativeProviders.includes(model.api.npm);"
const MEDIA_RULE_REPLACEMENT = "return false;"

/** Applies the patch; undefined when the source has no (or more than one) place to apply it, so nothing is guessed. */
export const patchHostSource = (source: string): string | undefined => {
  const first = source.indexOf(MEDIA_RULE_MARKER)
  if (first === -1 || source.indexOf(MEDIA_RULE_MARKER, first + MEDIA_RULE_MARKER.length) !== -1) return undefined
  return `${source.slice(0, first)}${MEDIA_RULE_REPLACEMENT}${source.slice(first + MEDIA_RULE_MARKER.length)}`
}

let registered = false
let applied = false

/** True once the host bundle was loaded through the patch (false when it was loaded unchanged, or not yet). */
export const hostPatchesApplied = (): boolean => applied

/** Registers the load plugin once per process; a no-op outside Bun. */
export const registerHostPatches = (): void => {
  if (registered) return
  registered = true
  const bun = (globalThis as { Bun?: { plugin?: (plugin: unknown) => void; file: (path: string) => { text: () => Promise<string> } } }).Bun
  if (bun?.plugin === undefined) return
  bun.plugin({
    name: "cadcam-nikcli-host-patches",
    setup: (build: { onLoad: (options: { filter: RegExp }, callback: (args: { path: string }) => Promise<{ contents: string; loader: "js" } | undefined>) => void }) => {
      build.onLoad({ filter: /[\\/]@nikcli-ai[\\/]sdk-next[\\/]index\.js$/ }, async ({ path }) => {
        const patched = patchHostSource(await bun.file(path).text())
        if (patched === undefined) return undefined
        applied = true
        return { contents: patched, loader: "js" }
      })
    }
  })
}
