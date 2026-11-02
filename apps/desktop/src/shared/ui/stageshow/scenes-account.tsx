/**
 * Account and marketing scenes: sign-in/sign-up, the one-time code, the waitlist and the plan picker.
 *
 * Same rules as `previews.tsx`: one cause-and-effect story per scene, a `poster` phase that works alone,
 * a final reset beat, decorative (`aria-hidden`), sample content marked `// i18n-ok`, and the only real
 * UI words are the labels the screen already shows (passed in by the screen, already translated).
 */
import { For, Show, type JSX } from "solid-js"
import { Check, ShieldCheck } from "lucide-solid"
import { H, Pointer, Stage, W, type Pose } from "./index.ts"
import { PLAN_FEATURES, PLAN_ORDER } from "../../../features/billing/lib/plans.ts"
import "./scenes-account.css"

// ── Sign in / sign up: the form is filled, the workspace opens ──────────────
// 0 idle · 1 email typed · 2 password typed · 3 click · 4 the part appears, hold · 5 reset
const SIGNIN_POSES: ReadonlyArray<Pose> = [
  { x: 270, y: 112, glide: 0 },
  { x: 120, y: 38, glide: 750 },
  { x: 120, y: 70, glide: 450 },
  { x: 94, y: 104, pressed: true, glide: 450 },
  { x: 200, y: 104, glide: 700 }
]

/** The sample address typed into the field: illustration content, not UI text. */
const SAMPLE_EMAIL = "you@shop.com" // i18n-ok

export function SignInPreview(props: { readonly label: string }): JSX.Element {
  return (
    <Stage class="ss-acc" width={W} height={H} steps={[500, 1200, 900, 350, 3200, 500]} poster={4}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <div class="acc-form">
            <div class="acc-field">
              <span class="acc-type" data-on={phase() >= 1} style={{ "--ss-steps": "12" }}>{SAMPLE_EMAIL}</span>
            </div>
            <div class="acc-field">
              <span class="acc-type acc-dots" data-on={phase() >= 2} style={{ "--ss-steps": "8" }}>••••••••</span>
            </div>
            <div class="acc-btn" data-done={phase() >= 4} data-pressed={phase() === 3}>
              <span class="acc-btn__label">{props.label}</span>
              <span class="acc-btn__check"><Check size={13} stroke-width={3} /></span>
            </div>
          </div>
          <svg class="acc-view" width="170" height={H} viewBox={`0 0 170 ${H}`}>
            <defs>
              <pattern id="ss-acc-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M16 0H0V16" fill="none" stroke="var(--ss-line)" stroke-width="1" opacity="0.7" />
              </pattern>
            </defs>
            <rect width="170" height={H} fill="url(#ss-acc-grid)" />
            <g class="acc-part" data-on={phase() >= 4}>
              <polygon class="cad-top" points="40,52 58,38 128,38 110,52" />
              <polygon class="cad-side" points="110,52 128,38 128,86 110,100" />
              <rect class="cad-front" data-on="true" x="40" y="52" width="70" height="48" />
              <circle class="cad-hole" data-on="true" cx="75" cy="76" r="8" />
            </g>
          </svg>
          <Pointer phase={phase()} poses={SIGNIN_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── One-time code: six digits arrive, the code is accepted ──────────────────
// 0 idle · 1 digits arrive one by one · 2 accepted, hold · 3 reset   (no cursor: the code is typed)
/** The sample code: illustration content, not UI text. */
const SAMPLE_CODE: ReadonlyArray<string> = ["4", "8", "2", "0", "9", "1"] // i18n-ok

export function CodePreview(): JSX.Element {
  return (
    <Stage class="ss-acc-code" width={W} height={H} steps={[500, 1700, 3000, 500]} poster={2}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 3}>
          <div class="acc-code" data-ok={phase() === 2}>
            <For each={SAMPLE_CODE}>
              {(digit, i) => (
                <span class="acc-code__box" data-on={phase() >= 1} style={{ "transition-delay": phase() >= 1 ? `${i() * 0.25}s` : "0s" }}>
                  <span class="acc-code__digit">{digit}</span>
                </span>
              )}
            </For>
          </div>
          <span class="ss-chip acc-chip--ok" data-show={phase() === 2} style={{ left: "165px", top: "92px" }}>
            <ShieldCheck size={14} />
          </span>
        </div>
      )}
    </Stage>
  )
}

