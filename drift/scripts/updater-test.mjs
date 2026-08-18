import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TEST_HOST = "127.0.0.1";
export const TEST_PORT = 48765;
export const TEST_PRODUCT_NAME = "Drift Updater Test";
export const TEST_IDENTIFIER = "com.proudzhao.drift.updater-test";
export const TEST_ENDPOINT = `http://${TEST_HOST}:${TEST_PORT}/latest.json`;

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const DRIFT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
export const TEST_ROOT = path.join(DRIFT_ROOT, ".updater-test");
export const KEYS_DIR = path.join(TEST_ROOT, "keys");
export const GENERATED_DIR = path.join(TEST_ROOT, "generated");
export const BASE_DIR = path.join(TEST_ROOT, "base");
export const UPDATE_DIR = path.join(TEST_ROOT, "update");
export const SERVER_DIR = path.join(TEST_ROOT, "server");
export const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "updater-test.key");
export const PUBLIC_KEY_PATH = `${PRIVATE_KEY_PATH}.pub`;

const TAURI_TARGET_ROOT = path.join(DRIFT_ROOT, "src-tauri", "target");
const USAGE = `Drift 本地 updater 隔离测试

用法：
  npm run updater:test -- init
  npm run updater:test -- prepare --from <semver> --to <semver>
  npm run updater:test -- serve
  npm run updater:test -- help

该工具不会创建 Git Tag、GitHub Release 或执行 git push。`;

const SEMVER_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function normalizeSemver(value) {
  const normalized = String(value).trim();
  if (!SEMVER_PATTERN.test(normalized)) {
    throw new Error(`版本必须是合法 SemVer：${value}`);
  }
  return normalized.replace(/^v/, "");
}

function semverParts(value) {
  const normalized = normalizeSemver(value);
  const [withoutBuild] = normalized.split("+");
  const prereleaseSeparator = withoutBuild.indexOf("-");
  const core =
    prereleaseSeparator === -1
      ? withoutBuild
      : withoutBuild.slice(0, prereleaseSeparator);
  const prerelease =
    prereleaseSeparator === -1
      ? ""
      : withoutBuild.slice(prereleaseSeparator + 1);
  return {
    core: core.split(".").map(Number),
    prerelease: prerelease.split(".").filter(Boolean),
  };
}

export function compareSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) {
      return a.core[index] < b.core[index] ? -1 : 1;
    }
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);
    if (leftIsNumber && rightIsNumber) {
      return Number(leftPart) < Number(rightPart) ? -1 : 1;
    }
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }

  return 0;
}

export function platformProfile(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform === "darwin" && arch === "arm64") {
    return {
      updaterTarget: "darwin-aarch64",
      bundles: "app,dmg",
      baseSuffix: ".dmg",
      updateSignatureSuffix: ".app.tar.gz.sig",
    };
  }
  if (platform === "darwin" && arch === "x64") {
    return {
      updaterTarget: "darwin-x86_64",
      bundles: "app,dmg",
      baseSuffix: ".dmg",
      updateSignatureSuffix: ".app.tar.gz.sig",
    };
  }
  if (platform === "win32" && arch === "x64") {
    return {
      updaterTarget: "windows-x86_64",
      bundles: "nsis",
      baseSuffix: ".exe",
      updateSignatureSuffix: ".exe.sig",
    };
  }
  throw new Error(
    `本地 updater 测试仅支持 Windows x64 和 macOS：${platform}/${arch}`,
  );
}

export function createTestConfig({ version, pubkey }) {
  return {
    productName: TEST_PRODUCT_NAME,
    identifier: TEST_IDENTIFIER,
    version: normalizeSemver(version),
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        dangerousInsecureTransportProtocol: true,
        endpoints: [TEST_ENDPOINT],
        pubkey,
      },
    },
  };
}

