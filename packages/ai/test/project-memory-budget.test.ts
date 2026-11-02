import { describe, expect, test } from "bun:test"
import { PROJECT_MEMORY_BUDGET, renderProjectMemory } from "../src/project-context.ts"
import { assembleContext } from "../src/context-assembly.ts"

/** The Brain memory file is the new session's only recall of the project's standing setup; budget and truncation notice matter. */
const section = (title: string, lines: number) => `## ${title}\n${Array.from({ length: lines }, (_, i) => `- ${title} fact ${i}: value ${i * 7}`).join("\n")}`

describe("project memory at the start of a session", () => {
  test("a memory file of a realistic project (between 1 500 and 3 000 characters) is delivered whole", () => {
    const file = [section("Machine", 24), section("Stock and offsets", 24), section("Decisions", 24)].join("\n\n")
    expect(file.length).toBeGreaterThan(1_500)
    expect(file.length).toBeLessThan(PROJECT_MEMORY_BUDGET)
    const out = renderProjectMemory(file)
    expect(out).toContain("Decisions fact 23: value 161")
    expect(out).not.toContain("truncated")
  })

  test("a larger file keeps whole lines and says how large the file is, so absence is not read as none", () => {
    const file = [section("Machine", 60), section("Stock and offsets", 60)].join("\n\n")
    const out = renderProjectMemory(file)
    expect(out.length).toBeLessThanOrEqual(PROJECT_MEMORY_BUDGET)
    expect(out).toContain(`only the start of ${file.length} characters is shown`)
    expect(out).toContain("instead of assuming it is absent")
    expect(out).toContain("Machine fact 0: value 0")
    const lines = out.split("\n").filter((line) => line.startsWith("- "))
    for (const line of lines) expect(line).toMatch(/^- [A-Za-z ]+ fact \d+: value \d+$/)
  })

  test("the length it reports is the file's, not the 8 000 characters a document may be stored with", () => {
    const file = section("Log", 2_000)
    expect(file.length).toBeGreaterThan(8_000)
    expect(renderProjectMemory(file)).toContain(`only the start of ${file.length} characters`)
  })

  test("memory sits in the stable block with the rules and notes inside the aggregate budget", () => {
    const memory = renderProjectMemory(section("Machine", 40))
    const assembly = assembleContext([{ id: "brain-memory", kind: "memory", label: "project memory", text: memory }])
    expect(assembly.manifest.included.map((entry) => entry.id)).toEqual(["brain-memory"])
    expect(assembly.manifest.included[0]?.truncated).toBeUndefined()
  })
})
