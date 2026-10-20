import type { PropsWithChildren } from "react"
import { Text } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { BottomSheet } from "./BottomSheet"

/** The native sheet owns the modal and the shared 16pt gutter (`padded`); this wrapper only composes its content. */
export function SheetShell({ open, onClose, title, description, children }: PropsWithChildren<{
  open: boolean; onClose: () => void; title: string; description?: string
}>) {
  const { palette } = useTheme()
  return <BottomSheet open={open} onClose={onClose} title={title} padded>
    {description ? <Text style={{ color: palette.soft, ...type(15, { leadingScale: 1.05 }) }}>{description}</Text> : null}
    {children}
  </BottomSheet>
}
