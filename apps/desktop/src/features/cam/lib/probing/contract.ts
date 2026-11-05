/**
 * The one door from the desktop to the core's probing contract (spec 73 §4): every probing name the CAM workspace, the library and
 * the 3D overlay use comes through here, so a rename in the core is one edit and the desktop never forks core logic.
 */
import { cam } from "@cadcamfun/core"

export const probing = cam.probing
export const kernel = cam.kernel

export type WorkOffsetRef = cam.probing.WorkOffsetRef
export type OffsetEntry = cam.probing.OffsetEntry
export type WorkOffsetTable = cam.probing.WorkOffsetTable
export type OffsetFamily = cam.probing.OffsetFamily
export type OffsetCapacity = cam.probing.OffsetCapacity
export type OffsetAxis = cam.probing.OffsetAxis
export type UpdateMode = cam.probing.UpdateMode
export type UpdatePolicy = cam.probing.UpdatePolicy
export type ProbeCycle = cam.probing.ProbeCycle
export type ProbeCycleKind = cam.probing.ProbeCycleKind
export type ProbeAction = cam.probing.ProbeAction
export type Characteristic = cam.probing.Characteristic
export type InspectionVerdict = cam.probing.InspectionVerdict
export type ProbeSettings = cam.probing.ProbeSettings
export type ProbeDevice = cam.probing.ProbeDevice
export type ToolSetter = cam.probing.ToolSetter
export type KernelProbing = cam.probing.KernelProbing
export type ProbeContact = cam.probing.ProbeContact
export type ProbeRoutine = cam.probing.ProbeRoutine
export type ProbeContext = cam.probing.ProbeContext
export type ProbeSimOutcome = cam.probing.ProbeSimOutcome
export type ProbeSimContact = cam.probing.ProbeSimContact
export type ProbeSimUpdate = cam.probing.ProbeSimUpdate
export type MachineProfile = cam.kernel.MachineProfile
export type MachineProbing = cam.kernel.MachineProbing
export type MachineToolSetter = cam.kernel.MachineToolSetter
export type MachineRotaryCalibration = cam.kernel.MachineRotaryCalibration
export type MachineWorkOffsetTable = cam.kernel.MachineWorkOffsetTable
export type OffsetEntryConfig = cam.kernel.OffsetEntryConfig

export const PROBE_CYCLE_KINDS = cam.probing.PROBE_CYCLE_KINDS
export const UPDATE_MODES = cam.probing.UPDATE_MODES
export const OFFSET_FAMILIES = cam.probing.OFFSET_FAMILIES
export const MACRO_STYLES = cam.probing.MACRO_STYLES
export const DEFAULT_PROBE_SETTINGS = cam.probing.DEFAULT_PROBE_SETTINGS

export const parseOffsetRef = cam.probing.parseOffsetRef
export const formatOffsetRef = cam.probing.formatOffsetRef
export const offsetKey = cam.probing.offsetKey
export const addressOf = cam.probing.addressOf
export const applyCorrection = cam.probing.applyCorrection
export const policyProblem = cam.probing.policyProblem
export const tableProblems = cam.probing.tableProblems
export const offsetEntryFromWire = cam.probing.offsetEntryFromWire
export const offsetEntryToWire = cam.probing.offsetEntryToWire
export const settingsFromMachine = cam.probing.settingsFromMachine
export const validateSettings = cam.probing.validateSettings
export const stylusDiameterOf = cam.probing.stylusDiameterOf
export const probeDeviceOfProfile = cam.probing.probeDeviceOfProfile
export const kernelProbingOfProfile = cam.probing.kernelProbingOfProfile
export const workOffsetTableOf = cam.probing.workOffsetTableOf
export const withWorkOffsetTable = cam.probing.withWorkOffsetTable
export const profileOfConfig = cam.kernel.profileOfConfig
export const configOfProfile = cam.kernel.configOfProfile
export type MacroStyle = cam.probing.MacroStyle
export const nativeCycle = cam.probing.nativeCycle
