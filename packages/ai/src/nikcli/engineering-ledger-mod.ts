/** App-owned host hooks. The scoped callback owns authorization; the generated module contains no stored project data. */
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { renderEngineeringLedger, type EngineeringLedger } from "../engineering-state.ts"
import compactionPrompt from "./prompts/compaction.txt" with { type: "text" }

export interface EngineeringLedgerRead {
  readonly ledger: EngineeringLedger
  readonly summaryTargetTokens?: number
}

/** Undefined means optional context is disabled or the session has no authorized engineering target. */
export type EngineeringLedgerReader = (directory: string, sessionId: string) => Promise<EngineeringLedgerRead | undefined>

const BRIDGE = Symbol.for("cadcamfun/engineering-ledger/v1")
type Callback = (directory: string, sessionId: string) => Promise<{ readonly text: string; readonly summaryTargetTokens?: number } | undefined>
const bridge = (): Map<string, Callback> => {
  const global = globalThis as unknown as Record<symbol, unknown>
  const existing = global[BRIDGE]
  if (existing instanceof Map) return existing as Map<string, Callback>
  const callbacks = new Map<string, Callback>()
  global[BRIDGE] = callbacks
  return callbacks
}

export interface EngineeringLedgerMod {
  readonly spec: string
  readonly close: () => void
}

/**
 * Install once per runtime, before any host loads its configuration. The hook reads current repositories both while
 * compacting and before the next provider step, so omitted summary facts cannot erase IDs, revisions or failed evidence.
 * It edits only the model's request clone: no synthetic observation is written back as a user instruction or domain data.
 */
export const installEngineeringLedgerMod = (root: string, read: EngineeringLedgerReader): EngineeringLedgerMod => {
  const key = crypto.randomUUID()
  const callbacks = bridge()
  callbacks.set(key, async (directory, sessionId) => {
    const state = await read(directory, sessionId)
    if (state === undefined) return undefined
    const text = renderEngineeringLedger(state.ledger)
    return text === "" ? undefined : { text, ...(state.summaryTargetTokens !== undefined ? { summaryTargetTokens: state.summaryTargetTokens } : {}) }
  })
  const file = join(root, "native", `engineering-ledger-${key}.mjs`)
  const source = `const key = ${JSON.stringify(key)};
const read = async (directory, sessionID) => {
  const callbacks = globalThis[Symbol.for("cadcamfun/engineering-ledger/v1")];
  const callback = callbacks instanceof Map ? callbacks.get(key) : undefined;
  if (!callback) throw new Error("The engineering ledger runtime is closed");
  return callback(directory, sessionID);
};
export const CadcamEngineeringLedger = async ({ directory }) => ({
  "experimental.session.compacting": async ({ sessionID }, output) => {
    const state = await read(directory, sessionID);
    if (!state) return;
    const target = Number.isFinite(state.summaryTargetTokens) ? "Keep the narrative summary below " + state.summaryTargetTokens + " tokens. The authoritative ledger is supplied again after compaction." : "";
    output.prompt = [${JSON.stringify(compactionPrompt)}, target, ...(Array.isArray(output.context) ? output.context : []), state.text].filter(Boolean).join("\\n\\n");
  },
  "experimental.chat.messages.transform": async (_input, output) => {
    const messages = output.messages;
    if (!Array.isArray(messages)) return;
    const user = [...messages].reverse().find((message) => message.info?.role === "user");
    const sessionID = user?.info?.sessionID;
    if (typeof sessionID !== "string") return;
    const state = await read(directory, sessionID);
    if (!state) return;
    const messageID = "msg_" + crypto.randomUUID().replaceAll("-", "");
    messages.push({ info: { ...user.info, id: messageID }, parts: [{ id: "part_" + crypto.randomUUID().replaceAll("-", ""), sessionID, messageID, type: "text", text: state.text, synthetic: true }] });
  }
});
`
  try {
    mkdirSync(join(root, "native"), { recursive: true, mode: 0o700 })
    const temporary = `${file}.${key}.tmp`
    writeFileSync(temporary, source, { mode: 0o600 })
    renameSync(temporary, file)
  } catch (error) {
    callbacks.delete(key)
    throw error
  }
  return { spec: pathToFileURL(file).href, close: () => {
    callbacks.delete(key)
    try { unlinkSync(file) } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error
    }
  } }
}
