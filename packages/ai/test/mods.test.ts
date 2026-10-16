import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import {
  MAX_MOD_SOURCE_CHARS,
  modModuleFile,
  modSourceProblems,
  modSpec,
  modSpecs,
  modsDir,
  readModIndex,
  removeMod,
  saveMod,
  setModEnabled
} from "../src/nikcli/mods.ts"

const root = mkdtempSync(join(tmpdir(), "cadcam-mods-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const SOURCE = `export const register = (on) => {
  on("tool.call", { tool: "cad_delete_entities" }, async ($, e, next) => {
    await $.ui.log("careful")
    return next(e)
  })
}
`

describe("the mod store", () => {
  const paths = isolatedPaths(join(root, "data"))

  test("saves a module and an index record, disabled until someone enables it", () => {
    const record = saveMod(paths, { id: "audit_calls", description: "Logs destructive calls.", source: SOURCE })
    expect(record.enabled).toBe(false)
    expect(record.origin).toBe("assistant")
    expect(existsSync(modModuleFile(paths, "audit_calls"))).toBe(true)
    expect(readModIndex(paths).map((entry) => entry.id)).toEqual(["audit_calls"])
    // A mod nobody enabled is not in the host config.
    expect(modSpecs(paths)).toEqual([])
  })

  test("enabling is what puts the file URL into the host config", () => {
    const record = setModEnabled(paths, "audit_calls", true)
    expect(record.enabled).toBe(true)
    const spec = modSpec(paths, "audit_calls")
    expect(spec.startsWith("file:///")).toBe(true)
    expect(spec.endsWith("/mods/audit_calls.js")).toBe(true)
    expect(modSpecs(paths)).toEqual([spec])
  })

  test("replacing a module keeps the current flag and identity", () => {
    const before = readModIndex(paths)[0]!
    const record = saveMod(paths, { id: "audit_calls", description: "Logs every call.", source: SOURCE.replace("cad_delete_entities", "cad_edit") })
    expect(record.enabled).toBe(true)
    expect(record.createdAt).toBe(before.createdAt)
    expect(record.description).toBe("Logs every call.")
    expect(readFileSync(modModuleFile(paths, "audit_calls"), "utf8")).toContain("cad_edit")
  })

  test("removing deletes both the record and the module", () => {
    expect(removeMod(paths, "audit_calls")).toBe(true)
    expect(removeMod(paths, "audit_calls")).toBe(false)
    expect(existsSync(modModuleFile(paths, "audit_calls"))).toBe(false)
    expect(readModIndex(paths)).toEqual([])
  })

  test("refuses ids and sources that could not work in the host", () => {
    expect(() => saveMod(paths, { id: "Not An Id", description: "", source: SOURCE })).toThrow(/valid mod id/)
    expect(() => saveMod(paths, { id: "imports", description: "", source: "import { x } from \"y\"\nexport const register = () => {}\n" })).toThrow(/imports nothing/)
    expect(() => saveMod(paths, { id: "empty", description: "", source: "   " })).toThrow(/empty/)
    expect(() => saveMod(paths, { id: "long", description: "", source: `export const register = () => {}\n${"// pad\n".repeat(MAX_MOD_SOURCE_CHARS / 6)}` })).toThrow(/longer than/)
    expect(() => saveMod(paths, { id: "no_register", description: "", source: "export const other = 1\n" })).toThrow(/export `register`/)
  })

  test("source problems name the shape the store accepts", () => {
    expect(modSourceProblems(SOURCE)).toEqual([])
    expect(modSourceProblems("")).toEqual(["The source is empty."])
    expect(modSourceProblems("export function register(on) {}\n")).toEqual([])
  })

  test("a corrupt index is an empty store, never a crash", () => {
    const broken = isolatedPaths(join(root, "broken"))
    writeIndex(broken, "not json")
    expect(readModIndex(broken)).toEqual([])
    writeFileSync(join(modsDir(broken), "index.json"), JSON.stringify([{ id: "Not Valid" }, { id: "ok_id", enabled: true }]))
    expect(readModIndex(broken).map((entry) => entry.id)).toEqual(["ok_id"])
    expect(readModIndex(broken)[0]!.name).toBe("ok_id")
  })
})

const writeIndex = (paths: ReturnType<typeof isolatedPaths>, text: string): void => {
  mkdirSync(modsDir(paths), { recursive: true })
  writeFileSync(join(modsDir(paths), "index.json"), text)
}
