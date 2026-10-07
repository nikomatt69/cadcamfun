import { MODE_PROMPTS, CADCAM_SYSTEM_PROMPT } from "../../src/prompts/system.ts"
/** Every instruction text the model gets besides tool prompts and skills. */
export const SYSTEM_TEXTS = (): string[] => [CADCAM_SYSTEM_PROMPT, ...Object.values(MODE_PROMPTS)]
