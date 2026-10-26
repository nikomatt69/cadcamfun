import { memo, useState } from "react"
import { View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { toolRunSummary, type ToolRow } from "@/lib/transcript-rows"
import { ToolCallRow, ToolImages } from "./ToolCallRow"
import { DisclosureRow, Reveal } from "./disclosure"

/**
 * A run of finished tool calls folded into one line (nikcli ToolRunGroup: "Ran 5 commands"). The line says how many
 * calls, which domains and whether any failed; the latest render the tools produced stays visible while it is
 * collapsed, because watching the model being built is the point of the CAD assistant. Opening it lists the calls.
 */
export const ToolRunGroup = memo(function ToolRunGroup({ rows }: { rows: readonly ToolRow[] }) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  const summary = toolRunSummary(rows)
  const latestImages = rows.findLast((row) => row.images?.length)
  const domains = summary.domains.join(" · ")
  return (
    <View style={{ marginVertical: 2 }}>
      <DisclosureRow
        emphasis="Ran"
        label={`${summary.count} ${summary.count === 1 ? "command" : "commands"}`}
        detail={summary.failed ? `${summary.failed} failed${domains ? ` · ${domains}` : ""}` : domains}
        detailTone={summary.failed ? "danger" : "muted"}
        open={open}
        onPress={() => setOpen((value) => !value)}
        accessibilityLabel={`${summary.title}${summary.failed ? `, ${summary.failed} failed` : ", all completed"}${domains ? `. ${domains}` : ""}. ${open ? "Hide" : "Show"} the calls`}
      />
      {!open && latestImages?.images ? <View style={{ marginHorizontal: 16, paddingBottom: 8 }}><ToolImages images={latestImages.images} tool={latestImages.tool} /></View> : null}
      {open ? (
        <Reveal style={{ marginLeft: 12, borderLeftWidth: 2, borderLeftColor: hexToRgba(palette.ink, 0.08) }}>
          {rows.map((row) => <ToolCallRow key={row.callId} row={row} />)}
        </Reveal>
      ) : null}
    </View>
  )
}, (prev, next) => prev.rows.length === next.rows.length && prev.rows.every((row, index) => row === next.rows[index]))
