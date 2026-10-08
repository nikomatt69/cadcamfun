import { expect, test } from "bun:test"

const source = (path: string) => Bun.file(new URL(`../src/${path}`, import.meta.url)).text()

test("CAD and CAM use the same quick navigation component", async () => {
  for (const path of ["cad/components/EnanchedSidebarCad.tsx", "cam/components/CamSidebar.tsx"]) {
    expect(await source(path)).toContain("<WorkspaceNavigation isOpen={props.isOpen} />")
  }
  const menu = await source("components/workspace-navigation.tsx")
  for (const route of ["/cad", "/cam", "/projects", "/materials", "/tools", "/settings"]) {
    expect(menu).toContain(`href: "${route}"`)
  }
  expect(menu).toContain("aria-expanded={dropdown()}")
})

test("workstation tabs share glass selection and preserve narrow-window stage space", async () => {
  const css = await source("components/workstation.css")
  expect(css).toContain(".workstation-workspace-tabs) button[aria-pressed=\"true\"]")
  expect(css).toContain("border-bottom-color: #007acc")
  expect(css).toContain("border-radius: 5px 5px 0 0")
  expect(css).toContain("min-width: 320px")
  expect(css).toContain(".workstation-row-actions:focus-within button")
})
