/** Settings → Devices: the companion pairing panel is reachable from the Settings tabs. */
import { afterAll, beforeAll, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined

// Turning the gateway on needs a listening sidecar; the in-process harness has none, so that path is covered by the
// sidecar tests (companion-*.test.ts) and the iOS CI run.
test("the Devices tab shows the pairing panel with the gateway off", async () => {
  const { root, dispose } = app.visit("/settings")
  try {
    await app.wait(() => button(root, "Devices"))
    button(root, "Devices")!.click()
    await app.wait(() => button(root, "Turn on"))
    expect(root.textContent).toContain("Off. Nothing is reachable from other devices.")
    expect(root.textContent).toContain("No paired devices.")
    expect(button(root, "Show QR code")).toBeUndefined()
  } finally { dispose() }
}, 60000)
