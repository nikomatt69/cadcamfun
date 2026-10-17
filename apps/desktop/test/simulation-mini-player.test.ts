import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("CAM footer player seeks on the existing clock, pauses while seeking and replays from the end", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { SimulationMiniPlayer } = await import("../src/features/cam/components/SimulationMiniPlayer.tsx")
  const { ViewportControls } = await import("../src/viewport/view3d/viewport-controls.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let readTime = () => 0, readPlaying = () => false
  const dispose = render(() => {
    const [time, setTime] = createSignal(0), [playing, setPlaying] = createSignal(false)
    readTime = time; readPlaying = playing
    return ViewportControls({
      preset: "perspective", mode: "shaded", grid: true, axes: true, enabled: true,
      transform: "none", canTransform: false,
      onPreset: () => {}, onMode: () => {}, onGrid: () => {}, onAxes: () => {},
      onFit: () => {}, onFullscreen: () => {}, onTransform: () => {},
      footer: SimulationMiniPlayer({ get playing() { return playing() }, get time() { return time() }, duration: 12.5, onPlayingChange: setPlaying, onSeek: setTime })
    })
  }, root)
  const button = (label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const slider = root.querySelector<HTMLInputElement>('input[aria-label="Simulation position"]')!
  try {
    const player = root.querySelector('[data-testid="simulation-mini-player"]')!
    expect(player.nextElementSibling?.textContent).toBe("Fullscreen")
    expect(button("Back 5 seconds").disabled).toBe(true)
    button("Play simulation").click()
    expect(readPlaying()).toBe(true)
    button("Pause simulation").click()
    expect(readPlaying()).toBe(false)
    button("Forward 5 seconds").click()
    expect(readTime()).toBe(5)
    button("Play simulation").click()
    button("Forward 5 seconds").click()
    expect(readPlaying()).toBe(false)
    expect(readTime()).toBe(10)
    button("Forward 5 seconds").click()
    expect(readTime()).toBe(12.5)
    expect(button("Forward 5 seconds").disabled).toBe(true)
    button("Play simulation").click()
    expect(readTime()).toBe(0)
    expect(readPlaying()).toBe(true)
    slider.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }))
    expect(readPlaying()).toBe(false)
    slider.value = "7.25"
    slider.dispatchEvent(new window.Event("input", { bubbles: true }))
    expect(readTime()).toBe(7.25)
    expect(slider.getAttribute("aria-valuetext")).toBe("0:07 / 0:12")
    button("Back 5 seconds").click()
    expect(readTime()).toBe(2.25)
    button("Back 5 seconds").click()
    expect(readTime()).toBe(0)
  } finally { dispose() }
})

test("an empty simulation disables the mini player", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { SimulationMiniPlayer } = await import("../src/features/cam/components/SimulationMiniPlayer.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => SimulationMiniPlayer({ playing: false, time: 20, duration: 0, onPlayingChange: () => { throw new Error("empty playback") }, onSeek: () => { throw new Error("empty seek") } }), root)
  try {
    for (const button of root.querySelectorAll<HTMLButtonElement>("button")) expect(button.disabled).toBe(true)
    expect(root.querySelector<HTMLInputElement>("input")!.disabled).toBe(true)
    expect(root.querySelector("output")!.textContent).toBe("0:00 / 0:00")
  } finally { dispose() }
})
