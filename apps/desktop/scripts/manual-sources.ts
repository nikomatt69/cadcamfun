export interface ManualIndex {
  readonly id: string
  readonly publisher: string
  readonly category: "machines" | "controllers" | "programming" | "modeling" | "cam" | "printing" | "tooling" | "formats"
  readonly collection: string
  readonly url: string
  readonly prefixes: readonly string[]
  readonly limit: number
  readonly topics: readonly string[]
  readonly alternateHosts?: readonly string[]
}

/** Indexes only: refreshing the catalogue never downloads the linked manuals. */
export const manualIndexes: readonly ManualIndex[] = [
  { id: "haas-mill", publisher: "Haas Automation", category: "machines", collection: "Haas mill operator manual", url: "https://haascnc.com/service/online-operator-s-manuals/mill-operator-s-manual.html", prefixes: ["/service/online-operator-s-manuals/mill-operator-s-manual/"], limit: 22, topics: ["haas", "mill", "safety", "setup", "maintenance"], alternateHosts: ["www.haascnc.com", "legacy-aem.haascnc.com"] },
  { id: "haas-lathe", publisher: "Haas Automation", category: "machines", collection: "Haas lathe operator manual", url: "https://haascnc.com/service/online-operator-s-manuals/lathe-operator-s-manual.html", prefixes: ["/service/online-operator-s-manuals/lathe-operator-s-manual/"], limit: 22, topics: ["haas", "lathe", "turning", "setup", "maintenance"], alternateHosts: ["www.haascnc.com", "legacy-aem.haascnc.com"] },
  { id: "linuxcnc", publisher: "LinuxCNC", category: "controllers", collection: "LinuxCNC 2.9 documentation", url: "https://linuxcnc.org/docs/2.9/html/", prefixes: ["/docs/2.9/html/"], limit: 70, topics: ["linuxcnc", "generic", "cnc", "milling", "turning", "configuration"] },
  { id: "grbl", publisher: "Grbl", category: "controllers", collection: "Grbl CNC controller documentation", url: "https://github.com/gnea/grbl/wiki", prefixes: ["/gnea/grbl/wiki/"], limit: 12, topics: ["grbl", "router", "laser", "gcode", "homing", "settings"] },
  { id: "grblhal", publisher: "grblHAL", category: "controllers", collection: "grblHAL CNC controller documentation", url: "https://github.com/grblHAL/core/wiki", prefixes: ["/grblHAL/core/wiki/"], limit: 12, topics: ["grbl", "grblhal", "router", "cnc", "probing"] },
  { id: "marlin", publisher: "Marlin Firmware", category: "programming", collection: "Marlin G-code reference", url: "https://marlinfw.org/docs/gcode/", prefixes: ["/docs/gcode/"], limit: 30, topics: ["marlin", "gcode", "mcode", "3d printer", "additive"] },
  { id: "klipper", publisher: "Klipper", category: "printing", collection: "Klipper setup and calibration guides", url: "https://www.klipper3d.org/Overview.html", prefixes: ["/"], limit: 28, topics: ["klipper", "3d printer", "calibration", "bed leveling", "pressure advance"] },
  { id: "blender-mesh", publisher: "Blender Foundation", category: "modeling", collection: "Blender mesh modeling manual", url: "https://docs.blender.org/manual/en/latest/modeling/meshes/index.html", prefixes: ["/manual/en/latest/modeling/meshes/"], limit: 48, topics: ["blender", "3d modeling", "mesh", "extrude", "bevel", "topology"] },
  { id: "blender-curves", publisher: "Blender Foundation", category: "modeling", collection: "Blender curves and surfaces manual", url: "https://docs.blender.org/manual/en/latest/modeling/curves/index.html", prefixes: ["/manual/en/latest/modeling/curves/"], limit: 25, topics: ["blender", "3d modeling", "curves", "nurbs", "bezier"] },
  { id: "blender-modifiers", publisher: "Blender Foundation", category: "modeling", collection: "Blender modeling modifiers manual", url: "https://docs.blender.org/manual/en/latest/modeling/modifiers/index.html", prefixes: ["/manual/en/latest/modeling/modifiers/"], limit: 35, topics: ["blender", "3d modeling", "modifiers", "boolean", "solidify", "mirror"] },
  { id: "cadquery", publisher: "CadQuery Project", category: "modeling", collection: "CadQuery parametric modeling manual", url: "https://cadquery.readthedocs.io/en/latest/", prefixes: ["/en/latest/"], limit: 18, topics: ["cadquery", "parametric", "solid", "sketch", "assembly", "step"] },
  { id: "build123d", publisher: "build123d Project", category: "modeling", collection: "build123d solid modeling manual", url: "https://build123d.readthedocs.io/en/latest/", prefixes: ["/en/latest/"], limit: 18, topics: ["build123d", "solid", "sketch", "parametric", "assembly"] },
  { id: "opencascade", publisher: "Open Cascade", category: "formats", collection: "Open CASCADE geometry and data exchange guides", url: "https://dev.opencascade.org/doc/overview/html/user_guides.html", prefixes: ["/doc/overview/html/"], limit: 25, topics: ["opencascade", "occt", "brep", "step", "iges", "stl", "geometry"], alternateHosts: ["occt3d.com"] },
]
