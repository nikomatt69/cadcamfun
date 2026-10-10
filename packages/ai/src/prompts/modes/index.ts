/// <reference path="../../text.d.ts" />
import type { AssistantMode } from "../modes.ts"
import cad from "./cad.txt" with { type: "text" }
import cam from "./cam.txt" with { type: "text" }
import gcode from "./gcode.txt" with { type: "text" }
import toolpath from "./toolpath.txt" with { type: "text" }
import general from "./general.txt" with { type: "text" }

/** Domain guidance is separate from the agent role and its enforced permissions. */
export const MODE_PROMPTS: Readonly<Record<AssistantMode, string>> = { cad: cad.trim(), cam: cam.trim(), gcode: gcode.trim(), toolpath: toolpath.trim(), general: general.trim() }
