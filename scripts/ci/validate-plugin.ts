import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { preparePluginRuntime } from "../prepare-plugin-runtime";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, ".codex-plugin", "plugin.json");
const pluginRuntimeModulesDir = path.join(repoRoot, ".codex-plugin", "runtime", "modules");
const pluginRuntimeRootNodeModulesDir = path.join(repoRoot, ".codex-plugin", "runtime", "root-node_modules");
const preparedPluginRuntimePaths = [
  path.join(pluginRuntimeModulesDir, "node_modules", "@skyagent", "core"),
  path.join(pluginRuntimeModulesDir, "node_modules", "@skyagent", "mcp"),
  path.join(pluginRuntimeModulesDir, "node_modules", "prismarine-nbt"),
  path.join(pluginRuntimeModulesDir, "node_modules", "protodef"),
  path.join(pluginRuntimeModulesDir, "node_modules", "protodef-validator"),
  path.join(pluginRuntimeModulesDir, "node_modules", "ajv"),
  path.join(pluginRuntimeModulesDir, "node_modules", "readable-stream"),
];
const requiredPreparedRuntimeFiles = [
  ".codex-plugin/runtime/modules/package.json",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/package.json",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/sections.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/src/sections/index.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/inventory.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/src/inventory.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/mcp/package.json",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/mcp/index.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/mcp/src/index.ts",
  ".codex-plugin/runtime/modules/node_modules/prismarine-nbt/compound.js",
  ".codex-plugin/runtime/modules/node_modules/prismarine-nbt/nbt.js",
  ".codex-plugin/runtime/modules/node_modules/prismarine-nbt/nbt.json",
  ".codex-plugin/runtime/modules/node_modules/protodef/src/compiler.js",
  ".codex-plugin/runtime/modules/node_modules/protodef/src/protodef.js",
  ".codex-plugin/runtime/modules/node_modules/protodef-validator/index.js",
  ".codex-plugin/runtime/modules/node_modules/ajv/lib/ajv.js",
  ".codex-plugin/runtime/modules/node_modules/ajv/lib/dotjs/validate.js",
  ".codex-plugin/runtime/modules/node_modules/ajv/lib/refs/data.json",
  ".codex-plugin/runtime/modules/node_modules/fast-deep-equal/index.js",
  ".codex-plugin/runtime/modules/node_modules/fast-json-stable-stringify/index.js",
  ".codex-plugin/runtime/modules/node_modules/json-schema-traverse/index.js",
  ".codex-plugin/runtime/modules/node_modules/lodash.reduce/index.js",
  ".codex-plugin/runtime/modules/node_modules/process/index.js",
  ".codex-plugin/runtime/modules/node_modules/readable-stream/lib/stream.js",
  ".codex-plugin/runtime/modules/node_modules/readable-stream/lib/internal/streams/duplexify.js",
  ".codex-plugin/runtime/modules/node_modules/safe-buffer/index.js",
  ".codex-plugin/runtime/modules/node_modules/string_decoder/lib/string_decoder.js",
  ".codex-plugin/runtime/modules/node_modules/uri-js/dist/es5/uri.all.js",
];

function fail(message: string): never {
  console.error(`Plugin validation failed: ${message}`);
  process.exit(1);
}

function listFiles(root: string) {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        fail(`${relativePath} in prepared plugin runtime must be a regular file or directory`);
      }
    }
  };
  visit(root);
  return files.sort();
}

function assertSameFileTree(actualRoot: string, expectedRoot: string, label: string) {
  const actualFiles = listFiles(actualRoot);
  const expectedFiles = listFiles(expectedRoot);
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedSet.has(file));
  if (missing.length > 0 || extra.length > 0) {
    fail(`${label} is stale; missing generated files: ${missing.slice(0, 10).join(", ") || "none"}; extra committed files: ${extra.slice(0, 10).join(", ") || "none"}`);
  }

  for (const relativePath of expectedFiles) {
    const actual = fs.readFileSync(path.join(actualRoot, ...relativePath.split("/")));
    const expected = fs.readFileSync(path.join(expectedRoot, ...relativePath.split("/")));
    if (!actual.equals(expected)) {
      fail(`${label} is stale; ${relativePath} differs from generated runtime output`);
    }
  }
}

function copyPathForProbe(probeRoot: string, relativePath: string) {
  const source = path.join(repoRoot, ...relativePath.split("/"));
  const target = path.join(probeRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => path.relative(source, sourcePath).split(path.sep)[0] !== "node_modules",
  });
}

