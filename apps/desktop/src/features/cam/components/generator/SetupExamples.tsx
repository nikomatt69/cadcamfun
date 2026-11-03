/**
 * "Examples" of a section of the generator that is not an operation: workholding, machines, posts, materials, tools, origins,
 * set-ups, advanced settings, the assistant and verification. One disclosure row (28 px) that stays closed until asked; opened it
 * shows ONE example at the size of the panel's other previews (title, a line of what it is, its drawing) and a quiet strip of
 * thumbnails to pick another. Nothing is applied by looking: "Apply" loads the example through the generator store's own actions
 * (`applyExample`), and the row says when the generator already holds what the example would load.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import {
  applyExample, examplesFor, isApplied, typicalCuttingData,
  type ExampleTarget, type SetupArea, type SetupExample
} from "../../lib/examples/setups.ts"
import { SectionExample, SectionScene } from "./SectionExamples.tsx"

export interface SetupExamplesProps {
  readonly area: SetupArea
  /** Runs after an example was loaded: a section that keeps its own derived state (plan notes) resets it here. */
  readonly after?: ((example: SetupExample) => void) | undefined
  /** The raw piece (`stock` examples): what is held now, and how to change it. */
  readonly workpiece?: { readonly x: number; readonly y: number; readonly z: number } | undefined
  readonly onWorkpiece?: ((workpiece: { readonly x: number; readonly y: number; readonly z: number }) => void) | undefined
}

export function SetupExamples(props: SetupExamplesProps): JSX.Element {
  const gen = useGeneratorStore()
  const [open, setOpen] = createSignal(false)
  const [picked, setPicked] = createSignal<string>()
  const list = createMemo(() => examplesFor(props.area, gen.settings.machineType))
  const target: ExampleTarget = {
    settings: () => gen.settings,
    kernelSettings: () => gen.kernelSettings,
    printer: () => gen.printer,
    patchSettings: (patch) => gen.patchSettings(patch),
    patchKernelSettings: (patch) => gen.patchKernelSettings(patch),
    setPrinter: (patch) => gen.setPrinter(patch),
    setWorkpiece: (workpiece) => props.onWorkpiece?.(workpiece)
  }
  const applied = (example: SetupExample): boolean => isApplied(example, target, props.workpiece)
  /** The one shown: the picked one, else the one the generator already holds, else the first. */
  const current = createMemo<SetupExample | undefined>(() => list().find((example) => example.id === picked()) ?? list().find(applied) ?? list()[0])
  const detail = (example: SetupExample): string | undefined => {
    const grade = example.patch.cuttingData === true ? example.patch.kernel?.material : undefined
    const data = grade === undefined ? undefined : typicalCuttingData(grade)
    return data === undefined ? undefined : `${data.rpm} rpm · F${data.feed}`
  }
  const apply = (example: SetupExample): void => {
    applyExample(example, target)
    props.after?.(example)
    gen.flash(t("cam.example.setup.loaded", { name: t(example.title) }))
  }
  return (
    <Show when={list().length > 0}>
      <div class="setup-examples" data-testid={`setup-examples-${props.area}`} data-open={open() ? "true" : "false"}>
        <button
          type="button" class="setup-examples__toggle" aria-expanded={open()}
          onClick={() => setOpen((value) => !value)} data-testid={`setup-examples-${props.area}-toggle`}
        >
          <Show when={open()} fallback={<ChevronRight size={14} aria-hidden="true" />}><ChevronDown size={14} aria-hidden="true" /></Show>
          <span class="setup-examples__toggle-label">{t("cam.example.setup.title")}</span>
          <span class="setup-examples__count">{list().length}</span>
        </button>
        <Show when={open() ? current() : undefined}>
          {(example) => (
            <div class="setup-examples__body">
              <SectionExample
                {...example().scene}
                title={t(example().title)} chip={example().chip} detail={detail(example())}
                testId={`setup-example-preview-${props.area}`}
              />
              <p class="setup-examples__note" data-testid={`setup-example-note-${props.area}`}>{t(example().description)}</p>
              <div class="setup-examples__thumbs" role="group" aria-label={t("cam.example.setup.title")}>
                <For each={list()}>
                  {(item) => (
                    <button
                      type="button" class="setup-examples__thumb" aria-pressed={item.id === example().id}
                      aria-label={t(item.title)} title={t(item.title)} data-testid={`setup-example-${item.id}`}
                      onClick={() => setPicked(item.id)}
                    >
                      <SectionScene {...item.scene} title={t(item.title)} height={30} />
                      <Show when={applied(item)}><span class="setup-examples__thumb-mark" aria-hidden="true" /></Show>
                    </button>
                  )}
                </For>
              </div>
              <div class="setup-examples__foot">
                <span class="setup-examples__state" data-active={applied(example()) ? "true" : "false"}>
                  {applied(example()) ? t("cam.example.setup.inUse") : t("cam.example.setup.ready")}
                </span>
                <button
                  type="button" class="panel-btn panel-btn--primary" disabled={applied(example())}
                  onClick={() => apply(example())} data-testid="setup-example-apply"
                >
                  {t("cam.example.setup.apply")}
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}
