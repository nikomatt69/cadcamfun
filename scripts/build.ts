#!/usr/bin/env bun
/**
 * CADCAM FUN v6 — the one reproducible build pipeline, run locally and in CI
 * (specs/10-release-sync.md §1). Six steps, always in this order:
 *
 *   1. install     bun install --frozen-lockfile
 *   2. check       bun run typecheck && bun run test
 *   3. compile     compile the sidecar (Bun.build, host patch applied) into src-tauri/binaries/sidecar-<triple>
 *   4. resources   copy packages/db/drizzle/ into src-tauri/resources/migrations/
 *   5. bundle      vite build (via @cadcamfun/desktop) then bunx tauri build
 *   6. artifacts   SHA-256 checksums + release notes from the commits since the last tag
 *
 * The script never reads `.env*` and never prints secret values. Every step is
 * announced, spawns its command with the inherited environment, and a non-zero
 * exit code aborts the run immediately (fail fast).
 *
 * Run a subset while iterating:
 *   bun scripts/build.ts --help
 *   bun scripts/build.ts --only=notes --dry-run
 *   bun scripts/build.ts --only=resources
 *   bun scripts/build.ts --skip-tests --target=aarch64-apple-darwin
 */

import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { assertSigningConfig, bundleRoot, indexArtifacts, previousReleaseTag, releaseVersion, targetInfo } from "./release-helpers.ts";

import { signingEnvironment } from "./signing-config.ts";

const ROOT = resolve(import.meta.dir, "..");
const DESKTOP = join(ROOT, "apps", "desktop");
const SRC_TAURI = join(DESKTOP, "src-tauri");
const SIDECAR_ENTRY = join(ROOT, "apps", "sidecar", "src", "main.ts");
const MIGRATIONS_SOURCE = join(ROOT, "packages", "db", "drizzle");
const MIGRATIONS_TARGET = join(SRC_TAURI, "resources", "migrations");
const DEFAULT_OUT_DIR = join(SRC_TAURI, "target", "release-artifacts");

const STEP_NAMES = ["install", "check", "compile", "resources", "bundle", "artifacts"] as const;
type StepName = (typeof STEP_NAMES)[number];

/** Human-friendly names accepted by `--only`/`--skip` as aliases of a step. */
const STEP_ALIASES: Readonly<Record<string, StepName>> = {
  install: "install",
  deps: "install",
  check: "check",
  checks: "check",
  test: "check",
  tests: "check",
  compile: "compile",
  sidecar: "compile",
  resources: "resources",
  resource: "resources",
  migrations: "resources",
  bundle: "bundle",
  bundling: "bundle",
  artifacts: "artifacts",
  artefacts: "artifacts",
  artifact: "artifacts",
  notes: "artifacts",
  checksums: "artifacts",
  release: "artifacts",
};

class BuildError extends Error {}

interface Options {
  steps: readonly StepName[];
  skipTests: boolean;
  skipInstall: boolean;
  updaterArtifacts: boolean;
  dryRun: boolean;
  target?: string;
  bundles?: string;
  outDir: string;
  help: boolean;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function childEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

let dryRun = false;
let target: string | undefined;
let bundles: string | undefined;
let outDir = DEFAULT_OUT_DIR;
let skipTests = false;
let updaterArtifacts = true;

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function announce(step: number, title: string): void {
  say("");
  say(`── step ${step}/6 · ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

function rel(path: string): string {
  const printed = relative(ROOT, path);
  return printed.startsWith("..") ? path : printed;
}

function quote(value: string): string {
  return /[^A-Za-z0-9._/:=-]/.test(value) ? `'${value.replaceAll("'", "'\\''")}'` : value;
}

/** Spawns a command, streaming its output; returns stdout for commands we parse. */
async function run(
  command: readonly string[],
  options: { cwd?: string; capture?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? ROOT;
  if (dryRun) {
    say(`   [dry-run] would run: ${command.map(quote).join(" ")}`);
    return { stdout: "", stderr: "" };
  }
  say(`   $ ${command.map(quote).join(" ")}`);
  const executable = command[0];
  const argv = executable === "bun" || executable === "bunx"
    ? [executable, "--no-env-file", ...command.slice(1)] : [...command];
  const child = Bun.spawn(argv, {
    cwd,
    stdin: "inherit",
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.capture ? "pipe" : "inherit",
    env: options.env ?? childEnv(),
  });
  const [stdout, stderr, code] = await Promise.all([
    options.capture ? new Response(child.stdout as ReadableStream).text() : Promise.resolve(""),
    options.capture ? new Response(child.stderr as ReadableStream).text() : Promise.resolve(""),
    child.exited,
  ]);
  if (code !== 0) {
    if (options.capture) {
      process.stderr.write(stdout);
      process.stderr.write(stderr);
    }
    throw new BuildError(`\`${command.map(quote).join(" ")}\` failed with exit code ${code}`);
  }
  return { stdout, stderr };
}

