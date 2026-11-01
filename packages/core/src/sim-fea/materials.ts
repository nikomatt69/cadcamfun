/**
 * Engineering materials of the simulation (spec 48 §2): the elastic, thermal and strength data a study needs, in the units
 * handbooks print (E in GPa, density kg/m³, conductivity W/(m·K), specific heat J/(kg·K), expansion 1/K, strengths in MPa).
 * `toSolverUnits` converts to the solver's consistent set: mm, N, MPa, tonne, s, mJ, K.
 *
 * Values are typical handbook numbers at room temperature for the named grade, not certified supplier data. A study may
 * override any of them.
 */
export type Ductility = "ductile" | "brittle"

/** The failure criteria a result can be judged against (Fusion's stress types). */
export type FailureCriterion = "von_mises" | "tresca" | "max_principal" | "mohr_coulomb"

export interface Material {
  readonly id: string
  readonly name: string
  readonly family: "steel" | "stainless" | "aluminium" | "titanium" | "copper" | "nickel" | "cast-iron" | "polymer" | "magnesium"
  readonly ductility: Ductility
  /** Young's modulus, GPa. */
  readonly youngGPa: number
  readonly poisson: number
  /** kg/m³. */
  readonly density: number
  /** Yield (0.2 % proof) strength, MPa. For brittle materials the ultimate tensile strength is the working limit. */
  readonly yieldMPa: number
  readonly ultimateMPa: number
  /** Ultimate compressive strength, MPa; defaults to the tensile value for ductile grades. */
  readonly compressiveMPa?: number
  /** W/(m·K). */
  readonly conductivity: number
  /** J/(kg·K). */
  readonly specificHeat: number
  /** Linear thermal expansion, 1/K. */
  readonly expansion: number
  /** Highest service temperature, °C (a thermal result above it is flagged). */
  readonly maxServiceC?: number
  /** Fully reversed fatigue limit at 10^7 cycles, MPa (when the grade has one). */
  readonly enduranceMPa?: number
}

const m = (x: Material): Material => x

export const MATERIALS: ReadonlyArray<Material> = [
  m({ id: "steel-s235", name: "Structural steel S235", family: "steel", ductility: "ductile", youngGPa: 210, poisson: 0.3, density: 7850, yieldMPa: 235, ultimateMPa: 360, conductivity: 50, specificHeat: 490, expansion: 12e-6, maxServiceC: 400, enduranceMPa: 160 }),
  m({ id: "steel-c45", name: "Carbon steel C45", family: "steel", ductility: "ductile", youngGPa: 210, poisson: 0.3, density: 7850, yieldMPa: 490, ultimateMPa: 700, conductivity: 46, specificHeat: 470, expansion: 11.5e-6, maxServiceC: 400, enduranceMPa: 300 }),
  m({ id: "steel-42crmo4", name: "Alloy steel 42CrMo4 (QT)", family: "steel", ductility: "ductile", youngGPa: 210, poisson: 0.29, density: 7850, yieldMPa: 800, ultimateMPa: 1000, conductivity: 42, specificHeat: 460, expansion: 12.3e-6, maxServiceC: 450, enduranceMPa: 480 }),
  m({ id: "steel-tool-d2", name: "Tool steel D2 (hardened)", family: "steel", ductility: "ductile", youngGPa: 210, poisson: 0.28, density: 7700, yieldMPa: 1500, ultimateMPa: 1900, conductivity: 20, specificHeat: 460, expansion: 10.4e-6, maxServiceC: 400 }),
  m({ id: "stainless-304", name: "Stainless steel 304", family: "stainless", ductility: "ductile", youngGPa: 193, poisson: 0.29, density: 8000, yieldMPa: 215, ultimateMPa: 505, conductivity: 16, specificHeat: 500, expansion: 17.3e-6, maxServiceC: 800, enduranceMPa: 240 }),
  m({ id: "stainless-316l", name: "Stainless steel 316L", family: "stainless", ductility: "ductile", youngGPa: 193, poisson: 0.3, density: 8000, yieldMPa: 205, ultimateMPa: 515, conductivity: 16, specificHeat: 500, expansion: 16e-6, maxServiceC: 800, enduranceMPa: 240 }),
  m({ id: "stainless-17-4ph", name: "Stainless steel 17-4PH (H1025)", family: "stainless", ductility: "ductile", youngGPa: 197, poisson: 0.27, density: 7800, yieldMPa: 1000, ultimateMPa: 1070, conductivity: 18, specificHeat: 460, expansion: 10.8e-6, maxServiceC: 315 }),
  m({ id: "aluminium-6061-t6", name: "Aluminium 6061-T6", family: "aluminium", ductility: "ductile", youngGPa: 68.9, poisson: 0.33, density: 2700, yieldMPa: 276, ultimateMPa: 310, conductivity: 167, specificHeat: 896, expansion: 23.6e-6, maxServiceC: 150, enduranceMPa: 96 }),
  m({ id: "aluminium-7075-t6", name: "Aluminium 7075-T6", family: "aluminium", ductility: "ductile", youngGPa: 71.7, poisson: 0.33, density: 2810, yieldMPa: 503, ultimateMPa: 572, conductivity: 130, specificHeat: 960, expansion: 23.4e-6, maxServiceC: 120, enduranceMPa: 159 }),
  m({ id: "aluminium-5083", name: "Aluminium 5083-H111", family: "aluminium", ductility: "ductile", youngGPa: 70.3, poisson: 0.33, density: 2660, yieldMPa: 145, ultimateMPa: 290, conductivity: 117, specificHeat: 900, expansion: 23.8e-6, maxServiceC: 100 }),
  m({ id: "titanium-ti6al4v", name: "Titanium Ti-6Al-4V", family: "titanium", ductility: "ductile", youngGPa: 113.8, poisson: 0.342, density: 4430, yieldMPa: 880, ultimateMPa: 950, conductivity: 6.7, specificHeat: 526, expansion: 8.6e-6, maxServiceC: 350, enduranceMPa: 510 }),
  m({ id: "copper-c11000", name: "Copper C11000 (ETP)", family: "copper", ductility: "ductile", youngGPa: 117, poisson: 0.34, density: 8940, yieldMPa: 70, ultimateMPa: 220, conductivity: 388, specificHeat: 385, expansion: 17e-6, maxServiceC: 200 }),
  m({ id: "brass-c360", name: "Brass C36000 (free-cutting)", family: "copper", ductility: "ductile", youngGPa: 97, poisson: 0.31, density: 8500, yieldMPa: 310, ultimateMPa: 385, conductivity: 115, specificHeat: 380, expansion: 20.5e-6, maxServiceC: 200 }),
  m({ id: "inconel-718", name: "Inconel 718", family: "nickel", ductility: "ductile", youngGPa: 200, poisson: 0.29, density: 8190, yieldMPa: 1030, ultimateMPa: 1240, conductivity: 11.4, specificHeat: 435, expansion: 13e-6, maxServiceC: 650, enduranceMPa: 480 }),
  m({ id: "cast-iron-gg25", name: "Grey cast iron EN-GJL-250", family: "cast-iron", ductility: "brittle", youngGPa: 110, poisson: 0.26, density: 7200, yieldMPa: 250, ultimateMPa: 250, compressiveMPa: 850, conductivity: 46, specificHeat: 500, expansion: 11e-6, maxServiceC: 350 }),
  m({ id: "cast-iron-gjs400", name: "Ductile iron EN-GJS-400-15", family: "cast-iron", ductility: "ductile", youngGPa: 169, poisson: 0.275, density: 7100, yieldMPa: 250, ultimateMPa: 400, conductivity: 36, specificHeat: 500, expansion: 11.5e-6, maxServiceC: 350 }),
  m({ id: "magnesium-az31b", name: "Magnesium AZ31B", family: "magnesium", ductility: "ductile", youngGPa: 45, poisson: 0.35, density: 1770, yieldMPa: 200, ultimateMPa: 260, conductivity: 96, specificHeat: 1000, expansion: 26e-6, maxServiceC: 120 }),
  m({ id: "pla", name: "PLA (printed)", family: "polymer", ductility: "brittle", youngGPa: 3.5, poisson: 0.36, density: 1240, yieldMPa: 50, ultimateMPa: 50, compressiveMPa: 80, conductivity: 0.13, specificHeat: 1800, expansion: 68e-6, maxServiceC: 55 }),
  m({ id: "abs", name: "ABS", family: "polymer", ductility: "ductile", youngGPa: 2.3, poisson: 0.35, density: 1050, yieldMPa: 40, ultimateMPa: 44, conductivity: 0.17, specificHeat: 1400, expansion: 90e-6, maxServiceC: 85 }),
  m({ id: "petg", name: "PETG", family: "polymer", ductility: "ductile", youngGPa: 2.1, poisson: 0.38, density: 1270, yieldMPa: 50, ultimateMPa: 53, conductivity: 0.2, specificHeat: 1200, expansion: 60e-6, maxServiceC: 70 }),
  m({ id: "nylon-pa12", name: "Nylon PA12", family: "polymer", ductility: "ductile", youngGPa: 1.7, poisson: 0.4, density: 1010, yieldMPa: 45, ultimateMPa: 48, conductivity: 0.23, specificHeat: 1700, expansion: 100e-6, maxServiceC: 90 })
]

