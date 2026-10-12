/**
 * The "Post-Processor" tab (legacy `pages/cam.tsx`): the controller select over the seven dialects, and the legacy
 * panel for that controller (Fanuc, Heidenhain, or the generic one for the others) underneath.
 *
 * The panels work on G-code text, like the legacy ones. When the program has toolpaths but no text yet, the
 * text is emitted from the program through the matching core post, so the tab is never empty after a generate.
 */
import { For, createMemo, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import PostProcessorPanel from "./PostProcessorPanel.tsx"

export type PostProcessorType = "fanuc" | "heidenhain" | "siemens" | "haas" | "mazak" | "okuma" | "generic"

export const POST_PROCESSORS: ReadonlyArray<{ readonly id: PostProcessorType; readonly label: string }> = [
  { id: "fanuc", label: "Fanuc" },
  { id: "heidenhain", label: "Heidenhain" },
  { id: "siemens", label: "Siemens" },
  { id: "haas", label: "Haas" },
  { id: "mazak", label: "Mazak" },
  { id: "okuma", label: "Okuma" },
  { id: "generic", label: "Generic" }
]

export interface PostProcessorTabProps {
  readonly gcode: string
  readonly program: cam.Program
  readonly controller: PostProcessorType
  readonly onControllerChange: (next: PostProcessorType) => void
  /** Receives the processed text when the user processes the program (legacy `handleProcessedGcode`). */
  readonly onProcessedGcode: (code: string) => void
}

export default function PostProcessorTab(props: PostProcessorTabProps): JSX.Element {
  const initialGcode = createMemo(() => {
    if (props.gcode) return props.gcode
    if (props.program.toolpaths.length === 0) return ""
    return cam.posts[props.controller === "fanuc" ? "fanuc" : "generic"]?.emit(props.program) ?? ""
  })

  return (
    <div class="h-full rounded-xl overflow-y-auto" data-testid="post-processor-tab">
      <div class="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white border-b p-4 flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">Post-Processor</h2>
        <div class="flex items-center space-x-2">
          <label for="post-processor-type" class="text-sm font-medium text-gray-700 dark:text-gray-300">Controller Type:</label>
          <select
            id="post-processor-type"
            class="ml-2 block w-48 pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={props.controller}
            onChange={(event) => props.onControllerChange(event.currentTarget.value as PostProcessorType)}
          >
            <For each={POST_PROCESSORS}>{(option) => <option value={option.id}>{option.label}</option>}</For>
          </select>
        </div>
      </div>
      <div class="p-4 rounded-b-xl bg-gray-50 dark:bg-gray-900">
        <PostProcessorPanel
          initialGcode={initialGcode()}
          controllerType={props.controller}
          onProcessedGcode={(code) => props.onProcessedGcode(code)}
        />
      </div>
    </div>
  )
}
