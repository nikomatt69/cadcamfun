import { Schema } from "effect"
import { Geometry } from "@cadcamfun/core"

export const Controller = Schema.Literals(["grbl", "fanuc", "linuxcnc", "heidenhain", "marlin"])
export type Controller = typeof Controller.Type

export const MachineKind = Schema.Literals(["mill", "router", "lathe", "laser", "printer"])
export type MachineKind = typeof MachineKind.Type

export const Machine = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.optional(MachineKind),
  description: Schema.optional(Schema.String),
  controller: Controller,
  minRpm: Geometry.NonNegative,
  maxRpm: Geometry.Positive,
  /** Max cutting feed, mm/min. */
  maxFeed: Geometry.Positive,
  /** Rapid traverse rate, mm/min (used for time estimates). */
  rapidFeed: Geometry.Positive,
  workArea: Geometry.Vec3,
  /** Automatic tool changer available (otherwise tool changes pause the program). */
  toolChanger: Schema.Boolean,
  /** Coolant supported (emits M8/M9 when a tool requests it). */
  coolant: Schema.optional(Schema.Boolean),
})
export type Machine = typeof Machine.Type

export const presets: ReadonlyArray<Machine> = [
  {
    id: "hobby-grbl",
    name: "Hobby router (GRBL)",
    controller: "grbl",
    minRpm: 8000,
    maxRpm: 24000,
    maxFeed: 3000,
    rapidFeed: 5000,
    workArea: { x: 600, y: 400, z: 100 },
    toolChanger: false,
  },
  {
    id: "vmc-fanuc",
    name: "VMC (Fanuc)",
    controller: "fanuc",
    minRpm: 100,
    maxRpm: 10000,
    maxFeed: 10000,
    rapidFeed: 30000,
    workArea: { x: 800, y: 500, z: 500 },
    toolChanger: true,
  },
  {
    id: "mill-linuxcnc",
    name: "Mill (LinuxCNC)",
    controller: "linuxcnc",
    minRpm: 300,
    maxRpm: 6000,
    maxFeed: 4000,
    rapidFeed: 8000,
    workArea: { x: 500, y: 300, z: 350 },
    toolChanger: false,
  },
]
