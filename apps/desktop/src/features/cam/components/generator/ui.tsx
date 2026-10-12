/**
 * Building blocks shared by the generator sections: the collapsible card shell and the validated numeric field.
 * Class names are the legacy ones, so the panel renders like the original side by side.
 */
import { Show, type Component, type JSX } from "solid-js"
import { ChevronDown } from "lucide-solid"
import { Motion, Presence } from "solid-motionone"
import { useGeneratorStore } from "../../store/generatorStore.ts"

export const INPUT = "w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
export const LABEL = "block text-sm font-medium text-gray-700 mb-1"
export const CHECKBOX = "h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"

/** Tailwind needs whole class names in the source, so each tone lists its classes literally. */
const TONES = {
  blue: { box: "bg-blue-100 dark:bg-blue-900", icon: "text-blue-600 dark:text-blue-400" },
  orange: { box: "bg-orange-100 dark:bg-orange-900", icon: "text-orange-600 dark:text-orange-400" },
  purple: { box: "bg-purple-100 dark:bg-purple-900", icon: "text-purple-600 dark:text-purple-400" },
  green: { box: "bg-green-100 dark:bg-green-900", icon: "text-green-600 dark:text-green-400" },
  indigo: { box: "bg-indigo-100 dark:bg-indigo-900", icon: "text-indigo-600 dark:text-indigo-400" },
  cyan: { box: "bg-cyan-100 dark:bg-cyan-900", icon: "text-cyan-600 dark:text-cyan-400" },
  red: { box: "bg-red-100 dark:bg-red-900", icon: "text-red-600 dark:text-red-400" }
} as const
export type Tone = keyof typeof TONES

interface SectionProps {
  readonly id: string
  readonly delay: number
  readonly tone: Tone
  readonly icon: Component<{ size?: number; class?: string }>
  readonly title: string
  readonly testId?: string
  readonly children: JSX.Element
}

/** One collapsible card of the panel (legacy `renderXSection` wrapper). */
export function Section(props: SectionProps): JSX.Element {
  const gen = useGeneratorStore()
  const open = (): boolean => gen.expanded[props.id] === true
  return (
    <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: props.delay }} class="workstation-section" data-testid={props.testId}>
      <Motion.div
        class="workstation-section__header flex items-center justify-between cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        role="button"
        tabindex="0"
        aria-expanded={open()}
        onClick={() => gen.toggleSection(props.id)}
        onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); gen.toggleSection(props.id) } }}
        hover={{ scale: 1.01 }}
        press={{ scale: 0.99 }}
      >
        <div class="flex items-center space-x-3">
          <div class={`p-2 rounded-lg ${TONES[props.tone].box}`}>
            <props.icon size={20} class={TONES[props.tone].icon} />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{props.title}</h3>
        </div>
        <Motion.div animate={{ rotate: open() ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={20} class="text-gray-500" />
        </Motion.div>
      </Motion.div>
      <Presence>
        <Show when={open()}>
          <Motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            class="workstation-section__body bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            {props.children}
          </Motion.div>
        </Show>
      </Presence>
    </Motion.div>
  )
}

interface NumberFieldProps {
  readonly value: number
  readonly onValue: (value: number) => void
  readonly min?: string
  readonly max?: string
  readonly step?: string
  /** `parseInt` instead of `parseFloat`. */
  readonly int?: boolean
  /** Accept predicate; legacy handlers dropped NaN and, for most fields, anything not above zero. */
  readonly accept?: (value: number) => boolean
  readonly class?: string
  readonly id?: string
}

/** `<input type=number>` with the legacy rule: ignore NaN and values the field does not accept. */
export function NumberField(props: NumberFieldProps): JSX.Element {
  return (
    <input
      id={props.id}
      type="number"
      min={props.min}
      max={props.max}
      step={props.step}
      class={props.class ?? INPUT}
      value={props.value}
      onChange={(event) => {
        const value = props.int ? parseInt(event.currentTarget.value) : parseFloat(event.currentTarget.value)
        if (!Number.isNaN(value) && (props.accept ? props.accept(value) : value > 0)) props.onValue(value)
      }}
    />
  )
}

/** Checkbox + label row of the advanced sections. */
export function CheckRow(props: { readonly id: string; readonly checked: boolean; readonly onChange: (checked: boolean) => void; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="flex items-center">
      <input type="checkbox" id={props.id} class={CHECKBOX} checked={props.checked} onChange={(event) => props.onChange(event.currentTarget.checked)} />
      <label for={props.id} class="ml-2 block text-sm text-gray-700">{props.children}</label>
    </div>
  )
}
