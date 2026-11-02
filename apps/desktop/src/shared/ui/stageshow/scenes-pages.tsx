/**
 * Page-level scenes for screens that had no illustration: analytics (a chart scrubbed),
 * the activity timeline (a row arrives), project history (a commit lands), legal documents
 * (a document is read), passkeys (a key is added), sessions (a device is signed out)
 * and feature flags (a flag is switched on).
 *
 * Same rules as `previews.tsx`: one cause and one effect per scene, a `poster` phase that
 * reads alone, a final reset beat, decorative (`aria-hidden` on the Stage), and real words
 * only where they carry the story. Illustration strings are marked `// i18n-ok`.
 */
import { For, Show, type JSX } from "solid-js"
import { Fingerprint, Laptop, Scale, ShieldCheck, Smartphone, Trash } from "lucide-solid"
import { H, Pointer, W, type Pose } from "./previews.tsx"
import { Stage } from "./stage.tsx"
import "./scenes-pages.css"

// ── Analytics: the pointer scrubs a day, the headline rolls to it ───────────
// 0 idle · 1 the line draws · 2 the pointer reaches the peak, the value rolls · 3 hold · 4 reset
const CHART_VALUES: ReadonlyArray<number> = [20, 32, 28, 44, 38, 56, 48, 82, 64, 74]
const PEAK_INDEX = 7
const chartX = (index: number): number => 18 + index * 36
const chartY = (value: number): number => 110 - (value / 90) * 54
const chartLine = (): string => CHART_VALUES.map((value, index) => `${chartX(index)},${chartY(value)}`).join(" ")
const chartArea = (): string =>
  `M${chartX(0)} 110 ${CHART_VALUES.map((value, index) => `L${chartX(index)} ${chartY(value)}`).join(" ")} L${chartX(CHART_VALUES.length - 1)} 110 Z`
const PEAK_X = chartX(PEAK_INDEX)
const PEAK_Y = chartY(CHART_VALUES[PEAK_INDEX] ?? 0)

const ANALYTICS_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 116, glide: 0 },
  { x: 188, y: 88, glide: 700 },
  { x: PEAK_X, y: PEAK_Y, glide: 800 },
  { x: 306, y: 108, glide: 700 }
]

export function AnalyticsScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-analytics" width={W} height={H} steps={[500, 900, 900, 3200, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-analytics">
            <div class="pg-head">
              <span class="ss-bar" style={{ width: "52px" }} />
              <span class="pg-chip">30 days</span>
            </div>
            <div class="pg-metric">
              <div class="pg-metric__track" data-next={phase() >= 2}>
                <span>1,284</span>
                <span>1,960</span>
              </div>
              <span class="pg-metric__label">activities</span>
            </div>
            <svg class="pg-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <For each={[56, 74, 92]}>
                {(y) => <line x1="18" y1={y} x2="342" y2={y} class="pg-grid" />}
              </For>
              <path class="pg-area" d={chartArea()} />
              <polyline class="pg-line" data-on={phase() >= 1} pathLength="1" points={chartLine()} />
              <line class="pg-baseline" x1="18" y1="110" x2="342" y2="110" />
              <line class="pg-hair" data-on={phase() >= 2} x1={PEAK_X} y1="56" x2={PEAK_X} y2="110" />
              <circle class="pg-dot" data-on={phase() >= 2} cx={PEAK_X} cy={PEAK_Y} r="3.4" />
            </svg>
            <span class="pg-tip" data-show={phase() >= 2} style={{ left: "214px", top: "42px" }}>Oct 24</span>
          </div>
          <Pointer phase={phase()} poses={ANALYTICS_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Timeline: a new activity lands at the head, the rows below make room ────
// 0 idle · 1 the sync dot beats · 2 the row arrives · 3 hold · 4 reset
const TIMELINE_BARS: ReadonlyArray<readonly [number, number]> = [[92, 30], [74, 34], [104, 28]]

export function TimelineScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-timeline" width={W} height={H} steps={[500, 900, 700, 3200, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-timeline">
            <div class="pg-head">
              <span class="pg-live" data-on={phase() === 1} />
              <span class="ss-bar" style={{ width: "58px" }} />
              <span class="pg-chip">Live</span>
            </div>
            <div class="pg-tl-list">
              <div class="pg-tl-row pg-tl-row--fresh" data-in={phase() >= 2}>
                <span class="pg-tl-node" />
                <span class="pg-tl-chip pg-tl-chip--ok">exported</span>
                <span class="pg-tl-name">Toolpath · fixture plate</span>
                <span class="pg-tl-time">now</span>
              </div>
              <For each={TIMELINE_BARS}>
                {([name, meta], index) => (
                  <div class="pg-tl-row">
                    <span class="pg-tl-node" />
                    <span class="pg-tl-chip">{index() === 0 ? "created" : index() === 1 ? "viewed" : "updated"}</span>
                    <span class="ss-bar" style={{ width: `${name}px` }} />
                    <span class="ss-bar pg-tl-timebar" style={{ width: `${meta}px` }} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Stage>
  )
}

// ── Commit: the message is committed and a node lands on the branch ─────────
// 0 idle · 1 pointer to the button · 2 press · 3 commit row and node appear · 4 hold · 5 reset
const COMMIT_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 116, glide: 0 },
  { x: 326, y: 49, glide: 700 },
  { x: 326, y: 49, pressed: true, glide: 140 },
  { x: 326, y: 112, glide: 700 }
]

