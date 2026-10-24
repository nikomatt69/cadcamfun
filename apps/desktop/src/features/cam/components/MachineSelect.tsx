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
import { A } from "@solidjs/router"
import { Check, Cpu, ExternalLink, RefreshCw } from "lucide-solid"
import { cam as coreCam } from "@cadcamfun/core"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useCADStore, type MachineConfig } from "../../cad/store/cadStore.ts"
import { useCamStore } from "../store/camStore.ts"
import { useGeneratorStore } from "../store/generatorStore.ts"
import {
  MACHINES_PATH,
  machineControllerOf,
  machineEnvelopeOf,
  machineFeedOf,
  machineResourceKind,
  machineSpindleOf,
  machineTypeLabel,
  machinesFromResponse,
  kernelMachineConfigOf
} from "../lib/machines.ts"

const ROW = "sidebar-choice"
const ROW_ON = "sidebar-choice--selected"
const ROW_OFF = ""

export default function MachineSelect(): JSX.Element {
  const app = useApp()
  const cad = useCADStore()
  const cam = useCamStore()
  const [machines, setMachines] = createSignal<ReadonlyArray<MachineConfig>>([])
  /** The built-in catalogue of machines: what the kernel plans against when nothing is configured. */
  const [defaults, setDefaults] = createSignal<ReadonlyArray<MachineConfig>>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setMachines(machinesFromResponse(await app.runtime.run(app.client.machineConfigs.list({ query: {} }))))
      setDefaults(machinesFromResponse(await app.runtime.run(app.client.machineConfigs.defaults({}))))
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
    return [...defaults(), ...machines()].find((machine) => machine.id === pick.id) ?? pick
  })

  /**
   * Picking a machine is picking the preview's machine, the CAD workpiece's machine and the kernel's machine at once:
   * a built-in preset names itself, a configuration of the library travels with the request.
   */
  const select = (machine: MachineConfig | undefined): void => {
    cad.setSelectedMachine(machine ?? null)
    cam.setMachineOverride(machine === undefined ? undefined : machineResourceKind(machine))
    if (machine === undefined) return
    const gen = useGeneratorStore.getState()
    const builtin = coreCam.kernel.findMachine(machine.id)
    if (builtin !== undefined) gen.patchKernelSettings({ machine: builtin.id, machineConfig: undefined })
    else {
      const row = kernelMachineConfigOf(machine)
      if (row !== undefined) gen.patchKernelSettings({ machineConfig: row, machine: undefined })
    }
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
    <SidebarSection id="cam-machine" title={t("cam.machine")} icon={Cpu} summary={selected()?.name ?? t("cam.machine.auto")} testId="cam-machine-select">
        <div class="flex items-center justify-end">

          <div class="flex items-center gap-1">
            <button
              type="button"
              class="panel-icon-btn"
              title={t("cam.machine.refresh")}
              aria-label={t("cam.machine.refresh")}
              disabled={loading()}
              onClick={() => void load()}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <A
              href={MACHINES_PATH}
              class="panel-icon-btn"
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
            <div class="sidebar-machine-list" role="listbox" aria-label={t("cam.machine.pick")}>
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

              <Show when={defaults().length > 0}>
                <p class="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{t("cam.machine.builtin")}</p>
                <For each={defaults()}>{(machine) => (
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
                      <span class="sidebar-choice__title">{machine.name}</span>
                      <span class="panel-badge">{machineTypeLabel(machine)}</span>
                      <For each={facts(machine)}>{(line) => <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{line}</span>}</For>
                    </span>
                  </button>
                )}</For>
              </Show>

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
                    <span class="sidebar-choice__title">{machine.name}</span>
                    <span class="panel-badge">{machineTypeLabel(machine)}</span>
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
      </SidebarSection>
  )
}
