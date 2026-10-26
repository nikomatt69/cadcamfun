import { describe, expect, test } from "bun:test"
import { permissionIcon, toolDomain, toolIdentity } from "../lib/tool-identity"

describe("tool identity", () => {
  test("the category comes from the prefix", () => {
    expect(toolIdentity("cad_extrude", "extrude")).toEqual({ icon: "box", category: "CAD", title: "Extrude" })
    expect(toolIdentity("cam_pocket", "pocket")).toMatchObject({ icon: "route", category: "CAM" })
    expect(toolIdentity("vcs_commit", "commit")).toMatchObject({ icon: "git", category: "VERSION CONTROL" })
    expect(toolIdentity("actions_run", "run")).toMatchObject({ category: "ACTIONS" })
    expect(toolIdentity("whatever", "whatever")).toMatchObject({ icon: "wrench", category: "TOOL" })
  })

  test("the glyph comes from the verb, whichever domain took the action", () => {
    expect(toolIdentity("cad_snapshot", "snapshot")).toMatchObject({ icon: "camera", category: "CAD" })
    expect(toolIdentity("cam_render_toolpath", "render toolpath")).toMatchObject({ icon: "camera", category: "CAM" })
    expect(toolIdentity("cam_generate_gcode", "generate gcode")).toMatchObject({ icon: "code", category: "CAM" })
    expect(toolIdentity("cam_simulate", "simulate")).toMatchObject({ icon: "play", category: "CAM" })
    expect(toolIdentity("cad_verify_model", "verify model")).toMatchObject({ icon: "gauge", category: "CAD" })
    expect(toolIdentity("analyze_part", "analyze part")).toMatchObject({ icon: "gauge", category: "ANALYSIS" })
  })

  test("titles are readable", () => {
    expect(toolIdentity("cad_fillet_edges", "fillet edges").title).toBe("Fillet Edges")
  })

  test("a label without its raw name still resolves", () => {
    expect(toolIdentity(undefined, "cad_extrude").category).toBe("CAD")
  })

  test("permissions use tool identity for tools and the host's own names otherwise", () => {
    expect(permissionIcon("cad_delete_entities")).toBe("box")
    expect(permissionIcon("cam_generate_gcode")).toBe("code")
    expect(permissionIcon("bash")).toBe("terminal")
    expect(permissionIcon("edit")).toBe("file")
    expect(permissionIcon("webfetch")).toBe("globe")
    expect(permissionIcon("something_else")).toBe("shield")
  })

  test("a domain is the prefix", () => {
    expect(toolDomain("cad_extrude", "extrude")).toBe("CAD")
    expect(toolDomain(undefined, "commit")).toBe("COMMIT")
  })
})
