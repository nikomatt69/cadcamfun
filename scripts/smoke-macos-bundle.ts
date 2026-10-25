/** Verifies a built macOS app bundle and runs its exact bundled Bun sidecar. */
import { readdir, stat } from "node:fs/promises"
import { join, resolve } from "node:path"

const value = (name: string): string | undefined => {
  const index = Bun.argv.indexOf(name)
  return index < 0 ? undefined : Bun.argv[index + 1]
}
const rootArg = value("--bundle-root")
if (rootArg === undefined) throw new Error("usage: smoke-macos-bundle.ts --bundle-root <Tauri bundle/macos directory>")
const bundleRoot = resolve(rootArg)
const apps: string[] = []
for (const entry of await readdir(bundleRoot)) {
  if (!entry.endsWith(".app")) continue
  const path = join(bundleRoot, entry)
  if ((await stat(path)).isDirectory()) apps.push(path)
}
if (apps.length !== 1) throw new Error(`expected exactly one .app under ${bundleRoot}; found ${apps.length}`)
const app = apps[0]!
const sidecar = join(app, "Contents", "MacOS", "sidecar")

const run = (command: string, args: string[], allowFailure = false): string => {
  const result = Bun.spawnSync([command, ...args], { stdout: "pipe", stderr: "pipe" })
  const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim()
  if (result.exitCode !== 0 && !allowFailure) throw new Error(`${command} ${args.join(" ")} failed (${result.exitCode}): ${output}`)
  return output
}

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app])
const details = run("codesign", ["-dv", "--verbose=4", app], true)
const developerId = details.includes("Authority=Developer ID Application:")
if (developerId) {
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", app])
  run("xcrun", ["stapler", "validate", app])
  console.log("macOS bundle: Developer ID signature, Gatekeeper assessment and notarization ticket verified")
} else {
  console.log("macOS bundle: ad-hoc signature verified; Developer ID and notarization were not available for this build")
}

const smoke = Bun.spawnSync(["bun", "--no-env-file", join(import.meta.dir, "smoke-sidecar.ts"), "--binary", sidecar, "--json"], {
  cwd: resolve(import.meta.dir, ".."),
  stdout: "pipe",
  stderr: "inherit"
})
if (smoke.exitCode !== 0) throw new Error(`the sidecar embedded in ${app} failed its startup, authenticated health, kernel and shutdown smoke`)
console.log(`bundled sidecar smoke: ${smoke.stdout.toString().trim()}`)
