import { ARTIFACT_MARKER, extractArtifact } from "./docsArtifact"

/**
 * Pure helpers behind `/api/docs-assistant`: request parsing, the
 * "build me a guide" detector, transcript filtering while an artifact block
 * streams, and the Workers AI stream parser. Kept out of the route so they are
 * unit-tested without a Worker.
 */

export const MAX_MESSAGES = 12
export const MAX_QUESTION_CHARS = 1200

export type ChatRole = "user" | "assistant"
export type ChatMessage = { role: ChatRole; content: string }

/**
 * Wants a page built, not just an answer. "How do I post a toolpath?" is a
 * question, so a build verb alone is not enough — it has to be aimed at
 * something page-shaped, or name an artifact outright.
 */
export const BUILD_VERB =
  /\b(build|create|make|generate|design|draw|render|show me|write me|give me|crea|creami|genera|generami|costruisci|disegna|fammi|mostrami|prepara|preparami)\b/i
export const BUILD_OBJECT =
  /\b(guide|guida|walkthrough|tutorial|onboarding|cheat ?sheet|dashboard|diagram|diagramma|chart|grafico|poster|infographic|page|pagina|ui|interfaccia|overview|summary|riassunto|comparison|confronto|checklist|reference|table|tabella|template|playground|setup sheet|scheda|visuali\w+)\b/i
export const EXPLICIT_ARTIFACT = /\b(artifact|artefatt\w+|cheat ?sheet|cheatsheet)\b/i

export const wantsArtifact = (question: string) =>
  EXPLICIT_ARTIFACT.test(question) || (BUILD_VERB.test(question) && BUILD_OBJECT.test(question))

export function parseMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (message): message is ChatMessage =>
        !!message &&
        typeof message === "object" &&
        ["user", "assistant"].includes((message as ChatMessage).role) &&
        typeof (message as ChatMessage).content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_QUESTION_CHARS).trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_MESSAGES)
}

/** Title for a guide the user asked for but the model did not name. */
export function guideTitle(question: string) {
  const cleaned = question
    .replace(/^\s*(please\s+)?/i, "")
    .replace(/^(build|create|make|generate|design|write|give|crea|creami|genera|fammi|preparami)\s+(me\s+|mi\s+)?(an?\s+|una?\s+)?(interactive\s+)?/i, "")
    .replace(/[?!.]+\s*$/, "")
    .trim()
  const title = cleaned.length > 3 ? cleaned : question.trim()
  const short = title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title
  return short.charAt(0).toUpperCase() + short.slice(1)
}

/**
 * The answer without its artifact block — that gets published, not chatted.
 * While the block is still streaming, everything from the fence on is hidden.
 */
export function visibleAnswer(answer: string) {
  const marker = answer.indexOf(ARTIFACT_MARKER)
  if (marker === -1) return answer
  return answer.includes("```", marker + ARTIFACT_MARKER.length)
    ? extractArtifact(answer).text
    : answer.slice(0, marker).trimEnd()
}

/**
 * Holds back a trailing partial code fence so a half-written ```artifact
 * marker never flashes in the transcript.
 */
export function withheldTail(text: string) {
  let fence = text.lastIndexOf("`")
  if (fence === -1 || text.length - fence >= 12) return text
  // Cut at the start of the backtick run, not its last character.
  while (fence > 0 && text[fence - 1] === "`") fence -= 1
  return text.slice(0, fence)
}

export type AnswerChunk = { kind: "text" | "reasoning"; text: string }

/** Parses the Workers AI SSE frames into answer and reasoning deltas. */
export async function* workersAiDeltas(upstream: ReadableStream<Uint8Array>): AsyncGenerator<AnswerChunk> {
  const reader = upstream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  /**
   * Workers AI models do not agree on a stream shape: Llama sends
   * `{response}`, gpt-oss sends Responses API events, and some models send
   * OpenAI chat chunks.
   */
  const parse = (payload: string): AnswerChunk | null => {
    if (payload === "[DONE]") return null
    try {
      const data = JSON.parse(payload) as {
        response?: unknown
        reasoning?: unknown
        type?: unknown
        delta?: unknown
        choices?: Array<{
          delta?: { content?: unknown; reasoning_content?: unknown }
        }>
      }

      if (typeof data.response === "string") return { kind: "text", text: data.response }
      if (typeof data.reasoning === "string") return { kind: "reasoning", text: data.reasoning }

      if (typeof data.delta === "string" && typeof data.type === "string") {
        if (data.type.endsWith("output_text.delta")) return { kind: "text", text: data.delta }
        if (data.type.includes("reasoning")) return { kind: "reasoning", text: data.delta }
      }

      const choice = data.choices?.[0]?.delta
      if (typeof choice?.content === "string") return { kind: "text", text: choice.content }
      if (typeof choice?.reasoning_content === "string") return { kind: "reasoning", text: choice.reasoning_content }

      return null
    } catch {
      return null
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const text = parse(trimmed.slice(5).trim())
        if (text) yield text
      }
    }
    if (buffer.trim().startsWith("data:")) {
      const text = parse(buffer.trim().slice(5).trim())
      if (text) yield text
    }
  } finally {
    reader.releaseLock()
  }
}
