import { expect, test } from "bun:test";
import { DMG_BUNDLE_ATTEMPTS, diskImagesToDetach, dmgAttemptIsRetryable, dmgBundlePlan, isDmgBundlerFailure, retryDmgBundle, shouldRetryDmgBundle } from "./build.ts";

const PRODUCT = "CADCAM FUN";

const HDIUTIL_INFO = `
framework       : 682
driver          : 682
================================================
image-path      : /Library/Developer/CoreSimulator/Images/system.dmg
/dev/disk2          	GUID_partition_scheme
/dev/disk2s1        	Apple_APFS                     	/Library/Developer/CoreSimulator/Volumes/iOS
================================================
image-path      : /Users/runner/work/cadcamfun/cadcamfun/apps/desktop/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/rw.28057.CADCAM FUN_0.1.107_x64.dmg
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
