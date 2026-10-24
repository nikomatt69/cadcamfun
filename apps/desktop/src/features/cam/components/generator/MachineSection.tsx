import { For, type JSX } from "solid-js"
import { Settings } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Field, INPUT, Section } from "./ui.tsx"

const MACHINES = [
  { id: "mill", label: "CNC mill", about: "Subtractive: flat faces, contours, pockets, holes and 3D surfaces cut from stock." },
  { id: "lathe", label: "CNC lathe", about: "The part turns: shafts, bores, faces and threads on a revolved profile." },
  { id: "3dprinter", label: "3D printer", about: "Additive: the part is sliced into layers and built up in filament, with walls, skin, infill and supports." }
] as const

/** The machine the program is for: a mill, a lathe or a 3D printer, and what each one does with the part. */
export function MachineSection(): JSX.Element {
  const gen = useGeneratorStore()
  const current = () => MACHINES.find((machine) => machine.id === gen.settings.machineType)
  return (
    <Section id="machine" icon={Settings} title="Machine" summary={current()?.label} testId="machine-section">
      <Field label="Machine type" for="machine-type">
        <select
          id="machine-type" class={INPUT}
          value={gen.settings.machineType}
          onChange={(event) => gen.updateSettings("machineType", event.currentTarget.value as typeof gen.settings.machineType)}
        >
          <For each={MACHINES}>{(machine) => <option value={machine.id}>{machine.label}</option>}</For>
        </select>
      </Field>
    </Section>
  )
}
