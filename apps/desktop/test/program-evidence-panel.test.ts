/** The generator panel shows the evidence of the program it generated and where its cutting data comes from. */
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })

const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)

test("generating through the sidecar shows the record: result, checks, cutting-data source and NC hash", async () => {
  const { dispose } = app.visit("/cam")
  try {
    await find('[data-testid="toolpath-generator"]')
    // The material section names the table row of its recommendation.
    const reference = await find('[data-testid="cutting-data-preview"] [data-testid="cutting-reference"]')
    expect(reference.textContent).toContain("table MATERIALS, row al-6061-t6")
    expect(reference.textContent).toMatch(/vcCarbide\.rough 400/)

    expect(document.querySelector('[data-testid="program-evidence"]')).toBeNull()
    ;(await find<HTMLButtonElement>('[data-testid="generate-toolpath"]')).click()
    const card = await find('[data-testid="program-evidence"]')
    const evidence = useGeneratorStore.getState().evidence!
    expect(evidence.program.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(card.textContent).toContain(evidence.program.sha256)
    expect(document.querySelector('[data-testid="evidence-result"]')!.textContent).toBe(evidence.result)
    for (const c of evidence.checks) expect(document.querySelector(`[data-testid="evidence-check-${c.id}"]`)).not.toBeNull()
    // The panel's own rectangle is not a finished part: the gouge check says unresolved, never passed.
    expect(document.querySelector('[data-testid="evidence-check-no-gouge"]')!.textContent).toContain("not a finished part")
    expect(card.querySelector('[data-testid="cutting-reference"]')?.textContent).toContain("row al-6061-t6")

    // Editing the NC after generation marks the record stale.
    expect(document.querySelector('[data-testid="evidence-stale"]')).toBeNull()
    useGeneratorStore.getState().setCurrentGCode(`${useGeneratorStore.getState().currentGCode}\n; edited`)
    await find('[data-testid="evidence-stale"]')
  } finally {
    dispose()
  }
})
