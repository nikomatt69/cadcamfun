import { toast } from "../../../../shared/ui/toast.tsx"
/**
 * The code panel of the custom element editor (legacy `customElements/JsonEditor.tsx`).
 *
 * Three sections — geometry, material and the parameters as raw JSON — behind one textarea, with
 * the legacy snippet buttons that paste a template at the caret and a help panel describing the
 * scope a script runs in.
 */
import { copyText } from "../../../../shared/lib/clipboard.ts"
import { For, Show, createSignal, type JSX } from "solid-js"
import { Copy, HelpCircle, RotateCcw } from "lucide-solid"
import { t, type Key } from "../../../../i18n/index.ts"
import type { CustomElementDefinition } from "../../types/customElements.ts"

export interface JsonEditorProps {
  readonly definition: CustomElementDefinition
  readonly onChange: (updates: Partial<CustomElementDefinition>) => void
  readonly errors: ReadonlyArray<string>
}

type Section = "geometry" | "material" | "parameters"

const DEFAULT_GEOMETRY = `// Create your custom geometry here
// Available variables: THREE, parameters (user inputs)
// Must return a THREE.BufferGeometry or THREE.Object3D

const geometry = new THREE.BoxGeometry(
  parameters.size || 1,
  parameters.size || 1,
  parameters.size || 1
);

return geometry;`

const DEFAULT_MATERIAL = `// Create custom material
// Available variables: THREE, parameters
// Must return a THREE.Material

return new THREE.MeshStandardMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false
});`

/** Snippets the legacy toolbar pasted into the geometry body, keyed by button label. */
const GEOMETRY_TEMPLATES: Readonly<Record<string, string>> = {
  box: "new THREE.BoxGeometry(parameters.width || 1, parameters.height || 1, parameters.depth || 1)",
  sphere: "new THREE.SphereGeometry(parameters.radius || 1, 32, 32)",
  cylinder: "new THREE.CylinderGeometry(parameters.radius || 1, parameters.radius || 1, parameters.height || 2, 32)",
  cone: "new THREE.ConeGeometry(parameters.radius || 1, parameters.height || 2, 32)",
  torus: "new THREE.TorusGeometry(parameters.radius || 1, parameters.tubeRadius || 0.3, 16, 32)",
  group: `const group = new THREE.Group();

// Create multiple geometries
const geom1 = new THREE.BoxGeometry(1, 1, 1);
const mesh1 = new THREE.Mesh(geom1);
mesh1.position.set(-1, 0, 0);
group.add(mesh1);

const geom2 = new THREE.SphereGeometry(0.5);
const mesh2 = new THREE.Mesh(geom2);
mesh2.position.set(1, 0, 0);
group.add(mesh2);

return group;`,
  extrude: `// Create extruded shape
const shape = new THREE.Shape();

// Define 2D shape
shape.moveTo(0, 0);
shape.lineTo(parameters.width || 1, 0);
shape.lineTo(parameters.width || 1, parameters.height || 1);
shape.lineTo(0, parameters.height || 1);
shape.closePath();

// Extrude settings
const extrudeSettings = {
  depth: parameters.depth || 0.1,
  bevelEnabled: false
};

return new THREE.ExtrudeGeometry(shape, extrudeSettings);`,
  lathe: `// Create lathe geometry (revolution)
const points = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(parameters.radius || 1, 0),
  new THREE.Vector2(parameters.radius || 1, parameters.height || 2),
  new THREE.Vector2(0, parameters.height || 2)
];

return new THREE.LatheGeometry(points, parameters.segments || 32);`,
  tube: `// Create tube from curve
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0)
]);

return new THREE.TubeGeometry(
  curve,
  parameters.tubularSegments || 64,
  parameters.radius || 0.1,
  parameters.radialSegments || 8,
  false
);`,
}

