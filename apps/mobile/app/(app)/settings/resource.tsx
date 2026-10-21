import { useCallback, useEffect, useState } from "react"
import { Switch, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { confirmDelete } from "@/lib/manage"
import { resourceFacts } from "@/lib/resources"
import type { ResourceKind, ResourceRow } from "@/lib/client"
import { PageScroll } from "@/components/layout/page-scroll"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { toast } from "@/components/ui/ToastHost"
import { type } from "@/lib/typography"

const NOUN: Record<ResourceKind, string> = { materials: "Material", tools: "Tool", "machine-configs": "Machine" }
const num = (value: string, fallback = 0): number => { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : fallback }

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

  const save = (): void => {
    if (!client || busy || name.trim() === "") return
    if (creating) {
      if (kind === "materials") void run(() => client.createMaterial({ name: name.trim(), description: description || null, density: num(density), hardness: hardness || undefined, isPublic }), "Material created", true)
      else if (kind === "tools") void run(() => client.createTool({ name: name.trim(), description: description || null, type: toolType || "endmill", diameter: num(diameter, 6), material: toolMaterial || "Carbide", numberOfFlutes: flutes === "" ? null : num(flutes), maxRPM: maxRPM === "" ? null : num(maxRPM), isPublic }), "Tool created", true)
      else void run(() => client.createMachine({ name: name.trim(), description: description || null, type: machineType || "mill", controller: controller || "grbl", isPublic }), "Machine created", true)
      return
    }
    if (!id) return
    if (kind === "materials") void run(() => client.updateMaterial(id, { name: name.trim(), description: description || null, density: num(density), hardness: hardness || undefined, isPublic }), "Material saved")
    else if (kind === "tools") void run(() => client.updateTool(id, { name: name.trim(), description: description || null, type: toolType || "endmill", diameter: num(diameter, 6), material: toolMaterial || "Carbide", numberOfFlutes: flutes === "" ? null : num(flutes), maxRPM: maxRPM === "" ? null : num(maxRPM), isPublic }), "Tool saved")
    else void run(() => client.updateMachine(id, { name: name.trim(), description: description || null, type: machineType || "mill", controller: controller || "grbl", isPublic }, row?.config), "Machine saved")
  }

  const remove = async (): Promise<void> => {
    if (!client || !id || busy) return
    if (await confirmDelete(`Delete “${name}”?`, `This ${NOUN[kind].toLowerCase()} is removed from the desktop too.`)) {
      await run(() => client.deleteResource(kind, id), `${NOUN[kind]} deleted`, true)
    }
  }

  return <>
    <Stack.Screen options={{ title: creating ? `New ${NOUN[kind]}` : (row?.name ?? NOUN[kind]) }} />
    <PageScroll>
      {loading ? <Skeleton style={{ height: 220 }} /> : <>
        {error ? <ErrorBanner message={error} actionLabel="Retry" onAction={() => void load()} /> : null}
        {!creating && row ? <SurfaceCard title="Details" description="As stored on the desktop.">{resourceFacts(kind, row).map((fact) => (
          <View key={fact.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
            <Text style={{ color: palette.muted, ...type(14) }}>{fact.label}</Text>
            <Text style={{ color: palette.ink, ...type(14, { weight: "600" }) }}>{fact.value}</Text>
          </View>))}
        </SurfaceCard> : null}
        <SurfaceCard title={creating ? `New ${NOUN[kind]}` : `Edit ${NOUN[kind]}`} description="Saved on the desktop; every paired surface updates at once.">
          <View style={{ gap: 14, padding: 16 }}>
            <TextField label="Name" value={name} onChangeText={setName} placeholder={`${NOUN[kind]} name`} />
            <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
            {kind === "materials" ? <>
              <TextField label="Density (kg/m³)" value={density} onChangeText={setDensity} keyboardType="decimal-pad" />
              <TextField label="Hardness" value={hardness} onChangeText={setHardness} placeholder="Optional, e.g. HB 95" />
            </> : null}
            {kind === "tools" ? <>
              <TextField label="Type" value={toolType} onChangeText={setToolType} placeholder="endmill" autoCorrect={false} />
              <TextField label="Diameter (mm)" value={diameter} onChangeText={setDiameter} keyboardType="decimal-pad" />
              <TextField label="Tool material" value={toolMaterial} onChangeText={setToolMaterial} placeholder="Carbide" />
              <TextField label="Flutes" value={flutes} onChangeText={setFlutes} keyboardType="number-pad" />
              <TextField label="Max RPM" value={maxRPM} onChangeText={setMaxRPM} keyboardType="number-pad" />
            </> : null}
            {kind === "machine-configs" ? <>
              <TextField label="Machine type" value={machineType} onChangeText={setMachineType} placeholder="mill, lathe, printer, laser" autoCorrect={false} />
              <TextField label="Controller" value={controller} onChangeText={setController} placeholder="grbl" autoCorrect={false} />
              {creating ? <Text style={{ color: palette.muted, ...type(13) }}>Work volume starts at 300×180×60 mm; adjust it on the desktop.</Text> : null}
            </> : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: palette.ink, flex: 1, ...type(15) }}>Public (visible to all users)</Text>
              <Switch accessibilityLabel="Make public" value={isPublic} trackColor={{ true: palette.accent }} onValueChange={setIsPublic} />
            </View>
            <ActionButton label={creating ? `Create ${NOUN[kind]}` : "Save changes"} loading={busy} disabled={name.trim() === ""} onPress={save} />
          </View>
        </SurfaceCard>
        {!creating ? <SurfaceCard title="Actions">
          <View style={{ gap: 10, padding: 16 }}>
            {kind === "machine-configs" ? <ActionButton label="Duplicate machine" variant="secondary" loading={busy} onPress={() => { if (client && id) void run(() => client.cloneMachine(id), "Machine duplicated", true) }} /> : null}
            <ActionButton label={`Delete ${NOUN[kind]}`} variant="danger" loading={busy} onPress={() => void remove()} />
          </View>
        </SurfaceCard> : null}
      </>}
    </PageScroll>
  </>
}
