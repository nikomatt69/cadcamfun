/**
 * CAM-side scenes: a verification cut, a cost breakdown and a trend line.
 *
 * Same rules as previews.tsx: one cause and effect per scene, a poster frame that explains itself,
 * a reset beat that closes the loop, real words only on what the story is about. Sample content is
 * illustration, not UI text, so it is marked `// i18n-ok`.
 */
import { For, type JSX } from "solid-js"
import { H, Pointer, Stage, W, type Pose } from "./index.ts"
import { t } from "../../../i18n/index.ts"
import "./scenes-cam.css"

// ── Verify: the tool clears a pass, the result lands inside tolerance ───────
// 0 idle · 1 the cut runs · 2 hold, tolerance chip · 3 reset
const TOLERANCE = "0.01 mm" // i18n-ok

export function VerifyPreview(): JSX.Element {
  return (
    <Stage class="ss-verify" width={W} height={H} steps={[500, 2500, 3000, 500]} poster={2}>
      {(phase) => {
        const cutting = (): boolean => phase() >= 1 && phase() <= 2
        return (
          <div class="ss-scene" data-reset={phase() === 3}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: "0" }}>
              <rect class="cam-stock" x="48" y="24" width="264" height="80" rx="3" />
              <rect class="vf-cut" data-on={cutting()} x="48" y="62" width="264" height="24" />
            </svg>
            <span class="vf-tool" data-on={cutting()} />
            <span class="ss-chip ss-chip--mono" data-show={phase() === 2} style={{ left: "56px", top: "30px" }}>
              <span class="prj-dot" />
              {TOLERANCE}
            </span>
          </div>
        )
      }}
    </Stage>
  )
}

// ── Cost: Calculate, the parts of the price rise, the total lands ───────────
// 0 idle · 1 cursor to the button · 2 click · 3 bars rise · 4 hold with the total · 5 reset
const COST_POSES: ReadonlyArray<Pose> = [
  { x: 300, y: 112, glide: 0 },
  { x: 268, y: 38, glide: 700 },
  { x: 268, y: 38, pressed: true, glide: 150 },
  { x: 318, y: 100, glide: 800 },
  { x: 318, y: 100, glide: 400 }
]
const COST_BARS: ReadonlyArray<{ readonly x: number; readonly h: number; readonly tone: "a" | "b" | "c" }> = [
  { x: 64, h: 52, tone: "a" },
  { x: 112, h: 34, tone: "b" },
  { x: 160, h: 22, tone: "c" }
]
const SAMPLE_TOTAL = "84.20" // i18n-ok

export function CostPreview(): JSX.Element {
  return (
    <Stage class="ss-cost" width={W} height={H} steps={[500, 700, 180, 1400, 3000, 500]} poster={4}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: "0" }}>
            <line x1="48" y1="108" x2="208" y2="108" stroke="var(--ss-line-strong)" stroke-width="1.2" />
            <For each={COST_BARS}>
              {(bar, i) => (
                <rect
                  class="cost-bar"
                  data-tone={bar.tone}
                  data-on={phase() >= 3}
                  style={{ "transition-delay": `${i() * 0.18}s` }}
                  x={bar.x}
                  y={108 - bar.h}
                  width="32"
                  height={bar.h}
                  rx="3"
                />
              )}
            </For>
          </svg>
          <span class="prj-btn cost-btn" data-pressed={phase() === 2} style={{ left: "232px", top: "26px" }}>
            {t("costs.calculate")}
          </span>
          <span class="ss-chip ss-chip--mono" data-show={phase() >= 4} style={{ left: "232px", top: "70px" }}>
            {SAMPLE_TOTAL}
          </span>
          <Pointer phase={phase()} poses={COST_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Trend: the line draws, a hairline and a dot land on a day ───────────────
// 0 idle · 1 the line draws · 2 the pointer rests on a day, its value shows · 3 reset
const TREND_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 114, glide: 0 },
  { x: 200, y: 114, glide: 1500 },
  { x: 256, y: 60, glide: 500 }
]
const TREND_LINE = "36,92 80,84 124,88 168,66 212,72 256,46 300,52 336,32"
const TREND_VALUE = "128" // i18n-ok

export function TrendPreview(): JSX.Element {
  return (
    <Stage class="ss-trend" width={W} height={H} steps={[500, 1700, 3000, 500]} poster={2}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 3}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: "0" }}>
            <For each={[36, 62, 88]}>{(y) => <line x1="24" y1={y} x2="348" y2={y} stroke="var(--ss-line)" stroke-width="1" />}</For>
            <line x1="24" y1="108" x2="348" y2="108" stroke="var(--ss-line-strong)" stroke-width="1.2" />
            <polygon class="trend-area" data-on={phase() >= 1} points={`${TREND_LINE} 336,108 36,108`} />
            <polyline class="trend-line" data-on={phase() >= 1} pathLength="1" points={TREND_LINE} />
            <line class="trend-hair" data-on={phase() >= 2} x1="256" y1="46" x2="256" y2="108" />
            <circle class="trend-dot" data-on={phase() >= 2} cx="256" cy="46" r="4.5" />
          </svg>
          <span class="ss-chip ss-chip--mono" data-show={phase() >= 2} style={{ left: "196px", top: "10px" }}>
            {TREND_VALUE}
          </span>
          <Pointer phase={phase()} poses={TREND_POSES} />
        </div>
      )}
    </Stage>
  )
}
