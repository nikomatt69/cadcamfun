import { hashObject, type ObjectType, type Oid } from "./object.ts"

export interface StoredObject {
  readonly type: ObjectType
  readonly body: Uint8Array
}

/**
 * Persistence boundary. Synchronous on purpose: the sidecar backs it with `bun:sqlite`
 * (two tables, `GitObject` and `GitRef`) and the in-memory version backs the tests.
 * Objects are immutable and content-addressed, so `put` is idempotent.
 */
export interface Backend {
  hasObject(oid: Oid): boolean
  getObject(oid: Oid): StoredObject | undefined
  putObject(oid: Oid, object: StoredObject): void
  getRef(name: string): Oid | undefined
  setRef(name: string, oid: Oid): void
  deleteRef(name: string): void
  listRefs(prefix: string): Record<string, Oid>
  /** Symbolic HEAD: the full ref name it points at, e.g. `refs/heads/main`. */
  getHead(): string
  setHead(ref: string): void
}

export const putObject = (backend: Backend, type: ObjectType, body: Uint8Array): Oid => {
  const oid = hashObject(type, body)
  if (!backend.hasObject(oid)) backend.putObject(oid, { type, body })
  return oid
}

export const memoryBackend = (): Backend => {
  const objects = new Map<Oid, StoredObject>()
  const refs = new Map<string, Oid>()
  let head = "refs/heads/main"
  return {
    hasObject: (oid) => objects.has(oid),
    getObject: (oid) => objects.get(oid),
    putObject: (oid, object) => void objects.set(oid, object),
    getRef: (name) => refs.get(name),
    setRef: (name, oid) => void refs.set(name, oid),
    deleteRef: (name) => void refs.delete(name),
    listRefs: (prefix) => Object.fromEntries([...refs].filter(([k]) => k.startsWith(prefix))),
    getHead: () => head,
    setHead: (ref) => {
      head = ref
    },
  }
}