/**
 * Read-only git question (host triple, last tag, commit list). It must work in
 * `--dry-run`, which writes nothing, so it bypasses `run` and its guard.
 */
async function probeGit(args: readonly string[]): Promise<CommandResult | null> {
  const child = Bun.spawn(["git", ...args] as string[], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
    env: childEnv(),
  });
  const [stdout, code] = await Promise.all([
    new Response(child.stdout as ReadableStream).text(),
    child.exited,
  ]);
  return code === 0 ? { stdout, stderr: "" } : null;
}

async function requirePath(path: string, what: string): Promise<void> {
  if (dryRun || existsSync(path)) return;
  throw new BuildError(`${what} is missing: ${rel(path)}`);
}

// ───────────────────────────────── steps ──────────────────────────────────

async function stepInstall(): Promise<void> {
  announce(1, "install workspace dependencies");
  // Match nikcli's cross-platform builder: keep every optional native dependency available so an
  // Apple Silicon runner can compile the Intel sidecar and each native runner gets its FFI binary.
  await run(["bun", "install", "--frozen-lockfile", "--os=*", "--cpu=*"]);
}

async function stepCheck(): Promise<void> {
  announce(2, "typecheck and test the workspace");
  await run(["bun", "run", "typecheck"]);
  if (skipTests) say("   --skip-tests: unit tests skipped");
  else await run(["bun", "run", "test"]);
}

async function resolveTarget(): Promise<string> {
  if (target !== undefined) return target;
  const child = Bun.spawn(["rustc", "-vV"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
    env: childEnv(),
  });
  const [version, code] = await Promise.all([
    new Response(child.stdout as ReadableStream).text(),
    child.exited,
  ]);
  const triple = code === 0
    ? version
        .split("\n")
        .find((line) => line.startsWith("host:"))
        ?.slice("host:".length)
        .trim()
    : undefined;
  if (triple === undefined || triple === "") {
    throw new BuildError(
      "cannot determine the target triple: is `rustc` on PATH? otherwise pass --target=<triple>",
    );
  }
  return triple;
}

/** `bun build --compile` target names, e.g. `bun-darwin-arm64`, `bun-windows-x64`. */

function sidecarOutfile(triple: string): string {
  const extension = triple.includes("windows") ? ".exe" : "";
  return join(SRC_TAURI, "binaries", `sidecar-${triple}${extension}`);
}

/**
 * `true` when two files hold the same bytes, `false` when either is missing.
 *
 * Used by the two steps that write *into* `src-tauri/`. `tauri dev` watches that directory, so
 * rewriting an identical file makes it tear the whole app down and rebuild — a dev restart on every
 * build, even one where nothing changed. Comparing first turns a no-op build into a no-op write.
 */
async function sameBytes(left: string, right: string): Promise<boolean> {
  if (!existsSync(left) || !existsSync(right)) return false;
  const [a, b] = await Promise.all([readFile(left), readFile(right)]);
  return a.length === b.length && createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");
}

