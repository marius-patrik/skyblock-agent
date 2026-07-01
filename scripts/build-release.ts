#!/usr/bin/env bun

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const outRoot = path.join(root, "dist", "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const targets = [
  { id: "windows-x64", bunTarget: "bun-windows-x64", exe: "skyagent.exe" },
  { id: "linux-x64", bunTarget: "bun-linux-x64", exe: "skyagent" },
  { id: "darwin-x64", bunTarget: "bun-darwin-x64", exe: "skyagent" },
  { id: "darwin-arm64", bunTarget: "bun-darwin-arm64", exe: "skyagent" },
];

function currentTarget() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  throw new Error(`Unsupported release target for current host: ${platform}-${arch}`);
}

function run(command: string[], cwd = root, env: NodeJS.ProcessEnv = process.env) {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  if (proc.exitCode !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}

function zipTarget(targetDir: string, zipPath: string) {
  fs.rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    run(
      [
        "powershell",
        "-NoProfile",
        "-Command",
        "$ErrorActionPreference = 'Stop'; Compress-Archive -Path (Join-Path $env:SKYAGENT_TARGET_DIR '*') -DestinationPath $env:SKYAGENT_ZIP_PATH -Force",
      ],
      root,
      { ...process.env, SKYAGENT_TARGET_DIR: targetDir, SKYAGENT_ZIP_PATH: zipPath },
    );
    return;
  }
  const zipCheck = Bun.spawnSync(["zip", "--version"], { stdout: "ignore", stderr: "ignore" });
  if (zipCheck.exitCode !== 0) {
    throw new Error("The zip CLI is required to build SkyAgent release archives on this platform.");
  }
  run(["zip", "-qr", zipPath, "."], targetDir);
}

function optionValue(name: string) {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = new Set(process.argv.slice(2));
const version = optionValue("--version") ?? packageJson.version ?? "0.0.0";
const selected = args.has("--current") ? [currentTarget()] : targets.map((target) => target.id);
fs.mkdirSync(outRoot, { recursive: true });

run(["bun", "run", "build:web"]);

for (const targetId of selected) {
  const target = targets.find((entry) => entry.id === targetId);
  if (!target) {
    throw new Error(`Unknown release target: ${targetId}`);
  }
  const targetDir = path.join(outRoot, target.id);
  const zipPath = path.join(outRoot, `skyagent-${target.id}.zip`);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  const outfile = path.join(targetDir, target.exe);
  run([
    "bun",
    "build",
    "--compile",
    "--target",
    target.bunTarget,
    "--define",
    `SKYAGENT_BUILD_VERSION=${JSON.stringify(version)}`,
    "--outfile",
    outfile,
    "./scripts/skyagent.ts",
  ]);
  fs.writeFileSync(path.join(targetDir, "VERSION"), `${version}\n`, "utf8");
  fs.writeFileSync(path.join(targetDir, "README.txt"), `SkyAgent ${version} ${target.id}\n\nRun:\n  ${target.exe} version\n  ${target.exe} doctor\n`, "utf8");
  zipTarget(targetDir, zipPath);
}

console.log(JSON.stringify({
  version,
  targets: selected,
  outDir: outRoot,
}, null, 2));
