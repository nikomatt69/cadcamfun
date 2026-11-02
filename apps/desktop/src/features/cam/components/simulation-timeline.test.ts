import { expect, test } from "bun:test"
import { installDom } from "../../../../test/helpers/dom.ts"

test("timeline seeks only while the pointer that began on the track is dragging", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { SimulationTimeline } = await import("./SimulationTimeline.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const seeks: number[] = []
  const dispose = render(() => SimulationTimeline({
    duration: 100, seconds: 0, spans: [], colors: [], names: [], toolChanges: [], markers: [], rate: 1,
    onRate: () => {}, onSeek: (seconds) => { seeks.push(seconds) }, onStepMove: () => {}, onStepOperation: () => {}
  }), root)
  try {
    const track = root.querySelector<HTMLElement>('[role="slider"]')!
    track.getBoundingClientRect = () => ({ left: 10, width: 100, right: 110, top: 0, bottom: 20, height: 20, x: 10, y: 0, toJSON: () => ({}) })
    const pointer = (type: string, pointerId: number, x: number, buttons: number): void => {
      const event = new PointerEvent(type, { bubbles: true, button: 0, buttons, pointerId, clientX: x, isPrimary: true })
      track.dispatchEvent(event)
    }
    pointer("pointermove", 1, 30, 1)
    expect(seeks).toEqual([])
    pointer("pointerdown", 1, 30, 1)
    pointer("pointermove", 2, 50, 1)
    pointer("pointermove", 1, 70, 1)
    pointer("pointerup", 1, 70, 0)
    pointer("pointermove", 1, 90, 1)
    expect(seeks).toEqual([20, 60])
    pointer("pointerdown", 3, 60, 1)
    pointer("pointercancel", 3, 60, 0)
    pointer("pointermove", 3, 80, 1)
    expect(seeks).toEqual([20, 60, 50])
  } finally { dispose() }
}, 120_000)
