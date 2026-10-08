/**
 * Shared MCP pieces for the five legacy MCP pages: the bouncing-icon loader, the server
 * form used by the settings and edit screens, and the helpers that carry the legacy
 * `{ error }` bodies to the screen.
 *
 * The legacy client (`src/lib/mcp/api-client.ts`) read `errorData.error` out of every
 * non-2xx body; the typed client fails before decoding, so `legacyRead`/`legacyFailure`
 * read that same body back and fail with the legacy message instead of an Effect one.
 */
import { Show, createEffect, createSignal, type JSX } from "solid-js"
import { Effect } from "effect"
import type { McpServerEntry, McpServerPatch } from "@cadcamfun/api"
import { t } from "../i18n/index.ts"

/** A server row as the legacy cards and form read it (the DB row plus form-only fields). */
export type McpServerCard = McpServerEntry & { readonly defaultWorkingDirectory?: string | null }

/**
 * Turns `GET /api/mcp/config` into the list the legacy pages rendered.
 *
 * The v6 endpoint answers the envelope `{ success, source, servers, count }`; the legacy
 * client pushed that envelope straight through `Array.isArray`, so every screen using it
 * rendered its empty state. Both shapes are accepted: the envelope and a plain array.
 */
export const serversFrom = (response: unknown): McpServerCard[] => {
  if (Array.isArray(response)) return response as McpServerCard[]
  if (typeof response === "object" && response !== null) {
    const servers = (response as { servers?: unknown }).servers
    if (Array.isArray(servers)) return servers as McpServerCard[]
  }
  return []
}

/** The `response` getter on a failed typed-client call, with its `text` body effect. */
const bodyOf = (cause: unknown): { readonly text: Effect.Effect<string, unknown> } | undefined => {
  if (typeof cause !== "object" || cause === null) return undefined
  const response = (cause as { response?: unknown }).response
  if (typeof response !== "object" || response === null) return undefined
  const text = (response as { text?: unknown }).text
  if (typeof text !== "object" || text === null) return undefined
  return { text: text as Effect.Effect<string, unknown> }
}

/** `{ error }` / `{ message }` straight off a failure value (an `Error`, a tagged error). */
const fieldOf = (cause: unknown): string | undefined => {
  if (typeof cause === "object" && cause !== null) {
    const failure = cause as { error?: unknown; message?: unknown }
    if (typeof failure.error === "string") return failure.error
    if (typeof failure.message === "string") return failure.message
  }
  return undefined
}

/** The legacy body → message rule: `{ error }` first, then `{ message }`. */
const parseBody = (raw: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null) {
      const body = parsed as { error?: unknown; message?: unknown }
      if (typeof body.error === "string") return body.error
      if (typeof body.message === "string") return body.message
    }
  } catch { /* not JSON: fall back to the failure value */ }
  return undefined
}

/** Resolves the message the legacy client would have thrown for `cause`. */
export const legacyMessage = (cause: unknown, fallback: string): Effect.Effect<string> => {
  const body = bodyOf(cause)
  if (body === undefined) return Effect.succeed(fieldOf(cause) ?? fallback)
  return Effect.map(
    Effect.catch(body.text, () => Effect.succeed(undefined)),
    (raw) => (raw === undefined ? undefined : parseBody(raw)) ?? fieldOf(cause) ?? fallback
  )
}

/**
 * Wraps a read so a rejected request fails with the legacy body message: `useRead`
 * renders `String(cause)`, so failing with the bare string keeps the exact wording.
 */
export const legacyRead = <A, E, R>(effect: Effect.Effect<A, E, R>, fallback: string): Effect.Effect<A, string, R> =>
  Effect.catch(effect, (cause) => Effect.flatMap(legacyMessage(cause, fallback), (message) => Effect.fail(message)))

/** The same message, as a promise, for the `catch` of an action. */
export const legacyFailure = async (cause: unknown, fallback: string): Promise<string> => {
  const body = bodyOf(cause)
  if (body !== undefined) {
    try {
      const parsed = parseBody(await Effect.runPromise(body.text))
      if (parsed !== undefined) return parsed
    } catch { /* the body could not be read */ }
  }
  return fieldOf(cause) ?? fallback
}

/** Legacy `components/ui/Loading.tsx`, class for class. */
export function McpLoading(): JSX.Element {
  return (
    <div class="grid h-screen place-items-center">
      <div class="animate-bounce">
        <img src="/icon.png" draggable={false} class="h-12 w-12 md:h-16 md:w-16" alt="lensshare" />
      </div>
    </div>
  )
}

export interface McpServerFormProps {
  readonly initialValues?: Partial<McpServerCard>
  readonly onSubmit: (values: McpServerPatch) => Promise<void>
  readonly onCancel?: () => void
  readonly isSubmitting?: boolean
}

