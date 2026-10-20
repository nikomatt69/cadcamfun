/**
 * The machines of the Resources library (`/machine`), selectable in the CAM sidebar's "Machine"
 * tab (spec 06-desktop-ui.md §3).
 *
 * Picking one is the user's answer to "which machine runs this job": the CAM store's preview
 * override shows that machine, and the CAD store's `selectedMachine` follows, so the CAD workpiece
 * panel and this list always name the same machine. The list reads the same rows the Resources
 * pages show; nothing here creates or edits a machine.
 */
import { For, Show, createEffect, createMemo, createSignal, onMount, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { A } from "@solidjs/router"
import { Check, Cpu, ExternalLink, RefreshCw } from "lucide-solid"
import { Card } from "../../../shared/ui/card.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useCADStore, type MachineConfig } from "../../cad/store/cadStore.ts"
import { useCamStore } from "../store/camStore.ts"
import {
  MACHINES_PATH,
  machineControllerOf,
  machineEnvelopeOf,
  machineFeedOf,
  machineResourceKind,
  machineSpindleOf,
  machineTypeLabel,
  machinesFromResponse
} from "../lib/machines.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

const ROW = "w-full text-left px-3 py-2 rounded-xl border transition-all duration-200 flex items-start gap-2"
const ROW_ON = "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
const ROW_OFF = "bg-white/60 dark:bg-gray-800/60 border-white/40 dark:border-gray-600/40 hover:bg-white/80 dark:hover:bg-gray-700/80"

export default function MachineSelect(): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const cam = useCamStore()
  const [machines, setMachines] = createSignal<ReadonlyArray<MachineConfig>>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setMachines(machinesFromResponse(await app.runtime.run(app.client.machineConfigs.list({ query: {} }))))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setMachines([])
    } finally {
      setLoading(false)
    }
  }

  onMount(() => { void load() })

  /** The whole row of the current pick, so the panel still shows the envelope when the pick came from CAD. */
  const selected = createMemo(() => {
    const pick = cad.selectedMachine
    if (pick === null) return undefined
    return machines().find((machine) => machine.id === pick.id) ?? pick
  })

  /** Picking a machine is picking the preview's machine and the CAD workpiece's machine at once. */
  const select = (machine: MachineConfig | undefined): void => {
    cad.setSelectedMachine(machine ?? null)
    cam.setMachineOverride(machine === undefined ? undefined : machineResourceKind(machine))
  }

  // The CAD workpiece panel picks from this same list: adopting its machine keeps both panels and
  // the preview on one machine. "Auto" (no machine) leaves the preview's own pick alone.
  createEffect(() => {
    const pick = cad.selectedMachine
    if (pick !== null) cam.setMachineOverride(machineResourceKind(pick))
  })

  const facts = (machine: MachineConfig): ReadonlyArray<string> => {
    const envelope = machineEnvelopeOf(machine)
    const spindle = machineSpindleOf(machine)
    const feed = machineFeedOf(machine)
    const controller = machineControllerOf(machine)
    return [
      envelope !== undefined ? `${t("cam.machine.facts.envelope")} ${envelope.x}×${envelope.y}×${envelope.z} mm` : "",
      spindle !== undefined ? `${t("cam.machine.facts.spindle")} ${spindle} rpm` : "",
      feed !== undefined ? `${t("cam.machine.facts.feed")} ${feed} mm/min` : "",
      controller !== undefined ? `${t("cam.machine.facts.controller")} ${controller}` : ""
    ].filter(line => line !== "")
  }

  return (
    <Motion.div class="w-full" {...rise} transition={{ duration: 0.4 }}>
      <Card variant="default" delay={0.05} class="w-full p-4" data-testid="cam-machine-select">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="flex items-center text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Cpu size={16} class="mr-2 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            {t("cam.machine")}
          </h3>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title={t("cam.machine.refresh")}
              aria-label={t("cam.machine.refresh")}
              disabled={loading()}
              onClick={() => void load()}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <A
              href={MACHINES_PATH}
              class="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title={t("cam.machine.library")}
              aria-label={t("cam.machine.library")}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </A>
          </div>
        </div>

        <Show when={error() === undefined} fallback={
          <div class="space-y-2">
            <p class="text-xs text-red-600 dark:text-red-400" role="alert" title={error()}>{t("cam.machine.error")}</p>
            <button type="button" class="text-xs text-blue-600 dark:text-blue-400" onClick={() => void load()}>{t("cam.machine.retry")}</button>
          </div>
        }>
          <Show when={!loading()} fallback={<p class="text-xs text-gray-500 dark:text-gray-400" role="status">{t("cam.machine.loading")}</p>}>
            <div class="space-y-2" role="listbox" aria-label={t("cam.machine.pick")}>
              <button
                type="button"
                class={`${ROW} ${selected() === undefined ? ROW_ON : ROW_OFF}`}
                role="option"
                aria-selected={selected() === undefined}
                onClick={() => select(undefined)}
              >
                <span class="mt-0.5 h-4 w-4 flex-shrink-0">
                  <Show when={selected() === undefined}><Check size={16} class="text-blue-600 dark:text-blue-400" aria-hidden="true" /></Show>
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-gray-800 dark:text-gray-100">{t("cam.machine.auto")}</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{t("cam.machine.autoHint")}</span>
                </span>
              </button>

              <For each={machines()}>{(machine) => (
                <button
                  type="button"
                  class={`${ROW} ${selected()?.id === machine.id ? ROW_ON : ROW_OFF}`}
                  role="option"
                  aria-selected={selected()?.id === machine.id}
                  data-testid={`cam-machine-option-${machine.id}`}
                  onClick={() => select(selected()?.id === machine.id ? undefined : machine)}
                >
                  <span class="mt-0.5 h-4 w-4 flex-shrink-0">
                    <Show when={selected()?.id === machine.id}><Check size={16} class="text-blue-600 dark:text-blue-400" aria-hidden="true" /></Show>
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{machine.name}</span>
                    <span class="mt-0.5 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">{machineTypeLabel(machine)}</span>
                    <For each={facts(machine)}>{(line) => <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{line}</span>}</For>
                  </span>
                </button>
              )}</For>
            </div>

            <Show when={machines().length === 0}>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {t("cam.machine.empty")}{" "}
                <A href={MACHINES_PATH} class="text-blue-600 hover:underline dark:text-blue-400">{t("cam.machine.createInLibrary")}</A>
              </p>
            </Show>
          </Show>
        </Show>

        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("cam.machine.hint")}</p>
      </Card>
    </Motion.div>
  )
}
