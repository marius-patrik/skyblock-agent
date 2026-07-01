import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const maxSkillNameLength = 64;
const allowedProperties = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
const requiredMetadata = ["display_name", "short_description", "default_prompt"] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function extractFrontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    fail("Invalid frontmatter format");
  }
  return match[1];
}

function assertScalar(value: unknown, message: string): string {
  if (typeof value !== "string") {
    fail(message);
  }
  return value.trim();
}

export function validateSkill(skillPath: string) {
  const skillMdPath = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    fail("SKILL.md not found");
  }

  const content = fs.readFileSync(skillMdPath, "utf8");
  if (!content.startsWith("---")) {
    fail("No YAML frontmatter found");
  }

  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(extractFrontmatter(content), { prettyErrors: false });
  } catch (error) {
    fail(`Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    fail("Frontmatter must be a YAML mapping");
  }

  const data = frontmatter as Record<string, unknown>;
  const unexpectedKeys = Object.keys(data).filter((key) => !allowedProperties.has(key));
  if (unexpectedKeys.length > 0) {
    fail(`Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys.sort().join(", ")}`);
  }

  if (!("name" in data)) {
    fail("Missing 'name' in frontmatter");
  }
  if (!("description" in data)) {
    fail("Missing 'description' in frontmatter");
  }
  if (!("metadata" in data)) {
    fail("Missing 'metadata' in frontmatter");
  }

  const name = assertScalar(data.name, "name must be a string");
  if (!/^[a-z0-9-]+$/.test(name)) {
    fail(`Name '${name}' should be hyphen-case (lowercase letters, digits, and hyphens only)`);
  }
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
    fail(`Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`);
  }
  if (name.length > maxSkillNameLength) {
    fail(`Name is too long (${name.length} characters). Maximum is ${maxSkillNameLength} characters.`);
  }

  const description = assertScalar(data.description, "description must be a string");
  if (!description) {
    fail("Description cannot be empty");
  }
  if (description.includes("<") || description.includes(">")) {
    fail("Description cannot contain angle brackets (< or >)");
  }
  if (description.length > 1024) {
    fail(`Description is too long (${description.length} characters). Maximum is 1024 characters.`);
  }

  const metadata = data.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    fail("metadata must be a mapping");
  }
  const metadataMap = metadata as Record<string, unknown>;
  for (const field of requiredMetadata) {
    if (!(field in metadataMap)) {
      fail(`Missing metadata field(s): ${field}`);
    }
    const value = assertScalar(metadataMap[field], `metadata.${field} must be a string`);
    if (!value) {
      fail(`metadata.${field} cannot be empty`);
    }
    if (value.includes("<") || value.includes(">")) {
      fail(`metadata.${field} cannot contain angle brackets (< or >)`);
    }
  }
  if (!assertScalar(metadataMap.default_prompt, "metadata.default_prompt must be a string").includes(`$${name}`)) {
    fail("metadata.default_prompt must mention the skill invocation name");
  }

  console.log("Skill is valid!");
}

if (import.meta.main) {
  const skillPath = Bun.argv[2];
  if (!skillPath) {
    fail("Usage: bun quick_validate_yaml.ts <skill_directory>");
  }
  validateSkill(skillPath);
}
