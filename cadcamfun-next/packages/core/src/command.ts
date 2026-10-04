import { Effect, Schema } from "effect"
import { CadDocument, Layer, Units } from "./document"
import { Element } from "./element"
import type { Element as ElementT } from "./element"
import { DuplicateId, ElementNotFound, InvalidCommand, LayerLocked, LayerNotFound, type CommandError } from "./errors"
import { ElementId, LayerId } from "./ids"
import * as T from "./transform"

const LayerPatch = Schema.Struct({
  name: Schema.optional(Schema.String),
  visible: Schema.optional(Schema.Boolean),
  locked: Schema.optional(Schema.Boolean),
  color: Schema.optional(Schema.String),
})

export const AddElements = Schema.TaggedStruct("AddElements", { elements: Schema.Array(Element) })
export const ReplaceElement = Schema.TaggedStruct("ReplaceElement", { element: Element })
export const RemoveElements = Schema.TaggedStruct("RemoveElements", { ids: Schema.Array(ElementId) })
export const TransformElements = Schema.TaggedStruct("TransformElements", {
  ids: Schema.Array(ElementId),
  transform: T.Transform,
})
export const MoveToLayer = Schema.TaggedStruct("MoveToLayer", { ids: Schema.Array(ElementId), layerId: LayerId })
export const AddLayer = Schema.TaggedStruct("AddLayer", { layer: Layer })
export const UpdateLayer = Schema.TaggedStruct("UpdateLayer", { id: LayerId, patch: LayerPatch })
export const RemoveLayer = Schema.TaggedStruct("RemoveLayer", { id: LayerId })
export const SetActiveLayer = Schema.TaggedStruct("SetActiveLayer", { id: LayerId })
export const SetDocumentProps = Schema.TaggedStruct("SetDocumentProps", {
  name: Schema.optional(Schema.String),
  units: Schema.optional(Units),
})

const leafCommands = [
  AddElements,
  ReplaceElement,
  RemoveElements,
  TransformElements,
  MoveToLayer,
  AddLayer,
  UpdateLayer,
  RemoveLayer,
  SetActiveLayer,
  SetDocumentProps,
] as const

export const LeafCommand = Schema.Union(leafCommands)
export type LeafCommand = typeof LeafCommand.Type

/** An atomic group of commands: all apply, or none do. */
export const Batch = Schema.TaggedStruct("Batch", { commands: Schema.Array(LeafCommand) })

/** Every edit to a `CadDocument` is a serialisable command: replayable, syncable, AI-callable. */
export const Command = Schema.Union([...leafCommands, Batch])
export type Command = typeof Command.Type

export const decodeCommand = Schema.decodeUnknownEffect(Command)

const requireLayer = (doc: CadDocument, id: string): Effect.Effect<Layer, LayerNotFound> => {
  const layer = doc.layers.find((l) => l.id === id)
  return layer ? Effect.succeed(layer) : Effect.fail(new LayerNotFound({ id }))
}

const requireUnlocked = Effect.fnUntraced(function* (
  doc: CadDocument,
  layerId: string,
): Effect.fn.Return<Layer, LayerNotFound | LayerLocked> {
  const layer = yield* requireLayer(doc, layerId)
  if (layer.locked) return yield* new LayerLocked({ id: layer.id })
  return layer
})

const requireElements = Effect.fnUntraced(function* (
  doc: CadDocument,
  ids: ReadonlyArray<string>,
): Effect.fn.Return<ReadonlyArray<ElementT>, ElementNotFound | LayerNotFound | LayerLocked> {
  const found: Array<ElementT> = []
  for (const id of new Set(ids)) {
    const element = doc.elements.find((e) => e.id === id)
    if (!element) return yield* new ElementNotFound({ id })
    yield* requireUnlocked(doc, element.layerId)
    found.push(element)
  }
  return found
})

