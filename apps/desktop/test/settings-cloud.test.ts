/** Settings → Cloud: the private connection form is on the existing settings screen. */
import { afterAll, beforeAll, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) as HTMLButtonElement | undefined

test("the Cloud tab shows a private, disconnected connection form", async () => {
  const { root, dispose } = app.visit("/settings")
  try {
    await app.wait(() => button(root, "Cloud"))
    button(root, "Cloud")!.click()
    await app.wait(() => root.textContent?.includes("Not connected"))
    expect(root.querySelector("#cloud-origin")).toBeTruthy()
    expect(root.querySelector("#cloud-setup-code")).toBeTruthy()
    expect(root.textContent).toContain("Each person signs in on their own computer")
    expect(root.textContent).toContain("Sign in to create your own auth token")
    expect(root.textContent).toContain("Another account cannot join it.")
    expect(button(root, "Connect")?.disabled).toBe(true)
    expect(button(root, "Sign in")).toBeTruthy()
    expect(root.querySelector("#cloud-auth-token")).toBeNull()
  } finally { dispose() }
}, 60000)
