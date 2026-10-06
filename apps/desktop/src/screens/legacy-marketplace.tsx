import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { ScreenHeader } from "./screen-parts.tsx"
import { LegacyNotice, lt } from "./legacy-parts.tsx"

export function LegacyMarketplace(props: { readonly view?: "browse" | "item" | "purchases" | "seller" | "success" }): JSX.Element {
  const view = () => props.view ?? "browse"
  const title = () => lt(view() === "item" ? "legacy.item" : view() === "purchases" ? "legacy.purchases" : view() === "seller" ? "legacy.seller" : view() === "success" ? "legacy.purchaseStatus" : "legacy.marketplace")
  return <section>
    <ScreenHeader title={title()} actions={<nav class="flex flex-wrap gap-2" aria-label={lt("legacy.marketplace")}>
      <A class="btn btn-outline" href="/marketplace">{lt("legacy.backMarketplace")}</A>
      <A class="btn btn-outline" href="/marketplace/purchases">{lt("legacy.purchases")}</A>
      <A class="btn btn-outline" href="/marketplace/seller/dashboard">{lt("legacy.seller")}</A>
    </nav>} />
    <Show when={view() === "browse"}>
      <header class="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-12 text-center text-white">
        <h2 class="text-3xl font-bold tracking-tight sm:text-5xl">{lt("legacy.marketplace")}</h2>
        <p class="mx-auto mt-4 max-w-2xl text-lg opacity-90">{lt("legacy.marketplaceDetail")}</p>
      </header>
    </Show>
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <LegacyNotice message={lt("legacy.marketplaceGap")} />
      <Show when={view() === "success"}><p class="card p-5" role="status">{lt("legacy.purchaseWarning")}</p></Show>
      <Show when={view() === "browse"}>
        <fieldset disabled aria-describedby="marketplace-availability" class="card grid gap-4 rounded-2xl p-5 md:grid-cols-[2fr_1fr_1fr]">
          <label class="form-label">{lt("legacy.search")}<input type="search" class="form-input" placeholder={lt("legacy.searchItems")} /></label>
          <label class="form-label">{lt("legacy.allTypes")}<select class="form-select"><option>{lt("legacy.allTypes")}</option><For each={["legacy.components", "legacy.drawings", "legacy.projects", "legacy.gcode", "legacy.toolpaths", "legacy.assemblies"] as const}>{(key) => <option>{lt(key)}</option>}</For></select></label>
          <label class="form-label">{lt("legacy.newest")}<select class="form-select"><option>{lt("legacy.newest")}</option><option>{lt("legacy.priceLow")}</option><option>{lt("legacy.rating")}</option></select></label>
        </fieldset>
        <p id="marketplace-availability" class="text-sm text-gray-500 dark:text-gray-400">{lt("legacy.unavailable")}</p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={["legacy.components", "legacy.drawings", "legacy.assemblies", "legacy.gcode", "legacy.toolpaths"] as const}>{(key) => <article class="card rounded-2xl p-5"><h3 class="font-semibold">{lt(key)}</h3><p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{lt("legacy.unavailable")}</p></article>}</For>
        </div>
      </Show>
    </div>
  </section>
}
