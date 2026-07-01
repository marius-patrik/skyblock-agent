#!/usr/bin/env bun

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const outDir = path.join(root, "dist", "release");
const version = process.argv[2];

if (!version) {
  throw new Error("Usage: bun ./scripts/write-release-metadata.ts <version>");
}

const tag = `v${version}`;
const zipFiles = fs.readdirSync(outDir)
  .filter((entry) => /^skyagent-.+\.zip$/.test(entry))
  .sort();

if (!zipFiles.length) {
  throw new Error(`No release archives found in ${outDir}`);
}

const assets = zipFiles.map((fileName) => {
  const filePath = path.join(outDir, fileName);
  const bytes = fs.readFileSync(filePath);
  return {
    name: fileName,
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});

const checksums = assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n");
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), `${checksums}\n`, "utf8");

fs.writeFileSync(path.join(outDir, "update.json"), `${JSON.stringify({
  version,
  tag,
  generatedAt: new Date().toISOString(),
  assets,
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ version, tag, assets }, null, 2));
