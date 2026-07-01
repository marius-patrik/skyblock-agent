import fs from "node:fs";
import path from "node:path";

const skillsRoot = path.join(process.cwd(), "skills");

function fail(message: string): never {
  console.error(`Skill validation failed: ${message}`);
  process.exit(1);
}

function skillFolders() {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function validateOpenAiYaml(folder: string) {
  const metadataPath = path.join(skillsRoot, folder, "agents", "openai.yaml");
  if (!fs.existsSync(metadataPath)) {
    fail(`${folder}: agents/openai.yaml is required`);
  }
  const text = fs.readFileSync(metadataPath, "utf8");
  for (const required of ["interface:", "display_name:", "short_description:", "default_prompt:", "policy:", "allow_implicit_invocation:"]) {
    if (!text.includes(required)) {
      fail(`${folder}: agents/openai.yaml must include ${required}`);
    }
  }
  if (!text.includes(`$${folder}`)) {
    fail(`${folder}: default_prompt must mention $${folder}`);
  }
}

function validateSkill(folder: string) {
  const skillPath = path.join(skillsRoot, folder, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    fail(`${folder}: SKILL.md is required`);
  }
  const text = fs.readFileSync(skillPath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    fail(`${folder}: SKILL.md must start with YAML frontmatter`);
  }

  const frontmatter = match[1];
  const body = match[2];
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();

  if (name !== folder) {
    fail(`${folder}: frontmatter name must match folder name`);
  }
  if (!description || description.length < 40) {
    fail(`${folder}: frontmatter description must be present and descriptive`);
  }
  if (body.trim().length < 120) {
    fail(`${folder}: SKILL.md body is too short`);
  }
  validateOpenAiYaml(folder);
}

const folders = skillFolders();
if (folders.length === 0) {
  fail("no skill folders found");
}

for (const folder of folders) {
  validateSkill(folder);
}

const broadSkill = fs.readFileSync(path.join(skillsRoot, "hypixel-skyblock", "SKILL.md"), "utf8");
for (const expected of [
  "skyblock_profile_overview",
  "Do not store secrets in memories",
  "$skyagent-profile-api",
  "$skyagent-inventory-items",
  "$skyagent-economy",
  "$skyagent-accessories",
  "$skyagent-progression",
  "$skyagent-planning",
  "$skyagent-provider-maintenance",
]) {
  if (!broadSkill.includes(expected)) {
    fail(`hypixel-skyblock must mention ${expected}`);
  }
}

const profileSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-profile-api", "SKILL.md"), "utf8");
for (const expected of [
  "hypixel_status",
  "api_disabled",
  "missing_profile",
  "missing_member",
  "online/status checks",
  "rate-limit",
  "HYPIXEL_API_KEY",
]) {
  if (!profileSkill.includes(expected)) {
    fail(`skyagent-profile-api must mention ${expected}`);
  }
}

console.log(`Skill validation passed (${folders.length} skills)`);
