#!/usr/bin/env bun

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const expectedVersion = process.argv[2]
  ?? JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
  ?? "0.0.0";

function currentTarget() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "win32" && arch === "x64") return { id: "windows-x64", exe: "skyagent.exe" };
  if (platform === "linux" && arch === "x64") return { id: "linux-x64", exe: "skyagent" };
  if (platform === "darwin" && arch === "x64") return { id: "darwin-x64", exe: "skyagent" };
  if (platform === "darwin" && arch === "arm64") return { id: "darwin-arm64", exe: "skyagent" };
  throw new Error(`Unsupported release smoke target for current host: ${platform}-${arch}`);
}

function runJson(exePath: string, args: string[]) {
  const proc = Bun.spawnSync([exePath, ...args], { cwd: root, stdout: "pipe", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`${path.basename(exePath)} ${args.join(" ")} failed with exit code ${proc.exitCode}`);
  }
  return JSON.parse(proc.stdout.toString());
}

const target = currentTarget();
const exePath = path.join(root, "dist", "release", target.id, target.exe);
if (!fs.existsSync(exePath)) {
  throw new Error(`Release executable was not found: ${exePath}`);
}

const version = runJson(exePath, ["version", "--json"]);
if (version.version !== expectedVersion) {
  throw new Error(`Expected release version ${expectedVersion}, got ${version.version ?? "unknown"}`);
}

const doctor = runJson(exePath, ["doctor", "--json"]);
if (!doctor.ok) {
  throw new Error("Release doctor check did not report ok=true");
}

console.log(JSON.stringify({
  ok: true,
  target: target.id,
  version: version.version,
  installPath: doctor.installPath,
}, null, 2));
