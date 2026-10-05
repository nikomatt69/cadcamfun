// Compares the routes of the v6 API contract with the legacy inventory (specs/api-inventory.md).
// Usage: bun scripts/api-coverage.ts [--missing]
import { contractCoverage, parseInventory } from "./coverage.ts"
import { readFileSync } from "node:fs"

const result = contractCoverage(parseInventory(readFileSync(new URL("../../../specs/api-inventory.md", import.meta.url), "utf8")))
console.log(`API contract coverage: ${result.covered}/${result.total} legacy route files (${Math.round((result.covered / result.total) * 100)}%). Handler and payload parity require separate HTTP tests.`)
if (process.argv.includes("--missing")) console.log(result.missing.map((row) => `${row.missingMethods.join(",") || "?"} ${row.route}${row.existingMethods.length ? ` (has ${row.existingMethods.join(",")})` : ""}`).join("\n"))
if (process.argv.includes("--strict") && result.missing.length > 0) process.exitCode = 1
