export interface SidecarReady {
  readonly event: "ready";
  readonly port: number;
}

/** A silent child must time out even while its stdout read is pending. */
export async function readSidecarReady(output: ReadableStream<Uint8Array>, timeoutMs = 60_000): Promise<SidecarReady> {
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    const line = await Promise.race([
      (async () => {
        let text = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error("sidecar closed stdout before its ready event");
          text += decoder.decode(chunk.value, { stream: true });
          if (text.length > 65_536) throw new Error("sidecar startup event exceeds 64 KiB");
          const newline = text.indexOf("\n");
          if (newline >= 0) return text.slice(0, newline);
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error(`sidecar did not become ready within ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    let ready: unknown;
    try { ready = JSON.parse(line); }
    catch { throw new Error(`invalid sidecar startup event: ${line.slice(0, 500)}`); }
    if (typeof ready !== "object" || ready === null) throw new Error("invalid sidecar startup event");
    const event = ready as { event?: unknown; port?: unknown; message?: unknown };
    if (event.event === "error") throw new Error(`sidecar startup failed: ${String(event.message)}`);
    if (event.event !== "ready" || typeof event.port !== "number" || !Number.isInteger(event.port) || event.port < 1 || event.port > 65_535) {
      throw new Error(`invalid sidecar ready event: ${line.slice(0, 500)}`);
    }
    return { event: "ready", port: event.port };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (expired) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
