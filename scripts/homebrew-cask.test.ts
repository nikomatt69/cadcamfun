import { expect, test } from "bun:test";
import { renderCask, selectDmg } from "./homebrew-cask.ts";

const ENTRIES = [
  {
    arch: "arm64" as const,
    url: "https://github.com/nikomatt69/cadcamfun/releases/download/v6.0.1-macos-arm64/aarch64-apple-darwin--CADCAM%20FUN%206.0.1.dmg",
    sha256: "a".repeat(64),
  },
  {
    arch: "x64" as const,
    url: "https://github.com/nikomatt69/cadcamfun/releases/download/v6.0.1-macos-x64/x86_64-apple-darwin--CADCAM%20FUN%206.0.1.dmg",
    sha256: "b".repeat(64),
  },
];

test("the cask carries both macOS architectures and the digests of the release", () => {
  const cask = renderCask({ version: "6.0.1", repository: "nikomatt69/cadcamfun", entries: ENTRIES });
  expect(cask).toContain('cask "cadcamfun" do');
  expect(cask).toContain('version "6.0.1"');
  expect(cask).toContain("on_arch_conditional do");
  expect(cask).toContain("Hardware::CPU.arm?");
  expect(cask).toContain(ENTRIES[0]?.url ?? "");
  expect(cask).toContain(ENTRIES[1]?.url ?? "");
  expect(cask).toContain(`sha256 "${"a".repeat(64)}"`);
  expect(cask).toContain(`sha256 "${"b".repeat(64)}"`);
  expect(cask).toContain('app "CADCAM FUN.app"');
  expect(cask).toContain('homepage "https://github.com/nikomatt69/cadcamfun"');
  expect(cask.trimEnd().endsWith("end")).toBe(true);
});

test("a cask with one architecture has no architecture conditional", () => {
  const cask = renderCask({ version: "6.0.1", repository: "nikomatt69/cadcamfun", entries: [ENTRIES[0] as (typeof ENTRIES)[number]] });
  expect(cask).not.toContain("on_arch_conditional");
  expect(cask).toContain(ENTRIES[0]?.url ?? "");
});

test("a cask without a macOS build is refused", () => {
  expect(() => renderCask({ version: "6.0.1", repository: "nikomatt69/cadcamfun", entries: [] })).toThrow("at least one macOS build");
});

test("the .dmg of a platform release is taken from its checksums", () => {
  const digest = "c".repeat(64);
  const checksums = [
    `${digest}  aarch64-apple-darwin--CADCAM FUN 6.0.1.dmg`,
    `${"d".repeat(64)}  aarch64-apple-darwin--CADCAM FUN 6.0.1.dmg.sig`,
  ].join("\n");
  expect(selectDmg(checksums, "aarch64-apple-darwin")).toEqual({
    name: "aarch64-apple-darwin--CADCAM FUN 6.0.1.dmg",
    digest,
  });
  // A platform without a .dmg is an error, not a silently skipped build.
  expect(() => selectDmg(checksums, "x86_64-pc-windows-msvc")).toThrow("found 0");
});