export function createLatestManifest({
  version,
  updaterTarget,
  artifactName,
  signature,
  pubDate = new Date().toISOString(),
}) {
  if (!signature.trim()) throw new Error("updater 签名为空");
  return {
    version: normalizeSemver(version),
    notes: "Drift local isolated updater test",
    pub_date: pubDate,
    platforms: {
      [updaterTarget]: {
        signature: signature.trim(),
        url: `http://${TEST_HOST}:${TEST_PORT}/${encodeURIComponent(artifactName)}`,
      },
    },
  };
}

export function selectSingleArtifact(paths, suffix) {
  const matches = paths.filter((value) => value.endsWith(suffix));
  if (matches.length === 0) {
    throw new Error(`没有找到 ${suffix} updater 产物`);
  }
  if (matches.length > 1) {
    throw new Error(`找到多个 ${suffix} updater 产物：${matches.join(", ")}`);
  }
  return matches[0];
}

export function resolveServerFile(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0]);
  } catch {
    return null;
  }

  const name = decoded.replace(/^\/+/, "");
  if (!name || name !== path.basename(name)) return null;

  const resolved = path.resolve(root, name);
  return path.dirname(resolved) === path.resolve(root) ? resolved : null;
}

export function contentTypeFor(file) {
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".sig")) return "text/plain; charset=utf-8";
  if (file.endsWith(".tar.gz") || file.endsWith(".gz")) {
    return "application/gzip";
  }
  return "application/octet-stream";
}

function assertInsideTestRoot(target) {
  const relative = path.relative(TEST_ROOT, path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`拒绝操作测试目录之外的路径：${target}`);
  }
}

async function resetGeneratedDirectory(target) {
  assertInsideTestRoot(target);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function npxCommand(platform = process.platform) {
  return platform === "win32" ? "npx.cmd" : "npx";
}

function runCommand(command, args, { env = {}, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: DRIFT_ROOT,
      env: { ...process.env, ...env },
      shell: false,
      stdio: quiet ? "ignore" : "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`${command} 启动失败：${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} 执行失败，退出码 ${code}`));
      }
    });
  });
}

export async function initKeys() {
  await fs.mkdir(KEYS_DIR, { recursive: true });
  const hasPrivateKey = await pathExists(PRIVATE_KEY_PATH);
  const hasPublicKey = await pathExists(PUBLIC_KEY_PATH);

  if (hasPrivateKey && hasPublicKey) {
    console.log(`复用现有测试密钥：${KEYS_DIR}`);
    return;
  }
  if (hasPrivateKey || hasPublicKey) {
    throw new Error(
      `测试密钥不完整。请检查 ${KEYS_DIR}，不要单独覆盖其中一个密钥文件。`,
    );
  }

  await runCommand(
    npxCommand(),
    [
      "tauri",
      "signer",
      "generate",
      "--ci",
      "-w",
      PRIVATE_KEY_PATH,
    ],
    { quiet: true },
  );

  if (
    !(await pathExists(PRIVATE_KEY_PATH)) ||
    !(await pathExists(PUBLIC_KEY_PATH))
  ) {
    throw new Error("Tauri signer 执行成功，但没有生成完整的测试密钥对。");
  }

  console.log(`测试密钥已生成：${KEYS_DIR}`);
  console.log("该私钥只能用于本地隔离测试，禁止用于正式 Release。");
}

async function walkFiles(root) {
  if (!(await pathExists(root))) return [];
  const files = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(target)));
    } else if (entry.isFile()) {
      files.push(target);
    }
  }
  return files;
}

async function snapshotFiles(root) {
  const snapshot = new Map();
  for (const file of await walkFiles(root)) {
    const stats = await fs.stat(file);
    snapshot.set(file, `${stats.size}:${stats.mtimeMs}`);
  }
  return snapshot;
}

async function changedFilesSince(root, before) {
  const changed = [];
  for (const file of await walkFiles(root)) {
    const stats = await fs.stat(file);
    const fingerprint = `${stats.size}:${stats.mtimeMs}`;
    if (before.get(file) !== fingerprint) changed.push(file);
  }
  return changed;
}

