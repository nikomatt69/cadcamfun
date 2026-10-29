import { t } from "../../i18n/index.ts"
/**
 * The enterprise page vocabulary — the one seam every non-CAD/CAM screen composes.
 *
 * Before this module each screen invented its own title band, section heading,
 * stat tile, table and field, so the same role looked different on every page
 * and a fix had to be repeated N times. The vocabulary below is the interface:
 * a page is a title band, a set of ruled sections, and the content blocks below
 * them. Adding a screen means choosing from this list, not writing new CSS.
 *
 * The language is the quiet workstation one the CAD and CAM editors already
 * speak: flat 1 px surfaces, a 5 px radius scale, 12.5 px base type, one blue
 * accent, no gradients and no elevation. Type is set as a set — size, weight,
 * leading and tracking move together — so a heading reads as a heading and a
 * label reads as a label.
 *
 * Motion is restrained on purpose: a colour or border change settles in
 * 120–140 ms on a strong ease-out, a pressed control answers immediately with
 * a 3 % scale-down, and every transition is dropped under
 * `prefers-reduced-motion`.
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"

/* ---- page title band ---------------------------------------------------- */

export interface PageHeaderProps {
  readonly title: string
  /** One sentence: what this screen is for. */
  readonly description?: string
  /** A small uppercase label above the title — the wayfinding line. */
  readonly eyebrow?: string
  /** Buttons on the right of the band. */
  readonly actions?: JSX.Element
  /**
   * A document page (legal, auth) leads with a larger title than a list page.
   * The distinction is size and leading only, so the two still read as one family.
   */
  readonly document?: boolean
}

/**
 * The title band: eyebrow, title, description, actions.
 *
 * Every page starts with exactly one of these, so "where am I" and "what can I
 * do here" are answered in the same place on every screen.
 */
export function PageHeader(props: PageHeaderProps): JSX.Element {
  return (
    <header class={`ent-header${props.document === true ? " ent-header--document" : ""}`}>
      <div class="ent-header__text">
        <Show when={props.eyebrow !== undefined}>
          <p class="ent-header__eyebrow">{props.eyebrow}</p>
        </Show>
        <h1 class="ent-header__title">{props.title}</h1>
        <Show when={props.description !== undefined}>
          <p class="ent-header__description">{props.description}</p>
        </Show>
      </div>
      <Show when={props.actions !== undefined}>
        <div class="ent-header__actions">{props.actions}</div>
      </Show>
    </header>
  )
}

/* ---- ruled section heading ---------------------------------------------- */

export interface SectionHeaderProps {
  /** The section's position on the page — `01`, `02`, … */
  readonly index?: string
  readonly title: string
  /** A control on the right of the rule. */
  readonly actions?: JSX.Element
}

/**
 * `01 · LABEL ──────────`: a numbered heading with a hairline that runs to the
 * edge of the content. The number gives the page an order the eye can follow;
 * the rule gives the block a width the reader can scan down.
 */
export function SectionHeader(props: SectionHeaderProps): JSX.Element {
  return (
    <div class="ent-section">
      <Show when={props.index !== undefined}>
        <span class="ent-section__index" aria-hidden="true">{props.index}</span>
      </Show>
      <h2 class="ent-section__title">{props.title}</h2>
      <span class="ent-section__rule" aria-hidden="true" />
      <Show when={props.actions !== undefined}>
        <span class="ent-section__actions">{props.actions}</span>
      </Show>
    </div>
  )
}

/* ---- stat tiles --------------------------------------------------------- */

export interface StatTileProps {
  readonly label: string
  readonly value: string | number | undefined
  /** Where the number came from, in one short line. */
  readonly meta?: string
  /** Draws the meta line in the warning colour. */
  readonly alert?: boolean
  readonly icon?: JSX.Element
  /** The position of the tile in the row — `KPI·01`. */
  readonly index?: string
  /** Makes the whole tile a link. */
  readonly href?: string
}

export interface StatGridProps {
  readonly children: JSX.Element
}

/**
 * A KPI row: value first, label second, provenance last.
 *
 * The numbers are tabular so a row of them lines up on the decimal, and the
 * label is a small uppercase word rather than a sentence — the tile answers
 * "how much", not "what does this mean".
 */
export function StatGrid(props: StatGridProps): JSX.Element {
  return <div class="ent-stats" role="list">{props.children}</div>
}

