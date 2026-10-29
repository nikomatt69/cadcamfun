/**
 * Fill catalog/<locale>.json from segments.json.
 * Placeholders `{name}` and `#` are protected, then restored.
 * Resume-safe: partial/<locale>/machine.json is rewritten as batches finish.
 *
 *   bun packages/web/script/fill-i18n-catalogs.mjs
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"

const root = new URL("../src/i18n/catalog/", import.meta.url)
const segments = JSON.parse(readFileSync(new URL("segments.json", root), "utf8"))
const locales = [
  ["it", "it"],
  ["de", "de"],
  ["es", "es"],
  ["fr", "fr"],
  ["pt", "pt"],
  ["ru", "ru"],
  ["zh-CN", "zh-CN"],
  ["ja", "ja"],
  ["hi", "hi"],
  ["ar", "ar"],
]

const slotPattern = /\{[a-zA-Z]+\}|#/g

function protect(source, wrap) {
  const slots = []
  const out = source.replace(slotPattern, (token) => {
    const id = slots.length
    slots.push(token)
    return wrap(id)
  })
  return { out, slots }
}

function restoreBraces(translated, slots) {
  return translated.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, index) => slots[Number(index)] ?? "")
}

function restoreMarks(translated, slots) {
  return translated.replace(/\uE000\s*(\d+)\s*[\uE000\uE001]/g, (_, index) => slots[Number(index)] ?? "")
}

function placeholderCounts(value) {
  const counts = new Map()
  for (const token of value.match(slotPattern) ?? []) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

function placeholdersKept(source, translated) {
  if (translated.includes("{{") || translated.includes("\uE000")) return false
  const need = placeholderCounts(source)
  const got = placeholderCounts(translated)
  for (const [token, count] of need) if ((got.get(token) ?? 0) < count) return false
  return true
}

function matchLead(source, translated) {
  const cleaned = translated.replace(/\u200b/g, "")
  if (/^[\s,.;:()'"]*[a-z]/.test(source)) {
    return cleaned.replace(/^([\s,.;:()'"]*)(\p{Lu})/u, (_, lead, letter) => lead + letter.toLowerCase())
  }
  return cleaned
}

let pauseUntil = 0

async function postTranslate(texts, target) {
  const wait = pauseUntil - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  const body = new URLSearchParams()
  body.set("client", "dict-chrome-ex")
  body.set("sl", "en")
  body.set("tl", target)
  for (const text of texts) body.append("q", text)
  const response = await fetch(
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=${encodeURIComponent(target)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body,
    },
  )
  if (response.status === 429) {
    pauseUntil = Date.now() + 4000
    throw new Error("429")
  }
  if (!response.ok) throw new Error(String(response.status))
  const data = await response.json()
  if (Array.isArray(data) && data.length === texts.length && data.every((item) => typeof item === "string")) return data
  if (texts.length === 1 && typeof data === "string") return [data]
  if (texts.length === 1 && Array.isArray(data) && typeof data[0] === "string") return [data[0]]
  throw new Error(`shape ${JSON.stringify(data).slice(0, 160)}`)
}

async function translateBatch(texts, target) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await postTranslate(texts, target)
    } catch (error) {
      const delay = 700 * (attempt + 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (attempt === 7) throw error
    }
  }
  throw new Error("translate")
}

async function translateOne(source, target) {
  const braced = protect(source, (id) => `{{${id}}}`)
  const first = restoreBraces((await translateBatch([braced.out], target))[0], braced.slots)
  const cased = matchLead(source, first)
  if (placeholdersKept(source, cased)) return cased
  const marked = protect(source, (id) => `\uE000${id}\uE001`)
  const second = matchLead(source, restoreMarks((await translateBatch([marked.out], target))[0], marked.slots))
  if (placeholdersKept(source, second)) return second
  return cased
}

function writeJson(url, value) {
  const path = url.pathname
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2))
  renameSync(`${path}.tmp`, path)
}

function loadJson(url) {
  try {
    return JSON.parse(readFileSync(url, "utf8"))
  } catch {
    return {}
  }
}

const chunks = []
let current = []
let weight = 0
for (const segment of segments) {
  const size = segment.length + 8
  if (current.length > 0 && (current.length >= 24 || weight + size > 2800)) {
    chunks.push(current)
    current = []
    weight = 0
  }
  current.push(segment)
  weight += size
}
if (current.length > 0) chunks.push(current)

async function fillLocale(locale, target) {
  const partialDir = new URL(`partial/${locale}/`, root)
  mkdirSync(partialDir, { recursive: true })
  const machineUrl = new URL("machine.json", partialDir)
  const dict = loadJson(machineUrl)
  let done = segments.filter((key) => typeof dict[key] === "string" && dict[key].length > 0).length
  console.log(`${locale}: resume ${done}/${segments.length}`)
  let cursor = 0
  const workers = 3
  async function worker() {
    while (cursor < chunks.length) {
      const index = cursor++
      const chunk = chunks[index].filter((key) => !(typeof dict[key] === "string" && dict[key].length > 0))
      if (chunk.length === 0) continue
      const prepared = chunk.map((key) => protect(key, (id) => `{{${id}}}`))
      let translated
      try {
        translated = await translateBatch(prepared.map((item) => item.out), target)
      } catch (error) {
        console.error(`${locale} chunk ${index} failed: ${error.message}`)
        translated = await Promise.all(chunk.map((key) => translateOne(key, target)))
        chunk.forEach((key, offset) => {
          const value = translated[offset]
          if (value && value.trim()) dict[key] = value
        })
        done += chunk.length
        writeJson(machineUrl, dict)
        console.log(`${locale}: ${done}/${segments.length}`)
        continue
      }
      for (let offset = 0; offset < chunk.length; offset++) {
        const source = chunk[offset]
        let value = matchLead(source, restoreBraces(translated[offset], prepared[offset].slots))
        if (!value.trim() || !placeholdersKept(source, value)) value = await translateOne(source, target)
        if (!value.trim()) continue
        dict[source] = value
      }
      done += chunk.length
      writeJson(machineUrl, dict)
      if (index % 4 === 0) console.log(`${locale}: ${done}/${segments.length}`)
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()))
  writeJson(new URL(`${locale}.json`, root), dict)
  const missing = segments.filter((key) => !dict[key])
  const broken = segments.filter((key) => dict[key] && !placeholdersKept(key, dict[key]))
  console.log(`${locale}: wrote ${Object.keys(dict).length} missing ${missing.length} broken ${broken.length}`)
  if (broken.length > 0) console.log(broken.slice(0, 6).map((key) => `  ${JSON.stringify(key)}`).join("\n"))
}

for (const [locale, target] of locales) {
  await fillLocale(locale, target)
}
console.log("DONE")
