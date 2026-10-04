import { Schema } from "effect"

export class ElementNotFound extends Schema.TaggedError<ElementNotFound>()("ElementNotFound", {
  id: Schema.String,
}) {
  override get message() {
    return `Element not found: ${this.id}`
  }
}

export class LayerNotFound extends Schema.TaggedError<LayerNotFound>()("LayerNotFound", {
  id: Schema.String,
}) {
  override get message() {
    return `Layer not found: ${this.id}`
  }
}

export class LayerLocked extends Schema.TaggedError<LayerLocked>()("LayerLocked", {
  id: Schema.String,
}) {
  override get message() {
    return `Layer is locked: ${this.id}`
  }
}

export class DuplicateId extends Schema.TaggedError<DuplicateId>()("DuplicateId", {
  id: Schema.String,
}) {
  override get message() {
    return `Duplicate id: ${this.id}`
  }
}

export class InvalidCommand extends Schema.TaggedError<InvalidCommand>()("InvalidCommand", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export type CommandError = ElementNotFound | LayerNotFound | LayerLocked | DuplicateId | InvalidCommand
