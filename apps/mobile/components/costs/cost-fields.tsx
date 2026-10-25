import { useState } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { costMoney, estimateLines } from "@/lib/costs"
import { ListRow } from "@/components/ui/ListRow"
import { TextField } from "@/components/ui/TextField"
import type { CalculatedEstimate } from "@cadcamfun/api"

/** Inline selection keeps one native sheet and one scroll owner, including while the keyboard is up. */
export function CostChoice({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: readonly { id: string; name: string }[]; onChange: (id: string) => void; disabled?: boolean
}) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const matches = options.filter((row) => row.name.toLowerCase().includes(search.trim().toLowerCase()))
  return <View style={{ gap: 8 }}>
    <ListRow title={label} subtitle={options.find((row) => row.id === value)?.name ?? "Choose…"} onPress={disabled ? undefined : () => setOpen(!open)} />
    {open && !disabled ? <>
      <TextField label={`Search ${label.toLowerCase()}`} value={search} onChangeText={setSearch} autoCorrect={false} />
      {matches.slice(0, 20).map((row) => <ListRow key={row.id || "personal"} title={row.name} selected={row.id === value}
        onPress={() => { onChange(row.id); setOpen(false); setSearch("") }} />)}
      <Text style={{ color: palette.muted, ...type(13) }}>{matches.length > 20 ? `${matches.length} matches. Refine your search to see the remaining choices.` : matches.length === 0 ? "No matches" : `${matches.length} choices`}</Text>
    </> : null}
  </View>
}

export function CostBreakdown({ result }: { result: Pick<typeof CalculatedEstimate.Type, "materialCost" | "toolWearCost" | "machineTimeCost" | "operatorTimeCost" | "setupCost" | "totalCost" | "machineTime" | "operatorTime" | "currencyCode"> }) {
  const { palette } = useTheme()
  return <View style={{ gap: 10 }}>
    {estimateLines(result).map((line) => <View key={line.label} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: palette.ink, ...type(16, { weight: line.label === "Total" ? "700" : "400" }) }}>{line.label}</Text>
      <Text selectable style={{ color: palette.ink, fontVariant: ["tabular-nums"], ...type(16, { weight: line.label === "Total" ? "700" : "400" }) }}>{costMoney(line.value, result.currencyCode)}</Text>
    </View>)}
    <Text style={{ color: palette.muted, ...type(13) }}>{result.machineTime.toFixed(1)} min machining · {result.operatorTime.toFixed(1)} min operator</Text>
  </View>
}
