/**
 * Scenes for the system surfaces: pairing a phone, applying an update, background agents at work.
 *
 * Same rules as previews.tsx: one cause-and-effect per scene, a poster phase that tells it alone, a last
 * phase that is the reset beat, real words only where the story is about them (the agents' own names, one
 * sample device), the rest quiet bars. Decorative: `Stage` hides them from assistive tech.
 */
import { For, type JSX } from "solid-js"
import { Check, Smartphone } from "lucide-solid"
import { H, Stage, W } from "./index.ts"
import { t } from "../../../i18n/index.ts"
import "./scenes-system.css"

// ── Companion: a phone scans the code and joins the paired list ────────────
// 0 idle · 1 the phone rises · 2 the code is scanned · 3 the phone is on the list · 4 reset
/** The sample device the new row shows: illustration content, not UI text. */
const SAMPLE_DEVICE = "iPhone" // i18n-ok
const QR_CELLS = 9

/** A fixed pseudo-random code with the three finder squares, so the picture never changes between renders. */
const QR: ReadonlyArray<readonly [number, number]> = (() => {
  const cells: Array<readonly [number, number]> = []
  let seed = 7
  for (let y = 0; y < QR_CELLS; y++) {
    for (let x = 0; x < QR_CELLS; x++) {
      const finder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5)
      seed = (seed * 48271) % 2147483647
      if (!finder && seed % 5 < 2) cells.push([x, y])
    }
  }
  return cells
})()
const FINDERS: ReadonlyArray<readonly [number, number]> = [[0, 0], [6, 0], [0, 6]]

export function PairPreview(): JSX.Element {
  return (
    <Stage class="ss-pair" width={W} height={H} steps={[600, 900, 1000, 3200, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="sys-qr" data-scan={phase() === 2}>
            <svg width="84" height="84" viewBox={`0 0 ${QR_CELLS * 8} ${QR_CELLS * 8}`}>
              <For each={FINDERS}>
                {([x, y]) => <rect class="sys-qr__finder" x={x * 8 + 2} y={y * 8 + 2} width="20" height="20" rx="3" />}
              </For>
              <For each={QR}>{([x, y]) => <rect class="sys-qr__cell" x={x * 8 + 1} y={y * 8 + 1} width="6" height="6" rx="1" />}</For>
            </svg>
            <span class="sys-qr__sweep" />
          </div>
          <div class="sys-devices">
            <div class="sys-device" data-on={phase() >= 3}>
              <span class="prj-dot" />
              <span class="sys-device__name">{SAMPLE_DEVICE}</span>
            </div>
            <div class="sys-device sys-device--quiet"><span class="ss-bar" style={{ width: "52px" }} /><span class="ss-bar" style={{ width: "30px", "margin-left": "auto" }} /></div>
            <div class="sys-device sys-device--quiet"><span class="ss-bar" style={{ width: "40px" }} /><span class="ss-bar" style={{ width: "30px", "margin-left": "auto" }} /></div>
          </div>
          <div class="sys-phone" data-up={phase() >= 1} data-joined={phase() >= 3}>
            <span class="sys-phone__notch" />
            <span class="sys-phone__badge"><Smartphone size={13} class="sys-phone__idle" /><Check size={13} stroke-width={3} class="sys-phone__ok" /></span>
            <span class="ss-bar" style={{ width: "34px" }} />
            <span class="ss-bar" style={{ width: "24px" }} />
          </div>
        </div>
      )}
    </Stage>
  )
}

// ── Update: the bar fills, the same window comes back new ──────────────────
// 0 idle · 1 progress fills · 2 the window is replaced · 3 hold · 4 reset
export function UpdatePreview(): JSX.Element {
  return (
    <Stage class="ss-update" width={W} height={104} steps={[600, 2000, 700, 2800, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="sys-win" data-new={phase() >= 3} data-swap={phase() === 2}>
            <div class="sys-win__bar">
              <span class="sys-win__dot" /><span class="sys-win__dot" /><span class="sys-win__dot" />
              <span class="sys-win__accent" />
            </div>
            <div class="sys-win__body">
              <div class="sys-win__side"><span class="ss-bar" style={{ width: "30px" }} /><span class="ss-bar" style={{ width: "24px" }} /><span class="ss-bar" style={{ width: "34px" }} /></div>
              <div class="sys-win__main"><span class="ss-bar" style={{ width: "120px" }} /><span class="ss-bar" style={{ width: "86px" }} /><span class="ss-bar" style={{ width: "104px" }} /></div>
            </div>
          </div>
          <div class="sys-progress" data-on={phase() === 1} data-done={phase() >= 2}>
            <span class="sys-progress__fill" data-on={phase() >= 1} />
          </div>
          <span class="sys-done" data-on={phase() >= 3}><Check size={16} stroke-width={3} /></span>
        </div>
      )}
    </Stage>
  )
}

// ── Agents: three specialists working in parallel ──────────────────────────
// 0 idle · 1 all three at work, bars fill one after another · 2 all done, hold · 3 reset
const AGENTS = ["researcher", "modeler", "machinist"] as const

export function TasksPreview(): JSX.Element {
  return (
    <Stage class="ss-tasks" width={W} height={H} steps={[500, 3000, 3200, 500]} poster={2}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 3}>
          <div class="sys-tasks">
            <For each={AGENTS}>
              {(agent, i) => (
                <div class="sys-task" data-run={phase() === 1} data-done={phase() >= 2}>
                  <span class="sys-task__state">
                    <span class="sys-task__pulse" />
                    <Check size={13} stroke-width={3} class="sys-task__check" />
                  </span>
                  <span class="sys-task__name">{t(`ai.agent.name.${agent}` as const)}</span>
                  <span class="sys-task__track">
                    <span class="sys-task__fill" data-on={phase() >= 1} style={{ "transition-delay": `${i() * 0.45}s`, "transition-duration": `${1.2 + i() * 0.4}s` }} />
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </Stage>
  )
}