/** `true` when two directories hold the same set of files with the same bytes. */
async function sameTree(left: string, right: string): Promise<boolean> {
  if (!existsSync(left) || !existsSync(right)) return false;
  // `readdir` reports `parentPath` exactly as the directory was named, so strip that prefix to get a
  // path relative to each root; otherwise the two sides are never comparable.
  const names = async (dir: string) => {
    const root = resolve(dir);
    const prefix = `${root}/`;
    return (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => {
        const parent = resolve(e.parentPath);
        return parent === root ? e.name : `${parent.slice(prefix.length)}/${e.name}`;
      })
      .sort();
  };
  const [a, b] = await Promise.all([names(left), names(right)]);
  if (a.length !== b.length || a.some((n, i) => n !== b[i])) return false;
  return (await Promise.all(a.map((n) => sameBytes(join(left, n), join(right, n))))).every(Boolean);
}

async function stepCompile(): Promise<void> {
  const triple = await resolveTarget();
  const outfile = sidecarOutfile(triple);
  announce(3, "compile the sidecar for the target triple");
  say(`   triple ${triple} → ${rel(outfile)}`);
  await requirePath(SIDECAR_ENTRY, "sidecar entrypoint (WP4: apps/sidecar/src/main.ts)");
  // Compile beside the real binary and swap it in only when the result differs, so an unchanged build
  // leaves `src-tauri/binaries/` untouched and `tauri dev` keeps the window it already has open.
  const candidate = `${outfile}.candidate`;
  if (!dryRun) {
    await mkdir(dirname(outfile), { recursive: true });
    await rm(candidate, { force: true });
  }
  // Through `Bun.build` rather than `bun build --compile`: the embedded nikcli host needs a one-line patch that only a build plugin can
  // apply once the bundle is compiled in (see `scripts/compile-sidecar.ts`).
  await run([
    "bun",
    "scripts/compile-sidecar.ts",
    SIDECAR_ENTRY,
    targetInfo(triple).bunTarget,
    dryRun ? outfile : candidate,
  ]);
  if (dryRun) return;
  if (await sameBytes(candidate, outfile)) {
    await rm(candidate, { force: true });
    say("   unchanged — kept the previous binary (tauri dev does not restart)");
    return;
  }
  say(`   replaced the previous binary (${new Date().toISOString()})`);
  await rm(outfile, { force: true });
  await cp(candidate, outfile);
  await rm(candidate, { force: true });
}

async function stepResources(): Promise<void> {
  announce(4, "stage the database migrations as a bundled resource");
  say(`   ${rel(MIGRATIONS_SOURCE)} → ${rel(MIGRATIONS_TARGET)}`);
  await requirePath(MIGRATIONS_SOURCE, "generated migrations (run `bun run db:generate`)");
  if (dryRun) {
    say(`   [dry-run] would replace ${rel(MIGRATIONS_TARGET)} with a fresh copy`);
    return;
  }
  // Replace instead of merge: a stale migration folder in the bundle is worse
  // than none, and this keeps the step idempotent. Only when it actually differs —
  // `src-tauri/` is watched by `tauri dev`, so an identical restage is a restart.
  const changed = !(await sameTree(MIGRATIONS_SOURCE, MIGRATIONS_TARGET));
  if (changed) {
    await rm(MIGRATIONS_TARGET, { recursive: true, force: true });
    await mkdir(dirname(MIGRATIONS_TARGET), { recursive: true });
    await cp(MIGRATIONS_SOURCE, MIGRATIONS_TARGET, { recursive: true });
  }
  const staged = (await readdir(MIGRATIONS_TARGET)).filter((name) => !name.startsWith("."));
  if (!changed) say("   unchanged — kept the staged migrations (tauri dev does not restart)");
  else say(`   ${staged.length} migration entr${staged.length === 1 ? "y" : "ies"} staged:`);
  for (const name of staged) say(`     ${name}`);
}

