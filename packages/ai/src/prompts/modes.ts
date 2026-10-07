/**
 * Assistant modes (legacy `AssistantMode`, ported from `.reference/src/lib/ai/aiAssistant.ts`).
 *
 * Each mode biases the system prompt and the suggested starter questions toward a
 * CAD/CAM sub-domain. The mode text itself lives next to the prompt it is appended to
 * (`prompts/system.ts`), so that module stays the single owner of the system prompt.
 */

import { Schema } from "effect"
import { MODE_PROMPTS, modeFor, systemPrompt } from "./system.ts"

export const ASSISTANT_MODES = ["cad", "cam", "gcode", "toolpath", "general"] as const

export type AssistantMode = (typeof ASSISTANT_MODES)[number]

export const isAssistantMode = (value: string): value is AssistantMode =>
  (ASSISTANT_MODES as ReadonlyArray<string>).includes(value)

/** Effect Schema for AssistantMode; lets the rest of the app decode HTTP payloads uniformly. */
export const AssistantModeSchema = Schema.Literals(ASSISTANT_MODES)

/** Starter questions shown in the assistant sidebar (legacy `SUGGESTED_PROMPTS`). */
export const SUGGESTED_PROMPTS: Readonly<Record<AssistantMode, ReadonlyArray<string>>> = {
  cad: [
    "How do I create a complex shape?",
    "What's the best approach for designing gears?",
    "Can you explain boolean operations?"
  ],
  cam: [
    "How do I optimize cutting paths?",
    "What feeds and speeds should I use for aluminium?",
    "What's the difference between roughing and finishing?"
  ],
  gcode: [
    "Can you help me debug this G-code issue?",
    "How do I set up tool compensation?",
    "What's the best way to handle tool changes?"
  ],
  toolpath: [
    "How do I create a contour toolpath?",
    "What's the best strategy for pocketing?",
    "How can I optimize my toolpaths for speed?"
  ],
  general: [
    "How do I get started with CAD/CAM?",
    "What's the difference between CAD and CAM?",
    "Can you recommend resources for learning more?"
  ]
}

/**
 * Compose the system prompt for a given mode + project context.
 * Argument order follows the legacy helper; `systemPrompt(context, mode)` is the
 * canonical form and this stays as the readability alias for prompt callers.
 */
export const systemPromptFor = (mode: string | undefined, context?: string): string =>
  systemPrompt(context, mode)

/** Returns just the mode-specific prefix (handy for tests and templates). */
export const modePrefix = (mode: string | undefined): string => MODE_PROMPTS[modeFor(mode)]
