import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("MCP form edits the actual endpoint and associates controls with their labels", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { McpServerForm } = await import("./mcp.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let submitted: { readonly url?: string | null } | undefined
  const dispose = render(() => McpServerForm({
    initialValues: { id: "server-123", name: "Local", type: "sse", url: "http://localhost:7331/events", enabled: true },
    onSubmit: async (value) => { submitted = value }
  }), root)
  try {
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))
    expect(inputs.every((input) => (input.labels?.length ?? 0) > 0)).toBe(true)
    const url = inputs.find((input) => input instanceof HTMLInputElement && input.value === "http://localhost:7331/events")
    expect(url).toBeDefined()
    root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(submitted?.url).toBe("http://localhost:7331/events")
  } finally { dispose() }
}, 120_000)

test("required MCP fields expose their validation messages to assistive technology", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { McpServerForm } = await import("./mcp.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => McpServerForm({ onSubmit: async () => {} }), root)
  try {
    root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    const invalid = Array.from(root.querySelectorAll<HTMLInputElement>('[aria-invalid="true"]'))
    expect(invalid).toHaveLength(2)
    expect(invalid.every((input) => document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent)).toBe(true)
    invalid[0]!.value = "Local"
    invalid[0]!.dispatchEvent(new Event("input", { bubbles: true }))
    expect(invalid[0]!.getAttribute("aria-invalid")).toBe("false")
    expect(invalid[1]!.getAttribute("aria-invalid")).toBe("true")
  } finally { dispose() }
}, 120_000)
