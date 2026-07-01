import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, ".codex-plugin", "plugin.json");

function fail(message: string): never {
  console.error(`Plugin validation failed: ${message}`);
  process.exit(1);
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

console.log("Plugin validation passed");

