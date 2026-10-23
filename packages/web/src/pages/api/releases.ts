import type { APIRoute } from "astro"
import { groupReleases, RELEASE_REPOSITORY, type GithubRelease } from "../../lib/githubReleases"

export const prerender = false

const TTL_MS = 5 * 60 * 1000

let cache: { at: number; body: string } | undefined

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
    },
  })
}

/** Latest stable desktop installers from the public GitHub releases. */
export const GET: APIRoute = async () => {
  if (cache && Date.now() - cache.at < TTL_MS) return json(JSON.parse(cache.body) as unknown)

  const response = await fetch(`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=100`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "cadcamfun-docs",
    },
  })
  if (!response.ok) return json({ error: "GitHub releases are unavailable" }, 502)

  const payload = (await response.json()) as GithubRelease[] | { message?: string }
  if (!Array.isArray(payload)) return json({ error: "GitHub releases are unavailable" }, 502)

  const body = { repository: RELEASE_REPOSITORY, versions: groupReleases(payload) }
  cache = { at: Date.now(), body: JSON.stringify(body) }
  return json(body)
}
