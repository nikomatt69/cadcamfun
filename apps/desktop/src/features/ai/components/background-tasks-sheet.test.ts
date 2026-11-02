import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("the task sheet wraps keyboard focus and closes on Escape", async () => {
  installDom()
  const { handleTaskSheetKeys } = await import("./BackgroundTasksSheet.tsx")
  const panel = document.createElement("div")
  panel.tabIndex = -1
  panel.innerHTML = '<button>Stop all</button><button disabled>Unavailable</button><details><summary>Report</summary><button>Hidden action</button></details><button>Close</button>'
  document.body.replaceChildren(panel)
  const [first, , hidden, last] = panel.querySelectorAll<HTMLButtonElement>("button")
  let closed = false
  const press = (key: string, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })
    handleTaskSheetKeys(event, panel, () => { closed = true })
    return event
  }
  panel.focus()
  expect(press("Tab", true).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(last!)
  expect(press("Tab").defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(first!)
  first!.focus()
  expect(press("Tab", true).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(last!)
  expect(document.activeElement).not.toBe(hidden)
  expect(press("Escape").defaultPrevented).toBe(true)
  expect(closed).toBe(true)
}, 120_000)
