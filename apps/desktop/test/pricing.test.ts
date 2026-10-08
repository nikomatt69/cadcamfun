/** The pricing page acts on the account: it starts the Pro trial and reports that paid checkout is unavailable. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const button = (root: HTMLElement, plan: string) => root.querySelector<HTMLButtonElement>(`button[data-plan="${plan}"]`)

describe("pricing", () => {
  test("a paid plan without a payment provider explains itself, and Pro starts the trial", async () => {
    // happy-dom's History cannot serialise the router's `undefined` state.
    const pushState = window.history.pushState.bind(window.history)
    window.history.pushState = (state, title, url) => pushState(state ?? null, title, url)
    const { root, dispose } = app.visit("/pricing")
    try {
      const basic = await app.wait(() => { const b = button(root, "BASIC"); return b && !b.disabled ? b : null })
      expect(button(root, "FREE")!.disabled).toBe(true)
      expect(button(root, "PRO")!.textContent).toContain("Start 14-day trial")

      basic.click()
      await app.wait(() => root.querySelector('[role="alert"]'))
      expect((await app.state.runtime.run(app.client.billing.current())).plan).toBe("FREE")

      button(root, "PRO")!.click()
      await app.wait(() => window.location.pathname === "/settings/subscription")
      const current = await app.state.runtime.run(app.client.billing.current())
      expect(current).toMatchObject({ plan: "PRO", status: "trialing", isOnTrial: true })
    } finally { dispose() }
  }, 30000)
})
