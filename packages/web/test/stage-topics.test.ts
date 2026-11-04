import { describe, expect, test } from "bun:test"
import { topicFor } from "../src/components/stage/topic"

describe("documentation stage topics", () => {
  test("uses a scene that matches each specialized documentation area", () => {
    const cases = {
      "/docs/workflows": "workflow",
      "/docs/plugins": "plugin",
      "/docs/guides/plugin-authoring": "plugin",
      "/docs/release": "update",
      "/docs/kernels/sketch-solver": "sketch",
      "/docs/kernels/mesh": "mesh",
      "/docs/kernels/tolerance": "tolerance",
      "/docs/kernels/features": "feature",
      "/docs/kernels/brep": "feature",
      "/docs/viewport": "playback",
      "/docs/source-map": "resource",
      "/docs/packages": "resource",
      "/docs/guides/companion-pairing": "pair",
      "/docs/guides/accounts": "account",
      "/docs/guides": "guide",
      "/docs/guides/desktop-troubleshooting": "diagnostics",
      "/docs/guides/project-lifecycle": "project",
      "/docs/sidecar": "sidecar",
      "/docs/documentation": "resource",
      "/docs/mobile": "mobile",
      "/docs/setups": "machine",
      "/docs/guides/native-manufacturing": "machine",
      "/docs/api/projects": "api",
    } as const
    for (const [path, expected] of Object.entries(cases)) {
      expect(topicFor(path)).toBe(expected)
      expect(topicFor(`${path}/`)).toBe(expected)
    }
  })
})