/** The sample commit message and hash: illustration content, not UI text. */
const COMMIT_MESSAGE = "Fixture plate, 4 holes" // i18n-ok
const COMMIT_HASH = "a41c9e2" // i18n-ok

export function CommitScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-commit" width={W} height={H} steps={[500, 800, 160, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-commit">
            <div class="pg-head">
              <span class="ss-bar" style={{ width: "48px" }} />
              <span class="pg-chip">main</span>
            </div>
            <div class="pg-commit__body">
              <div class="pg-graph">
                <span class="pg-graph__line" />
                <span class="pg-graph__node pg-graph__node--fresh" data-on={phase() >= 3} />
                <span class="pg-graph__node" style={{ top: "58px" }} />
                <span class="pg-graph__node" style={{ top: "86px" }} />
              </div>
              <div class="pg-commit__main">
                <div class="pg-form" data-done={phase() >= 3}>
                  <span class="pg-form__text">{COMMIT_MESSAGE}</span>
                  <span class="pg-form__btn" data-pressed={phase() === 2}>Commit</span>
                </div>
                <div class="pg-commit__row pg-commit__row--fresh" data-in={phase() >= 3}>
                  <span class="pg-hash">{COMMIT_HASH}</span>
                  <span class="pg-commit__message">{COMMIT_MESSAGE}</span>
                  <span class="pg-diff"><b class="pg-add">+3</b><b class="pg-del">−1</b></span>
                </div>
                <div class="pg-commit__row">
                  <span class="pg-hash">7d02b18</span>
                  <span class="ss-bar" style={{ width: "108px" }} />
                  <span class="pg-diff"><b class="pg-add">+6</b><b class="pg-del">−2</b></span>
                </div>
              </div>
            </div>
          </div>
          <Pointer phase={phase()} poses={COMMIT_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Legal: a reader follows a section of a document ────────────────────────
// The illustration must not imply that the viewer accepted any real document.
const DOC_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 120, glide: 0 },
  { x: 217, y: 107, glide: 750 },
  { x: 217, y: 107, pressed: true, glide: 140 },
  { x: 322, y: 116, glide: 700 }
]

export function DocumentScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-document" width={W} height={H} steps={[500, 800, 160, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-doc">
            <div class="pg-doc__head">
              <span class="pg-doc__mark"><Scale size={12} /></span>
              <span class="pg-doc__title">Document</span>
            </div>
            <For each={[96, 88, 92, 70, 84, 62]}>
              {(width, index) => <span class="ss-bar pg-doc__line" data-reading={index() === 2 && phase() >= 3} style={{ width: `${width}%` }} />}
            </For>
          </div>
          <Pointer phase={phase()} poses={DOC_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Passkeys: the first key is added and the empty slot becomes a row ──────
// 0 idle · 1 pointer to Add passkey · 2 press · 3 the key arrives · 4 hold · 5 reset
const PASSKEY_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 116, glide: 0 },
  { x: 312, y: 14, glide: 750 },
  { x: 312, y: 14, pressed: true, glide: 140 },
  { x: 320, y: 112, glide: 700 }
]

