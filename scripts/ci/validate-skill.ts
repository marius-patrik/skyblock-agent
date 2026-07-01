import fs from "node:fs";
import path from "node:path";

const skillPath = path.join(process.cwd(), "skills", "hypixel-skyblock", "SKILL.md");
const text = fs.readFileSync(skillPath, "utf8");

function fail(message: string): never {
  console.error(`Skill validation failed: ${message}`);
  process.exit(1);
}

const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!match) {
  fail("SKILL.md must start with YAML frontmatter");
}

const frontmatter = match[1];
const body = match[2];

const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();

if (name !== "hypixel-skyblock") {
  fail("frontmatter name must be hypixel-skyblock");
}

if (!description || description.length < 40) {
  fail("frontmatter description must be present and descriptive");
}

if (!body.includes("## SkyAgent Tooling")) {
  fail("SKILL.md must document SkyAgent Tooling");
}

if (!body.includes("skyblock_profile_overview")) {
  fail("SKILL.md must mention skyblock_profile_overview");
}

if (!body.includes("Do not store secrets in memories")) {
  fail("SKILL.md must include secret-storage guidance");
}

console.log("Skill validation passed");

