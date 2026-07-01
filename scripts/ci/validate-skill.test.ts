import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "bun:test";
import { discoverSkillFolders } from "./validate-skill.ts";

let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

function makeTempRoot() {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-skill-discovery-"));
  return tempRoot;
}

test("discovers multiple skill folders in sorted order", () => {
  const root = makeTempRoot();
  fs.mkdirSync(path.join(root, "skyagent-zeta"), { recursive: true });
  fs.mkdirSync(path.join(root, "hypixel-skyblock"), { recursive: true });
  fs.writeFileSync(path.join(root, "README.md"), "not a skill folder\n", "utf8");

  expect(discoverSkillFolders(root)).toEqual(["hypixel-skyblock", "skyagent-zeta"]);
});

function writeSkill(root: string, frontmatter: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "SKILL.md"),
    `---\n${frontmatter}---\n\n# Test Skill\n\nThis body is intentionally long enough for skill validation fixtures.\n`,
    "utf8",
  );
}

function runQuickValidate(skillPath: string) {
  const script = path.join(process.cwd(), "scripts", "ci", "quick_validate.py");
  let missingInterpreter: Error | undefined;
  for (const command of ["python", "python3"]) {
    const result = spawnSync(command, [script, skillPath], { encoding: "utf8" });
    if (!result.error) {
      return result;
    }
    missingInterpreter = result.error;
  }
  throw missingInterpreter ?? new Error("No Python interpreter found");
}

test("quick validator rejects missing metadata", () => {
  const root = makeTempRoot();
  const skillPath = path.join(root, "skyagent-test");
  writeSkill(skillPath, [
    "name: skyagent-test",
    "description: Validate that required metadata is enforced for every skill.",
    "",
  ].join("\n"));

  const result = runQuickValidate(skillPath);

  expect(result.status).toBe(1);
  expect(`${result.stdout}${result.stderr}`).toContain("Missing 'metadata'");
});

test("quick validator rejects malformed YAML frontmatter", () => {
  const root = makeTempRoot();
  const skillPath = path.join(root, "skyagent-test");
  writeSkill(skillPath, [
    "name: skyagent-test",
    "description: Validate that malformed YAML cannot pass as scalar text.",
    "metadata:",
    "  display_name: [unterminated",
    "  short_description: \"Validate skill metadata.\"",
    "  default_prompt: \"Use $skyagent-test to validate skill metadata.\"",
    "",
  ].join("\n"));

  const result = runQuickValidate(skillPath);

  expect(result.status).toBe(1);
  expect(`${result.stdout}${result.stderr}`).toContain("Invalid YAML frontmatter");
});

test("quick validator accepts required metadata", () => {
  const root = makeTempRoot();
  const skillPath = path.join(root, "skyagent-test");
  writeSkill(skillPath, [
    "name: skyagent-test",
    "description: Validate that required metadata is enforced for every skill.",
    "metadata:",
    "  display_name: \"SkyAgent Test\"",
    "  short_description: \"Validate skill metadata.\"",
    "  default_prompt: \"Use $skyagent-test to validate skill metadata.\"",
    "",
  ].join("\n"));

  const result = runQuickValidate(skillPath);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Skill is valid");
});
