/**
 * A model that is writing a long tool call sends the client nothing for tens of seconds, and a connection that is silent that
 * long is closed by the server's idle timeout or by whatever sits between the two (the browser then reports a bare "decode
 * error"). A heartbeat event every few seconds keeps the answer open for as long as the model works; the client drops it.
 */
import { Stream } from "effect"

export const STREAM_HEARTBEAT_MS = 5_000

export interface Heartbeat { readonly type: "heartbeat" }

/** `stream` with a `{ type: "heartbeat" }` mixed in every `intervalMs`; ends when `stream` ends. */
export const withHeartbeat = <A, E, R>(stream: Stream.Stream<A, E, R>, intervalMs = STREAM_HEARTBEAT_MS): Stream.Stream<A | Heartbeat, E, R> =>
  Stream.merge(stream, Stream.map(Stream.tick(`${intervalMs} millis`), (): Heartbeat => ({ type: "heartbeat" })), { haltStrategy: "left" })
