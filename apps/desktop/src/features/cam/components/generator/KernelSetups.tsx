import { For, Show, createSignal, type JSX } from "solid-js"
import type { cam } from "@cadcamfun/core"
import type { CadSetupsReport } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"

type Plan = CadSetupsReport["parts"][number]["plan"]

/**
 * The setups the selected part needs (spec 54 R4): which sides face the spindle, what each reaches, the holes it drills, and what
 * no three-axis setup reaches. It reads the exact model through the sidecar (`cadExact.setups`); choosing a setup only sets the
 * kernel's `setupOrientation`, the program is still planned and verified by the kernel.
 */
export default function KernelSetups(props: {
  readonly elements: ReadonlyArray<Record<string, unknown>> | undefined
  readonly current: cam.kernel.SetupOrientation | undefined
  readonly onUse: (orientation: cam.kernel.SetupOrientation) => void
}): JSX.Element {
  const app = useApp()
  const [parts, setParts] = createSignal<CadSetupsReport["parts"]>([])
  const [skipped, setSkipped] = createSignal<CadSetupsReport["skipped"]>([])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [fixture, setFixture] = createSignal<"bottom" | "none">("bottom")
  let ticket = 0

  const run = async (): Promise<void> => {
    const elements = props.elements
    if (elements === undefined || elements.length === 0) return
    const mine = ++ticket
    setBusy(true); setError(undefined)
    try {
      const report = await app.runtime.run(app.client.cadExact.setups({ payload: { elements: elements as never, fixture: fixture() } }))
      if (mine !== ticket) return
      setParts(report.parts); setSkipped(report.skipped)
    } catch (cause) {
      if (mine === ticket) { setParts([]); setError(cause instanceof Error ? cause.message : String(cause)) }
    } finally {
      if (mine === ticket) setBusy(false)
    }
  }

  const percent = (share: number): string => `${Math.round(share * 100)}`

  return (
    <details class="border-t border-[color:var(--panel-border)] pt-2" data-testid="kernel-setups">
      <summary class="cursor-pointer text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.setups.title")}</summary>
      <div class="space-y-2 pt-2">
        <label class="panel-check">
          <input type="checkbox" checked={fixture() === "bottom"} onChange={(event) => setFixture(event.currentTarget.checked ? "bottom" : "none")} data-testid="kernel-setups-fixture" />
          {t("cam.setups.heldBottom")}
        </label>
        <button type="button" class="panel-btn" disabled={busy() || props.elements === undefined || props.elements.length === 0} onClick={() => void run()} data-testid="kernel-setups-run">
          {busy() ? t("cam.setups.running") : t("cam.setups.run")}
        </button>
        <Show when={error()}>{(message) => <p class="text-xs text-[color:var(--panel-bad)]" role="alert" data-testid="kernel-setups-error">{message()}</p>}</Show>
        <For each={parts()}>{(part) => {
          const plan = (): Plan => part.plan
          return (
            <div class="space-y-1 text-xs" data-testid="kernel-setups-part" data-part={part.id}>
              <p class="font-medium">{part.name}</p>
              <ol class="space-y-1">
                <For each={plan().setups}>{(setup, index) => (
                  <li class="flex items-start justify-between gap-2 rounded-[4px] border border-[color:var(--panel-border)] px-2 py-2" data-testid="kernel-setups-item" data-orientation={setup.orientation}>
                    <span>
                      <strong>{index() + 1}. {setup.orientation}</strong>{" "}
                      {t("cam.setups.share", { percent: percent(setup.share) })}
                      <Show when={setup.holes.length > 0}> · {t("cam.setups.holes", { count: setup.holes.length })}</Show>
                      <br />
                      <span class="text-[color:var(--panel-text-muted)]">
                        {setup.prismatic.ok ? t("cam.setups.prismatic") : t("cam.setups.notPrismatic", { reason: setup.prismatic.reason })}
                      </span>
                    </span>
                    <button type="button" class="panel-btn" disabled={props.current === setup.orientation || (props.current === undefined && setup.orientation === "+Z")} onClick={() => props.onUse(setup.orientation)} data-testid="kernel-setups-use">
                      {t("cam.setups.use")}
                    </button>
                  </li>
                )}</For>
              </ol>
              <Show when={plan().held.length > 0}><p class="text-[color:var(--panel-text-muted)]">{t("cam.setups.held")}</p></Show>
              <Show when={plan().uncovered.length > 0}>
                <p class="text-[color:var(--panel-warn)]" data-testid="kernel-setups-uncovered">{t("cam.setups.uncovered", { count: plan().uncovered.length })}</p>
              </Show>
              <Show when={plan().indexed.length > 0}>
                <p class="text-[color:var(--panel-warn)]" data-testid="kernel-setups-indexed">{t("cam.setups.indexed", { count: plan().indexed.length })}</p>
              </Show>
            </div>
          )
        }}</For>
        <For each={skipped()}>{(item) => <p class="panel-hint">{item.name}: {item.reason}</p>}</For>
      </div>
    </details>
  )
}
