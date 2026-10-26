import { useMemo, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { Brain, Cpu, Search, Sparkles } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/Skeleton"
import { assistantModelKey, filterAssistantModels, formatVariantLabel, groupAssistantModels, modelFacts, rememberedSelection, selectedAssistantModel, type AssistantModelOption, type AssistantModelSelection } from "@/lib/assistant-preferences"
import { useUIStore } from "@/lib/store"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { ChoiceChip, ChoiceRow, DividedRows, SheetSection, SheetSummary, TILE_INSET, chipRowStyle } from "./sheet-parts"

/**
 * Model and thinking effort, after nikcli's ModelPickerSheet: what is chosen now, the effort chips for
 * that model, search, the providers as filter chips and the models grouped under their provider.
 * A model with thinking levels is picked in two steps, the model and then its effort.
 */
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
  const { gutter } = useContentLayout()
  const remembered = useUIStore((state) => state.assistantModelVariants)
  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState<string | undefined>()
  const [draft, setDraft] = useState<AssistantModelSelection | undefined>()
  const current = draft ?? selection
  const selected = selectedAssistantModel(models, current)
  const providers = useMemo(() => [...new Map(models.map((model) => [model.provider, model.providerName])).entries()], [models])
  const groups = useMemo(() => groupAssistantModels(filterAssistantModels(models, query, provider)), [models, query, provider])
  const matches = groups.reduce((total, group) => total + group.models.length, 0)
  const filtering = query.trim().length > 0 || provider !== undefined
  const pad = { paddingHorizontal: gutter }
  const close = () => { setDraft(undefined); setQuery(""); setProvider(undefined); onClose() }
  const apply = (model: AssistantModelSelection | undefined) => {
    if (model) useUIStore.getState().rememberModelVariant(assistantModelKey(model), model.variant)
    onSelect(model)
    close()
  }
  const pick = (model: AssistantModelOption) => {
    const next = rememberedSelection(model, remembered)
    if (model.variants.length) setDraft(next)
    else apply(next)
  }
  return <BottomSheet open={open} onClose={close} title="Model & thinking">
    <View style={{ gap: 16 }}>
      <View style={pad}>
        <SheetSummary
          title={selected ? `${selected.providerName} — ${selected.name}` : selection?.model ?? "Automatic model"}
          description="Choose a connected provider, model and thinking effort for this project. Uses the credentials on your paired desktop." />
      </View>

      {selected && selected.variants.length > 0 ? <View style={pad}>
        <SurfaceCard inset={false}>
          <View style={{ gap: 4, padding: 16, paddingBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Brain size={16} color={palette.accent} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>Thinking effort · {selected.name}</Text>
            </View>
            <Text style={{ color: draft ? palette.accentStrong : palette.muted, ...typeStyle(12, { leadingScale: 1.05 }) }}>
              {draft ? "Choose a thinking effort to use this model." : "Higher effort thinks longer and uses more tokens."}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...chipRowStyle(16), paddingBottom: 16 }}>
            {[undefined, ...selected.variants].map((variant) => (
              <ChoiceChip key={variant ?? "default"} title={variant ? formatVariantLabel(variant) : "Default"} selected={current?.variant === variant}
                onPress={() => apply({ provider: selected.provider, model: selected.model, ...(variant ? { variant } : {}) })} />
            ))}
          </ScrollView>
        </SurfaceCard>
      </View> : null}

      <View style={pad}>
        <TextField value={query} onChangeText={setQuery} placeholder="Search providers and models" autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" />
      </View>
      {providers.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={chipRowStyle(gutter)}>
        <ChoiceChip title="All providers" selected={provider === undefined} onPress={() => setProvider(undefined)} />
        {providers.map(([id, name]) => <ChoiceChip key={id} title={name} selected={provider === id} onPress={() => setProvider(id)} />)}
      </ScrollView> : null}

      {error ? <View style={pad}><ErrorBanner message={error} actionLabel="Retry" onAction={reload} /></View> : null}

      <View style={pad}>
        <DividedRows inset={TILE_INSET}>
          <ChoiceRow icon={Sparkles} title="Automatic"
            description="Let the desktop choose from its connected providers" selected={!current} onPress={() => apply(undefined)} />
        </DividedRows>
      </View>

      {loading && models.length === 0 ? <View style={pad}><ModelSkeleton /></View> : null}

      {groups.map((group) => (
        <View key={group.provider} style={pad}>
          <SheetSection title={group.providerName} accessory={<Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(12) }}>{group.models.length}</Text>}>
            <DividedRows inset={TILE_INSET}>
              {group.models.map((model) => {
                const active = selected?.key === model.key
                return <ChoiceRow key={model.key} icon={model.badge ? Brain : Cpu}
                  title={model.name} description={modelFacts(model).join(" · ")} selected={active}
                  hint={model.variants.length ? "Then choose a thinking effort" : undefined}
                  onPress={() => pick(model)} />
              })}
            </DividedRows>
          </SheetSection>
        </View>
      ))}

      {!loading && matches === 0 && !(error && models.length === 0) ? <View style={pad}>
        <EmptyState title={models.length ? "No matching models" : "No connected models"}
          description={models.length ? "Try another provider or search." : "Connect a provider in desktop AI settings, then refresh this list."}
          icon={<Search size={24} color={palette.muted} />}
          action={filtering ? <ActionButton variant="secondary" small label="Clear search" onPress={() => { haptic("selection"); setQuery(""); setProvider(undefined) }} /> : undefined} />
      </View> : null}

      <View style={pad}>
        <ActionButton variant="secondary" label="Refresh desktop models" loading={loading} onPress={() => { haptic("light"); reload() }} />
      </View>
    </View>
  </BottomSheet>
}

/** Row-shaped placeholders: icon tile, title and fact line. */
function ModelSkeleton() {
  return <View accessible accessibilityLabel="Loading desktop models">
    <SurfaceCard inset={false}>
      {[0, 1, 2].map((key) => <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Skeleton style={{ width: 40, height: 40, borderRadius: 12 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton style={{ height: 15, width: "55%", borderRadius: 6 }} />
          <Skeleton style={{ height: 12, width: "80%", borderRadius: 6 }} />
        </View>
      </View>)}
    </SurfaceCard>
  </View>
}
