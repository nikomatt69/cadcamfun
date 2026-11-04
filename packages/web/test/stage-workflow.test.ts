import { expect, test } from "bun:test"
import { workflowScript, WORKFLOW_POSTER, WORKFLOW_STEPS, type WorkflowState } from "../src/components/stage/workflow-sequence"

test("the workflow example completes each step in order and ends at its reduced-motion poster", async () => {
  const states: number[] = []
  const marks: string[] = []
  let state: WorkflowState = { completed: 0 }
  await workflowScript({
    wait: async () => {},
    set: async (patch) => {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }
      states.push(state.completed)
    },
    mark: (name) => { marks.push(name) },
  })
  expect(states).toEqual(WORKFLOW_STEPS.map((_, index) => index + 1))
  expect(marks).toEqual(WORKFLOW_STEPS.map((_, index) => `step-${index + 1}`))
  expect(state).toEqual(WORKFLOW_POSTER)
})
