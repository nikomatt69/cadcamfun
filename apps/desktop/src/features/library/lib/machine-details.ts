/**
 * What a machine configuration says, laid out for its detail page: every figure the machine profile carries, grouped the way a
 * machine data sheet groups them, and the envelope the 3D preview draws. Both are read through the machine profile, so a
 * configuration written in any older shape shows the same figures. A figure the machine does not state is left out, never
 * invented: the page says what the configuration says.
 */
import { cam } from "@cadcamfun/core"

export type MachineProfile = ReturnType<typeof cam.kernel.profileOfConfig>

export interface MachineFact { readonly label: string; readonly value: string }
export interface MachineSection { readonly title: string; readonly facts: ReadonlyArray<MachineFact> }

const trim = (value: number): string => String(Number(value.toFixed(3)))
const unit = (value: number | undefined, suffix: string): string | undefined => value === undefined ? undefined : `${trim(value)} ${suffix}`
const range = (min: number, max: number, suffix: string): string => `${trim(min)} … ${trim(max)} ${suffix}`
const words = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

const fact = (label: string, value: string | undefined): ReadonlyArray<MachineFact> => value === undefined || value === "" ? [] : [{ label, value }]

/** The sections of the details tab, in data-sheet order; a section with nothing to say is not listed. */
export const machineSections = (profile: MachineProfile): ReadonlyArray<MachineSection> => {
  const sections: Array<MachineSection> = []
  const add = (title: string, facts: ReadonlyArray<MachineFact>): void => { if (facts.length > 0) sections.push({ title, facts }) }
  const controller = profile.controller
  add("Machine", [
    ...fact("Type", words(profile.kind)),
    ...fact("Controller", controller),
    ...fact("Post", profile.post ?? (controller === undefined ? undefined : cam.kernel.postOfController(controller))),
    ...fact("Axes", profile.axes === undefined ? undefined : String(profile.axes)),
    ...fact("Rigidity", profile.rigidity === undefined ? undefined : words(profile.rigidity))
  ])
  add("Axes", (profile.axisTable ?? []).flatMap((axis) => fact(
    `${axis.id} (${axis.kind})`,
    `${range(axis.min, axis.max, axis.kind === "rotary" ? "°" : "mm")}${axis.continuous === true ? ", continuous" : ""}${axis.sense === -1 ? ", reversed" : ""}`
  )))
  const spindle = profile.spindle
  add("Spindle", spindle === undefined ? [] : [
    ...fact("Max speed", unit(spindle.maxRpm, "rpm")), ...fact("Min speed", unit(spindle.minRpm, "rpm")),
    ...fact("Power", unit(spindle.powerKw, "kW")), ...fact("Torque", unit(spindle.torqueNm, "N·m"))
  ])
  add("Feeds", profile.feed === undefined ? [] : [...fact("Max feed", unit(profile.feed.max, "mm/min")), ...fact("Rapid traverse", unit(profile.feed.rapid, "mm/min"))])
  const volume = profile.workVolume, travel = profile.travel, table = profile.table
  add("Work area", [
    ...fact("Work volume", volume === undefined ? undefined : `${trim(volume.x)} × ${trim(volume.y)} × ${trim(volume.z)} mm`),
    ...(travel === undefined ? [] : [
      ...fact("Travel X", range(travel.minX, travel.maxX, "mm")), ...fact("Travel Y", range(travel.minY, travel.maxY, "mm")), ...fact("Travel Z", range(travel.minZ, travel.maxZ, "mm"))
    ]),
    ...fact("Table", table === undefined ? undefined : `${trim(table.length)} × ${trim(table.width)} mm`),
    ...fact("Gap under the stock", table === undefined ? undefined : unit(table.gap, "mm"))
  ])
  const rotary = profile.rotary
  add("Rotary table", rotary === undefined ? [] : [
    ...fact("Layout", rotary.layout), ...fact("Tilt", rotary.tilt === undefined ? undefined : range(rotary.tilt.min, rotary.tilt.max, "°")),
    ...fact("Rotation", rotary.rotation === undefined ? undefined : range(rotary.rotation.min, rotary.rotation.max, "°")),
    ...fact("Pivot", rotary.pivot === undefined ? undefined : `${trim(rotary.pivot.x)}, ${trim(rotary.pivot.y)}, ${trim(rotary.pivot.z)} mm`),
    ...fact("Tool centre point", rotary.tcp === undefined ? undefined : rotary.tcp === "control" ? "Applied by the control" : "Program in machine coordinates")
  ])
  const turning = profile.turning
  add("Turning", turning === undefined ? [] : [
    ...fact("Max bar diameter", unit(turning.maxBarDiameter, "mm")), ...fact("Max bar length", unit(turning.maxBarLength, "mm")), ...fact("Chuck diameter", unit(turning.chuckDiameter, "mm")),
    ...fact("B head", turning.b === undefined ? undefined : range(turning.b.min, turning.b.max, "°")), ...fact("C spindle", turning.c === undefined ? undefined : `${range(turning.c.min, turning.c.max, "°")}${turning.continuousC === true ? ", continuous" : ""}`),
    ...fact("Y travel", unit(turning.yTravel, "mm")), ...fact("Turret", turning.turret === undefined ? undefined : words(turning.turret))
  ])
  const changer = profile.toolChanger
  add("Tool changer", changer === undefined ? [] : [
    ...fact("Type", changer.type === undefined ? undefined : words(changer.type)), ...fact("Capacity", changer.capacity === undefined ? undefined : `${changer.capacity} tools`),
    ...fact("Change time", unit(changer.changeSeconds, "s")), ...fact("Max tool diameter", unit(changer.maxToolDiameter, "mm")), ...fact("Max tool length", unit(changer.maxToolLength, "mm"))
  ])
  add("Coolant", profile.coolant === undefined ? [] : fact("Modes", profile.coolant.modes.length === 0 ? "None" : profile.coolant.modes.join(", ")))
  const probing = profile.probing
  add("Probing", probing === undefined ? [] : [
    ...fact("Cycles", probing.cycles === undefined || probing.cycles.length === 0 ? undefined : probing.cycles.join(", ")),
    ...fact("Stylus radius", unit(probing.stylusRadius, "mm")), ...fact("Probe feed", unit(probing.feed, "mm/min")), ...fact("Dialect", probing.dialect)
  ])
  const accuracy = profile.accuracy
  add("Accuracy", accuracy === undefined ? [] : [...fact("Positioning", unit(accuracy.positioningMm, "mm")), ...fact("Repeatability", unit(accuracy.repeatabilityMm, "mm")), ...fact("Spindle runout", unit(accuracy.runoutMm, "mm"))])
  const printer = profile.printer
  add("Printer", printer === undefined ? [] : [
    ...fact("Technology", printer.technology),
    ...fact("Bed", printer.bed === undefined ? undefined : `${trim(printer.bed.width)} × ${trim(printer.bed.depth)} mm${printer.bed.origin === "center" ? ", origin in the centre" : ""}`),
    ...fact("Build height", unit(printer.buildHeight, "mm")), ...fact("Nozzle", unit(printer.nozzleDiameter, "mm")), ...fact("Filament", unit(printer.filamentDiameter, "mm")),
    ...fact("Max nozzle temperature", unit(printer.maxNozzleTemperature, "°C")), ...fact("Max bed temperature", unit(printer.maxBedTemperature, "°C")), ...fact("Max speed", unit(printer.maxSpeed, "mm/s")),
    ...fact("Kinematics", printer.kinematics), ...fact("Firmware", printer.flavor), ...fact("Extruder", printer.extruder)
  ])
  add("Source", [...fact("Figures from", profile.reference?.source), ...fact("Notes", profile.reference?.notes)])
  return sections
}

