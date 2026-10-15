import { createRequire } from "node:module"
import { readFile, writeFile } from "node:fs/promises"
import { Api } from "../../api/src/index.ts"

// Resolve the same Effect installation as the contract; the Worker only reads JSON.
const fromApiPackage = createRequire(new URL("../../api/package.json", import.meta.url))
const { OpenApi } = await import(fromApiPackage.resolve("effect/unstable/httpapi"))
const document = OpenApi.fromApi(Api)
const output = JSON.stringify(document, null, 2) + "\n"
const destination = new URL("../src/data/api-reference.json", import.meta.url)
if (process.argv.includes("--check")) {
  if (await readFile(destination, "utf8") !== output) throw new Error("API reference is stale. Run bun script/generate-api-reference.mjs in packages/web.")
} else {
  await writeFile(destination, output)
}
const operations = Object.values(document.paths).flatMap((path) => Object.entries(path).filter(([method]) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(method)))
console.log(`API reference: ${operations.length} operations, ${Object.keys(document.paths).length} paths, ${document.tags.length} groups, ${Object.keys(document.components.schemas).length} schemas`)
