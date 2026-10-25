/**
 * The title block of a drawing (ISO 7200 "Data fields in title blocks and document headers"): the information that identifies the
 * document and says what it is for. One model serves every place the block appears: the form dialog that edits it, the block drawn
 * at the bottom right of the 2D and 3D views of the CAD and CAM workspaces, the drawing sheet the exporters write, the server that
 * stores it with the drawing (`data.titleBlock`) and the assistant that reads and sets it.
 *
 * The fields are described once (`TITLE_BLOCK_FIELDS`): the form is built from the list, the server validates against it, and the
 * labels of every surface come from the field keys. A stored block that is missing, partial or damaged is completed from what the
 * drawing already knows (`completeTitleBlock`), so there is always a block to show and a sheet to write.
 */
import { Schema } from "effect"
import type { SheetOptions } from "./sheet.ts"

export const DOCUMENT_TYPES = ["part", "assembly", "cam-setup", "cam-program", "sketch"] as const
export const DOCUMENT_STATUSES = ["draft", "in-review", "released", "obsolete"] as const
export const TOLERANCE_STANDARDS = ["ISO 2768-1 f", "ISO 2768-1 m", "ISO 2768-1 c", "ISO 2768-1 v", "ISO 2768-mK", "ISO 2768-mH", "ISO 2768-fH", "ISO 286-1", "ASME Y14.5", "DIN 7168 m", "None"] as const

const Short = Schema.String.check(Schema.isMaxLength(120))
const Text = Schema.String.check(Schema.isMaxLength(200))

/** The stored block: every field optional, so a block written by an older version or half filled in still reads. */
export const TitleBlockSchema = Schema.Struct({
  /** Identification */
  title: Schema.optionalKey(Text),
  number: Schema.optionalKey(Short),
  revision: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8))),
  documentType: Schema.optionalKey(Schema.Literals(DOCUMENT_TYPES)),
  status: Schema.optionalKey(Schema.Literals(DOCUMENT_STATUSES)),
  /** Date of issue, `YYYY-MM-DD`. */
  date: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  /** `n/m`: this sheet of the sheets of the document. */
  sheet: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{1,3}\/\d{1,3}$/))),
  /** Who */
  owner: Schema.optionalKey(Short),
  createdBy: Schema.optionalKey(Short),
  checkedBy: Schema.optionalKey(Short),
  approvedBy: Schema.optionalKey(Short),
  /** The part */
  material: Schema.optionalKey(Short),
  colour: Schema.optionalKey(Short),
  finish: Schema.optionalKey(Short),
  /** General tolerances and the drawing standard. */
  standard: Schema.optionalKey(Schema.Literals(TOLERANCE_STANDARDS)),
  /** Mass of the part, kg. */
  mass: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  /** How the views are drawn. `scale` is `auto` (the largest standard scale that fits) or a ratio `n:m`. */
  scale: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^(auto|\d{1,3}(\.\d+)?:\d{1,3}(\.\d+)?)$/i))),
  projection: Schema.optionalKey(Schema.Literals(["first", "third"])),
  units: Schema.optionalKey(Schema.Literals(["mm", "in"])),
  /** The CAM side of the document: the machine and controller the program is for, its number and the setup it belongs to. */
  machine: Schema.optionalKey(Short),
  program: Schema.optionalKey(Short),
  setup: Schema.optionalKey(Short)
})

export type TitleBlock = typeof TitleBlockSchema.Type
export type TitleBlockKey = keyof TitleBlock

/** A block with every field present: what the screens and the sheet draw. */
export type CompleteTitleBlock = { readonly [K in TitleBlockKey]-?: NonNullable<TitleBlock[K]> }

export type TitleBlockFieldKind = "text" | "date" | "select" | "number"
export type TitleBlockGroup = "document" | "people" | "part" | "views" | "cam"

export interface TitleBlockField {
  readonly key: TitleBlockKey
  readonly group: TitleBlockGroup
  readonly kind: TitleBlockFieldKind
  readonly options?: ReadonlyArray<string>
  /** What a valid value looks like, for the fields that are not a choice. */
  readonly format?: string
  /** Whether a drawing is incomplete without it (the form marks it, `titleBlockIssues` reports it). */
  readonly required?: boolean
  /** Shown on CAM documents only (and on the form of one); every other field belongs to both. */
  readonly cam?: boolean
}

