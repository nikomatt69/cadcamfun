import { requireOptionalNativeModule, type SharedObject } from "expo-modules-core"

/** Raw response of a pinned one-shot request. */
export type PinnedResponse = {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/** One chunk of a pinned stream; `done: true` terminates (optionally with `status`/`error`). */
export type PinnedChunk = {
  readonly done: boolean
  readonly data?: string
  readonly status?: number
  readonly error?: string
  /** On the terminal chunk of a refused stream: the exposed response headers (`retry-after`). */
  readonly headers?: Record<string, string>
}

export type CompanionStreamHandle = SharedObject & {
  readNext(): Promise<PinnedChunk>
  cancel(): void
}

export type CompanionNetNative = {
  request(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<PinnedResponse>
  streamStart(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null, fingerprint: string): Promise<CompanionStreamHandle>
  cloudRequest?(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null): Promise<PinnedResponse>
  cloudStreamStart?(baseUrl: string, path: string, method: string, headers: Record<string, string>, body: string | null): Promise<CompanionStreamHandle>
  launchPairLink(): string | null
  warmLocalNetwork?(): void
}

export default requireOptionalNativeModule<CompanionNetNative>("CompanionNet")
