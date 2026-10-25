import { describe, expect, test } from "bun:test"
import { copyText } from "../src/shared/lib/clipboard.ts"

describe("text clipboard transport", () => {
  test("the installed plugin invokes only the permitted native text-write command", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
    const calls: Array<{ command: string; args: unknown }> = []
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { __TAURI_INTERNALS__: { invoke: async (command: string, args: unknown) => { calls.push({ command, args }) } } }
    })
    try {
      await copyText("Ø6 — G1 X12", { desktop: true })
      expect(calls).toEqual([{ command: "plugin:clipboard-manager|write_text", args: { text: "Ø6 — G1 X12", label: undefined } }])
    } finally {
      if (previous) Object.defineProperty(globalThis, "window", previous)
      else Reflect.deleteProperty(globalThis, "window")
    }
  })

  test("desktop copies Unicode through the native writer without touching the browser clipboard", async () => {
    const native: string[] = []
    let browserCalled = false
    await copyText("G1 X12 ; Ø6 😀", {
      desktop: true,
      nativeWrite: async (text) => { native.push(text) },
      browserWrite: async () => { browserCalled = true }
    })
    expect(native).toEqual(["G1 X12 ; Ø6 😀"])
    expect(browserCalled).toBe(false)
  })

  test("browser copying never loads or calls the native writer", async () => {
    const browser: string[] = []
    let nativeCalled = false
    await copyText("{\"tool\":6}", {
      desktop: false,
      nativeWrite: async () => { nativeCalled = true },
      browserWrite: async (text) => { browser.push(text) }
    })
    expect(browser).toEqual(["{\"tool\":6}"])
    expect(nativeCalled).toBe(false)
  })

  test("native permission failures propagate and do not silently fall back to browser copying", async () => {
    let browserCalled = false
    await expect(copyText("private", {
      desktop: true,
      nativeWrite: async () => { throw new Error("write-text denied") },
      browserWrite: async () => { browserCalled = true }
    })).rejects.toThrow("write-text denied")
    expect(browserCalled).toBe(false)
  })

  test("browser permission failures propagate to the caller's feedback", async () => {
    await expect(copyText("private", {
      desktop: false,
      browserWrite: async () => { throw new Error("Permission denied") }
    })).rejects.toThrow("Permission denied")
  })
})