export const materialById = (id: string): Material | undefined => MATERIALS.find((x) => x.id === id)

/** A material or the overrides of one, as a study carries it. */
export interface MaterialSpec {
  readonly id?: string
  readonly overrides?: Partial<Omit<Material, "id" | "name" | "family">> & { readonly name?: string }
}

export const resolveMaterial = (spec: MaterialSpec): Material | undefined => {
  const base = spec.id !== undefined ? materialById(spec.id) : undefined
  if (spec.id !== undefined && base === undefined) return undefined
  const fallback: Material = base ?? { id: "custom", name: "Custom", family: "steel", ductility: "ductile", youngGPa: 210, poisson: 0.3, density: 7850, yieldMPa: 235, ultimateMPa: 360, conductivity: 50, specificHeat: 490, expansion: 12e-6 }
  return { ...fallback, ...(spec.overrides ?? {}), id: spec.id ?? "custom" }
}

/** Solver units: E and strengths in MPa, density in tonne/mm³, conductivity in mJ/(s·mm·K), specific heat in mJ/(tonne·K). */
export interface SolverMaterial {
  readonly E: number
  readonly nu: number
  readonly rho: number
  readonly alpha: number
  readonly k: number
  readonly cp: number
  readonly yield: number
  readonly ultimate: number
  readonly compressive: number
  readonly ductility: Ductility
}

export const toSolverUnits = (x: Material): SolverMaterial => ({
  E: x.youngGPa * 1000,
  nu: x.poisson,
  rho: x.density * 1e-12,
  alpha: x.expansion,
  k: x.conductivity,
  cp: x.specificHeat * 1e6,
  yield: x.yieldMPa,
  ultimate: x.ultimateMPa,
  compressive: x.compressiveMPa ?? x.ultimateMPa,
  ductility: x.ductility
})

/** Criterion a material is judged by when the study does not say: ductile → von Mises, brittle → Mohr–Coulomb. */
export const defaultCriterion = (x: Material): FailureCriterion => x.ductility === "ductile" ? "von_mises" : "mohr_coulomb"
