import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { installDom } from "./helpers/dom.ts"

test("the in-window Help menu (Windows and Linux) has the update items and sends their ids to the app", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { TitleBar } = await import("../src/shared/components/title-bar.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const sent: string[] = []
  const dispose = render(() => TitleBar({ onMenu: (id) => { sent.push(id) }, onOpenPalette: () => {}, forceMenus: true }), root)
  try {
    const help = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Help")!
    help.click()
    const items = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(items.map((item) => item.textContent?.trim())).toEqual(expect.arrayContaining(["Check for updates…", "Release notes", "Documentation", "Show logs folder"]))
    items.find((item) => item.textContent?.trim() === "Check for updates…")!.click()
    expect(sent).toEqual(["help.check_updates"])
  } finally { dispose() }
})

test("every id of the in-window menus exists in the shell's menu.rs, so the fallback cannot invent one", async () => {
  const { MENUS } = await import("../src/shared/components/title-bar.tsx")
  const rust = readFileSync(new URL("../src-tauri/src/menu.rs", import.meta.url), "utf8")
  // The edit items are the platform's predefined ones (no id of their own in menu.rs), the others must be declared.
  for (const id of MENUS.filter((menu) => menu.id !== "edit").flatMap((menu) => menu.items.map((item) => item.id))) expect(rust).toContain(`"${id}"`)
})
