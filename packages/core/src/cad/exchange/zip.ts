/**
 * ZIP reading for the exchange formats (3MF packages from slicers are deflate-compressed): the central directory is read and each
 * entry is stored or inflated by a self-contained RFC 1951 decoder, so core needs no platform module. Writing stays `zipStore`
 * (uncompressed) in `brep/export-mesh.ts`. The CRC-32 of every entry is verified.
 */
export class ZipError extends Error {
  constructor(message: string) { super(message); this.name = "ZipError" }
}

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export const crc32 = (bytes: Uint8Array): number => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// ---------------------------------------------------------------- inflate

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

interface Huffman { readonly counts: Uint16Array; readonly symbols: Uint16Array }

const huffman = (lengths: ArrayLike<number>, n: number): Huffman => {
  const counts = new Uint16Array(16)
  for (let i = 0; i < n; i++) counts[lengths[i]!]!++
  const offsets = new Uint16Array(16)
  for (let i = 1; i < 15; i++) offsets[i + 1] = offsets[i]! + counts[i]!
  const symbols = new Uint16Array(n)
  for (let i = 0; i < n; i++) if (lengths[i] !== 0) symbols[offsets[lengths[i]!]!++] = i
  return { counts, symbols }
}

const FIXED_LIT = (() => { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); return huffman(l, 288) })()
const FIXED_DIST = huffman(new Uint8Array(30).fill(5), 30)

/** Inflates a raw deflate stream. `expected` is the uncompressed size from the directory (the output starts at that size). */
export const inflateRaw = (src: Uint8Array, expected: number): Uint8Array => {
  let out = new Uint8Array(Math.max(expected, 64))
  let outLen = 0
  let pos = 0, bitBuf = 0, bitCnt = 0
  const bits = (n: number): number => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new ZipError("Deflate stream ends early")
      bitBuf |= src[pos++]! << bitCnt
      bitCnt += 8
    }
    const v = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n
    return v
  }
  const decode = (h: Huffman): number => {
    let code = 0, first = 0, index = 0
    for (let len = 1; len <= 15; len++) {
      code |= bits(1)
      const count = h.counts[len]!
      if (code - count < first) return h.symbols[index + (code - first)]!
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new ZipError("Invalid Huffman code in deflate stream")
  }
  const ensure = (extra: number): void => {
    if (outLen + extra <= out.length) return
    const bigger = new Uint8Array(Math.max(out.length * 2, outLen + extra))
    bigger.set(out.subarray(0, outLen))
    out = bigger
  }
  let last = 0
  do {
    last = bits(1)
    const type = bits(2)
    if (type === 0) {
      bitBuf = 0; bitCnt = 0
      if (pos + 4 > src.length) throw new ZipError("Deflate stored block ends early")
      const len = src[pos]! | (src[pos + 1]! << 8)
      pos += 4
      if (pos + len > src.length) throw new ZipError("Deflate stored block ends early")
      ensure(len)
      out.set(src.subarray(pos, pos + len), outLen)
      outLen += len; pos += len
    } else if (type === 1 || type === 2) {
      let lit = FIXED_LIT, dist = FIXED_DIST
      if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4
        const cl = new Uint8Array(19)
        for (let i = 0; i < ncode; i++) cl[CL_ORDER[i]!] = bits(3)
        const clh = huffman(cl, 19)
        const lengths = new Uint8Array(nlen + ndist)
        for (let i = 0; i < nlen + ndist;) {
          const sym = decode(clh)
          if (sym < 16) lengths[i++] = sym
          else {
            let prev = 0, rep: number
            if (sym === 16) { if (i === 0) throw new ZipError("Invalid deflate repeat"); prev = lengths[i - 1]!; rep = 3 + bits(2) }
            else if (sym === 17) rep = 3 + bits(3)
            else rep = 11 + bits(7)
            if (i + rep > nlen + ndist) throw new ZipError("Invalid deflate repeat")
            while (rep--) lengths[i++] = prev
          }
        }
        lit = huffman(lengths.subarray(0, nlen), nlen)
        dist = huffman(lengths.subarray(nlen), ndist)
      }
      for (;;) {
        const sym = decode(lit)
        if (sym < 256) { ensure(1); out[outLen++] = sym } else if (sym === 256) break
        else {
          const s = sym - 257
          if (s >= 29) throw new ZipError("Invalid deflate length symbol")
          const len = LEN_BASE[s]! + bits(LEN_EXTRA[s]!)
          const ds = decode(dist)
          if (ds >= 30) throw new ZipError("Invalid deflate distance symbol")
          const d = DIST_BASE[ds]! + bits(DIST_EXTRA[ds]!)
          if (d > outLen) throw new ZipError("Deflate distance reaches before the start")
          ensure(len)
          for (let k = 0; k < len; k++) { out[outLen] = out[outLen - d]!; outLen++ }
        }
      }
    } else throw new ZipError("Invalid deflate block type")
  } while (last === 0)
  return out.slice(0, outLen)
}

// ---------------------------------------------------------------- reading

export interface ZipEntry { readonly name: string; readonly data: Uint8Array }

/** All entries of a ZIP archive (stored or deflated), CRC-checked. Directories are skipped. */
export const readZip = (bytes: Uint8Array): ZipEntry[] => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break }
  if (end < 0) throw new ZipError("Not a ZIP archive (no end of central directory)")
  const count = dv.getUint16(end + 10, true)
  let at = dv.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const out: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) throw new ZipError("Corrupt ZIP central directory")
    const method = dv.getUint16(at + 10, true), crc = dv.getUint32(at + 16, true)
    const csize = dv.getUint32(at + 20, true), usize = dv.getUint32(at + 24, true)
    const nameLen = dv.getUint16(at + 28, true), extraLen = dv.getUint16(at + 30, true), commentLen = dv.getUint16(at + 32, true)
    const local = dv.getUint32(at + 42, true)
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (name.endsWith("/")) continue
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) throw new ZipError(`Corrupt ZIP local header for '${name}'`)
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const raw = bytes.subarray(start, start + csize)
    const data = method === 0 ? raw.slice() : method === 8 ? inflateRaw(raw, usize) : undefined
    if (data === undefined) throw new ZipError(`ZIP entry '${name}' uses unsupported compression method ${method}`)
    if (data.length !== usize || crc32(data) !== crc) throw new ZipError(`ZIP entry '${name}' fails its CRC check`)
    out.push({ name, data })
  }
  return out
}
