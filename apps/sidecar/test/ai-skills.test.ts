import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const playbook = "For brass use 0.05 mm per tooth, flood coolant off, and finish with a climb pass before verifying the toolpath."

describe("user-loadable skills (HTTP)", () => {
  test("the list holds the built-in skills and the limit", async () => {
    const out = await app.call("/api/ai/skills")
    expect(out.status).toBe(200)
    expect(out.body.max).toBe(50)
    const names = (out.body.skills as Array<{ name: string; builtIn: boolean }>).filter((s) => s.builtIn).map((s) => s.name)
    expect(names).toContain("cad-3d-modeling")
    expect(names).toContain("toolpath-verification")
  })

  test("a skill is loaded from fields or from a whole SKILL.md, listed, and removed", async () => {
    const a = await app.call("/api/ai/skills", { method: "PUT", json: { name: "brass-turning", description: "Brass cutting data", body: playbook } })
    expect(a.status).toBe(200)
    expect(a.body.skill).toMatchObject({ name: "brass-turning", builtIn: false, category: "user" })
    const md = `---\nname: "steel-drilling"\ndescription: "Drilling steel"\n---\n\n${playbook}\n`
    const b = await app.call("/api/ai/skills", { method: "PUT", json: { markdown: md } })
    expect(b.status).toBe(200)
    const listed = (await app.call("/api/ai/skills")).body.skills as Array<{ name: string; builtIn: boolean }>
    expect(listed.filter((s) => !s.builtIn).map((s) => s.name)).toEqual(["brass-turning", "steel-drilling"])
    const removed = await app.call("/api/ai/skills/brass-turning", { method: "DELETE" })
    expect(removed.status).toBe(200)
    expect((removed.body.skills as Array<{ builtIn: boolean }>).filter((s) => !s.builtIn)).toHaveLength(1)
  })

  test("a bad skill is refused with every reason; built-ins can be neither replaced nor removed", async () => {
    const bad = await app.call("/api/ai/skills", { method: "PUT", json: { name: "Not Valid", description: "", body: "x" } })
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).toContain("name must be")
    const clash = await app.call("/api/ai/skills", { method: "PUT", json: { name: "cad-3d-modeling", description: "x", body: playbook } })
    expect(clash.status).toBe(400)
    expect((await app.call("/api/ai/skills/cad-3d-modeling", { method: "DELETE" })).status).toBe(400)
    expect((await app.call("/api/ai/skills/nothing-here", { method: "DELETE" })).status).toBe(400)
  })
})
