/**
 * Files the user attaches to a chat message.
 *
 *   image (png, jpeg, webp, gif)  -> a file part the model looks at (a drawing, a photo, a sketch)
 *   pdf                           -> a file part too (a dimensioned drawing as a document); a model that cannot read PDFs gets
 *                                    the transform's explicit "cannot read" notice instead of a failed request
 *   text (dxf, svg, csv, gcode, ...) -> kept by name for the tools (`cad_import_drawing` reads a DXF/SVG attachment) and, when
 *                                       short, shown to the model in the message itself
 *   anything else                    -> refused with a reason (never silently dropped)
 *
 * The store is per project and in memory: attachments belong to the conversation, not to the data.
 */
import { Schema } from "effect"

export const MAX_ATTACHMENTS = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_TEXT_CHARS = 2_000_000
/** Text files up to this size are also written into the message, so the model reads them without a tool call. */
export const INLINE_TEXT_CHARS = 6_000

export const AttachmentSchema = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  mime: Schema.optional(Schema.String),
  /** Base64 for an image, the file's text otherwise. */
  data: Schema.String,
  encoding: Schema.optional(Schema.Literals(["base64", "text"]))
})
export type Attachment = typeof AttachmentSchema.Type

export interface FilePart {
  readonly type: "file"
  readonly mime: string
  readonly filename: string
  /** `data:` URL. */
  readonly url: string
}

export interface PreparedAttachments {
  /** Text appended to the user's message. */
  readonly note: string
  readonly parts: ReadonlyArray<FilePart>
  /** Names kept for the tools. */
  readonly stored: ReadonlyArray<string>
  readonly rejected: ReadonlyArray<{ readonly name: string; readonly reason: string }>
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])
const TEXT_EXTENSIONS = new Set(["dxf", "svg", "step", "stp", "csv", "txt", "nc", "gcode", "ngc", "tap", "json", "md", "xml", "obj", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "c", "h", "cpp", "hpp", "cs", "java", "swift", "kt", "sh", "yaml", "yml", "toml", "sql"])

const extensionOf = (name: string): string => name.slice(name.lastIndexOf(".") + 1).toLowerCase()

export const kindOf = (attachment: Pick<Attachment, "name" | "mime">): "image" | "pdf" | "text" | "unsupported" => {
  if (attachment.mime !== undefined && IMAGE_MIMES.has(attachment.mime)) return "image"
  if (attachment.mime === "application/pdf" || extensionOf(attachment.name) === "pdf") return "pdf"
  const ext = extensionOf(attachment.name)
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "gif") return "image"
  if (TEXT_EXTENSIONS.has(ext) || (attachment.mime ?? "").startsWith("text/")) return "text"
  return "unsupported"
}

