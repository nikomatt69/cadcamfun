/**
 * Capabilities overview — one card per production CAM capability family
 * (solid surfacing, milling strategies, lathe strategies, drilling cycles,
 * probing & setup, verification & simulation, workflow).
 *
 * Mirrors the Hypermill / Fusion 360 menu so the user always knows what's
 * available in the current build, and so they can find each feature without
 * trial-and-error. Rendered once at the bottom of the CAM generator panel
 * collapsed by default — click the header to expand.
 */
import { Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, Wrench, Layers, Cog, Drill, Radio, ShieldCheck, Workflow } from "lucide-solid"
import { t, type Key } from "../../../i18n/index.ts"

interface GroupCardProps {
  readonly id: string
  readonly accent: "blue" | "purple" | "cyan" | "amber" | "orange" | "green" | "red"
  readonly icon: (size?: number) => JSX.Element
  readonly titleKey: Key
  readonly itemKeys: ReadonlyArray<Key>
}

const ACCENT_BAR: Readonly<Record<GroupCardProps["accent"], string>> = {
  blue: "#3b82f6",
  purple: "#9333ea",
  cyan: "#0891b2",
  amber: "#d97706",
  orange: "#ea580c",
  green: "#059669",
  red: "#dc2626"
}

function GroupCard(props: GroupCardProps): JSX.Element {
  const [open, setOpen] = createSignal(true)
  return (
    <div class="capabilities-overview__group" data-testid={`caps-${props.id}`}>
      <button
        type="button"
        class="flex items-center justify-between w-full px-1 py-1"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
      >
        <span class="capabilities-overview__title flex items-center gap-1.5" data-accent={props.accent}>
          <span
            class="inline-block w-1.5 h-4 rounded-sm"
            style={{ background: ACCENT_BAR[props.accent] }}
          />
          {props.icon(14)}
          <span>{t(props.titleKey as Key)}</span>
        </span>
        <ChevronDown
          size={14}
          class="text-gray-400 transition-transform"
          style={{ transform: open() ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      <Show when={open()}>
        <div class="capabilities-overview__items">
          {props.itemKeys.map((key, index) => (
            <p class="capabilities-overview__items" data-row={index}>{t(key as Key)}</p>
          ))}
        </div>
      </Show>
    </div>
  )
}

export default function CapabilitiesOverview(): JSX.Element {
  const groups: ReadonlyArray<GroupCardProps> = [
    {
      id: "cad",
      accent: "blue",
      icon: (size) => <Layers size={size} />,
      titleKey: "cam.features.cad.title",
      itemKeys: ["cam.features.cad.items"]
    },
    {
      id: "mill",
      accent: "purple",
      icon: (size) => <Cog size={size} />,
      titleKey: "cam.features.mill.title",
      itemKeys: ["cam.features.mill.items", "cam.features.mill.items2", "cam.features.mill.items3"]
    },
    {
      id: "drill",
      accent: "cyan",
      icon: (size) => <Drill size={size} />,
      titleKey: "cam.features.drill.title",
      itemKeys: ["cam.features.drill.items"]
    },
    {
      id: "lathe",
      accent: "orange",
      icon: (size) => <Cog size={size} />,
      titleKey: "cam.features.lathe.title",
      itemKeys: ["cam.features.lathe.items"]
    },
    {
      id: "probe",
      accent: "green",
      icon: (size) => <Radio size={size} />,
      titleKey: "cam.features.probe.title",
      itemKeys: ["cam.features.probe.items"]
    },
    {
      id: "verify",
      accent: "red",
      icon: (size) => <ShieldCheck size={size} />,
      titleKey: "cam.features.verify.title",
      itemKeys: ["cam.features.verify.items"]
    },
    {
      id: "workflow",
      accent: "blue",
      icon: (size) => <Workflow size={size} />,
      titleKey: "cam.features.workflow.title",
      itemKeys: ["cam.features.workflow.items"]
    }
  ]
  return (
    <div class="capabilities-overview" data-testid="cam-capabilities-overview">
      <div class="flex items-center gap-2 pb-1 mb-1 border-b border-gray-200 dark:border-gray-700">
        <Wrench size={14} class="text-blue-600 dark:text-blue-400" />
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("cam.features.subtitle")}
          </div>
          <div class="text-[12px] font-bold text-gray-900 dark:text-white">
            {t("cam.features.title")}
          </div>
        </div>
      </div>
      {groups.map((group) => (
        <GroupCard
          id={group.id}
          accent={group.accent}
          icon={group.icon}
          titleKey={group.titleKey}
          itemKeys={group.itemKeys}
        />
      ))}
    </div>
  )
}
