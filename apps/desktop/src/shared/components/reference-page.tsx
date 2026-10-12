import { For, Show, type JSX } from "solid-js"
import ChevronRight from "lucide-solid/icons/chevron-right"
import { t, type Key } from "../../i18n/index.ts"
import { ReferenceLink } from "./reference-navigation.tsx"

const labels: Readonly<Record<string, Key>> = {
  projects: "shell.projects", cad: "shell.cad", cam: "shell.cam", library: "shell.resources",
  toolpaths: "shell.toolpaths", components: "shell.components", materials: "shell.materials",
  machine: "shell.configurations", tools: "shell.tools", organizations: "shell.organizations",
  marketplace: "shell.marketplace", plugins: "shell.plugins", pricing: "shell.pricing",
  ai: "shell.ai", analytics: "shell.analytics", history: "shell.history", settings: "shell.settings",
  profile: "shell.profile", subscription: "shell.subscription", purchases: "shell.purchases"
}

export const referenceLayout = (pathname: string): "workspace" | "standalone" | "page" => {
  if (pathname === "/cad" || pathname === "/cam") return "workspace"
  if (pathname.startsWith("/auth/") || pathname.startsWith("/invitations/") || ["/404", "/500", "/offline", "/marketplace/purchase/success"].includes(pathname)) return "standalone"
  return "page"
}

export function ReferenceBreadcrumbs(props: { readonly pathname: string }): JSX.Element {
  const crumbs = () => {
    const segments = props.pathname.split("/").filter(Boolean)
    if (segments.length === 0) return []
    return [{ href: "/", label: t("shell.home") }, ...segments.map((segment, index) => {
      const key = labels[segment]
      const dynamic = /^[a-f0-9]{24}$/i.test(segment) || /^[a-f0-9-]{36}$/i.test(segment) || /^c[a-z0-9]{24,}$/i.test(segment)
      return {
        href: `/${segments.slice(0, index + 1).join("/")}`,
        label: key ? t(key) : dynamic ? t(segments[index - 1] === "projects" ? "shell.projectDetails" : "shell.details") : segment.charAt(0).toUpperCase() + segment.slice(1).replaceAll("-", " ")
      }
    })]
  }
  return <Show when={crumbs().length > 0}><nav class="reference-breadcrumbs" aria-label={t("shell.breadcrumbs")}><ol><For each={crumbs()}>{(crumb, index) => <li>
    <Show when={index() > 0}><ChevronRight size={16} aria-hidden="true" /></Show>
    <Show when={index() < crumbs().length - 1} fallback={<span aria-current="page">{crumb.label}</span>}><ReferenceLink href={crumb.href}>{crumb.label}</ReferenceLink></Show>
  </li>}</For></ol></nav></Show>
}

export function ReferenceFooter(): JSX.Element {
  return <footer class="reference-footer"><div class="reference-footer-card">
    <div class="reference-footer-brand"><img src="/logo.png" alt={t("shell.brand")} /><span>{t("shell.copyright", { year: new Date().getFullYear() })}</span></div>
    <nav aria-label={t("shell.licenses")}><ReferenceLink href="/legal/terms">{t("shell.terms")}</ReferenceLink><ReferenceLink href="/legal/privacy">{t("shell.privacy")}</ReferenceLink><ReferenceLink href="/legal/third-party-licenses">{t("shell.licenses")}</ReferenceLink><span>{t("shell.nativeRuntime")}</span></nav>
  </div></footer>
}