function bundleArtifacts(files) {
  return files.filter((file) =>
    path.relative(TAURI_TARGET_ROOT, file).split(path.sep).includes("bundle"),
  );
}

async function writeConfig(target, config) {
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function runTauriBuild({ configPath, bundles, privateKey }) {
  await runCommand(
    npxCommand(),
    [
      "tauri",
      "build",
      "--ci",
      "--bundles",
      bundles,
      "--config",
      configPath,
    ],
    { env: { TAURI_SIGNING_PRIVATE_KEY: privateKey } },
  );
}

async function copyArtifact(source, destinationDirectory, name = path.basename(source)) {
  const destination = path.join(destinationDirectory, name);
  await fs.copyFile(source, destination);
  return destination;
}

function updaterArtifactSuffix(signatureSuffix) {
  return signatureSuffix.slice(0, -".sig".length);
}

export async function prepare({ from, to }) {
  const baseVersion = normalizeSemver(from);
  const updateVersion = normalizeSemver(to);
  if (compareSemver(baseVersion, updateVersion) >= 0) {
    throw new Error(`目标版本必须高于旧版本：${baseVersion} -> ${updateVersion}`);
  }

  if (
    !(await pathExists(PRIVATE_KEY_PATH)) ||
    !(await pathExists(PUBLIC_KEY_PATH))
  ) {
    throw new Error("测试密钥不存在，请先运行 npm run updater:test -- init");
  }

  const profile = platformProfile();
  const publicKey = (await fs.readFile(PUBLIC_KEY_PATH, "utf8")).trim();
  const privateKey = (await fs.readFile(PRIVATE_KEY_PATH, "utf8")).trim();
  if (!publicKey || !privateKey) throw new Error("测试密钥文件为空");

  for (const directory of [GENERATED_DIR, BASE_DIR, UPDATE_DIR, SERVER_DIR]) {
    await resetGeneratedDirectory(directory);
  }

  const baseConfigPath = path.join(GENERATED_DIR, "base.config.json");
  const updateConfigPath = path.join(GENERATED_DIR, "update.config.json");
  await writeConfig(
    baseConfigPath,
    createTestConfig({ version: baseVersion, pubkey: publicKey }),
  );
  await writeConfig(
    updateConfigPath,
    createTestConfig({ version: updateVersion, pubkey: publicKey }),
  );

  console.log(`构建旧测试版本 ${baseVersion}...`);
  const beforeBase = await snapshotFiles(TAURI_TARGET_ROOT);
  await runTauriBuild({
    configPath: baseConfigPath,
    bundles: profile.bundles,
    privateKey,
  });
  const baseArtifact = selectSingleArtifact(
    bundleArtifacts(await changedFilesSince(TAURI_TARGET_ROOT, beforeBase)),
    profile.baseSuffix,
  );
  const copiedBase = await copyArtifact(baseArtifact, BASE_DIR);

  console.log(`构建新测试版本 ${updateVersion}...`);
  const beforeUpdate = await snapshotFiles(TAURI_TARGET_ROOT);
  await runTauriBuild({
    configPath: updateConfigPath,
    bundles: profile.bundles,
    privateKey,
  });
  const updateSignature = selectSingleArtifact(
    bundleArtifacts(await changedFilesSince(TAURI_TARGET_ROOT, beforeUpdate)),
    profile.updateSignatureSuffix,
  );
  const updateArtifact = updateSignature.slice(0, -".sig".length);
  if (!(await pathExists(updateArtifact))) {
    throw new Error(`签名对应的 updater 产物不存在：${updateArtifact}`);
  }

  const artifactSuffix = updaterArtifactSuffix(profile.updateSignatureSuffix);
  const serverArtifactName =
    `drift-updater-test-${updateVersion}-${profile.updaterTarget}` +
    artifactSuffix;
  const copiedUpdate = await copyArtifact(updateArtifact, UPDATE_DIR);
  const copiedSignature = await copyArtifact(updateSignature, UPDATE_DIR);
  const serverArtifact = await copyArtifact(
    updateArtifact,
    SERVER_DIR,
    serverArtifactName,
  );
  const signature = await fs.readFile(updateSignature, "utf8");
  const manifest = createLatestManifest({
    version: updateVersion,
    updaterTarget: profile.updaterTarget,
    artifactName: serverArtifactName,
    signature,
  });
  const manifestPath = path.join(SERVER_DIR, "latest.json");
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log("本地 updater 测试产物已准备完成：");
  console.log(`  旧版安装包：${copiedBase}`);
  console.log(`  新版 updater：${copiedUpdate}`);
  console.log(`  新版签名：${copiedSignature}`);
  console.log(`  本地 manifest：${manifestPath}`);
  console.log(`  本地服务产物：${serverArtifact}`);
  console.log("下一步：手动安装旧版，然后运行 npm run updater:test -- serve。");
}

async function validateServerFiles() {
  const manifestPath = path.join(SERVER_DIR, "latest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `本地 manifest 不可用，请重新运行 prepare：${error.message}`,
    );
  }

  const platforms = Object.values(manifest.platforms ?? {});
  if (platforms.length !== 1 || !platforms[0]?.url) {
    throw new Error("本地 manifest 必须且只能包含一个当前平台 updater URL");
  }

  const artifactUrl = new URL(platforms[0].url);
  if (
    artifactUrl.protocol !== "http:" ||
    artifactUrl.hostname !== TEST_HOST ||
    Number(artifactUrl.port) !== TEST_PORT
  ) {
    throw new Error("本地 manifest 的 updater URL 未指向固定回环服务");
  }

  const artifact = resolveServerFile(SERVER_DIR, artifactUrl.pathname);
  if (!artifact || !(await pathExists(artifact))) {
    throw new Error("本地 manifest 引用的 updater 产物不存在");
  }
}