function runIsolatedCacheProbe() {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-plugin-probe-"));
  try {
    for (const relativePath of [
      ".codex-plugin",
      ".mcp.json",
      "package.json",
      "scripts/mcp-server.ts",
    ]) {
      copyPathForProbe(probeRoot, relativePath);
    }
    const prepareResult = spawnSync("bun", ["./scripts/mcp-server.ts", "--prepare-runtime-shims"], {
      cwd: probeRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (prepareResult.status !== 0) {
      fail(`isolated cache probe could not materialize root runtime shims\n${prepareResult.stdout}\n${prepareResult.stderr}`);
    }
    if (fs.existsSync(path.join(probeRoot, "packages"))) {
      fail("isolated no-node_modules import probe must not copy packages");
    }
    const rootNodeModulesEntries = fs.readdirSync(path.join(probeRoot, "node_modules")).sort();
    if (rootNodeModulesEntries.join(",") !== "@skyagent,prismarine-nbt") {
      fail(`isolated cache probe copied unexpected root node_modules entries: ${rootNodeModulesEntries.join(", ")}`);
    }
    const skyagentEntries = fs.readdirSync(path.join(probeRoot, "node_modules", "@skyagent")).sort();
    if (skyagentEntries.join(",") !== "core,mcp") {
      fail(`isolated cache probe copied unexpected @skyagent entries: ${skyagentEntries.join(", ")}`);
    }

    const importProbe = [
      'await import("@skyagent/core/sections");',
      'await import("@skyagent/core/inventory");',
      'const nbt = await import("prismarine-nbt");',
      'if (typeof nbt.parse !== "function") throw new Error("missing prismarine-nbt parse");',
    ].join(" ");
    const importResult = spawnSync("bun", ["-e", importProbe], {
      cwd: probeRoot,
      encoding: "utf8",
    });
    if (importResult.status !== 0) {
      fail(`isolated no-node_modules import probe failed\n${importResult.stdout}\n${importResult.stderr}`);
    }

    const mcpInput = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "skyagent-ci", version: "0.0.0" } } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      "",
    ].join("\n");
    const mcpResult = spawnSync("bun", ["./scripts/mcp-server.ts", "--cache-runtime"], {
      cwd: probeRoot,
      encoding: "utf8",
      input: mcpInput,
      timeout: 10_000,
    });
    if (mcpResult.status !== 0) {
      fail(`isolated no-node_modules MCP probe failed\n${mcpResult.stdout}\n${mcpResult.stderr}`);
    }
    for (const toolName of [
      "skyagent_context_bootstrap",
      "skyagent_context_refresh",
      "skyagent_server_status",
      "skyblock_progression",
    ]) {
      if (!mcpResult.stdout.includes(toolName)) {
        fail(`isolated no-node_modules MCP probe did not list ${toolName}`);
      }
    }
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }
}

