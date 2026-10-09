/**
 * The "create" tool panel of the CAD editor: every element tool grouped by category, and the "Add element" form that
 * opens next to the clicked tool. Port of the legacy `ToolPanel`.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { Anchor, Box, Circle, Minus, Square, Triangle } from "lucide-solid"
import { Motion, Presence } from "solid-motionone"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { formDefaults } from "../lib/formDefaults.ts"
import { SvgIcon, type IconName } from "./icons.tsx"

interface ToolDefinition { readonly name: string; readonly action: string; readonly icon: () => JSX.Element }
interface ToolCategory { readonly name: string; readonly tools: ReadonlyArray<ToolDefinition> }

const svg = (name: IconName) => () => <SvgIcon name={name} />
const feather = (Icon: typeof Box) => () => <Icon size={16} />

export const CATEGORIZED_TOOLS: ReadonlyArray<ToolCategory> = [
  { name: "Basic Primitives", tools: [
    { name: "Cube", icon: feather(Box), action: "cube" }, { name: "Sphere", icon: feather(Circle), action: "sphere" },
    { name: "Cylinder", icon: svg("cylinder"), action: "cylinder" }, { name: "Cone", icon: feather(Triangle), action: "cone" },
    { name: "Torus", icon: svg("torus"), action: "torus" }] },
  { name: "Advanced Primitives", tools: [
    { name: "Pyramid", icon: svg("pyramid"), action: "pyramid" }, { name: "Prism", icon: svg("prism"), action: "prism" },
    { name: "Hemisphere", icon: svg("hemisphere"), action: "hemisphere" }, { name: "Ellipsoid", icon: svg("ellipsoid"), action: "ellipsoid" },
    { name: "Capsule", icon: svg("capsule"), action: "capsule" }] },
  { name: "2D Elements", tools: [
    { name: "Circle", icon: feather(Circle), action: "circle" }, { name: "Rectangle", icon: feather(Square), action: "rectangle" },
    { name: "Triangle", icon: feather(Triangle), action: "triangle" }, { name: "Polygon", icon: svg("polygon"), action: "polygon" },
    { name: "Ellipse", icon: svg("ellipse"), action: "ellipse" }, { name: "Arc", icon: svg("arc"), action: "arc" }] },
  { name: "Curves", tools: [
    { name: "Line", icon: feather(Minus), action: "line" }, { name: "Spline", icon: svg("spline"), action: "spline" },
    { name: "Bezier", icon: svg("bezier"), action: "bezier" }, { name: "NURBS", icon: svg("spline"), action: "nurbs" }] },
  { name: "Boolean Operations", tools: [
    { name: "Union", icon: svg("boolUnion"), action: "boolean-union" }, { name: "Subtract", icon: svg("boolSubtract"), action: "boolean-subtract" },
    { name: "Intersect", icon: svg("boolIntersect"), action: "boolean-intersect" }] },
  { name: "Transformation Operations", tools: [
    { name: "Extrude", icon: svg("extrude"), action: "extrusion" }, { name: "Revolve", icon: svg("revolution"), action: "revolution" },
    { name: "Sweep", icon: svg("sweep"), action: "sweep" }, { name: "Loft", icon: svg("loft"), action: "loft" },
    { name: "Parametric", icon: svg("extrude"), action: "parametric" }] },
  { name: "Industrial Elements", tools: [
    { name: "Thread", icon: svg("thread"), action: "thread" }, { name: "Chamfer", icon: svg("chamfer"), action: "chamfer" },
    { name: "Fillet", icon: svg("fillet"), action: "fillet" }, { name: "Gear", icon: svg("gear"), action: "gear" },
    { name: "Spring", icon: svg("spring"), action: "spring" }] },
  { name: "Assembly Elements", tools: [
    { name: "Screw", icon: svg("screw"), action: "screw" }, { name: "Nut", icon: svg("nut"), action: "nut" },
    { name: "Bolt", icon: feather(Anchor), action: "bolt" }, { name: "Washer", icon: svg("washer"), action: "washer" },
    { name: "Rivet", icon: svg("rivet"), action: "rivet" }] },
  { name: "Dimensions", tools: [
    { name: "Linear D.", icon: svg("linearDimension"), action: "linear-dimension" }, { name: "Angular D.", icon: svg("angularDimension"), action: "angular-dimension" },
    { name: "Radius D.", icon: svg("radiusDimension"), action: "radius-dimension" }, { name: "Diameter D.", icon: svg("diameterDimension"), action: "diameter-dimension" }] },
  { name: "Drawing Tools", tools: [
    { name: "Pen", icon: svg("pen"), action: "drawing-pen" }, { name: "Highlighter", icon: svg("highlighter"), action: "drawing-highlighter" },
    { name: "Text", icon: svg("text"), action: "drawing-text" }, { name: "Eraser", icon: svg("eraser"), action: "drawing-eraser" },
    { name: "Screenshot", icon: svg("screenshot"), action: "drawing-screenshot-area" }] },
  { name: "Architectural Elements", tools: [
    { name: "Wall", icon: svg("wall"), action: "wall" }, { name: "Floor", icon: svg("floor"), action: "floor" },
    { name: "Roof", icon: svg("roof"), action: "roof" }, { name: "Window", icon: svg("window"), action: "window" },
    { name: "Door", icon: svg("door"), action: "door" }, { name: "Stair", icon: svg("stair"), action: "stair" },
    { name: "Column", icon: svg("column"), action: "column" }] },
  { name: "Special Elements", tools: [
    { name: "Text 3D", icon: svg("text3d"), action: "text3d" }, { name: "Path 3D", icon: svg("path3d"), action: "path3d" },
    { name: "Points", icon: svg("pointCloud"), action: "point-cloud" }, { name: "Mesh", icon: svg("mesh"), action: "mesh" },
    { name: "Group", icon: svg("group"), action: "group" }] }
]

// Spelled out so Tailwind sees every class.
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }
const INPUT = "w-full px-2 py-1 border border-gray-300 rounded-md text-sm"

interface ElementFormProps {
  readonly type: string
  readonly formPosition: { x: number; y: number } | null
  onAdd(element: Record<string, unknown>): void
  onCancel(): void
}

/** The numeric fields of the types that have a dedicated form; every other type shows position and a note. */
const FIELD_ROWS: Record<string, ReadonlyArray<ReadonlyArray<readonly [name: string, label: string]>>> = {
  line: [[["x1", "X1"], ["y1", "Y1"], ["z1", "Z1"]], [["x2", "X2"], ["y2", "Y2"], ["z2", "Z2"]]],
  circle: [[["radius", "Radius"]]], sphere: [[["radius", "Radius"]]],
  rectangle: [[["width", "Width"], ["height", "Height"]]],
  cube: [[["width", "Width"], ["height", "Height"], ["depth", "Depth"]]],
  cylinder: [[["radius", "Radius"], ["height", "Height"]]], cone: [[["radius", "Radius"], ["height", "Height"]]],
  torus: [[["radius", "Radius"], ["tube", "Tube"]]]
}
const WIREFRAME = new Set(["sphere", "cube", "cylinder", "cone", "torus"])

