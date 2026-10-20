import { render } from "solid-js/web"
import { createSignal } from "solid-js"
import { Effect } from "effect"
import { createFakeApi } from "./testing/fake-api.ts"
import { createAppState, AppProvider } from "./shared/state/context.ts"
import LibraryManager from "./features/library/components/LibraryManager.tsx"
import LibraryBrowser from "./features/cad/components/LibraryBrowser.tsx"
import UnifiedLibraryModal from "./features/cad/components/UnifiedLibraryModal.tsx"
import "./styles/globals.css"
import "./styles/ui.css"
import "./features/library/styles/library.css"
import "./styles/misc.css"
import "./styles/professional.css"
import "./styles/glass.css"
const api = createFakeApi()
const state = createAppState({ client: api, runtime: { run: Effect.runPromise } as never })
const [open, setOpen] = createSignal(true)
const [cad, setCad] = createSignal(false)
render(() => <AppProvider state={state}><div style={{ padding: "24px" }}><button onClick={() => setOpen(true)}>Open library</button><button onClick={() => { document.documentElement.classList.toggle("dark") }}>Toggle theme</button><button onClick={() => setCad(!cad())}>Switch CAD / CAM</button></div><UnifiedLibraryModal isOpen={open()} onClose={() => setOpen(false)}>{cad() ? <LibraryBrowser /> : <LibraryManager defaultTab="tools" onSelectTool={() => setOpen(false)} onSaveTool={() => undefined} />}</UnifiedLibraryModal></AppProvider>, document.getElementById("root")!)
