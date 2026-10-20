/**
 * The packed CAM buffer format (spec 36 §3).
 *
 * A CAM program is thousands to millions of segments, and the object-per-segment shape the rest of the app
 * uses costs hundreds of megabytes of JavaScript heap plus a JSON round trip. This module is the **single**
 * definition of a packed, structure-of-arrays layout available to both sidecar and desktop consumers.
 * The desktop playback currently fills these views directly; the codec also supports binary transports.
 *
 * The module is deliberately pure: no Effect, no I/O, no dependencies. It owns the byte order and nothing
 * else does. The in-memory representation *is* the wire format — an allocated buffer is filled in place and
 * then sent as-is, and a received buffer is wrapped in typed-array views without a copy.
 */

/** Why a buffer was refused. A decoder never repairs a malformed buffer. */
export type BufferErrorReason =
  | "bad_magic"
  | "unsupported_version"
  | "truncated"
  | "misaligned"
  | "invalid_count"
  | "invalid_data"
  | "invalid_utf8"
  | "unsupported_flags"
  | "unsupported_host"
  | "trailing_data"
  | "limit_exceeded"
  | "allocation_failed"

/** A malformed or unsupported buffer. The `reason` is stable; the message is for humans. */
export class BufferError extends Error {
  readonly _tag = "BufferError" as const
  constructor(readonly reason: BufferErrorReason, message: string) {
    super(message)
    this.name = "BufferError"
  }
}

/** The magic bytes `CCBF`, read little-endian. */
export const BUFFER_MAGIC = 0x46424343
/** The format version this module reads and writes. */
export const BUFFER_VERSION = 2
/** The fixed header size in bytes. */
export const HEADER_BYTES = 48
/** The bytes one segment costs: 8 + 8 + 24 + 24 + 4 + 4 + 4 + 1. */
export const BYTES_PER_SEGMENT = 77
export const MAX_BUFFER_BYTES = 512 * 1024 * 1024
export const MAX_TOOLS = 65_536
export const MAX_TOOL_TABLE_BYTES = 16 * 1024 * 1024

/** Callers can lower the global ceilings for a smaller transport or preview. */
export interface BufferLimits {
  readonly maxBytes?: number
  readonly maxTools?: number
  readonly maxToolTableBytes?: number
}

export interface DecodeOptions extends BufferLimits {
  /** Own a snapshot rather than retain the caller's backing buffer. */
  readonly copy?: boolean
}

const limitsOf = (limits: BufferLimits) => {
  const resolved = {
    maxBytes: limits.maxBytes ?? MAX_BUFFER_BYTES,
    maxTools: limits.maxTools ?? MAX_TOOLS,
    maxToolTableBytes: limits.maxToolTableBytes ?? MAX_TOOL_TABLE_BYTES,
  }
  for (const [name, value, ceiling] of [
    ["maxBytes", resolved.maxBytes, MAX_BUFFER_BYTES],
    ["maxTools", resolved.maxTools, MAX_TOOLS],
    ["maxToolTableBytes", resolved.maxToolTableBytes, MAX_TOOL_TABLE_BYTES],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > ceiling) throw new BufferError("limit_exceeded", `invalid ${name} limit`)
  }
  return resolved
}

const requireLittleEndian = (): void => {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
    throw new BufferError("unsupported_host", "typed CAM views require a little-endian host")
  }
}

/** A point in millimetres. */
export interface BufferPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The structure-of-arrays views over one buffer's segments. Every array has `segmentCount` entries, except
 * `from` and `to`, which have three per segment (xyz).
 */
export interface PlaybackViews {
  /** Start time of every segment, ascending. */
  readonly starts: Float64Array
  /** Duration of every segment, in seconds. */
  readonly durations: Float64Array
  /** Start point of every segment, xyz interleaved. */
  readonly from: Float64Array
  /** End point of every segment, xyz interleaved. */
  readonly to: Float64Array
  /** The toolpath index of every segment. */
  readonly pathIndex: Uint32Array
  /** The move index inside that toolpath. */
  readonly moveIndex: Uint32Array
  /** The index of the segment's tool in the buffer's tool table. */
  readonly toolIndex: Uint32Array
  /** `1` when the segment is a rapid, `0` otherwise. */
  readonly rapid: Uint8Array
}

