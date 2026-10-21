import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("the default machines of the library", () => {
  test("the built-in catalogue is served in the shape the library stores", async () => {
    const response = await app.call("/api/machine-configs/defaults")
    expect(response.status).toBe(200)
    const rows = (response.body as { data: ReadonlyArray<Record<string, unknown>> }).data
    expect(rows.length).toBe(cam.kernel.MACHINE_CATALOGUE.length)
    const kern = rows.find((row) => row["id"] === "kern-micro-hd-hsk25")!
    expect(kern["type"]).toBe("mill")
    expect((kern["config"] as { controller: string }).controller).toBe("Heidenhain TNC7")
    const mazak = rows.find((row) => row["id"] === "mazak-integrex-i200")!
    expect(mazak["type"]).toBe("lathe")
    expect((mazak["config"] as { turning: { maxBarDiameter: number } }).turning.maxBarDiameter).toBe(65)
    // Every built-in row is a machine the kernel can plan against.
    for (const row of rows) expect(cam.kernel.kernelMachineOfConfig(row as never), String(row["id"])).toBeDefined()
    // The list of the person's own configurations is untouched by the built-in ones.
    const own = await app.call("/api/machine-configs")
    expect((own.body as { data: { data: ReadonlyArray<unknown> } }).data.data).toEqual([])
  })

  test("a saved configuration of the library is a machine the assistant can plan against", async () => {
    const created = await app.call("/api/machine-configs", {
      method: "POST",
      json: {
        name: "Shop mill", type: "mill",
        config: { workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 9000, maxFeedRate: 8000, controller: "fanuc" }
      }
    })
    expect(created.status).toBe(200)
    const handlers = await app.toolHandlers()
    const machines = await handlers.machines!("p") as ReadonlyArray<Record<string, unknown>>
    const own = machines.find((row) => row["name"] === "Shop mill")
    expect(own).toBeDefined()
    expect(own!["id"]).toBe(`config:${created.body.data.id}`)
    expect(own!["kind"]).toBe("mill")
    expect((own!["limits"] as { maxRpm: number }).maxRpm).toBe(9000)
  })
})
