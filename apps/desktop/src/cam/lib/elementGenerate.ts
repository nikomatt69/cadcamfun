/**
 * Generates the toolpath of one CAD element through the sidecar's `toolpathGenerator` group.
 *
 * The explorer, the multi-toolpath panel and the generator share it: the job's stock comes from the CAD stores
 * (`stockOf`), the settings are the generator panel's, and the element's own tool / material / parameters are laid
 * over them when it has both picks (`settingsForElement`), as the legacy explorer's "Generate" did.
 */
import { makeToolpathGenerator, type GenerateResponse } from "../api/generator.ts"
import type { AppState } from "../../state/context.ts"
import { requestForElement, settingsForElement, type ElementAssignment, type ToolpathSettings } from "./elementJob.ts"
import { stockOf, type CadElement, type JobSources } from "./job.ts"

export interface ElementGenerateInput {
  readonly element: CadElement
  /** The generator panel's (or the toolpath's own) settings. */
  readonly settings: ToolpathSettings
  readonly sources: JobSources
  /** When set, its tool, material and parameters replace the settings' (both picks are required). */
  readonly assignment?: ElementAssignment
}

export const effectiveSettings = (input: Pick<ElementGenerateInput, "element" | "settings" | "assignment">): ToolpathSettings =>
  input.assignment === undefined ? input.settings : settingsForElement(input.settings, input.element, input.assignment)

export const generateForElement = (app: AppState, input: ElementGenerateInput): Promise<GenerateResponse> =>
  app.runtime.run(makeToolpathGenerator(app.client).generate(requestForElement({
    element: input.element,
    settings: effectiveSettings(input),
    stock: stockOf(input.sources)
  })))