/** A decoded buffer: its header values and the views over its bytes. */
export interface PlaybackBuffer {
  readonly version: number
  readonly segmentCount: number
  /** The total program duration, in seconds. */
  readonly duration: number
  /** Where the machine is at the end of the program. */
  readonly end: BufferPoint
  /** The tool ids, in the order the segments' `toolIndex` refers to. */
  readonly toolIds: readonly string[]
  readonly views: PlaybackViews
  /** The bytes the views were taken over. */
  readonly bytes: Uint8Array
}

/** Domain-neutral input to the encoder and invariant checker. No core/Effect dependency. */
export type PlaybackData = Pick<PlaybackBuffer, "segmentCount" | "duration" | "end" | "toolIds" | "views">

/** A buffer being written: the views to fill and the bytes to send. */
export interface PlaybackWriter {
  readonly segmentCount: number
  readonly toolIds: readonly string[]
  readonly views: PlaybackViews
  /** The bytes to send once the sections are filled. */
  readonly bytes: Uint8Array
  /**
   * Writes the duration and the end point into the header. Call it once, after the sections are filled: the
   * header is what a decoder reads first, so a buffer sent without it claims to be empty.
   */
  finalize(duration: number, end: BufferPoint): Uint8Array
}

// Bitwise alignment truncates to signed 32-bit and can wrap malicious wire counts.
const align8 = (offset: number): number => Math.ceil(offset / 8) * 8

/** The byte offset of every section, for `n` segments. The order is the format's, and it is not negotiable. */
export interface SectionOffsets {
  readonly starts: number
  readonly durations: number
  readonly from: number
  readonly to: number
  readonly pathIndex: number
  readonly moveIndex: number
  readonly toolIndex: number
  readonly rapid: number
  /** Where the tool table starts. */
  readonly tools: number
  /** The total size of the buffer, without the tool table. */
  readonly fixed: number
}

export const sectionOffsets = (segmentCount: number): SectionOffsets => {
  if (!Number.isInteger(segmentCount) || segmentCount < 0 || segmentCount > 0xffff_ffff) {
    throw new BufferError("invalid_count", "segment count must be an unsigned 32-bit integer")
  }
  const n = segmentCount
  const starts = align8(HEADER_BYTES)
  const durations = align8(starts + n * 8)
  const from = align8(durations + n * 8)
  const to = align8(from + n * 24)
  const pathIndex = align8(to + n * 24)
  const moveIndex = align8(pathIndex + n * 4)
  const toolIndex = align8(moveIndex + n * 4)
  const rapid = align8(toolIndex + n * 4)
  const tools = align8(rapid + n)
  return { starts, durations, from, to, pathIndex, moveIndex, toolIndex, rapid, tools, fixed: tools }
}

const encoder = new TextEncoder()
// Preserve a leading BOM in an identifier; malformed UTF-8 must never be repaired.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

const encodedTools = (toolIds: readonly string[], limits: ReturnType<typeof limitsOf>) => {
  if (toolIds.length > limits.maxTools) throw new BufferError("limit_exceeded", "too many tools")
  const encoded: Uint8Array[] = []
  let size = 4
  for (const id of toolIds) {
    if (typeof id !== "string" || id.length > limits.maxToolTableBytes) throw new BufferError("invalid_data", "unsupported tool identifier")
    const bytes = encoder.encode(id)
    if (decoder.decode(bytes) !== id) throw new BufferError("invalid_utf8", "tool identifier contains an unpaired surrogate")
    size += 4 + bytes.length
    if (size > limits.maxToolTableBytes) throw new BufferError("limit_exceeded", "tool table exceeds its byte limit")
    encoded.push(bytes)
  }
  if (size > limits.maxToolTableBytes) throw new BufferError("limit_exceeded", "tool table exceeds its byte limit")
  return { encoded, size }
}

/** The size of the tool table: a count, then every id with its byte length. */
export const toolTableBytes = (toolIds: readonly string[], limits: BufferLimits = {}): number =>
  encodedTools(toolIds, limitsOf(limits)).size

