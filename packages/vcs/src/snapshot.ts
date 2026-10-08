import { canonicalJson } from "./json.ts"
import { toText } from "./object.ts"
import type { BlobFiles } from "./repository.ts"

/**
 * How a project is laid out inside the repository. One JSON file per entity keeps diffs and
 * merges local to what changed (editing a drawing never touches a toolpath), and the layout is
 * readable on github.com as-is.
 *
 *   project.json
 *   drawings/<id>.json  components/<id>.json  toolpaths/<id>.json
 *   .cadcamfun/workflows/<name>.yml        (see @cadcamfun/workflow)
 */
export type Entity = { readonly id: string } & Readonly<Record<string, unknown>>

export interface ProjectSnapshot {
  readonly project: Readonly<Record<string, unknown>>
  readonly drawings: readonly Entity[]
  readonly components: readonly Entity[]
  readonly toolpaths: readonly Entity[]
  /** Extra text files stored verbatim (workflows, README, generated G-code…), by repository path. */
  readonly extra?: Readonly<Record<string, string>>
}

const KINDS = ["drawings", "components", "toolpaths"] as const
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

export const snapshotToFiles = (s: ProjectSnapshot): Record<string, string> => {
  const files: Record<string, string> = { ...s.extra, "project.json": canonicalJson(s.project) }
  for (const kind of KINDS) {
    for (const entity of s[kind]) {
      if (!SAFE_ID.test(entity.id)) throw new Error(`Unsafe entity id ${JSON.stringify(entity.id)}`)
      files[`${kind}/${entity.id}.json`] = canonicalJson(entity)
    }
  }
  return files
}

export const filesToSnapshot = (files: Readonly<Record<string, Uint8Array | string>>): ProjectSnapshot => {
  const text = (v: Uint8Array | string): string => (typeof v === "string" ? v : toText(v))
  const lists: Record<(typeof KINDS)[number], Entity[]> = { drawings: [], components: [], toolpaths: [] }
  const extra: Record<string, string> = {}
  let project: Record<string, unknown> = {}
  for (const path of Object.keys(files).sort()) {
    const content = text(files[path]!)
    const kind = KINDS.find((k) => path.startsWith(`${k}/`) && path.endsWith(".json"))
    if (path === "project.json") project = JSON.parse(content) as Record<string, unknown>
    else if (kind) lists[kind].push(JSON.parse(content) as Entity)
    else extra[path] = content
  }
  return { project, ...lists, extra }
}

export type { BlobFiles }
