/**
 * Toolpath detail (legacy `pages/toolpaths/[id].tsx`) in the CAM workspace style.
 *
 * Glass toolbar with back, the toolpath name, and the page actions (Edit / Save / Cancel, Download G-code,
 * Use in CAM, Delete). The stage has four tabs: Details (view or edit form, plus the information rail), G-code,
 * Versions (history with restore) and Comments. Writes go through the typed client; a save also records a
 * version, as the legacy page did.
 */
import { For, Show, createEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { Calendar, Cpu, Download, Edit, Layers, MessageCircle, Save, Share2, Trash2 } from "lucide-solid"
import { toast } from "../../../shared/ui/feedback.tsx"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { Modal, OPERATION_LABEL, TYPE_LABEL, formatDate, handOffToCam, type ToolpathRow } from "../components/shared.tsx"
import { ToolpathFormModal } from "../components/ToolpathFormModal.tsx"
import { ToolpathProgramDetails } from "../components/ToolpathProgramDetails.tsx"
import {
  CANCEL_BUTTON, DANGER_BUTTON, INPUT, LABEL, PANEL, StageError, StageLoading, SUBMIT_BUTTON, TOOLBAR_BUTTON,
  TOOLBAR_PRIMARY, WorkspaceDetail, WorkspaceTabs, type WorkspaceTabItem
} from "../../../shared/components/WorkspacePage.tsx"

type Tab = "details" | "gcode" | "versions" | "comments"
const TABS: ReadonlyArray<WorkspaceTabItem<Tab>> = [
  { id: "details", label: "Details" }, { id: "gcode", label: "G-code" }, { id: "versions", label: "Versions" }, { id: "comments", label: "Comments" }
]

interface VersionRow {
  readonly id: string
  readonly changeMessage: string | null
  readonly createdAt: string
  readonly user: { readonly name: string | null; readonly email: string | null } | null
}
interface CommentRow {
  readonly id: string
  readonly content: string
  readonly userId: string
  readonly createdAt: string
  readonly user: { readonly name: string | null; readonly image: string | null } | null
}

interface Draft {
  readonly name: string
  readonly description: string
  readonly type: string
  readonly operationType: string
  readonly isPublic: boolean
  readonly gcode: string
}

const draftOf = (row: ToolpathRow): Draft => ({
  name: row.name,
  description: row.description ?? "",
  type: row.type ?? "mill",
  operationType: row.operationType ?? "contour",
  isPublic: row.isPublic,
  gcode: row.gcode ?? ""
})

export function ToolpathDetailScreen(): JSX.Element {
  const app = useApp()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [urlParams] = useSearchParams()
  const run = app.runtime.run as <A>(effect: unknown) => Promise<A>
  const me = useRead((client) => client.user.profile())

  const [row, setRow] = createSignal<ToolpathRow>()
  const [drawing, setDrawing] = createSignal<unknown>()
  let drawingController: AbortController | undefined
  onCleanup(() => drawingController?.abort())
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal<Draft>()
  const [tab, setTab] = createSignal<Tab>("details")
  const [versions, setVersions] = createSignal<ReadonlyArray<VersionRow>>([])
  const [comments, setComments] = createSignal<ReadonlyArray<CommentRow>>([])
  const [commentText, setCommentText] = createSignal("")
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const [restoring, setRestoring] = createSignal<string>()
  const [projects, setProjects] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [formOpen, setFormOpen] = createSignal(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const found = await run<ToolpathRow>(app.client.toolpaths.get({ params: { id: params.id } }))
      setRow(found)
      setDrawing(undefined)
      drawingController?.abort()
      drawingController = new AbortController()
      const controller = drawingController
      if (found.drawingId) void app.runtime.run(app.client.drawings.get({ params: { id: found.drawingId } }), { signal: controller.signal }).then((value) => { if (!controller.signal.aborted && row()?.id === found.id) setDrawing(value.data) }, () => undefined)
      if (!editing()) setDraft(draftOf(found))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  const loadVersions = async (): Promise<void> => {
    try {
      setVersions(await run<ReadonlyArray<VersionRow>>(app.client.toolpathExtras.listVersions({ params: { id: params.id } })))
    } catch {
      toast.error("Failed to load version history")
    }
  }

  const loadComments = async (): Promise<void> => {
    try {
      setComments(await run<ReadonlyArray<CommentRow>>(app.client.toolpathExtras.listComments({ params: { id: params.id } })))
    } catch {
      toast.error("Failed to load comments")
      setComments([])
    }
  }

  onMount(() => {
    void load()
    void run<ReadonlyArray<{ id: string; name: string }>>(app.client.projects.list())
      .then((list) => setProjects(list.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]))
  })

  // `?download=true` comes from the list's "Download G-code" action: download once the toolpath has loaded.
  let downloaded = false
  createEffect(on(row, (current) => {
    if (current === undefined || downloaded || urlParams.download !== "true") return
    downloaded = true
    downloadGcode()
  }))

  createEffect(on(tab, (next) => {
    if (next === "versions" && versions().length === 0) void loadVersions()
    if (next === "comments" && comments().length === 0) void loadComments()
  }, { defer: true }))

  const startEdit = (): void => { const current = row(); if (current) { setDraft(draftOf(current)); setEditing(true); setTab("details") } }
  const cancelEdit = (): void => { const current = row(); if (current) setDraft(draftOf(current)); setEditing(false) }
  const patch = (next: Partial<Draft>): void => { const current = draft(); if (current) setDraft({ ...current, ...next }) }

  const save = async (): Promise<void> => {
    const current = row()
    const value = draft()
    if (!current || !value) return
    setBusy(true)
    try {
      const updated = await run<ToolpathRow>(app.client.toolpaths.update({
        params: { id: current.id },
        payload: { name: value.name, description: value.description === "" ? null : value.description, type: value.type, operationType: value.operationType, isPublic: value.isPublic, gcode: value.gcode }
      }))
      // A saved revision is also recorded in the version history, as the legacy page did.
      await run(app.client.toolpathExtras.createVersion({
        params: { id: current.id },
        payload: { data: updated.data ?? {}, gcode: updated.gcode ?? "", changeMessage: `Manual save on ${new Date().toLocaleDateString()}` }
      }))
      setRow(updated)
      setEditing(false)
      setDraft(draftOf(updated))
      toast.success("Toolpath saved successfully")
      invalidatePrefix(app.cache, "toolpaths")
      if (tab() === "versions") void loadVersions()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to save toolpath")
    } finally {
      setBusy(false)
    }
  }

  const deleteToolpath = async (): Promise<void> => {
    const current = row()
    if (!current) return
    setBusy(true)
    try {
      await run(app.client.toolpaths.remove({ params: { id: current.id } }))
      toast.success("Toolpath deleted successfully")
      invalidatePrefix(app.cache, "toolpaths")
      navigate("/toolpaths")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to delete toolpath")
      setBusy(false)
    }
  }

  const restore = async (versionId: string): Promise<void> => {
    const current = row()
    if (!current) return
    setRestoring(versionId)
    try {
      const updated = await run<ToolpathRow>(app.client.toolpathExtras.restoreVersion({ params: { id: current.id }, payload: { versionId } }))
      setRow(updated)
      setDraft(draftOf(updated))
      toast.success("Version restored successfully")
      await loadVersions()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to restore version")
    } finally {
      setRestoring(undefined)
    }
  }

  const addComment = async (event: Event): Promise<void> => {
    event.preventDefault()
    const current = row()
    const text = commentText().trim()
    if (!current || text === "") return
    try {
      await run(app.client.toolpathExtras.createComment({ params: { id: current.id }, payload: { content: text } }))
      setCommentText("")
      toast.success("Comment added successfully")
      await loadComments()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to add comment")
    }
  }

  const removeComment = async (commentId: string): Promise<void> => {
    const current = row()
    if (!current) return
    try {
      await run(app.client.toolpathExtras.removeComment({ params: { id: current.id, commentId } }))
      toast.success("Comment deleted successfully")
      await loadComments()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to delete comment")
    }
  }

  const downloadGcode = (): void => {
    const current = row()
    if (!current || !current.gcode) { toast.error("No G-code available for download"); return }
    const blob = new Blob([current.gcode], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${current.name.replace(/[^a-z0-9]/gi, "_")}.gcode`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const share = (): void => {
    void navigator.clipboard?.writeText(window.location.href)
    toast.success("Link copied to clipboard")
  }

  const typeLabel = (value: string | null | undefined): string => TYPE_LABEL[value ?? "mill"] ?? value ?? "Unknown"
  const operationLabel = (value: string | null | undefined): string => OPERATION_LABEL[value ?? "contour"] ?? value ?? "Unknown"

  return (
    <>
    <WorkspaceDetail
      title={row()?.name ?? "Toolpath"}
      subtitle={row() === undefined ? "Toolpath" : `${typeLabel(row()?.type)} · ${operationLabel(row()?.operationType)}`}
      backHref="/toolpaths"
      backLabel="Back to toolpaths"
      actions={
        <Show when={!editing()} fallback={<>
          <button type="button" class={TOOLBAR_PRIMARY} onClick={() => void save()} disabled={busy()}><Save size={14} aria-hidden="true" />Save</button>
          <button type="button" class={TOOLBAR_BUTTON} onClick={cancelEdit} disabled={busy()}>Cancel</button>
        </>}>
          <button type="button" class={TOOLBAR_PRIMARY} onClick={startEdit} disabled={busy() || row() === undefined}><Edit size={14} aria-hidden="true" />Edit</button>
          <button type="button" class={TOOLBAR_BUTTON} onClick={downloadGcode} disabled={busy() || !row()?.gcode}><Download size={14} aria-hidden="true" />G-code</button>
          <button type="button" class={TOOLBAR_BUTTON} onClick={() => row() && handOffToCam(row()!, navigate)} disabled={busy() || row() === undefined}><Cpu size={14} aria-hidden="true" />Use in CAM</button>
          <button type="button" class={TOOLBAR_BUTTON} onClick={() => setFormOpen(true)} disabled={busy() || row() === undefined}>Properties</button>
          <button type="button" class={`${TOOLBAR_BUTTON} !text-red-600 dark:!text-red-400`} onClick={() => setDeleteOpen(true)} disabled={busy() || row() === undefined}><Trash2 size={14} aria-hidden="true" />Delete</button>
        </Show>
      }
    >
          <Show when={!loading()} fallback={<StageLoading label="Loading toolpath..." />}>
            <Show when={error() === undefined} fallback={<StageError message={error() ?? ""} onRetry={() => void load()} />}>
              <Show when={row()}>{(current) => (
                <>
                  <WorkspaceTabs class="mb-3" tabs={TABS} value={tab()} onChange={setTab} label="Toolpath sections" />

                  <Show when={tab() === "details"}>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div class={`${PANEL} md:col-span-2 !p-3`}>
                        <Show when={editing() && draft()} fallback={
                          <div class="space-y-3">
                            <h2 class="text-[13px] font-semibold text-slate-900 dark:text-white">{current().name}</h2>
                            <Show when={current().description} fallback={<p class="text-xs italic text-slate-500 dark:text-slate-400">No description provided</p>}>
                              <p class="whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{current().description}</p>
                            </Show>
                            <div class="grid grid-cols-2 gap-2">
                              <div class="rounded-[5px] border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40"><h3 class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Machine Type</h3><p class="mt-0.5 text-xs font-medium text-slate-900 dark:text-white">{typeLabel(current().type)}</p></div>
                              <div class="rounded-[5px] border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40"><h3 class="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">Operation Type</h3><p class="mt-0.5 text-xs font-medium text-slate-900 dark:text-white">{operationLabel(current().operationType)}</p></div>
                            </div>
                            <ToolpathProgramDetails row={current()} drawing={drawing()} />
                            <Show when={current().data && Object.keys(current().data as object).length > 0}>
                              <div>
                                <h3 class="mb-1.5 text-xs font-semibold text-slate-900 dark:text-white">Toolpath Settings</h3>
                                <div class="max-h-80 overflow-auto rounded-[5px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900"><pre class="font-mono text-[11px] text-slate-800 dark:text-slate-200">{JSON.stringify(current().data, null, 2)}</pre></div>
                              </div>
                            </Show>
                          </div>
                        }>
                          {(value) => (
                            <form class="space-y-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
                              <div>
                                <label for="detail-name" class={LABEL}>Toolpath Name</label>
                                <input id="detail-name" name="name" type="text" required class={INPUT} value={value().name} onInput={(e) => patch({ name: e.currentTarget.value })} />
                              </div>
                              <div>
                                <label for="detail-description" class={LABEL}>Description</label>
                                <textarea id="detail-description" name="description" rows={4} class={INPUT} value={value().description} onInput={(e) => patch({ description: e.currentTarget.value })} />
                              </div>
                              <div class="grid grid-cols-2 gap-3">
                                <div>
                                  <label for="detail-type" class={LABEL}>Machine Type</label>
                                  <select id="detail-type" name="type" class={INPUT} value={value().type} onChange={(e) => patch({ type: e.currentTarget.value })}>
                                    <option value="mill">Mill</option><option value="lathe">Lathe</option><option value="3dprinter">3D Printer</option>
                                  </select>
                                </div>
                                <div>
                                  <label for="detail-operation" class={LABEL}>Operation Type</label>
                                  <select id="detail-operation" name="operationType" class={INPUT} value={value().operationType} onChange={(e) => patch({ operationType: e.currentTarget.value })}>
                                    <Show when={value().operationType === "multi-operation" || value().operationType === "kernel"}><option value={value().operationType}>{operationLabel(value().operationType)}</option></Show>
                                    <Show when={value().type === "mill"}>
                                      <option value="contour">Contour</option><option value="pocket">Pocket</option><option value="drill">Drill</option><option value="engrave">Engrave</option><option value="profile">3D Profile</option><option value="threading">Threading</option>
                                    </Show>
                                    <Show when={value().type === "lathe"}>
                                      <option value="turning">Turning</option><option value="facing">Facing</option><option value="boring">Boring</option><option value="threading">Threading</option><option value="grooving">Grooving</option><option value="parting">Parting</option>
                                    </Show>
                                    <Show when={value().type === "3dprinter"}>
                                      <option value="standard">Standard Print</option><option value="vase">Vase Mode</option><option value="support">Support</option><option value="infill">Infill</option><option value="raft">Raft</option><option value="brim">Brim</option>
                                    </Show>
                                  </select>
                                </div>
                              </div>
                              <div class="flex items-center gap-2">
                                <input id="detail-public" name="isPublic" type="checkbox" class="h-3.5 w-3.5 border-slate-300 accent-blue-600 dark:border-slate-600" checked={value().isPublic} onChange={(e) => patch({ isPublic: e.currentTarget.checked })} />
                                <label for="detail-public" class="text-xs text-slate-700 dark:text-slate-300">Make toolpath public (visible to all users)</label>
                              </div>
                            </form>
                          )}
                        </Show>
                      </div>

                      <aside class={`${PANEL} !p-3`}>
                        <h3 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">Toolpath Information</h3>
                        <dl class="panel-kv">
                          <dt>Created</dt><dd>{formatDate(current().createdAt) || "-"}</dd>
                          <dt>Last Updated</dt><dd>{formatDate(current().updatedAt) || "-"}</dd>
                          <dt>ID</dt><dd class="font-mono">{current().id.substring(0, 8)}…</dd>
                          <dt>Visibility</dt><dd class={current().isPublic ? "text-green-700 dark:text-green-400" : ""}>{current().isPublic ? "Public" : "Private"}</dd>
                          <dt>G-code Size</dt><dd>{current().gcode ? `${Math.ceil(current().gcode!.length / 1024)} KB` : "No G-code"}</dd>
                        </dl>
                        <div class="mt-3 grid gap-1.5">
                          <button type="button" class={`${TOOLBAR_BUTTON} w-full justify-center`} onClick={downloadGcode} disabled={!current().gcode}><Download size={14} aria-hidden="true" />Download G-code</button>
                          <button type="button" class={`${TOOLBAR_BUTTON} w-full justify-center`} onClick={() => handOffToCam(current(), navigate)}><Cpu size={14} aria-hidden="true" />Use in CAM</button>
                          <button type="button" class={`${TOOLBAR_BUTTON} w-full justify-center`} onClick={share}><Share2 size={14} aria-hidden="true" />Share Toolpath</button>
                        </div>
                      </aside>
                    </div>
                  </Show>

                  <Show when={tab() === "gcode"}>
                    <div class={`${PANEL} !p-3`}>
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <h3 class="text-[13px] font-semibold text-slate-900 dark:text-white">G-code</h3>
                        <button type="button" class={TOOLBAR_BUTTON} onClick={downloadGcode} disabled={!current().gcode}><Download size={14} aria-hidden="true" />Download</button>
                      </div>
                      <Show when={editing()} fallback={
                        <div class="h-[60vh] overflow-auto rounded-[5px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                          <Show when={current().gcode} fallback={<div class="flex h-full items-center justify-center"><p class="text-xs text-slate-500 dark:text-slate-400">No G-code available</p></div>}>
                            <pre class="whitespace-pre p-3 font-mono text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">{current().gcode}</pre>
                          </Show>
                        </div>
                      }>
                        <textarea class={`${INPUT} h-[60vh] font-mono`} placeholder="; Enter G-code here" value={draft()?.gcode ?? ""} onInput={(e) => patch({ gcode: e.currentTarget.value })} />
                      </Show>
                    </div>
                  </Show>

                  <Show when={tab() === "versions"}>
                    <div class={`${PANEL} !p-3`}>
                      <h3 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">Version History</h3>
                      <Show when={versions().length > 0} fallback={
                        <div class="py-8 text-center"><Layers size={24} class="mx-auto mb-2 text-slate-400 dark:text-slate-600" aria-hidden="true" /><p class="text-xs text-slate-500 dark:text-slate-400">No version history available</p></div>
                      }>
                        <div class="space-y-2">
                          <For each={versions()}>{(version) => (
                            <div class="rounded-[5px] border border-slate-200 p-2.5 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
                              <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                  <div class="mb-1 flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400"><Calendar size={12} aria-hidden="true" />{new Date(version.createdAt).toLocaleString()}</div>
                                  <div class="text-xs font-medium text-slate-900 dark:text-white">{version.changeMessage || "No description"}</div>
                                </div>
                                <button type="button" class={TOOLBAR_BUTTON} disabled={restoring() !== undefined} onClick={() => void restore(version.id)}>Restore</button>
                              </div>
                              <div class="mt-1.5 text-[10.5px] text-slate-500 dark:text-slate-400">Created by {version.user?.name || "Unknown user"}</div>
                            </div>
                          )}</For>
                        </div>
                      </Show>
                    </div>
                  </Show>

                  <Show when={tab() === "comments"}>
                    <div class={`${PANEL} !p-3`}>
                      <h3 class="mb-2 text-[13px] font-semibold text-slate-900 dark:text-white">Comments</h3>
                      <form class="mb-3" onSubmit={(event) => void addComment(event)}>
                        <textarea class={INPUT} rows={3} placeholder="Add a comment..." required value={commentText()} onInput={(e) => setCommentText(e.currentTarget.value)} />
                        <div class="mt-2 flex justify-end">
                          <button type="submit" class={SUBMIT_BUTTON} disabled={commentText().trim() === ""}>Post Comment</button>
                        </div>
                      </form>
                      <Show when={comments().length > 0} fallback={
                        <div class="py-8 text-center"><MessageCircle size={24} class="mx-auto mb-2 text-slate-400 dark:text-slate-600" aria-hidden="true" /><p class="text-xs text-slate-500 dark:text-slate-400">No comments yet</p></div>
                      }>
                        <div class="space-y-3">
                          <For each={comments()}>{(comment) => (
                            <div class="flex items-start justify-between gap-2 border-b border-slate-200 pb-3 last:border-0 dark:border-slate-700">
                              <div class="flex gap-2">
                                <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                  <Show when={comment.user?.image} fallback={<span>{comment.user?.name?.charAt(0) || "?"}</span>}>
                                    <img src={comment.user?.image ?? ""} alt={comment.user?.name ?? ""} class="h-full w-full object-cover" />
                                  </Show>
                                </div>
                                <div class="min-w-0">
                                  <div class="mb-0.5 flex flex-wrap items-center gap-2"><span class="text-xs font-medium text-slate-900 dark:text-white">{comment.user?.name || "Unknown user"}</span><span class="text-[10px] text-slate-500 dark:text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
                                  <div class="text-xs text-slate-700 dark:text-slate-200">{comment.content}</div>
                                </div>
                              </div>
                              <Show when={me.data()?.id === comment.userId}>
                                <button type="button" class="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" title="Delete comment" onClick={() => void removeComment(comment.id)}><Trash2 size={13} aria-hidden="true" /></button>
                              </Show>
                            </div>
                          )}</For>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </>
              )}</Show>
            </Show>
          </Show>
    </WorkspaceDetail>

      <ToolpathFormModal
        open={formOpen()}
        row={row()}
        projects={projects()}
        defaultProjectId={row()?.projectId ?? ""}
        busy={busy()}
        onClose={() => setFormOpen(false)}
        onSubmit={async (value) => {
          const current = row()
          if (!current) return
          setBusy(true)
          try {
            const updated = await run<ToolpathRow>(app.client.toolpaths.update({ params: { id: current.id }, payload: { ...value, description: value.description } }))
            setRow(updated)
            setDraft(draftOf(updated))
            setFormOpen(false)
            toast.success("Toolpath updated successfully")
            invalidatePrefix(app.cache, "toolpaths")
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Failed to save toolpath")
          } finally {
            setBusy(false)
          }
        }}
      />

      <Modal open={deleteOpen()} title="Delete toolpath" onClose={() => setDeleteOpen(false)}>
        <p class="text-xs text-slate-600 dark:text-slate-300">Are you sure you want to delete this toolpath? This action cannot be undone.</p>
        <div class="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button type="button" class={CANCEL_BUTTON} onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button type="button" class={DANGER_BUTTON} disabled={busy()} onClick={() => void deleteToolpath()}>Delete</button>
        </div>
      </Modal>
    </>
  )
}
