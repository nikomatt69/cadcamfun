import { expect, test } from "bun:test"
import { z } from "zod"
import { BUILT_IN_TOOLS } from "../src/tools/registry.ts"
import { lenient } from "../src/tools/lenient-arguments.ts"

/**
 * Every tool schema is turned into a JSON Schema once per turn to build the provider request. Zod
 * refuses a transform there ("Transforms cannot be represented in JSON Schema"), and that failure
 * kills the whole prompt loop before the model is called: every message the user sends comes back
 * as `Session interrupted`. A single tool is enough, so each one is checked on its own here.
 *
 * `io` is left at its default (the output side), which is where a transform is unrepresentable;
 * `lenient`'s `z.preprocess` is an input step and stays representable.
 */
test("every tool schema the host registers can be represented as JSON Schema", () => {
  for (const tool of BUILT_IN_TOOLS) {
    const parameters = lenient(tool.parameters)
    expect(() => z.toJSONSchema(parameters as never)).not.toThrow()
  }
})
