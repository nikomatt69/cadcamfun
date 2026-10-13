/**
 * What the catalogue says about the surface, derived rather than written twice.
 *
 * The per-verb ids this file used to list are gone: an action is declared once in `actions/catalogue.ts`, and the
 * tools, the permission classes, the specialists' allow-lists and the UI's renames are all derived from it. The only
 * names here are the groupings the host needs (read-only tools, the actions the application contributes), so that a
 * specialist's allow-list and the host's registrations cannot disagree.
 */
import { ACTION_CATALOGUE, ACTION_TOOL_IDS, toolKind } from "../actions/catalogue.ts"

/** Every tool id the host registers for a project: the catalogue's, in catalogue order. */
export const TOOL_IDS = ACTION_TOOL_IDS

/** The tools that only read: safe for a read-only specialist, whatever actions they carry. */
export const READ_TOOL_IDS: ReadonlyArray<string> = ACTION_TOOL_IDS.filter((tool) => toolKind(tool) === "read")

/** The tools whose kind is not `read`: a specialist that may not change anything has none of them. */
export const WRITE_TOOL_IDS: ReadonlyArray<string> = ACTION_TOOL_IDS.filter((tool) => toolKind(tool) !== "read")

/** Tools with a destructive action: the host registers them as `ask` (one native confirmation per tool). */
export const DESTRUCTIVE_TOOL_IDS: ReadonlyArray<string> = ACTION_TOOL_IDS.filter((tool) => toolKind(tool) === "destructive")

/** Every action id, `tool.action`. */
export const ACTION_IDS: ReadonlyArray<string> = ACTION_CATALOGUE.map((action) => action.id)

/**
 * The keys the application must contribute implementations for (libraries, version control, delegation). The sidecar
 * builds exactly this map; the drift guard compares the two, so a contributed action cannot exist without one.
 */
export const CONTRIBUTION_KEYS: ReadonlyArray<string> = ACTION_CATALOGUE.flatMap((action) => (action.contributed === undefined ? [] : [action.contributed]))