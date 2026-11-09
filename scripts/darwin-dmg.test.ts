import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredBundleTargets, createDarwinDiskImage, darwinBundleArgument, darwinDmgLayout } from "./darwin-dmg.ts";

const CONFIGURED = ["deb", "rpm", "app", "dmg", "nsis", "msi"];

test("the default macOS bundle list asks Tauri for the app only", () => {
  expect(darwinBundleArgument(undefined, CONFIGURED)).toEqual({ argument: "app", packageDmg: true });
  expect(darwinBundleArgument("app,dmg", CONFIGURED)).toEqual({ argument: "app", packageDmg: true });
  expect(darwinBundleArgument("dmg", CONFIGURED)).toEqual({ argument: "app", packageDmg: true });
  expect(darwinBundleArgument("app", CONFIGURED)).toEqual({ argument: "app", packageDmg: false });
  expect(darwinBundleArgument(undefined, ["app"])).toEqual({ argument: undefined, packageDmg: false });
});

test("the disk image keeps Tauri's file name", () => {
  expect(darwinDmgLayout({ productName: "CADCAM FUN", version: "0.1.110", arch: "x86_64", bundleDir: "/bundle" }).dmgPath)
    .toBe("/bundle/dmg/CADCAM FUN_0.1.110_x64.dmg");
  expect(darwinDmgLayout({ productName: "CADCAM FUN", version: "0.1.110", arch: "aarch64", bundleDir: "/bundle" }).dmgPath)
    .toBe("/bundle/dmg/CADCAM FUN_0.1.110_aarch64.dmg");
  expect(configuredBundleTargets({ bundle: { targets: CONFIGURED } })).toEqual(CONFIGURED);
  expect(configuredBundleTargets({})).toEqual([]);
});

test("hdiutil is retried without attaching the image, and a doubled extension is renamed", async () => {
  const root = await mkdtemp(join(tmpdir(), "darwin-dmg-"));
  const layout = darwinDmgLayout({ productName: "CADCAM FUN", version: "0.1.110", arch: "x86_64", bundleDir: root });
  const commands: string[][] = [];
  let creates = 0;
  try {
    await createDarwinDiskImage({
      dmgPath: layout.dmgPath,
      stageDir: layout.stageDir,
      volumeName: layout.volumeName,
      scratchPath: join(root, "scratch.dmg"),
      attempts: 3,
      wait: async () => {},
      detachVolumes: async () => { commands.push(["detach"]); },
      run: async (command) => {
        commands.push([...command]);
        if (command[1] === "create") {
          creates += 1;
          if (creates === 1) throw new Error("Resource busy");
        }
        if (command[1] === "convert") await writeFile(`${layout.dmgPath}.dmg`, "image");
      },
    });
    expect(commands.some((command) => command.includes("osascript") || command.includes("bundle_dmg.sh") || command.includes("attach"))).toBe(false);
    expect(commands.filter((command) => command[0] === "hdiutil" && command[1] === "create")).toHaveLength(2);
    expect(commands.filter((command) => command[1] === "create").every((command) => command.includes("UDRW") && command.includes(layout.stageDir))).toBe(true);
    const convert = commands.find((command) => command[1] === "convert");
    expect(convert).toContain("UDZO");
    expect(convert).toContain(layout.dmgPath);
    expect(commands.filter((command) => command[0] === "detach")).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