async function stepBundle(): Promise<void> {
  const triple = await resolveTarget();
  const config = JSON.parse(await readFile(join(SRC_TAURI, "tauri.conf.json"), "utf8"));
  // Only the bundler receives local signing credentials; checks and sidecar builds do not.
  const signingEnv = dryRun || !updaterArtifacts ? childEnv() : signingEnvironment(ROOT, process.env, config.plugins?.updater?.pubkey);
  if (!dryRun && updaterArtifacts) assertSigningConfig(config, signingEnv, targetInfo(triple).platform, process.env.CADCAM_RELEASE === "1");
  announce(5, "build the desktop frontend and bundle the app");
  await run(["bun", "run", "--filter", "@cadcamfun/desktop", "build"]);
  // Match nikcli's release scripts: prepare the frontend once above, then prevent Tauri from
  // invoking beforeBuildCommand again. This also avoids Windows resolving a workspace bin shim.
  const thumbprint = process.env.TAURI_WINDOWS_CERTIFICATE_THUMBPRINT;
  if (!dryRun && process.env.CADCAM_RELEASE === "1" && targetInfo(triple).platform === "windows" && !thumbprint) throw new BuildError("Imported Windows signing certificate is required");
  const tauri = ["bunx", "tauri", "build", "--ci", "--target", triple, "--config", JSON.stringify({
    build: { beforeBuildCommand: "" },
    bundle: {
      createUpdaterArtifacts: updaterArtifacts,
      ...(thumbprint && targetInfo(triple).platform === "windows" ? { windows: { certificateThumbprint: thumbprint, digestAlgorithm: "sha256", timestampUrl: "http://timestamp.digicert.com" } } : {}),
    },
  })];
  if (bundles !== undefined) tauri.push("--bundles", bundles);
  await run(tauri, { cwd: DESKTOP, env: signingEnv });
}

// ──────────────────────────────── step 6 ──────────────────────────────────

async function lastTag(): Promise<string | null> {
  const tags = (await probeGit(["tag", "--merged", "HEAD", "--sort=-version:refname"]))?.stdout.trim().split("\n") ?? [];
  const current = (await probeGit(["describe", "--tags", "--exact-match", "HEAD"]))?.stdout.trim() ?? null;
  return previousReleaseTag(tags, current);
}

async function commits(range: readonly string[]): Promise<string[]> {
  const stdout =
    (await probeGit(["log", ...range, "--no-merges", "--pretty=format:%h %s"]))?.stdout ?? "";
  return stdout.split("\n").filter((line) => line.trim() !== "");
}

/**
 * Fingerprints the tracked migrations through git's object store: read-only
 * (no `--write`), works while the tree is dirty, and needs no `git diff` on the
 * untracked generated folder.
 */
