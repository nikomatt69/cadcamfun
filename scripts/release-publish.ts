#!/usr/bin/env bun
/**
 * Two phases orchestrated by ci-pipeline.yml:
 *
 * --phase=start prepares the version, changelog, commit and tag.
 * --phase=complete verifies all six targets, publishes npm, creates the draft and attaches all assets,
 * publishes the release and updates the optional Homebrew cask.
 *
 * No GitHub release exists until every desktop artifact has been built and verified.
 */

import { $ } from "bun";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gitCommits, renderChangelogSection, renderNotes, writeChangelog } from "./changelog.ts";
import { collectCaskEntries, publishCask } from "./homebrew-cask.ts";
import { lastReleaseTag, readWorkspaceVersions, resolveReleaseVersion, stampVersions } from "./release-version.ts";
import { assertBunVersion, captureCommand } from "./release-helpers.ts";
import { stageRelease } from "./stage-release.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_VERSION_PATH = "apps/desktop/src-tauri/tauri.conf.json";

/** The macOS installers on the unified release used by the Homebrew cask. */
const CASK_PLATFORMS = [
  { triple: "aarch64-apple-darwin", arch: "arm64" },
  { triple: "x86_64-apple-darwin", arch: "x64" },
] as const;

/** The identity the release commit is made with when the checkout has none. */
const RELEASE_COMMITTER = {
  name: "cadcamfun-release[bot]",
  email: "cadcamfun-release[bot]@users.noreply.github.com",
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function warn(message: string): void {
  process.stdout.write(`::warning::${message}\n`);
}

/** The `owner/name` of the repository the release belongs to. */
function repository(): string {
  const configured = env("GITHUB_REPOSITORY");
  if (configured !== undefined) return configured;
  throw new Error("GITHUB_REPOSITORY is not set");
}

// ─────────────────────────────── npm publishing ───────────────────────────────

interface PublishablePackage {
  directory: string;
  name: string;
  version: string;
}

/** The workspace packages that may be published: they have a version and are not private. */
export async function publishablePackages(root: string): Promise<PublishablePackage[]> {
  const found: PublishablePackage[] = [];
  const manifests = [join(root, "package.json")];
  for (const workspace of ["packages", "apps"]) {
    const directory = join(root, workspace);
    const listing = await readdir(directory).catch(() => [] as string[]);
    for (const entry of listing.sort()) manifests.push(join(directory, entry, "package.json"));
  }
  for (const manifest of manifests) {
    let parsed: { name?: unknown; version?: unknown; private?: unknown };
    try {
      parsed = JSON.parse(await readFile(manifest, "utf8"));
    } catch {
      continue;
    }
    if (typeof parsed.name !== "string" || typeof parsed.version !== "string") continue;
    if (parsed.private === true) continue;
    found.push({ directory: manifest.slice(0, manifest.length - "/package.json".length), name: parsed.name, version: parsed.version });
  }
  return found;
}

/** npm refused because the version is already on the registry. */
const ALREADY_PUBLISHED = /E409|previously published|cannot publish over/i;
/** npm refused because the registry is rate limiting. */
const RATE_LIMITED = /E429|too many requests/i;

/** What npm said about a publish attempt. */
export type PublishOutcome = "published" | "already-published" | "rate-limited" | "failed";

/**
 * Read an npm publish failure.
 *
 * A version that is already published is not a failure: the release may be re-run and
 * the registry is the only judge of what exists. A rate limit is worth waiting for.
 */
export function classifyPublishLog(log: string): PublishOutcome {
  if (ALREADY_PUBLISHED.test(log)) return "already-published";
  if (RATE_LIMITED.test(log)) return "rate-limited";
  return "failed";
}

interface PublishAttempt {
  code: number;
  log: string;
  alreadyPublished: boolean;
}

/**
 * Publish a package, retrying a rate-limited registry.
 *
 * A version that is already published is not a failure: the release may be re-run, and
 * the registry is the only judge of what exists. A rate limit is worth waiting for: a
 * release that dies on a 429 has already published half of itself.
 */
export async function npmPublish(directory: string, channel: string): Promise<PublishAttempt> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const publish = await $`npm publish --access public --tag ${channel}`.cwd(directory).nothrow();
    const log = publish.stderr.toString() + publish.stdout.toString();
    if (publish.exitCode === 0) return { code: 0, log, alreadyPublished: false };
    const outcome = classifyPublishLog(log);
    if (outcome === "already-published") return { code: 0, log, alreadyPublished: true };
    if (outcome === "rate-limited" && attempt < 5) {
      const delay = attempt * 30_000;
      say(`  npm is rate limiting; retrying in ${delay / 1000}s (${attempt}/5)`);
      await Bun.sleep(delay);
      continue;
    }
    return { code: publish.exitCode ?? 1, log, alreadyPublished: false };
  }
  return { code: 1, log: "npm publish was rate limited five times", alreadyPublished: false };
}

