import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("a Solid screen mounts under happy-dom", async () => {
  installDom("http://localhost/waitlist")
  const { render } = await import("solid-js/web")
  const { WaitlistScreen } = await import("../src/features/auth/screens/waitlist.tsx")
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const client = createFakeApi()
  const runtime = runtimeForClient(client)
  const app = createAppState({ client, runtime, sidecar: "fake" })
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => AppProvider({ state: app, get children() { return WaitlistScreen() } }), root)
  expect(root.querySelector("h1")?.textContent).toBe("Join the waitlist")
  dispose(); app.dispose()
})
