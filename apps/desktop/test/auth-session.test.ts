/**
 * Sign-in drives the session end to end: the screen stores the token, the client sends it
 * as `x-session-token`, and the sidecar answers as that account until the session ends.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { endSession, getSessionToken } from "../src/state/session.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { endSession(app.state.cache); await app.dispose() })

const email = async () => (await app.state.runtime.run(app.client.auth.getSession())).session.user.email

describe("session", () => {
  test("the sign-in form switches the app to that account, and signing out returns to the local profile", async () => {
    expect(await email()).toBe("local@cadcamfun.local")
    await app.state.runtime.run(app.client.auth.signup({
      payload: { name: "Ada", email: "ada@example.com", password: "longpassword", confirmPassword: "longpassword" }
    }))

    // Bun's own FormData ignores DOM forms; the page reads its fields through happy-dom's.
    const nativeFormData = globalThis.FormData
    globalThis.FormData = window.FormData as unknown as typeof FormData
    // happy-dom's History cannot serialise the router's `undefined` state.
    const pushState = window.history.pushState.bind(window.history)
    window.history.pushState = (state, title, url) => pushState(state ?? null, title, url)
    const { root, dispose } = app.visit("/auth/signin")
    try {
      const emailInput = await app.wait(() => root.querySelector<HTMLInputElement>('input[name="email"]'))
      const form = emailInput.form!
      emailInput.value = "ada@example.com"
      form.querySelector<HTMLInputElement>('input[name="password"]')!.value = "longpassword"
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await app.wait(() => getSessionToken() !== undefined)
      expect(await email()).toBe("ada@example.com")

      // The navbar follows the session and offers sign-out.
      const avatar = await app.wait(() => { const a = root.querySelector<HTMLElement>(".reference-avatar"); return a?.textContent === "A" ? a : null })
      avatar.click()
      await app.wait(() => root.querySelector("#reference-profile-menu")?.textContent?.includes("ada@example.com"))
      root.querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!.click()
      await app.wait(() => getSessionToken() === undefined)
      await app.wait(() => root.querySelector(".reference-avatar")?.textContent === "U")
    } finally { dispose(); globalThis.FormData = nativeFormData }

    expect(getSessionToken()).toBeUndefined()
    expect(await email()).toBe("local@cadcamfun.local")
  }, 30000)
})
