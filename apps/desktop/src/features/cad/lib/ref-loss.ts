/**
 * Lost references on the parametric timeline (spec 41 N7/N8, desktop side). A feature that selects a face or an edge by a persistent
 * reference fails with the kernel's `reference lost: <ref>: <why>` error when that entity is gone, and names the feature that removed
 * it when the replay knows (`history-refs.ts` `lookupRef`). The timeline marks such a feature with a badge and links to the culprit,
 * as a CAD timeline flags a broken reference instead of leaving it to be read from an error line.
 *
 * The kernel's issue carries no code, so the stable prefix of its message is what is read; a message without it is not a lost
 * reference, and nothing is guessed from other errors.
 */
export interface RefLoss {
  /** The reference text, `kind:body|key`. */
  readonly ref: string
  /** The feature after which the entity no longer existed, when the replay could say. */
  readonly lostBy?: string
}

const LOST = /^reference lost: ((?:face|edge|vertex):[^\s:]+(?:\|[^\s:]+)?):/
const REMOVED_BY = /removed by '([^']+)'/

export const refLossOf = (message: string): RefLoss | undefined => {
  const lost = LOST.exec(message)
  if (lost === null) return undefined
  const by = REMOVED_BY.exec(message.slice(lost[0].length))
  return { ref: lost[1]!, ...(by !== null ? { lostBy: by[1]! } : {}) }
}

/** The lost references of one feature, in issue order, each reference once. */
export const refLossesOf = (issues: ReadonlyArray<{ readonly feature: string; readonly message: string }>, feature: string): ReadonlyArray<RefLoss> => {
  const seen = new Set<string>()
  const out: RefLoss[] = []
  for (const issue of issues) {
    if (issue.feature !== feature) continue
    const loss = refLossOf(issue.message)
    if (loss === undefined || seen.has(loss.ref)) continue
    seen.add(loss.ref)
    out.push(loss)
  }
  return out
}