const applyLeaf = Effect.fnUntraced(function* (
  doc: CadDocument,
  cmd: LeafCommand,
): Effect.fn.Return<CadDocument, CommandError> {
  switch (cmd._tag) {
    case "AddElements": {
      const ids = new Set(doc.elements.map((e) => e.id))
      for (const e of cmd.elements) {
        if (ids.has(e.id)) return yield* new DuplicateId({ id: e.id })
        ids.add(e.id)
        yield* requireUnlocked(doc, e.layerId)
      }
      return { ...doc, elements: [...doc.elements, ...cmd.elements] }
    }
    case "ReplaceElement": {
      const [current] = yield* requireElements(doc, [cmd.element.id])
      yield* requireUnlocked(doc, cmd.element.layerId)
      return { ...doc, elements: doc.elements.map((e) => (e === current ? cmd.element : e)) }
    }
    case "RemoveElements": {
      yield* requireElements(doc, cmd.ids)
      const ids = new Set<string>(cmd.ids)
      return { ...doc, elements: doc.elements.filter((e) => !ids.has(e.id)) }
    }
    case "TransformElements": {
      yield* requireElements(doc, cmd.ids)
      const ids = new Set<string>(cmd.ids)
      return { ...doc, elements: doc.elements.map((e) => (ids.has(e.id) ? T.apply(e, cmd.transform) : e)) }
    }
    case "MoveToLayer": {
      yield* requireElements(doc, cmd.ids)
      yield* requireUnlocked(doc, cmd.layerId)
      const ids = new Set<string>(cmd.ids)
      return { ...doc, elements: doc.elements.map((e) => (ids.has(e.id) ? { ...e, layerId: cmd.layerId } : e)) }
    }
    case "AddLayer": {
      if (doc.layers.some((l) => l.id === cmd.layer.id)) return yield* new DuplicateId({ id: cmd.layer.id })
      return { ...doc, layers: [...doc.layers, cmd.layer] }
    }
    case "UpdateLayer": {
      yield* requireLayer(doc, cmd.id)
      const patch = Object.fromEntries(Object.entries(cmd.patch).filter(([, v]) => v !== undefined))
      return { ...doc, layers: doc.layers.map((l) => (l.id === cmd.id ? { ...l, ...patch } : l)) }
    }
    case "RemoveLayer": {
      yield* requireLayer(doc, cmd.id)
      if (doc.layers.length === 1) return yield* new InvalidCommand({ reason: "Cannot remove the last layer" })
      const layers = doc.layers.filter((l) => l.id !== cmd.id)
      return {
        ...doc,
        layers,
        elements: doc.elements.filter((e) => e.layerId !== cmd.id),
        activeLayerId: doc.activeLayerId === cmd.id ? layers[0]!.id : doc.activeLayerId,
      }
    }
    case "SetActiveLayer": {
      yield* requireLayer(doc, cmd.id)
      return { ...doc, activeLayerId: cmd.id }
    }
    case "SetDocumentProps":
      return { ...doc, name: cmd.name ?? doc.name, units: cmd.units ?? doc.units }
  }
})

/** Apply a command to a document. Pure: returns a new document or a typed error, never mutates. */
export const apply = Effect.fnUntraced(function* (
  doc: CadDocument,
  cmd: Command,
): Effect.fn.Return<CadDocument, CommandError> {
  if (cmd._tag === "Batch") {
    let next = doc
    for (const c of cmd.commands) next = yield* applyLeaf(next, c)
    return { ...next, revision: doc.revision + 1 }
  }
  const next = yield* applyLeaf(doc, cmd)
  return { ...next, revision: doc.revision + 1 }
})

export const addElements = (elements: ReadonlyArray<Element>): Command => ({ _tag: "AddElements", elements })
export const removeElements = (ids: ReadonlyArray<ElementId>): Command => ({ _tag: "RemoveElements", ids })
export const transformElements = (ids: ReadonlyArray<ElementId>, transform: T.Transform): Command => ({
  _tag: "TransformElements",
  ids,
  transform,
})
export const batch = (commands: ReadonlyArray<LeafCommand>): Command => ({ _tag: "Batch", commands })
