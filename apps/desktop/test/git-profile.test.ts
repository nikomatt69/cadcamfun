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
    const submit = () => form?.querySelector<HTMLButtonElement>('button[type="submit"]')
    // The button is always rendered (stable layout) and enabled only while the draft differs from the saved identity.
    expect(submit()).not.toBeNull()
    expect(submit()?.disabled).toBe(false)
    form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
    // While saving the whole fieldset is disabled; once saved the form is editable again and nothing is left to save.
    const fieldset = form?.querySelector("fieldset")
    expect(fieldset?.disabled).toBe(true)
    await app.wait(() => fieldset?.disabled === false && submit()?.disabled === true)
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
