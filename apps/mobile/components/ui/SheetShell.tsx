import type { PropsWithChildren } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { layout } from "@/lib/layout"
import { type } from "@/lib/typography"
import { BottomSheet } from "./BottomSheet"

/** The native sheet owns the modal; this wrapper only composes its content. */
export function SheetShell({ open, onClose, title, description, children }: PropsWithChildren<{
  open: boolean; onClose: () => void; title: string; description?: string
}>) {
  const { palette } = useTheme()
  return <BottomSheet open={open} onClose={onClose} title={title}>
    <View style={{ paddingHorizontal: layout.gutter, gap: 16 }}>
      {description ? <Text style={{ color: palette.soft, ...type(15, { leadingScale: 1.05 }) }}>{description}</Text> : null}
      {children}
    </View>
  </BottomSheet>
}
