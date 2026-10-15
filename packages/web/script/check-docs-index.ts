/**
 * Ensures the docs index covers every sidebar page and does not keep dead pages.
 */
import { docsIndex, docsIndexGaps } from "../src/data/docsIndex"

const { missing, orphaned } = docsIndexGaps()

if (missing.length > 0) {
  console.error("Docs pages missing from the index:", missing.sort().join(", "))
}

if (orphaned.length > 0) {
  console.error("Index entries with no sidebar page:", orphaned.sort().join(", "))
}

const seen = new Set<string>()
for (const entry of docsIndex) {
  if (seen.has(entry.href)) {
    console.error("Duplicate docs index href:", entry.href)
    throw new Error("docs index check failed")
  }
  seen.add(entry.href)
  const blankKeyword = entry.keywords.some((keyword) => keyword.trim().length === 0)
  if (entry.title.trim().length === 0 || entry.summary.trim().length === 0 || entry.keywords.length === 0 || blankKeyword) {
    console.error("Docs index entry needs a title, summary, and keywords:", entry.href)
    throw new Error("docs index check failed")
  }
}

if (missing.length > 0 || orphaned.length > 0) {
  throw new Error("docs index check failed")
}

console.log(`docs index OK (${docsIndex.length} pages)`)
