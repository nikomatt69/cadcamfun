/**
 * The multi-operation setup as the desktop builds it (spec 14, RM-02): the element toolpaths of the multi-toolpath panel, in their
 * execution order, become the operations of one `cam.program.Setup`. The sidecar's `camSetup` group plans and generates it; this
 * file only describes the job (a pure function over snapshots, like `job.ts`), it plans nothing.
 */
import { cam } from "@cadcamfun/core"
import type { ElementToolpath } from "./multiToolpath.ts"
import type { CadElement } from "./job.ts"

type Setup = cam.program.Setup
type Operation = cam.program.Operation
type ToolKind = cam.Tool["kind"]

const KINDS: Readonly<Record<string, ToolKind>> = { endmill: "endmill", ballnose: "ballnose", drill: "drill", vbit: "vbit", chamfer: "vbit" }

/** The tool of a toolpath: the library tool when the settings name none is a generic one per type, diameter and flute count. */
export const toolOfToolpath = (toolpath: ElementToolpath): cam.Tool => {
  const s = toolpath.toolpathSettings
  const kind = KINDS[s.toolType] ?? "endmill"
  return {
    id: `${s.toolType}-${s.toolDiameter}-${s.flutes}`,
    name: `${s.toolType} Ø${s.toolDiameter} ${s.flutes}F`,
    kind, diameter: s.toolDiameter, flutes: s.flutes,
    // Tools of the panel carry no spindle limit: the operation's own speed is the limit the user chose.
    maxRpm: Math.max(s.rpm, 24000)
  }
}

export interface SetupChoices {
  readonly name: string
  readonly post: cam.program.PostConfig
  readonly grouping: cam.program.SetupGrouping
  readonly retractBeforeToolChange: boolean
  readonly workOffset: Setup["workOffset"]
}

export const DEFAULT_SETUP_CHOICES: SetupChoices = {
  name: "Setup", post: cam.program.DEFAULT_POST_CONFIG, grouping: "single", retractBeforeToolChange: true, workOffset: "G54"
}

/** The setup of the panel's toolpaths, in execution order. A toolpath that is hidden is not machined. */
export const setupOfToolpaths = (toolpaths: ReadonlyArray<ElementToolpath>, choices: SetupChoices = DEFAULT_SETUP_CHOICES): Setup => ({
  id: "desktop-setup",
  name: choices.name,
  machineType: "mill",
  workOffset: choices.workOffset,
  post: choices.post,
  grouping: choices.grouping,
  retractBeforeToolChange: choices.retractBeforeToolChange,
  operations: [...toolpaths].sort((a, b) => a.order - b.order).map((toolpath): Operation => ({
    id: toolpath.id,
    name: toolpath.elementName,
    elementIds: [toolpath.elementId],
    params: toolpath.toolpathSettings,
    tool: toolOfToolpath(toolpath),
    enabled: toolpath.visible,
    fromPreviousStock: false
  }))
})

/** The elements the setup's operations name, by id, for the generate request. An element no longer in the drawing is left out (the sidecar answers with which). */
export const elementsOfSetup = (setup: Setup, elements: ReadonlyArray<CadElement>): Record<string, CadElement> => {
  const wanted = new Set(setup.operations.flatMap((op) => op.elementIds))
  const out: Record<string, CadElement> = {}
  for (const element of elements) {
    const id = String(element["id"])
    if (wanted.has(id)) out[id] = element
  }
  return out
}

/** The file name of a generated program: the setup's program number and name, safe for a file system. */
export const programFileName = (program: { readonly name: string; readonly programNumber: number }, extension = "nc"): string =>
  `${program.programNumber}-${program.name.replace(/[^A-Za-z0-9._-]+/g, "_")}.${extension}`

/** The choices a saved setup was written with, so loading it puts the panel back as it was saved. */
export const choicesOfSetup = (setup: Setup): SetupChoices => ({
  name: setup.name, post: setup.post, grouping: setup.grouping, retractBeforeToolChange: setup.retractBeforeToolChange, workOffset: setup.workOffset
})

export interface RestoredToolpaths {
  readonly toolpaths: ReadonlyArray<ElementToolpath>
  /** Element ids an operation names that the drawing no longer has: the operation is kept (hidden) and reported, not dropped. */
  readonly missingElementIds: ReadonlyArray<string>
  /** Operations the panel cannot show as one toolpath per element (none, or several elements): reported, not guessed. */
  readonly skippedOperationIds: ReadonlyArray<string>
}

/**
 * The panel's toolpaths of a saved setup (the inverse of `setupOfToolpaths`): one per operation, in the setup's order, with no G-code
 * (a loaded setup is regenerated: text generated for another revision of the drawing is not trusted). A disabled operation, or one
 * whose element is gone, is a hidden toolpath.
 */
export const toolpathsOfSetup = (setup: Setup, elements: ReadonlyArray<CadElement>, colors: ReadonlyArray<string>): RestoredToolpaths => {
  const byId = new Map(elements.map((element) => [String(element["id"]), element]))
  const toolpaths: ElementToolpath[] = []
  const missing: string[] = []
  const skipped: string[] = []
  for (const op of setup.operations) {
    const elementId = op.elementIds.length === 1 ? op.elementIds[0]! : undefined
    if (elementId === undefined) { skipped.push(op.id); continue }
    const element = byId.get(elementId)
    if (element === undefined) missing.push(elementId)
    toolpaths.push({
      id: op.id, elementId, elementType: String(element?.["type"] ?? ""), elementName: op.name,
      toolpathSettings: op.params, gcode: "", color: colors[toolpaths.length % Math.max(1, colors.length)] ?? "#888888",
      visible: op.enabled && element !== undefined, toolpathPoints: [], selected: false, order: toolpaths.length, estimatedTime: 0, distance: 0
    })
  }
  return { toolpaths, missingElementIds: missing, skippedOperationIds: skipped }
}
