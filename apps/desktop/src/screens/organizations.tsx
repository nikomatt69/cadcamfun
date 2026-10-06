/** Organizations screens: list, create form and the member overview. */
import { For, Show, createSignal, type JSX } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { Effect } from "effect"
import { t } from "../i18n/index.ts"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { EmptyState, ErrorState, LoadingState, ScreenHeader } from "./screen-parts.tsx"

const describe = (cause: unknown): string =>
  typeof cause === "object" && cause !== null && typeof (cause as { message?: unknown }).message === "string"
    ? (cause as { message: string }).message : String(cause)

export function OrganizationsScreen(): JSX.Element {
  const orgs = useRead((c) => c.organizations.list())
  return <section>
    <ScreenHeader title={t("orgs.title")} subtitle={t("orgs.subtitle")}
      actions={<A class="btn btn-primary" href="/organizations/create">{t("orgs.create")}</A>} />
    <div class="grid gap-3 p-5 md:grid-cols-2">
      <Show when={orgs.error()}><ErrorState label={t("orgs.error")} detail={describe(orgs.error())} /></Show>
      <Show when={orgs.loading() && !orgs.data()}><LoadingState label={t("common.loading")} /></Show>
      <Show when={orgs.data()?.length === 0}><EmptyState label={t("orgs.empty")} /></Show>
      <For each={orgs.data() ?? []}>{(org) =>
        <article class="card p-4">
          <h2 class="font-semibold"><A href={`/organizations/${encodeURIComponent(org.id)}`}>{org.name}</A></h2>
          <p class="text-sm text-gray-600 dark:text-gray-300">{org.description ?? ""}</p>
          <p class="mt-1 text-xs">{t("orgs.members")}: {org.userCount} · {t("orgs.projects")}: {org.projectCount} · {org.role}</p>
        </article>}</For>
    </div>
  </section>
}

export function CreateOrganizationScreen(): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const submit = async (event: Event) => {
    event.preventDefault(); if (pending()) return
    setPending(true); setError(undefined)
    try {
      const created = await app.runtime.run(app.client.organizations.create({
        payload: { name: name().trim(), description: description().trim() === "" ? null : description().trim() }
      }))
      navigate(`/organizations/${encodeURIComponent(created.id)}`)
    } catch (cause) { setError(describe(cause)) } finally { setPending(false) }
  }
  return <section>
    <ScreenHeader title={t("orgs.create")} />
    <form class="card m-5 grid max-w-xl gap-3 p-4" onSubmit={(e) => void submit(e)}>
      <label class="form-label">{t("orgs.name")}<input class="form-input" required value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
      <label class="form-label">{t("orgs.description")}<textarea class="form-textarea" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} /></label>
      <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
      <div class="flex gap-2">
        <button class="btn btn-primary" disabled={pending() || !name().trim()}>{t("orgs.create")}</button>
        <A class="btn btn-outline" href="/organizations">{t("common.cancel")}</A>
      </div>
    </form>
  </section>
}

export function OrganizationDetailScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const org = useRead((c) => c.organizations.get({ params: { id: params.id } }))
  const [confirming, setConfirming] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const remove = async () => {
    try {
      await app.runtime.run(Effect.asVoid(app.client.organizations.remove({ params: { id: params.id } })))
      navigate("/organizations")
    } catch (cause) { setError(describe(cause)) }
  }
  return <section>
    <ScreenHeader title={org.data()?.name ?? t("orgs.title")} subtitle={org.data()?.description ?? undefined}
      actions={<A class="btn btn-outline" href="/organizations">{t("orgs.title")}</A>} />
    <div class="grid gap-4 p-5">
      <Show when={org.error()}><ErrorState label={t("orgs.error")} detail={describe(org.error())} /></Show>
      <Show when={error()}><ErrorState label={t("common.error")} detail={error()} /></Show>
      <Show when={org.data()}>{(o) => <>
        <p class="text-sm">{t("orgs.role")}: {o().userRole} · {t("orgs.projects")}: {o().projectCount}</p>
        <h2 class="font-semibold">{t("orgs.members")}</h2>
        <ul class="grid gap-2 text-sm">
          <For each={o().members}>{(m) => <li class="card flex justify-between p-3"><span>{m.name ?? m.email ?? m.id}</span><span>{m.role}</span></li>}</For>
        </ul>
        <Show when={o().userRole === "ADMIN"}>
          <div><button class="btn btn-danger" onClick={() => setConfirming(true)}>{t("common.delete")}</button></div>
        </Show>
        <Show when={confirming()}>
          <div role="alertdialog" aria-label={t("orgs.confirmDelete")} class="card p-4">
            <p>{t("orgs.confirmDelete")}</p>
            <button class="btn btn-danger" onClick={() => void remove()}>{t("common.delete")}</button>
            <button class="btn btn-outline" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
          </div>
        </Show>
      </>}</Show>
    </div>
  </section>
}
