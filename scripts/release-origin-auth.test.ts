import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withAuthenticatedOrigin } from "./release-publish.ts";

const PLAIN_ORIGIN = "https://github.com/example/cadcamfun.git";

function originUrl(cwd: string): Promise<string> {
  return git(cwd, ["config", "--local", "--get", "remote.origin.url"]);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const child = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`);
  return stdout.trim();
}

async function withPushToken<T>(action: () => Promise<T>): Promise<T> {
  const previous = {
    GH_PUSH_TOKEN: process.env["GH_PUSH_TOKEN"],
    GITHUB_TOKEN: process.env["GITHUB_TOKEN"],
    GITHUB_REPOSITORY: process.env["GITHUB_REPOSITORY"],
  };
  delete process.env["GITHUB_TOKEN"];
  process.env["GH_PUSH_TOKEN"] = "push-token";
  process.env["GITHUB_REPOSITORY"] = "nikomatt69/cadcamfun";
  try {
    return await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("each origin write keeps the push token, and the plain URL returns afterwards", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadcam-origin-auth-"));
  try {
    await git(cwd, ["init"]);
    await git(cwd, ["remote", "add", "origin", PLAIN_ORIGIN]);
    await withPushToken(async () => {
      const seen: string[] = [];
      await withAuthenticatedOrigin(async () => {
        seen.push(await originUrl(cwd));
      }, cwd);
      expect(await originUrl(cwd)).toBe(PLAIN_ORIGIN);
      await withAuthenticatedOrigin(async () => {
        seen.push(await originUrl(cwd));
      }, cwd);
      expect(seen).toEqual([
        "https://x-access-token:push-token@github.com/nikomatt69/cadcamfun",
        "https://x-access-token:push-token@github.com/nikomatt69/cadcamfun",
      ]);
      expect(await originUrl(cwd)).toBe(PLAIN_ORIGIN);

      await expect(
        withAuthenticatedOrigin(async () => {
          throw new Error("push failed");
        }, cwd),
      ).rejects.toThrow("push failed");
      expect(await originUrl(cwd)).toBe(PLAIN_ORIGIN);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("a tag pushed inside the authenticated window arrives, and a push after it does not", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-origin-tag-"));
  const bare = join(root, "origin.git");
  const work = join(root, "work");
  const tokenUrl = "https://x-access-token:push-token@github.com/nikomatt69/cadcamfun";
  try {
    await git(root, ["init", "--bare", bare]);
    await git(root, ["init", work]);
    await git(work, ["config", "user.email", "release-test@example.com"]);
    await git(work, ["config", "user.name", "release-test"]);
    await Bun.write(join(work, "README.md"), "release\n");
    await git(work, ["add", "README.md"]);
    await git(work, ["commit", "-m", "init"]);
    await git(work, ["remote", "add", "origin", "https://127.0.0.1:9/cadcamfun.git"]);
    await git(work, ["config", `url.${bare}.insteadOf`, tokenUrl]);
    await git(work, ["tag", "v9.9.9"]);

    await withPushToken(async () => {
      await withAuthenticatedOrigin(async () => {
        await git(work, ["push", "origin", "v9.9.9"]);
      }, work);
    });
    expect(await git(bare, ["rev-parse", "v9.9.9"])).toBe(await git(work, ["rev-parse", "HEAD"]));
    expect(await originUrl(work)).toBe("https://127.0.0.1:9/cadcamfun.git");

    const outside = Bun.spawn(["git", "push", "origin", "v9.9.9"], {
      cwd: work,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const [stderr, code] = await Promise.all([new Response(outside.stderr).text(), outside.exited]);
    expect(code).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("origin stays unchanged when no push token is configured", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cadcam-origin-plain-"));
  const previous = {
    GH_PUSH_TOKEN: process.env["GH_PUSH_TOKEN"],
    GITHUB_TOKEN: process.env["GITHUB_TOKEN"],
  };
  delete process.env["GH_PUSH_TOKEN"];
  delete process.env["GITHUB_TOKEN"];
  try {
    await git(cwd, ["init"]);
    await git(cwd, ["remote", "add", "origin", PLAIN_ORIGIN]);
    let seen = "";
    await withAuthenticatedOrigin(async () => {
      seen = await originUrl(cwd);
    }, cwd);
    expect(seen).toBe(PLAIN_ORIGIN);
    expect(await originUrl(cwd)).toBe(PLAIN_ORIGIN);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});
