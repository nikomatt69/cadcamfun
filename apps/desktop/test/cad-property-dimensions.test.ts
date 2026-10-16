/**
 * Typing dimensions in the property panel, mounted for real over the elements store: a decimal comma or point with any number
 * of decimals, expressions, counts and limits, Cancel/Esc, and an outside update of the element while the person is typing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { formatNumber, normaliseNumberText, parseNumberText, stepNumber } from "../src/features/cad/lib/numberText.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let mountProperties: () => () => void
let app: ReturnType<typeof import("../src/shared/state/context.ts")["createAppState"]>

// Mounting the panel loads the kernel and three; under a loaded machine 5 s is too short.
setDefaultTimeout(60_000)

describe("typed dimensions", () => {
  test("a decimal comma or point, with any number of decimals", () => {
    expect(parseNumberText("12,5")).toEqual({ ok: true, value: 12.5 })
    expect(parseNumberText("12.5")).toEqual({ ok: true, value: 12.5 })
    expect(parseNumberText("0,125")).toEqual({ ok: true, value: 0.125 })
    expect(parseNumberText("3,14159265")).toEqual({ ok: true, value: 3.14159265 })
    expect(parseNumberText(",5")).toEqual({ ok: true, value: 0.5 })
    expect(parseNumberText(" -7,25 ")).toEqual({ ok: true, value: -7.25 })
    expect(parseNumberText("1.")).toEqual({ ok: true, value: 1 })
  })

  test("expressions and units, decimal commas inside them, ; or ', ' between function arguments", () => {
    expect(parseNumberText("40/2+2,5")).toEqual({ ok: true, value: 22.5 })
    expect(parseNumberText("0,1+0,2")).toEqual({ ok: true, value: 0.3 })
    expect(parseNumberText("2in")).toEqual({ ok: true, value: 50.8 })
    expect(parseNumberText("1,5cm")).toEqual({ ok: true, value: 15 })
    expect(parseNumberText("max(1,5; 2)")).toEqual({ ok: true, value: 2 })
    expect(parseNumberText("max(1, 2,5)")).toEqual({ ok: true, value: 2.5 })
    expect(normaliseNumberText("max(1,5; 2)")).toBe("max(1.5, 2)")
  })

  test("degrees stay degrees", () => {
    expect(parseNumberText("45,5°", { degrees: true })).toEqual({ ok: true, value: 45.5 })
    expect(parseNumberText("90deg", { degrees: true })).toEqual({ ok: true, value: 90 })
  })

  test("half-typed, wrong or out-of-range text is an error, not a silent zero", () => {
    expect(parseNumberText("")).toEqual({ ok: false, error: "Enter a value" })
    expect(parseNumberText("12,").ok).toBe(false)
    expect(parseNumberText("-").ok).toBe(false)
    expect(parseNumberText("abc").ok).toBe(false)
    expect(parseNumberText("1/0").ok).toBe(false)
    expect(parseNumberText("0,05", { min: 0.1 })).toEqual({ ok: false, error: "Minimum 0.1" })
    expect(parseNumberText("32,5", { integer: true })).toEqual({ ok: false, error: "Must be a whole number" })
    expect(parseNumberText("32", { integer: true, min: 3 })).toEqual({ ok: true, value: 32 })
  })

  test("shown without float noise, stepped on the step's decimals", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0.3")
    expect(formatNumber(12.5)).toBe("12.5")
    expect(formatNumber(undefined)).toBe("")
    expect(stepNumber(0.2, 0.1, 1)).toBe(0.3)
    expect(stepNumber(0.1, 0.1, -1, { min: 0.1 })).toBe(0.1)
    expect(stepNumber(32, 1, 1, { integer: true })).toBe(33)
  })
})

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const field = (id: string): HTMLInputElement => {
  const found = document.getElementById(id) as HTMLInputElement | null
  if (found === null) throw new Error(`No field '${id}'`)
  return found
}
const type = async (id: string, text: string): Promise<void> => {
  const input = field(id)
  input.focus()
  input.value = text
  input.dispatchEvent(new window.Event("input", { bubbles: true }))
  await tick()
}
const leave = async (id: string): Promise<void> => { field(id).blur(); await tick() }
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (found === undefined) throw new Error(`No button '${label}'`)
  return found
}
const apply = async (): Promise<void> => {
  document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
  await tick(60)
}
const element = (id: string) => useElementsStore.getState().elements.find((e) => e.id === id) as Record<string, any>

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: PropertyPanel } = await import("../src/features/cad/components/PropertyPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const client = createFakeApi()
  app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  mountProperties = () => {
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => AppProvider({ state: app, get children() { return createComponent(PropertyPanel, {}) } }), host)
    return () => { dispose(); host.remove() }
  }
})
afterAll(() => app.dispose())
beforeEach(() => useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] }))

describe("the property panel takes dimensions as typed", () => {
  const select = (props: Record<string, unknown>): string => {
    const id = useElementsStore.getState().addElement(props)
    useElementsStore.getState().selectElement(id)
    return id
  }

  test("no Edit step: type a comma decimal with many digits, Apply writes exactly that", async () => {
    const id = select({ type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 20, segments: 32 })
    const dispose = mountProperties()
    try {
      await tick()
      expect(field("radius").disabled).toBe(false)
      expect(field("radius").value).toBe("10")
      expect(button("Apply").disabled).toBe(true)
      const radius = field("radius")
      await type("radius", "12,")
      await type("radius", "12,3456")
      // Still the same input, still focused, still the text as typed: the panel did not remount it between keystrokes.
      expect(field("radius") === radius).toBe(true)
      expect(document.activeElement === radius).toBe(true)
      expect(radius.value).toBe("12,3456")
      await type("height", "40/2+2,5")
      await leave("height")
      // The field shows the value it will write; the comma was never lost while typing.
      expect(field("height").value).toBe("22.5")
      expect(field("radius") === radius).toBe(true)
      expect(field("radius").value).toBe("12.3456")
      expect(button("Apply").disabled).toBe(false)
      await apply()
      expect(element(id)["radius"]).toBe(12.3456)
      expect(element(id)["height"]).toBe(22.5)
      expect(element(id)["segments"]).toBe(32)
      expect(button("Apply").disabled).toBe(true)
    } finally { dispose() }
  })

  test("an invalid or half-typed value is refused, shown, and never written as empty or zero", async () => {
    const id = select({ type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 20, segments: 32 })
    const dispose = mountProperties()
    try {
      await tick()
      await type("radius", "")
      await leave("radius")
      await type("segments", "32,5")
      await leave("segments")
      expect(field("radius").getAttribute("aria-invalid")).toBe("true")
      expect(document.body.textContent).toContain("Enter a value")
      expect(document.body.textContent).toContain("Must be a whole number")
      await apply()
      expect(element(id)["radius"]).toBe(10)
      expect(element(id)["segments"]).toBe(32)
      expect(document.querySelector("[data-testid='property-errors']")).not.toBeNull()
      await type("radius", "0,05")
      await leave("radius")
      expect(document.body.textContent).toContain("Minimum 0.1")
      await type("radius", "7,5")
      await type("segments", "48")
      await apply()
      expect(element(id)["radius"]).toBe(7.5)
      expect(element(id)["segments"]).toBe(48)
    } finally { dispose() }
  })

  test("rotation axes take decimal commas in degrees; Esc drops the edit and clears the bad text", async () => {
    const id = select({ type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10, rotation: { x: 0, y: 0, z: 0 } })
    const dispose = mountProperties()
    try {
      await tick()
      await type("rotation-z", "45,5°")
      await apply()
      expect(element(id)["rotation"]).toEqual({ x: 0, y: 0, z: 45.5 })
      await type("width", "abc")
      await leave("width")
      expect(field("width").value).toBe("abc")
      document.querySelector("form")!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await tick(60)
      expect(field("width").value).toBe("10")
      expect(field("width").getAttribute("aria-invalid")).toBe("false")
      expect(element(id)["width"]).toBe(10)
    } finally { dispose() }
  })

  test("an outside update of the element does not wipe what the person is typing, and only changed fields are written", async () => {
    const id = select({ type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
    const dispose = mountProperties()
    try {
      await tick()
      await type("width", "15,25")
      // The viewport moves the part meanwhile.
      useElementsStore.getState().updateElement(id, { x: 100 })
      await tick()
      expect(field("width").value).toBe("15,25")
      await apply()
      expect(element(id)["width"]).toBe(15.25)
      expect(element(id)["x"]).toBe(100)
      // Not dirty: the next outside change shows up.
      useElementsStore.getState().updateElement(id, { depth: 33 })
      await tick()
      expect(field("depth").value).toBe("33")
    } finally { dispose() }
  })
})

describe("the canvas element card takes dimensions the same way", () => {
  test("a decimal comma is saved as a number, an invalid value is refused", async () => {
    const { render } = await import("solid-js/web")
    const { createComponent } = await import("solid-js")
    const { default: ElementInfo } = await import("../src/features/cad/components/ElementInfo.tsx")
    const id = useElementsStore.getState().addElement({ type: "sphere", x: 0, y: 0, z: 0, radius: 10 })
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => createComponent(ElementInfo, { elementId: id }), host)
    const titled = (title: string) => host.querySelector<HTMLButtonElement>(`button[title='${title}']`)!
    try {
      titled("Edit properties").click()
      await tick()
      await type("radius", "abc")
      await leave("radius")
      titled("Save changes").click()
      await tick()
      expect(element(id)["radius"]).toBe(10)
      await type("radius", "12,75")
      await type("x", "-3,5")
      titled("Save changes").click()
      await tick()
      expect(element(id)["radius"]).toBe(12.75)
      expect(element(id)["x"]).toBe(-3.5)
    } finally { dispose(); host.remove() }
  })
})
