/**
 * The building blocks of a workstation panel: the collapsible section, the labelled field, the validated number field,
 * the segmented control, the notice and the badges. Styled by `styles/panel.css`; every panel of the app (the CAM
 * generator inspector, the cycles panel, the CAD and CAM sidebars) is made of these, so they all read as one instrument
 * instead of a stack of different cards.
 */
import { For, Show, type Component, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { AlertTriangle, Check, ChevronDown, CircleAlert, Info } from "lucide-solid"
import { NumberField as DimensionField } from "../../../features/cad/components/property-inputs/NumberField.tsx"
import "../../../styles/panel.css"

export const INPUT = "panel-input"
export const LABEL = "panel-label"
export const CHECKBOX = ""

export interface PanelSectionProps {
  readonly class?: string
  readonly id: string
  readonly icon: Component<{ size?: number; class?: string }>
  readonly title: string
  readonly open: boolean
  readonly onToggle: () => void
  /** A short state line shown on the header while the section is closed (the machine, the operation, the material). */
  readonly summary?: string | undefined
  readonly testId?: string
  readonly children: JSX.Element
}

/** One collapsible block of a panel. The owner of the panel decides when it is open. */
export function PanelSection(props: PanelSectionProps): JSX.Element {
  return (
    <section class={`panel-section${props.class ? ` ${props.class}` : ""}`} id={props.id} data-open={props.open} data-testid={props.testId}>
      <div
        class="panel-section__head"
        role="button"
        tabindex="0"
        aria-expanded={props.open}
        onClick={() => props.onToggle()}
        onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onToggle() } }}
      >
        <props.icon size={14} class="panel-section__icon" />
        <h3 class="panel-section__title">{props.title}</h3>
        <Show when={!props.open && props.summary}><span class="panel-section__summary">{props.summary}</span></Show>
        <ChevronDown size={14} class="panel-section__chevron" />
      </div>
      <Show when={props.open}>
        <div class="panel-section__body">{props.children}</div>
      </Show>
    </section>
  )
}

/** A labelled field: the label above, the unit on its right, an optional hint below. */
export function Field(props: { readonly label: string; readonly unit?: string; readonly hint?: string; readonly for?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="panel-field">
      <label class="panel-label" for={props.for}>
        <span>{props.label}</span>
        <Show when={props.unit}><span class="panel-label__unit">{props.unit}</span></Show>
      </label>
      {props.children}
      <Show when={props.hint}><p class="panel-hint">{props.hint}</p></Show>
    </div>
  )
}

/** Fields side by side. */
export function Grid(props: { readonly cols?: 2 | 3 | 4; readonly children: JSX.Element }): JSX.Element {
  return <div class={`panel-grid panel-grid--${props.cols ?? 2}`}>{props.children}</div>;
}

/** A titled run of fields inside a section. */
export function Group(props: { readonly title?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="panel-group">
      <Show when={props.title}><h4 class="panel-group__title">{props.title}</h4></Show>
      {props.children}
    </div>
  );
}

interface NumberFieldProps {
  readonly value: number
  readonly onValue: (value: number) => void
  readonly min?: string
  readonly max?: string
  readonly step?: string
  /** Whole numbers only. */
  readonly int?: boolean
  /** Accept predicate; the legacy handlers dropped anything that was not above zero. */
  readonly accept?: (value: number) => boolean
  readonly class?: string
  readonly id?: string
  readonly label?: string
}

/**
 * A number field that takes what people type: `0,2` and `0.2`, and expressions such as `40/2+3`. An entry that is not a number
 * (or that the field does not accept) keeps the last valid value; nothing is written until the text is a valid number.
 */
export function NumberField(props: NumberFieldProps): JSX.Element {
  return (
    <DimensionField
      id={props.id}
      label={props.label}
      value={props.value}
      integer={props.int}
      step={props.step === undefined ? undefined : Number(props.step)}
      class={props.class ?? INPUT}
      onChange={(value) => { if (props.accept ? props.accept(value) : value > 0) props.onValue(value) }}
    />
  );
}

/** Checkbox + label row. */
export function CheckRow(props: { readonly id: string; readonly checked: boolean; readonly onChange: (checked: boolean) => void; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="panel-check">
      <input type="checkbox" id={props.id} checked={props.checked} onChange={(event) => props.onChange(event.currentTarget.checked)} />
      <label for={props.id}>{props.children}</label>
    </div>
  );
}

/** Two to five exclusive choices on one line. */
export function Segmented<T extends string>(props: { readonly value: T; readonly options: ReadonlyArray<readonly [T, string]>; readonly onChange: (value: T) => void; readonly label: string; readonly testId?: string }): JSX.Element {
  return (
    <div class={`panel-seg${props.options.length > 4 ? " panel-seg--wrap" : ""}`} role="group" aria-label={props.label} data-testid={props.testId}>
      <For each={props.options}>
        {([value, text]) => (
          <button type="button" class="panel-seg__item" aria-pressed={props.value === value} onClick={() => props.onChange(value)}>{text}</button>
        )}
      </For>
    </div>
  );
}

const NOTE_ICON = { info: Info, ok: Check, warn: AlertTriangle, bad: CircleAlert } as const

/** A plain notice: information, a confirmation, a caution or an error. */
export function Note(props: { readonly kind?: keyof typeof NOTE_ICON; readonly testId?: string; readonly role?: "alert" | "status"; readonly children: JSX.Element }): JSX.Element {
  const kind = (): keyof typeof NOTE_ICON => props.kind ?? "info"
  return (
    <div class={`panel-note panel-note--${kind()}`} data-testid={props.testId} role={props.role}>
      <Dynamic component={NOTE_ICON[kind()]} size={14} />
      <div>{props.children}</div>
    </div>
  );
}

export function Badge(props: { readonly tone?: "ok" | "warn" | "bad"; readonly testId?: string; readonly children: JSX.Element }): JSX.Element {
  return <span class={`panel-badge${props.tone ? ` panel-badge--${props.tone}` : ""}`} data-testid={props.testId}>{props.children}</span>;
}

export function Stat(props: { readonly label: string; readonly value: string; readonly sub?: string }): JSX.Element {
  return (
    <div class="panel-stat">
      <span class="panel-stat__label">{props.label}</span>
      <span class="panel-stat__value">{props.value}</span>
      <Show when={props.sub}><span class="panel-stat__sub">{props.sub}</span></Show>
    </div>
  );
}

/** A persistent panel group for forms that keep their own editing/disclosure state. */
export function PanelCard(props: { readonly title: string; readonly actions?: JSX.Element; readonly children: JSX.Element; readonly testId?: string }): JSX.Element {
  return <section class="panel-section panel-card" data-testid={props.testId}>
    <header class="panel-card__head"><h3 class="panel-section__title">{props.title}</h3><Show when={props.actions}><div class="panel-card__actions">{props.actions}</div></Show></header>
    <div class="panel-section__body">{props.children}</div>
  </section>
}
