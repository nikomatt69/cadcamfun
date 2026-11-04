/** Every corpus entry of every kind (`history`, `cam-program`), and the one way to run any of them. */
import { CAM_CORPUS, camManifestProblems, runCamEntry, type CamProgramEntry } from "./cam-runner.ts"
import { CORPUS, REFUSALS, manifestProblems, runEntry, type CorpusEntry, type EntryResult } from "./runner.ts"

export type AnyEntry = CorpusEntry | CamProgramEntry

export const ALL_CORPUS: ReadonlyArray<AnyEntry> = [...CORPUS, ...CAM_CORPUS]

export const allManifestProblems = (): string[] => [
  ...manifestProblems(CORPUS, REFUSALS), ...camManifestProblems(CAM_CORPUS),
  ...ALL_CORPUS.flatMap((e, i) => (ALL_CORPUS.findIndex((o) => o.id === e.id) === i ? [] : [`${e.id}: duplicate id across kinds`]))
]

export const runAny = (entry: AnyEntry): EntryResult => (entry.kind === "cam-program" ? runCamEntry(entry) : runEntry(entry))
