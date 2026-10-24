/**
 * Filament data: density (mass of a print), the temperatures it prints at, how much cooling it takes and the volume of melt
 * the nozzle delivers per second before the bead under-extrudes. Typical figures of the common grades; a shop's own spool
 * (its maker's datasheet) replaces them through the print settings.
 */
export interface Filament {
  readonly id: string
  readonly name: string
  /** g/cm^3 */
  readonly densityGcm3: number
  readonly nozzleTemperature: number
  readonly bedTemperature: number
  /** Part cooling, %. */
  readonly fan: number
  /** mm^3/s a 0.4 mm hotend delivers. */
  readonly maxVolumetricFlow: number
  readonly notes?: string
}

export const FILAMENTS: ReadonlyArray<Filament> = [
  { id: "pla", name: "PLA", densityGcm3: 1.24, nozzleTemperature: 205, bedTemperature: 60, fan: 100, maxVolumetricFlow: 15 },
  { id: "petg", name: "PETG", densityGcm3: 1.27, nozzleTemperature: 235, bedTemperature: 80, fan: 50, maxVolumetricFlow: 11 },
  { id: "abs", name: "ABS", densityGcm3: 1.04, nozzleTemperature: 245, bedTemperature: 100, fan: 20, maxVolumetricFlow: 14, notes: "Warps: print in an enclosure" },
  { id: "asa", name: "ASA", densityGcm3: 1.07, nozzleTemperature: 245, bedTemperature: 100, fan: 20, maxVolumetricFlow: 14, notes: "Warps: print in an enclosure" },
  { id: "tpu", name: "TPU (flexible)", densityGcm3: 1.21, nozzleTemperature: 225, bedTemperature: 45, fan: 60, maxVolumetricFlow: 3.6, notes: "Slow and with little retraction" },
  { id: "nylon", name: "Nylon (PA)", densityGcm3: 1.14, nozzleTemperature: 260, bedTemperature: 80, fan: 0, maxVolumetricFlow: 10, notes: "Absorbs water: dry the spool" },
  { id: "pc", name: "Polycarbonate (PC)", densityGcm3: 1.2, nozzleTemperature: 270, bedTemperature: 110, fan: 0, maxVolumetricFlow: 12, notes: "Needs an all-metal hotend and an enclosure" }
]

/** The grade a material name asks for ("PLA", "petg", "Flexible TPU 95A"); `undefined` for anything that is not a filament. */
export const findFilament = (name: string | undefined): Filament | undefined => {
  const key = (name ?? "").trim().toLowerCase()
  if (key === "") return undefined
  const exact = FILAMENTS.find((f) => f.id === key || f.name.toLowerCase() === key)
  if (exact !== undefined) return exact
  if (/\bpetg?\b|\bpet-g\b/.test(key)) return FILAMENTS[1]
  if (/\babs\b/.test(key)) return FILAMENTS[2]
  if (/\basa\b/.test(key)) return FILAMENTS[3]
  if (/\btpu\b|\btpe\b|flex/.test(key)) return FILAMENTS[4]
  if (/nylon|\bpa\d*\b|\bpa-?cf\b/.test(key)) return FILAMENTS[5]
  if (/polycarbonate|\bpc\b/.test(key)) return FILAMENTS[6]
  if (/\bpla\b|plastic/.test(key)) return FILAMENTS[0]
  return undefined
}
