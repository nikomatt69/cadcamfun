import { Fragment } from "react"
import { Text, View } from "react-native"
import { Minus, Plus, SquarePen } from "lucide-react-native"
import type { EntityChange } from "@cadcamfun/api"
import { SurfaceCard } from "./ui/SurfaceCard"
import { Pill, type PillTone } from "./ui/Pill"
import { useTheme } from "@/lib/theme"

/** One property-level change inside an entity: pointer, optional before/after. */
type PropertyChange = EntityChange["changes"][number]

/**
 * A CAD-aware change list: one card per entity, its property-level changes under it. Status is
 * carried by a leading glyph (＋ green / − red / ✎ neutral) and a pill; before/after values render
 * side by side when both exist. Values are JSON-ish — one line each, monospaced, so a property
 * merge conflict is still readable on a phone.
 */

type Status = EntityChange["status"]

const STATUS_PILL: Record<Status, { tone: PillTone; label: string }> = {
  added: { tone: "success", label: "Added" },
  modified: { tone: "accent", label: "Modified" },
  deleted: { tone: "danger", label: "Deleted" },
}

const pointerLabel = (pointer: string): string => pointer.replace(/^\/+/, "").replaceAll("/", " › ") || "—"

const valueText = (value: unknown): string => {
  if (value === undefined) return ""
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}…` : value
  const json = JSON.stringify(value)
  return json.length > 160 ? `${json.slice(0, 160)}…` : json
}

function PropertyRow({ change }: { change: PropertyChange }) {
  const { palette } = useTheme()
  const hasBefore = change.before !== undefined
  const hasAfter = change.after !== undefined

  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 9, gap: 4 }}>
      <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{pointerLabel(change.pointer)}</Text>
      {hasBefore ? (
        <Text style={{ color: palette.danger, fontFamily: "Menlo", fontSize: 12, lineHeight: 17 }} numberOfLines={3}>
          − {valueText(change.before)}
        </Text>
      ) : null}
      {hasAfter ? (
        <Text style={{ color: palette.success, fontFamily: "Menlo", fontSize: 12, lineHeight: 17 }} numberOfLines={3}>
          + {valueText(change.after)}
        </Text>
      ) : null}
    </View>
  )
}

function EntityCard({ change }: { change: EntityChange }) {
  const { palette } = useTheme()
  const status = STATUS_PILL[change.status]
  const Glyph = change.status === "added" ? Plus : change.status === "deleted" ? Minus : SquarePen
  const glyphColor = change.status === "added" ? palette.success : change.status === "deleted" ? palette.danger : palette.accent

  return (
    <SurfaceCard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Glyph size={16} color={glyphColor} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: "600" }} numberOfLines={1}>
            {change.name || change.id || change.path.split("/").pop() || change.path}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
            {change.path}
          </Text>
        </View>
        <Pill tone={status.tone}>{status.label}</Pill>
      </View>
      {change.changes.length > 0 ? (
        <View>
          {change.changes.map((property, index) => (
            <Fragment key={index}>
              {index > 0 ? <View style={{ height: 0.5, marginLeft: 14, backgroundColor: palette.border }} /> : null}
              <PropertyRow change={property} />
            </Fragment>
          ))}
        </View>
      ) : (
        <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 14, paddingBottom: 12 }}>
          {change.status === "added" ? "New file" : change.status === "deleted" ? "File removed" : "No property-level changes"}
        </Text>
      )}
    </SurfaceCard>
  )
}

export function DiffView({ changes }: { changes: ReadonlyArray<EntityChange> }) {
  return (
    <View style={{ gap: 10 }}>
      {changes.map((change, index) => (
        <EntityCard key={`${change.path}-${index}`} change={change} />
      ))}
    </View>
  )
}
