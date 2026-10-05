import { selectReleaseRef } from "./release-helpers.ts";

if (import.meta.main) {
  const config: unknown = await Bun.file(new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url)).json();
  if (typeof config !== "object" || config === null || !("version" in config) || typeof config.version !== "string") throw new Error("Missing application version");
  const selection = selectReleaseRef(process.env.GITHUB_EVENT_NAME ?? "", process.env.GITHUB_REF ?? "", process.env.RELEASE_TAG, config.version);
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("Missing GitHub output path");
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  const date = Bun.spawnSync(["git", "show", "-s", "--format=%cI", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  const tagged = Bun.spawnSync(["git", "rev-parse", "--verify", `refs/tags/${selection.tag}^{commit}`], { stdout: "pipe", stderr: "pipe" });
  if (commit.exitCode !== 0 || date.exitCode !== 0) throw new Error("Unable to resolve release commit");
  if (tagged.exitCode !== 0 || tagged.stdout.toString().trim() !== commit.stdout.toString().trim()) throw new Error("Checkout is not the requested release tag");
  const { appendFile } = await import("node:fs/promises");
  await appendFile(output, `tag=${selection.tag}\nversion=${selection.version}\nsha=${commit.stdout.toString().trim()}\npub_date=${date.stdout.toString().trim()}\n`);
}