function assertPreparedRuntimeFresh() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-plugin-runtime-"));
  try {
    const generatedModulesDir = path.join(tempRoot, ".codex-plugin", "runtime", "modules");
    const generatedRuntimeRootNodeModulesDir = path.join(tempRoot, ".codex-plugin", "runtime", "root-node_modules");
    preparePluginRuntime(generatedModulesDir, {
      runtimeRootNodeModulesDir: generatedRuntimeRootNodeModulesDir,
      writeRootShims: true,
    });
    assertSameFileTree(pluginRuntimeModulesDir, generatedModulesDir, ".codex-plugin/runtime/modules");
    assertSameFileTree(pluginRuntimeRootNodeModulesDir, generatedRuntimeRootNodeModulesDir, ".codex-plugin/runtime/root-node_modules");
  } catch (error) {
    if (error instanceof Error) {
      fail(`prepare-plugin-runtime freshness check failed\n${error.message}`);
    }
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertStoredRootRuntimeUsable() {
  const storedProbe = [
    'await import("./.codex-plugin/runtime/root-node_modules/@skyagent/core/sections.ts");',
    'await import("./.codex-plugin/runtime/root-node_modules/@skyagent/core/inventory.ts");',
    'const nbt = await import("./.codex-plugin/runtime/root-node_modules/prismarine-nbt/nbt.js");',
    'if (typeof nbt.parse !== "function" && typeof nbt.default?.parse !== "function") throw new Error("missing stored prismarine-nbt parse");',
  ].join(" ");
  const result = spawnSync("bun", ["-e", storedProbe], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`stored root runtime payload probe failed\n${result.stdout}\n${result.stderr}`);
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${name} must be a non-empty string`);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assertString(manifest.name, "name");
assertString(manifest.version, "version");
assertString(manifest.description, "description");

if (manifest.name !== "skyagent") {
  fail("name must be skyagent");
}

if (manifest.skills !== "./skills/") {
  fail("skills must point to ./skills/");
}

if (manifest.mcpServers !== "./.mcp.json") {
  fail("mcpServers must point to ./.mcp.json");
}

if (!manifest.interface || typeof manifest.interface !== "object") {
  fail("interface object is required");
}

assertString(manifest.interface.displayName, "interface.displayName");
assertString(manifest.interface.shortDescription, "interface.shortDescription");
assertString(manifest.interface.longDescription, "interface.longDescription");
assertString(manifest.interface.developerName, "interface.developerName");
assertString(manifest.interface.category, "interface.category");
assertString(manifest.interface.defaultPrompt, "interface.defaultPrompt");

if (!Array.isArray(manifest.interface.capabilities)) {
  fail("interface.capabilities must be an array");
}

for (const relativePath of [manifest.skills, manifest.mcpServers]) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`${relativePath} does not exist`);
  }
}

for (const preparedPath of preparedPluginRuntimePaths) {
  if (!fs.existsSync(path.join(preparedPath, "package.json"))) {
    fail(`${path.relative(repoRoot, preparedPath)} package shim was not prepared`);
  }
  if (fs.lstatSync(preparedPath).isSymbolicLink()) {
    fail(`${path.relative(repoRoot, preparedPath)} must be a real source-controlled runtime directory so Codex plugin cache copies it`);
  }
}

for (const relativePath of requiredPreparedRuntimeFiles) {
  if (!fs.existsSync(path.join(repoRoot, ...relativePath.split("/")))) {
    fail(`${relativePath} is missing from the prepared plugin runtime`);
  }
}
for (const relativePath of [
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/sections.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/core/inventory.ts",
  ".codex-plugin/runtime/modules/node_modules/@skyagent/mcp/index.ts",
]) {
  const source = fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8");
  if (source.includes("../../../../../packages/")) {
    fail(`${relativePath} must not import from the source checkout`);
  }
}

assertPreparedRuntimeFresh();
assertStoredRootRuntimeUsable();
runIsolatedCacheProbe();

if (fs.existsSync(path.join(repoRoot, "packages", "mcmod"))) {
  fail("packages/mcmod is deferred; do not add Fabric mod implementation without an explicit implementation issue");
}

const architectureDoc = fs.readFileSync(path.join(repoRoot, "docs", "product-architecture.md"), "utf8");
for (const expected of [
  "Future Minecraft Mod Telemetry Ingress",
  "producer of typed context events",
  "typed `skyagent.contextEvent` records",
  "auth/localhost boundaries",
  "require exposing the gateway publicly",
  "127.0.0.1",
  "local bearer token",
  "inventory delta",
  "purse delta",
  "minecraft.location_update",
  "minecraft.inventory_delta",
  "purseDelta",
  "active objective progress",
  "minecraft.objective_progress",
  "minecraft.chat_signal",
  "minecraft.terminal_session",
  "Terminal passthrough",
  "No `packages/mcmod` or Fabric implementation is added",
  "Mod implementation is deferred until explicit user instruction",
  "does not implement the Fabric mod",
]) {
  if (!architectureDoc.includes(expected)) {
    fail(`docs/product-architecture.md must mention ${expected}`);
  }
}

const agentsDoc = fs.readFileSync(path.join(repoRoot, ".agents", "AGENTS.md"), "utf8");
for (const expected of [
  "Documentation-only issues may define future contracts",
  "must not add `packages/mcmod`",
  "Mod implementation is deferred until explicit user instruction",
  "not Fabric implementation",
]) {
  if (!agentsDoc.includes(expected)) {
    fail(`.agents/AGENTS.md must mention ${expected}`);
  }
}

const mcp = JSON.parse(fs.readFileSync(path.join(repoRoot, ".mcp.json"), "utf8"));
const server = mcp.mcpServers?.skyagent;
if (!server) {
  fail(".mcp.json must define mcpServers.skyagent");
}

if (server.command !== "bun") {
  fail("mcpServers.skyagent.command must be bun");
}

if (!Array.isArray(server.args) || !server.args.includes("./scripts/mcp-server.ts")) {
  fail("mcpServers.skyagent.args must include ./scripts/mcp-server.ts");
}

if (!server.args.includes("--cache-runtime")) {
  fail("mcpServers.skyagent.args must include --cache-runtime");
}

console.log("Plugin validation passed");

