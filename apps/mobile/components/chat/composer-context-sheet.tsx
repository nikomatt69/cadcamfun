import { Camera, Check, ShieldCheck, SlidersHorizontal } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { ListRow } from "@/components/ui/ListRow"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { COMPOSER_MODES, type ComposerMode } from "@/lib/composer"
import { DividedRows, SheetSection } from "./sheet-parts"

/** iOS cannot present a modal over a modal that is still dismissing, so the next one waits for it. */
const AFTER_DISMISS_MS = 350

/**
 * Everything that used to crowd the composer's toolbar: what to add to the next message, which kind
 * of work to focus on, and the permission and session controls. The composer keeps one line of controls.
 */
export function ComposerContextSheet({ open, onClose, mode, onModeChange, permissionLabel, onAddAttachment, onOpenControls }: {
  open: boolean
  onClose: () => void
  mode: ComposerMode
  onModeChange: (mode: ComposerMode) => void
  permissionLabel: string
  onAddAttachment?: () => void
  onOpenControls: () => void
}) {
  const { palette } = useTheme()
  const then = (next: () => void) => { onClose(); setTimeout(next, AFTER_DISMISS_MS) }
  return (
    <BottomSheet open={open} onClose={onClose} title="Add context" padded>
      {onAddAttachment ? (
        <DividedRows>
          <ListRow
            leading={<Camera size={20} color={palette.soft} />}
            title="Camera"
            subtitle="Photograph the part or a drawing"
            onPress={() => then(onAddAttachment)}
          />
        </DividedRows>
      ) : null}
      <SheetSection title="Focus">
        <DividedRows>
          {COMPOSER_MODES.map((item) => (
            <ListRow
              key={item.value}
              title={item.label}
              subtitle={item.hint}
              selected={item.value === mode}
              showChevron={false}
              trailing={item.value === mode ? <Check size={18} color={palette.accent} /> : undefined}
              accessibilityHint="Focuses the assistant on this kind of work for your next message"
              onPress={() => {
                if (item.value !== mode) { haptic("selection"); onModeChange(item.value) }
                onClose()
              }}
            />
          ))}
        </DividedRows>
      </SheetSection>
      <DividedRows>
        <ListRow
          leading={<ShieldCheck size={20} color={palette.soft} />}
          title="Permissions"
          subtitle={permissionLabel}
          onPress={() => then(onOpenControls)}
        />
        <ListRow
          leading={<SlidersHorizontal size={20} color={palette.soft} />}
          title="Tools and session"
          subtitle="Context, tools and conversation controls"
          onPress={() => then(onOpenControls)}
        />
      </DividedRows>
    </BottomSheet>
  )
}
