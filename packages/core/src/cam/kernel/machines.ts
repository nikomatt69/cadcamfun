/**
 * Machine presets of the CAM kernel: the limits the cutting data must respect and the post that writes the NC. They are
 * typical figures of each class of machine, not a qualified digital twin (spec 29 §8, §14): a shop enters its own
 * machine's spindle curve, feeds and post.
 *
 * Two catalogues, because the two kinds of machine are not the same thing:
 *   - `MACHINES`  milling centres: the kernel's `runJob` plans and cuts with them.
 *   - `LATHES`    turning and mill-turn centres: the part turns, and a mill-turn adds a B head and a positioned C
 *                 spindle. The milling kernel refuses them; the turning plan bounds the bar with them.
 *
 * A preset that names a published machine carries its source and its assumptions: a catalogue stroke is not an absolute
 * work-coordinate bound, and the rotary pivot, the chuck and the datum are calibration, not data.
 */
import type { KernelMachine } from "./contracts.ts"

const kernMicroHd = (taper: "hsk25" | "hsk40"): KernelMachine => ({
  id: `kern-micro-hd-${taper}`, name: `KERN Micro HD ${taper === "hsk25" ? "HSK25 (50 000 rpm, 6 kW)" : "HSK40 (42 000 rpm, 15 kW)"} B/C`,
  kind: "mill", post: "heidenhain",
  limits: { maxRpm: taper === "hsk25" ? 50000 : 42000, minRpm: 1000, maxFeed: 60000, powerKw: taper === "hsk25" ? 6 : 15, torqueNm: taper === "hsk25" ? 1.6 : 5.9, rigidity: "standard" },
  fiveAxis: { layout: "table-BC", tilt: [-110, 110], pivot: { x: 0, y: 0, z: -100 } },
  table: { length: 350, width: 350, gap: 30 }, rapidFeed: 60000, toolChangeSeconds: 3,
  reference: {
    controller: "Heidenhain TNC7", source: "https://www.kern-microtechnik.com/en/Products/Machines/Kern-Micro-HD", stroke: { x: 350, y: 220, z: 250 },
    assumptions: ["Work origin, rotary pivot and clamping geometry must be calibrated; pivot Z=-100 mm and table envelope are preview assumptions", "The active TNC preset must match the program datum; no TCP/PLANE transformation is emitted", "Minimum spindle speed 1000 rpm is a conservative planning assumption; published stroke is not an absolute work-coordinate bound"]
  }
})

/**
 * A Mazak INTEGREX i-200 class mill-turn centre: the part turns in the main spindle (C, continuous), the B axis tilts
 * the milling spindle and the Y axis moves it off centre. Published figures (Mazak INTEGREX i-200 series brochure):
 * X 535 mm, Y 210 mm, Z 1020 mm, B -30..+210 degrees, C continuous, main spindle 5000 rpm / 22 kW, milling spindle
 * HSK-A63 12 000 rpm / 18.5 kW.
 */
const mazakIntegrexI200: KernelMachine = {
  id: "mazak-integrex-i200", name: "Mazak INTEGREX i-200 class mill-turn (B head, Y axis, C spindle)", kind: "lathe", post: "fanuc",
  limits: { maxRpm: 12000, minRpm: 50, maxFeed: 40000, powerKw: 18.5, torqueNm: 120, rigidity: "standard" },
  turning: { maxBarDiameter: 65, maxBarLength: 590, chuckDiameter: 200, b: [-30, 210], c: [-180, 180], continuousC: true, yTravel: 210, turret: "rear" },
  rapidFeed: 40000, toolChangeSeconds: 4,
  reference: {
    controller: "Mazatrol SmoothAi (Fanuc-compatible)", source: "Mazak INTEGREX i-200 series brochure (mmsonline.com mirror)",
    stroke: { x: 535, y: 210, z: 1020 },
    assumptions: ["The published travels are axis travels, not work-coordinate limits; the chuck, the turret and the datum must be calibrated", "The turning spindle (5000 rpm / 22 kW) and the milling spindle (12 000 rpm / 18.5 kW) are different spindles: the limit here is the milling spindle", "C is a continuous axis; the B head indexes -30..+210 degrees"]
  }
}

/**
 * An Okuma MULTUS B300II class mill-turn centre: an H1 turret whose head tilts on a B axis, a compound Y axis and a
 * full-contouring C axis. Published figures (Okuma MULTUS BII series brochure): X 580 mm, Z 935 mm, Y 160 mm,
 * B -30..+195 degrees, C 360 degrees, main spindle 45..5000 rpm / 15 kW, milling spindle 50..6000 rpm / 11 kW.
 */
const okumaMultusB300: KernelMachine = {
  id: "okuma-multus-b300ii", name: "Okuma MULTUS B300II class mill-turn (B head, Y axis, C spindle)", kind: "lathe", post: "fanuc",
  limits: { maxRpm: 10000, minRpm: 50, maxFeed: 26000, powerKw: 11, torqueNm: 65.7, rigidity: "standard" },
  turning: { maxBarDiameter: 65, maxBarLength: 900, chuckDiameter: 200, b: [-30, 195], c: [-180, 180], yTravel: 160, turret: "rear" },
  rapidFeed: 26000, toolChangeSeconds: 4,
  reference: {
    controller: "Okuma OSP-P500 (Fanuc-compatible)", source: "Okuma MULTUS BII series brochure (okuma.com)",
    stroke: { x: 580, y: 160, z: 935 },
    assumptions: ["The published travels are axis travels, not work-coordinate limits; the chuck, the turret and the datum must be calibrated", "The milling spindle is 6000 rpm (10 000 rpm as an option); the limit here is the standard spindle", "C indexes 360 degrees (0.001 degrees); B indexes -30..+195 degrees"]
  }
}

