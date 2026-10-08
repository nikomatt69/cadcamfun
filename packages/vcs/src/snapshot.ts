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
 *   materials/<id>.json tools/<id>.json machine-configs/<id>.json   (library items the toolpaths use)
 *   costs/<id>.json                                                 (production cost estimates of the toolpaths)
 *   .cadcamfun/workflows/<name>.yml        (see @cadcamfun/workflow)
 */
export type Entity = { readonly id: string } & Readonly<Record<string, unknown>>

export interface ProjectSnapshot {
  readonly project: Readonly<Record<string, unknown>>
  readonly drawings: readonly Entity[]
  readonly components: readonly Entity[]
  readonly toolpaths: readonly Entity[]
  /** Library items referenced by the project's toolpaths, versioned with it so a restored toolpath finds its material, tool and machine. */
  readonly materials?: readonly Entity[]
  readonly tools?: readonly Entity[]
  readonly machineConfigs?: readonly Entity[]
  /** Production cost estimates of the project's toolpaths. */
  readonly costs?: readonly Entity[]
  /** Extra text files stored verbatim (workflows, README, generated G-code…), by repository path. */
  readonly extra?: Readonly<Record<string, string>>
}

/** Directory in the repository for each entity list of the snapshot. */
const LISTS = [
  ["drawings", "drawings"], ["components", "components"], ["toolpaths", "toolpaths"],
  ["materials", "materials"], ["tools", "tools"], ["machineConfigs", "machine-configs"], ["costs", "costs"],
] as const
export type SnapshotList = (typeof LISTS)[number][0]
export const ENTITY_DIRECTORIES: readonly string[] = LISTS.map(([, dir]) => dir)
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

export const snapshotToFiles = (s: ProjectSnapshot): Record<string, string> => {
  const files: Record<string, string> = { ...s.extra, "project.json": canonicalJson(s.project) }
  for (const [list, dir] of LISTS) {
    for (const entity of s[list] ?? []) {
      if (!SAFE_ID.test(entity.id)) throw new Error(`Unsafe entity id ${JSON.stringify(entity.id)}`)
      files[`${dir}/${entity.id}.json`] = canonicalJson(entity)
    }
  }
  return files
}

export const filesToSnapshot = (files: Readonly<Record<string, Uint8Array | string>>): ProjectSnapshot => {
  const text = (v: Uint8Array | string): string => (typeof v === "string" ? v : toText(v))
  const lists: Record<SnapshotList, Entity[]> = { drawings: [], components: [], toolpaths: [], materials: [], tools: [], machineConfigs: [], costs: [] }
  const extra: Record<string, string> = {}
  let project: Record<string, unknown> = {}
  for (const path of Object.keys(files).sort()) {
    const content = text(files[path]!)
    const found = LISTS.find(([, dir]) => path.startsWith(`${dir}/`) && path.endsWith(".json"))
    if (path === "project.json") project = JSON.parse(content) as Record<string, unknown>
    else if (found) lists[found[0]].push(JSON.parse(content) as Entity)
    else extra[path] = content
  }
  return { project, ...lists, extra }
}

export type { BlobFiles }
