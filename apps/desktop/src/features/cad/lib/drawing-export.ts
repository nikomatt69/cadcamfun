/** Single-page drawing export. Browser rasterisation preserves the same Unicode symbols as the SVG preview. */
import type { drawing } from "@cadcamfun/core"

/** ISO 32000 image XObject adapter: one RGB JPEG on a page with a physical size in millimetres. */
export const jpegSheetPdf = (jpeg: Uint8Array, pixels: { width: number; height: number }, mm: { width: number; height: number }): Uint8Array<ArrayBuffer> => {
  if (![pixels.width, pixels.height, mm.width, mm.height].every((n) => Number.isFinite(n) && n > 0) || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new RangeError("Invalid PDF image or page size")
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets = [0]
  let bytes = 0
  const append = (part: string | Uint8Array) => { const data = typeof part === "string" ? enc.encode(part) : part; parts.push(data); bytes += data.length }
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = bytes
    append(`${id} 0 obj\n${body}`)
    if (stream !== undefined) { append("\nstream\n"); append(stream); append("\nendstream") }
    append("\nendobj\n")
  }
  const w = (mm.width * 72 / 25.4).toFixed(5), h = (mm.height * 72 / 25.4).toFixed(5)
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Sheet 5 0 R >> >> /Contents 4 0 R >>`)
  const content = enc.encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Sheet Do\nQ\n`)
  object(4, `<< /Length ${content.length} >>`, content)
  object(5, `<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  const xref = bytes
  append("xref\n0 6\n0000000000 65535 f \n")
  for (let id = 1; id <= 5; id++) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const result = new Uint8Array(bytes)
  let at = 0
  for (const part of parts) { result.set(part, at); at += part.length }
  return result
}

export const drawingPdf = async (sheet: drawing.DrawingSheet): Promise<Uint8Array<ArrayBuffer>> => {
  const url = URL.createObjectURL(new Blob([sheet.svg], { type: "image/svg+xml" }))
  try {
    await document.fonts.ready
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(sheet.size.width / 25.4 * 300)
    canvas.height = Math.ceil(sheet.size.height / 25.4 * 300)
    const context = canvas.getContext("2d")
    if (context === null) throw new Error("Drawing rasterisation is unavailable")
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob === null ? reject(new Error("PDF image encoding failed")) : resolve(blob), "image/jpeg", 0.98))
    return jpegSheetPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas, sheet.size)
  } finally { URL.revokeObjectURL(url) }
}

export const downloadDrawing = (body: BlobPart, mime: string, name: string): void => {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = name
  document.body.append(anchor); anchor.click(); anchor.remove()
  // Webviews may start consuming a download after the event handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
