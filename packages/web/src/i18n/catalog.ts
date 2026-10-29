import type { Locale } from "./locales"
import { lookupSegment, segmentKey } from "./segment"
import ar from "./catalog/ar.json"
import de from "./catalog/de.json"
import es from "./catalog/es.json"
import fr from "./catalog/fr.json"
import hi from "./catalog/hi.json"
import it from "./catalog/it.json"
import ja from "./catalog/ja.json"
import pt from "./catalog/pt.json"
import ru from "./catalog/ru.json"
import zhCN from "./catalog/zh-CN.json"

const CATALOGS: Partial<Record<Locale, Readonly<Record<string, string>>>> = {
  it, de, es, fr, pt, ru, "zh-CN": zhCN, ja, hi, ar,
}

export function catalogFor(locale: Locale): Readonly<Record<string, string>> {
  return CATALOGS[locale] ?? {}
}

/** Catalog lookup for a source string. Named slots `{name}` are filled from `vars`. */
export function text(locale: Locale, english: string, vars: Readonly<Record<string, string>> = {}): string {
  const translated = lookupSegment(catalogFor(locale), english) ?? english
  return translated.replace(/\{([a-zA-Z]+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`)
}

export { segmentKey }
