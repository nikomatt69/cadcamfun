import { For, Show, createSignal, type JSX } from "solid-js"
import type { cam } from "@cadcamfun/core"
import type { CadExactAnalysis } from "@cadcamfun/api"
import { useApp } from "../../../../shared/state/context.ts"
import { t } from "../../../../i18n/index.ts"

type Wall = NonNullable<CadExactAnalysis["parts"][number]["swarfWalls"]>[number]
type Operation = cam.kernel.OperationSpec

/**
 * The walls of the selected part a five-axis flank cut can take (spec 51 F4): the exact model lists its cone, cylinder and flat walls
 * with a point on each, and adding one puts a `multiaxis` operation in `swarf` mode in the plan, which the kernel then reads the rulings
 * of, cuts with the side of a flat cutter and verifies like any operation. It needs a five-axis machine and a plan to add to.
 */
export default function KernelSwarf(props: {
  readonly elements: ReadonlyArray<Record<string, unknown>> | undefined
  readonly fiveAxis: boolean
  readonly planned: boolean
  readonly flatCutter: string | undefined
  readonly top: number
  readonly onAdd: (operation: Operation) => void
}): JSX.Element {
  const app = useApp()
  const [walls, setWalls] = createSignal<ReadonlyArray<{ readonly part: string; readonly wall: Wall }>>([])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [asked, setAsked] = createSignal(false)
  let ticket = 0

  const run = async (): Promise<void> => {
    const elements = props.elements
    if (elements === undefined || elements.length === 0) return
    const mine = ++ticket
    setBusy(true); setError(undefined)
    try {
      const report = await app.runtime.run(app.client.cadExact.analyze({ payload: { elements: elements as never } }))
      if (mine !== ticket) return
      setWalls(report.parts.flatMap((part) => (part.swarfWalls ?? []).map((wall) => ({ part: part.name, wall }))))
      setAsked(true)
    } catch (cause) {
      if (mine === ticket) { setWalls([]); setError(cause instanceof Error ? cause.message : String(cause)) }
    } finally {
      if (mine === ticket) setBusy(false)
    }
  }
  const add = (wall: Wall): void => {
    if (props.flatCutter === undefined) return
    const id = `swarf-${wall.kind}-${wall.face}`
    props.onAdd({ id, name: `Swarf ${wall.kind} wall`, strategy: "multiaxis", mode: "swarf", tool: props.flatCutter, top: props.top, stepover: 20, near: [{ x: wall.near.x, y: wall.near.y, z: wall.near.z }] } as Operation)
  }
  const hint = (): string | undefined => !props.fiveAxis ? t("cam.swarf.needFiveAxis") : !props.planned ? t("cam.swarf.needPlan") : props.flatCutter === undefined ? t("cam.swarf.needCutter") : undefined

  return (
    <details class="border-t border-gray-200 dark:border-gray-700 pt-2" data-testid="kernel-swarf">
      <summary class="cursor-pointer text-sm font-medium">{t("cam.swarf.title")}</summary>
      <div class="space-y-2 pt-2">
        <p class="text-xs text-gray-500">{t("cam.swarf.hint")}</p>
        <button type="button" class="ui-btn ui-btn-secondary" disabled={busy() || props.elements === undefined || props.elements.length === 0} onClick={() => void run()} data-testid="kernel-swarf-run">
          {busy() ? t("cam.swarf.running") : t("cam.swarf.run")}
        </button>
        <Show when={error()}>{(message) => <p class="text-xs text-red-700 dark:text-red-300" role="alert" data-testid="kernel-swarf-error">{message()}</p>}</Show>
        <Show when={hint()}>{(text) => <p class="text-xs text-amber-700 dark:text-amber-300" data-testid="kernel-swarf-hint">{text()}</p>}</Show>
        <Show when={asked() && walls().length === 0}><p class="text-xs text-gray-500" data-testid="kernel-swarf-none">{t("cam.swarf.none")}</p></Show>
        <ul class="space-y-1">
          <For each={walls()}>{({ part, wall }) => (
            <li class="flex items-center justify-between gap-2 rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs" data-testid="kernel-swarf-wall" data-kind={wall.kind} data-face={wall.face}>
              <span>{part}: {t(`cam.swarf.kind.${wall.kind}`)}, {wall.height.toFixed(1)} mm, {t("cam.swarf.lean", { degrees: wall.lean.toFixed(1) })}{wall.concaveRadius !== undefined ? ` · ${t("cam.swarf.concave", { radius: wall.concaveRadius.toFixed(1) })}` : ""}</span>
              <button type="button" class="ui-btn ui-btn-secondary" disabled={hint() !== undefined} onClick={() => add(wall)} data-testid="kernel-swarf-add">{t("cam.swarf.add")}</button>
            </li>
          )}</For>
        </ul>
      </div>
    </details>
  )
}
