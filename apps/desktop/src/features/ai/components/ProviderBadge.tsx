/**
 * The nikcli status pill — embedded host vs direct mode, providers configured.
 *
 * Sits in the assistant header so the user always sees whether the AI runs
 * through the embedded nikcli host (spec 08-ai.md §1: full session engine,
 * locked-down agent, tool registry) or through the direct AI SDK fallback.
 */
import { Show, type JSX } from "solid-js"
import Cpu from "lucide-solid/icons/cpu"
import Cloud from "lucide-solid/icons/cloud"
import { t } from "../../../i18n/index.ts"
import { useAiStore } from "../store/context.tsx"

export function ProviderBadge(): JSX.Element {
  const ai = useAiStore()
  const status = (): ReturnType<typeof ai.aiStatus> => ai.aiStatus()
  const host = (): "nikcli" | "direct" => status()?.host ?? "direct"
  const providers = (): ReadonlyArray<string> => {
    const s = status()
    if (!s) return []
    return Object.entries(s.providers).filter(([, v]) => v === "configured").map(([k]) => k)
  }
  /** First few configured providers; the rest collapse into a `+N` count. */
  const shown = (): ReadonlyArray<string> => providers().slice(0, 3)
  const extra = (): number => Math.max(0, providers().length - 3)
  return (
    <div class="flex items-center gap-1" data-testid="ai-provider-badge">
      <Show when={host() === "nikcli"} fallback={
        <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400" title={t("ai.header.fallback")}>
          <Cloud size={10} aria-hidden="true" />
          {t("ai.status.host.direct")}
        </span>
      }>
        <span class="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400" title={t("ai.status.host.nikcli")}>
          <Cpu size={10} aria-hidden="true" />
          {t("ai.status.host.nikcli")}
        </span>
      </Show>
      <Show when={providers().length > 0}>
        <span class="text-[10px] text-gray-500" data-testid="ai-providers">
          {/* A catalogue provider set can be huge: the pill summarises instead of listing. */}
          {shown().join(" · ")}
          <Show when={extra() > 0}> · +{extra()}</Show>
        </span>
      </Show>
    </div>
  )
}