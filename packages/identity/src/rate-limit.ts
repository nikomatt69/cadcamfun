import { sha256 } from "./crypto.ts"

type Counter = { count: number }

export async function consumeRateLimit(
  state: KVNamespace,
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const window = Math.floor(now / (windowSeconds * 1000))
  const key = `rate:${bucket}:${await sha256(subject)}:${window}`
  const current = await state.get<Counter>(key, "json")
  const count = (current?.count ?? 0) + 1
  const retryAfter = windowSeconds - Math.floor((now / 1000) % windowSeconds)
  await state.put(key, JSON.stringify({ count }), {
    expirationTtl: Math.max(60, windowSeconds * 2),
  })
  return { allowed: count <= limit, retryAfter }
}
