/**
 * Workshop scenes — the CAM bench: the generator running a toolpath, the G-code program being
 * checked, an operation joining the list.
 *
 * Same rules as `previews.tsx` and `scenes-cam.tsx`: one cause and one effect, a poster phase that
 * reads alone, a last phase that is the visible reset beat, real words only where the story is about
 * them, everything else a quiet bar. These scenes are designed as shallow strips (360 × 88) because
 * they sit in a narrow panel, not as a wide card.
 *
 * Decorative: `Stage` renders `aria-hidden`, so the panel around it says what it means.
 */
import { For, type JSX } from "solid-js"
import { Check, CircleDot, Plus, Wrench } from "lucide-solid"
import { H, Pointer, W, type Pose } from "./previews.tsx"
import { Stage } from "./stage.tsx"
import "./scenes-workshop.css"

/** The strip's own height: shallow enough for a panel, deep enough for a drawing. */
export const STRIP_H = 88

// ── Generator: the cut runs over the stock, the program follows it ──────────
// 0 idle · 1 the tool travels, the code arrives line by line · 2 the estimate lands · 3 reset
const CUT_PATH = "M40 26 H196 V62 H40 V34 H182 V54 H54 V44 H168"

/** The lines the program shows while it is being cut: illustration content, not UI text. */
const CUT_CODE: ReadonlyArray<string> = ["G0 Z5", "G1 Z-2 F300", "G1 X196 Y62", "G1 X40 Y62"]

/** The estimate the run leaves behind: illustration content, not UI text. */
const CUT_TIME = "2 min 14 s" // i18n-ok

export function GeneratorScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-generator" width={W} height={STRIP_H} steps={[700, 2600, 2800, 500]} poster={2}>
      {(phase) => {
        const cutting = (): boolean => phase() === 1
        return (
          <div class="ss-scene" data-reset={phase() === 3}>
            <svg class="wk-grid" width={W} height={STRIP_H} viewBox={`0 0 ${W} ${STRIP_H}`}>
              <rect class="wk-stock" x="24" y="16" width="188" height="56" rx="3" />
              <path class="wk-path" data-on={cutting()} pathLength="1" d={CUT_PATH} />
            </svg>
            <span class="wk-tool" data-on={cutting()} />
            <div class="wk-code">
              <For each={CUT_CODE}>
                {(line, index) => (
                  <span
                    class="wk-code__line"
                    data-on={phase() >= 1}
                    data-now={phase() === 2 && index() === CUT_CODE.length - 1}
                    style={{ "transition-delay": cutting() ? `${0.15 + index() * 0.5}s` : "0s" }}
                  >
                    {line}
                  </span>
                )}
              </For>
            </div>
            <span class="ss-chip ss-chip--mono wk-estimate" data-show={phase() >= 2}>
              <span class="prj-dot" />
              {CUT_TIME}
            </span>
          </div>
        )
      }}
    </Stage>
  )
}

// ── G-code: the program is checked, line by line, and it passes ────────────
// 0 idle · 1 the check sweeps the program · 2 the result lands · 3 reset
const PROGRAM: ReadonlyArray<string> = [
  "G21 G90 G40",
  "G0 Z10",
  "G1 Z-2 F300",
  "G1 X120 Y40",
  "M30"
]

/** The result the check leaves: illustration content, not UI text. */
const CHECK_RESULT = "no errors" // i18n-ok

export function GCodeScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-gcode" width={W} height={STRIP_H} steps={[700, 1300, 2600, 500]} poster={2}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 3}>
          <div class="wk-program">
            <span class="wk-program__head">
              <CircleDot size={10} />
              <span class="wk-program__name">program.nc</span>
            </span>
            <For each={PROGRAM}>
              {(line, index) => (
                <span class="wk-program__line" data-checked={phase() >= 2 && index() < PROGRAM.length - 1}>
                  {line}
                </span>
              )}
            </For>
          </div>
          <span class="wk-check" data-on={phase() >= 2}>
            <Check size={13} stroke-width={3} />
          </span>
          <span class="ss-chip wk-result" data-show={phase() >= 2}>{CHECK_RESULT}</span>
        </div>
      )}
    </Stage>
  )
}

// ── Operations: a new operation joins the head and carries the list down ───
// 0 idle · 1 the pointer reaches the add button · 2 the row arrives · 3 it settles · 4 reset
const OPERATIONS: ReadonlyArray<readonly [string, string]> = [
  ["Ø 10 mm", "4 min"],
  ["Ø 6 mm", "2 min"],
  ["Ø 3 mm", "1 min"]
]

/** The operation the list gains: illustration content, not UI text. */
const NEW_OPERATION = "Contour · top face" // i18n-ok

const OPERATION_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 80, glide: 0 },
  { x: 322, y: 16, glide: 700 },
  { x: 322, y: 16, pressed: true, glide: 140 },
  { x: 300, y: 70, glide: 800 },
  { x: 300, y: 70, glide: 400 }
]

