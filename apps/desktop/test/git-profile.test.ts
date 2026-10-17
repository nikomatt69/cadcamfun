import { expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

test("Settings Profile edits the persisted Git identity and reloads it when reopened", async () => {
  const app = await bootLiveApp()
  let page: ReturnType<typeof app.visit> | undefined
  try {
    page = app.visit("/settings")
    const input = (id: string) => document.querySelector<HTMLInputElement>(`#git-profile-${id}`)
    const name = await app.wait(() => { const field = input("name"); return field?.value ? field : undefined }, 60000)
    const email = await app.wait(() => input("email"))
    const accountBefore = (await app.sidecar.call("/api/user/profile")).body
    name.value = "Workshop Engineer"
    name.dispatchEvent(new window.Event("input", { bubbles: true }))
    email.value = "engineer@workshop.test"
    email.dispatchEvent(new window.Event("input", { bubbles: true }))
    const form = name.closest("form")
    expect(form).not.toBeNull()
    expect(form?.querySelector('button[type="submit"]')).not.toBeNull()
    form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
    await app.wait(() => !form?.querySelector('button[type="submit"]'))
    expect((await app.sidecar.call("/api/user/git-profile")).body).toEqual({ name: "Workshop Engineer", email: "engineer@workshop.test" })
    expect((await app.sidecar.call("/api/user/profile")).body.name).toBe(accountBefore.name)
    page.dispose()
    page = app.visit("/settings")
    await app.wait(() => input("name")?.value === "Workshop Engineer")
    expect(input("email")?.value).toBe("engineer@workshop.test")
  } finally {
    page?.dispose()
    await app.dispose()
  }
}, 60000)