/**
 * npm hides a token that cannot publish a scoped package behind 404.
 *
 * The same status is used for a missing package, a scope the account does not own,
 * and an expired or read-only token. The desktop release has already been built by
 * the time this runs, so that refusal must not throw the installers away.
 */
const NPM_AUTH_REFUSAL = /Scope not found|E404|E403|E401|403 Forbidden|401 Unauthorized|You do not have permission|Unable to authenticate|one-time password|EOTP/i;

/** What a failed `npm publish` does to the rest of the release. */
export type NpmFailureDisposition = "fallback" | "continue" | "fail";

/**
 * Decide whether a failed publish aborts the release.
 *
 * A configured fallback name is tried once. An authorization refusal without
 * one lets the GitHub release continue. A transport error or a corrupt
 * manifest still fails the release.
 */
export function npmFailureDisposition(log: string, fallbackName: string | undefined): NpmFailureDisposition {
  if (!NPM_AUTH_REFUSAL.test(log)) return "fail";
  return fallbackName === undefined ? "continue" : "fallback";
}

/** The registry's refusal, not the `npm error code` line that only repeats it. */
function npmErrorSummary(log: string): string {
  const lines = log
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("npm error"));
  const detail = lines.find((entry) => !entry.startsWith("npm error code") && /404|403|401|Forbidden|Unauthorized|Not Found/.test(entry));
  const chosen = detail ?? lines.find((entry) => entry.startsWith("npm error code"));
  return chosen?.replace(/^npm error\s*/, "") ?? "the registry refused the publish";
}

/**
 * Say who the token is, without echoing the token or npm's error body.
 *
 * `whoami` prints only the account name. A rejected token has no name to print.
 */
async function npmIdentity(): Promise<string> {
  const who = await captureCommand(["npm", "whoami"]);
  const name = who.stdout.trim();
  return who.code === 0 && /^[a-z0-9][a-z0-9._-]{0,40}$/i.test(name) ? name : "rejected";
}

/** The desktop release continues; the plugin stays on the version already on npm. */
async function warnNpmRefused(name: string, version: string, log: string): Promise<void> {
  const identity = await npmIdentity();
  warn(
    `${name}@${version} was not published (${npmErrorSummary(log)}). npm identity: ${identity}. The desktop release continues; NPM_TOKEN needs publish access to this package.`,
  );
}

/**
 * Publish one package to npm.
 *
 * A version that is already on the registry is skipped, so a re-run of the release is
 * harmless. When the scope itself cannot be published — the owner may not own it, or
 * the token can no longer write it — the package falls back to a configured name.
 * If that also cannot be published, the GitHub release still continues. Any other
 * failure (a network error, a corrupt manifest) stays red.
 */