/** The fields in the order of the form and of the block. */
export const TITLE_BLOCK_FIELDS: ReadonlyArray<TitleBlockField> = [
  { key: "title", group: "document", kind: "text", required: true },
  { key: "number", group: "document", kind: "text", required: true },
  { key: "revision", group: "document", kind: "text", format: "up to 8 characters", required: true },
  { key: "documentType", group: "document", kind: "select", options: DOCUMENT_TYPES },
  { key: "status", group: "document", kind: "select", options: DOCUMENT_STATUSES },
  { key: "date", group: "document", kind: "date", format: "YYYY-MM-DD", required: true },
  { key: "sheet", group: "document", kind: "text", format: "n/m, as 1/1" },
  { key: "owner", group: "people", kind: "text" },
  { key: "createdBy", group: "people", kind: "text", required: true },
  { key: "checkedBy", group: "people", kind: "text" },
  { key: "approvedBy", group: "people", kind: "text" },
  { key: "material", group: "part", kind: "text" },
  { key: "colour", group: "part", kind: "text" },
  { key: "finish", group: "part", kind: "text" },
  { key: "standard", group: "part", kind: "select", options: TOLERANCE_STANDARDS },
  { key: "mass", group: "part", kind: "number", format: "kilograms, zero or more" },
  { key: "scale", group: "views", kind: "text", format: "auto, or a ratio such as 1:2 or 2:1" },
  { key: "projection", group: "views", kind: "select", options: ["first", "third"] },
  { key: "units", group: "views", kind: "select", options: ["mm", "in"] },
  { key: "machine", group: "cam", kind: "text", cam: true },
  { key: "program", group: "cam", kind: "text", cam: true },
  { key: "setup", group: "cam", kind: "text", cam: true }
]

/** What the drawing already knows about itself, to fill the fields nobody has written yet. */
export interface TitleBlockContext {
  /** The drawing's name. */
  readonly name?: string
  readonly projectName?: string
  /** The person working on it, and the organisation they work for. */
  readonly author?: string
  readonly organization?: string
  /** Today, `YYYY-MM-DD` (given, so the same call always gives the same block). */
  readonly today?: string
  /** The raw piece's material and the finished part's mass, kg. */
  readonly material?: string
  readonly mass?: number
  /** The machine the CAM side is set up for. */
  readonly machine?: string
  /** What the document is: a CAM document says so, a CAD one is a part until it holds an assembly. */
  readonly documentType?: (typeof DOCUMENT_TYPES)[number]
}

const slug = (text: string): string => text.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24)

/** The block of a drawing nobody has described yet: every field has a value a drawing office would accept as a start. */
export const defaultTitleBlock = (context: TitleBlockContext = {}): CompleteTitleBlock => ({
  title: context.name ?? context.projectName ?? "Untitled",
  number: slug(context.name ?? context.projectName ?? "") === "" ? "DWG-001" : `${slug(context.name ?? context.projectName ?? "")}-001`,
  revision: "A",
  documentType: context.documentType ?? "part",
  status: "draft",
  date: context.today ?? new Date().toISOString().slice(0, 10),
  sheet: "1/1",
  owner: context.organization ?? "",
  createdBy: context.author ?? "",
  checkedBy: "",
  approvedBy: "",
  material: context.material ?? "",
  colour: "",
  finish: "As-machined",
  standard: "ISO 2768-1 m",
  mass: context.mass ?? 0,
  scale: "auto",
  projection: "first",
  units: "mm",
  machine: context.machine ?? "",
  program: "",
  setup: ""
})

/** The stored fields that are valid, one by one: a damaged field is dropped, the others are kept. */
export const validTitleBlockFields = (stored: unknown): TitleBlock => {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return {}
  const out: Record<string, unknown> = {}
  for (const field of TITLE_BLOCK_FIELDS) {
    const value = (stored as Record<string, unknown>)[field.key]
    if (value === undefined) continue
    try {
      Schema.decodeUnknownSync(Schema.Struct({ [field.key]: TitleBlockSchema.fields[field.key] }))({ [field.key]: value })
      out[field.key] = value
    } catch {
      // A field that does not decode is dropped; the rest of the block is kept.
    }
  }
  return out as TitleBlock
}

