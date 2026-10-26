import { useCallback, useEffect, useState } from "react"
import { Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Copy, Cpu, Globe2, Layers3, Trash2, Wrench } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { confirmDelete } from "@/lib/manage"
import { resourceFacts } from "@/lib/resources"
import type { ResourceKind, ResourceRow } from "@/lib/client"
import { PageScroll } from "@/components/layout/page-scroll"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { toast } from "@/components/ui/ToastHost"
import { type } from "@/lib/typography"
import { checkNumber, numberError, type NumberRules } from "@/lib/field-number"
import { ChoiceRow, DividedRows, SheetSection, SheetSummary, TILE_INSET } from "@/components/chat/sheet-parts"
import { FactRow, FactsCard, SettingsSection, SwitchRow } from "@/components/manage/settings-parts"
import { ScreenFrame } from "@/components/manage/ScreenFrame"

const NOUN: Record<ResourceKind, string> = { materials: "Material", tools: "Tool", "machine-configs": "Machine" }
/** The numeric fields of each kind, with their rules; a field that does not read as a number blocks the save. */
const NUMBER_FIELDS: Record<ResourceKind, ReadonlyArray<{ key: "density" | "diameter" | "flutes" | "maxRPM"; label: string; rules: NumberRules }>> = {
  materials: [{ key: "density", label: "Density", rules: { positive: true } }],
  tools: [
    { key: "diameter", label: "Diameter", rules: { positive: true } },
    { key: "flutes", label: "Flutes", rules: { optional: true, integer: true, positive: true } },
    { key: "maxRPM", label: "Max RPM", rules: { optional: true, integer: true, positive: true } },
  ],
  "machine-configs": [],
}
const KIND_ICON = { materials: Layers3, tools: Wrench, "machine-configs": Cpu } as const

/**
 * One resource, at desktop parity: every field the desktop detail page edits, saved
 * through the same API, plus duplicate (machines) and delete. With `create=1` the same
 * form creates the row. Changes publish `resources.changed`, so the desktop and this
 * phone's list converge without a manual refresh.
 */
