import type { ChatEvent, ChatRequest } from "@cadcamfun/server"
import { Schema } from "effect"
import { Doc } from "@cadcamfun/core"
import { Operations } from "@cadcamfun/cam"

type EncodedChatRequest = {
  readonly document: typeof Doc.CadDocument.Encoded
  readonly setup: typeof Operations.Setup.Encoded
  readonly messages: ChatRequest["messages"]
}

const encodeDocument = Schema.encodeSync(Doc.CadDocument)
const encodeSetup = Schema.encodeSync(Operations.Setup)
export const decodeDocument = Schema.decodeUnknownSync(Doc.CadDocument)
export const decodeSetup = Schema.decodeUnknownSync(Operations.Setup)

/** Stream the agent's Server-Sent Events. */
export async function* streamChat(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const body: EncodedChatRequest = {
    document: encodeDocument(request.document),
    setup: encodeSetup(request.setup),
    messages: request.messages,
  }
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    yield { type: "error", message: `${res.status} ${await res.text()}` }
    return
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      if (chunk.startsWith("data: ")) yield JSON.parse(chunk.slice(6)) as ChatEvent
    }
  }
}
