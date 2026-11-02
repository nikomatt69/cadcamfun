import { describe, expect, test } from "bun:test"
import { initials, itemSubtitle, memberSince, profileFacts } from "../lib/profile"
import { CompanionClient, type Transport } from "../lib/client"

const profile = { name: "Ada Lovelace", email: "ada@example.com", bio: null, location: " ", website: "https://ada.dev", company: "Analytical", title: "Engineer", createdAt: "2026-03-15T10:00:00Z", showEmail: false }

describe("mobile profile", () => {
  test("facts keep only what has a value and the owner sees their email", () => {
    expect(profileFacts(profile).map((f) => f.id)).toEqual(["email", "role", "website", "since"])
    expect(profileFacts(profile).find((f) => f.id === "role")?.value).toBe("Engineer · Analytical")
    expect(memberSince("2026-03-15T10:00:00Z")).toContain("2026")
    expect(memberSince("not a date")).toBe("")
  })

  test("initials fall back from name to email to a placeholder", () => {
    expect(initials("Ada Lovelace", null)).toBe("AL")
    expect(initials(null, "grace.hopper@x.org")).toBe("GH")
    expect(initials("", "")).toBe("?")
  })

  test("organization rows name role and size, others their description", () => {
    expect(itemSubtitle("organizations", { name: "Shop", description: null, updatedAt: "", role: "ADMIN", userCount: 1, projectCount: 3 })).toBe("ADMIN · 1 member · 3 projects")
    expect(itemSubtitle("projects", { name: "P", description: "Gripper", updatedAt: "" })).toBe("Gripper")
    expect(itemSubtitle("toolpaths", { name: "T", description: null, updatedAt: "" })).toBe("")
  })

  test("the client reads only the user-scoped read routes", async () => {
    const calls: string[] = []
    const transport: Transport = { request: async (path, method) => { calls.push(`${method} ${path}`); return { status: 200, body: "[]" } }, async *stream() {} }
    const client = new CompanionClient(transport)
    await client.profile(); await client.profileStats()
    for (const kind of ["projects", "components", "toolpaths", "organizations"] as const) await client.userItems(kind)
    expect(calls).toEqual(["GET /api/user/profile", "GET /api/user/stats", "GET /api/user/projects", "GET /api/user/components", "GET /api/user/toolpaths", "GET /api/user/organizations"])
  })
})
