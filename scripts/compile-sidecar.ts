/**
 * Compiles the sidecar into a single executable, the way `bun build --compile` does, but through `Bun.build` so that build plugins run.
 *
 * Why not the CLI: the embedded nikcli host has one rule that sends images inside tool results (the viewport capture) in a shape its
 * own request lowering refuses ("... cannot take this request: tool result content \"media\""). The application corrects that rule with
 * a patch (`packages/ai/src/nikcli/host-patches.ts`, with the other mandatory host patches). A run-time plugin cannot reach a bundle
 * that is compiled into the executable, so the same patches are applied here, while the bundle is read. `bun scripts/compile-sidecar.ts <entry> <bun-target> <outfile>`.
 */
import { hostPatchesPlugin, hostPatchesApplied, hostPatchReport } from "../packages/ai/src/nikcli/host-patches.ts"

const [entry, target, outfile] = process.argv.slice(2)
if (!entry || !target || !outfile) {
  console.error("usage: bun scripts/compile-sidecar.ts <entry> <bun-target> <outfile>")
  process.exit(2)
}
const result = await Bun.build({
  entrypoints: [entry],
  compile: { target: target as never, outfile },
  plugins: [hostPatchesPlugin as never]
})
if (!result.success) {
  for (const log of result.logs) console.error(String(log))
  process.exit(1)
}
// A build that did not patch the host would ship a host that half works: say so loudly rather than quietly.
const report = hostPatchReport() ?? []
if (!hostPatchesApplied()) {
  console.error(`compile-sidecar: the nikcli host bundle was not patched: ${report.length === 0 ? "the bundle was never loaded" : report.map((entry) => `${entry.name}=${entry.status}`).join(", ")}; refusing to produce an executable.`)
  process.exit(1)
}
console.log(`compiled ${outfile} (host patches: ${report.map((entry) => entry.name).join(", ")})`)
