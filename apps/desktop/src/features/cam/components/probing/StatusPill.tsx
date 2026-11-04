/** A status as text and an icon, never colour alone (spec 73 §4): pass, warning, fail, missed touch, incomplete run. */
import { AlertTriangle, Check, CircleSlash, Clock, X } from "lucide-solid"
import type { JSX } from "solid-js"
import { t, type Key } from "../../../../i18n/index.ts"
import type { InspectionStatus } from "../../lib/probing/inspection.ts"
import type { RunVerdict } from "../../lib/probing/result.ts"

export type PillStatus = InspectionStatus | RunVerdict

const TONE: Readonly<Record<PillStatus, "ok" | "warn" | "bad">> = { pass: "ok", warn: "warn", fail: "bad", missed: "bad", incomplete: "warn" }
const ICON = { pass: Check, warn: AlertTriangle, fail: X, missed: CircleSlash, incomplete: Clock } as const

export function StatusPill(props: { readonly status: PillStatus; readonly testId?: string }): JSX.Element {
  const Icon = () => ICON[props.status]
  return (
    <span class={`panel-badge panel-badge--${TONE[props.status]}`} data-status={props.status} data-testid={props.testId}>
      {(() => { const I = Icon(); return <I size={12} /> })()}
      {t(`cam.probing.status.${props.status}` as Key)}
    </span>
  )
}
