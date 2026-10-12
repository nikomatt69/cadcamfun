/**
 * Reading the files a user attaches to a chat message: images and PDFs as base64, everything else as text. The server decides what
 * it can use (`packages/ai/src/attachments.ts`); this only turns a `File` into the payload and refuses what is plainly too big.
 */
import { meshAttachment } from "./mesh-attachment.ts"
import { neutralCadAttachment } from "./cad-file-attachment.ts"

export interface ChatAttachment {
  readonly name: string
  readonly mime?: string
  readonly data: string
  readonly encoding: "base64" | "text"
}

export const MAX_ATTACHMENTS = 5
/** Images and text; a PDF may be larger. */
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.dxf,.svg,.step,.stp,.iges,.igs,.brep,.stl,.obj,.ply,.nc,.gcode,.ngc,.tap,.csv,.txt,.json,.md,.ts,.tsx,.js,.jsx,.py,.rs,.cpp,.h,.yaml,.yml,.toml,.sql"

const isImage = (file: Pick<File, "name" | "type">): boolean =>
  file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)

const isPdf = (file: Pick<File, "name" | "type">): boolean => file.type === "application/pdf" || /\.pdf$/i.test(file.name)

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export type ReadResult = { readonly ok: true; readonly attachment: ChatAttachment } | { readonly ok: false; readonly name: string; readonly reason: string }

export const readAttachment = async (file: File): Promise<ReadResult> => {
  if (file.size > (isPdf(file) ? MAX_FILE_BYTES : MAX_IMAGE_FILE_BYTES)) return { ok: false, name: file.name, reason: `larger than ${(isPdf(file) ? MAX_FILE_BYTES : MAX_IMAGE_FILE_BYTES) / 1024 / 1024} MB` }
  try {
    if (/\.(stl|obj|ply|step|stp|iges|igs|brep)$/i.test(file.name)) {
      const data = /\.(step|stp|iges|igs|brep)$/i.test(file.name) ? await neutralCadAttachment(file) : await meshAttachment(file)
      if (data.length > 2_000_000) return { ok: false, name: file.name, reason: "Converted mesh exceeds the attachment size limit. Simplify the source model." }
      return { ok: true, attachment: { name: `${file.name}.mesh.json`, mime: "application/json", data, encoding: "text" } }
    }
    if (isImage(file) || isPdf(file)) {
      return { ok: true, attachment: { name: file.name, ...(file.type ? { mime: file.type } : {}), data: toBase64(await file.arrayBuffer()), encoding: "base64" } }
    }
    const data = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
    if (data.includes("\u0000")) return { ok: false, name: file.name, reason: "Binary format requires a supported CAD/CAM decoder." }
    return { ok: true, attachment: { name: file.name, ...(file.type ? { mime: file.type } : {}), data, encoding: "text" } }
  } catch (error) {
    return { ok: false, name: file.name, reason: error instanceof Error ? error.message.slice(0, 240) : "could not be read" }
  }
}
