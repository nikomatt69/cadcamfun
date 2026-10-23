/** GitHub release assets the public download page is allowed to offer. */

export const RELEASE_REPOSITORY = "nikomatt69/cadcamfun"

export const PLATFORM_SLUGS = [
  "macos-arm64",
  "macos-x64",
  "windows-x64",
  "windows-arm64",
  "linux-x64",
  "linux-arm64",
] as const

export type PlatformSlug = (typeof PLATFORM_SLUGS)[number]

export type ReleaseAssetKind = "dmg" | "msi" | "nsis" | "deb" | "rpm" | "checksums" | "notes"

export type ReleaseAsset = {
  readonly name: string
  readonly url: string
  readonly size: number
  readonly kind: ReleaseAssetKind
}

export type PlatformDownloads = {
  readonly slug: PlatformSlug
  readonly assets: readonly ReleaseAsset[]
}

export type VersionDownloads = {
  readonly version: string
  readonly publishedAt: string
  readonly platforms: readonly PlatformDownloads[]
}

export type GithubReleaseAsset = {
  readonly name?: string
  readonly browser_download_url?: string
  readonly size?: number
}

export type GithubRelease = {
  readonly tag_name?: string
  readonly draft?: boolean
  readonly prerelease?: boolean
  readonly published_at?: string
  readonly assets?: readonly GithubReleaseAsset[]
}

const TAG = /^v(\d+\.\d+\.\d+)(?:-([a-z0-9-]+))?$/
const INSTALLERS = new Set<ReleaseAssetKind>(["dmg", "msi", "nsis", "deb", "rpm"])

const slugSet = new Set<string>(PLATFORM_SLUGS)

export function classifyAsset(name: string): ReleaseAssetKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith(".sig") || lower.endsWith(".app.tar.gz") || lower.endsWith(".appimage") || lower === "latest.json") return null
  if (lower.endsWith(".dmg")) return "dmg"
  if (lower.endsWith(".msi")) return "msi"
  if (lower.endsWith(".deb")) return "deb"
  if (lower.endsWith(".rpm")) return "rpm"
  if (lower.endsWith(".exe") && lower.includes("setup")) return "nsis"
  if (lower === "sha256sums" || lower.endsWith("--sha256sums")) return "checksums"
  if (lower === "release_notes.md" || lower.endsWith("--release_notes.md")) return "notes"
  return null
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part))
  const b = right.split(".").map((part) => Number(part))
  for (let index = 0; index < 3; index += 1) {
    const delta = (b[index] ?? 0) - (a[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

/** Stable desktop installers only. Updater archives, signatures, drafts, and prereleases are dropped. */
export function groupReleases(releases: readonly GithubRelease[], limit = 12): VersionDownloads[] {
  const versions = new Map<string, { publishedAt: string; platforms: Map<PlatformSlug, ReleaseAsset[]> }>()

  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    const match = TAG.exec(release.tag_name ?? "")
    const slug = match?.[2]
    if (!match || !slug || !slugSet.has(slug)) continue
    const version = match[1]!
    const platform = slug as PlatformSlug
    let bucket = versions.get(version)
    if (!bucket) {
      bucket = { publishedAt: release.published_at ?? "", platforms: new Map() }
      versions.set(version, bucket)
    }
    if ((release.published_at ?? "") > bucket.publishedAt) bucket.publishedAt = release.published_at ?? bucket.publishedAt
    const assets = bucket.platforms.get(platform) ?? []
    for (const asset of release.assets ?? []) {
      const name = asset.name ?? ""
      const url = asset.browser_download_url ?? ""
      const kind = name && url ? classifyAsset(name) : null
      if (!kind) continue
      assets.push({ name, url, size: asset.size ?? 0, kind })
    }
    bucket.platforms.set(platform, assets)
  }

  return [...versions.entries()]
    .map(([version, bucket]) => ({
      version,
      publishedAt: bucket.publishedAt,
      platforms: PLATFORM_SLUGS.flatMap((slug) => {
        const assets = bucket.platforms.get(slug) ?? []
        if (!assets.some((asset) => INSTALLERS.has(asset.kind))) return []
        return [{ slug, assets }]
      }),
    }))
    .filter((version) => version.platforms.length > 0)
    .sort((left, right) => compareVersions(left.version, right.version))
    .slice(0, limit)
}
