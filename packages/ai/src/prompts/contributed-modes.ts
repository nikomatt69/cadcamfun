/**
 * Assistant modes plugins contribute (spec 09-plugins.md, assistant extensions): the mode ids a conversation may pick beyond
 * the built-in `MODE_PROMPTS`. The sidecar reads them from the enabled plugins' manifests; `AiService` reads this service
 * optionally, so a build without plugins — tests, the direct path — resolves modes exactly as before.
 */
import { Context, Layer } from "effect"

/** One contributed mode: the id conversations address, the picker's labels, and the prompt block itself. */
export interface ContributedMode {
  /** `<plugin id>:<mode id>`; namespaced so a contributed mode can never shadow a built-in one. */
  readonly id: string
  readonly title: string
  readonly description: string
  /** The system-prompt block, appended where a built-in mode's would be. */
  readonly instructions: string
  readonly pluginId: string
  readonly pluginName: string
}

/** The contributed modes of the enabled plugins; read per chat, so a plugin toggle applies from the next turn. */
export class AiModes extends Context.Service<AiModes, { readonly modes: () => ReadonlyArray<ContributedMode> }>()("cadcamfun/AiModes") {
  /** No plugins: every mode id resolves the built-in way. */
  static readonly empty: Layer.Layer<AiModes> = Layer.succeed(AiModes, AiModes.of({ modes: () => [] }))
}

/** The lookup `systemPrompt`/`turnSystemPrompt` read: contributed mode id → prompt block (`undefined` when there are none). */
export const modeTable = (modes: ReadonlyArray<ContributedMode>): Readonly<Record<string, string>> | undefined => {
  if (modes.length === 0) return undefined
  return Object.fromEntries(modes.map((mode) => [mode.id, mode.instructions]))
}
