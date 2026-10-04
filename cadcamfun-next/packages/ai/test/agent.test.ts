import { describe, expect, test } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { Doc, type CadDocument } from "@cadcamfun/core"
import { CamLibrary } from "@cadcamfun/cam"
import { LLM, LLMResponse } from "@cadcamfun/llm"
import { TestLLM } from "@cadcamfun/llm/testing"
import { AiModel, CadAgent, Workspace, defaultSetup } from "../src"

const setupAgent = (doc: CadDocument) => {
  const llm = TestLLM.make()
  const workspace = Layer.effect(Workspace, Workspace.make(doc, defaultSetup))
  const layer = CadAgent.layerNoDeps.pipe(
    Layer.provideMerge(Layer.mergeAll(workspace, CamLibrary.layer, AiModel.layer(TestLLM.model()), llm.layer)),
  )
  const chat = (prompt: string) =>
    Effect.gen(function* () {
      const agent = yield* CadAgent
      const events = yield* agent.chat({ messages: [LLM.user(prompt)] }).pipe(Stream.runCollect)
      const ws = yield* Workspace
      return { events: Array.from(events), state: yield* ws.state }
    })
  return { llm, layer, chat }
}

describe("CadAgent", () => {
  test("draws shapes through tools and answers", async () => {
    const { llm, layer, chat } = setupAgent(Doc.empty("Bracket"))
    llm.push(
      TestLLM.toolCall("add_shapes", {
        shapes: [
          { _tag: "Rectangle", origin: { x: 0, y: 0 }, width: 80, height: 40 },
          { _tag: "Circle", center: { x: 20, y: 20 }, radius: 4 },
        ],
      }),
    )
    llm.push(TestLLM.text("Added an 80×40 plate with a Ø8 hole."))
    const { events, state } = await Effect.runPromise(chat("Draw a plate with a hole").pipe(Effect.provide(layer)))
    expect(state.history.present.elements.map((e) => e._tag)).toEqual(["Rectangle", "Circle"])
    expect(LLMResponse.text({ events })).toContain("80×40")
    expect(llm.exhausted()).toBe(true)
    // The tool result was sent back to the model on the second request.
    expect(llm.requests()[1]!.body).toContain("ids")
  })

  test("plans machining and generates G-code", async () => {
    const doc = Doc.empty("Plate")
    const plate = Doc.instantiate(doc, { _tag: "Rectangle", origin: { x: 10, y: 10 }, width: 60, height: 40 })
    const hole = Doc.instantiate(doc, { _tag: "Point", position: { x: 40, y: 30 } })
    const start = { ...doc, elements: [plate, hole] }
    const { llm, layer, chat } = setupAgent(start)
    llm.push(
      TestLLM.toolCall("add_operation", {
        operation: { _tag: "Drill", toolId: "dr-5", elementIds: [hole.id], depth: 6, peck: 2 },
      }),
    )
    llm.push(
      TestLLM.toolCall("add_operation", {
        operation: {
          _tag: "Profile",
          toolId: "em-3",
          elementIds: [plate.id],
          depth: 6,
          side: "outside",
          direction: "climb",
        },
      }),
    )
    llm.push(TestLLM.toolCall("generate_gcode", {}))
    llm.push(TestLLM.text("G-code ready."))
    const { state } = await Effect.runPromise(chat("Machine it in MDF").pipe(Effect.provide(layer)))
    expect(state.setup.operations.map((o) => o._tag)).toEqual(["Drill", "Profile"])
    expect(state.output?.controller).toBe("grbl")
    expect(state.output?.gcode).toContain("M30")
    expect(llm.requests()[3]!.body).toContain("estimatedMinutes")
  })

  test("tool failures are reported back to the model, not thrown", async () => {
    const { llm, layer, chat } = setupAgent(Doc.empty())
    llm.push(TestLLM.toolCall("delete_elements", { ids: ["missing"] }))
    llm.push(TestLLM.text("That element does not exist."))
    await Effect.runPromise(chat("delete it").pipe(Effect.provide(layer)))
    expect(llm.requests()[1]!.body).toContain("Element not found: missing")
  })
})
