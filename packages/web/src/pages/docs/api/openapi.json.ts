import type { APIRoute } from "astro"
import document from "../../../data/api-reference.json"

export const prerender = true
export const GET: APIRoute = () => new Response(JSON.stringify(document, null, 2) + "\n", {
  headers: { "Content-Type": "application/json; charset=utf-8" },
})