export async function publishNpmPackage(
  pkg: PublishablePackage,
  options: { channel: string; fallbackName?: string | undefined },
): Promise<void> {
  const existing = await captureCommand(["npm", "view", `${pkg.name}@${pkg.version}`, "version"]);
  if (existing.code === 0) {
    say(`  ${pkg.name}@${pkg.version} is already on npm; nothing to publish`);
    return;
  }
  const manifestPath = join(pkg.directory, "package.json");
  const original = await readFile(manifestPath, "utf8");
  const publish = await npmPublish(pkg.directory, options.channel);
  if (publish.code === 0) {
    say(
      publish.alreadyPublished
        ? `  ${pkg.name}@${pkg.version} is already on npm; nothing to publish`
        : `  published ${pkg.name}@${pkg.version}`,
    );
    return;
  }
  const log = publish.log;
  const disposition = npmFailureDisposition(log, options.fallbackName);
  if (disposition === "fail") {
    process.stderr.write(log);
    throw new Error(`npm publish failed for ${pkg.name}@${pkg.version}`);
  }
  if (disposition === "continue") {
    await warnNpmRefused(pkg.name, pkg.version, log);
    return;
  }
  const fallbackName = options.fallbackName;
  if (fallbackName === undefined) {
    await warnNpmRefused(pkg.name, pkg.version, log);
    return;
  }
  warn(`${pkg.name} could not be published (scope missing or not writable); publishing as ${fallbackName}`);
  try {
    const parsed = JSON.parse(original) as Record<string, unknown>;
    parsed["name"] = fallbackName;
    await writeFile(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    const retry = await npmPublish(pkg.directory, options.channel);
    if (retry.code !== 0) {
      if (npmFailureDisposition(retry.log, undefined) === "continue") {
        await warnNpmRefused(fallbackName, pkg.version, retry.log);
        return;
      }
      process.stderr.write(retry.log);
      throw new Error(`npm publish failed for ${fallbackName}@${pkg.version}`);
    }
    say(`  published ${fallbackName}@${pkg.version}`);
  } finally {
    await writeFile(manifestPath, original, "utf8");
  }
}

// ────────────────────────────── phase: start ──────────────────────────────

async function phaseStart(options: { bump?: string | undefined; version?: string | undefined }): Promise<void> {
  say("=== release: start ===\n");
  assertBunVersion(ROOT);

  const versions = await readWorkspaceVersions(ROOT);
  const appVersion = versions[APP_VERSION_PATH];
  if (appVersion === undefined) throw new Error(`The application version is missing from ${APP_VERSION_PATH}`);
  for (const [path, version] of Object.entries(versions)) {
    if (path !== APP_VERSION_PATH && version !== appVersion) {
      warn(`${path} is at ${version} while the application is at ${appVersion}; the release stamps them all`);
    }
  }

  const latestTag = await lastReleaseTag(ROOT);
  const version = resolveReleaseVersion({
    bump: options.bump,
    override: options.version,
    current: appVersion,
    latestTag,
  });
  const tag = `v${version}`;
  say(`version ${version} (from ${appVersion}, latest release ${latestTag ?? "none"})`);

  const changed = await stampVersions(ROOT, version);
  say(`stamped ${changed.length} version holder(s)`);

  // The lockfile carries the workspace versions, so it has to be refreshed before the
  // release commit is made.
  await $`${process.execPath} --no-env-file install`.cwd(ROOT);

  const commits = await gitCommits(latestTag);
  const notes = renderNotes(commits);
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" });
  const section = renderChangelogSection(version, date, notes);
  await writeChangelog(ROOT, section);
  say(`wrote the changelog section for v${version} (${notes.length} note lines)`);

  // Commit only what the release owns: the version holders, the changelog and the
  // lockfile. Anything else in the working tree belongs to somebody else.
  const staged = [...changed, "CHANGELOG.md", "bun.lock"];
  await $`git add ${staged}`.cwd(ROOT);
  const stagedFiles = (await captureCommand(["git", "diff", "--cached", "--name-only"], { cwd: ROOT })).stdout.trim();
  if (stagedFiles === "") {
    say("nothing to commit: the tree already carries this version");
  } else {
    await ensureGitIdentity();
    await $`git commit -m ${`release: ${tag}`}`.cwd(ROOT);
    say(`committed the release: ${stagedFiles.split("\n").join(", ")}`);
  }

  // The branch push and the tag push share one authenticated origin. Restoring the
  // credential-less URL in between is what made `git push origin <tag>` ask for a username.
  await withAuthenticatedOrigin(async () => {
    await pushBranch(section, staged, version);
    await pushTag(tag);
  });

  if (process.env["GITHUB_OUTPUT"]) {
    await Bun.write(process.env["GITHUB_OUTPUT"], `tag=${tag}\nversion=${version}\n`);
  }
}

/**
 * Give the release commit an author.
 *
 * The runner image has no git identity and a commit without one is refused, so the
 * release bot writes one when the checkout has none.
 */
async function ensureGitIdentity(): Promise<void> {
  const name = await captureCommand(["git", "config", "user.name"], { cwd: ROOT });
  if (name.code !== 0 || name.stdout.trim() === "") {
    await captureCommand(["git", "config", "user.name", RELEASE_COMMITTER.name], { cwd: ROOT });
  }
  const email = await captureCommand(["git", "config", "user.email"], { cwd: ROOT });
  if (email.code !== 0 || email.stdout.trim() === "") {
    await captureCommand(["git", "config", "user.email", RELEASE_COMMITTER.email], { cwd: ROOT });
  }
}

/**
 * Resolve the conflicts of a rebase that two releases caused.
 *
 * Keep the remote files, then reapply this release's version and changelog section.
 * Taking whole files from the queued release would discard dependency or configuration
 * changes that reached the branch while it waited for validation.
 */
export async function resolveReleaseConflicts(section: string, releaseFiles: readonly string[], version: string, root = ROOT): Promise<boolean> {
  const conflicted = (await captureCommand(["git", "diff", "--name-only", "--diff-filter=U"], { cwd: root })).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (conflicted.length === 0) return false;
  // Use the actual release commit's files, including Cargo.lock, rather than a
  // separate allow-list that can drift from version stamping.
  if (!conflicted.every((file) => releaseFiles.includes(file))) return false;
  say(`resolving ${conflicted.length} release conflict(s) against the remote tip`);
  for (const file of conflicted) {
    // During a rebase "ours" is the remote tip; only version fields are overwritten.
    const restored = await captureCommand(["git", "checkout", "--ours", "--", file], { cwd: root });
    if (restored.code !== 0) throw new Error(`Cannot resolve the release conflict in ${file}: ${restored.stderr.trim()}`);
  }
  if (conflicted.includes("CHANGELOG.md")) await writeChangelog(root, section);
  const stamped = await stampVersions(root, version);
  const hasLockfile = await Bun.file(join(root, "bun.lock")).exists();
  if (hasLockfile) {
    await $`${process.execPath} --no-env-file install --lockfile-only`.cwd(root);
  }
  const resolvedFiles = [...new Set([...conflicted, ...stamped, ...(hasLockfile ? ["bun.lock"] : [])])];
  await $`git add -- ${resolvedFiles}`.cwd(root);
  const resumed = await $`git -c core.editor=true rebase --continue`.nothrow().cwd(root);
  return resumed.exitCode === 0;
}

/**
 * Push the release commit to the branch it was made on.
 *
 * The branch may have moved while the release was being prepared, so the commit is
 * rebased onto the remote tip and the push is retried.
 */
/**
 * Point `origin` at the token URL for the duration of `body`, then put the public URL back.
 *
 * Checkout's extraheader is not on the remote URL, so a push after the URL is restored
 * fails with "could not read Username".
 */
async function withAuthenticatedOrigin(body: () => Promise<void>): Promise<void> {
  const token = env("GH_PUSH_TOKEN") ?? env("GITHUB_TOKEN");
  const repo = repository();
  const original = (await captureCommand(["git", "remote", "get-url", "origin"], { cwd: ROOT })).stdout.trim();
  if (token !== undefined) {
    await $`git remote set-url origin ${`https://x-access-token:${token}@github.com/${repo}`}`.cwd(ROOT);
  }
  try {
    await body();
  } finally {
    if (token !== undefined && original !== "") await $`git remote set-url origin ${original}`.cwd(ROOT);
  }
}

/** Create `tag` at HEAD and push it. The caller has already authenticated `origin`. */
async function pushTag(tag: string): Promise<void> {
  const existingTag = await captureCommand(["git", "rev-parse", "--verify", `refs/tags/${tag}`], { cwd: ROOT });
  if (existingTag.code === 0) {
    const head = (await captureCommand(["git", "rev-parse", "HEAD"], { cwd: ROOT })).stdout.trim();
    if (existingTag.stdout.trim() !== head) throw new Error(`The tag ${tag} already exists and points at another commit`);
    say(`the tag ${tag} already exists at this commit`);
    return;
  }
  await $`git tag ${tag}`.cwd(ROOT);
  await $`git push origin ${tag}`.cwd(ROOT);
  say(`pushed the tag ${tag}`);
}

async function pushBranch(section: string, releaseFiles: readonly string[], version: string): Promise<void> {
  const branch = (await captureCommand(["git", "branch", "--show-current"], { cwd: ROOT })).stdout.trim();
  if (branch === "") throw new Error("Unable to determine the branch to push the release to");
  for (let attempt = 0; attempt < 3; attempt++) {
    await $`git fetch origin ${branch}`.cwd(ROOT);
    const rebase = await $`git rebase ${`origin/${branch}`}`.nothrow().cwd(ROOT);
    if (rebase.exitCode !== 0) {
      if (!(await resolveReleaseConflicts(section, releaseFiles, version))) {
        await $`git rebase --abort`.nothrow().cwd(ROOT);
        throw new Error(`Cannot rebase the release commit onto origin/${branch}: ${rebase.stderr.toString().trim()}`);
      }
    }
    const push = await $`git push origin ${`HEAD:${branch}`}`.nothrow().cwd(ROOT);
    if (push.exitCode === 0) {
      say(`pushed the release commit to ${branch}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Cannot push the release commit to ${branch}`);
}

// ───────────────────────────── phase: complete ─────────────────────────────

async function phaseComplete(options: { tag: string; manifest: string; installers: string }): Promise<void> {
  say("=== release: complete ===\n");
  assertBunVersion(ROOT);
  const repo = repository();
  const tag = options.tag;
  const server = env("GITHUB_SERVER_URL") ?? "https://github.com";
  const downloadUrl = `${server}/${repo}/releases/download`;

  const directory = await mkdtemp(join(tmpdir(), "cadcam-release-"));
  try {
    await stageRelease(options.installers, options.manifest, directory, downloadUrl, tag);
    const existing = await captureCommand(["gh", "release", "view", tag, "--json", "isDraft", "--repo", repo]);
    if (existing.code === 0) {
      const isDraft = (JSON.parse(existing.stdout) as { isDraft?: boolean }).isDraft;
      if (isDraft !== true) throw new Error(`The release ${tag} is already published and is not modified`);
    } else {
      if (!/release not found|HTTP 404/i.test(existing.stderr)) {
        throw new Error(`Cannot inspect the release ${tag}: ${existing.stderr.trim()}`);
      }
    }
    const version = tag.replace(/^v/, "");
    const channel = version.includes("-") ? "next" : "latest";
    const token = env("NODE_AUTH_TOKEN") ?? env("NPM_TOKEN");
    const packages = await publishablePackages(ROOT);
    if (token === undefined) {
      warn("NPM_TOKEN is not set; skipping the npm publish");
    } else {
      for (const pkg of packages) {
        await publishNpmPackage(pkg, { channel, fallbackName: env("NPM_FALLBACK_NAME") });
      }
    }
    if (existing.code !== 0) {
      await $`gh release create ${tag} --verify-tag --draft --title ${`CADCAM FUN ${tag}`} --notes-file ${join(directory, "RELEASE_NOTES.md")} --repo ${repo}`.cwd(ROOT);
      say(`created the draft release ${tag} after verifying all six targets`);
    }
    const files = (await readdir(directory)).sort().map((name) => join(directory, name));
    await $`gh release upload ${tag} ${files} --clobber --repo ${repo}`.cwd(ROOT);
    await $`gh release edit ${tag} --notes-file ${join(directory, "RELEASE_NOTES.md")} --repo ${repo}`.cwd(ROOT);
    say(`attached all six targets, checksums, updater manifest and release notes to ${tag}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  // The release becomes public before the cask: the cask is a second way to install
  // the application, and a tap that cannot be written must not keep the release a
  // draft. This is nikcli's order: `publish-complete.ts` publishes the release and
  // then publishes the registries.
  const release = await captureCommand(["gh", "release", "view", tag, "--json", "databaseId", "--repo", repo]);
  if (release.code !== 0) throw new Error(`Cannot read the release id of ${tag}`);
  const id = (JSON.parse(release.stdout) as { databaseId?: number }).databaseId;
  if (typeof id !== "number") throw new Error(`Cannot read the release id of ${tag}`);
  const prerelease = tag.includes("-");
  await $`gh api --method PATCH ${`repos/${repo}/releases/${id}`} -F draft=false -F prerelease=${prerelease ? "true" : "false"} -f make_latest=${prerelease ? "false" : "true"}`.cwd(ROOT);
  say(`published the release ${tag}`);

  // Prereleases must not move the stable Homebrew cask forward.
  if (prerelease) return;

  const tap = env("HOMEBREW_TAP_REPOSITORY");
  // The tap is another repository, so the built-in token of this one cannot write to it;
  // a token with access to the tap is what publishes the cask.
  const token = env("HOMEBREW_TAP_TOKEN");
  if (tap === undefined || token === undefined) {
    warn("HOMEBREW_TAP_REPOSITORY or a token for the tap is not set; skipping the Homebrew cask");
    return;
  }
  try {
    const version = tag.replace(/^v/, "");
    const entries = await collectCaskEntries({ tag, repository: repo, platforms: CASK_PLATFORMS });
    await publishCask({ repository: repo, version, entries, tap, token, branch: env("HOMEBREW_TAP_BRANCH") });
    say(`published the Homebrew cask for v${version}`);
  } catch (error) {
    // The release is out; a cask that could not be pushed is a warning, not a failed
    // release. The next release writes the cask again.
    warn(`the Homebrew cask was not published: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─────────────────────────────────── cli ───────────────────────────────────

if (import.meta.main) {
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match?.[1]) throw new Error(`Invalid argument: ${arg}`);
    options.set(match[1], match[2] ?? "");
  }
  const phase = options.get("phase") ?? "start";
  try {
    if (phase === "start") {
      await phaseStart({
        bump: options.get("bump") ?? env("CADCAM_BUMP"),
        version: options.get("version") ?? env("CADCAM_VERSION"),
      });
    } else if (phase === "complete") {
      const tag = options.get("tag");
      const manifest = options.get("manifest");
      if (tag === undefined) throw new Error("--tag is required for the complete phase");
      if (manifest === undefined) throw new Error("--manifest is required for the complete phase");
      const installers = options.get("installers");
      if (installers === undefined) throw new Error("--installers is required for the complete phase");
      await phaseComplete({ tag, manifest, installers });
    } else {
      throw new Error("--phase must be start or complete");
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
