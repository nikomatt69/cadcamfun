import { For, type JSX } from "solid-js"
import { Settings } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Field, INPUT, Section } from "./ui.tsx"
import { KernelMachineControls } from "./KernelSection.tsx"
import { t, type Key } from "../../../../i18n/index.ts"

const MACHINES: ReadonlyArray<{ readonly id: "mill" | "lathe" | "3dprinter"; readonly label: Key }> = [
  { id: "mill", label: "cam.gen.mach.mill" },
  { id: "lathe", label: "cam.gen.mach.lathe" },
  { id: "3dprinter", label: "cam.gen.mach.printer" }
]

/** The machine the program is for: a mill, a lathe or a 3D printer, and what each one does with the part. */
export function MachineSection(): JSX.Element {
  const gen = useGeneratorStore()
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
    </Section>
  )
}
