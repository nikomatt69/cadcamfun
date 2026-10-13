/**
 * Workpiece materials of the CAM kernel (spec 29 §3 "material parameters").
 *
 * Each grade carries what a cutting-data calculation needs, in the units the handbooks use:
 *  - ISO 513 machinability group (P steel, M stainless, K cast iron, N non-ferrous and non-metals, S heat-resistant and
 *    titanium, H hardened) and a finer family;
 *  - Kienzle specific cutting force `kc11` (N/mm² at a 1 mm chip) and its exponent `mc`: kc = kc11 · h^-mc;
 *  - cutting speed Vc (m/min) for a coated carbide and an HSS cutter, roughing and finishing;
 *  - chip load `fz10` (mm/tooth) of a 10 mm end mill in side milling, and the drill feed per revolution of a 10 mm drill;
 *  - the engagement limits, ramp angle, coolant and chip behaviour the strategies must respect.
 *
 * The values are conservative starting values gathered from public tool-maker handbooks (order of magnitude of Sandvik
 * Coromant, Kennametal and Machinery's Handbook tables). They are not a supplier's certified data for a particular
 * cutter: `cutting-data.ts` reports them as recommendations with their source, and a tool library entry can override
 * them per cutter.
 */
import type { Coolant } from "../ir.ts"

export type IsoGroup = "P" | "M" | "K" | "N" | "S" | "H"

export type MaterialFamily =
  | "aluminium-wrought"
  | "aluminium-cast"
  | "copper"
  | "brass"
  | "bronze"
  | "steel-low-carbon"
  | "steel-medium-carbon"
  | "steel-alloy"
  | "steel-tool"
  | "stainless-austenitic"
  | "stainless-martensitic"
  | "stainless-duplex"
  | "cast-iron-grey"
  | "cast-iron-ductile"
  | "titanium"
  | "nickel-superalloy"
  | "steel-hardened"
  | "thermoplastic"
  | "thermoset"
  | "wood-soft"
  | "wood-hard"
  | "wood-board"
  | "composite-carbon"
  | "composite-glass"
  | "foam"

/** Cutting speed window, m/min. */
export interface SpeedPair {
  readonly rough: number
  readonly finish: number
}

export interface WorkpieceMaterial {
  readonly id: string
  readonly name: string
  /** Other names the material is known by (EN, AISI, UNS, trade names, the legacy generator family). */
  readonly aliases: ReadonlyArray<string>
  readonly iso: IsoGroup
  readonly family: MaterialFamily
  /** g/cm³. */
  readonly density: number
  /** Brinell hardness (HRC for the hardened grades is in `hardnessHRC`). */
  readonly hardnessHB: number
  readonly hardnessHRC?: number
  readonly tensileMPa: number
  /** Kienzle specific cutting force at h = 1 mm, N/mm². */
  readonly kc11: number
  /** Kienzle exponent. */
  readonly mc: number
  /** Cutting speed of a coated carbide end mill, m/min. */
  readonly vcCarbide: SpeedPair
  /** Cutting speed of an HSS / HSS-Co end mill, m/min; `undefined` = HSS is not suitable. */
  readonly vcHss: SpeedPair | undefined
  /** Chip load of a 10 mm end mill in side milling (ae ≤ D/2), mm/tooth. */
  readonly fz10: number
  /** Feed per revolution of a 10 mm drill, mm/rev. */
  readonly drillFeed10: number
  /** Drilling speed of a carbide drill as a share of the milling `vcCarbide.rough`. */
  readonly drillSpeedFactor: number
  /** Largest axial depth of a full-width slot, × D. */
  readonly slotAp: number
  /** Side milling (contour roughing): axial depth × D and radial engagement × D. */
  readonly sideAp: number
  readonly sideAe: number
  /** Adaptive / trochoidal clearing: radial engagement × D (axial depth is the flute length, up to 2·D). */
  readonly adaptiveAe: number
  /** Largest ramp angle of an entry into the material, degrees. */
  readonly rampAngle: number
  /** Stock left for finishing after roughing, mm. */
  readonly finishAllowance: number
  readonly coolant: Coolant
  /** Long, stringy chips: drill with a chip-breaking peck. */
  readonly stringyChips: boolean
  /** Peck depth of a drill as a multiple of its diameter when the hole is deep (L/D above 3). */
  readonly peckFactor: number
  /**
   * Smallest chip load that still cuts instead of rubbing / melting, mm/tooth (plastics, work-hardening alloys). A
   * clamped spindle speed is compensated by feed only down to this value.
   */
  readonly minFz: number
  /** Radial passes of a thread mill. */
  readonly threadPasses: number
  readonly notes: ReadonlyArray<string>
}