async function migrationsFingerprint(): Promise<string | null> {
  const listing = await probeGit([
    "-c",
    "core.quotepath=false",
    "ls-tree",
    "-r",
    "HEAD",
    "--",
    rel(MIGRATIONS_SOURCE),
  ]);
  const entries = (listing?.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (entries.length === 0) return null;
  const hash = createHash("sha256").update(entries.join("\n")).digest("hex");
  return hash.slice(0, 12);
}

interface Notes {
  version: string;
  repository: string;
  tag: string | null;
  previousTag: string | null;
  rangeLabel: string;
  lines: string[];
  migrationsState: "changed" | "unchanged" | "unknown";
}

async function repositoryUrl(): Promise<string> {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  if (server !== undefined && repository !== undefined) return `${server}/${repository}`;
  const remote = (await probeGit(["remote", "get-url", "origin"]))?.stdout.trim();
  if (remote === undefined || remote === "") return "https://github.com/<owner>/<repo>";
  return remote
    .replace(/^git\+/, "")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
}

async function collectNotes(): Promise<Notes> {
  const raw = await readFile(join(SRC_TAURI, "tauri.conf.json"), "utf8");
  const version = releaseVersion((JSON.parse(raw) as { version: string }).version);
  const previousTag = await lastTag();
  const range = previousTag !== null ? [`${previousTag}..HEAD`] : ["--all"];
  const lines = await commits(range);

  // Downgrade safety (specs/10-release-sync.md §3): only a range that leaves the
  // previous tag can carry migrations. With no tag at all we cannot know.
  let migrationsState: Notes["migrationsState"] = "unchanged";
  if (previousTag === null) migrationsState = "unknown";
  else {
    const before = await migrationsFingerprintAt(previousTag);
    const now = await migrationsFingerprint();
    migrationsState = before === null || now === null ? "unknown" : before === now ? "unchanged" : "changed";
  }

  return {
    version,
    repository: await repositoryUrl(),
     tag: process.env.RELEASE_TAG || (process.env.GITHUB_REF_TYPE === "tag" ? (process.env.GITHUB_REF_NAME ?? null) : null),
    previousTag,
    rangeLabel: previousTag !== null ? `${previousTag}..HEAD` : "the whole history (no tags yet)",
    lines,
    migrationsState,
  };
}

async function migrationsFingerprintAt(revision: string): Promise<string | null> {
  const listing = await probeGit([
    "-c",
    "core.quotepath=false",
    "ls-tree",
    "-r",
    revision,
    "--",
    rel(MIGRATIONS_SOURCE),
  ]);
  const entries = (listing?.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (entries.length === 0) return null;
  return createHash("sha256").update(entries.join("\n")).digest("hex").slice(0, 12);
}

function renderNotes(notes: Notes): string {
  const head = [
    `# CADCAM FUN ${notes.version}`,
    "",
    `Commits since \`${notes.rangeLabel}\`.`,
    "",
  ];
  const body = notes.lines.length > 0 ? notes.lines : ["_no commits recorded_"];
  const rollback =
    notes.previousTag !== null
      ? [
          "",
          `Previous release (rollback installer): ${notes.repository}/releases/tag/${notes.previousTag}`,
          "",
          "To roll back, download that release's installer and run it over this installation.",
        ]
      : ["", "No previous release yet, so there is nothing to roll back to."];

  let downgrade: string[];
  if (notes.migrationsState === "changed") {
    downgrade = [
      "",
      "## Downgrade safety",
      "",
      "**Unsafe.** This range changes the database migrations, and migrations are forward-only.",
      "Downgrading would leave the database ahead of the binary; roll forward or restore the backup",
      "in `<dataDir>/backups/` instead.",
    ];
  } else if (notes.migrationsState === "unchanged") {
    downgrade = [
      "",
      "## Downgrade safety",
      "",
      "**Safe.** This range changes no migrations, so the previous version can be reinstalled.",
    ];
  } else {
    downgrade = [
      "",
      "## Downgrade safety",
      "",
      "**Unknown.** This range starts from the first commit of the repository, so no previous",
      "release can be compared. Treat a downgrade as unsafe until verified by hand.",
    ];
  }
  return [...head, ...body, ...rollback, ...downgrade, ""].join("\n");
}

async function collectArtefacts(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else found.push(path);
    }
  };
  await walk(root);
  return found.sort();
}

