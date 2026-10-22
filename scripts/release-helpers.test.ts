import { describe, expect, test } from "bun:test";
import { APPLE_SIGNING_ENV, assertManifestAssets, assertSigningConfig, bundleRoot, indexArtifacts, mergeManifestValues, parseChecksums, previousReleaseTag, releaseVersion, selectReleaseRef, signingStatement, targetInfo, validateManifest } from "./release-helpers.ts";

const date = "2026-10-05T12:00:00Z";
const url = "https://github.com/example/app/releases/download/v6.0.0";
const manifest = (key = "darwin-aarch64") => ({ version: "6.0.0", pub_date: date, notes: "Notes", platforms: { [key]: { signature: "signature", url: `${url}/aarch64-apple-darwin--App.app.tar.gz` } } });

describe("release targets and flat assets", () => {
  test.each([
    ["aarch64-apple-darwin", "bun-darwin-arm64"],
    ["x86_64-apple-darwin", "bun-darwin-x64"],
    ["aarch64-pc-windows-msvc", "bun-windows-arm64"],
    ["x86_64-pc-windows-msvc", "bun-windows-x64"],
    ["aarch64-unknown-linux-gnu", "bun-linux-arm64"],
    ["x86_64-unknown-linux-gnu", "bun-linux-x64"],
    ["aarch64-unknown-linux-musl", "bun-linux-arm64-musl"],
    ["x86_64-unknown-linux-musl", "bun-linux-x64-musl"],
  ])("%s maps to %s", (triple, target) => expect(targetInfo(triple).bunTarget).toBe(target));
  test("rejects unsupported triples", () => expect(() => targetInfo("i686-unknown-linux-gnu")).toThrow());
  test("uses the explicit target bundle directory", () => {
    expect(bundleRoot("/app/src-tauri", "x86_64-apple-darwin")).toBe("/app/src-tauri/target/x86_64-apple-darwin/release/bundle");
    expect(bundleRoot("/app", "x86_64-apple-darwin", "/cargo")).toBe("/cargo/x86_64-apple-darwin/release/bundle");
  });
  test("indexes deterministic flat installer and signature names", () => {
    const result = indexArtifacts(["/bundle/nsis/App.exe.sig", "/bundle/nsis/App.exe", "/bundle/app/internal.txt"], "x86_64-pc-windows-msvc");
    expect(result.map((entry) => entry.name)).toEqual(["x86_64-pc-windows-msvc--App.exe", "x86_64-pc-windows-msvc--App.exe.sig"]);
    expect(() => indexArtifacts(["/a/App.exe", "/b/App.exe"], "x86_64-pc-windows-msvc")).toThrow("Duplicate");
    expect(() => indexArtifacts(["/a/App.exe.sig"], "x86_64-pc-windows-msvc")).toThrow("Orphan");
  });
});