export function OperationScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-operations" width={W} height={STRIP_H} steps={[600, 700, 160, 2800, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="wk-ops">
            <div class="wk-ops__head">
              <span class="ss-bar" style={{ width: "58px" }} />
              <span class="wk-ops__add" data-pressed={phase() === 2}>
                <Plus size={11} stroke-width={2.5} />
              </span>
            </div>
            <div class="wk-ops__rows" data-carry={phase() >= 2}>
              <div class="wk-op wk-op--fresh" data-in={phase() >= 2}>
                <span class="wk-op__tool"><Wrench size={12} /></span>
                <span class="wk-op__name">{NEW_OPERATION}</span>
                <span class="ss-bar" style={{ width: "34px", "margin-left": "auto" }} />
              </div>
              <For each={OPERATIONS}>
                {() => (
                  <div class="wk-op">
                    <span class="wk-op__tool"><Wrench size={12} /></span>
                    <span class="ss-bar" style={{ width: "64px" }} />
                    <span class="ss-bar wk-op__time" style={{ width: "30px" }} />
                  </div>
                )}
              </For>
            </div>
          </div>
          <Pointer phase={phase()} poses={OPERATION_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Machine: a machine is picked and its card comes alive ───────────────────
// 0 idle · 1 the pointer reaches the machine row · 2 press · 3 the row is picked, the
// spec card arrives · 4 hold · 5 reset
const MACHINE_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 80, glide: 0 },
  { x: 84, y: 52, glide: 750 },
  { x: 84, y: 52, pressed: true, glide: 140 },
  { x: 268, y: 44, glide: 800 },
  { x: 268, y: 44, glide: 400 }
]

/** The machine the list picks: illustration content, not UI text. */
const MACHINE_NAME = "VMC 850" // i18n-ok

export function MachineScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-machine" width={W} height={STRIP_H} steps={[600, 750, 160, 2800, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <div class="wk-machines">
            <div class="wk-machine" data-on={phase() >= 2}>
              <span class="wk-machine__mark" />
              <span class="wk-machine__name">{MACHINE_NAME}</span>
            </div>
            <div class="wk-machine wk-machine--quiet"><span class="ss-bar" style={{ width: "46px" }} /></div>
            <div class="wk-machine wk-machine--quiet"><span class="ss-bar" style={{ width: "38px" }} /></div>
          </div>
          <div class="wk-spec" data-in={phase() >= 3}>
            <span class="wk-spec__title">3-axis</span>
            <span class="ss-bar" style={{ width: "92px" }} />
            <span class="ss-bar" style={{ width: "64px" }} />
            <span class="wk-spec__chip">Table 800 × 500</span>
          </div>
          <Pointer phase={phase()} poses={MACHINE_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Tool: a cutter is assigned to the operation it cuts with ───────────────
// 0 idle · 1 the cutter travels to the operation · 2 it seats, the row names it · 3 hold · 4 reset
const TOOL_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 80, glide: 0 },
  { x: 214, y: 26, glide: 800 },
  { x: 96, y: 54, glide: 700 },
  { x: 96, y: 54, glide: 400 }
]

/** The cutter the scene assigns: illustration content, not UI text. */
const TOOL_NAME = "Ø 10 mm" // i18n-ok

export function ToolScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-tool" width={W} height={STRIP_H} steps={[600, 900, 700, 2800, 500]} poster={3}>
      {(phase) => {
        const seated = (): boolean => phase() >= 2
        return (
          <div class="ss-scene" data-reset={phase() === 4}>
            <svg class="wk-grid" width={W} height={STRIP_H} viewBox={`0 0 ${W} ${STRIP_H}`}>
              <rect class="wk-stock" x="196" y="14" width="140" height="60" rx="3" />
              <path class="wk-path" data-on={seated()} pathLength="1" d="M212 28 H320 V60 H212 V36 H308 V52 H224" />
            </svg>
            <span class="wk-cutter" data-seated={seated()}>
              <span class="wk-cutter__shank" />
              <span class="wk-cutter__flute" />
            </span>
            <div class="wk-op wk-op--seat" data-in={seated()}>
              <span class="wk-op__tool"><Wrench size={12} /></span>
              <span class="wk-op__name">{TOOL_NAME}</span>
            </div>
            <Pointer phase={phase()} poses={TOOL_POSES} />
          </div>
        )
      }}
    </Stage>
  )
}

// ── Simulation: the cut runs and the stock goes with it ────────────────────
// 0 idle · 1 the head travels, the cut grows · 2 the pass is done · 3 hold · 4 reset
const SIM_POSES: ReadonlyArray<Pose> = [
  { x: 330, y: 80, glide: 0 },
  { x: 76, y: 30, glide: 800 },
  { x: 210, y: 30, glide: 1400 },
  { x: 286, y: 30, glide: 900 }
]

/** What the pass leaves behind: illustration content, not UI text. */
const PASS_DONE = "pass complete" // i18n-ok

export function SimulationScene(): JSX.Element {
  return (
    <Stage class="ss-workshop ss-simulation ss-stage--dark" width={W} height={STRIP_H} steps={[600, 2600, 500, 2600, 500]} poster={3}>
      {(phase) => {
        const cutting = (): boolean => phase() === 1
        return (
          <div class="ss-scene" data-reset={phase() === 4}>
            <svg class="wk-grid" width={W} height={STRIP_H} viewBox={`0 0 ${W} ${STRIP_H}`}>
              <rect class="wk-stock" x="28" y="18" width="304" height="52" rx="3" />
              <rect class="wk-removal" data-on={cutting()} x="28" y="44" width="304" height="26" rx="2" />
            </svg>
            <span class="wk-head" data-on={cutting()} />
            <div class="wk-progress"><span class="wk-progress__fill" data-on={cutting()} /></div>
            <span class="ss-chip wk-done" data-show={phase() >= 2}>
              <Check size={12} stroke-width={3} />
              {PASS_DONE}
            </span>
            <Pointer phase={phase()} poses={SIM_POSES} />
          </div>
        )
      }}
    </Stage>
  )
}