async function stepArtifacts(): Promise<void> {
  const notes = await collectNotes();
  announce(6, "checksums and release notes");
  say(
    `   version ${notes.version} · tag ${notes.tag ?? "(not a tagged build)"} · commits since ${notes.rangeLabel}`,
  );
  say(`   migrations in range: ${notes.migrationsState}`);
  if (notes.lines.length === 0) say("   note: no commits recorded in this range");

  const triple = await resolveTarget();
  const root = bundleRoot(SRC_TAURI, triple, process.env.CARGO_TARGET_DIR ? resolve(DESKTOP, process.env.CARGO_TARGET_DIR) : undefined);
  const assets = indexArtifacts(await collectArtefacts(root), triple);
  const files = assets.map((asset) => asset.source);
  if (files.length === 0) say(`   note: no bundled artefacts found under ${rel(root)}`);
  else say(`   ${files.length} bundled artefact${files.length === 1 ? "" : "s"} found`);

  if (!dryRun && assets.length === 0) throw new BuildError(`No installers found under ${rel(root)}`);
  if (!dryRun) {
    const relation = relative(root, outDir);
    if (relation === "" || (!relation.startsWith("..") && !relation.startsWith("/"))) throw new BuildError("Output directory must not be inside bundle directory");
    await mkdir(outDir, { recursive: true });
    if ((await readdir(outDir)).length !== 0) throw new BuildError("Output directory must be empty to avoid stale release assets");
    for (const asset of assets) await cp(asset.source, join(outDir, asset.name));
  }
  const checksums = (await Promise.all(assets.map(async (asset) => {
    const digest = createHash("sha256").update(await readFile(dryRun ? asset.source : join(outDir, asset.name))).digest("hex");
    return `${digest}  ${asset.name}`;
  }))).join("\n");

  const releaseNotes = renderNotes(notes);
  const rendered = releaseNotes.split("\n");
  say("");
  for (const line of rendered.slice(0, 14)) say(line);
  if (rendered.length > 14) say(`   … (${rendered.length - 14} more lines)`);

  if (dryRun) {
    say("");
    say("   [dry-run] no file was written. Would write:");
    say(`     ${rel(join(outDir, "SHA256SUMS"))}   (${checksums === "" ? 0 : checksums.split("\n").length} entries)`);
    say(`     ${rel(join(outDir, "RELEASE_NOTES.md"))}  (${rendered.length} lines)`);
    return;
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "SHA256SUMS"), `${checksums}\n`, "utf8");
  await writeFile(join(outDir, "RELEASE_NOTES.md"), releaseNotes, "utf8");
  say("");
  say(`   wrote ${rel(join(outDir, "SHA256SUMS"))}`);
  say(`   wrote ${rel(join(outDir, "RELEASE_NOTES.md"))}`);
}

// ───────────────────────────────── cli ────────────────────────────────────

const STEP_LIST = STEP_NAMES.join(", ");

const USAGE = `CADCAM FUN v6 build pipeline (specs/10-release-sync.md §1)

Usage: bun scripts/build.ts [options]

Steps, in order:
  1. install     bun install --frozen-lockfile
  2. check       bun run typecheck && bun run test
  3. compile     bun build --compile the sidecar to src-tauri/binaries/sidecar-<triple>
  4. resources   copy packages/db/drizzle/ to src-tauri/resources/migrations/
  5. bundle      @cadcamfun/desktop build, then bunx tauri build
  6. artifacts   SHA-256 checksums and RELEASE_NOTES.md since the last git tag

Step aliases accepted by --only/--skip:
  install (deps) · check (checks, test, tests) · compile (sidecar)
  resources (resource, migrations) · bundle · artifacts (notes, checksums, release)

Options:
  --only=<a,b>        run only these steps (${STEP_LIST})
  --skip=<a,b>        skip these steps
  --skip-install      alias for --skip=install
  --skip-tests        step 2 runs the typecheck only
  --target=<triple>   Rust target triple (default: the host triple from \`rustc -vV\`)
  --bundles=<list>    forwarded to \`tauri build --bundles\` (e.g. deb,rpm,appimage)
  --no-updater        build installers without updater archives/signatures
  --out-dir=<path>    where step 6 writes SHA256SUMS and RELEASE_NOTES.md
                      (default: apps/desktop/src-tauri/target/release-artifacts)
  --dry-run           print the plan, write nothing, change nothing
  -h, --help          show this help

Local updater signing uses ignored tauri-signing.json when no environment key is set.
Platform certificates are still required for CADCAM_RELEASE=1.

Examples:
  bun scripts/build.ts                              full release build
  bun scripts/build.ts --only=resources             restage the migrations (idempotent)
  bun scripts/build.ts --only=notes --dry-run       preview the release notes, writes nothing
  bun scripts/build.ts --only=compile,resources     rebuild the sidecar and restage migrations
  bun scripts/build.ts --skip-tests --dry-run       see the whole plan without side effects
`;

