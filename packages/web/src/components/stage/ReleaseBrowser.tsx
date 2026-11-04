import { useEffect, useMemo, useState } from "react"
import { Icon, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "../../stageshow/kit/stage.css"
import "./releases.css"

type Kind = "dmg" | "msi" | "nsis" | "deb" | "rpm" | "checksums" | "notes"
type Asset = { name: string; url: string; size: number; kind: Kind }
type Platform = { slug: string; assets: Asset[] }
type Version = { version: string; publishedAt: string; platforms: Platform[] }

export type ReleaseLabels = Record<"dmg" | "msi" | "nsis" | "deb" | "rpm" | "checksums" | "notes" | "notInRelease" | "detected" | "empty" | "failed" | "loading" | "version" | "allReleases", string>

const SLUG_LABEL: Record<string, string> = {
  "macos-arm64": "Apple Silicon",
  "macos-x64": "Intel",
  "windows-x64": "x64",
  "windows-arm64": "ARM64",
  "linux-x64": "x64",
  "linux-arm64": "ARM64",
}
const GROUPS = [
  { title: "macOS", slugs: ["macos-arm64", "macos-x64"] },
  { title: "Windows", slugs: ["windows-x64", "windows-arm64"] },
  { title: "Linux", slugs: ["linux-x64", "linux-arm64"] },
]

function detectedSlugs(): string[] {
  if (typeof navigator === "undefined") return []
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return /ARM64|aarch64/i.test(ua) ? ["windows-arm64"] : ["windows-x64"]
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return /aarch64|arm64/i.test(ua) ? ["linux-arm64"] : ["linux-x64"]
  if (/Mac/i.test(ua)) return ["macos-arm64", "macos-x64"]
  return []
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function PlatformStage({ title, slugs, version, hits, labels }: { title: string; slugs: string[]; version: Version; hits: Set<string>; labels: ReleaseLabels }) {
  const theme = useSiteTheme()
  const cols = slugs.map((slug) => ({ slug, assets: version.platforms.find((p) => p.slug === slug)?.assets ?? null }))
  const labelFor = (kind: Kind) => labels[kind]
  return (
    <div className="ss-stage rl" data-theme={theme} data-palette="accent" data-fidelity="standard" data-greys="cool" data-layout="wide">
        <Window title={title} className="rl-window">
          <div className="rl-body">
            {cols.map((col) => (
              <div key={col.slug} className="rl-col" data-current={hits.has(col.slug) || undefined}>
                <Text className="rl-col__title">{SLUG_LABEL[col.slug] ?? col.slug}</Text>
                {!col.assets?.length ? (
                  <span className="rl-empty">{labels.notInRelease}</span>
                ) : (
                  col.assets.map((asset) => (
                    <a key={asset.url} className="rl-asset" href={asset.url} aria-label={`${labelFor(asset.kind)} · ${title} ${SLUG_LABEL[col.slug] ?? col.slug}`}>
                      <Icon name="file" size={14} />
                      <span className="rl-asset__name">{labelFor(asset.kind)}</span>
                      <span className="rl-asset__size">{formatSize(asset.size)}</span>
                    </a>
                  ))
                )}
              </div>
            ))}
          </div>
        </Window>
    </div>
  )
}

/** The installers for a release: a version picker, then one stage window per operating system. */
export default function ReleaseBrowser({ labels }: { labels: ReleaseLabels }) {
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState("")
  const hits = useMemo(() => new Set(detectedSlugs()), [])
  const os = [...hits][0]?.startsWith("macos") ? "macOS" : [...hits][0]?.startsWith("windows") ? "Windows" : [...hits][0]?.startsWith("linux") ? "Linux" : ""

  useEffect(() => {
    let live = true
    fetch("/api/releases")
      .then((r) => (r.ok ? (r.json() as Promise<{ versions?: Version[] }>) : Promise.reject(new Error("unavailable"))))
      .then((body) => {
        if (!live) return
        const list = body.versions ?? []
        setVersions(list)
        setSelected(list[0]?.version ?? "")
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const version = versions?.find((v) => v.version === selected)
  const status = failed ? labels.failed : versions === null ? labels.loading : versions.length === 0 ? labels.empty : ""

  return (
    <div>
      {os ? <p className="rl-detected">{labels.detected.replace("{os}", os)}</p> : null}
      <div className="rl-controls">
        <label className="rl-label" htmlFor="download-version">
          {labels.version}
          <select id="download-version" className="rl-select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!versions?.length}>
            {versions?.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
        <a id="download-notes" className="rl-all" href="https://github.com/nikomatt69/cadcamfun/releases">
          {labels.allReleases}
        </a>
      </div>
      {status ? (
        <p className="rl-status" role="status">
          {status}
        </p>
      ) : null}
      {version ? (
        <div className="rl-list">
          {GROUPS.map((group) => (
            <PlatformStage key={group.title} title={group.title} slugs={group.slugs} version={version} hits={hits} labels={labels} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
