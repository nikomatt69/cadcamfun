import { Text, View } from "react-native"
import { Check } from "lucide-react-native"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { ListRow } from "@/components/ui/ListRow"
import { DividedRows, SheetSection } from "@/components/chat/sheet-parts"

export interface ChoiceOption<T extends string | number> {
  readonly id: T
  readonly label: string
  readonly description?: string
  /** A quiet number before the check (how many rows the choice would keep). */
  readonly count?: number
}

export interface ChoiceGroup<T extends string | number> {
  readonly title?: string
  readonly options: readonly ChoiceOption<T>[]
  readonly value: T
  onChange(value: T): void
}

/**
 * A single-choice sheet in the filter sheet's vocabulary: flat rows in one grouped card, a check on the
 * choice in force, the sheet closing as soon as one is picked. Several groups stack as titled sections.
 */
export function ChoiceSheet({ open, onClose, title, groups, footer }: {
  open: boolean
  onClose: () => void
  title: string
  groups: readonly ChoiceGroup<string | number>[]
  footer?: string
}) {
  const { palette } = useTheme()
  const single = groups.length === 1
  return (
    <BottomSheet open={open} onClose={onClose} title={title} padded>
      {groups.map((group, index) => {
        const rows = (
          <DividedRows>
            {group.options.map((option) => {
              const selected = option.id === group.value
              return (
                <ListRow
                  key={String(option.id)}
                  title={option.label}
                  subtitle={option.description}
                  selected={selected}
                  showChevron={false}
                  trailing={option.count !== undefined || selected ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      {option.count !== undefined ? <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...type(13) }}>{option.count}</Text> : null}
                      <View style={{ width: 18 }}>{selected ? <Check size={18} color={palette.ink} strokeWidth={2.4} /> : null}</View>
                    </View>
                  ) : undefined}
                  onPress={() => {
                    if (!selected) haptic("selection")
                    group.onChange(option.id)
                    // A multi-group sheet stays open: the choices are independent and read together.
                    if (single) onClose()
                  }}
                />
              )
            })}
          </DividedRows>
        )
        return group.title ? <SheetSection key={group.title} title={group.title}>{rows}</SheetSection> : <View key={index}>{rows}</View>
      })}
      {footer ? <Text style={{ color: palette.muted, paddingHorizontal: 4, ...type(12, { leadingScale: 1.05 }) }}>{footer}</Text> : null}
    </BottomSheet>
  )
}
