import type { APIRoute } from "astro"

export const prerender = false

/** Production fallback. In `bun run dev` Vite proxies `/studio/api` to the local Drizzle server. */
export const ALL: APIRoute = () =>
  new Response(
    JSON.stringify({
      error: "Studio reads the local Drizzle database. Run bun run dev in packages/web.",
    }),
    { status: 503, headers: { "content-type": "application/json" } },
  )
