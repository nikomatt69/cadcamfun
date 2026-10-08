/** The generated clients are a function of the contract: nothing may drift, and every route is either generated or listed as unsupported. */
import { describe, expect, test } from "bun:test"
import { HttpApi } from "effect/unstable/httpapi"
import { PROMISE_UNSUPPORTED, UNSUPPORTED, drift, targets } from "./generate-clients.ts"
import { Api } from "../src/index.ts"

describe("generated API clients", () => {
  test("the committed files match what the contract generates (run `bun run generate` in packages/api)", async () => {
    expect(await drift()).toEqual([])
  }, 60_000)

  test("every contract route is generated or explicitly unsupported", () => {
    let total = 0
    HttpApi.reflect(Api, { onGroup() {}, onEndpoint() { total++ } })
    const [sdk, effect] = targets()
    expect(effect!.output.operations.length + Object.keys(UNSUPPORTED).length).toBe(total)
    expect(sdk!.output.operations.length + Object.keys(UNSUPPORTED).length + Object.keys(PROMISE_UNSUPPORTED).length).toBe(total)
  })
})