/** The views over a buffer's sections. `base` is where the buffer starts inside its `ArrayBuffer`. */
const viewsOver = (buffer: ArrayBufferLike, base: number, offsets: SectionOffsets, n: number): PlaybackViews => ({
  starts: new Float64Array(buffer, base + offsets.starts, n),
  durations: new Float64Array(buffer, base + offsets.durations, n),
  from: new Float64Array(buffer, base + offsets.from, n * 3),
  to: new Float64Array(buffer, base + offsets.to, n * 3),
  pathIndex: new Uint32Array(buffer, base + offsets.pathIndex, n),
  moveIndex: new Uint32Array(buffer, base + offsets.moveIndex, n),
  toolIndex: new Uint32Array(buffer, base + offsets.toolIndex, n),
  rapid: new Uint8Array(buffer, base + offsets.rapid, n),
})

/**
 * Allocates a buffer for `segmentCount` segments and the given tool ids. The views are filled in place;
 * `finalize` writes the header and returns the bytes to send.
 */
export const allocatePlaybackBuffer = (segmentCount: number, toolIds: readonly string[] = [], options: BufferLimits = {}): PlaybackWriter => {
  requireLittleEndian()
  const limits = limitsOf(options)
  const n = segmentCount
  const offsets = sectionOffsets(n)
  if (offsets.fixed > limits.maxBytes) throw new BufferError("limit_exceeded", "segment sections exceed the payload limit")
  const tools = encodedTools(toolIds, limits)
  const total = align8(offsets.tools + tools.size)
  if (total > limits.maxBytes) throw new BufferError("limit_exceeded", "payload exceeds its byte limit")
  let buffer: ArrayBuffer
  try { buffer = new ArrayBuffer(total) } catch { throw new BufferError("allocation_failed", "cannot allocate the CAM payload") }
  const bytes = new Uint8Array(buffer)
  const header = new DataView(buffer)
  header.setUint32(0, BUFFER_MAGIC, true)
  header.setUint16(4, BUFFER_VERSION, true)
  header.setUint16(6, 0, true)
  header.setUint32(8, n, true)
  header.setUint32(12, 0, true)
  // The tool table: a count, then every id with its byte length.
  const table = new DataView(buffer, offsets.tools)
  table.setUint32(0, toolIds.length, true)
  let cursor = 4
  for (const encoded of tools.encoded) {
    table.setUint32(cursor, encoded.length, true)
    cursor += 4
    new Uint8Array(buffer, offsets.tools + cursor, encoded.length).set(encoded)
    cursor += encoded.length
  }
  const ids = Object.freeze([...toolIds])
  const views = viewsOver(buffer, 0, offsets, n)
  return {
    segmentCount: n,
    toolIds: ids,
    views,
    bytes,
    finalize(duration: number, end: BufferPoint): Uint8Array {
      assertPlaybackInvariants({ segmentCount: n, duration, end, toolIds: ids, views })
      header.setFloat64(16, duration, true)
      header.setFloat64(24, end.x, true)
      header.setFloat64(32, end.y, true)
      header.setFloat64(40, end.z, true)
      return bytes
    },
  }
}

/** Reads the tool table of a decoded buffer. */
const readToolTable = (buffer: ArrayBufferLike, base: number, offset: number, available: number, limits: ReturnType<typeof limitsOf>): { ids: string[]; used: number } => {
  if (available < 4) throw new BufferError("truncated", "the tool table is missing its count")
  const table = new DataView(buffer, base + offset, available)
  const count = table.getUint32(0, true)
  if (count > limits.maxTools || available > limits.maxToolTableBytes + 7) throw new BufferError("limit_exceeded", "tool table exceeds its limit")
  const ids: string[] = []
  let cursor = 4
  for (let i = 0; i < count; i++) {
    if (cursor + 4 > available) throw new BufferError("truncated", `the tool table ends inside tool ${i}`)
    const length = table.getUint32(cursor, true)
    cursor += 4
    if (cursor + length > available) throw new BufferError("truncated", `tool ${i} is cut short`)
    if (cursor + length > limits.maxToolTableBytes) throw new BufferError("limit_exceeded", "tool table exceeds its byte limit")
    try { ids.push(decoder.decode(new Uint8Array(buffer, base + offset + cursor, length))) }
    catch { throw new BufferError("invalid_utf8", `tool ${i} contains malformed UTF-8`) }
    cursor += length
  }
  return { ids, used: cursor }
}