export function ElementForm(props: ElementFormProps): JSX.Element {
  const [data, setData] = createSignal<Record<string, any>>(formDefaults(props.type))
  const change = (name: string, kind: "number" | "text" | "checkbox", target: HTMLInputElement) =>
    setData({ ...data(), [name]: kind === "checkbox" ? target.checked : kind === "number" ? parseFloat(target.value) : target.value })

  const numberInput = (name: string, label: string) => (
    <div>
      <label class="block text-xs text-gray-500">{label}</label>
      <input type="number" name={name} value={data()[name] ?? 0} onInput={(e) => change(name, "number", e.currentTarget)} class={INPUT} />
    </div>
  )
  const positionFields = () => (
    <div class="grid grid-cols-3 z-50 gap-2">{numberInput("x", "X")}{numberInput("y", "Y")}{numberInput("z", "Z")}</div>
  )
  const wireframeOption = () => (
    <div class="mt-2">
      <label class="flex items-center text-xs text-gray-500">
        <input type="checkbox" name="wireframe" checked={data()["wireframe"] === true} onChange={(e) => change("wireframe", "checkbox", e.currentTarget)} class="mr-2" />
        Wireframe
      </label>
    </div>
  )
  const fields = () => {
    const rows = FIELD_ROWS[props.type]
    if (!rows) {
      return <>
        {positionFields()}
        <div class="mt-3">
          <p class="text-xs text-gray-500 mb-2">This element type ({props.type}) has additional properties available in advanced mode.</p>
          <Show when={props.type === "parametric"}>
            <p class="text-xs text-gray-500 mb-2">Starts as a plate with a hole. Select it afterwards to edit its parameters (width, depth, thick, hole) and features in the property panel.</p>
          </Show>
          <Show when={props.type.includes("boolean")}>
            <div class="text-xs text-gray-500 mb-2">
              <p>To use boolean operations:</p>
              <ol class="list-decimal list-inside"><li>Create and position objects</li><li>Select the objects to be combined</li><li>Apply the boolean operation</li></ol>
            </div>
          </Show>
        </div>
        <Show when={data()["wireframe"] !== undefined}>{wireframeOption()}</Show>
      </>
    }
    const positioned = props.type !== "line"
    return <>
      <Show when={positioned}>{positionFields()}</Show>
      <For each={rows}>{(row, index) =>
        <div class={`grid ${COLS[row.length]} gap-2 ${index() > 0 || positioned ? "mt-2" : ""}`}>
          <For each={row}>{([name, label]) => numberInput(name, label)}</For>
        </div>}</For>
      <Show when={WIREFRAME.has(props.type)}>{wireframeOption()}</Show>
    </>
  }
  const submit = (event: SubmitEvent) => { event.preventDefault(); props.onAdd({ ...data(), type: props.type }) }

  const content = (
    <Motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      class="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-xl overflow-y-auto rounded-md p-4 w-[320px] max-h-[480px] border border-gray-200 dark:border-gray-600"
      style={{
        ...(props.formPosition ? { position: "fixed", top: `${props.formPosition.y}px`, left: `${props.formPosition.x}px`, "z-index": "2147483647", isolation: "isolate" } : {}),
        "scrollbar-width": "thin", "scrollbar-color": "rgba(155, 155, 155, 0.5) transparent"
      }}
    >
      <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Add {props.type.charAt(0).toUpperCase() + props.type.slice(1)}</h4>
      <form onSubmit={submit}>
        {fields()}
        <div class="mt-3">
          <label class="block text-xs text-gray-500">Color</label>
          <input type="color" name="color" value={data()["color"] ?? "#1e88e5"} onInput={(e) => change("color", "text", e.currentTarget)} class="w-full h-8" />
        </div>
        <Show when={props.type === "line" || props.type === "circle" || props.type === "rectangle"}>
          <div class="mt-2">
            <label class="block text-xs text-gray-500">Line Width</label>
            <input type="number" name="linewidth" value={data()["linewidth"] ?? 1} min={1} max={10} onInput={(e) => change("linewidth", "number", e.currentTarget)} class={INPUT} />
          </div>
        </Show>
        <div class="mt-4 flex justify-end space-x-2">
          <button type="button" onClick={props.onCancel} class="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
          <button type="submit" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Add Element</button>
        </div>
      </form>
    </Motion.div>
  )
  // Rendered in a portal so it sits above every panel.
  return props.formPosition ? <Portal>{content}</Portal> : content
}

