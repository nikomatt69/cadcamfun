/**
 * PMI slice of CAD -> CAM associativity (spec 59 A2, PMI seam): a program generated against a PMI set is stale
 * with reason `pmi` (distinct from `geometry`) when the manufacturing fingerprint changed. Pure comparison only;
 * the full `programStatus` of spec 59 does not exist yet, so callers combine this with their geometry check.
 */
import { pmiFingerprint, type PmiSet } from "../../pmi/pmi.ts"

export type PmiStaleReason = "pmi"

/** `pmi` when the stored fingerprint differs from the current set's, otherwise undefined. No stored fingerprint (legacy program) is not a PMI stale. */
export const pmiStaleReason = (storedFingerprint: string | undefined, current: PmiSet): PmiStaleReason | undefined =>
  storedFingerprint === undefined || storedFingerprint === pmiFingerprint(current) ? undefined : "pmi"
