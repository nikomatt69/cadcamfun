/**
 * Artifact storage for the docs assistant, on R2.
 *
 * Same layout as nikcli `packages/web/src/lib/artifact.ts`, trimmed to what
 * the docs site needs: assistant artifacts are anonymous and reachable only
 * through their `?key=` capability link, so there is no owner index and no
 * login gate.
 */

export type ArtifactKind = "html" | "markdown" | "text"

/** Public artifact metadata, returned once a viewer is authorized. */
export type ArtifactMeta = {
  id: string
  title: string
  description?: string
  filename: string
  contentType: string
  kind: ArtifactKind
  size: number
  version: number
  sessionID?: string
  author?: string
  time: { created: number; updated: number }
}

/** Stored in R2 alongside the meta; secret and viewKey never reach viewers. */
export type StoredArtifact = ArtifactMeta & {
  /** Authorizes publishing new versions. */
  secret: string
  /** Read capability carried by the share link. */
  viewKey: string
}

/** Minimal R2 surface the store uses; the Worker binding satisfies it. */
export type ArtifactBucket = {
  get(key: string): Promise<{ body: ReadableStream; size: number; httpEtag: string; json<T>(): Promise<T>; text(): Promise<string> } | null>
  put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

const KIND_BY_TYPE: Array<[RegExp, ArtifactKind]> = [
  [/^text\/html\b/, "html"],
  [/^text\/markdown\b/, "markdown"],
  [/^text\/plain\b/, "text"],
]

export function artifactKind(contentType: string): ArtifactKind | null {
  for (const [pattern, kind] of KIND_BY_TYPE) {
    if (pattern.test(contentType)) return kind
  }
  return null
}

function metaKey(id: string) {
  return `artifact/${id}/meta.json`
}

function contentKey(id: string, version: number) {
  return `artifact/${id}/v${version}`
}

export async function readArtifact(bucket: ArtifactBucket, id: string): Promise<StoredArtifact | null> {
  const object = await bucket.get(metaKey(id))
  if (!object) return null
  return object.json<StoredArtifact>()
}

export function publicMeta(stored: StoredArtifact): ArtifactMeta {
  const { secret: _secret, viewKey: _viewKey, ...meta } = stored
  return meta
}

/** Capability link to share: the bare `/artifact/{id}` page is not readable without it. */
export function artifactShareUrl(id: string, viewKey: string, origin: string | URL): string {
  const url = new URL(`/artifact/${id}`, origin)
  url.searchParams.set("key", viewKey)
  return url.toString()
}

export async function readArtifactContent(bucket: ArtifactBucket, id: string, version: number) {
  return bucket.get(contentKey(id, version))
}

export async function writeArtifact(bucket: ArtifactBucket, stored: StoredArtifact, content: ArrayBuffer): Promise<void> {
  await bucket.put(contentKey(stored.id, stored.version), content, {
    httpMetadata: { contentType: stored.contentType },
  })
  await bucket.put(metaKey(stored.id), JSON.stringify(stored), {
    httpMetadata: { contentType: "application/json" },
  })
}

/** A valid view key grants read access. */
export function canViewArtifact(stored: StoredArtifact, key: string | null) {
  return !!key && key === stored.viewKey
}
