import { CloudAsset, CloudTransfer } from "@cadcamfun/api"
import { canonicalJson, filesToSnapshot, snapshotToFiles, toText, verifyTransfer, type ProjectSnapshot } from "@cadcamfun/vcs"
import { Data, Schema } from "effect"
import { createHash } from "node:crypto"

export class CloudSyncError extends Data.TaggedError("CloudSyncError")<{
  readonly code: "invalid" | "not-found" | "conflict" | "dirty" | "unauthorized" | "remote" | "missing-asset"
  readonly message: string
}> {}

export type AssetMetadata = Omit<CloudAsset, "body">
export const ASSET_MANIFEST = ".cadcamfun/assets.json"
export const MAX_CLOUD_BODY = 64 * 1024 * 1024
export const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex")
export const safeId = (value: string): boolean => /^[A-Za-z0-9_-]{1,128}$/u.test(value)
export const safeStorageKey = (value: string): boolean => value.length > 0 && value.length < 1024 && !value.startsWith("/") && !/[\\\u0000-\u001f\u007f]/u.test(value) && value.split("/").every((p) => p !== "" && p !== "." && p !== "..")
export const metadataOf = ({ body: _body, ...metadata }: CloudAsset): AssetMetadata => metadata

const MetadataSchema = Schema.Struct({
  id: Schema.String, fileName: Schema.String, key: Schema.String, contentType: Schema.String,
  objectId: Schema.String, objectType: Schema.String, size: Schema.Number, sha256: Schema.String,
})

export const assetManifest = (files: Readonly<Record<string, Uint8Array | string>>): readonly AssetMetadata[] => {
  const raw = files[ASSET_MANIFEST]
  if (raw === undefined) return []
  try {
    return Schema.decodeUnknownSync(Schema.Array(MetadataSchema))(JSON.parse(typeof raw === "string" ? raw : toText(raw)))
  } catch {
    throw new CloudSyncError({ code: "invalid", message: "The project asset manifest is invalid" })
  }
}

/** Validates graph integrity, project ownership boundaries and every required asset before any SQL mutation. */
export const verifyCloudTransfer = (input: CloudTransfer, projectId = input.projectId): { readonly snapshot: ProjectSnapshot; readonly assets: ReadonlyMap<string, Uint8Array> } => {
  try {
    if (input.version !== 1 || !safeId(projectId) || input.projectId !== projectId) throw new Error("Project identifier mismatch")
    const verified = verifyTransfer(input)
    const snapshot = filesToSnapshot(verified.files)
    if (snapshot.project.id !== projectId || typeof snapshot.project.name !== "string" || !snapshot.project.name.trim()) throw new Error("Invalid project metadata")
    for (const [path, bytes] of Object.entries(verified.files)) {
      if (path === "project.json" || path === ASSET_MANIFEST || /^\.cadcamfun\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/u.test(path) || /^(?:README(?:\.md)?|[^/.]+\.nc|[^/.]+\.gcode)$/u.test(path)) continue
      const match = /^(drawings|components|toolpaths|materials|tools|machine-configs|costs)\/([A-Za-z0-9_-]{1,128})\.json$/u.exec(path)
      if (!match) throw new Error("Unsupported project file")
      const value: unknown = JSON.parse(toText(bytes))
      if (!value || typeof value !== "object" || Array.isArray(value) || !("id" in value) || value.id !== match[2]) throw new Error("Entity identifier mismatch")
    }
    const domain = [snapshot.drawings, snapshot.components, snapshot.toolpaths, snapshot.materials, snapshot.tools, snapshot.machineConfigs, snapshot.costs]
    for (const entities of domain) for (const entity of entities ?? []) if (!safeId(entity.id)) throw new Error("Invalid entity identifier")
    const manifest = assetManifest(verified.files)
    const declared = [...input.assets].map(metadataOf).sort((a, b) => a.id.localeCompare(b.id))
    if (canonicalJson([...manifest].sort((a, b) => a.id.localeCompare(b.id))) !== canonicalJson(declared)) throw new Error("Asset manifest does not match transfer")
    const ids = new Set<string>()
    const keys = new Set<string>()
    const bytesById = new Map<string, Uint8Array>()
    const objectIds = new Set([projectId, ...snapshot.drawings.map((e) => e.id), ...snapshot.components.map((e) => e.id), ...snapshot.toolpaths.map((e) => e.id)])
    let size = 0
    for (const asset of input.assets) {
      if (!safeId(asset.id) || ids.has(asset.id) || keys.has(asset.key) || !safeStorageKey(asset.key) || !objectIds.has(asset.objectId) || !/^[0-9a-f]{64}$/u.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 0) throw new Error("Invalid asset metadata")
      if (asset.body.length > MAX_CLOUD_BODY) throw new Error("Asset exceeds transfer limit")
      const bytes = Buffer.from(asset.body, "base64")
      if (bytes.toString("base64") !== asset.body || bytes.byteLength !== asset.size || sha256(bytes) !== asset.sha256) throw new Error("Asset hash or size mismatch")
      size += bytes.byteLength
      if (size > 16 * 1024 * 1024) throw new Error("Assets exceed the 16 MiB transfer limit")
      ids.add(asset.id)
      keys.add(asset.key)
      bytesById.set(asset.id, bytes)
    }
    return { snapshot, assets: bytesById }
  } catch (cause) {
    if (cause instanceof CloudSyncError) throw cause
    throw new CloudSyncError({ code: "invalid", message: `Invalid project transfer: ${cause instanceof Error ? cause.message : "validation failed"}` })
  }
}

export const modelFiles = (snapshot: ProjectSnapshot): Record<string, string> => {
  const { extra: _extra, ...model } = snapshot
  return snapshotToFiles(model)
}

export const sameModel = (a: ProjectSnapshot, b: ProjectSnapshot): boolean => canonicalJson(modelFiles(a)) === canonicalJson(modelFiles(b))