async function handleServerRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  const target = resolveServerFile(SERVER_DIR, request.url ?? "/");
  if (!target) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let stats;
  try {
    stats = await fs.stat(target);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }
  if (!stats.isFile()) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": String(stats.size),
    "Content-Type": contentTypeFor(target),
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(target);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}

export async function serveLocalUpdates() {
  await validateServerFiles();

  const server = http.createServer((request, response) => {
    handleServerRequest(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Internal Server Error");
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(TEST_PORT, TEST_HOST, resolve);
  });

  console.log(`本地 updater 服务已启动：${TEST_ENDPOINT}`);
  console.log("服务只监听 127.0.0.1。按 Ctrl+C 停止。");

  await new Promise((resolve, reject) => {
    const stop = () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      server.close((error) => (error ? reject(error) : resolve()));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

function parsePrepareOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || !["--from", "--to"].includes(key) || values.has(key)) {
      throw new Error(`prepare 参数无效。\n\n${USAGE}`);
    }
    values.set(key, value);
  }
  if (!values.has("--from") || !values.has("--to") || args.length !== 4) {
    throw new Error(`prepare 必须同时提供 --from 和 --to。\n\n${USAGE}`);
  }
  return { from: values.get("--from"), to: values.get("--to") };
}

async function main(args) {
  const [command = "help", ...rest] = args;
  if (command === "help" || command === "--help" || command === "-h") {
    if (rest.length > 0) throw new Error(USAGE);
    console.log(USAGE);
    return;
  }
  if (command === "init") {
    if (rest.length > 0) throw new Error(USAGE);
    await initKeys();
    return;
  }
  if (command === "prepare") {
    await prepare(parsePrepareOptions(rest));
    return;
  }
  if (command === "serve") {
    if (rest.length > 0) throw new Error(USAGE);
    await serveLocalUpdates();
    return;
  }
  throw new Error(`未知命令：${command}\n\n${USAGE}`);
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedUrl === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  });
}