/** Legacy `components/MCPServerForm.tsx`, including its seeded-from-`id` URL field. */
export function McpServerForm(props: McpServerFormProps): JSX.Element {
  const initial = () => props.initialValues ?? {}
  const [name, setName] = createSignal(initial().name ?? "")
  const [type, setType] = createSignal<"sse" | "stdio">(
    (initial().type === "stdio" ? "stdio" : "sse")
  )
  // Legacy seeds the URL from `initialValues.id` (not `.url`); kept bug for bug.
  const [url, setUrl] = createSignal(initial().id ?? "")
  const [command, setCommand] = createSignal(initial().command ?? "")
  const [argsText, setArgsText] = createSignal("")
  const [workingDirectory, setWorkingDirectory] = createSignal(initial().workingDirectory ?? "")
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = createSignal(initial().defaultWorkingDirectory ?? "")
  const [enabled, setEnabled] = createSignal(initial().enabled !== false)
  const [errors, setErrors] = createSignal<Record<string, string>>({})

  createEffect(() => {
    const args = initial().args
    if (args === undefined || args === null) return
    try {
      setArgsText(Array.isArray(args) ? args.join(" ") : JSON.stringify(args))
    } catch {
      console.error("Failed to parse args:", args)
      setArgsText("")
    }
  })

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name().trim()) next.name = t("mcp.form.nameRequired")
    if (type() === "sse" && !url().trim()) next.url = t("mcp.form.urlRequired")
    if (type() === "stdio" && !command().trim()) next.command = t("mcp.form.commandRequired")
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }): Promise<void> => {
    event.preventDefault()
    if (!validate()) return

    // Args come in as JSON or as a space-separated list, exactly like legacy.
    let parsedArgs: unknown = []
    const text = argsText().trim()
    if (text) {
      try {
        parsedArgs = JSON.parse(text)
      } catch {
        parsedArgs = text.split(/\s+/).filter(Boolean)
      }
    }

    const current = type()
    const values: McpServerPatch = {
      name: name(),
      type: current,
      enabled: enabled(),
      ...(current === "sse" ? { url: url() } : {}),
      ...(current === "stdio"
        ? {
            command: command(),
            args: parsedArgs,
            workingDirectory: workingDirectory() || undefined,
            defaultWorkingDirectory: defaultWorkingDirectory() || undefined
          }
        : {})
    }
    await props.onSubmit(values)
  }

  const busy = () => props.isSubmitting === true

  return (
    <form class="space-y-4" onSubmit={(event) => void submit(event)}>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.serverName")}</label>
        <input
          type="text"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
          class={`w-full rounded border p-2 ${errors().name ? "border-red-500" : "border-gray-300"}`}
          placeholder={t("mcp.form.namePlaceholder")}
          disabled={busy()}
        />
        <Show when={errors().name}><p class="mt-1 text-sm text-red-600">{errors().name}</p></Show>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.serverType")}</label>
        <select
          value={type()}
          onChange={(event) => setType(event.currentTarget.value === "stdio" ? "stdio" : "sse")}
          class="w-full rounded border border-gray-300 p-2"
          disabled={busy() || initial().id !== undefined}
        >
          <option value="sse">{t("mcp.type.sse")}</option>
          <option value="stdio">{t("mcp.type.stdio")}</option>
        </select>
      </div>

      <Show when={type() === "sse"}>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.serverUrl")}</label>
          <input
            type="text"
            value={url()}
            onInput={(event) => setUrl(event.currentTarget.value)}
            class={`w-full rounded border p-2 ${errors().url ? "border-red-500" : "border-gray-300"}`}
            placeholder={t("mcp.form.urlPlaceholder")}
            disabled={busy()}
          />
          <Show when={errors().url}><p class="mt-1 text-sm text-red-600">{errors().url}</p></Show>
        </div>
      </Show>

      <Show when={type() === "stdio"}>
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.command")}</label>
            <input
              type="text"
              value={command()}
              onInput={(event) => setCommand(event.currentTarget.value)}
              class={`w-full rounded border p-2 ${errors().command ? "border-red-500" : "border-gray-300"}`}
              placeholder={t("mcp.form.commandPlaceholder")}
              disabled={busy()}
            />
            <Show when={errors().command}><p class="mt-1 text-sm text-red-600">{errors().command}</p></Show>
            <p class="mt-1 text-xs text-gray-500">{t("mcp.form.commandHelp")}</p>
          </div>

          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.arguments")}</label>
            <input
              type="text"
              value={argsText()}
              onInput={(event) => setArgsText(event.currentTarget.value)}
              class="w-full rounded border border-gray-300 p-2"
              placeholder={t("mcp.form.argsPlaceholder")}
              disabled={busy()}
            />
            <p class="mt-1 text-xs text-gray-500">{t("mcp.form.argsHelp")}</p>
          </div>

          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.workingDirectory")}</label>
            <input
              type="text"
              value={workingDirectory()}
              onInput={(event) => setWorkingDirectory(event.currentTarget.value)}
              class="w-full rounded border border-gray-300 p-2"
              placeholder={t("mcp.form.workingDirectoryPlaceholder")}
              disabled={busy()}
            />
            <p class="mt-1 text-xs text-gray-500">{t("mcp.form.workingDirectoryHelp")}</p>
          </div>

          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">{t("mcp.form.defaultWorkingDirectory")}</label>
            <input
              type="text"
              value={defaultWorkingDirectory()}
              onInput={(event) => setDefaultWorkingDirectory(event.currentTarget.value)}
              class="w-full rounded border border-gray-300 p-2"
              placeholder={t("mcp.form.defaultWorkingDirectoryPlaceholder")}
              disabled={busy()}
            />
            <p class="mt-1 text-xs text-gray-500">{t("mcp.form.defaultWorkingDirectoryHelp")}</p>
          </div>
        </div>
      </Show>

      <div class="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled()}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          class="h-4 w-4 rounded border-gray-300 text-blue-600"
          disabled={busy()}
        />
        <label for="enabled" class="ml-2 block text-sm text-gray-700">{t("mcp.form.enabled")}</label>
      </div>

      <div class="flex space-x-3 pt-2">
        <button
          type="submit"
          class="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          disabled={busy()}
        >
          {busy() ? t("mcp.form.saving") : initial().id !== undefined ? t("mcp.form.update") : t("mcp.settings.add")}
        </button>

        <Show when={props.onCancel !== undefined}>
          <button
            type="button"
            onClick={() => props.onCancel?.()}
            class="rounded bg-gray-300 px-4 py-2 font-bold text-gray-800 hover:bg-gray-400"
            disabled={busy()}
          >
            {t("mcp.form.cancel")}
          </button>
        </Show>
      </div>
    </form>
  )
}
