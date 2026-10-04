import { splitProps, type JSX } from "solid-js"

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; active?: boolean },
) {
  const [local, rest] = splitProps(props, ["variant", "active", "class"])
  return (
    <button
      {...rest}
      class={`inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${local.class ?? ""}`}
      classList={{
        "bg-[var(--accent)] text-black hover:brightness-110": local.variant === "primary",
        "bg-red-500/80 text-white hover:bg-red-500": local.variant === "danger",
        "bg-zinc-800 text-zinc-200 hover:bg-zinc-700": !local.variant && !local.active,
        "bg-zinc-600 text-white ring-1 ring-[var(--accent)]": local.active,
        "text-zinc-300 hover:bg-zinc-800": local.variant === "ghost",
      }}
    />
  )
}

export function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="flex items-center justify-between gap-2 text-xs text-zinc-400">
      <span class="shrink-0">{props.label}</span>
      {props.children}
    </label>
  )
}

const inputClass =
  "w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-right font-mono text-xs text-zinc-100 outline-none focus:border-[var(--accent)]"

export function NumberInput(props: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <input
      type="number"
      class={inputClass}
      value={Number(props.value.toFixed(4))}
      min={props.min}
      step={props.step ?? "any"}
      onChange={(e) => {
        const v = Number(e.currentTarget.value)
        if (Number.isFinite(v)) props.onChange(v)
      }}
    />
  )
}

export function Select<T extends string>(props: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <select
      class="max-w-40 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 outline-none focus:border-[var(--accent)]"
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value as T)}
    >
      {props.options.map((o) => (
        <option value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Section(props: { title: string; actions?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="border-b border-zinc-800 p-3">
      <header class="mb-2 flex items-center justify-between">
        <h3 class="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{props.title}</h3>
        {props.actions}
      </header>
      <div class="flex flex-col gap-2">{props.children}</div>
    </section>
  )
}
