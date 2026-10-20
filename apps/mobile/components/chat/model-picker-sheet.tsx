import { useMemo, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Brain, Check, Search } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ListRow } from "@/components/ui/ListRow"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/Skeleton"
import { assistantModelKey, filterAssistantModels, formatVariantLabel, rememberedSelection, selectedAssistantModel, type AssistantModelOption, type AssistantModelSelection } from "@/lib/assistant-preferences"
import { useUIStore } from "@/lib/store"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { caps } from "@/lib/typography"

export function ModelPickerSheet({ open, onClose, models, selection, onSelect, loading, error, reload }: {
  open: boolean
  onClose(): void
  models: readonly AssistantModelOption[]
  selection?: AssistantModelSelection
  onSelect(model: AssistantModelSelection | undefined): void
  loading: boolean
  error?: string
  reload(): void
}) {
  const { palette } = useTheme()
  const remembered = useUIStore((state) => state.assistantModelVariants)
  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState<string | undefined>()
  // A model with thinking levels is picked in two steps, like nikcli: the model, then its effort.
  const [draft, setDraft] = useState<AssistantModelSelection | undefined>()
  const current = draft ?? selection
  const selected = selectedAssistantModel(models, current)
  const providers = useMemo(() => [...new Map(models.map((model) => [model.provider, model.providerName])).entries()], [models])
  const filtered = filterAssistantModels(models, query, provider)
  const close = () => { setDraft(undefined); onClose() }
  const apply = (model: AssistantModelSelection | undefined) => {
    haptic("selection")
    if (model) useUIStore.getState().rememberModelVariant(assistantModelKey(model), model.variant)
    onSelect(model)
    close()
  }
  return <BottomSheet open={open} onClose={close} title="Model & thinking">
    <View style={{ paddingHorizontal: 20, gap: 16 }}>
      <View style={{ gap: 5 }}>
        <Text selectable style={{ color: palette.ink, fontSize: 18, lineHeight: 24, fontWeight: "700" }}>{selected ? `${selected.providerName} — ${selected.name}` : selection?.model ?? "Automatic model"}</Text>
        <Text selectable style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>Choose a connected provider, model and thinking effort for this project. Uses the credentials on your paired desktop.</Text>
      </View>
      {selected && selected.variants.length > 0 ? <SurfaceCard>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><Brain size={16} color={palette.accent} style={{ flexShrink: 0 }} /><Text style={{ flexShrink: 1, color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" }}>Thinking effort · {selected.name}</Text></View>
          {draft ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>Choose a thinking effort to use this model</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[undefined, ...selected.variants].map((variant) => <Choice key={variant ?? "default"} title={variant ? formatVariantLabel(variant) : "Default"} selected={current?.variant === variant} onPress={() => apply({ provider: selected.provider, model: selected.model, ...(variant ? { variant } : {}) })} />)}
          </ScrollView>
        </View>
      </SurfaceCard> : null}
      <TextField value={query} onChangeText={setQuery} placeholder="Search providers and models" autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
      {providers.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {[[undefined, "All providers"], ...providers].map(([id, name]) => <Choice key={id ?? "all"} title={name ?? ""} selected={provider === id} onPress={() => setProvider(id)} />)}
      </ScrollView> : null}
      {error ? <ErrorBanner message={error} actionLabel="Retry" onAction={reload} /> : null}
      <SurfaceCard inset={false}><ListRow title="Automatic" subtitle="Let the desktop choose from its connected providers" selected={!current} trailing={!current ? <Check size={18} color={palette.accent} /> : undefined} onPress={() => apply(undefined)} /></SurfaceCard>
      {loading && models.length === 0 ? [0, 1, 2].map((key) => <Skeleton key={key} style={{ height: 70 }} />) : null}
      {filtered.map((model, index) => <View key={model.key} style={{ gap: 8 }}>
        {(index === 0 || filtered[index - 1]?.provider !== model.provider) ? <Text accessibilityRole="header" style={{ color: palette.muted, marginTop: 8, paddingHorizontal: 4, ...caps(11) }}>{model.providerName}</Text> : null}
        <SurfaceCard inset={false}><ListRow title={model.name}
          subtitle={[model.badge, model.model, model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k context` : undefined, model.tools ? "Tools" : "Chat only", model.vision ? "Vision" : undefined, model.variants.length ? `${model.variants.length} thinking levels` : undefined].filter(Boolean).join(" · ")}
          selected={selected?.key === model.key} trailing={selected?.key === model.key ? <Check size={18} color={palette.accent} /> : undefined}
          onPress={() => { const next = rememberedSelection(model, remembered); if (model.variants.length) { setDraft(next); haptic("selection") } else apply(next) }} /></SurfaceCard>
      </View>)}
      {!loading && filtered.length === 0 ? <EmptyState title={models.length ? "No matching models" : "No connected models"} description={models.length ? "Try another provider or search." : "Connect a provider in desktop AI settings, then refresh this list."} icon={<Search size={24} color={palette.muted} />} /> : null}
      <ActionButton variant="secondary" label="Refresh desktop models" loading={loading} onPress={reload} />
    </View>
  </BottomSheet>
}

function Choice({ title, selected, onPress }: { title: string; selected: boolean; onPress(): void }) {
  const { palette } = useTheme()
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected }} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22, borderCurve: "continuous", borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? palette.accent : palette.border, backgroundColor: hexToRgba(selected ? palette.accent : palette.ink, pressed ? 0.18 : 0.07) })}>
    <Text style={{ color: selected ? palette.accentStrong : palette.soft, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{title}</Text>
  </Pressable>
}