export function PasskeyScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-passkey" width={W} height={H} steps={[500, 800, 160, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-panel">
            <div class="pg-head">
              <span class="pg-panel__title">Passkeys</span>
              <span class="pg-panel__action" data-pressed={phase() === 2} data-done={phase() >= 3}>
                <Show when={phase() < 3} fallback="Added">Add passkey</Show>
              </span>
            </div>
            <div class="pg-passkey__empty" data-gone={phase() >= 3}>
              <span class="pg-passkey__outline"><Fingerprint size={18} /></span>
              <span class="ss-bar" style={{ width: "120px" }} />
            </div>
            <div class="pg-passkey__row" data-in={phase() >= 3}>
              <span class="pg-passkey__icon"><Fingerprint size={15} /></span>
              <div class="pg-passkey__text">
                <span class="pg-passkey__name">This Mac</span>
                <span class="pg-passkey__sub">Touch ID</span>
              </div>
              <span class="pg-passkey__check"><ShieldCheck size={13} /></span>
            </div>
          </div>
          <Pointer phase={phase()} poses={PASSKEY_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Sessions: a device is signed out, the list closes the gap ──────────────
// 0 idle · 1 pointer to the revoke button · 2 press · 3 the row leaves, toast · 4 hold · 5 reset
const SESSION_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 116, glide: 0 },
  { x: 336, y: 88, glide: 750 },
  { x: 336, y: 88, pressed: true, glide: 140 },
  { x: 326, y: 112, glide: 700 }
]

export function SessionsScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-sessions" width={W} height={H} steps={[500, 800, 160, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-panel">
            <div class="pg-head">
              <span class="pg-panel__title">Sessions</span>
              <span class="pg-chip">{phase() >= 3 ? "1 active" : "2 active"}</span>
            </div>
            <div class="pg-device">
              <span class="pg-device__icon"><Laptop size={15} /></span>
              <div class="pg-device__text">
                <span class="pg-device__name">MacBook</span>
                <span class="pg-device__sub">this device</span>
              </div>
              <span class="pg-chip pg-chip--ok">current</span>
            </div>
            <div class="pg-device pg-device--leaving" data-gone={phase() >= 3}>
              <span class="pg-device__icon"><Smartphone size={15} /></span>
              <div class="pg-device__text">
                <span class="pg-device__name">iPhone</span>
                <span class="pg-device__sub">2h ago</span>
              </div>
              <span class="pg-device__trash" data-pressed={phase() === 2}><Trash size={13} /></span>
            </div>
            <span class="pg-toast" data-show={phase() >= 3}><ShieldCheck size={12} /> Signed out</span>
          </div>
          <Pointer phase={phase()} poses={SESSION_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Feature flags: one flag is switched on and its override row opens ───────
// 0 idle · 1 pointer to the switch · 2 press · 3 the flag is on, the reason arrives · 4 hold · 5 reset
const FLAG_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 116, glide: 0 },
  { x: 336, y: 40, glide: 750 },
  { x: 336, y: 40, pressed: true, glide: 140 },
  { x: 326, y: 112, glide: 700 }
]

const FLAGS: ReadonlyArray<readonly [string, string]> = [
  ["ai_assistant", "ai"],
  ["ai_vision", "ai"],
  ["cam_advanced", "cam"]
]

export function FlagsScene(): JSX.Element {
  return (
    <Stage class="ss-pages ss-flags" width={W} height={H} steps={[500, 800, 160, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="pg-panel">
            <div class="pg-head">
              <span class="pg-panel__title">Overrides</span>
              <span class="pg-chip">local</span>
            </div>
            <For each={FLAGS}>
              {([name, group], index) => (
                <div class="pg-flag" data-on={index() === 0 && phase() >= 2}>
                  <span class="pg-flag__name">{name}</span>
                  <span class="pg-flag__group">{group}</span>
                  <span class="pg-switch" data-on={index() === 0 && phase() >= 2} data-pressed={index() === 0 && phase() === 1}>
                    <span />
                  </span>
                </div>
              )}
            </For>
            <div class="pg-flag__detail" data-in={phase() >= 2}>
              <span class="pg-flag__reason">enabled by admin</span>
              <span class="pg-chip pg-chip--ok">on</span>
            </div>
          </div>
          <Pointer phase={phase()} poses={FLAG_POSES} />
        </div>
      )}
    </Stage>
  )
}
