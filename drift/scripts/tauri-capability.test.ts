import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const srcTauriDir = fileURLToPath(new URL("../src-tauri", import.meta.url));

function listRustSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRustSources(path));
    } else if (entry.name.endsWith(".rs")) {
      files.push(path);
    }
  }
  return files;
}

function collectConfiguredWindowLabels(): string[] {
  const config = JSON.parse(
    readFileSync(join(srcTauriDir, "tauri.conf.json"), "utf8"),
  );
  const windows = config.app?.windows ?? [];
  return windows
    .map((window: { label?: unknown }) => window.label)
    .filter((label: unknown): label is string => typeof label === "string");
}

function collectRuntimeWindowLabels(): string[] {
  const pattern = /WebviewWindowBuilder::new\(\s*&?\w+,\s*"([^"]+)"/g;
  const labels = new Set<string>();
  for (const file of listRustSources(join(srcTauriDir, "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
      labels.add(match[1]);
    }
  }
  return [...labels];
}

function collectCapabilityWindowPatterns(): string[] | "all" {
  const directory = join(srcTauriDir, "capabilities");
  const patterns: string[] = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    const capability = JSON.parse(readFileSync(join(directory, name), "utf8"));
    if (!Array.isArray(capability.windows)) {
      return "all";
    }
    patterns.push(
      ...capability.windows.filter(
        (pattern: unknown): pattern is string => typeof pattern === "string",
      ),
    );
  }
  return patterns;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPattern(label: string, pattern: string) {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === label;
  const source = pattern.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}$`).test(label);
}

test("discovers runtime-created window labels from Rust sources", () => {
  const labels = collectRuntimeWindowLabels();
  assert.ok(
    labels.length > 0,
    "expected WebviewWindowBuilder::new to expose at least one window label; update the pattern if the Rust call shape changed",
  );
});

test("covers every app window with a Tauri capability", () => {
  const labels = [
    ...new Set([
      ...collectConfiguredWindowLabels(),
      ...collectRuntimeWindowLabels(),
    ]),
  ];
  assert.ok(labels.length > 0, "expected to discover app window labels");

  const patterns = collectCapabilityWindowPatterns();
  if (patterns === "all") {
    return;
  }

  const uncovered = labels.filter(
    (label) => !patterns.some((pattern) => matchesPattern(label, pattern)),
  );
  assert.equal(
    uncovered.length,
    0,
    `window labels missing from src-tauri/capabilities: ${uncovered.join(", ")}. Windows without a capability cannot call plugin commands, so core APIs such as event.listen reject silently.`,
  );
});
