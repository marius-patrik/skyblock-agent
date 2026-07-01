#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const outDir = path.join(root, "dist", "release");
const bumpOrder = { patch: 0, minor: 1, major: 2 };

function run(command: string[]) {
  const proc = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
  return proc.stdout.toString().trim();
}

function latestTag() {
  const proc = Bun.spawnSync(
    ["git", "describe", "--tags", "--match", "v[0-9]*.[0-9]*.[0-9]*", "--abbrev=0"],
    { cwd: root, stdout: "pipe", stderr: "ignore" },
  );
  return proc.exitCode === 0 ? proc.stdout.toString().trim() || null : null;
}

function parseVersion(tag: string | null) {
  if (!tag) return null;
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function nextVersion(previous: ReturnType<typeof parseVersion>, bump: "patch" | "minor" | "major") {
  if (!previous) return "1.0.0";
  if (bump === "major") return `${previous.major + 1}.0.0`;
  if (bump === "minor") return `${previous.major}.${previous.minor + 1}.0`;
  return `${previous.major}.${previous.minor}.${previous.patch + 1}`;
}

function eventJson() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  return JSON.parse(fs.readFileSync(eventPath, "utf8"));
}

function prNumberFromCommit() {
  const message = run(["git", "log", "-1", "--pretty=%B"]);
  const match = /(?:\(#|Merge pull request #)(\d+)/.exec(message);
  return match ? Number(match[1]) : null;
}

function prNumberFromGhCommit(commitSha = process.env.GITHUB_SHA) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = commitSha;
  if (!token || !repo || !sha) return null;
  try {
    const payload = run([
      "gh",
      "api",
      `repos/${repo}/commits/${sha}/pulls`,
      "-H",
      "Accept: application/vnd.github+json",
    ]);
    const pulls = JSON.parse(payload);
    return pulls[0]?.number ? Number(pulls[0].number) : null;
  } catch {
    return null;
  }
}

function prNumbersSince(tag: string | null) {
  const command = ["git", "log", "--format=%H%x09%s"];
  if (tag) {
    command.push(`${tag}..HEAD`);
  }
  const lines = run(command).split(/\r?\n/).filter(Boolean);
  const numbers = new Set<number>();

  for (const line of lines) {
    const [sha, subject = ""] = line.split("\t", 2);
    const match = /(?:\(#|Merge pull request #)(\d+)/.exec(subject);
    if (match) {
      numbers.add(Number(match[1]));
      continue;
    }
    const associated = prNumberFromGhCommit(sha);
    if (associated) {
      numbers.add(associated);
    }
  }

  return [...numbers];
}

function labelsFromGh(prNumber: number | null) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!prNumber || !token) return [];
  try {
    const payload = run(["gh", "pr", "view", String(prNumber), "--json", "labels"]);
    return JSON.parse(payload).labels?.map((label: { name: string }) => label.name) ?? [];
  } catch {
    return [];
  }
}

function releaseBump(labels: string[]): "patch" | "minor" | "major" {
  return labels.reduce<"patch" | "minor" | "major">((selected, label) => {
    if (label === "release:major" && bumpOrder.major > bumpOrder[selected]) return "major";
    if (label === "release:minor" && bumpOrder.minor > bumpOrder[selected]) return "minor";
    if (label === "release:patch" && bumpOrder.patch > bumpOrder[selected]) return "patch";
    return selected;
  }, "patch");
}

function writeOutput(values: Record<string, string | number | boolean | null>) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}`);
  fs.appendFileSync(output, `${lines.join("\n")}\n`, "utf8");
}

fs.mkdirSync(outDir, { recursive: true });

const event = eventJson();
const eventName = process.env.GITHUB_EVENT_NAME ?? "local";
const isPullRequest = eventName === "pull_request" || eventName === "pull_request_target";
const previousTag = latestTag();
const prNumbers = isPullRequest
  ? [Number(event?.pull_request?.number ?? 0)].filter(Boolean)
  : prNumbersSince(previousTag);
const prNumber = prNumbers[0] ?? (isPullRequest ? null : prNumberFromGhCommit() ?? prNumberFromCommit());
const labels = isPullRequest
  ? event?.pull_request?.labels?.map((label: { name: string }) => label.name) ?? []
  : prNumbers.flatMap((number) => labelsFromGh(number));
const bump = releaseBump(labels);
const version = nextVersion(parseVersion(previousTag), bump);
const tag = `v${version}`;
const publish = eventName === "push" && process.env.GITHUB_REF === "refs/heads/main";
const notes = [
  `# SkyAgent ${tag}`,
  "",
  `Bump: ${bump}`,
  `Previous tag: ${previousTag ?? "none"}`,
  prNumbers.length ? `Merged PRs: ${prNumbers.map((number) => `#${number}`).join(", ")}` : "Merged PRs: none detected",
  `Commit: ${process.env.GITHUB_SHA ?? run(["git", "rev-parse", "HEAD"])}`,
  "",
  "Artifacts:",
  "- Cross-platform standalone archives",
  "- SHA256SUMS.txt",
  "- update.json",
  "",
];

const notesPath = path.join(outDir, "RELEASE_NOTES.md");
fs.writeFileSync(notesPath, notes.join("\n"), "utf8");

const plan = { version, tag, bump, previousTag, prNumber, prNumbers, labels, publish, notesPath };
fs.writeFileSync(path.join(outDir, "release-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
writeOutput({
  version,
  tag,
  bump,
  previous_tag: previousTag,
  pr_number: prNumber,
  publish,
  notes_path: notesPath,
});
console.log(JSON.stringify(plan, null, 2));
