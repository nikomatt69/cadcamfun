import { Effect, Layer, Schema, Stream } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Doc } from "@cadcamfun/core"
import { CamLibrary, Operations } from "@cadcamfun/cam"
import { CadAgent, Workspace } from "@cadcamfun/ai"
import { LLM, type LLMEvent } from "@cadcamfun/llm"
import { ChatRequest, type ChatEvent } from "./api"

const encoder = new TextEncoder()
const sse = (event: ChatEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`)

const toChatEvent = (event: LLMEvent): ChatEvent | undefined => {
  switch (event.type) {
    case "text-delta":
      return { type: "text", text: event.text }
    case "reasoning-delta":
      return { type: "reasoning", text: event.text }
    case "tool-call":
      return { type: "tool-call", id: event.id, name: event.name, input: event.input }
    case "tool-result":
      return {
        type: "tool-result",
        id: event.id,
        name: event.name,
        ok: event.result.type !== "error",
        result: event.result.value,
      }
    case "tool-error":
      return { type: "tool-result", id: event.id, name: event.name, ok: false, result: event.message }
    case "provider-error":
      return { type: "error", message: event.message }
    default:
      return undefined
  }
}

const errorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error)

const encodeDocument = Schema.encodeSync(Doc.CadDocument)
const encodeSetup = Schema.encodeSync(Operations.Setup)

/**
 * `POST /api/ai/chat`: runs the agent against the client's document and streams
 * Server-Sent Events. The final `state` event carries the edited document and setup,
 * so the server stays stateless and the client remains the source of truth.
 */
export const ChatRoute = <E>(agentLayer: Layer.Layer<CadAgent, E, Workspace | CamLibrary>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const library = yield* CamLibrary
      return HttpRouter.add(
        "POST",
        "/api/ai/chat",
        Effect.gen(function* () {
          const body = yield* HttpServerRequest.schemaBodyJson(ChatRequest)
          const workspace = yield* Workspace.make(body.document, body.setup)
          const run = Effect.gen(function* () {
            const agent = yield* CadAgent
            return agent.chat({
              messages: body.messages.map((m) => (m.role === "user" ? LLM.user(m.content) : LLM.assistant(m.content))),
            })
          }).pipe(
            Effect.provide(agentLayer),
            Effect.provideService(Workspace, workspace),
            Effect.provideService(CamLibrary, library),
          )
          const events = Stream.unwrap(run).pipe(
            Stream.map(toChatEvent),
            Stream.filter((e): e is ChatEvent => e !== undefined),
            Stream.catch((error) => Stream.make<Array<ChatEvent>>({ type: "error", message: errorMessage(error) })),
            Stream.concat(
              Stream.fromEffect(
                workspace.state.pipe(
                  Effect.map(
                    (s): ChatEvent => ({
                      type: "state",
                      document: encodeDocument(s.history.present),
                      setup: encodeSetup(s.setup),
                      gcode: s.output?.gcode,
                    }),
                  ),
                ),
              ),
            ),
            Stream.concat(Stream.make<Array<ChatEvent>>({ type: "done" })),
            Stream.map(sse),
          )
          return HttpServerResponse.stream(events, {
            contentType: "text/event-stream",
            headers: { "cache-control": "no-cache", connection: "keep-alive" },
          })
        }).pipe(
          Effect.catchTag("SchemaError", (e) => Effect.succeed(HttpServerResponse.text(e.message, { status: 400 }))),
        ),
      )
    }),
  )
