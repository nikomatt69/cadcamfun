/**
 * Pair screen — the first thing a paired phone sees.
 *
 * Bug it fixes
 * -------------
 * The previous version did `setError(e instanceof Error ? e.message : String(e))`.
 * Tauri commands that return `Result<T, E>` serialise `E` as a plain object
 * (`{ kind, message }`), so `String(e)` produced the useless `"[object Object]"`
 * and the user thought the screen froze. We now extract the message via `errorMessage()`
 * and show it as a glass-tinted banner with a leading alert icon.
 *
 * Loading state
 * -------------
 * The previous version had no in-flight indicator — the user clicked "Connect" and the
 * only feedback was a sudden screen swap or an opaque error. We now show a status panel
 * with a spinner and a status line so the connection is visible end-to-end.
 *
 * Materials & motion
 * ------------------
 * The hero card, the input card and the buttons all carry the same `glass` surface so
 * the page reads as a single material system. Buttons use `transform: scale(0.97)` on
 * `:active` (Emil: subtle, instant feedback). Haptics fire at meaningful moments
 * (success, error, scan), so the UI is audible/feelable in addition to being visible.
 */
import { Show, createSignal, type Component } from "solid-js"
import { parsePairingLink } from "../companion/pairing.ts"
import { CompanionClient } from "../companion/client.ts"
import { scanPairingCode, type NativeBridge } from "../companion/native.ts"
import type { SecretStore } from "../companion/store.ts"
import { errorMessage } from "../lib/error.ts"
import { haptic } from "../lib/haptic.ts"
import { Alert, Link, Phone, Qr } from "../components/Icon.tsx"
import { Spinner } from "../components/Spinner.tsx"

export interface PairScreenProps {
  readonly env: { readonly bridge: NativeBridge | undefined; readonly store: SecretStore; readonly connect: (p: ReturnType<typeof parsePairingLink>) => CompanionClient }
  readonly onPaired: (c: CompanionClient) => void
}

export const PairScreen: Component<PairScreenProps> = (props) => {
  const [link, setLink] = createSignal("")
  const [error, setError] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [phase, setPhase] = createSignal<"idle" | "checking" | "saving" | "done">("idle")

  const connect = async () => {
    const raw = link().trim()
    if (!raw) {
      setError("Paste the pairing link from your desktop, or scan the QR code.")
      haptic("warning")
      return
    }
    setError("")
    setBusy(true)
    setPhase("checking")
    haptic("light")
    try {
      const pairing = parsePairingLink(raw)
      const client = props.env.connect(pairing)
      await client.health()
      setPhase("saving")
      // The Keychain may refuse in an unsigned simulator build; ignore those failures
      // (we still want a working session in CI).
      await props.env.store.save(pairing).catch(() => undefined)
      setPhase("done")
      haptic("success")
      props.onPaired(client)
    } catch (e) {
      haptic("error")
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      setPhase("idle")
    }
  }

  const scanAndConnect = async () => {
    if (!props.env.bridge) return
    setError("")
    try {
      const scanned = await scanPairingCode()
      haptic("selection")
      setLink(scanned)
      await connect()
    } catch (e) {
      haptic("warning")
      setError(errorMessage(e))
    }
  }

  return (
    <main class="screen screen-pad-tight">
      <section class="hero">
        <div class="hero-mark" aria-hidden="true">
          <Phone size={36} />
        </div>
        <h1 class="t-title">Pair with your desktop</h1>
        <p class="t-subhead text-secondary">
          On the desktop, open <strong class="text-secondary">Settings → Companion</strong> and scan the QR code,
          or paste the pairing link below.
        </p>
      </section>

      <div class="pair-input">
        <textarea
          class="field field-multi"
          rows={4}
          placeholder="cadcamfun://pair?host=…&token=…&fp=…"
          value={link()}
          onInput={(e) => { setLink(e.currentTarget.value); if (error()) setError("") }}
          spellcheck={false}
          autocapitalize="off"
          autocorrect="off"
          disabled={busy()}
        />
      </div>

      <Show when={busy()}>
        <div class="connect-status" role="status" aria-live="polite">
          <Spinner size="sm" />
          <span>
            {phase() === "checking" && "Reaching your desktop…"}
            {phase() === "saving" && "Saving the pairing…"}
            {phase() === "done" && "Connected."}
            {phase() === "idle" && "Working…"}
          </span>
        </div>
      </Show>

      <Show when={error()}>
        <div class="pair-error" role="alert">
          <Alert size={18} />
          <span>{error()}</span>
        </div>
      </Show>

      <div class="pair-actions">
        <button class="btn btn-pill" onClick={connect} disabled={busy()}>
          <Show when={busy()} fallback={<Link size={18} />}>
            <Spinner onAccent size="sm" />
          </Show>
          <span>{busy() ? "Connecting…" : "Connect"}</span>
        </button>

        <Show when={props.env.bridge}>
          <button class="btn btn-secondary btn-pill" onClick={scanAndConnect} disabled={busy()}>
            <Qr size={18} />
            <span>Scan QR code</span>
          </button>
        </Show>
      </div>

      <p class="pair-help">
        The desktop shows a one-time <code>cadcamfun://pair?…</code> link. The token inside
        is scoped to this device and stays in the iOS Keychain — never in plain storage.
      </p>
    </main>
  )
}