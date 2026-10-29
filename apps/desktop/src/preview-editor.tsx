import { render } from "solid-js/web"
import { createSignal } from "solid-js"
import GCodeEditor from "./features/cam/components/GCodeEditor.tsx"
import { setLocale } from "./i18n/index.ts"
import "./styles/globals.css"
import "./styles/ui.css"
import "./styles/panel.css"

const params = new URLSearchParams(location.search)
if (params.has("dark")) document.documentElement.classList.add("dark")
const body = Array.from({ length: 120 }, (_, i) => `N${100 + i} G1 X${(i * 1.25).toFixed(3)} Y-${(i * 0.5).toFixed(3)} Z-1.5 F${300 + i} (pass ${i}) ; a long trailing comment that makes this line much wider than the editor viewport to test horizontal scroll`)
const sample = ["%", "O1000 (PREVIEW)", "G21 G90 G54", "T1 M6", "S12000 M3", "G0 X0 Y0 Z5", ...body, "M5", "M30", "%"].join("\n")
await setLocale("en")
const [code, setCode] = createSignal(sample)
render(() => <div class="h-full"><GCodeEditor value={code()} onChange={setCode} onProcess={() => undefined} /></div>, document.getElementById("root")!)
const area = await new Promise<HTMLTextAreaElement>((ok) => { const f = () => { const a = document.querySelector("textarea"); a ? ok(a) : requestAnimationFrame(f) }; f() })
if (params.has("scroll")) { area.focus(); area.setSelectionRange(1500, 1500); area.scrollTop = 400; area.scrollLeft = 120; area.dispatchEvent(new Event("keyup")) }
else { area.focus(); area.setSelectionRange(40, 40); area.dispatchEvent(new Event("keyup")) }
document.title = "ready"
