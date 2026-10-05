import { For, Show, createSignal, createMemo } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { useApp } from "../state/context.ts"
import { useRead } from "../app/queries.ts"
import { SchemaForm } from "../components/schema-form.tsx"
import { defaultsOf } from "../components/schema-form.ts"
import { View3D } from "../viewport/index.ts"
import { t } from "../i18n/index.ts"
import { ScreenHeader } from "./screen-parts.tsx"

export function CamScreen() {
  const app = useApp()
  const [search] = useSearchParams()
  const projectId = () => typeof search.projectId === "string" ? search.projectId : app.recents()[0]?.id
  const tools = useRead((client) => client.tools.list({ query: {} }))
  const operations = useRead((client) => client.toolpaths.list({ query: { projectId: projectId() } }))
  const [toolId, setToolId] = createSignal("")
  const [error, setError] = createSignal<string>()
  const [pending, setPending] = createSignal(false)
  const [gcode, setGcode] = createSignal("")
  const [program, setProgram] = createSignal<cam.Program>()
  const [playing, setPlaying] = createSignal(false)
  const [time, setTime] = createSignal(0)
  const defaults = defaultsOf(new cam.ProfileParams({ totalDepth: 3, stepdown: 1 }), cam.ProfileParams)
  const selectedTool = createMemo(() => tools.data()?.find((tool) => tool.id === toolId()) ?? tools.data()?.[0])
  const generate = async (params: cam.ProfileParams) => {
    if (pending()) return
    setError(undefined); setPending(true)
    try {
      const project = projectId()
      if (!project) throw new Error(t("cad.chooseProject"))
      if (!app.drawing().entities.length) throw new Error(t("cam.noGeometry"))
      const row = selectedTool()
      if (!row) throw new Error(t("library.empty.tools"))
      const tool = Schema.decodeUnknownSync(cam.ToolSchema)({ id: row.id, name: row.name, kind: row.type, diameter: row.diameter, flutes: row.numberOfFlutes ?? 2, maxRpm: row.maxRPM ?? 18000 })
      const path = cam.generateProfile(params, app.drawing().entities, tool, { x: 300, y: 180, z: params.totalDepth, origin: { x: 0, y: 0, z: 0 }, material: "" })
      if (!path.moves.some((move) => move._tag === "Linear" || move._tag === "Arc")) throw new Error(t("cam.noGeometry"))
      const next = cam.makeProgram(params.name, [path], { units: app.settings.settings().units })
      const postId = app.settings.settings().postProcessor
      const post = postId === "gcode" ? cam.getPost("generic") : postId === "grbl" || postId === "fanuc" ? cam.getPost(postId) : undefined
      if (!post) throw new Error(t("cam.postUnavailable"))
      const code = post.emit(next, { decimals: app.settings.settings().decimals })
      await app.runtime.run(app.client.toolpaths.create({ payload: { name: params.name, projectId: project, operationType: "profile", type: "mill", toolId: row.id, data: next, gcode: code } }))
      setProgram(next); setGcode(code); setTime(0)
      await operations.refetch()
    } catch (cause) { setError(String(cause)) }
    finally { setPending(false) }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([gcode()], { type: "text/plain" }))
    const link = document.createElement("a"); link.href = url; link.download = "toolpath.nc"; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section><ScreenHeader title={t("cam.title")} subtitle={t("cam.subtitle")} />
    <div class="grid gap-5 p-5 xl:grid-cols-[180px_1fr_1fr]">
      <aside><h2 class="mb-3 font-semibold">{t("cam.operations")}</h2><For each={operations.data()}>{(row) => <button class="btn btn-outline mb-2 w-full" onClick={() => {
        setGcode(row.gcode ?? ""); setError(undefined)
        try { setProgram(Schema.decodeUnknownSync(cam.ProgramSchema)(row.data)); setTime(0) } catch { setProgram(undefined) }
      }}>{row.name}</button>}</For><Show when={operations.error()}><p role="alert">{operations.error()}</p></Show></aside>
      <div><label class="form-label">{t("library.tab.tools")}<select class="form-select mb-4" value={selectedTool()?.id ?? ""} onChange={(e) => setToolId(e.currentTarget.value)}><For each={tools.data()}>{(tool) => <option value={tool.id}>{tool.name}</option>}</For></select></label>
        <fieldset disabled={pending()}><legend class="mb-3 font-semibold">{t("cam.operationProfile")}</legend><SchemaForm schema={cam.ProfileParams} values={defaults} onSubmit={(params) => void generate(params)} submitLabel={t("cam.generate")} /></fieldset>
        <Show when={error()}><p class="mt-3 text-red-600" role="alert">{error()}</p></Show>
      </div>
      <div><h2 class="font-semibold">{t("cam.preview")}</h2><div class="h-72"><View3D drawing={app.drawing()} program={program()} playing={playing()} playbackTime={time()} onPlaybackTimeChange={setTime} /></div><button class="btn btn-outline" onClick={() => setPlaying(!playing())}>{t(playing() ? "cam.pause" : "cam.play")}</button><button class="btn btn-outline" onClick={() => { setTime(0); setPlaying(false) }}>{t("form.reset")}</button>
        <h2 class="mt-5 font-semibold">{t("cam.gcode")}</h2><textarea aria-label={t("cam.gcode")} class="form-textarea h-64 font-mono text-xs" readonly value={gcode()} /><button class="btn btn-primary mt-3" disabled={!gcode()} onClick={download}>{t("cam.export")}</button>
      </div>
    </div></section>
}
