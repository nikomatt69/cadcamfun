import { For, Show, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Save, Users, X } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { saveCADAsProject } from "../lib/saveCADAsProject.ts"

interface Props { readonly isOpen: boolean; onClose(): void; readonly organizations?: ReadonlyArray<{ id: string; name: string }> }

const FIELD = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"

/** "Save as Project": names the project, picks an organization, and stores the drawing in it. */
export default function SaveCADAsProjectModal(props: Props): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [organizationId, setOrganizationId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    if (!name().trim()) { setError("Project name is required"); setSubmitting(false); return }
    try {
      const result = await saveCADAsProject(app, { name: name(), description: description(), organizationId: organizationId() || undefined, isPublic: isPublic() })
      setSubmitting(false)
      props.onClose()
      navigate(`/projects/${result.projectId}`)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Failed to save project")
      setSubmitting(false)
    }
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-gray-600/50 dark:bg-black/60 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Save as Project</h3>
            <button onClick={props.onClose} class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors" aria-label="Close"><X size={20} /></button>
          </div>
          <form onSubmit={submit}>
            <div class="px-6 py-4">
              <Show when={error()}>
                <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-md p-3 mb-4" role="alert"><div class="text-sm text-red-700 dark:text-red-300">{error()}</div></div>
              </Show>
              <div class="mb-4">
                <label for="projectName" class={LABEL}>Project Name <span class="text-red-500 dark:text-red-400">*</span></label>
                <input type="text" id="projectName" value={name()} onInput={(e) => setName(e.currentTarget.value)} class={FIELD} placeholder="Enter a name for your project" required />
              </div>
              <div class="mb-4">
                <label for="description" class={LABEL}>Description</label>
                <textarea id="description" rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} class={FIELD} placeholder="Describe your project..." />
              </div>
              <Show when={(props.organizations?.length ?? 0) > 0}>
                <div class="mb-4">
                  <label for="organization" class={LABEL}>Organization</label>
                  <div class="relative rounded-md shadow-sm">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Users size={18} class="text-gray-400 dark:text-gray-500" /></div>
                    <select id="organization" value={organizationId()} onChange={(e) => setOrganizationId(e.currentTarget.value)} class={`${FIELD} pl-10`}>
                      <option value="">Personal Project</option>
                      <For each={props.organizations}>{(org) => <option value={org.id}>{org.name}</option>}</For>
                    </select>
                  </div>
                </div>
              </Show>
              <div class="flex items-start">
                <div class="flex items-center h-5">
                  <input id="public" name="public" type="checkbox" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} class="focus:ring-blue-500 dark:focus:ring-blue-400 h-4 w-4 text-blue-600 dark:text-blue-500 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded" />
                </div>
                <div class="ml-3 text-sm">
                  <label for="public" class="font-medium text-gray-700 dark:text-gray-300">Public Project</label>
                  <p class="text-gray-500 dark:text-gray-400">If enabled, the project will be visible to all users.</p>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3 rounded-b-lg">
              <button type="button" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors" onClick={props.onClose}>Cancel</button>
              <button type="submit" disabled={submitting()} class="px-4 py-2 bg-blue-600 dark:bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <Show when={submitting()} fallback={<span class="flex items-center"><Save size={18} class="mr-1.5" />Save as Project</span>}>
                  <span class="flex items-center">
                    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </span>
                </Show>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  )
}
