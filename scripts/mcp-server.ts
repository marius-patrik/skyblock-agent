#!/usr/bin/env bun

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const runtimeNodeModulesDir = path.join(repoRoot, ".codex-plugin", "runtime", "modules", "node_modules");
const rootNodeModulesDir = path.join(repoRoot, "node_modules");
const require = createRequire(import.meta.url);

function readPackageExports(packageName: string) {
  const packageJsonPath = path.join(runtimeNodeModulesDir, ...packageName.split("/"), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!packageJson.exports || typeof packageJson.exports !== "object") {
    throw new Error(`${packageName} runtime package exports are missing`);
  }
  return packageJson.exports as Record<string, string>;
}

function writeSkyAgentPackageShim(packageName: "@skyagent/core" | "@skyagent/mcp") {
  const targetDir = path.join(rootNodeModulesDir, ...packageName.split("/"));
  const runtimePackageDir = path.join(runtimeNodeModulesDir, ...packageName.split("/"));
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const exports = readPackageExports(packageName);
  for (const target of Object.values(exports)) {
    const fileName = target.replace(/^\.\//, "");
    const runtimeTarget = path.join(runtimePackageDir, ...fileName.split("/"));
    const relativeTarget = path.relative(targetDir, runtimeTarget).replaceAll(path.sep, "/");
    fs.writeFileSync(path.join(targetDir, fileName), `export * from "./${relativeTarget}";\n`);
  }

  fs.writeFileSync(path.join(targetDir, "package.json"), `${JSON.stringify({
    name: packageName,
    version: "0.1.0",
    type: "module",
    private: true,
    exports,
  }, null, 2)}\n`);
}

function writePrismarineNbtShim() {
  const targetDir = path.join(rootNodeModulesDir, "prismarine-nbt");
  const runtimeNbtPath = path.join(runtimeNodeModulesDir, "prismarine-nbt", "nbt.js");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  const relativeTarget = path.relative(targetDir, runtimeNbtPath).replaceAll(path.sep, "/");
  fs.writeFileSync(path.join(targetDir, "nbt.js"), `module.exports = require("./${relativeTarget}");\n`);
  fs.writeFileSync(path.join(targetDir, "package.json"), `${JSON.stringify({
    name: "prismarine-nbt",
    version: "0.0.0-skyagent-runtime",
    private: true,
    main: "./nbt.js",
    exports: {
      ".": "./nbt.js",
      "./nbt.js": "./nbt.js",
    },
  }, null, 2)}\n`);
}

function prepareRuntimeShims() {
  writeSkyAgentPackageShim("@skyagent/core");
  writeSkyAgentPackageShim("@skyagent/mcp");
  writePrismarineNbtShim();
}

function canResolveRuntimePackages() {
  try {
    require.resolve("@skyagent/core/sections");
    require.resolve("@skyagent/mcp");
    require.resolve("prismarine-nbt");
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes("--prepare-runtime-shims")) {
  prepareRuntimeShims();
  process.exit(0);
}

if (process.argv.includes("--cache-runtime") && !canResolveRuntimePackages()) {
  prepareRuntimeShims();
}

const { startMcpServer } = await import("@skyagent/mcp");
startMcpServer();
