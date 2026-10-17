import type { PropsWithChildren } from "react"
import { Text, View } from "react-native"
import { useTheme } from "@/lib/theme"
import { BottomSheet } from "./BottomSheet"

/** The native sheet owns the modal; this wrapper only composes its content. */
export function SheetShell({ open, onClose, title, description, children }: PropsWithChildren<{
  open: boolean; onClose: () => void; title: string; description?: string
}>) {
  const { palette } = useTheme()
  return <BottomSheet open={open} onClose={onClose} title={title}>
    <View style={{ paddingHorizontal: 20, gap: 16 }}>
      {description ? <Text style={{ color: palette.soft, fontSize: 15, lineHeight: 22 }}>{description}</Text> : null}
      {children}
    </View>
  </BottomSheet>
}