/**
 * Decodes a buffer. The views point into the received bytes: a `Float64Array` needs an 8-byte aligned
 * offset, so a buffer that arrives as an unaligned slice is copied once, here, and nowhere else.
 */
export const decodePlaybackBuffer = (bytes: Uint8Array, options: DecodeOptions = {}): PlaybackBuffer => {
  requireLittleEndian()
  const limits = limitsOf(options)
  const size = bytes.byteLength
  if (size > limits.maxBytes) throw new BufferError("limit_exceeded", "payload exceeds its byte limit")
  if (size < HEADER_BYTES) {
    throw new BufferError("truncated", `the buffer is ${size} bytes, shorter than the ${HEADER_BYTES}-byte header`)
  }
  // A typed-array view needs an aligned start; a slice of a response body may not be aligned.
  // Copy shared input before validation so later writers cannot mutate returned views.
  let aligned = bytes
  if (options.copy || bytes.byteOffset % 8 !== 0 || !(bytes.buffer instanceof ArrayBuffer)) {
    try {
      // Capture the admitted length: a growable shared input cannot enlarge this allocation.
      aligned = new Uint8Array(size)
      aligned.set(bytes.subarray(0, size))
    } catch { throw new BufferError("allocation_failed", "cannot copy the CAM payload") }
  }
  const buffer = aligned.buffer
  const base = aligned.byteOffset
  const header = new DataView(buffer, base, aligned.byteLength)
  const magic = header.getUint32(0, true)
  if (magic !== BUFFER_MAGIC) {
    throw new BufferError("bad_magic", `the buffer does not start with the CAM buffer magic (${magic.toString(16)})`)
  }
  const version = header.getUint16(4, true)
  if (version !== BUFFER_VERSION) {
    throw new BufferError("unsupported_version", `the buffer is version ${version}, this module reads version ${BUFFER_VERSION}`)
  }
  if (header.getUint16(6, true) !== 0 || header.getUint32(12, true) !== 0) {
    throw new BufferError("unsupported_flags", "reserved flags and header words must be zero")
  }
  const segmentCount = header.getUint32(8, true)
  const offsets = sectionOffsets(segmentCount)
  if (aligned.byteLength < offsets.fixed) {
    throw new BufferError(
      "truncated",
      `the buffer holds ${aligned.byteLength} bytes, ${offsets.fixed} are needed for ${segmentCount} segments`,
    )
  }
  const views = viewsOver(buffer, base, offsets, segmentCount)
  const { ids: toolIds, used } = readToolTable(buffer, base, offsets.tools, aligned.byteLength - offsets.tools, limits)
  const usedEnd = offsets.tools + used
  if (aligned.byteLength < align8(usedEnd)) throw new BufferError("truncated", "payload alignment padding is truncated")
  if (aligned.byteLength !== align8(usedEnd)) throw new BufferError("trailing_data", "unexpected bytes follow the tool table")
  const sections = [
    [offsets.starts + segmentCount * 8, offsets.durations],
    [offsets.durations + segmentCount * 8, offsets.from],
    [offsets.from + segmentCount * 24, offsets.to],
    [offsets.to + segmentCount * 24, offsets.pathIndex],
    [offsets.pathIndex + segmentCount * 4, offsets.moveIndex],
    [offsets.moveIndex + segmentCount * 4, offsets.toolIndex],
    [offsets.toolIndex + segmentCount * 4, offsets.rapid],
    [offsets.rapid + segmentCount, offsets.tools], [usedEnd, aligned.byteLength],
  ] as const
  for (const [end, next] of sections) for (let i = end; i < next; i++) {
    if (aligned[i] !== 0) throw new BufferError("invalid_data", "alignment padding must be zero")
  }
  const decoded: PlaybackBuffer = {
    version,
    segmentCount,
    duration: header.getFloat64(16, true),
    end: { x: header.getFloat64(24, true), y: header.getFloat64(32, true), z: header.getFloat64(40, true) },
    toolIds: Object.freeze(toolIds),
    views,
    bytes: aligned,
  }
  assertPlaybackInvariants(decoded)
  return decoded
}

