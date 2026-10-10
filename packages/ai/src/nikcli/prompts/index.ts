/// <reference path="../../text.d.ts" />
import type { SubagentId } from "../agents.ts"
import basics from "./basics.txt" with { type: "text" }
import report from "./report.txt" with { type: "text" }
import researcher from "./researcher.txt" with { type: "text" }
import editor from "./editor.txt" with { type: "text" }
import modeler from "./modeler.txt" with { type: "text" }
import machinist from "./machinist.txt" with { type: "text" }
import reviewer from "./reviewer.txt" with { type: "text" }

const roles = { researcher, editor, modeler, machinist, reviewer } satisfies Record<SubagentId, string>

/** Like nikcli's agent/prompt files: common contract, role method, then its report. */
export const specialistPrompt = (role: SubagentId): string =>
  `${basics.trim()}\n\n${roles[role].replace("{{report}}", () => report.trim()).trim()}`
