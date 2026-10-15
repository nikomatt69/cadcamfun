import { guidePages } from "../src/data/guidePages"
import { apiGroups } from "../src/data/apiGroups"
import { describe, expect, test } from "bun:test"
import { apps, dependencyNote, packages, stack } from "../src/data/architecture"
import { docsIndex, docsIndexGaps } from "../src/data/docsIndex"
import { activeDocsSection, sidebarHrefs } from "../src/data/docsSidebar"

const sidebarContract = [
  "/docs",
  "/docs/architecture",
  "/docs/stack",
  "/docs/conventions",
  "/docs/configuration",
  "/docs/cad",
  "/docs/cam",
  "/docs/setups",
  "/docs/viewport",
  "/docs/database",
  "/docs/api",
  "/docs/sidecar",
  "/docs/desktop",
  "/docs/mobile",
  "/docs/release",
  "/docs/ai",
  "/docs/plugins",
  "/docs/history",
  "/docs/workflows",
  "/docs/guides",
  "/docs/guides/quickstart",
  "/docs/guides/api-tour",
  "/docs/guides/local-dev",
  "/docs/guides/contributing",
  ...guidePages.map((guide) => `/docs/guides/${guide.slug}`),
  "/docs/packages",
  "/docs/source-map",
  "/docs/documentation",
  ...apiGroups.map((group) => `/docs/api/${group.slug}`),
]

describe("docs index", () => {
  test("every sidebar page has retrieval text and nothing is orphaned", () => {
    expect(docsIndexGaps()).toEqual({ missing: [], orphaned: [] })
  })

  test("the sidebar hrefs are the docs contract", () => {
    expect(sidebarHrefs()).toEqual(sidebarContract)
    expect(docsIndex.map((entry) => entry.href)).toEqual(sidebarContract)
  })

  test("every indexed page has a title, summary, and keywords", () => {
    for (const entry of docsIndex) {
      expect(entry.title.trim().length).toBeGreaterThan(0)
      expect(entry.summary.trim().length).toBeGreaterThan(0)
      expect(entry.keywords.length).toBeGreaterThan(0)
    }
  })

  test("nested guides stay in the Guides section", () => {
    expect(activeDocsSection("/docs/guides/quickstart").id).toBe("guides")
    expect(activeDocsSection("/docs/guides/quickstart/").id).toBe("guides")
    expect(activeDocsSection("/docs/guides/local-dev").id).toBe("guides")
    expect(activeDocsSection("/docs/guides/contributing").id).toBe("guides")
    expect(activeDocsSection("/docs/guides").id).toBe("guides")
  })

  test("a shorter prefix does not steal a longer page", () => {
    expect(activeDocsSection("/docs/guide").id).toBe("docs")
    expect(activeDocsSection("/docs/packages/detail").id).toBe("reference")
  })

  test("the overview stays in Docs", () => {
    expect(activeDocsSection("/docs").id).toBe("docs")
    expect(activeDocsSection("/docs/architecture").id).toBe("docs")
    expect(activeDocsSection("/docs/release").id).toBe("docs")
  })

  test("reference pages stay out of Docs", () => {
    expect(activeDocsSection("/docs/packages").id).toBe("reference")
    expect(activeDocsSection("/docs/source-map").id).toBe("reference")
  })
})

describe("architecture map", () => {
  test("packages and apps keep the homepage shape and published names", () => {
    for (const unit of [...packages, ...apps]) {
      expect(typeof unit.name).toBe("string")
      expect(typeof unit.path).toBe("string")
      expect(typeof unit.role).toBe("string")
      expect(typeof unit.owns).toBe("string")
    }

    expect(packages.map((unit) => [unit.name, unit.path])).toEqual([
      ["@cadcamfun/db", "packages/db"],
      ["@cadcamfun/core", "packages/core"],
      ["@cadcamfun/api", "packages/api"],
      ["@cadcamfun/ai", "packages/ai"],
      ["@cadcamfun/plugin-sdk", "packages/plugin-sdk"],
      ["@cadcamfun/vcs", "packages/vcs"],
      ["@cadcamfun/workflow", "packages/workflow"],
      ["@cadcamfun/httpapi-codegen", "packages/httpapi-codegen"],
      ["@nikoemme_/cadcamfun-nikcli-plugin", "packages/nikcli-plugin"],
    ])

    expect(apps.map((unit) => [unit.name, unit.path])).toEqual([
      ["@cadcamfun/sidecar", "apps/sidecar"],
      ["@cadcamfun/desktop", "apps/desktop"],
      ["@cadcamfun/mobile", "apps/mobile"],
    ])

    expect(stack.map((row) => row.concern)).toEqual([
      "Runtime / package manager / test runner",
      "Application logic",
      "Persistence",
      "Desktop shell",
      "UI",
      "AI",
    ])
    expect(stack.every((row) => row.choice.trim().length > 0)).toBe(true)
    expect(dependencyNote.includes("core")).toBe(true)
    expect(dependencyNote.includes("sidecar")).toBe(true)
  })
})