const m = (x: WorkpieceMaterial): WorkpieceMaterial => x

export const MATERIALS: ReadonlyArray<WorkpieceMaterial> = [
  // ------------------------------------------------------------ N: aluminium, copper alloys
  m({
    id: "al-6061-t6", name: "Aluminium 6061-T6", aliases: ["6061", "AlMg1SiCu", "EN AW-6061", "aluminum", "aluminium", "alluminio", "anticorodal"],
    iso: "N", family: "aluminium-wrought", density: 2.7, hardnessHB: 95, tensileMPa: 310, kc11: 600, mc: 0.25,
    vcCarbide: { rough: 400, finish: 550 }, vcHss: { rough: 90, finish: 120 }, fz10: 0.08, drillFeed10: 0.25, drillSpeedFactor: 0.6,
    slotAp: 1, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 5, finishAllowance: 0.2,
    coolant: "flood", stringyChips: false, peckFactor: 1.5, minFz: 0.01, threadPasses: 1,
    notes: ["Use polished uncoated, ZrN or DLC flutes (2-3 flutes); AlTiN builds up an edge in aluminium.", "Evacuate chips: re-cutting chips is the main cause of broken cutters."]
  }),
  m({
    id: "al-7075-t6", name: "Aluminium 7075-T6", aliases: ["7075", "AlZn5.5MgCu", "EN AW-7075", "ergal"],
    iso: "N", family: "aluminium-wrought", density: 2.81, hardnessHB: 150, tensileMPa: 570, kc11: 700, mc: 0.25,
    vcCarbide: { rough: 350, finish: 500 }, vcHss: { rough: 80, finish: 110 }, fz10: 0.07, drillFeed10: 0.22, drillSpeedFactor: 0.6,
    slotAp: 1, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 5, finishAllowance: 0.2,
    coolant: "flood", stringyChips: false, peckFactor: 1.5, minFz: 0.01, threadPasses: 1,
    notes: ["Harder than 6061: shorter chips, better surface, higher cutting forces."]
  }),
  m({
    id: "al-5083", name: "Aluminium 5083", aliases: ["5083", "AlMg4.5Mn", "EN AW-5083", "peraluman"],
    iso: "N", family: "aluminium-wrought", density: 2.66, hardnessHB: 75, tensileMPa: 290, kc11: 580, mc: 0.25,
    vcCarbide: { rough: 380, finish: 500 }, vcHss: { rough: 80, finish: 110 }, fz10: 0.07, drillFeed10: 0.22, drillSpeedFactor: 0.6,
    slotAp: 0.8, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 4, finishAllowance: 0.25,
    coolant: "flood", stringyChips: true, peckFactor: 1, minFz: 0.015, threadPasses: 1,
    notes: ["Gummy: sharp polished flutes, plenty of coolant, avoid dwelling."]
  }),
  m({
    id: "al-cast", name: "Cast aluminium AlSi (A356 / AlSi10Mg)", aliases: ["A356", "AlSi10Mg", "AlSi7Mg", "cast aluminium", "pressofuso"],
    iso: "N", family: "aluminium-cast", density: 2.68, hardnessHB: 75, tensileMPa: 230, kc11: 750, mc: 0.25,
    vcCarbide: { rough: 300, finish: 400 }, vcHss: { rough: 70, finish: 90 }, fz10: 0.07, drillFeed10: 0.2, drillSpeedFactor: 0.6,
    slotAp: 1, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 5, finishAllowance: 0.2,
    coolant: "flood", stringyChips: false, peckFactor: 2, minFz: 0.01, threadPasses: 1,
    notes: ["Silicon is abrasive: diamond (PCD / CVD) or DLC tools last longest."]
  }),
  m({
    id: "brass-cuzn39pb3", name: "Free-cutting brass CuZn39Pb3", aliases: ["CW614N", "C38500", "brass", "ottone", "OT58"],
    iso: "N", family: "brass", density: 8.47, hardnessHB: 110, tensileMPa: 430, kc11: 780, mc: 0.25,
    vcCarbide: { rough: 250, finish: 350 }, vcHss: { rough: 70, finish: 90 }, fz10: 0.06, drillFeed10: 0.2, drillSpeedFactor: 0.7,
    slotAp: 1, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 5, finishAllowance: 0.15,
    coolant: "mist", stringyChips: false, peckFactor: 2, minFz: 0.01, threadPasses: 1,
    notes: ["Neutral or slightly negative rake: a positive-rake cutter can grab and pull in."]
  }),
  m({
    id: "copper-etp", name: "Copper Cu-ETP", aliases: ["CW004A", "C11000", "copper", "rame"],
    iso: "N", family: "copper", density: 8.94, hardnessHB: 60, tensileMPa: 230, kc11: 1050, mc: 0.25,
    vcCarbide: { rough: 200, finish: 300 }, vcHss: { rough: 50, finish: 70 }, fz10: 0.05, drillFeed10: 0.15, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.12, rampAngle: 3, finishAllowance: 0.2,
    coolant: "flood", stringyChips: true, peckFactor: 1, minFz: 0.015, threadPasses: 2,
    notes: ["Gummy and ductile: very sharp edges, high positive rake, chip-breaking pecks."]
  }),
  m({
    id: "bronze-cusn12", name: "Tin bronze CuSn12", aliases: ["CC483K", "C90800", "bronze", "bronzo"],
    iso: "N", family: "bronze", density: 8.7, hardnessHB: 95, tensileMPa: 280, kc11: 900, mc: 0.25,
    vcCarbide: { rough: 180, finish: 250 }, vcHss: { rough: 45, finish: 60 }, fz10: 0.05, drillFeed10: 0.15, drillSpeedFactor: 0.7,
    slotAp: 0.6, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.12, rampAngle: 4, finishAllowance: 0.2,
    coolant: "flood", stringyChips: false, peckFactor: 1.5, minFz: 0.01, threadPasses: 2,
    notes: []
  }),
  // ------------------------------------------------------------ P: steels
  m({
    id: "steel-s235", name: "Structural steel S235JR / 1018", aliases: ["S235", "S235JR", "Fe360", "1018", "1020", "C15", "mild steel", "ferro"],
    iso: "P", family: "steel-low-carbon", density: 7.85, hardnessHB: 120, tensileMPa: 400, kc11: 1500, mc: 0.25,
    vcCarbide: { rough: 200, finish: 250 }, vcHss: { rough: 30, finish: 40 }, fz10: 0.06, drillFeed10: 0.2, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.1, rampAngle: 3, finishAllowance: 0.25,
    coolant: "flood", stringyChips: true, peckFactor: 1, minFz: 0.01, threadPasses: 2,
    notes: ["Low carbon steel smears: keep the feed up so the edge cuts rather than rubs."]
  }),
  m({
    id: "steel-c45", name: "Carbon steel C45 / 1045", aliases: ["C45", "1045", "Ck45", "CK45", "steel", "acciaio"],
    iso: "P", family: "steel-medium-carbon", density: 7.85, hardnessHB: 190, tensileMPa: 650, kc11: 1600, mc: 0.25,
    vcCarbide: { rough: 170, finish: 220 }, vcHss: { rough: 25, finish: 32 }, fz10: 0.055, drillFeed10: 0.18, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.1, rampAngle: 3, finishAllowance: 0.25,
    coolant: "flood", stringyChips: true, peckFactor: 1, minFz: 0.01, threadPasses: 2,
    notes: ["AlTiN / TiAlN coated carbide; flood or dry with air blast at high speed."]
  }),
  m({
    id: "steel-42crmo4", name: "Alloy steel 42CrMo4 / 4140 (QT)", aliases: ["42CrMo4", "4140", "4142", "39NiCrMo3", "alloy steel"],
    iso: "P", family: "steel-alloy", density: 7.85, hardnessHB: 280, tensileMPa: 950, kc11: 1900, mc: 0.25,
    vcCarbide: { rough: 140, finish: 180 }, vcHss: { rough: 18, finish: 24 }, fz10: 0.05, drillFeed10: 0.15, drillSpeedFactor: 0.6,
    slotAp: 0.4, sideAp: 1, sideAe: 0.35, adaptiveAe: 0.1, rampAngle: 2, finishAllowance: 0.25,
    coolant: "flood", stringyChips: true, peckFactor: 1, minFz: 0.01, threadPasses: 2,
    notes: []
  }),
  m({
    id: "steel-tool-p20", name: "Mould steel 1.2311 / P20 (pre-hardened ~30 HRC)", aliases: ["1.2311", "1.2738", "P20", "40CrMnMo7", "tool steel"],
    iso: "P", family: "steel-tool", density: 7.85, hardnessHB: 300, hardnessHRC: 30, tensileMPa: 1000, kc11: 2000, mc: 0.25,
    vcCarbide: { rough: 120, finish: 160 }, vcHss: { rough: 15, finish: 20 }, fz10: 0.045, drillFeed10: 0.13, drillSpeedFactor: 0.6,
    slotAp: 0.3, sideAp: 1, sideAe: 0.3, adaptiveAe: 0.08, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: false, peckFactor: 1, minFz: 0.01, threadPasses: 2,
    notes: []
  }),
  // ------------------------------------------------------------ M: stainless
  m({
    id: "stainless-304", name: "Stainless steel 1.4301 / 304", aliases: ["1.4301", "304", "AISI 304", "X5CrNi18-10", "stainless", "inox", "acciaio inox"],
    iso: "M", family: "stainless-austenitic", density: 7.9, hardnessHB: 180, tensileMPa: 600, kc11: 2000, mc: 0.21,
    vcCarbide: { rough: 110, finish: 140 }, vcHss: { rough: 15, finish: 20 }, fz10: 0.045, drillFeed10: 0.12, drillSpeedFactor: 0.6,
    slotAp: 0.3, sideAp: 1, sideAe: 0.3, adaptiveAe: 0.08, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.75, minFz: 0.025, threadPasses: 3,
    notes: ["Work-hardens: never dwell or rub, keep a chip load of at least 0.025 mm/tooth, plenty of coolant."]
  }),
  m({
    id: "stainless-316l", name: "Stainless steel 1.4404 / 316L", aliases: ["1.4404", "1.4401", "316", "316L", "AISI 316", "X2CrNiMo17-12-2"],
    iso: "M", family: "stainless-austenitic", density: 8, hardnessHB: 180, tensileMPa: 580, kc11: 2150, mc: 0.21,
    vcCarbide: { rough: 100, finish: 130 }, vcHss: { rough: 12, finish: 17 }, fz10: 0.04, drillFeed10: 0.1, drillSpeedFactor: 0.6,
    slotAp: 0.3, sideAp: 1, sideAe: 0.3, adaptiveAe: 0.08, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.75, minFz: 0.025, threadPasses: 3,
    notes: ["Work-hardens more than 304: same rules, a little slower."]
  }),
  m({
    id: "stainless-17-4ph", name: "Stainless steel 1.4542 / 17-4 PH (H1150)", aliases: ["1.4542", "17-4", "17-4PH", "630"],
    iso: "M", family: "stainless-martensitic", density: 7.8, hardnessHB: 280, tensileMPa: 930, kc11: 2300, mc: 0.21,
    vcCarbide: { rough: 90, finish: 120 }, vcHss: { rough: 10, finish: 14 }, fz10: 0.04, drillFeed10: 0.1, drillSpeedFactor: 0.6,
    slotAp: 0.25, sideAp: 1, sideAe: 0.3, adaptiveAe: 0.07, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.75, minFz: 0.02, threadPasses: 3,
    notes: []
  }),
  m({
    id: "stainless-duplex", name: "Duplex stainless 1.4462 / 2205", aliases: ["1.4462", "2205", "duplex"],
    iso: "M", family: "stainless-duplex", density: 7.8, hardnessHB: 260, tensileMPa: 750, kc11: 2400, mc: 0.21,
    vcCarbide: { rough: 80, finish: 110 }, vcHss: undefined, fz10: 0.035, drillFeed10: 0.09, drillSpeedFactor: 0.6,
    slotAp: 0.25, sideAp: 1, sideAe: 0.25, adaptiveAe: 0.07, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.5, minFz: 0.025, threadPasses: 3,
    notes: []
  }),
  // ------------------------------------------------------------ K: cast iron
  m({
    id: "cast-iron-gg25", name: "Grey cast iron EN-GJL-250 / GG25", aliases: ["GG25", "GJL-250", "EN-GJL-250", "class 35", "ghisa", "cast iron"],
    iso: "K", family: "cast-iron-grey", density: 7.2, hardnessHB: 220, tensileMPa: 250, kc11: 1100, mc: 0.28,
    vcCarbide: { rough: 180, finish: 220 }, vcHss: { rough: 20, finish: 25 }, fz10: 0.07, drillFeed10: 0.25, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.5, adaptiveAe: 0.12, rampAngle: 3, finishAllowance: 0.25,
    coolant: "off", stringyChips: false, peckFactor: 2, minFz: 0.01, threadPasses: 2,
    notes: ["Machine dry with dust extraction (graphite dust); coolant makes an abrasive slurry."]
  }),
  m({
    id: "cast-iron-ggg50", name: "Ductile iron EN-GJS-500 / GGG50", aliases: ["GGG50", "GJS-500", "EN-GJS-500-7", "ductile iron", "ghisa sferoidale"],
    iso: "K", family: "cast-iron-ductile", density: 7.1, hardnessHB: 190, tensileMPa: 500, kc11: 1350, mc: 0.28,
    vcCarbide: { rough: 150, finish: 180 }, vcHss: { rough: 18, finish: 22 }, fz10: 0.06, drillFeed10: 0.2, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.1, rampAngle: 3, finishAllowance: 0.25,
    coolant: "flood", stringyChips: false, peckFactor: 1.5, minFz: 0.01, threadPasses: 2,
    notes: []
  }),
  // ------------------------------------------------------------ S: titanium, superalloys
  m({
    id: "titanium-ti6al4v", name: "Titanium Ti-6Al-4V (grade 5)", aliases: ["Ti6Al4V", "Ti-6Al-4V", "grade 5", "3.7165", "titanium", "titanio"],
    iso: "S", family: "titanium", density: 4.43, hardnessHB: 330, tensileMPa: 950, kc11: 1450, mc: 0.23,
    vcCarbide: { rough: 50, finish: 70 }, vcHss: { rough: 8, finish: 12 }, fz10: 0.045, drillFeed10: 0.1, drillSpeedFactor: 0.7,
    slotAp: 0.3, sideAp: 1, sideAe: 0.25, adaptiveAe: 0.07, rampAngle: 2, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.5, minFz: 0.02, threadPasses: 3,
    notes: ["Heat stays in the edge: low Vc, light radial engagement (adaptive), high-pressure coolant, never dwell."]
  }),
  m({
    id: "inconel-718", name: "Nickel alloy Inconel 718", aliases: ["718", "Inconel 718", "2.4668", "NiCr19Fe19Nb5Mo3", "inconel"],
    iso: "S", family: "nickel-superalloy", density: 8.19, hardnessHB: 380, tensileMPa: 1300, kc11: 2800, mc: 0.25,
    vcCarbide: { rough: 25, finish: 35 }, vcHss: undefined, fz10: 0.035, drillFeed10: 0.06, drillSpeedFactor: 0.7,
    slotAp: 0.2, sideAp: 1, sideAe: 0.2, adaptiveAe: 0.06, rampAngle: 1.5, finishAllowance: 0.3,
    coolant: "flood", stringyChips: true, peckFactor: 0.5, minFz: 0.02, threadPasses: 4,
    notes: ["Severe work hardening and notch wear: change the depth of cut between passes, carbide only."]
  }),
  // ------------------------------------------------------------ H: hardened
  m({
    id: "steel-hardened-55hrc", name: "Hardened steel 50-56 HRC (1.2379 / D2, 1.2343 / H11)", aliases: ["1.2379", "D2", "1.2343", "H11", "H13", "hardened", "temprato"],
    iso: "H", family: "steel-hardened", density: 7.7, hardnessHB: 530, hardnessHRC: 55, tensileMPa: 1900, kc11: 4200, mc: 0.25,
    vcCarbide: { rough: 70, finish: 100 }, vcHss: undefined, fz10: 0.03, drillFeed10: 0.04, drillSpeedFactor: 0.5,
    slotAp: 0.1, sideAp: 1, sideAe: 0.1, adaptiveAe: 0.05, rampAngle: 1, finishAllowance: 0.1,
    coolant: "off", stringyChips: false, peckFactor: 0.3, minFz: 0.01, threadPasses: 4,
    notes: ["Fine-grain carbide with AlTiN / AlCrN, dry with air blast (thermal shock cracks the edge under coolant).", "Light radial engagement at high speed; avoid slotting."]
  }),
  // ------------------------------------------------------------ N: plastics
  m({
    id: "pom-c", name: "Acetal POM-C (Delrin)", aliases: ["POM", "POM-C", "acetal", "Delrin", "plastic", "plastica"],
    iso: "N", family: "thermoplastic", density: 1.41, hardnessHB: 25, tensileMPa: 65, kc11: 300, mc: 0.2,
    vcCarbide: { rough: 300, finish: 400 }, vcHss: { rough: 150, finish: 200 }, fz10: 0.12, drillFeed10: 0.25, drillSpeedFactor: 0.5,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.2, rampAngle: 5, finishAllowance: 0.2,
    coolant: "off", stringyChips: true, peckFactor: 1.5, minFz: 0.05, threadPasses: 1,
    notes: ["Single or two flute, sharp O-flute; keep the chip load up so the plastic does not melt (air blast)."]
  }),
  m({
    id: "pmma", name: "Acrylic PMMA (cast)", aliases: ["PMMA", "acrylic", "plexiglass", "perspex", "plexiglas"],
    iso: "N", family: "thermoplastic", density: 1.19, hardnessHB: 20, tensileMPa: 70, kc11: 250, mc: 0.2,
    vcCarbide: { rough: 250, finish: 350 }, vcHss: { rough: 120, finish: 160 }, fz10: 0.1, drillFeed10: 0.2, drillSpeedFactor: 0.4,
    slotAp: 0.8, sideAp: 1.5, sideAe: 0.5, adaptiveAe: 0.2, rampAngle: 5, finishAllowance: 0.2,
    coolant: "mist", stringyChips: false, peckFactor: 1, minFz: 0.05, threadPasses: 1,
    notes: ["Brittle: chips and cracks at too high a feed per tooth on exit; single O-flute gives clear edges."]
  }),
  m({
    id: "pa6", name: "Nylon PA6 / PA66", aliases: ["PA6", "PA66", "nylon", "polyamide", "poliammide"],
    iso: "N", family: "thermoplastic", density: 1.14, hardnessHB: 20, tensileMPa: 80, kc11: 200, mc: 0.2,
    vcCarbide: { rough: 250, finish: 350 }, vcHss: { rough: 120, finish: 160 }, fz10: 0.12, drillFeed10: 0.25, drillSpeedFactor: 0.5,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.2, rampAngle: 5, finishAllowance: 0.25,
    coolant: "off", stringyChips: true, peckFactor: 1, minFz: 0.05, threadPasses: 1,
    notes: ["Absorbs water and springs back: leave a little more for finishing."]
  }),
  m({
    id: "hdpe", name: "Polyethylene HDPE / UHMW", aliases: ["HDPE", "PE", "PE500", "UHMW", "PE1000", "polyethylene", "polietilene"],
    iso: "N", family: "thermoplastic", density: 0.95, hardnessHB: 10, tensileMPa: 30, kc11: 150, mc: 0.2,
    vcCarbide: { rough: 300, finish: 400 }, vcHss: { rough: 200, finish: 250 }, fz10: 0.15, drillFeed10: 0.3, drillSpeedFactor: 0.5,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.25, rampAngle: 8, finishAllowance: 0.3,
    coolant: "off", stringyChips: true, peckFactor: 1.5, minFz: 0.08, threadPasses: 1,
    notes: ["Very soft and stringy: single flute, large chip load, sharp edge."]
  }),
  m({
    id: "peek", name: "PEEK", aliases: ["PEEK"],
    iso: "N", family: "thermoplastic", density: 1.32, hardnessHB: 35, tensileMPa: 100, kc11: 350, mc: 0.2,
    vcCarbide: { rough: 150, finish: 200 }, vcHss: { rough: 80, finish: 100 }, fz10: 0.08, drillFeed10: 0.15, drillSpeedFactor: 0.5,
    slotAp: 0.8, sideAp: 1.5, sideAe: 0.4, adaptiveAe: 0.15, rampAngle: 4, finishAllowance: 0.2,
    coolant: "mist", stringyChips: true, peckFactor: 1, minFz: 0.04, threadPasses: 1,
    notes: ["Low thermal conductivity: watch heat; anneal before precision finishing."]
  }),
  m({
    id: "pvc", name: "Rigid PVC", aliases: ["PVC", "PVC-U"],
    iso: "N", family: "thermoplastic", density: 1.4, hardnessHB: 20, tensileMPa: 50, kc11: 220, mc: 0.2,
    vcCarbide: { rough: 250, finish: 300 }, vcHss: { rough: 120, finish: 150 }, fz10: 0.1, drillFeed10: 0.2, drillSpeedFactor: 0.5,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.2, rampAngle: 5, finishAllowance: 0.2,
    coolant: "off", stringyChips: false, peckFactor: 1, minFz: 0.05, threadPasses: 1,
    notes: []
  }),
  m({
    id: "phenolic-laminate", name: "Phenolic / epoxy laminate (Pertinax, G10/FR4)", aliases: ["G10", "FR4", "Pertinax", "Bakelite", "laminate"],
    iso: "N", family: "thermoset", density: 1.85, hardnessHB: 40, tensileMPa: 300, kc11: 400, mc: 0.2,
    vcCarbide: { rough: 200, finish: 250 }, vcHss: undefined, fz10: 0.05, drillFeed10: 0.1, drillSpeedFactor: 0.5,
    slotAp: 0.5, sideAp: 1, sideAe: 0.4, adaptiveAe: 0.15, rampAngle: 3, finishAllowance: 0.15,
    coolant: "off", stringyChips: false, peckFactor: 2, minFz: 0.02, threadPasses: 1,
    notes: ["Glass fibre is abrasive and the dust is harmful: carbide or diamond, dust extraction."]
  }),
  // ------------------------------------------------------------ N: wood
  m({
    id: "wood-soft", name: "Softwood (pine, spruce)", aliases: ["pine", "spruce", "abete", "pino", "softwood", "wood", "legno"],
    iso: "N", family: "wood-soft", density: 0.5, hardnessHB: 2, tensileMPa: 40, kc11: 80, mc: 0.3,
    vcCarbide: { rough: 600, finish: 800 }, vcHss: { rough: 400, finish: 500 }, fz10: 0.2, drillFeed10: 0.4, drillSpeedFactor: 0.4,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.3, rampAngle: 10, finishAllowance: 0.3,
    coolant: "off", stringyChips: false, peckFactor: 3, minFz: 0.08, threadPasses: 1,
    notes: ["A small chip load burns the wood: keep the feed up, dust extraction."]
  }),
  m({
    id: "wood-hard", name: "Hardwood (oak, beech, walnut)", aliases: ["oak", "beech", "walnut", "rovere", "faggio", "noce", "hardwood"],
    iso: "N", family: "wood-hard", density: 0.75, hardnessHB: 4, tensileMPa: 90, kc11: 120, mc: 0.3,
    vcCarbide: { rough: 500, finish: 700 }, vcHss: { rough: 300, finish: 400 }, fz10: 0.15, drillFeed10: 0.3, drillSpeedFactor: 0.4,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.3, rampAngle: 10, finishAllowance: 0.3,
    coolant: "off", stringyChips: false, peckFactor: 3, minFz: 0.06, threadPasses: 1,
    notes: []
  }),
  m({
    id: "mdf", name: "MDF / plywood", aliases: ["MDF", "plywood", "multistrato", "HDF", "chipboard", "truciolare"],
    iso: "N", family: "wood-board", density: 0.75, hardnessHB: 3, tensileMPa: 20, kc11: 100, mc: 0.3,
    vcCarbide: { rough: 500, finish: 700 }, vcHss: { rough: 250, finish: 350 }, fz10: 0.18, drillFeed10: 0.35, drillSpeedFactor: 0.4,
    slotAp: 1, sideAp: 2, sideAe: 0.5, adaptiveAe: 0.3, rampAngle: 10, finishAllowance: 0.2,
    coolant: "off", stringyChips: false, peckFactor: 3, minFz: 0.06, threadPasses: 1,
    notes: ["Glue is abrasive: carbide; compression cutters avoid frayed faces on plywood."]
  }),
  // ------------------------------------------------------------ N: composites, foam
  m({
    id: "cfrp", name: "Carbon fibre CFRP", aliases: ["CFRP", "carbon fibre", "carbon fiber", "carbonio", "composite", "composito"],
    iso: "N", family: "composite-carbon", density: 1.55, hardnessHB: 60, tensileMPa: 600, kc11: 350, mc: 0.2,
    vcCarbide: { rough: 150, finish: 200 }, vcHss: undefined, fz10: 0.05, drillFeed10: 0.05, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 3, finishAllowance: 0.15,
    coolant: "off", stringyChips: false, peckFactor: 2, minFz: 0.02, threadPasses: 1,
    notes: ["Diamond-coated burr / compression cutters; vacuum the conductive dust (it shorts electronics, harmful to breathe)."]
  }),
  m({
    id: "gfrp", name: "Glass fibre GFRP", aliases: ["GFRP", "fiberglass", "vetroresina"],
    iso: "N", family: "composite-glass", density: 1.9, hardnessHB: 50, tensileMPa: 300, kc11: 400, mc: 0.2,
    vcCarbide: { rough: 120, finish: 160 }, vcHss: undefined, fz10: 0.05, drillFeed10: 0.06, drillSpeedFactor: 0.6,
    slotAp: 0.5, sideAp: 1, sideAe: 0.5, adaptiveAe: 0.15, rampAngle: 3, finishAllowance: 0.15,
    coolant: "off", stringyChips: false, peckFactor: 2, minFz: 0.02, threadPasses: 1,
    notes: ["Abrasive: diamond or fine-grain carbide; dust extraction."]
  }),
  m({
    id: "foam-pu", name: "Tooling board / PU foam", aliases: ["foam", "tooling board", "RenShape", "Ureol", "polyurethane"],
    iso: "N", family: "foam", density: 0.7, hardnessHB: 2, tensileMPa: 15, kc11: 60, mc: 0.3,
    vcCarbide: { rough: 500, finish: 700 }, vcHss: { rough: 400, finish: 500 }, fz10: 0.2, drillFeed10: 0.4, drillSpeedFactor: 0.4,
    slotAp: 2, sideAp: 3, sideAe: 0.6, adaptiveAe: 0.4, rampAngle: 15, finishAllowance: 0.3,
    coolant: "off", stringyChips: false, peckFactor: 5, minFz: 0.05, threadPasses: 1,
    notes: []
  })
]