/** What the 3D preview draws: the space the part takes, the table under it or the printer's plate, and whether a rotary table turns. */
export interface MachineEnvelope {
  readonly kind: MachineProfile["kind"]
  readonly volume: { readonly x: number; readonly y: number; readonly z: number } | undefined
  readonly table: { readonly length: number; readonly width: number } | undefined
  readonly rotary: boolean
}

export const machineEnvelope = (profile: MachineProfile): MachineEnvelope => {
  const printer = profile.printer, travel = profile.travel
  const volume = printer?.bed !== undefined && printer.buildHeight !== undefined ? { x: printer.bed.width, y: printer.bed.depth, z: printer.buildHeight }
    : profile.workVolume ?? (travel === undefined ? undefined : { x: travel.maxX - travel.minX, y: travel.maxY - travel.minY, z: travel.maxZ - travel.minZ })
  const table = printer?.bed !== undefined ? { length: printer.bed.width, width: printer.bed.depth }
    : profile.table !== undefined ? { length: profile.table.length, width: profile.table.width }
    : undefined
  const usable = volume !== undefined && volume.x > 0 && volume.y > 0 && volume.z > 0
  return { kind: profile.kind, volume: usable ? volume : undefined, table: table !== undefined && table.length > 0 && table.width > 0 ? table : undefined, rotary: profile.rotary !== undefined }
}
