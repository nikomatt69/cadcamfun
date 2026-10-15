/**
 * Runs the compiled sidecar, not only its bundle (AI-11 Step 11): compiles it with `compile-sidecar.ts` (or takes an existing
 * executable), starts it on a throw-away data directory with the AI offline, and records a baseline: time to the ready event,
 * health and action latency, the kernel worker inside the executable (`cad.parametric_test` with dimensional checks), the
 * longest stall of the event loop as seen from outside (the slowest health answer while a kernel job runs) and resident memory.
 *
 * `bun --no-env-file scripts/smoke-sidecar.ts [--binary <path>] [--json]`. Exits 1 when a step fails. No model is called.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const REPO = join(import.meta.dir, "..")
const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const asJson = args.includes("--json")
const say = (line: string) => { if (!asJson) console.error(line) }

const work = await mkdtemp(join(tmpdir(), "cadcamfun-smoke-"))
let binary = flag("--binary")
if (binary === undefined) {
  binary = join(work, "cadcamfun-sidecar")
  const started = performance.now()
  const build = Bun.spawnSync(["bun", "--no-env-file", join(REPO, "scripts", "compile-sidecar.ts"), join(REPO, "apps", "sidecar", "src", "main.ts"), `bun-${process.platform}-${process.arch}`, binary], { cwd: REPO, stdout: "pipe", stderr: "pipe" })
  if (build.exitCode !== 0) {
    console.error(build.stderr.toString() || build.stdout.toString())
    process.exit(1)
  }
  say(`compiled in ${Math.round(performance.now() - started)} ms`)
}

const token = crypto.randomUUID()
const started = performance.now()
const child = Bun.spawn([binary], {
  cwd: work,
  env: { PATH: process.env["PATH"] ?? "", HOME: work, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: join(work, "data"), CADCAMFUN_MIGRATIONS_DIR: join(REPO, "packages", "db", "drizzle"), CADCAMFUN_AI_OFFLINE: "true" },
  // The sidecar stops when its stdin closes (parent death), so the smoke holds a pipe open like the shell does.
  stdin: "pipe",
  stdout: "pipe",
  stderr: "ignore"
})

const fail = async (message: string): Promise<never> => {
  console.error(`smoke: ${message}`)
  child.kill()
  await child.exited
  await rm(work, { recursive: true, force: true })
  process.exit(1)
}

/** The first stdout line is the ready (or error) event the shell waits for. */
const readyLine = async (): Promise<string> => {
  const reader = child.stdout.getReader()
  let text = ""
  const deadline = Date.now() + 60_000
  while (!text.includes("\n") && Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    text += new TextDecoder().decode(value)
  }
  reader.releaseLock()
  return text.split("\n")[0] ?? ""
}

const ready = JSON.parse((await readyLine()) || "{}") as { event?: string; port?: number; message?: string }
if (ready.event !== "ready" || ready.port === undefined) await fail(`no ready event: ${JSON.stringify(ready)}`)
const readyMs = performance.now() - started
const base = `http://127.0.0.1:${ready.port}`
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }

const call = async (method: string, path: string, body?: unknown) => {
  const t = performance.now()
  const res = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const json = await res.json().catch(() => undefined) as Record<string, unknown> | undefined
  return { status: res.status, json, ms: performance.now() - t }
}
const percentile = (values: ReadonlyArray<number>, p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0
const rssMb = async (): Promise<number | undefined> => {
  const status = await readFile(`/proc/${child.pid}/status`, "utf8").catch(() => undefined)
  const kb = status?.match(/VmRSS:\s+(\d+)/)?.[1]
  return kb === undefined ? undefined : Math.round(Number(kb) / 1024)
}

const rssAtReady = await rssMb()
const health: number[] = []
for (let i = 0; i < 50; i++) {
  const reply = await call("GET", "/api/health")
  if (reply.status !== 200) await fail(`health answered ${reply.status}`)
  health.push(reply.ms)
}

const project = await call("POST", "/api/projects", { name: "Smoke" })
const projectId = project.json?.["id"] as string | undefined
if (projectId === undefined) await fail(`project not created: ${project.status} ${JSON.stringify(project.json)}`)
const invoke = (tool: string, input: Record<string, unknown>) => call("POST", "/api/ai/actions/invoke", { projectId, tool, input })

const recipe = await invoke("cad_edit", { action: "parametric_recipe_create", recipe: "mounting_plate", name: "Smoke plate" })
const created = (recipe.json?.["result"] as { created?: { ids?: ReadonlyArray<string> } } | undefined)?.created
const elementId = created?.ids?.[0]
if (recipe.status !== 200 || elementId === undefined) await fail(`recipe not created: ${recipe.status} ${JSON.stringify(recipe.json).slice(0, 400)}`)

const actionTimes: number[] = []
for (let i = 0; i < 20; i++) {
  const reply = await invoke("cad", { action: "describe" })
  if (reply.status !== 200) await fail(`cad.describe answered ${reply.status}`)
  actionTimes.push(reply.ms)
}

// A kernel job in the executable's worker, while health is polled: the slowest answer is the stall a user would feel.
const cases = [{ name: "as asked", parameters: {}, checks: [
  { kind: "extent", name: "length", axis: "x", nominal: 100, tolerance: { plus: 0.05, minus: 0.05 } },
  { kind: "hole", name: "corner bore", feature: "hole_sw", diameter: { nominal: 9, tolerance: { plus: 0.01, minus: 0.01 } }, through: true },
  { kind: "hole_count", name: "holes", nominal: 4 }
] }]
let polling = true
const during: number[] = []
const poller = (async () => { while (polling) during.push((await call("GET", "/api/health")).ms) })()
const job = await invoke("cad", { action: "parametric_test", elementId, cases })
polling = false
await poller
const jobResult = job.json?.["result"] as { ok?: boolean; cases?: ReadonlyArray<{ passed?: boolean; acceptance?: { accepted?: boolean } }> } | undefined
const accepted = jobResult?.cases?.[0]?.acceptance?.accepted
if (job.status !== 200 || accepted !== true) await fail(`parametric_test did not accept the part: ${job.status} ${JSON.stringify(job.json).slice(0, 600)}`)
const rssAfter = await rssMb()

// The shell's own shutdown: the shutdown event on stdin, then stdin closes.
const stopping = performance.now()
child.stdin.write(`${JSON.stringify({ event: "shutdown" })}\n`)
await child.stdin.end()
const exitCode = await Promise.race([child.exited, Bun.sleep(5_000).then(() => { child.kill(); return -1 })])
const shutdownMs = performance.now() - stopping
await rm(work, { recursive: true, force: true })

const round = (n: number) => Math.round(n * 10) / 10
const report = {
  readyMs: round(readyMs),
  healthMs: { p50: round(percentile(health, 0.5)), p95: round(percentile(health, 0.95)) },
  actionMs: { action: "cad.describe", p50: round(percentile(actionTimes, 0.5)), p95: round(percentile(actionTimes, 0.95)) },
  kernelJob: { action: "cad.parametric_test", ms: round(job.ms), accepted, healthDuringMaxMs: round(Math.max(0, ...during)), healthSamples: during.length },
  rssMb: { ready: rssAtReady, afterJob: rssAfter },
  shutdownMs: round(shutdownMs),
  exitCode
}
if (asJson) console.log(JSON.stringify(report))
else console.error(JSON.stringify(report, null, 2))
if (exitCode !== 0) process.exit(1)