/** Snippets the legacy toolbar pasted into the material body. */
const MATERIAL_TEMPLATES: Readonly<Record<string, string>> = {
  standard: `return new THREE.MeshStandardMaterial({
  color: parameters.color || '#1e88e5',
  metalness: parameters.metalness || 0.5,
  roughness: parameters.roughness || 0.5,
  wireframe: parameters.wireframe || false
});`,
  physical: `return new THREE.MeshPhysicalMaterial({
  color: parameters.color || '#1e88e5',
  metalness: parameters.metalness || 0.5,
  roughness: parameters.roughness || 0.5,
  clearcoat: parameters.clearcoat || 0,
  clearcoatRoughness: parameters.clearcoatRoughness || 0,
  wireframe: parameters.wireframe || false
});`,
  basic: `return new THREE.MeshBasicMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false,
  transparent: parameters.transparent || false,
  opacity: parameters.opacity || 1
});`,
  lambert: `return new THREE.MeshLambertMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false
});`,
}

const TAB = "px-3 py-2 text-sm border-b-2 transition-colors"
const TAB_ACTIVE = "border-blue-600 text-blue-600"
const TAB_IDLE = "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"

const SECTIONS: ReadonlyArray<{ readonly id: Section; readonly labelKey: Key }> = [
  { id: "geometry", labelKey: "cad.customElements.sectionGeometry" },
  { id: "material", labelKey: "cad.customElements.sectionMaterial" },
  { id: "parameters", labelKey: "cad.customElements.sectionParameters" },
]

