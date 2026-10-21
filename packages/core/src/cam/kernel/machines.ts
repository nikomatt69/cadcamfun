/**
 * Machine presets of the CAM kernel: the limits the cutting data must respect and the post that writes the NC. They are
 * typical figures of each class of machine, not a qualified digital twin (spec 29 §8, §14): a shop enters its own
 * machine's spindle curve, feeds and post.
 */
import type { KernelMachine } from "./contracts.ts"

export const MACHINES: ReadonlyArray<KernelMachine> = [
  {
    id: "vmc-standard", name: "Vertical machining centre (BT40, 12 000 rpm, 11 kW)", post: "fanuc",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" },
    table: { length: 1000, width: 500, gap: 30 }, rapidFeed: 30000, toolChangeSeconds: 6
  },
  {
    id: "haas-vf2", name: "Haas VF-2 class (8 100 rpm, 22 kW)", post: "haas",
    limits: { maxRpm: 8100, minRpm: 50, maxFeed: 16500, powerKw: 22.4, torqueNm: 122, rigidity: "standard" },
    table: { length: 762, width: 406, gap: 30 }, rapidFeed: 25400, toolChangeSeconds: 4
  },
  {
    // Native Sinumerik language (post "siemens"): drilling is written as moves and threads are milled, see post/siemens.ts.
    id: "siemens-840d-vmc", name: "Siemens 840D sl vertical mill (BT40, 12 000 rpm, 13 kW)", post: "siemens",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 15000, powerKw: 13, torqueNm: 80, rigidity: "standard" },
    table: { length: 800, width: 500, gap: 30 }, rapidFeed: 30000, toolChangeSeconds: 5
  },
  {
    id: "hsc-mill", name: "High-speed mill (HSK-E40, 30 000 rpm, 7 kW)", post: "generic",
    limits: { maxRpm: 30000, minRpm: 3000, maxFeed: 20000, powerKw: 7, torqueNm: 8, rigidity: "standard" },
    table: { length: 600, width: 400, gap: 30 }, rapidFeed: 40000, toolChangeSeconds: 5
  },
  {
    id: "desktop-mill", name: "Benchtop mill (10 000 rpm, 0.75 kW)", post: "generic",
    limits: { maxRpm: 10000, minRpm: 300, maxFeed: 3000, powerKw: 0.75, torqueNm: 3, rigidity: "light" },
    table: { length: 300, width: 200, gap: 15 }, rapidFeed: 3000, toolChangeSeconds: 30
  },
  {
    // The kernel writes machine coordinates (tool centre point in the program), so the post must not add the controller's TCP command.
    id: "trunnion-5ax", name: "5-axis trunnion (BT40, 12 000 rpm, A/C table, 11 kW)", post: "fanuc",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" },
    // Typical trunnion: the rotation centre sits about 100 mm below the work origin on the table top (a shop enters its own).
    table: { length: 600, width: 400, gap: 30 }, fiveAxis: { layout: "table-AC", pivot: { x: 0, y: 0, z: -100 }, tilt: [-120, 120] }, rapidFeed: 30000, toolChangeSeconds: 6
  },
  {
    id: "cnc-router", name: "CNC router (24 000 rpm spindle, 2.2 kW)", post: "grbl",
    limits: { maxRpm: 24000, minRpm: 6000, maxFeed: 6000, powerKw: 2.2, torqueNm: 1.2, rigidity: "hobby" },
    table: { length: 1200, width: 900, gap: 20 }, rapidFeed: 8000, toolChangeSeconds: 30
  }
]

export const DEFAULT_MACHINE: KernelMachine = MACHINES[0]!

export const findMachine = (id: string): KernelMachine | undefined => MACHINES.find((m) => m.id === id)
