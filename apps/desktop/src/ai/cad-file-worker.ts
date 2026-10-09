import createOcct from "occt-import-js"
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url"
import { decodeCadFile, type NeutralCadFormat } from "./cad-file-decoder.ts"

const kernel = createOcct({ locateFile: (path) => path.endsWith(".wasm") ? wasmUrl : path, print: () => {}, printErr: () => {} })
self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; name: string; format: NeutralCadFormat }>) => {
  try { self.postMessage({ ok: true, content: decodeCadFile(await kernel, event.data.format, new Uint8Array(event.data.bytes), event.data.name) }) }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Neutral CAD decoding failed." }) }
}
