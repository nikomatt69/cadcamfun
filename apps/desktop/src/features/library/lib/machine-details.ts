/**
 * What a machine configuration says, laid out for its detail page: every figure the machine profile carries, grouped the way a
 * machine data sheet groups them, and the envelope the 3D preview draws. Both are read through the machine profile, so a
 * configuration written in any older shape shows the same figures. A figure the machine does not state is left out, never
 * invented: the page says what the configuration says.
 */
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"

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
  add(t("library.machine.section.machine"), [
    ...fact(t("library.field.type"), words(profile.kind)),
    ...fact(t("library.field.controller"), controller),
    ...fact(t("library.machine.post"), profile.post ?? (controller === undefined ? undefined : cam.kernel.postOfController(controller))),
    ...fact(t("cam.axes"), profile.axes === undefined ? undefined : String(profile.axes)),
    ...fact(t("library.detail.rigidity"), profile.rigidity === undefined ? undefined : words(profile.rigidity))
  ])
  add(t("cam.axes"), (profile.axisTable ?? []).flatMap((axis) => fact(
    `${axis.id} (${axis.kind})`,
    `${range(axis.min, axis.max, axis.kind === "rotary" ? "°" : "mm")}${axis.continuous === true ? t("library.machine.continuous") : ""}${axis.sense === -1 ? t("library.machine.reversed") : ""}`
  )))
  const spindle = profile.spindle
  add(t("library.machine.section.spindle"), spindle === undefined ? [] : [
    ...fact(t("library.machine.maxSpeed"), unit(spindle.maxRpm, "rpm")), ...fact(t("library.machine.minSpeed"), unit(spindle.minRpm, "rpm")),
    ...fact(t("library.machine.power"), unit(spindle.powerKw, "kW")), ...fact(t("library.machine.torque"), unit(spindle.torqueNm, "N·m"))
  ])
  add(t("library.machine.section.feeds"), profile.feed === undefined ? [] : [...fact(t("library.detail.maxFeed"), unit(profile.feed.max, "mm/min")), ...fact(t("library.machine.rapid"), unit(profile.feed.rapid, "mm/min"))])
  const volume = profile.workVolume, travel = profile.travel, table = profile.table
  add(t("library.machine.section.work"), [
    ...fact(t("library.machine.workVolume"), volume === undefined ? undefined : `${trim(volume.x)} × ${trim(volume.y)} × ${trim(volume.z)} mm`),
    ...(travel === undefined ? [] : [
      ...fact(t("library.machine.travelX"), range(travel.minX, travel.maxX, "mm")), ...fact(t("library.machine.travelY"), range(travel.minY, travel.maxY, "mm")), ...fact(t("library.machine.travelZ"), range(travel.minZ, travel.maxZ, "mm"))
    ]),
    ...fact(t("library.machine.table"), table === undefined ? undefined : `${trim(table.length)} × ${trim(table.width)} mm`),
    ...fact(t("library.machine.gap"), table === undefined ? undefined : unit(table.gap, "mm"))
  ])
  const rotary = profile.rotary
  add(t("library.machine.section.rotary"), rotary === undefined ? [] : [
    ...fact(t("library.machine.layout"), rotary.layout), ...fact(t("library.machine.tilt"), rotary.tilt === undefined ? undefined : range(rotary.tilt.min, rotary.tilt.max, "°")),
    ...fact(t("library.machine.rotation"), rotary.rotation === undefined ? undefined : range(rotary.rotation.min, rotary.rotation.max, "°")),
    ...fact(t("library.machine.pivot"), rotary.pivot === undefined ? undefined : `${trim(rotary.pivot.x)}, ${trim(rotary.pivot.y)}, ${trim(rotary.pivot.z)} mm`),
    ...fact(t("library.machine.tcp"), rotary.tcp === undefined ? undefined : rotary.tcp === "control" ? t("library.machine.tcpControl") : t("library.machine.tcpProgram"))
  ])
  const turning = profile.turning
  add(t("library.detail.turning"), turning === undefined ? [] : [
    ...fact(t("library.machine.maxBarDiameter"), unit(turning.maxBarDiameter, "mm")), ...fact(t("library.machine.maxBarLength"), unit(turning.maxBarLength, "mm")), ...fact(t("library.machine.chuck"), unit(turning.chuckDiameter, "mm")),
    ...fact(t("library.machine.bHead"), turning.b === undefined ? undefined : range(turning.b.min, turning.b.max, "°")), ...fact(t("library.machine.cSpindle"), turning.c === undefined ? undefined : `${range(turning.c.min, turning.c.max, "°")}${turning.continuousC === true ? t("library.machine.continuous") : ""}`),
    ...fact(t("library.machine.yTravel"), unit(turning.yTravel, "mm")), ...fact(t("library.machine.turret"), turning.turret === undefined ? undefined : words(turning.turret))
  ])
  const changer = profile.toolChanger
  add(t("library.machine.section.changer"), changer === undefined ? [] : [
    ...fact(t("library.field.type"), changer.type === undefined ? undefined : words(changer.type)), ...fact(t("library.machine.capacity"), changer.capacity === undefined ? undefined : t("library.machine.toolCount", { count: changer.capacity })),
    ...fact(t("library.machine.changeTime"), unit(changer.changeSeconds, "s")), ...fact(t("library.machine.maxToolDiameter"), unit(changer.maxToolDiameter, "mm")), ...fact(t("library.machine.maxToolLength"), unit(changer.maxToolLength, "mm"))
  ])
  add(t("library.detail.coolant"), profile.coolant === undefined ? [] : fact(t("library.machine.modes"), profile.coolant.modes.length === 0 ? t("library.machine.none") : profile.coolant.modes.join(", ")))
  const probing = profile.probing
  add(t("library.machine.section.probing"), probing === undefined ? [] : [
    ...fact(t("library.machine.cycles"), probing.cycles === undefined || probing.cycles.length === 0 ? undefined : probing.cycles.join(", ")),
    ...fact(t("library.machine.stylus"), unit(probing.stylusRadius, "mm")), ...fact(t("library.machine.probeFeed"), unit(probing.feed, "mm/min")), ...fact(t("library.machine.dialect"), probing.dialect)
  ])
  const accuracy = profile.accuracy
  add(t("library.machine.section.accuracy"), accuracy === undefined ? [] : [...fact(t("library.machine.positioning"), unit(accuracy.positioningMm, "mm")), ...fact(t("library.machine.repeatability"), unit(accuracy.repeatabilityMm, "mm")), ...fact(t("library.machine.runout"), unit(accuracy.runoutMm, "mm"))])
  const printer = profile.printer
  add(t("library.machine.section.printer"), printer === undefined ? [] : [
    ...fact(t("library.machine.technology"), printer.technology),
    ...fact(t("library.machine.bed"), printer.bed === undefined ? undefined : `${trim(printer.bed.width)} × ${trim(printer.bed.depth)} mm${printer.bed.origin === "center" ? t("library.machine.originCentre") : ""}`),
    ...fact(t("library.machine.buildHeight"), unit(printer.buildHeight, "mm")), ...fact(t("library.machine.nozzle"), unit(printer.nozzleDiameter, "mm")), ...fact(t("library.machine.filament"), unit(printer.filamentDiameter, "mm")),
    ...fact(t("library.machine.maxNozzle"), unit(printer.maxNozzleTemperature, "°C")), ...fact(t("library.machine.maxBed"), unit(printer.maxBedTemperature, "°C")), ...fact(t("library.machine.maxSpeed"), unit(printer.maxSpeed, "mm/s")),
    ...fact(t("library.machine.kinematics"), printer.kinematics), ...fact(t("library.machine.firmware"), printer.flavor), ...fact(t("library.machine.extruder"), printer.extruder)
  ])
  add(t("library.machine.section.source"), [...fact(t("library.machine.figuresFrom"), profile.reference?.source), ...fact(t("library.detail.notes"), profile.reference?.notes)])
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
