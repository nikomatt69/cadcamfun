/**
 * Settings → Cloud: a private workspace for the signed-in account.
 *
 * Each person signs in on their own computer and gets their own auth token. The token stays
 * in the keychain and is shown here only when they ask. The phone link is a separate device
 * token, held in memory while the QR code is on screen.
 */
import { copyText } from "../../../shared/lib/clipboard.ts"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Check, Copy } from "lucide-solid"
import qrcode from "qrcode-generator"
import { deviceTokenFromLink } from "../../../app/cloud-request.ts"
import { clearIdentity, readIdentity, saveIdentitySession } from "../../../app/identity-session.ts"
import { openExternal } from "../../../app/external.ts"
import { useRead } from "../../../app/queries.ts"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { DANGER_BUTTON, FIELD, LABEL, StageError, StageLoading, TOOLBAR_BUTTON, TOOLBAR_PRIMARY } from "../../../shared/components/WorkspacePage.tsx"

const CARD = "ui-card ui-card-default !p-6"
const PRIMARY = `${TOOLBAR_PRIMARY} justify-center`
const SECONDARY = `${TOOLBAR_BUTTON} justify-center`
const DANGER = DANGER_BUTTON

type CloudState = "local" | "pending" | "downloaded" | "applied" | "conflict"

interface CloudRow {
  readonly id: string
  readonly name: string
  readonly local: boolean
  readonly remote: boolean
  readonly state?: CloudState
  readonly dirty?: boolean
}

