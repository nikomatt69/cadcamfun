import type { ResourceKind, ResourceRow } from "./client"

/** Pure resource-list logic shared by the list and detail screens (desktop parity rules). */

export type VisibilityFilter = "all" | "public" | "private"

export interface ResourceFilters {
  readonly search: string
  readonly type: string
  readonly visibility: VisibilityFilter
}

export const filterResources = (rows: readonly ResourceRow[], filters: ResourceFilters): ResourceRow[] => {
  const needle = filters.search.trim().toLowerCase()
  return rows
    .filter((row) => needle === "" || `${row.name} ${row.description ?? ""} ${row.type ?? ""} ${row.material ?? ""}`.toLowerCase().includes(needle))
    .filter((row) => filters.type === "" || (row.type ?? "") === filters.type)
    .filter((row) => filters.visibility === "all" || (filters.visibility === "public") === (row.isPublic === true))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const resourceTypes = (rows: readonly ResourceRow[]): string[] =>
  [...new Set(rows.map((row) => row.type ?? "").filter((value) => value !== ""))].sort()

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const dash = (value: unknown): string => (value === null || value === undefined || value === "" ? "—" : String(value))

export interface ResourceFact { readonly label: string; readonly value: string }

/** Card/detail facts, mirroring the desktop Resources screens per kind. */
export function resourceFacts(kind: ResourceKind, row: ResourceRow): ResourceFact[] {
  if (kind === "materials") {
    const properties = record(row.properties)
    return [
      { label: "Density", value: `${dash(properties["density"])} kg/m³` },
      { label: "Hardness", value: dash(properties["hardness"]) },
      { label: "Visibility", value: row.isPublic ? "Public" : "Private" },
    ]
  }
  if (kind === "tools") {
    return [
      { label: "Diameter", value: `${dash(row.diameter)} mm` },
      { label: "Material", value: dash(row.material) },
      { label: "Flutes", value: dash(row.numberOfFlutes) },
      { label: "Max RPM", value: dash(row.maxRPM) },
      { label: "Visibility", value: row.isPublic ? "Public" : "Private" },
    ]
  }
  const config = record(row.config)
  const volume = record(config["workVolume"])
  const kinematics = record(config["kinematics"])
  const axis = (name: string): unknown => volume[name] ?? record(kinematics[name])["max"]
  const envelope = [axis("x"), axis("y"), axis("z")].every((v) => typeof v === "number") ? `${axis("x")}×${axis("y")}×${axis("z")} mm` : "—"
  return [
    { label: "Controller", value: dash(config["controller"] ?? config["postProcessor"]) },
    { label: "Max spindle", value: `${dash(config["maxSpindleSpeed"] ?? config["maxRPM"])} rpm` },
    { label: "Envelope", value: envelope },
    { label: "Visibility", value: row.isPublic ? "Public" : "Private" },
  ]
}

export const resourceSubtitle = (kind: ResourceKind, row: ResourceRow): string =>
  resourceFacts(kind, row).slice(0, 2).map((fact) => `${fact.label}: ${fact.value}`).join(" · ")
