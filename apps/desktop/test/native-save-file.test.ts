import { expect, test } from "bun:test"
import { saveFile } from "../src/shared/lib/save-file.ts"

test("browser fallback downloads the exact binary bytes and MIME type", async () => {
  let downloaded: Blob | undefined
  let filename = ""
  expect(await saveFile({ name: "part.stl", data: new Uint8Array([0, 255, 1]), mime: "model/stl" }, {
    browserDownload: (blob, name) => { downloaded = blob; filename = name }
  })).toBe(true)
  expect(filename).toBe("part.stl")
  expect(downloaded?.type).toBe("model/stl")
  expect(new Uint8Array(await downloaded!.arrayBuffer())).toEqual(new Uint8Array([0, 255, 1]))
})

test("native export passes raw bytes and a percent-encoded Unicode name, with cancellation distinct from success", async () => {
  const name = "pièce Ø10.nc"
  for (const chosen of ["/tmp/part.nc", null]) {
    expect(await saveFile({ name, data: "G0 X1\n" }, {
      invoke: async (command, body, options) => {
        expect(command).toBe("save_file")
        expect(body).toBeInstanceOf(Uint8Array)
        expect(new TextDecoder().decode(body)).toBe("G0 X1\n")
        expect(options.headers["x-file-name"]).toBe(encodeURIComponent(name))
        return chosen
      }
    })).toBe(chosen !== null)
  }
})

test("native disk failure rejects without attempting a browser download", async () => {
  let fallback = false
  await expect(saveFile({ name: "part.nc", data: "G0" }, {
    invoke: async () => { throw new Error("disk full") },
    browserDownload: () => { fallback = true }
  })).rejects.toThrow("disk full")
  expect(fallback).toBe(false)
})
