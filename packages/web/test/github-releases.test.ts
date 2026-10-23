import { describe, expect, test } from "bun:test"
import { classifyAsset, groupReleases, type GithubRelease } from "../src/lib/githubReleases"

describe("github release grouping", () => {
  test("keeps desktop installers and drops updater archives", () => {
    expect(classifyAsset("aarch64-apple-darwin--CADCAM FUN 6.0.1.dmg")).toBe("dmg")
    expect(classifyAsset("x86_64-pc-windows-msvc--CADCAM FUN_6.0.1_x64-setup.exe")).toBe("nsis")
    expect(classifyAsset("x86_64-unknown-linux-gnu--cadcamfun_6.0.1_amd64.deb")).toBe("deb")
    expect(classifyAsset("SHA256SUMS")).toBe("checksums")
    expect(classifyAsset("RELEASE_NOTES.md")).toBe("notes")
    expect(classifyAsset("aarch64-apple-darwin--CADCAM FUN 6.0.1.app.tar.gz")).toBeNull()
    expect(classifyAsset("aarch64-apple-darwin--CADCAM FUN 6.0.1.app.tar.gz.sig")).toBeNull()
    expect(classifyAsset("latest.json")).toBeNull()
    expect(classifyAsset("cadcamfun.AppImage")).toBeNull()
  })

  test("groups stable platform tags and skips drafts, prereleases, and the index release", () => {
    const releases: GithubRelease[] = [
      {
        tag_name: "v6.0.1",
        published_at: "2026-10-01T00:00:00Z",
        assets: [{ name: "latest.json", browser_download_url: "https://example.test/latest.json", size: 10 }],
      },
      {
        tag_name: "v6.0.1-macos-arm64",
        published_at: "2026-10-02T00:00:00Z",
        assets: [
          { name: "aarch64-apple-darwin--CADCAM FUN 6.0.1.dmg", browser_download_url: "https://example.test/arm.dmg", size: 100 },
          { name: "aarch64-apple-darwin--CADCAM FUN 6.0.1.app.tar.gz", browser_download_url: "https://example.test/arm.tar.gz", size: 90 },
          { name: "SHA256SUMS", browser_download_url: "https://example.test/sums", size: 20 },
        ],
      },
      {
        tag_name: "v6.0.1-linux-x64",
        published_at: "2026-10-01T12:00:00Z",
        assets: [
          { name: "x86_64-unknown-linux-gnu--cadcamfun.deb", browser_download_url: "https://example.test/a.deb", size: 80 },
          { name: "x86_64-unknown-linux-gnu--cadcamfun.rpm", browser_download_url: "https://example.test/a.rpm", size: 81 },
        ],
      },
      { tag_name: "v6.0.2-macos-arm64", draft: true, assets: [{ name: "a.dmg", browser_download_url: "https://example.test/draft.dmg", size: 1 }] },
      { tag_name: "v6.1.0-rc.1-macos-arm64", prerelease: true, assets: [{ name: "a.dmg", browser_download_url: "https://example.test/rc.dmg", size: 1 }] },
      { tag_name: "v6.0.0-macos-x64", published_at: "2026-09-01T00:00:00Z", assets: [{ name: "intel.dmg", browser_download_url: "https://example.test/intel.dmg", size: 70 }] },
    ]

    const grouped = groupReleases(releases)
    expect(grouped.map((version) => version.version)).toEqual(["6.0.1", "6.0.0"])
    expect(grouped[0]?.publishedAt).toBe("2026-10-02T00:00:00Z")
    expect(grouped[0]?.platforms.map((platform) => platform.slug)).toEqual(["macos-arm64", "linux-x64"])
    expect(grouped[0]?.platforms[0]?.assets.map((asset) => asset.kind)).toEqual(["dmg", "checksums"])
  })
})
