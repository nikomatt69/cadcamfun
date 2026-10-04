import { Schema } from "effect"

export const ElementId = Schema.String.pipe(Schema.brand("ElementId"))
export type ElementId = typeof ElementId.Type

export const LayerId = Schema.String.pipe(Schema.brand("LayerId"))
export type LayerId = typeof LayerId.Type

export const DocumentId = Schema.String.pipe(Schema.brand("DocumentId"))
export type DocumentId = typeof DocumentId.Type

const uuid = (): string => globalThis.crypto.randomUUID()

export const newElementId = (): ElementId => ElementId.make(uuid())
export const newLayerId = (): LayerId => LayerId.make(uuid())
export const newDocumentId = (): DocumentId => DocumentId.make(uuid())