/**
 * Checks the invariants the format promises: ascending starts, no overlap, a rapid flag that is only ever
 * `0` or `1`, and a tool index that names a tool in the table. A producer that breaks them produces a buffer
 * nobody may trust.
 */
function* playbackProblems(buffer: PlaybackData): Generator<string> {
  const { starts, durations, from, to, pathIndex, moveIndex, rapid, toolIndex } = buffer.views
  const n = buffer.segmentCount
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) { yield "invalid segment count"; return }
  if (!(starts instanceof Float64Array) || !(durations instanceof Float64Array) || !(from instanceof Float64Array) || !(to instanceof Float64Array) ||
      !(pathIndex instanceof Uint32Array) || !(moveIndex instanceof Uint32Array) || !(toolIndex instanceof Uint32Array) || !(rapid instanceof Uint8Array) ||
      starts.length !== n || durations.length !== n || from.length !== n * 3 || to.length !== n * 3 ||
      pathIndex.length !== n || moveIndex.length !== n || toolIndex.length !== n || rapid.length !== n) {
    yield "segment sections have unsupported types or lengths"; return
  }
  if (!Number.isFinite(buffer.duration) || buffer.duration < 0) yield "program duration must be finite and non-negative"
  if (![buffer.end.x, buffer.end.y, buffer.end.z].every(Number.isFinite)) yield "program end point must be finite"
  for (let i = 0; i < buffer.segmentCount; i++) {
    const start = starts[i]!
    const duration = durations[i]!
    if (!Number.isFinite(start) || start < 0) yield `segment ${i} has an invalid start (${start})`
    if (!Number.isFinite(duration) || duration < 0) yield `segment ${i} has a non-finite or negative duration (${duration})`
    if (!Number.isFinite(start + duration) || start + duration > buffer.duration) yield `segment ${i} extends past the program duration`
    if (i > 0 && start < starts[i - 1]!) yield `segment ${i} starts at ${start}, before segment ${i - 1}`
    if (i > 0 && start < starts[i - 1]! + durations[i - 1]!) {
      yield `segment ${i} starts at ${start}, inside segment ${i - 1}`
    }
    if (i > 0 && pathIndex[i]! < pathIndex[i - 1]!) yield `segment ${i} reverses toolpath order`
    for (let axis = 0; axis < 3; axis++) {
      if (!Number.isFinite(from[i * 3 + axis]) || !Number.isFinite(to[i * 3 + axis])) yield `segment ${i} has a non-finite coordinate`
    }
    const flag = rapid[i]!
    if (flag !== 0 && flag !== 1) yield `segment ${i} has the rapid flag ${flag}`
    const tool = toolIndex[i]!
    if (tool >= buffer.toolIds.length) yield `segment ${i} names the tool ${tool}, which is not in the table`
  }
}

const assertPlaybackInvariants = (buffer: PlaybackData): void => {
  for (const problem of playbackProblems(buffer)) throw new BufferError("invalid_data", problem)
}

/** Bounded diagnostics for trusted producers; decode/finalize reject the first invalid value. */
export const checkPlaybackInvariants = (buffer: PlaybackData): string[] => {
  const problems: string[] = []
  for (const problem of playbackProblems(buffer)) {
    problems.push(problem)
    if (problems.length === 64) break
  }
  return problems
}

/** Copy typed sections into one owned, canonical payload; the writer remains the zero-copy builder. */
export const encodePlaybackBuffer = (source: PlaybackData, limits: BufferLimits = {}): Uint8Array => {
  const ceiling = limitsOf(limits)
  if (sectionOffsets(source.segmentCount).fixed > ceiling.maxBytes) throw new BufferError("limit_exceeded", "segment sections exceed the payload limit")
  if (source.toolIds.length > ceiling.maxTools) throw new BufferError("limit_exceeded", "too many tools")
  assertPlaybackInvariants(source)
  const writer = allocatePlaybackBuffer(source.segmentCount, source.toolIds, ceiling)
  for (const key of ["starts", "durations", "from", "to", "pathIndex", "moveIndex", "toolIndex", "rapid"] as const) {
    writer.views[key].set(source.views[key])
  }
  return writer.finalize(source.duration, source.end)
}
