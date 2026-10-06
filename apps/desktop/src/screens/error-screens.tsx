/**
 * Reference-aligned 404 / 500 / offline screens (`src/pages/{404,500,offline}.tsx`).
 * Standalone layout (no navbar/sidebar) per the spec.
 */
import { Show, type JSX } from "solid-js"
import { A, useLocation, useNavigate } from "@solidjs/router"
import { AlertTriangle, ArrowLeft } from "lucide-solid"
import { t } from "../i18n/index.ts"

const ErrorPanel = (props: { readonly code: string; readonly title: string; readonly description: string; readonly variant: "notFound" | "server" | "offline" }): JSX.Element => {
  const location = useLocation()
  const navigate = useNavigate()
  const reload = () => { if (typeof window !== "undefined") window.location.reload() }
  return <div class="reference-standalone-container">
    <div class="reference-error-card">
      <div class="reference-error-badge" classList={{ "reference-error-badge-offline": props.variant === "offline" }}>
        <Show when={props.variant === "offline"} fallback={<span aria-hidden="true">{props.code}</span>}>
          <AlertTriangle size={32} aria-hidden="true" />
        </Show>
      </div>
      <h1 class="reference-error-title">{props.title}</h1>
      <p class="reference-error-detail">{props.description}</p>
      <div class="reference-error-actions">
        <button type="button" class="reference-button-ghost" onClick={() => navigate(-1)}><ArrowLeft size={16} aria-hidden="true" />{t("error.goBack")}</button>
        <Show when={props.variant === "offline"}>
          <button type="button" class="reference-button-secondary" onClick={reload}>{t("error.reload")}</button>
        </Show>
        <A href="/" class="reference-button-primary" aria-current={location.pathname === "/" ? "page" : undefined}>{t("error.dashboard")}</A>
      </div>
    </div>
  </div>
}

export function NotFoundScreen(): JSX.Element {
  return <ErrorPanel code="404" title={t("error.notFound.title")} description={t("error.notFound.detail")} variant="notFound" />
}

export function ServerErrorScreen(): JSX.Element {
  return <ErrorPanel code="500" title={t("error.server.title")} description={t("error.server.detail")} variant="server" />
}

export function OfflineScreen(): JSX.Element {
  return <ErrorPanel code="" title={t("error.offline.title")} description={t("error.offline.detail")} variant="offline" />
}