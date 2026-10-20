import { Children, Fragment, type PropsWithChildren } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { caps } from "@/lib/typography"
import { SurfaceCard } from "@/components/ui/SurfaceCard"

/** Rows of one grouped card with a hairline between them, inset to the text like a native grouped list. */
export function DividedRows({ children }: PropsWithChildren) {
  const { palette } = useTheme()
  const rows = Children.toArray(children)
  return (
    <SurfaceCard inset={false}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: palette.border }} /> : null}
          {row}
        </Fragment>
      ))}
    </SurfaceCard>
  )
}

/** A sheet section: a small-caps header over its content, 8pt apart. */
export function SheetSection({ title, children }: PropsWithChildren<{ title: string }>) {
  const { palette } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: palette.muted, paddingHorizontal: 4, ...caps(11) }}>{title}</Text>
      {children}
    </View>
  )
}
