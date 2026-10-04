import { Schema } from "effect"
import * as E from "./element"
import * as G from "./geometry"
import { DocumentId, LayerId, newDocumentId, newElementId, newLayerId } from "./ids"

export const Units = Schema.Literals(["mm", "inch"])
export type Units = typeof Units.Type

export const Layer = Schema.Struct({
  id: LayerId,
  name: Schema.String,
  visible: Schema.Boolean,
  locked: Schema.Boolean,
  color: Schema.String,
})
export type Layer = typeof Layer.Type

/** A CAD document: plain, serialisable, immutable data. All edits go through `Command`s. */
export const CadDocument = Schema.Struct({
  id: DocumentId,
  name: Schema.String,
  units: Units,
  layers: Schema.Array(Layer),
  activeLayerId: LayerId,
  elements: Schema.Array(E.Element),
  /** Incremented on every applied command; cheap change detection for sync and caching. */
  revision: Schema.Int,
})
export type CadDocument = typeof CadDocument.Type

export const decodeDocument = Schema.decodeUnknownEffect(CadDocument)
export const encodeDocument = Schema.encodeEffect(CadDocument)

export const makeLayer = (name: string, color = "#4f9dff"): Layer => ({
  id: newLayerId(),
  name,
  visible: true,
  locked: false,
  color,
})

export const empty = (name = "Untitled", units: Units = "mm"): CadDocument => {
  const layer = makeLayer("Layer 1")
  return { id: newDocumentId(), name, units, layers: [layer], activeLayerId: layer.id, elements: [], revision: 0 }
}

export const findElement = (doc: CadDocument, id: string): E.Element | undefined =>
  doc.elements.find((e) => e.id === id)

export const findLayer = (doc: CadDocument, id: string): Layer | undefined => doc.layers.find((l) => l.id === id)

export const visibleElements = (doc: CadDocument): ReadonlyArray<E.Element> => {
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id))
  return doc.elements.filter((e) => visible.has(e.layerId))
}

export const bounds = (doc: CadDocument, elements = doc.elements): G.Bounds | undefined =>
  elements.reduce<G.Bounds | undefined>((acc, e) => G.unionBounds(acc, E.boundsOf(e)), undefined)

export type ElementInput = E.ElementInput

/** Give an element input a fresh id, on the given layer or the document's active layer. */
export const instantiate = (doc: CadDocument, input: ElementInput): E.Element =>
  ({ ...input, id: newElementId(), layerId: input.layerId ?? doc.activeLayerId }) as E.Element