const qrSvg = (text: string): string => {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

const failureMessage = (cause: unknown): string => {
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string" && cause.message.length > 0) return cause.message
  return String(cause)
}

const stateLabel = (state: CloudState): string => {
  switch (state) {
    case "local": return t("cloud.projects.state.local")
    case "pending": return t("cloud.projects.state.pending")
    case "downloaded": return t("cloud.projects.state.downloaded")
    case "applied": return t("cloud.projects.state.applied")
    case "conflict": return t("cloud.projects.state.conflict")
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The cloud body embedded in the Settings "Cloud" tab. */
export function CloudPanel(): JSX.Element {
  const app = useApp()
  const connection = useRead((c) => c.cloud.connection())
  const [access, setAccess] = createSignal<string>()
  const [email, setEmail] = createSignal<string>()
  const [showToken, setShowToken] = createSignal(false)
  const [showPhoneToken, setShowPhoneToken] = createSignal(false)
  const [origin, setOrigin] = createSignal("")
  const [name, setName] = createSignal("Desktop")
  const [setupCode, setSetupCode] = createSignal("")
  const [phoneName, setPhoneName] = createSignal("iPhone")
  const [link, setLink] = createSignal<string>()
  const [copied, setCopied] = createSignal<"token" | "link" | "phone">()
  const [pending, setPending] = createSignal(false)
  const [rows, setRows] = createSignal<readonly CloudRow[]>([])
  const [projectsError, setProjectsError] = createSignal<string>()
  const [projectsLoading, setProjectsLoading] = createSignal(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined
  let stopSignIn = false
  let attemptId: string | undefined
  let alive = true
  onCleanup(() => {
    alive = false
    stopSignIn = true
    if (copiedTimer !== undefined) clearTimeout(copiedTimer)
    const id = attemptId
    attemptId = undefined
    if (id) void app.runtime.run(app.client.auth.identityCancel({ payload: { id } })).catch(() => undefined)
  })

  onMount(() => {
    void readIdentity().then((account) => {
      if (!alive || !account) return
      setAccess(account.access)
      setEmail(account.email)
    })
  })

  const signedIn = () => access() !== undefined
  const configured = () => connection.data()?.configured === true
  const qr = createMemo(() => { const current = link(); return current ? qrSvg(current) : undefined })
  const phoneToken = createMemo(() => { const current = link(); return current ? deviceTokenFromLink(current) : undefined })

  const loadRows = async (): Promise<readonly CloudRow[]> => {
    const [locals, remotes] = await Promise.all([
      app.runtime.run(app.client.projects.list()),
      app.runtime.run(app.client.cloud.projects()),
    ])
    const byId = new Map<string, CloudRow>()
    for (const project of locals) byId.set(project.id, { id: project.id, name: project.name, local: true, remote: false })
    for (const project of remotes) {
      const current = byId.get(project.id)
      byId.set(project.id, current
        ? { ...current, remote: true }
        : { id: project.id, name: project.name, local: false, remote: true, state: project.state })
    }
    const next = [...byId.values()]
    await Promise.all(next.map(async (row, index) => {
      if (!row.local) return
      try {
        const status = await app.runtime.run(app.client.cloud.status({ params: { id: row.id } }))
        next[index] = { ...row, state: status.state, dirty: status.dirty }
      } catch {
        next[index] = row
      }
    }))
    return next
  }

  let generation = 0
  createEffect(() => {
    const ready = configured() && signedIn()
    const current = ++generation
    if (!ready) { setRows([]); setProjectsError(undefined); setProjectsLoading(false); return }
    setProjectsLoading(true)
    setProjectsError(undefined)
    void loadRows().then((loaded) => {
      if (current === generation) setRows(loaded)
    }).catch((cause: unknown) => {
      if (current === generation) setProjectsError(failureMessage(cause))
    }).finally(() => {
      if (current === generation) setProjectsLoading(false)
    })
  })

  const copyValue = async (value: string | undefined, which: "token" | "link" | "phone"): Promise<void> => {
    if (!value) return
    try {
      await copyText(value)
      setCopied(which)
      if (copiedTimer !== undefined) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => setCopied(undefined), 1500)
    } catch (cause) {
      toast.error(t("cloud.error.copy", { message: failureMessage(cause) }))
    }
  }

  const act = async (run: () => Promise<unknown>) => {
    if (pending()) return
    setPending(true)
    try { await run() } catch (cause) {
      toast.error(t("cloud.error.action", { message: failureMessage(cause) }))
    } finally { setPending(false) }
  }

  const signIn = async () => {
    const started = await app.runtime.run(app.client.auth.identityStart())
    attemptId = started.id
    openExternal(started.url)
    const until = Date.now() + 5 * 60_000
    while (!stopSignIn && Date.now() < until) {
      const result = await app.runtime.run(app.client.auth.identityPoll({ payload: { id: started.id } }))
      if (result.status === "complete") {
        attemptId = undefined
        await saveIdentitySession({ issuer: started.issuer, tokens: result.tokens })
        const account = await readIdentity()
        if (!account) throw new Error(t("cloud.error.action", { message: "signed-out" }))
        setAccess(account.access)
        setEmail(account.email)
        setShowToken(false)
        return
      }
      if (result.status === "failed") throw new Error(result.message)
      await wait(1000)
    }
  }

  const connect = async () => {
    const code = setupCode().trim()
    await app.runtime.run(app.client.cloud.enroll({
      payload: { origin: origin().trim(), name: name().trim(), ...(code.length > 0 ? { setupCode: code } : {}) },
    }))
    setSetupCode("")
    await connection.refetch()
  }

  const pairPhone = async () => {
    const paired = await app.runtime.run(app.client.cloud.pair({ payload: { name: phoneName().trim() } }))
    setShowPhoneToken(false)
    setLink(paired.link)
  }

  const runProject = async (run: () => Promise<unknown>) => {
    await act(async () => {
      await run()
      setRows(await loadRows())
    })
  }

  const canApply = (row: CloudRow) => row.local && row.state === "downloaded" && row.dirty !== true

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{t("cloud.title")}</h3>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("cloud.subtitle")}</p>
      </div>

      <section class={`${CARD} space-y-4`}>
        <h4 class="text-[13px] font-semibold text-gray-900 dark:text-white">{t("cloud.account.title")}</h4>
        <Show
          when={signedIn()}
          fallback={<p class="text-xs text-gray-500 dark:text-gray-400">{t("cloud.account.signedOut")}</p>}
        >
          <p class="text-xs text-gray-700 dark:text-gray-300">{email() ? t("cloud.account.signedIn", { email: email() ?? "" }) : t("cloud.account.signedInPlain")}</p>
          <div>
            <label for="cloud-auth-token" class={LABEL}>{t("cloud.account.token")}</label>
            <div class="flex items-stretch gap-2">
              <input
                id="cloud-auth-token"
                class={`${FIELD} font-mono text-xs`}
                type={showToken() ? "text" : "password"}
                value={access() ?? ""}
                readonly
                autocomplete="off"
                spellcheck={false}
                aria-label={t("cloud.account.token")}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" class={SECONDARY} onClick={() => setShowToken((current) => !current)}>
                {showToken() ? t("cloud.account.hide") : t("cloud.account.show")}
              </button>
              <button type="button" class={copied() === "token" ? SECONDARY : PRIMARY} onClick={() => void copyValue(access(), "token")}>
                <Show when={copied() === "token"} fallback={<Copy size={14} aria-hidden="true" />}><Check size={14} aria-hidden="true" /></Show>
                {copied() === "token" ? t("cloud.account.copied") : t("cloud.account.copy")}
              </button>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("cloud.account.tokenHint")}</p>
          </div>
          <button type="button" class={DANGER} disabled={pending()} onClick={() => void act(async () => {
            await clearIdentity()
            setAccess(undefined)
            setEmail(undefined)
            setShowToken(false)
            setLink(undefined)
          })}>{t("cloud.account.signOut")}</button>
        </Show>
        <Show when={!signedIn()}>
          <button type="button" class={PRIMARY} disabled={pending()} onClick={() => void act(signIn)}>
            {pending() ? t("cloud.account.signingIn") : t("cloud.account.signIn")}
          </button>
        </Show>
      </section>

      <Show when={connection.loading() && !connection.data()}><StageLoading label={t("common.loading")} /></Show>
      <Show when={connection.error()}><StageError message={t("cloud.error.load")} /></Show>

      <Show when={connection.data()}>
        {(status) => (
          <>
            <section class={`${CARD} space-y-4`}>
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                  <span class={`inline-block h-2 w-2 rounded-full ${status().configured ? "bg-green-500" : "bg-gray-400"}`} />
                  <p class="text-xs font-medium text-gray-900 dark:text-white">
                    {status().configured ? t("cloud.status.connected") : t("cloud.status.disconnected")}
                  </p>
                </div>
                <Show when={status().configured}>
                  <button type="button" class={SECONDARY} disabled={pending()} onClick={() => void act(async () => {
                    setLink(undefined)
                    await app.runtime.run(app.client.cloud.disconnect())
                    await connection.refetch()
                  })}>{t("cloud.disconnect")}</button>
                </Show>
              </div>
              <Show when={status().configured}>
                <dl class="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div><dt class="inline font-medium text-gray-900 dark:text-white">{t("cloud.status.origin")}: </dt><dd class="inline break-all">{status().origin}</dd></div>
                  <div><dt class="inline font-medium text-gray-900 dark:text-white">{t("cloud.status.workspace")}: </dt><dd class="inline break-all">{status().workspaceId}</dd></div>
                  <div><dt class="inline font-medium text-gray-900 dark:text-white">{t("cloud.status.device")}: </dt><dd class="inline break-all">{status().deviceId}</dd></div>
                </dl>
              </Show>
            </section>

            <Show when={!status().configured}>
              <section class={`${CARD} space-y-4`}>
                <h4 class="text-[13px] font-semibold text-gray-900 dark:text-white">{t("cloud.connect.title")}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("cloud.connect.hint")}</p>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <label for="cloud-origin" class={LABEL}>{t("cloud.connect.origin")}</label>
                    <input id="cloud-origin" class={FIELD} value={origin()} disabled={!signedIn() || pending()} placeholder="https://" onInput={(event) => setOrigin(event.currentTarget.value)} />
                  </div>
                  <div>
                    <label for="cloud-device-name" class={LABEL}>{t("cloud.connect.name")}</label>
                    <input id="cloud-device-name" class={FIELD} value={name()} disabled={!signedIn() || pending()} onInput={(event) => setName(event.currentTarget.value)} />
                  </div>
                  <div>
                    <label for="cloud-setup-code" class={LABEL}>{t("cloud.connect.setup")}</label>
                    <input id="cloud-setup-code" class={FIELD} type="password" value={setupCode()} disabled={!signedIn() || pending()} autocomplete="off" spellcheck={false} onInput={(event) => setSetupCode(event.currentTarget.value)} />
                  </div>
                </div>
                <button type="button" class={PRIMARY} disabled={!signedIn() || pending() || origin().trim().length === 0 || name().trim().length === 0} onClick={() => void act(connect)}>{t("cloud.connect.submit")}</button>
              </section>
            </Show>

            <Show when={status().configured && signedIn()}>
              <section class={`${CARD} space-y-4`}>
                <h4 class="text-[13px] font-semibold text-gray-900 dark:text-white">{t("cloud.phone.title")}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("cloud.phone.hint")}</p>
                <div>
                  <label for="cloud-phone-name" class={LABEL}>{t("cloud.phone.name")}</label>
                  <input id="cloud-phone-name" class={FIELD} value={phoneName()} disabled={pending()} onInput={(event) => setPhoneName(event.currentTarget.value)} />
                </div>
                <button type="button" class={PRIMARY} disabled={pending() || phoneName().trim().length === 0} onClick={() => void act(pairPhone)}>{t("cloud.phone.create")}</button>
                <Show when={link()}>
                  {(current) => (
                    <>
                      {/* eslint-disable-next-line solid/no-innerhtml -- generated locally from the pairing link, no user HTML */}
                      <Show when={qr()}>
                        <div class="mx-auto w-full max-w-64 rounded-lg border border-[color:var(--ent-line)] bg-white p-3" innerHTML={qr()} />
                      </Show>
                      <div class="space-y-1">
                        <label for="cloud-phone-link" class={LABEL}>{t("cloud.phone.link")}</label>
                        <div class="flex items-stretch gap-2">
                          <input id="cloud-phone-link" class={`${FIELD} font-mono text-xs`} value={current()} readonly onFocus={(event) => event.currentTarget.select()} />
                          <button type="button" class={copied() === "link" ? SECONDARY : PRIMARY} onClick={() => void copyValue(current(), "link")}>
                            {copied() === "link" ? t("cloud.account.copied") : t("cloud.account.copy")}
                          </button>
                        </div>
                      </div>
                      <Show when={phoneToken()}>
                        {(token) => (
                          <div class="space-y-1">
                            <label for="cloud-phone-token" class={LABEL}>{t("cloud.phone.token")}</label>
                            <div class="flex items-stretch gap-2">
                              <input id="cloud-phone-token" class={`${FIELD} font-mono text-xs`} type={showPhoneToken() ? "text" : "password"} value={token()} readonly autocomplete="off" spellcheck={false} aria-label={t("cloud.phone.token")} onFocus={(event) => event.currentTarget.select()} />
                              <button type="button" class={SECONDARY} onClick={() => setShowPhoneToken((current) => !current)}>
                                {showPhoneToken() ? t("cloud.account.hide") : t("cloud.account.show")}
                              </button>
                              <button type="button" class={copied() === "phone" ? SECONDARY : PRIMARY} onClick={() => void copyValue(token(), "phone")}>
                                {copied() === "phone" ? t("cloud.account.copied") : t("cloud.account.copy")}
                              </button>
                            </div>
                          </div>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              </section>

              <section class={`${CARD} space-y-3`}>
                <h4 class="text-[13px] font-semibold text-gray-900 dark:text-white">{t("cloud.projects.title")}</h4>
                <Show when={projectsLoading()}><StageLoading label={t("common.loading")} /></Show>
                <Show when={projectsError()}>{(message) => <StageError message={t("cloud.error.projects", { message: message() })} />}</Show>
                <Show when={!projectsLoading() && !projectsError()}>
                  <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                    <For each={rows()} fallback={<li class="py-2 text-xs text-gray-500 dark:text-gray-400">{t("cloud.projects.empty")}</li>}>
                      {(row) => (
                        <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div>
                            <p class="text-xs font-medium text-gray-900 dark:text-white">{row.name}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                              {row.state ? stateLabel(row.state) : row.remote ? t("cloud.projects.remote") : t("cloud.projects.local")}
                              {row.dirty ? ` · ${t("cloud.projects.dirty")}` : ""}
                            </p>
                            <Show when={row.state === "conflict"}>
                              <p class="text-xs text-amber-700 dark:text-amber-300">{t("cloud.projects.conflict")}</p>
                            </Show>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <Show when={row.local}>
                              <button type="button" class={SECONDARY} disabled={pending()} onClick={() => void runProject(() => app.runtime.run(app.client.cloud.publish({ params: { id: row.id } })))}>{t("cloud.projects.publish")}</button>
                              <button type="button" class={SECONDARY} disabled={pending()} onClick={() => void runProject(() => app.runtime.run(app.client.cloud.fetch({ params: { id: row.id } })))}>{t("cloud.projects.fetch")}</button>
                            </Show>
                            <Show when={canApply(row)}>
                              <button type="button" class={PRIMARY} disabled={pending()} onClick={() => void runProject(() => app.runtime.run(app.client.cloud.apply({ params: { id: row.id }, payload: {} })))}>{t("cloud.projects.apply")}</button>
                            </Show>
                            <Show when={!row.local && row.remote}>
                              <button type="button" class={PRIMARY} disabled={pending()} onClick={() => void runProject(() => app.runtime.run(app.client.cloud.clone({ params: { id: row.id } })))}>{t("cloud.projects.clone")}</button>
                            </Show>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