export default function JsonEditor(props: JsonEditorProps): JSX.Element {
  const [section, setSection] = createSignal<Section>("geometry")
  const [help, setHelp] = createSignal(false)
  let textarea: HTMLTextAreaElement | undefined

  const materialConfig = (): NonNullable<CustomElementDefinition["materialConfig"]> =>
    props.definition.materialConfig ?? { type: "custom", properties: {} }

  const currentCode = (): string => {
    switch (section()) {
      case "geometry": return props.definition.geometryCode
      case "material": return props.definition.materialConfig?.customCode ?? ""
      case "parameters": return JSON.stringify(props.definition.parameters, null, 2)
    }
  }

  const writeCode = (code: string): void => {
    const active = section()
    if (active === "geometry") props.onChange({ geometryCode: code })
    else if (active === "material") props.onChange({ materialConfig: { ...materialConfig(), customCode: code } })
    else props.onChange({ parameters: JSON.parse(code) as CustomElementDefinition["parameters"] })
  }

  /** Pastes a snippet at the caret and restores the caret after it. */
  const insertTemplate = (template: string): void => {
    const element = textarea
    if (!element) return
    const start = element.selectionStart
    const end = element.selectionEnd
    const code = currentCode()
    writeCode(`${code.substring(0, start)}${template}${code.substring(end)}`)
    const caret = start + template.length
    queueMicrotask(() => {
      element.selectionStart = caret
      element.selectionEnd = caret
      element.focus()
    })
  }

  const resetToDefault = (): void => {
    const active = section()
    if (active === "geometry") props.onChange({ geometryCode: DEFAULT_GEOMETRY })
    else if (active === "material") props.onChange({ materialConfig: { ...materialConfig(), type: "custom", customCode: DEFAULT_MATERIAL } })
  }

  const lineCount = (): number => currentCode().split("\n").length

  /** What the help panel lists for the open section. */
  const helpLines = (): ReadonlyArray<string> => {
    if (section() === "geometry") return [
      t("cad.customElements.helpGeometry1"),
      t("cad.customElements.helpGeometry2"),
      t("cad.customElements.helpGeometry3"),
      t("cad.customElements.helpGeometry4"),
    ]
    return [
      t("cad.customElements.helpMaterial1"),
      t("cad.customElements.helpMaterial2"),
      t("cad.customElements.helpMaterial3"),
      t("cad.customElements.helpMaterial4"),
    ]
  }

  return (
    <div class="h-full flex flex-col bg-white dark:bg-gray-800">
      <div class="flex border-b border-gray-200 dark:border-gray-700">
        <For each={SECTIONS}>{(entry) =>
          <button type="button" onClick={() => setSection(entry.id)} class={`${TAB} ${section() === entry.id ? TAB_ACTIVE : TAB_IDLE}`}>
            {t(entry.labelKey)}
          </button>
        }</For>
      </div>

      <div class="p-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <button type="button" onClick={() => void copyText(currentCode()).catch(() => toast.error(t("shell.clipboard.failed")))} class="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title={t("cad.customElements.copy")}>
              <Copy class="w-4 h-4" />
            </button>
            <button type="button" onClick={resetToDefault} class="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title={t("cad.customElements.reset")}>
              <RotateCcw class="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setHelp(!help())} class="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" title={t("cad.customElements.help")}>
              <HelpCircle class="w-4 h-4" />
            </button>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {section() === "geometry"
              ? t("cad.customElements.jsGeometryHint")
              : section() === "material"
                ? t("cad.customElements.jsMaterialHint")
                : t("cad.customElements.jsonParametersHint")}
          </div>
        </div>

        <Show when={section() !== "parameters"}>
          <div class="mt-2">
            <div class="flex flex-wrap gap-1 items-center">
              <span class="text-xs text-gray-600 dark:text-gray-400 mr-2">{t("cad.customElements.templates")}</span>
              <For each={Object.entries(section() === "geometry" ? GEOMETRY_TEMPLATES : MATERIAL_TEMPLATES)}>{([name, template]) =>
                <button type="button" onClick={() => insertTemplate(template)} class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800">
                  {name}
                </button>
              }</For>
            </div>
          </div>
        </Show>

        <Show when={help()}>
          <div class="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <For each={helpLines()}>{(line) => <p>• {line}</p>}</For>
          </div>
        </Show>
      </div>

      <div class="flex-1 relative">
        <textarea
          ref={textarea}
          class={`w-full h-full p-3 pl-14 font-mono text-sm border-none resize-none focus:outline-none ${section() === "parameters" ? "bg-gray-900 text-yellow-400" : "bg-gray-900 text-green-400"}`}
          value={currentCode()}
          spellcheck={false}
          onInput={(event) => {
            const code = event.currentTarget.value
            const active = section()
            if (active === "geometry") props.onChange({ geometryCode: code })
            else if (active === "material") props.onChange({ materialConfig: { ...materialConfig(), customCode: code } })
            else {
              try { props.onChange({ parameters: JSON.parse(code) as CustomElementDefinition["parameters"] }) } catch { /* invalid JSON, keep the last valid parameters */ }
            }
          }}
          placeholder={section() === "geometry" ? DEFAULT_GEOMETRY : section() === "material" ? DEFAULT_MATERIAL : "{}"}
        />
        <div class="absolute left-0 top-0 w-12 h-full bg-gray-800 text-gray-500 text-xs font-mono p-3 text-right pointer-events-none select-none overflow-hidden">
          <For each={Array.from({ length: Math.max(50, lineCount()) }, (_, index) => index + 1)}>{(line) => <div class="leading-5">{line}</div>}</For>
        </div>
      </div>

      <Show when={props.errors.length > 0}>
        <div class="p-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs max-h-20 overflow-y-auto">
          <For each={props.errors}>{(error) => <div>• {error}</div>}</For>
        </div>
      </Show>

      <div class="px-3 py-1 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
        <div class="flex justify-between">
          <span>{section() === "geometry" ? t("cad.customElements.geometryFunction") : section() === "material" ? t("cad.customElements.materialFunction") : t("cad.customElements.parametersConfiguration")}</span>
          <span>{t("cad.customElements.linesAndChars", { lines: lineCount(), chars: currentCode().length })}</span>
        </div>
      </div>
    </div>
  )
}
