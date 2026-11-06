/**
 * The mass of a part: its volume times the density of its material. The density comes from the CAM material library (grade, EN or
 * AISI number, trade name), the same table the cutting data use, so a part and its toolpath agree on what the stock is. Nothing here
 * measures geometry: the volume is the one the kernel reported (exact when every body has an exact model).
 */
import { cam } from "@cadcamfun/core"

export interface MaterialDensity {
  /** The grade as the library names it (or the text given, for a generic family). */
  readonly name: string
  /** g/cm^3. */
  readonly densityGcm3: number
  /** `library`: a grade of the CAM material library; `user-library`: a row of the user's own library; `generic`: a family word (steel, aluminium) with its handbook density. */
  readonly source: "library" | "user-library" | "generic"
}

/** The words a person writes for a family when no grade is given; the density is the handbook value. */
const GENERIC: ReadonlyArray<readonly [RegExp, number]> = [[/steel/i, 7.85], [/alumin|\b6082\b/i, 2.7]]

/** The density of a material named by designation, or `undefined` when the library does not know it. */
export const densityOfMaterial = (name: string): MaterialDensity | undefined => {
  const trimmed = name.trim()
  const found = trimmed === "" ? undefined : cam.kernel.findMaterial(trimmed)
  if (found !== undefined) return { name: found.name, densityGcm3: found.density, source: "library" }
  const generic = GENERIC.find(([pattern]) => pattern.test(trimmed))
  return generic === undefined ? undefined : { name: trimmed, densityGcm3: generic[1], source: "generic" }
}

/**
 * The density written in a user library row (`properties.density`): g/cm^3, or kg/m^3 when the number is 100 or more (the densest
 * metal is 22.6 g/cm^3, so a value that large can only be kg/m^3).
 */
export const densityOfLibraryRow = (name: string, properties: unknown): MaterialDensity | undefined => {
  const raw = typeof properties === "object" && properties !== null ? (properties as Record<string, unknown>)["density"] : undefined
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : Number.NaN
  if (!Number.isFinite(value) || value <= 0) return undefined
  const densityGcm3 = value >= 100 ? value / 1000 : value
  return densityGcm3 > 25 ? undefined : { name, densityGcm3, source: "user-library" }
}

/** The material an element carries: `metadata.material`, else `material` (the field the scene analysis reads too). */
export const materialOfElement = (element: Readonly<Record<string, unknown>>): string | undefined => {
  const meta = element["metadata"]
  const fromMeta = typeof meta === "object" && meta !== null ? (meta as Record<string, unknown>)["material"] : undefined
  const value = typeof fromMeta === "string" ? fromMeta : typeof element["material"] === "string" ? (element["material"] as string) : undefined
  return value === undefined || value.trim() === "" ? undefined : value.trim()
}

/** Grams of a volume in mm^3 of a material in g/cm^3. */
export const massGrams = (volumeMm3: number, densityGcm3: number): number => (volumeMm3 * densityGcm3) / 1000
