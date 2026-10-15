import { guidePages } from "./guidePages"
import { apiGroups } from "./apiGroups"
import { apiCategories } from "../lib/apiCategories"

/**
 * Docs information architecture.
 *
 * Four areas: Docs (the system), Guides (how to work), API (every HTTP operation), Reference (where code lives).
 * `activeDocsSection` picks the area whose item href is the longest match, so
 * `/docs/guides/quickstart` stays in Guides while `/docs` stays in Docs.
 */

export type DocsNavItem = {
  readonly title: string
  readonly href: string
}

export type DocsNavGroup = {
  readonly title: string
  readonly items: readonly DocsNavItem[]
}

export type DocsSection = {
  readonly id: string
  readonly title: string
  readonly href: string
  readonly groups: readonly DocsNavGroup[]
}

export const docsNav: readonly DocsSection[] = [
  {
    id: "docs",
    title: "Docs",
    href: "/docs",
    groups: [
      {
        title: "Start",
        items: [
          { title: "Overview", href: "/docs" },
          { title: "Architecture", href: "/docs/architecture" },
          { title: "Stack", href: "/docs/stack" },
          { title: "Conventions", href: "/docs/conventions" },
          { title: "Configuration", href: "/docs/configuration" },
        ],
      },
      {
        title: "Modelling",
        items: [
          { title: "CAD geometry", href: "/docs/cad" },
          { title: "CAM and G-code", href: "/docs/cam" },
          { title: "Setups", href: "/docs/setups" },
          { title: "Viewport", href: "/docs/viewport" },
        ],
      },
      {
        title: "Kernels",
        items: [
          { title: "Kernel overview", href: "/docs/kernels" },
          { title: "Sketch solver", href: "/docs/kernels/sketch-solver" },
          { title: "Mesh and CSG", href: "/docs/kernels/mesh" },
          { title: "Exact B-rep", href: "/docs/kernels/brep" },
          { title: "Feature generators", href: "/docs/kernels/features" },
          { title: "Tolerance and tessellation", href: "/docs/kernels/tolerance" },
          { title: "CAM machining kernel", href: "/docs/kernels/cam" },
        ],
      },
      {
        title: "Runtime",
        items: [
          { title: "Database", href: "/docs/database" },
          { title: "Sidecar", href: "/docs/sidecar" },
          { title: "Desktop", href: "/docs/desktop" },
          { title: "Mobile", href: "/docs/mobile" },
          { title: "Release", href: "/docs/release" },
        ],
      },
      {
        title: "Extensions",
        items: [
          { title: "AI", href: "/docs/ai" },
          { title: "Plugins", href: "/docs/plugins" },
          { title: "History", href: "/docs/history" },
          { title: "Workflows", href: "/docs/workflows" },
        ],
      },
    ],
  },
  {
    id: "guides",
    title: "Guides",
    href: "/docs/guides",
    groups: [
      {
        title: "Start",
        items: [
          { title: "Guides", href: "/docs/guides" },
          { title: "Quickstart", href: "/docs/guides/quickstart" },
          { title: "API walkthrough", href: "/docs/guides/api-tour" },
        ],
      },
      {
        title: "Repository",
        items: [
          { title: "Local development", href: "/docs/guides/local-dev" },
          { title: "Contributing", href: "/docs/guides/contributing" },
        ],
      },
      ...["Design and manufacture", "Clients and extensions", "Operations and recovery"].map((category) => ({
        title: category,
        items: guidePages.filter((guide) => guide.category === category).map((guide) => ({ title: guide.title, href: `/docs/guides/${guide.slug}` })),
      })),
    ],
  },
  {
    id: "api",
    title: "API",
    href: "/docs/api",
    groups: [
      { title: "API Reference", items: [{ title: "Overview", href: "/docs/api" }] },
      ...apiCategories.map((category) => ({
        title: category.title,
        items: category.slugs.map((slug) => apiGroups.find((group) => group.slug === slug)!).map((group) => ({ title: group.title, href: `/docs/api/${group.slug}` })),
      })),
    ],
  },
  {
    id: "reference",
    title: "Reference",
    href: "/docs/packages",
    groups: [
      {
        title: "Workspace",
        items: [
          { title: "Packages and apps", href: "/docs/packages" },
          { title: "Source map", href: "/docs/source-map" },
          { title: "Documentation operations", href: "/docs/documentation" },
        ],
      },
    ],
  },
]

export function sidebarHrefs(): readonly string[] {
  return docsNav.flatMap((section) => section.groups.flatMap((group) => group.items.map((item) => item.href)))
}

export function sidebarTitle(href: string): string | undefined {
  for (const section of docsNav) {
    for (const group of section.groups) {
      const item = group.items.find((entry) => entry.href === href)
      if (item) return item.title
    }
  }
  return undefined
}

/** "Docs · Modelling" style label of the area and group a page sits in. */
export function sidebarGroup(href: string): string | undefined {
  for (const section of docsNav) {
    for (const group of section.groups) {
      if (group.items.some((entry) => entry.href === href)) return `${section.title} ${group.title}`
    }
  }
  return undefined
}

function normalizeDocsPath(pathname: string): string {
  const bare = pathname.split("?")[0]?.split("#")[0] ?? ""
  const trimmed = bare.replace(/\/+$/, "")
  return trimmed.length > 0 ? trimmed : "/docs"
}

export function activeDocsSection(pathname: string): DocsSection {
  const path = normalizeDocsPath(pathname)
  let match: DocsSection = docsNav[0]!
  let matchLength = -1

  for (const section of docsNav) {
    for (const group of section.groups) {
      for (const item of group.items) {
        const hits = path === item.href || path.startsWith(`${item.href}/`)
        if (hits && item.href.length > matchLength) {
          match = section
          matchLength = item.href.length
        }
      }
    }
  }

  return match
}
