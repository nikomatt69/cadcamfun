// Compiles the stub sidecar into src-tauri/binaries/sidecar-<target-triple>.
//
// Usage: bun scripts/build-stub-sidecar.ts [--if-missing]
//   --if-missing  do nothing when a sidecar binary for the host already exists, so the
//                 real sidecar build (WP4) is never overwritten by the stub.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "src-tauri");

async function hostTriple(): Promise<string> {
  const proc = Bun.spawn(["rustc", "-vV"], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  const host = text.split("\n").find((line) => line.startsWith("host:"));
  const triple = host?.slice("host:".length).trim();
  if (!triple) throw new Error("could not read the host target triple from `rustc -vV`");
  return triple;
}

const triple = await hostTriple();
const extension = triple.includes("windows") ? ".exe" : "";
const outfile = join(root, "binaries", `sidecar-${triple}${extension}`);

if (process.argv.includes("--if-missing") && existsSync(outfile)) {
  console.log(`sidecar already present: ${outfile}`);
  process.exit(0);
}

mkdirSync(join(root, "binaries"), { recursive: true });
const result = Bun.spawnSync(
  ["bun", "build", "--compile", join(root, "stub", "stub-sidecar.ts"), "--outfile", outfile],
  { stdout: "inherit", stderr: "inherit" },
);
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
console.log(`stub sidecar written: ${outfile}`);