const normalise = (s: string): string => s.trim().toLowerCase().replace(/[\s_./-]+/g, "")

const INDEX: ReadonlyMap<string, WorkpieceMaterial> = (() => {
  const map = new Map<string, WorkpieceMaterial>()
  // Ids first, then names, then aliases, so an alias never shadows another grade's id.
  for (const mat of MATERIALS) map.set(normalise(mat.id), mat)
  for (const mat of MATERIALS) if (!map.has(normalise(mat.name))) map.set(normalise(mat.name), mat)
  for (const mat of MATERIALS) for (const a of mat.aliases) if (!map.has(normalise(a))) map.set(normalise(a), mat)
  return map
})()

/** The legacy generator families (`generator/schema.ts` `MaterialType`) and the grade that stands for each. */
export const LEGACY_MATERIAL_GRADE: Readonly<Record<string, string>> = {
  aluminum: "al-6061-t6",
  steel: "steel-c45",
  wood: "wood-soft",
  plastic: "pom-c",
  brass: "brass-cuzn39pb3",
  titanium: "titanium-ti6al4v",
  composite: "cfrp",
  other: "steel-c45"
}

/** A grade by id, name, EN / AISI number or trade name (case, spaces and punctuation ignored). */
export const findMaterial = (query: string): WorkpieceMaterial | undefined => {
  const key = normalise(query)
  if (key === "") return undefined
  const legacy = LEGACY_MATERIAL_GRADE[query.trim().toLowerCase()]
  if (legacy !== undefined) return INDEX.get(normalise(legacy))
  return INDEX.get(key)
}

/** Like `findMaterial`, or an error listing the known grades. */
export const requireMaterial = (query: string): WorkpieceMaterial => {
  const found = findMaterial(query)
  if (found === undefined) throw new RangeError(`Unknown material '${query}'. Known: ${MATERIALS.map((x) => x.id).join(", ")}`)
  return found
}
