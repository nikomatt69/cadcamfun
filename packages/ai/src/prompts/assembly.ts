/**
 * The system prompt as named sections (nikcli `session/llm.ts` `Mod.PromptSection`, `session/context-breakdown.ts`).
 *
 * The prompt a model reads is still one string; this module is how the rest of the application sees it: each section keeps
 * its id, its stability class and a content hash, so a cache miss can be traced to the section that moved and a gauge can
 * show where the tokens go. It owns no prompt text.
 *
 * - `stable`: part of the agent prompt, identical for every turn of every conversation of a build.
 * - `turn`: sent with each turn, identical between turns until the user changes the mode, the model, the language or the day.
 * - `volatile`: describes the editor right now and may differ on every turn; this is what breaks a provider's prefix cache.
 */

export type SectionKind = "stable" | "turn" | "volatile"

export interface PromptSection {
  readonly id: string
  readonly kind: SectionKind
  readonly text: string
}

export interface SectionManifestEntry {
  readonly id: string
  readonly kind: SectionKind
  readonly chars: number
  /** The estimate nikcli's `Token.estimate` uses: four characters per token. */
  readonly tokens: number
  /** First 12 hex digits of the SHA-256 of the text; equal text, equal hash. */
  readonly sha: string
}

export const SECTION_SEPARATOR = "\n\n"

export const estimateTokens = (text: string): number => Math.max(0, Math.round(text.length / 4))

const sha = (text: string): string => new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 12)

/** Sections with nothing to say are not part of the prompt and not of its manifest. */
export const presentSections = (sections: ReadonlyArray<PromptSection>): ReadonlyArray<PromptSection> =>
  sections.filter((section) => section.text.trim() !== "")

/** The prompt text: the present sections in order, one blank line between them. */
export const joinSections = (sections: ReadonlyArray<PromptSection>): string =>
  presentSections(sections).map((section) => section.text).join(SECTION_SEPARATOR)

export const sectionManifest = (sections: ReadonlyArray<PromptSection>): ReadonlyArray<SectionManifestEntry> =>
  presentSections(sections).map((section) => ({
    id: section.id,
    kind: section.kind,
    chars: section.text.length,
    tokens: estimateTokens(section.text),
    sha: sha(section.text)
  }))

/** The ids whose text differs between two manifests (added, removed or changed): the answer to "what moved this turn". */
export const changedSections = (before: ReadonlyArray<SectionManifestEntry>, after: ReadonlyArray<SectionManifestEntry>): ReadonlyArray<string> => {
  const previous = new Map(before.map((entry) => [entry.id, entry.sha]))
  const next = new Map(after.map((entry) => [entry.id, entry.sha]))
  const ids = new Set([...previous.keys(), ...next.keys()])
  return [...ids].filter((id) => previous.get(id) !== next.get(id))
}