describe("release gate", () => {
  test("accepts only matching tag pushes and explicit dispatch tags", () => {
    expect(selectReleaseRef("push", "refs/tags/v6.0.0", undefined, "6.0.0")).toEqual({ tag: "v6.0.0", version: "6.0.0" });
    expect(selectReleaseRef("workflow_dispatch", "refs/heads/main", "v6.0.0", "6.0.0").tag).toBe("v6.0.0");
    expect(selectReleaseRef("workflow_call", "refs/heads/main", "v6.0.0", "6.0.0")).toEqual({ tag: "v6.0.0", version: "6.0.0" });
    expect(selectReleaseRef("push", "refs/heads/main", "v6.0.0", "6.0.0")).toEqual({ tag: "v6.0.0", version: "6.0.0" });
    for (const [event, ref, input] of [["push", "refs/heads/v6.0.0", undefined], ["push", "refs/heads/main", ""], ["pull_request", "refs/tags/v6.0.0", undefined], ["workflow_dispatch", "refs/heads/main", undefined]]) {
      expect(() => selectReleaseRef(event ?? "", ref ?? "", input, "6.0.0")).toThrow();
    }
    expect(() => selectReleaseRef("push", "refs/tags/v6.1.0", undefined, "6.0.0")).toThrow("disagree");
    expect(() => selectReleaseRef("push", "refs/tags/v6.0.0", "v6.1.0", "6.0.0")).toThrow("push ref disagree");
    expect(() => selectReleaseRef("push", "refs/heads/main", "v6.1.0", "6.0.0")).toThrow("disagree");
  });
  test("version and notes tag selection", () => {
    expect(releaseVersion("v6.0.0-beta.1")).toBe("6.0.0-beta.1");
    expect(() => releaseVersion("6.0.0\ninjected=1")).toThrow();
    for (const version of ["6.0.0-beta..1", "6.0.0-01", "6.0.0+build..1"]) expect(() => releaseVersion(version)).toThrow();
    expect(previousReleaseTag(["v6.0.0", "v5.0.0"], "v6.0.0")).toBe("v5.0.0");
  });
  test("requires updater keys and accepts absent platform certificates", () => {
    expect(() => assertSigningConfig({ plugins: { updater: { pubkey: "REPLACE_WITH_KEY" } } }, {}, "linux", false)).toThrow("public key");
    const config = { plugins: { updater: { pubkey: "owner-supplied-key" } } };
    expect(() => assertSigningConfig(config, {}, "linux", false)).toThrow("PRIVATE_KEY");
    expect(assertSigningConfig(config, { TAURI_SIGNING_PRIVATE_KEY: "secret", APPLE_TEAM_ID: "team" }, "darwin", true)).toEqual({ apple: "ad-hoc", windows: "unsigned" });
    expect(() => assertSigningConfig(config, { TAURI_SIGNING_PRIVATE_KEY: "secret", APPLE_CERTIFICATE: "certificate" }, "darwin", true)).toThrow("APPLE_CERTIFICATE");
    expect(() => assertSigningConfig(config, { TAURI_SIGNING_PRIVATE_KEY: "secret", WINDOWS_CERTIFICATE: "certificate" }, "windows", true)).toThrow("WINDOWS_CERTIFICATE");
  });
  test("all builders describe the same signing configuration", () => {
    const config = { plugins: { updater: { pubkey: "owner-supplied-key" } } };
    const env = { TAURI_SIGNING_PRIVATE_KEY: "secret", ...Object.fromEntries(APPLE_SIGNING_ENV.map((name) => [name, "configured"])) };
    const notes = ["darwin", "windows", "linux"].map((platform) => signingStatement(assertSigningConfig(config, env, platform, true)));
    expect(new Set(notes).size).toBe(1);
    expect(notes[0]).toContain("notarised");
    expect(notes[0]).toContain("SmartScreen");
  });
  test("the previous release excludes newer tags and orders prereleases numerically", () => {
    expect(previousReleaseTag(["v7.0.0", "v6.0.0-rc.2", "v6.0.0-rc.10", "v6.0.0-invalid!"], "v6.0.0")).toBe("v6.0.0-rc.10");
  });
});

describe("manifest validation and merging", () => {
  test("validates objects instead of accepting arrays or null", () => {
    for (const value of [null, [], {}, { ...manifest(), platforms: [] }, { ...manifest(), pub_date: "invalid" }, { ...manifest(), notes: 3 }]) expect(() => validateManifest(value)).toThrow();
    expect(() => validateManifest({ ...manifest(), platforms: { "darwin-aarch64": { signature: "", url } } })).toThrow();
    expect(() => validateManifest({ ...manifest(), platforms: { "darwin-aarch64": { signature: "x", url: "https://" } } })).toThrow();
  });
  test("merges exact platform sets with consistent release metadata", () => {
    const a = manifest();
    const b = manifest("darwin-x86_64");
    expect(Object.keys(mergeManifestValues([b, a], "6.0.0", ["darwin-aarch64", "darwin-x86_64"]).platforms)).toEqual(["darwin-aarch64", "darwin-x86_64"]);
    expect(() => mergeManifestValues([a, a], "6.0.0")).toThrow("Duplicate");
    expect(() => mergeManifestValues([a], "6.0.0", ["darwin-aarch64", "linux-x86_64"])).toThrow("Incomplete");
    expect(() => mergeManifestValues([a, { ...b, notes: "other" }], "6.0.0")).toThrow("metadata");
    expect(() => mergeManifestValues([a], "6.1.0")).toThrow("metadata");
    expect(() => mergeManifestValues([], "6.0.0")).toThrow();
  });
  test("checks URLs resolve to indexed assets and signatures on the selected release", () => {
    const names = ["aarch64-apple-darwin--App.app.tar.gz", "aarch64-apple-darwin--App.app.tar.gz.sig"];
    assertManifestAssets(validateManifest(manifest()), names, url);
    expect(() => assertManifestAssets(validateManifest(manifest()), names.slice(0, 1), url)).toThrow();
    expect(() => assertManifestAssets(validateManifest(manifest()), names, `${url}-other`)).toThrow();
  });
  test("checksum parser rejects traversal, duplicates and malformed digests", () => {
    const line = `${"a".repeat(64)}  target--App.exe`;
    expect(parseChecksums(`${line}\n`)).toEqual([{ digest: "a".repeat(64), name: "target--App.exe" }]);
    for (const text of ["", `${line}\n${line}`, `${"a".repeat(64)}  ../App.exe`, "bad  App.exe"]) expect(() => parseChecksums(text)).toThrow();
  });
});