/** Where the form opens: next to the cursor, kept fully inside the viewport. */
export const formPositionFor = (clientX: number, clientY: number, viewport = { width: window.innerWidth, height: window.innerHeight }) => {
  const formWidth = 320, formHeight = 500, margin = 20
  let x = clientX + 15
  let y = clientY + 15
  if (x + formWidth + margin > viewport.width) { x = clientX - formWidth - 15; if (x < margin) x = viewport.width - formWidth - margin }
  if (x < margin) x = margin
  if (y + formHeight + margin > viewport.height) { y = clientY - formHeight - 15; if (y < margin) y = viewport.height - formHeight - margin }
  if (y < margin) y = margin
  return { x: Math.max(margin, Math.min(x, viewport.width - formWidth - margin)), y: Math.max(margin, Math.min(y, viewport.height - formHeight - margin)) }
}

export default function ToolPanel(): JSX.Element {
  const [selectedTool, setSelectedTool] = createSignal<string | null>(null)
  const [formPosition, setFormPosition] = createSignal<{ x: number; y: number } | null>(null)
  const elements = useElementsStore()
  const layers = useLayerStore()
  const activeLayerInfo = createMemo(() => layers.layers.find((layer) => layer.id === layers.activeLayer))

  const close = () => { setSelectedTool(null); setFormPosition(null) }
  const click = (action: string, event: MouseEvent) => {
    if (selectedTool() === action) return close()
    setSelectedTool(action)
    setFormPosition(formPositionFor(event.clientX, event.clientY))
  }

  return (
    <div class="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 max-h-[calc(100vh-300px)] overflow-y-auto">
      <Show when={!activeLayerInfo()}>
        <div class="bg-yellow-50 dark:bg-yellow-700 dark:text-yellow-100 text-yellow-800 p-3 rounded-md mb-3 text-xs">Please select a layer first to add elements.</div>
      </Show>
      <div class="space-y-3">
        <For each={CATEGORIZED_TOOLS}>{(category) =>
          <div>
            <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider">{category.name}</h4>
            <div class="grid grid-cols-4 gap-1">
              <For each={category.tools}>{(tool) =>
                <Motion.button
                  hover={{ scale: 1.05 }} press={{ scale: 0.95 }}
                  onClick={(e: MouseEvent) => click(tool.action, e)}
                  class={`p-1 rounded-md flex flex-col items-center justify-center text-xs aspect-square ${
                    selectedTool() === tool.action
                      ? "bg-blue-500 text-white"
                      : "bg-[#EFF3F7] dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                  } ${!activeLayerInfo() ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!activeLayerInfo()}
                  title={tool.name}
                >
                  <div class="mb-0.5">{tool.icon()}</div>
                  <span class="text-[10px] truncate w-full text-center">{tool.name}</span>
                </Motion.button>}</For>
            </div>
          </div>}</For>
      </div>
      <Presence>
        <Show when={selectedTool() && activeLayerInfo() && formPosition()}>
          <ElementForm type={selectedTool()!} formPosition={formPosition()} onCancel={close}
            onAdd={(element) => { elements.addElement(element); close() }} />
        </Show>
      </Presence>
    </div>
  )
}