export default function ResourceScreen() {
  const { kind: kindParam, id, create } = useLocalSearchParams<{ kind: ResourceKind; id?: string; create?: string }>()
  const kind: ResourceKind = kindParam === "tools" || kindParam === "machine-configs" ? kindParam : "materials"
  const creating = create === "1" || !id
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const [row, setRow] = useState<ResourceRow | undefined>()
  const [loading, setLoading] = useState(!creating)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [density, setDensity] = useState("2700")
  const [hardness, setHardness] = useState("")
  const [toolType, setToolType] = useState("endmill")
  const [diameter, setDiameter] = useState("6")
  const [toolMaterial, setToolMaterial] = useState("Carbide")
  const [flutes, setFlutes] = useState("3")
  const [maxRPM, setMaxRPM] = useState("12000")
  const [machineType, setMachineType] = useState("mill")
  const [controller, setController] = useState("grbl")

  const fill = useCallback((value: ResourceRow) => {
    setRow(value)
    setName(value.name); setDescription(value.description ?? value.notes ?? ""); setIsPublic(value.isPublic === true)
    const properties = (value.properties ?? {}) as Record<string, unknown>
    if (typeof properties["density"] === "number") setDensity(String(properties["density"]))
    if (typeof properties["hardness"] === "string") setHardness(properties["hardness"])
    setToolType(value.type ?? "endmill"); setDiameter(String(value.diameter ?? 6)); setToolMaterial(value.material ?? "Carbide")
    setFlutes(value.numberOfFlutes == null ? "" : String(value.numberOfFlutes)); setMaxRPM(value.maxRPM == null ? "" : String(value.maxRPM))
    setMachineType(value.type ?? "mill")
    const config = (value.config ?? {}) as Record<string, unknown>
    if (typeof config["controller"] === "string") setController(config["controller"])
  }, [])

  const load = useCallback(async () => {
    if (creating || !client || !id) return
    setLoading(true)
    try { fill(await client.resource(kind, id)); setError(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the resource") }
    finally { setLoading(false) }
  }, [client, kind, id, creating, fill])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, done: string, back = false): Promise<void> => {
    setBusy(true)
    try { await action(); haptic("success"); toast(done, "success"); if (back) router.back(); else void load() }
    catch (cause) { haptic("error"); toast(cause instanceof Error ? cause.message : "The desktop refused the change", "error") }
    finally { setBusy(false) }
  }

  const numbers = { density, diameter, flutes, maxRPM }
  /** Shown under a numeric field once a save was tried, so a half-typed value is not called wrong while it is typed. */
  const [checked, setChecked] = useState(false)
  const fieldError = (key: keyof typeof numbers): string | undefined => {
    const field = NUMBER_FIELDS[kind].find((entry) => entry.key === key)
    return checked && field ? numberError(numbers[key], field.label, field.rules) : undefined
  }

  const save = (): void => {
    if (!client || busy || name.trim() === "") return
    setChecked(true)
    const values: Partial<Record<keyof typeof numbers, number | null>> = {}
    for (const field of NUMBER_FIELDS[kind]) {
      const check = checkNumber(numbers[field.key], field.label, field.rules)
      if (!check.ok) { haptic("error"); toast(check.error, "error"); return }
      values[field.key] = check.value
    }
    const material = { name: name.trim(), description: description || null, density: values.density ?? 0, hardness: hardness || undefined, isPublic }
    const tool = { name: name.trim(), description: description || null, type: toolType || "endmill", diameter: values.diameter ?? 0, material: toolMaterial || "Carbide", numberOfFlutes: values.flutes ?? null, maxRPM: values.maxRPM ?? null, isPublic }
    const machine = { name: name.trim(), description: description || null, type: machineType || "mill", controller: controller || "grbl", isPublic }
    if (creating) {
      if (kind === "materials") void run(() => client.createMaterial(material), "Material created", true)
      else if (kind === "tools") void run(() => client.createTool(tool), "Tool created", true)
      else void run(() => client.createMachine(machine), "Machine created", true)
      return
    }
    if (!id) return
    if (kind === "materials") void run(() => client.updateMaterial(id, material), "Material saved")
    else if (kind === "tools") void run(() => client.updateTool(id, tool), "Tool saved")
    else void run(() => client.updateMachine(id, machine, row?.config), "Machine saved")
  }

  const remove = async (): Promise<void> => {
    if (!client || !id || busy) return
    if (await confirmDelete(`Delete “${name}”?`, `This ${NOUN[kind].toLowerCase()} is removed from the desktop too.`)) {
      await run(() => client.deleteResource(kind, id), `${NOUN[kind]} deleted`, true)
    }
  }

  const Icon = KIND_ICON[kind]
  const title = creating ? `New ${NOUN[kind].toLowerCase()}` : (row?.name ?? NOUN[kind])
  return (
    <ScreenFrame title={title} subtitle={creating ? "Saved on the desktop" : NOUN[kind]} backLabel="Back to resources">
      <PageScroll contentInsetAdjustmentBehavior="never" contentContainerStyle={{ gap: 24 }}>
        {loading ? <Skeleton style={{ height: 220 }} /> : <>
          {error ? <ErrorBanner message={error} actionLabel="Retry" onAction={() => void load()} /> : null}
          {!creating && row ? (
            <SheetSection title="Details" footer="As stored on the desktop.">
              <FactsCard>{resourceFacts(kind, row).map((fact) => <FactRow key={fact.label} label={fact.label} value={fact.value} />)}</FactsCard>
            </SheetSection>
          ) : creating ? <SheetSummary eyebrow={NOUN[kind]} title={title} description="Saved on the desktop; every paired surface updates at once." /> : null}

          <SheetSection title={creating ? "Fields" : `Edit ${NOUN[kind].toLowerCase()}`} footer={creating ? undefined : "Saved on the desktop; every paired surface updates at once."}>
            <View style={{ gap: 14 }}>
              <TextField label="Name" value={name} onChangeText={setName} placeholder={`${NOUN[kind]} name`} />
              <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
              {kind === "materials" ? <>
                <TextField label="Density (kg/m³)" value={density} onChangeText={setDensity} keyboardType="decimal-pad" error={fieldError("density")} />
                <TextField label="Hardness" value={hardness} onChangeText={setHardness} placeholder="Optional, e.g. HB 95" />
              </> : null}
              {kind === "tools" ? <>
                <TextField label="Type" value={toolType} onChangeText={setToolType} placeholder="endmill" autoCorrect={false} />
                <TextField label="Diameter (mm)" value={diameter} onChangeText={setDiameter} keyboardType="decimal-pad" error={fieldError("diameter")} />
                <TextField label="Tool material" value={toolMaterial} onChangeText={setToolMaterial} placeholder="Carbide" />
                <TextField label="Flutes" value={flutes} onChangeText={setFlutes} keyboardType="number-pad" placeholder="Optional" error={fieldError("flutes")} />
                <TextField label="Max RPM" value={maxRPM} onChangeText={setMaxRPM} keyboardType="number-pad" placeholder="Optional" error={fieldError("maxRPM")} />
              </> : null}
              {kind === "machine-configs" ? <>
                <TextField label="Machine type" value={machineType} onChangeText={setMachineType} placeholder="mill, lathe, printer, laser" autoCorrect={false} />
                <TextField label="Controller" value={controller} onChangeText={setController} placeholder="grbl" autoCorrect={false} />
                {creating ? <Text style={{ color: palette.muted, ...type(13) }}>Work volume starts at 300×180×60 mm; adjust it on the desktop.</Text> : null}
              </> : null}
            </View>
          </SheetSection>

          <SettingsSection title="Visibility">
            <SwitchRow icon={Globe2} title="Public" description="Visible to every user of the desktop" value={isPublic} onValueChange={setIsPublic} />
          </SettingsSection>

          <ActionButton label={creating ? `Create ${NOUN[kind].toLowerCase()}` : "Save changes"} icon={creating ? <Icon size={17} color={palette.onAccent} strokeWidth={2.2} /> : undefined} loading={busy} disabled={name.trim() === ""} onPress={save} />

          {!creating ? (
            <SheetSection title="Actions">
              <DividedRows inset={TILE_INSET}>
                {kind === "machine-configs" ? <ChoiceRow icon={Copy} title="Duplicate machine" description="A copy with the same configuration" busy={busy} onPress={() => { if (client && id) void run(() => client.cloneMachine(id), "Machine duplicated", true) }} /> : null}
                <ChoiceRow icon={Trash2} destructive title={`Delete ${NOUN[kind].toLowerCase()}`} description="Removes it from the desktop too" busy={busy} onPress={() => void remove()} />
              </DividedRows>
            </SheetSection>
          ) : null}
        </>}
      </PageScroll>
    </ScreenFrame>
  )
}