export function StatTile(props: StatTileProps): JSX.Element {
  const body = (): JSX.Element => (
    <>
      <Show when={props.index !== undefined || props.icon !== undefined}>
        <span class="ent-stat__top">
          <Show when={props.index !== undefined}>
            <span class="ent-section__index">{props.index}</span>
          </Show>
          <Show when={props.icon !== undefined}>
            <span class="ent-stat__icon">{props.icon}</span>
          </Show>
        </span>
      </Show>
      <span class="ent-stat__value">{props.value ?? t("dashboard.metric.unavailable")}</span>
      <span class="ent-stat__label">{props.label}</span>
      <Show when={props.meta !== undefined}>
        <span class={`ent-stat__meta${props.alert === true ? " ent-stat--alert" : ""}`}>{props.meta}</span>
      </Show>
    </>
  )
  return props.href === undefined
    ? <div class="ent-stat" role="listitem">{body()}</div>
    : <A href={props.href} class="ent-stat" role="listitem">{body()}</A>
}

/* ---- data table --------------------------------------------------------- */

/**
 * A data table: hairline rules, a small uppercase head row, rows that tint on
 * hover. The caller supplies the `<table>`; this owns the frame so every table
 * in the app has the same density and the same border.
 */
export function DataTable(props: { readonly children: JSX.Element; readonly class?: string }): JSX.Element {
  return (
    <div class={`ent-table${props.class === undefined ? "" : ` ${props.class}`}`}>
      {props.children}
    </div>
  )
}

/* ---- key / value list --------------------------------------------------- */

export interface KeyValueRow {
  readonly label: string
  readonly value: JSX.Element
}

/**
 * A definition list whose values align on the right and count like numbers.
 * Replaces the ad-hoc `dl.panel-kv` markup, which was written for the CAD
 * panel and rendered in a two-column grid on the workspace pages.
 */
export function KeyValueList(props: { readonly rows: ReadonlyArray<KeyValueRow> }): JSX.Element {
  return (
    <dl class="ent-kv">
      <For each={props.rows}>
        {(row) => (
          <>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </>
        )}
      </For>
    </dl>
  )
}

/* ---- fields, buttons and notices ---------------------------------------- */

/** A label above its field. The label sits with the control it names. */
export function Field(props: {
  readonly label: string
  readonly id?: string
  readonly hint?: string
  readonly children: JSX.Element
}): JSX.Element {
  return (
    <div class="ent-field">
      <label class="ent-field__label" for={props.id}>{props.label}</label>
      {props.children}
      <Show when={props.hint !== undefined}>
        <p class="ent-field__hint">{props.hint}</p>
      </Show>
    </div>
  )
}

/**
 * A text input in the shared field style.
 *
 * The field is uncontrolled by default: it carries a `name` and the form reads
 * it through `FormData`. A controlled field would fight the browser's own
 * value semantics — the caret position, and any code that sets the value
 * directly — so a form that only needs its values on submit stays uncontrolled.
 */
export function TextField(props: {
  readonly id?: string
  readonly name?: string
  readonly type?: string
  /** Omit for an uncontrolled field. */
  readonly value?: string
  readonly placeholder?: string
  readonly required?: boolean
  readonly disabled?: boolean
  readonly onInput?: (value: string) => void
}): JSX.Element {
  return (
    <input
      id={props.id}
      name={props.name}
      type={props.type ?? "text"}
      class="ent-field__input"
      value={props.value}
      placeholder={props.placeholder}
      required={props.required === true}
      disabled={props.disabled === true}
      onInput={(event) => props.onInput?.(event.currentTarget.value)}
    />
  )
}

export type ButtonTone = "default" | "primary" | "danger" | "ghost";

/**
 * A button in the shared vocabulary. The tone carries the meaning; the size
 * never varies, so a row of buttons always lines up.
 */
export function Button(props: {
  readonly tone?: ButtonTone
  readonly block?: boolean
  readonly type?: "button" | "submit"
  readonly disabled?: boolean
  readonly onClick?: () => void
  readonly children: JSX.Element
}): JSX.Element {
  const tone = (): string => {
    switch (props.tone) {
      case "primary": return " ent-btn--primary"
      case "danger": return " ent-btn--danger"
      case "ghost": return " ent-btn--ghost"
      default: return ""
    }
  }
  return (
    <button
      type={props.type ?? "button"}
      class={`ent-btn${tone()}${props.block === true ? " ent-btn--block" : ""}`}
      disabled={props.disabled === true}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </button>
  )
}

/**
 * Status, completion, warning and error share one box; only the accent and
 * the copy change, so the reader learns the shape once.
 */
export function Notice(props: {
  readonly tone?: "default" | "ok" | "warn" | "bad"
  readonly icon?: JSX.Element
  readonly children: JSX.Element
}): JSX.Element {
  const tone = (): string => {
    switch (props.tone) {
      case "ok": return " ent-notice--ok"
      case "warn": return " ent-notice--warn"
      case "bad": return " ent-notice--bad"
      default: return ""
    }
  }
  return (
    <div class={`ent-notice${tone()}`} role={props.tone === "bad" ? "alert" : "status"}>
      <Show when={props.icon !== undefined}>
        <span class="ent-notice__icon">{props.icon}</span>
      </Show>
      <span class="min-w-0">{props.children}</span>
    </div>
  )
}
