import { expect, spyOn, test } from "bun:test"
import React from "react"
import { renderToString } from "react-dom/server"
import { Stage } from "../src/stageshow/kit/stage"

test("a stage can render on the server without attempting browser layout", () => {
  const errors = spyOn(console, "error").mockImplementation(() => {})
  try {
    const html = renderToString(React.createElement(Stage, {
      width: 400,
      height: 300,
      children: () => React.createElement("span", null, "Example"),
    }))
    expect(html).toContain("Example")
    expect(errors).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
  }
})