const mimeOfImage = (attachment: Attachment): string => {
  if (attachment.mime !== undefined && IMAGE_MIMES.has(attachment.mime)) return attachment.mime
  const ext = extensionOf(attachment.name)
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`
}

const bytesOf = (base64: string): number => Math.floor((base64.length * 3) / 4)

const store = new Map<string, Map<string, string>>()

export const putAttachment = (projectId: string, name: string, text: string): boolean => {
  const files = store.get(projectId) ?? new Map<string, string>()
  if (text.length > MAX_TEXT_CHARS || (!store.has(projectId) && store.size >= 64) || (!files.has(name) && files.size >= 32)) return false
  const projectChars = [...files.values()].reduce((sum, value) => sum + value.length, 0) - (files.get(name)?.length ?? 0) + text.length
  const totalChars = [...store.values()].reduce((sum, entries) => sum + [...entries.values()].reduce((size, value) => size + value.length, 0), 0) - (files.get(name)?.length ?? 0) + text.length
  if (projectChars > 8_000_000 || totalChars > 32_000_000) return false
  files.set(name, text)
  store.set(projectId, files)
  return true
}

/** A text attachment of this project by name (case-insensitive), most recent upload wins. */
export const getAttachment = (projectId: string, name: string): string | undefined => {
  const files = store.get(projectId)
  if (files === undefined) return undefined
  const exact = files.get(name)
  if (exact !== undefined) return exact
  const lower = name.toLowerCase()
  for (const [key, value] of files) if (key.toLowerCase() === lower) return value
  return undefined
}

export const attachmentNames = (projectId: string): ReadonlyArray<string> => [...(store.get(projectId)?.keys() ?? [])]

export const clearAttachments = (projectId?: string): void => {
  if (projectId === undefined) store.clear()
  else store.delete(projectId)
}

/** Sorts the attachments of one message into what the model sees and what the tools can read. */
export const prepareAttachments = (projectId: string, attachments: ReadonlyArray<Attachment> | undefined): PreparedAttachments => {
  const parts: FilePart[] = []
  const stored: string[] = []
  const rejected: Array<{ name: string; reason: string }> = []
  const lines: string[] = []
  for (const [index, attachment] of (attachments ?? []).entries()) {
    const name = attachment.name.replace(/[\r\n]/g, " ")
    if (index >= MAX_ATTACHMENTS) {
      rejected.push({ name, reason: `at most ${MAX_ATTACHMENTS} files per message` })
      continue
    }
    const kind = kindOf(attachment)
    if (kind === "image") {
      if (bytesOf(attachment.data) > MAX_IMAGE_BYTES) {
        rejected.push({ name, reason: `image larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB` })
        continue
      }
      const mime = mimeOfImage(attachment)
      parts.push({ type: "file", mime, filename: name, url: `data:${mime};base64,${attachment.data}` })
      lines.push(`- ${name}: image (attached below). Read the dimensions, shapes and notes in it; for a dimensioned drawing build the part with cad_add_elements from the numbers you read.`)
    } else if (kind === "pdf") {
      if (bytesOf(attachment.data) > MAX_PDF_BYTES) {
        rejected.push({ name, reason: `PDF larger than ${MAX_PDF_BYTES / 1024 / 1024} MB` })
        continue
      }
      parts.push({ type: "file", mime: "application/pdf", filename: name, url: `data:application/pdf;base64,${attachment.data}` })
      lines.push(`- ${name}: PDF document (attached below). Read the dimensions, views and notes in it; for a dimensioned drawing build the part with cad_add_elements from the numbers you read.`)
    } else if (kind === "text") {
      if (attachment.data.length > MAX_TEXT_CHARS) {
        rejected.push({ name, reason: `text longer than ${MAX_TEXT_CHARS} characters` })
        continue
      }
      if (!putAttachment(projectId, name, attachment.data)) {
        rejected.push({ name, reason: "Conversation attachment storage limit reached. Remove older attachments before uploading more." })
        continue
      }
      stored.push(name)
      const ext = extensionOf(name)
      const hint = name.endsWith(".mesh.json")
        ? `parsed mesh; use cad_import_drawing with format mesh and attachment "${name}"; specify source-unit scale to mm`
        : ext === "dxf" || ext === "svg" || ext === "step" || ext === "stp"
        ? `use cad_import_drawing with attachment "${name}" (and a depth for DXF/SVG) to build it in 3D`
        : "kept for the tools"
      if (attachment.data.length <= INLINE_TEXT_CHARS && ext !== "dxf" && ext !== "svg" && ext !== "step" && ext !== "stp") {
        lines.push(`- ${name}: text, ${attachment.data.length} characters (${hint}). Content:\n\`\`\`\n${attachment.data}\n\`\`\``)
      } else {
        lines.push(`- ${name}: text, ${attachment.data.length} characters (${hint}).`)
      }
    } else {
      rejected.push({ name, reason: "unsupported file type (images, PDF, DXF, SVG, G-code and text files are read)" })
    }
  }
  for (const r of rejected) lines.push(`- ${r.name}: NOT read - ${r.reason}.`)
  return {
    note: lines.length > 0 ? `\n\nAttached files:\n${lines.join("\n")}` : "",
    parts,
    stored,
    rejected
  }
}
