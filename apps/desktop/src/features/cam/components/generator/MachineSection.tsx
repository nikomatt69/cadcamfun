import { For, Show, type JSX } from "solid-js"
import { Settings } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Field, INPUT, Section } from "./ui.tsx"
import { KernelMachineControls, useKernel } from "./KernelSection.tsx"
import { SetupExamples } from "./SetupExamples.tsx"
import { t, type Key } from "../../../../i18n/index.ts"
import { cam } from "@cadcamfun/core"

const MACHINES: ReadonlyArray<{ readonly id: "mill" | "lathe" | "3dprinter"; readonly label: Key }> = [
  { id: "mill", label: "cam.gen.mach.mill" },
  { id: "lathe", label: "cam.gen.mach.lathe" },
  { id: "3dprinter", label: "cam.gen.mach.printer" }
]

/** The machine the program is for: a mill, a lathe or a 3D printer, and what each one does with the part. */
export function MachineSection(): JSX.Element {
  const gen = useGeneratorStore()
  const kernel = useKernel()
  const current = () => MACHINES.find((machine) => machine.id === gen.settings.machineType)
  return (
    <Section id="machine" icon={Settings} title={t("cam.machine")} summary={current() === undefined ? undefined : t(current()!.label)} testId="machine-section">
      <Field label={t("library.machine.type")} for="machine-type">
        <select
          id="machine-type" class={INPUT}
          value={gen.settings.machineType}
          onChange={(event) => gen.updateSettings("machineType", event.currentTarget.value as typeof gen.settings.machineType)}
        >
          <For each={MACHINES}>{(machine) => <option value={machine.id}>{t(machine.label)}</option>}</For>
        </select>
      </Field>
      <KernelMachineControls />
      <Show when={gen.settings.machineType === "lathe"}>
        <p class="panel-hint">{t("cam.gen.mach.latheIntro")}</p>
        <Field label={t("cam.workholding.turret")} for="machine-lathe-turret">
          <select id="machine-lathe-turret" class={INPUT} value={gen.settings.latheTurret} onChange={(event) => gen.patchSettings({ latheTurret: event.currentTarget.value as "front" | "rear", workholdingConfigured: true })}>
            <option value="rear">{t("cam.workholding.turretRear")}</option><option value="front">{t("cam.workholding.turretFront")}</option>
          </select>
        </Field>
        <Field label={t("cam.gen.lathe.spindleDir")} for="machine-lathe-spindle">
          <select id="machine-lathe-spindle" class={INPUT} value={gen.settings.spindleDirection} onChange={(event) => gen.updateSettings("spindleDirection", event.currentTarget.value as "cw" | "ccw")}>
            <option value="cw">{t("cam.gen.lathe.cw")}</option><option value="ccw">{t("cam.gen.lathe.ccw")}</option>
          </select>
        </Field>
      </Show>
      <Show when={gen.settings.machineType === "3dprinter"}>
        <p class="panel-hint">{t("cam.gen.mach.printerIntro")}</p>
        <Field label={t("cam.gen.kp.printer")} for="machine-printer-preset">
          <select id="machine-printer-preset" data-testid="machine-printer-preset" class={INPUT} value={kernel.printerValue()} onChange={(event) => kernel.selectPrinter(event.currentTarget.value)}>
            <optgroup label={t("cam.gen.kp.builtIn")}><For each={cam.kernel.PRINTERS}>{(item) => <option value={item.id}>{item.name}</option>}</For></optgroup>
            <Show when={kernel.savedPrinters().length > 0}><optgroup label={t("cam.gen.mach.yours")}><For each={kernel.savedPrinters()}>{(item) => <option value={`config:${item.id}`}>{item.name}</option>}</For></optgroup></Show>
          </select>
        </Field>
      </Show>
      <SetupExamples area="machine" after={(example) => { if (example.id === "printer") kernel.selectPrinter("printer-prusa-mk4") }} />
    </Section>
  )
}