// ── Waitlist: an address goes in, the request is confirmed ─────────────────
// 0 idle · 1 cursor to the field, address typed · 2 cursor to the button · 3 click · 4 confirmed, hold · 5 reset
const WAIT_POSES: ReadonlyArray<Pose> = [
  { x: 300, y: 112, glide: 0 },
  { x: 130, y: 44, glide: 700 },
  { x: 180, y: 90, glide: 500 },
  { x: 180, y: 90, pressed: true, glide: 120 },
  { x: 250, y: 100, glide: 700 }
]

export function WaitlistPreview(props: { readonly label: string }): JSX.Element {
  return (
    <Stage class="ss-acc-wait" width={W} height={H} steps={[500, 1300, 500, 220, 3200, 500]} poster={4}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 5}>
          <div class="acc-wait">
            <div class="acc-field acc-field--wide">
              <span class="acc-type" data-on={phase() >= 1} style={{ "--ss-steps": "12" }}>{SAMPLE_EMAIL}</span>
            </div>
            <div class="acc-btn acc-btn--wide" data-done={phase() >= 4} data-pressed={phase() === 3}>
              <span class="acc-btn__label">{props.label}</span>
              <span class="acc-btn__check"><Check size={14} stroke-width={3} /></span>
            </div>
          </div>
          <Pointer phase={phase()} poses={WAIT_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Pricing: the plan is chosen, the trial starts ──────────────────────────
// 0 idle · 1 cursor to the Pro card · 2 click · 3 the card lifts and the trial chip appears, hold · 4 reset
const PRICE_POSES: ReadonlyArray<Pose> = [
  { x: 60, y: 112, glide: 0 },
  { x: 214, y: 54, glide: 800 },
  { x: 214, y: 54, pressed: true, glide: 150 },
  { x: 300, y: 102, glide: 800 }
]

export function PricingPreview(props: { readonly trialLabel: string }): JSX.Element {
  return (
    <Stage class="ss-acc-price" width={W} height={H} steps={[500, 900, 180, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="acc-plans">
            <For each={PLAN_ORDER}>
              {(id) => {
                const plan = PLAN_FEATURES[id]!
                return (
                  <div class="acc-plan" data-pick={id === "PRO" && phase() >= 2}>
                    <span class="acc-plan__name">{plan.name}</span>
                    <span class="acc-plan__price">{plan.price}</span>
                    <span class="ss-bar" style={{ width: id === "FREE" ? "28px" : "44px" }} />
                    <span class="ss-bar" style={{ width: id === "PRO" ? "50px" : "36px" }} />
                  </div>
                )
              }}
            </For>
          </div>
          <Show when={props.trialLabel !== ""}>
            <span class="ss-chip" data-show={phase() === 3} style={{ left: "118px", top: "98px" }}>{props.trialLabel}</span>
          </Show>
          <Pointer phase={phase()} poses={PRICE_POSES} />
        </div>
      )}
    </Stage>
  )
}

// ── Chat: a message arrives, a reply is typed and sent ─────────────────────
// 0 idle · 1 the incoming message arrives · 2 the reply is typed (dots) · 3 the reply lands, hold · 4 reset   (no cursor)
export function ChatPreview(): JSX.Element {
  return (
    <Stage class="ss-acc-chat" width={W} height={H} steps={[500, 900, 1100, 3400, 500]} poster={3}>
      {(phase) => (
        <div class="ss-scene" data-reset={phase() === 4}>
          <div class="chat-row" data-on={phase() >= 1}>
            <span class="chat-avatar" />
            <div class="chat-bubble">
              <span class="ss-bar" style={{ width: "132px" }} />
              <span class="ss-bar" style={{ width: "84px" }} />
            </div>
          </div>
          <div class="chat-row chat-row--me" data-on={phase() >= 2}>
            <div class="chat-bubble chat-bubble--me">
              <span class="chat-typing" data-on={phase() === 2}><i /><i /><i /></span>
              <span class="chat-text" data-on={phase() >= 3}>
                <span class="chat-line" style={{ width: "96px" }} />
                <span class="chat-line" style={{ width: "58px" }} />
              </span>
            </div>
          </div>
        </div>
      )}
    </Stage>
  )
}
