/** Which local sidecar calls carry the account token. Everything else keeps the local profile. */

/** `true` for the desktop cloud routes. The hosted phone gateway never receives this header from here. */
export const isCloudRequestPath = (url: string): boolean => {
  let path = url
  try { path = new URL(url, "http://127.0.0.1").pathname } catch { path = url.split("?")[0] ?? url }
  return path.startsWith("/api/cloud/") || /^\/api\/projects\/[^/]+\/cloud(?:\/|$)/u.test(path)
}

/** The device token inside a cloud pairing link, when the link is one this app just created. */
export const deviceTokenFromLink = (link: string): string | undefined => {
  try {
    const url = new URL(link)
    const token = url.searchParams.get("token") ?? ""
    if (url.protocol !== "cadcamfun:" || url.hostname !== "pair" || url.searchParams.get("mode") !== "cloud") return undefined
    if (token.length < 16 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/u.test(token)) return undefined
    return token
  } catch {
    return undefined
  }
}
