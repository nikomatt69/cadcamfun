import type { Context } from "hono"
import { MAX_FORM_BYTES } from "./constants.ts"

export async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) throw new HttpError(413, "request body too large")
  if (!request.body) return ""

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const item = await reader.read()
    if (item.done) break
    length += item.value.byteLength
    if (length > MAX_FORM_BYTES) {
      await reader.cancel()
      throw new HttpError(413, "request body too large")
    }
    chunks.push(item.value)
  }
  const merged = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

export async function readForm(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim()
  if (contentType !== "application/x-www-form-urlencoded") throw new HttpError(415, "form encoding required")
  return new URLSearchParams(await readBodyText(request))
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim()
  if (contentType !== "application/json") throw new HttpError(415, "JSON encoding required")
  try {
    const value: unknown = JSON.parse(await readBodyText(request))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required")
    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, "invalid JSON body")
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * A structured line for a sign-in that did not complete.
 *
 * Nothing here throws, so `app.onError` never sees these: every
 * `invalid_grant`, every "Session expired", every lapsed device code left the
 * worker without a trace, and "it fails sometimes" stayed an anecdote nobody
 * could turn into a cause. The fields are deliberately non-identifying — a
 * stage and a reason, the client, never a code, a token, or an address.
 */
export function logSignInFailure(
  c: Context,
  stage: string,
  reason: string,
  detail: Record<string, string | number | boolean | null> = {},
): void {
  console.error(
    JSON.stringify({
      message: "sign-in did not complete",
      stage,
      reason,
      method: c.req.method,
      path: c.req.path,
      ...detail,
    }),
  )
}

export function oauthError(c: Context, error: string, description: string, status = 400): Response {
  logSignInFailure(c, "oauth", error, { status })
  return c.json({ error, error_description: description }, status as 400)
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization")
  if (!value?.startsWith("Bearer ")) return null
  return value.slice(7)
}

export function requestIP(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown"
}

export function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Pragma", "no-cache")
  return response
}