function usageError(message: string): never {
  process.stderr.write(`error: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseStepList(raw: string, flag: string): StepName[] {
  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");
  const unknown = requested.filter((value) => STEP_ALIASES[value] === undefined);
  if (unknown.length > 0) usageError(`${flag}: unknown step(s) ${unknown.join(", ")}`);
  return requested.map((value) => STEP_ALIASES[value] as StepName);
}

function parseOptions(argv: readonly string[]): Options {
  let only: StepName[] | null = null;
  const skip = new Set<StepName>();
  let skipTests = false;
  let help = false;
  let dryRun = false;
  let updaterArtifacts = true;
  let targetTriple: string | undefined;
  let bundleList: string | undefined;
  let out = DEFAULT_OUT_DIR;

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--no-updater") updaterArtifacts = false;
    else if (arg === "--skip-tests") skipTests = true;
    else if (arg === "--skip-install") skip.add("install");
    else if (arg.startsWith("--only=")) only = parseStepList(arg.slice("--only=".length), "--only");
    else if (arg.startsWith("--skip="))
      for (const step of parseStepList(arg.slice("--skip=".length), "--skip")) skip.add(step);
    else if (arg.startsWith("--target=")) targetTriple = arg.slice("--target=".length).trim();
    else if (arg.startsWith("--bundles=")) bundleList = arg.slice("--bundles=".length).trim();
    else if (arg.startsWith("--out-dir=")) out = resolve(ROOT, arg.slice("--out-dir=".length));
    else usageError(`unknown argument ${arg}`);
  }

  if (targetTriple !== undefined && targetTriple === "") usageError("--target needs a value");
  if (bundleList !== undefined && bundleList === "") usageError("--bundles needs a value");
  if (only !== null && skip.size > 0) usageError("--only and --skip are mutually exclusive");

  const selected = only ?? STEP_NAMES.filter((step) => !skip.has(step));
  return {
    steps: STEP_NAMES.filter((step) => selected.includes(step)),
    skipTests,
    skipInstall: skip.has("install"),
    updaterArtifacts,
    dryRun,
    target: targetTriple,
    bundles: bundleList,
    outDir: out,
    help,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  dryRun = options.dryRun;
  target = options.target;
  bundles = options.bundles;
  outDir = options.outDir;
  skipTests = options.skipTests;
  updaterArtifacts = options.updaterArtifacts;

  say("CADCAM FUN build pipeline");
  say(`   repo   ${ROOT}`);
  say(`   bun    ${Bun.version} (${process.platform}-${process.arch})`);
  say(`   steps  ${options.steps.join(" → ")}`);
  if (options.dryRun) say("   mode   dry-run: nothing is installed, built or written");
  if (options.skipInstall) say("   flags  --skip-install");
  if (options.skipTests) say("   flags  --skip-tests");
  if (!options.updaterArtifacts) say("   flags  --no-updater");
  if (options.target !== undefined) say(`   target ${options.target}`);
  if (options.bundles !== undefined) say(`   bundles ${options.bundles}`);
  say(`   out    ${rel(outDir)}`);

  const started = Bun.nanoseconds();
  const steps: Record<StepName, () => Promise<void>> = {
    install: stepInstall,
    check: stepCheck,
    compile: stepCompile,
    resources: stepResources,
    bundle: stepBundle,
    artifacts: stepArtifacts,
  };

  try {
    for (const step of options.steps) await steps[step]();
  } catch (error) {
    const message = error instanceof BuildError ? error.message : String(error);
    say("");
    say(`build failed: ${message}`);
    process.exit(1);
  }

  const seconds = (Bun.nanoseconds() - started) / 1e9;
  say("");
  say(
    options.dryRun
      ? `dry-run finished in ${seconds.toFixed(2)}s — nothing was changed.`
      : `done in ${seconds.toFixed(2)}s`,
  );
}

if (import.meta.main) await main();