/**
 * A plain 2-axis CNC lathe: the part turns in the chuck, the tool travels in X (diameter) and Z. Figures of the class,
 * not of a named machine: the shop's own lathe is a machine configuration of its own.
 */
const latheStandard: KernelMachine = {
  id: "lathe-standard", name: "CNC lathe, 2 axes (C spindle, X/Z turret)", kind: "lathe", post: "fanuc",
  limits: { maxRpm: 4000, minRpm: 50, maxFeed: 12000, powerKw: 15, torqueNm: 100, rigidity: "standard" },
  turning: { maxBarDiameter: 52, maxBarLength: 500, chuckDiameter: 200, c: [-180, 180], turret: "rear" },
  rapidFeed: 12000, toolChangeSeconds: 4
}

export const MACHINES: ReadonlyArray<KernelMachine> = [
  {
    id: "vmc-standard", name: "Vertical machining centre (BT40, 12 000 rpm, 11 kW)", kind: "mill", post: "fanuc",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" },
    table: { length: 1000, width: 500, gap: 30 }, rapidFeed: 30000, toolChangeSeconds: 6
  },
  {
    id: "haas-2", name: "Haas VF-2 class (8 100 rpm, 22 kW)", kind: "mill", post: "haas",
    limits: { maxRpm: 8100, minRpm: 50, maxFeed: 16500, powerKw: 22.4, torqueNm: 122, rigidity: "standard" },
    table: { length: 762, width: 406, gap: 30 }, rapidFeed: 25400, toolChangeSeconds: 4
  },
  {
    // Native Sinumerik language (post "siemens"): drilling is written as moves and threads are milled, see post/siemens.ts.
    id: "siemens-840d-vmc", name: "Siemens 840D sl vertical mill (BT40, 12 000 rpm, 13 kW)", kind: "mill", post: "siemens",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 15000, powerKw: 13, torqueNm: 80, rigidity: "standard" },
    table: { length: 800, width: 500, gap: 30 }, rapidFeed: 30000, toolChangeSeconds: 5
  },
  {
    id: "hsc-mill", name: "High-speed mill (HSK-E40, 30 000 rpm, 7 kW)", kind: "mill", post: "generic",
    limits: { maxRpm: 30000, minRpm: 3000, maxFeed: 20000, powerKw: 7, torqueNm: 8, rigidity: "standard" },
    table: { length: 600, width: 400, gap: 30 }, rapidFeed: 40000, toolChangeSeconds: 5
  },
  {
    id: "desktop-mill", name: "Benchtop mill (10 000 rpm, 0.75 kW)", kind: "mill", post: "generic",
    limits: { maxRpm: 10000, minRpm: 300, maxFeed: 3000, powerKw: 0.75, torqueNm: 3, rigidity: "light" },
    table: { length: 300, width: 200, gap: 15 }, rapidFeed: 3000, toolChangeSeconds: 30
  },
  {
    // The kernel writes machine coordinates (tool centre point in the program), so the post must not add the controller's TCP command.
    id: "trunnion-5ax", name: "5-axis trunnion (BT40, 12 000 rpm, A/C table, 11 kW)", kind: "mill", post: "fanuc",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" },
    // Typical trunnion: the rotation centre sits about 100 mm below the work origin on the table top (a shop enters its own).
    table: { length: 600, width: 400, gap: 30 }, fiveAxis: { layout: "table-AC", pivot: { x: 0, y: 0, z: -100 }, tilt: [-120, 120] }, rapidFeed: 30000, toolChangeSeconds: 6
  },
  {
    // Same trunnion class turned about Y instead of X: the program carries B (tilt) and C (rotation) words together.
    id: "trunnion-5ax-bc", name: "5-axis trunnion B/C (BT40, 12 000 rpm, B/C table, 11 kW)", kind: "mill", post: "fanuc",
    limits: { maxRpm: 12000, minRpm: 100, maxFeed: 12000, powerKw: 11, torqueNm: 70, rigidity: "standard" },
    table: { length: 600, width: 400, gap: 30 }, fiveAxis: { layout: "table-BC", pivot: { x: 0, y: 0, z: -100 }, tilt: [-120, 120] }, rapidFeed: 30000, toolChangeSeconds: 6
  },
  {
    id: "cnc-router", name: "CNC router (24 000 rpm spindle, 2.2 kW)", kind: "mill", post: "grbl",
    limits: { maxRpm: 24000, minRpm: 6000, maxFeed: 6000, powerKw: 2.2, torqueNm: 1.2, rigidity: "hobby" },
    table: { length: 1200, width: 900, gap: 20 }, rapidFeed: 8000, toolChangeSeconds: 30
  },
  kernMicroHd("hsk25"),
  kernMicroHd("hsk40")
]

/** Turning and mill-turn centres: the part turns here, so the milling kernel refuses them. */
export const LATHES: ReadonlyArray<KernelMachine> = [latheStandard, mazakIntegrexI200, okumaMultusB300]

/** Every machine of the catalogue, milling centres first. */
export const MACHINE_CATALOGUE: ReadonlyArray<KernelMachine> = [...MACHINES, ...LATHES]

export const DEFAULT_MACHINE: KernelMachine = MACHINES[0]!

export const findMachine = (id: string): KernelMachine | undefined => MACHINE_CATALOGUE.find((m) => m.id === id)

/** The turning centres of the catalogue, the ones a turning plan may bound the bar with. */
export const findLathe = (id: string): KernelMachine | undefined => LATHES.find((m) => m.id === id)
