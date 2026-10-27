import * as Clipboard from "expo-clipboard"
import { Bot, Copy, Cpu, FolderOpen, History, Plus, SlidersHorizontal } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { toast } from "@/components/ui/ToastHost"
import { AFTER_DISMISS_MS } from "./composer-context-sheet"
import { ChoiceRow, DividedRows, SheetSection, TILE_INSET } from "./sheet-parts"

/**
 * Everything about the open conversation behind the header's ⋯ (nikcli's SessionActionsSheet): the
 * conversation itself, who answers it and with what, and its id. Each row closes this sheet and opens
 * the one it names, so the header keeps two buttons however much the assistant grows.
 */
export function SessionActionsSheet({ open, onClose, sessionId, project, agent, model, permission, onNew, onHistory, onControls, onAgent, onModel, onProject }: {
  open: boolean
  onClose: () => void
  /** The conversation on screen; undefined before its first message. */
  sessionId?: string
  /** The project name; undefined while the desktop's project list is not loaded. */
  project?: string
  agent: string
  model: string
  permission: string
  onNew: () => void
  onHistory: () => void
  onControls: () => void
  onAgent: () => void
  onModel: () => void
  onProject: () => void
}) {
  // iOS cannot present a sheet over one that is still dismissing, so the next one waits for it.
  const then = (next: () => void) => { onClose(); setTimeout(next, AFTER_DISMISS_MS) }
  const copyId = (id: string) => {
    onClose()
    void Clipboard.setStringAsync(id).then(() => toast("Conversation ID copied", "success"), () => toast("Could not copy the conversation ID", "error"))
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Conversation" padded>
      <SheetSection title="Conversation">
        <DividedRows inset={TILE_INSET}>
          <ChoiceRow icon={Plus} emphasis title="New conversation" description={project ? `A fresh conversation in ${project}` : "A fresh conversation in this project"} onPress={() => { onClose(); onNew() }} />
          <ChoiceRow icon={History} title="Conversations" description="Every conversation of this project" onPress={() => then(onHistory)} />
          <ChoiceRow icon={SlidersHorizontal} title="Controls and activity" description={`${permission} · context and usage`} onPress={() => then(onControls)} />
        </DividedRows>
      </SheetSection>

      <SheetSection title="Assistant">
        <DividedRows inset={TILE_INSET}>
          <ChoiceRow icon={Bot} title="Agent" description={agent} onPress={() => then(onAgent)} />
          <ChoiceRow icon={Cpu} title="Model" description={model} onPress={() => then(onModel)} />
          <ChoiceRow icon={FolderOpen} title="Project" description={project ?? "Choose a project"} onPress={() => then(onProject)} />
        </DividedRows>
      </SheetSection>

      {sessionId ? (
        <SheetSection title="Share">
          <DividedRows inset={TILE_INSET}>
            <ChoiceRow icon={Copy} title="Copy conversation ID" description={sessionId} onPress={() => copyId(sessionId)} />
          </DividedRows>
        </SheetSection>
      ) : null}
    </BottomSheet>
  )
}