/** A stored block (any state) over the defaults the context gives: always complete, never throws. */
export const completeTitleBlock = (stored: unknown, context: TitleBlockContext = {}): CompleteTitleBlock => ({ ...defaultTitleBlock(context), ...validTitleBlockFields(stored) })

/** Why a stored block is not acceptable (the server's check): the fields that are present and invalid, by key. */
export const titleBlockErrors = (stored: unknown): ReadonlyArray<{ readonly key: string; readonly message: string }> => {
  if (stored === undefined) return []
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return [{ key: "titleBlock", message: "The title block must be an object" }]
  const keys = new Set<string>(TITLE_BLOCK_FIELDS.map((f) => f.key))
  const errors: Array<{ key: string; message: string }> = []
  for (const key of Object.keys(stored)) if (!keys.has(key)) errors.push({ key, message: `'${key}' is not a title block field` })
  const valid = validTitleBlockFields(stored)
  for (const field of TITLE_BLOCK_FIELDS) {
    const value = (stored as Record<string, unknown>)[field.key]
    if (value !== undefined && !(field.key in valid)) errors.push({ key: field.key, message: `'${field.key}' is not valid${field.options !== undefined ? ` (one of ${field.options.join(", ")})` : field.format !== undefined ? ` (${field.format})` : ""}` })
  }
  return errors
}

/** What a complete drawing still lacks (a finding, not an error: the block is shown and the sheet is written either way). */
export const titleBlockIssues = (block: CompleteTitleBlock): ReadonlyArray<{ readonly key: TitleBlockKey; readonly message: string }> =>
  TITLE_BLOCK_FIELDS.filter((f) => f.required === true && String(block[f.key]).trim() === "").map((f) => ({ key: f.key, message: `The title block has no ${f.key}` }))

/** The fields that make up the block of a document, in order: the CAM fields appear on a CAM document or when they hold something. */
export const titleBlockFieldsFor = (block: CompleteTitleBlock): ReadonlyArray<TitleBlockField> =>
  TITLE_BLOCK_FIELDS.filter((f) => f.cam !== true || block.documentType === "cam-setup" || block.documentType === "cam-program" || String(block[f.key]).trim() !== "")

/** A field as the block prints it. */
export const titleBlockText = (block: CompleteTitleBlock, key: TitleBlockKey): string => {
  const value = block[key]
  if (key === "mass") return typeof value === "number" && value > 0 ? `${value < 10 ? value.toFixed(3) : value.toFixed(1)} kg` : ""
  if (key === "scale") return String(value).toLowerCase() === "auto" ? "AUTO" : String(value)
  if (key === "projection") return value === "first" ? "1st angle" : "3rd angle"
  return String(value)
}

/** The scale of a block as the factor the sheet takes (`2:1` is 2, `1:2` is 0.5), or undefined for `auto`. */
export const scaleFactorOf = (scale: string): number | undefined => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(scale)
  if (m === null) return undefined
  const factor = Number(m[1]) / Number(m[2])
  return Number.isFinite(factor) && factor > 0 ? factor : undefined
}

/** The part of the sheet's options the block decides, so a sheet written from the drawing carries the same block the screens show. */
export const sheetOptionsOfTitleBlock = (block: CompleteTitleBlock): Pick<SheetOptions, "title" | "drawingNumber" | "material" | "colour" | "finish" | "standard" | "revision" | "sheet" | "date" | "author" | "projection" | "scale" | "titleBlock"> => ({
  title: block.title,
  drawingNumber: block.number,
  material: block.material === "" ? "N.A." : block.material,
  colour: block.colour === "" ? "N.A." : block.colour,
  finish: block.finish,
  standard: block.standard,
  revision: block.revision,
  sheet: block.sheet,
  date: block.date,
  author: block.createdBy,
  projection: block.projection,
  ...(scaleFactorOf(block.scale) !== undefined ? { scale: scaleFactorOf(block.scale)! } : {}),
  titleBlock: block
})
