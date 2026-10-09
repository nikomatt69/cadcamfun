import type { NeutralCadFormat } from "./cad-file-decoder.ts"
/** Decode on an isolated worker so malformed/expensive CAD input cannot block the UI indefinitely. */
export const neutralCadAttachment = async (file: File): Promise<string> => {
  const extension = file.name.split(".").at(-1)?.toLowerCase()
  const format: NeutralCadFormat = extension === "step" || extension === "stp" ? "step" : extension === "igs" || extension === "iges" ? "iges" : "brep"
  const bytes = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./cad-file-worker.ts", import.meta.url), { type: "module" })
    const stop = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => { stop(); reject(new Error("CAD decoding exceeded 60 seconds. Split or simplify the source model.")) }, 60_000)
    worker.onmessage = (event: MessageEvent<{ ok: boolean; content?: string; error?: string }>) => {
      stop()
      if (event.data.ok && typeof event.data.content === "string") resolve(event.data.content)
      else reject(new Error(event.data.error ?? "CAD decoding failed."))
    }
    worker.onerror = () => { stop(); reject(new Error("The local OpenCascade worker could not decode this CAD file.")) }
    worker.postMessage({ bytes, name: file.name, format }, [bytes])
  })
}
