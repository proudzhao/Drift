import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  compareSemver,
  contentTypeFor,
  createLatestManifest,
  createTestConfig,
  normalizeSemver,
  platformProfile,
  resolveServerFile,
  selectSingleArtifact,
} from "./updater-test.mjs";

test("normalizes valid SemVer and rejects invalid versions", () => {
  assert.equal(normalizeSemver("v0.6.3-test.1"), "0.6.3-test.1");
  assert.throws(() => normalizeSemver("0.6"), /合法 SemVer/);
});

test("compares prerelease versions using SemVer ordering", () => {
  assert.equal(compareSemver("0.6.3-test.1", "0.6.3-test.2"), -1);
  assert.equal(
    compareSemver("0.6.3-test-build.1", "0.6.3-test-build.2"),
    -1,
  );
  assert.equal(compareSemver("0.6.3-test.2", "0.6.3"), -1);
  assert.equal(compareSemver("0.6.3", "0.6.3"), 0);
});

test("maps supported platforms to updater targets and bundles", () => {
  assert.deepEqual(platformProfile("darwin", "arm64"), {
    updaterTarget: "darwin-aarch64",
    bundles: "app,dmg",
    baseSuffix: ".dmg",
    updateSignatureSuffix: ".app.tar.gz.sig",
  });
  assert.deepEqual(platformProfile("darwin", "x64"), {
    updaterTarget: "darwin-x86_64",
    bundles: "app,dmg",
    baseSuffix: ".dmg",
    updateSignatureSuffix: ".app.tar.gz.sig",
  });
  assert.deepEqual(platformProfile("win32", "x64"), {
    updaterTarget: "windows-x86_64",
    bundles: "nsis",
    baseSuffix: ".exe",
    updateSignatureSuffix: ".exe.sig",
  });
  assert.throws(
    () => platformProfile("linux", "x64"),
    /仅支持 Windows x64 和 macOS/,
  );
});

test("creates an updater config isolated from production", () => {
  const config = createTestConfig({
    version: "0.6.3-test.1",
    pubkey: "local-test-public-key",
  });
  assert.equal(config.productName, "Drift Updater Test");
  assert.equal(config.identifier, "com.proudzhao.drift.updater-test");
  assert.equal(config.version, "0.6.3-test.1");
  assert.deepEqual(config.plugins.updater.endpoints, [
    "http://127.0.0.1:48765/latest.json",
  ]);
  assert.equal(config.plugins.updater.dangerousInsecureTransportProtocol, true);
  assert.equal(config.plugins.updater.pubkey, "local-test-public-key");
});

test("creates a manifest for exactly one local platform", () => {
  const manifest = createLatestManifest({
    version: "0.6.3-test.2",
    updaterTarget: "darwin-aarch64",
    artifactName:
      "drift-updater-test-0.6.3-test.2-darwin-aarch64.app.tar.gz",
    signature: "signed-value",
    pubDate: "2026-08-16T00:00:00.000Z",
  });
  assert.deepEqual(manifest, {
    version: "0.6.3-test.2",
    notes: "Drift local isolated updater test",
    pub_date: "2026-08-16T00:00:00.000Z",
    platforms: {
      "darwin-aarch64": {
        signature: "signed-value",
        url: "http://127.0.0.1:48765/drift-updater-test-0.6.3-test.2-darwin-aarch64.app.tar.gz",
      },
    },
  });
});

test("selects exactly one artifact", () => {
  assert.equal(selectSingleArtifact(["a.sig"], ".sig"), "a.sig");
  assert.throws(() => selectSingleArtifact([], ".sig"), /没有找到/);
  assert.throws(
    () => selectSingleArtifact(["a.sig", "b.sig"], ".sig"),
    /找到多个/,
  );
});

test("resolves only files directly under the server root", () => {
  const root = path.resolve("updater-server");
  assert.equal(
    resolveServerFile(root, "/latest.json"),
    path.join(root, "latest.json"),
  );
  assert.equal(resolveServerFile(root, "/../secret"), null);
  assert.equal(resolveServerFile(root, "/nested/file"), null);
});

test("maps updater files to explicit content types", () => {
  assert.equal(
    contentTypeFor("latest.json"),
    "application/json; charset=utf-8",
  );
  assert.equal(contentTypeFor("bundle.sig"), "text/plain; charset=utf-8");
  assert.equal(contentTypeFor("bundle.app.tar.gz"), "application/gzip");
  assert.equal(contentTypeFor("bundle.exe"), "application/octet-stream");
});
