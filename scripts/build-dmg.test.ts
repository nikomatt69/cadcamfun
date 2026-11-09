import { expect, test } from "bun:test";
import { DMG_BUNDLE_ATTEMPTS, diskImagesToDetach, dmgAttemptIsRetryable, dmgBundlePlan, isDmgBundlerFailure, rememberTail, retryDmgBundle, shouldRetryDmgBundle } from "./build.ts";

const PRODUCT = "CADCAM FUN";

const HDIUTIL_INFO = `
framework       : 682
driver          : 682
================================================
image-path      : /Library/Developer/CoreSimulator/Images/system.dmg
/dev/disk2          	GUID_partition_scheme
/dev/disk2s1        	Apple_APFS                     	/Library/Developer/CoreSimulator/Volumes/iOS
================================================
image-path      : /Users/runner/work/cadcamfun/cadcamfun/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/rw.28057.CADCAM FUN_0.1.110_x64.dmg
/dev/disk4          	GUID_partition_scheme
/dev/disk4s1        	Apple_HFS                      	/Volumes/dmg.AbCd/${PRODUCT}
================================================
image-path      : /Users/runner/Downloads/Other.dmg
/dev/disk5          	GUID_partition_scheme
/dev/disk5s1        	Apple_HFS                      	/Volumes/Other
`;

test("only a macOS bundle that includes a DMG is retried", () => {
  expect(dmgBundlePlan(undefined, "darwin")).toEqual({ dmg: true });
  expect(dmgBundlePlan("app,dmg", "darwin")).toEqual({ dmg: true });
  expect(dmgBundlePlan("dmg", "darwin")).toEqual({ dmg: true });
  expect(dmgBundlePlan("app", "darwin")).toEqual({ dmg: false });
  expect(dmgBundlePlan("deb,rpm", "linux")).toEqual({ dmg: false });
  expect(dmgBundlePlan(undefined, "windows")).toEqual({ dmg: false });
});

test("a DMG script failure is retried and a compile error is not", () => {
  const failure = "Running bundle_dmg.sh\nfailed to bundle project: error running bundle_dmg.sh: `failed to run /Users/runner/work/cadcamfun/cadcamfun/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/bundle_dmg.sh`";
  expect(isDmgBundlerFailure(failure)).toBe(true);
  expect(shouldRetryDmgBundle("darwin", "app,dmg", failure)).toBe(true);
  expect(shouldRetryDmgBundle("darwin", "app", failure)).toBe(false);
  expect(shouldRetryDmgBundle("linux", "deb,rpm", failure)).toBe(false);
  expect(shouldRetryDmgBundle("darwin", "app,dmg", "error[E0425]: cannot find value `cam` in this scope")).toBe(false);
  expect(dmgAttemptIsRetryable(1, "darwin", "app,dmg", "error[E0425]: cannot find value `cam` in this scope")).toBe(false);
  expect(dmgAttemptIsRetryable(2, "darwin", "app,dmg", "")).toBe(true);
});

test("the retained bundler tail is the end of the log and stays bounded", () => {
  const marker = new TextEncoder().encode("failed to run bundle_dmg.sh");
  const noise = new Uint8Array(80_000);
  noise.fill(0x61);
  let tail: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  tail = rememberTail(tail, noise, 64 * 1024);
  tail = rememberTail(tail, marker, 64 * 1024);
  const decoded = new TextDecoder().decode(tail);
  expect(tail.byteLength).toBe(64 * 1024);
  expect(decoded.endsWith("failed to run bundle_dmg.sh")).toBe(true);
  expect(decoded.startsWith("a".repeat(64 * 1024))).toBe(false);
  const whole = rememberTail(new Uint8Array(0), marker, 64 * 1024);
  expect(new TextDecoder().decode(whole)).toBe("failed to run bundle_dmg.sh");
  const big = new Uint8Array(70_000);
  big.fill(0x62);
  big.set(marker, big.length - marker.length);
  const onlyEnd = rememberTail(new Uint8Array(0), big, 64 * 1024);
  expect(onlyEnd.byteLength).toBe(64 * 1024);
  expect(new TextDecoder().decode(onlyEnd).endsWith("failed to run bundle_dmg.sh")).toBe(true);
});

test("detach only the disk image this build left mounted", () => {
  expect(diskImagesToDetach(HDIUTIL_INFO, PRODUCT)).toEqual(["/dev/disk4"]);
  expect(diskImagesToDetach("image-path      : /tmp/nothing.txt\n/dev/disk9          	\n", PRODUCT)).toEqual([]);
});

test("the DMG bundle retries a script failure and stops on any other error", async () => {
  const calls: string[] = [];
  let dmgFailures = 0;
  await retryDmgBundle({
    attempts: DMG_BUNDLE_ATTEMPTS,
    bundle: async (attempt) => {
      calls.push(`bundle ${attempt}`);
      if (attempt < DMG_BUNDLE_ATTEMPTS) {
        dmgFailures += 1;
        throw new Error("failed to run bundle_dmg.sh");
      }
    },
    retryable: (error) => error instanceof Error && isDmgBundlerFailure(error.message),
    recover: async () => {
      calls.push("recover");
    },
    wait: async (failed) => {
      calls.push(`wait ${failed}`);
    },
    warn: (message) => {
      calls.push(message);
    },
  });
  expect(dmgFailures).toBe(2);
  expect(calls).toEqual([
    "bundle 1",
    "DMG bundler failed; detaching leftover disk images and retrying (2 of 3)",
    "recover",
    "wait 1",
    "bundle 2",
    "DMG bundler failed; detaching leftover disk images and retrying (3 of 3)",
    "recover",
    "wait 2",
    "bundle 3",
  ]);

  const stopped: string[] = [];
  await expect(retryDmgBundle({
    attempts: DMG_BUNDLE_ATTEMPTS,
    bundle: async () => {
      stopped.push("bundle");
      throw new Error("error[E0425]: cannot find value");
    },
    retryable: (error) => error instanceof Error && isDmgBundlerFailure(error.message),
    recover: async () => {
      stopped.push("recover");
    },
    wait: async () => {
      stopped.push("wait");
    },
    warn: (message) => {
      stopped.push(message);
    },
  })).rejects.toThrow("error[E0425]");
  expect(stopped).toEqual(["bundle"]);
});

test("the release bundle command retries only the DMG", async () => {
  const child = Bun.spawn([
    process.execPath,
    "--no-env-file",
    "scripts/build.ts",
    "--dry-run",
    "--only=bundle",
    "--target=x86_64-apple-darwin",
    "--bundles=app,dmg",
  ], {
    cwd: `${import.meta.dir}/..`,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
  const tauri = stdout.split("\n").filter((line) => line.includes("[dry-run] would run:") && line.includes("tauri") && line.includes("--ci"));
  expect(tauri).toHaveLength(2);
  expect(tauri[0]).toContain("--bundles 'app,dmg'");
  expect(tauri[0]).not.toContain("--verbose");
  expect(tauri[1]).toContain("tauri --verbose build");
  expect(tauri[1]).toContain("--bundles dmg");
  expect(tauri[1]).not.toContain("app,dmg");
});
