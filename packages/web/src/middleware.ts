import { defineMiddleware } from "astro:middleware"
import { isDocsPath, isLocale, LOCALE_COOKIE, localizePath, resolveLocale, splitLocalePath, type Locale } from "./i18n/locales"

const cookieFor = (locale: Locale): string =>
  `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`

const readCookie = (header: string | null, name: string): string | null => {
  if (!header) return null
  for (const part of header.split(";")) {
    const [key, ...rest] = part.split("=")
    if (key?.trim() === name) return rest.join("=").trim()
  }
  return null
}

/**
 * Language routing for the docs. English is canonical (`/docs/...`); the
 * other ten languages live under `/<locale>/docs/...`.
 *
 * First visit to an unprefixed docs URL: resolve the language from the
 * reader's saved cookie, else the Cloudflare country of the request
 * (`CF-IPCountry` header / `runtime.cf.country`), else `Accept-Language`,
 * and redirect to the localized URL. A manual choice (language selector,
 * which sets the cookie and `?lang=`) always wins over detection, and a
 * prefixed URL pins the cookie to that language.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // Prerendered pages are static assets: they never reach this code in
  // production, and at build time there is no visitor to detect. Their
  // first-visit detection lives in the inline script in DocsLayout.
  if (context.isPrerendered) return next()
  const { pathname, searchParams } = context.url
  const { locale: pathLocale, pathname: bare } = splitLocalePath(pathname)

  if (pathLocale !== "en" && isDocsPath(bare)) {
    context.locals.locale = pathLocale
    const response = await next()
    response.headers.append("Set-Cookie", cookieFor(pathLocale))
    response.headers.set("Content-Language", pathLocale)
    return response
  }

  if (!isDocsPath(pathname) || (context.request.method !== "GET" && context.request.method !== "HEAD")) {
    context.locals.locale = "en"
    return next()
  }

  // Explicit choice from the selector: pin it, then continue on the clean URL.
  const chosen = searchParams.get("lang")
  if (isLocale(chosen)) {
    const target = localizePath(pathname, chosen)
    const response = context.redirect(target, 302)
    response.headers.append("Set-Cookie", cookieFor(chosen))
    return response
  }

  const cookie = readCookie(context.request.headers.get("cookie"), LOCALE_COOKIE)
  const runtime = (context.locals as { runtime?: { cf?: { country?: string } } }).runtime
  const country = context.request.headers.get("cf-ipcountry") ?? runtime?.cf?.country ?? null
  const resolved = resolveLocale({
    cookie,
    country,
    acceptLanguage: context.request.headers.get("accept-language"),
  })
  context.locals.locale = resolved
  if (resolved !== "en") {
    const response = context.redirect(localizePath(pathname, resolved), 302)
    response.headers.append("Set-Cookie", cookieFor(resolved))
    response.headers.set("Vary", "Cookie, Accept-Language")
    return response
  }
  const response = await next()
  if (!isLocale(cookie)) response.headers.append("Set-Cookie", cookieFor("en"))
  return response
})
