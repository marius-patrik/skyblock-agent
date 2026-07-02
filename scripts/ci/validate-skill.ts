import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const skillsRoot = path.join(process.cwd(), "skills");
const quickValidatePath = path.join(process.cwd(), "scripts", "ci", "quick_validate.py");

function fail(message: string): never {
  console.error(`Skill validation failed: ${message}`);
  process.exit(1);
}

export function discoverSkillFolders(root = skillsRoot) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function runQuickValidate(folder: string) {
  if (!fs.existsSync(quickValidatePath)) {
    fail(`skill quick validator not found: ${quickValidatePath}`);
  }

  const skillPath = path.join(skillsRoot, folder);
  const attempts = [
    ["python", quickValidatePath, skillPath],
    ["python3", quickValidatePath, skillPath],
  ];
  const errors: string[] = [];

  for (const [command, ...args] of attempts) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.error) {
      errors.push(`${command}: ${result.error.message}`);
      continue;
    }
    if (result.status === 0) {
      return;
    }
    errors.push(`${command}: ${result.stderr || result.stdout}`.trim());
  }

  fail(`${folder}: quick_validate.py failed\n${errors.join("\n")}`);
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

function parseSkillMetadata(frontmatter: string) {
  const metadataMatch = frontmatter.match(/^metadata:\r?\n((?:[ \t]+[^\r\n]+\r?\n?)*)/m);
  if (!metadataMatch) {
    fail("SKILL.md frontmatter must include metadata");
  }

  const metadata = new Map<string, string>();
  for (const line of metadataMatch[1].split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (!match) {
      fail(`invalid metadata line: ${line}`);
    }
    metadata.set(match[1], match[2].replace(/^["']|["']$/g, "").trim());
  }

  return metadata;
}

function readOpenAiMetadata(folder: string) {
  const metadataPath = path.join(skillsRoot, folder, "agents", "openai.yaml");
  const text = fs.readFileSync(metadataPath, "utf8");
  const metadata = new Map<string, string>();
  for (const key of ["display_name", "short_description", "default_prompt"]) {
    const value = text.match(new RegExp(`^\\s+${key}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1]?.trim();
    if (!value) {
      fail(`${folder}: agents/openai.yaml must include interface.${key}`);
    }
    metadata.set(key, value);
  }
  return metadata;
}

function validateSkill(folder: string) {
  runQuickValidate(folder);

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

  const skillMetadata = parseSkillMetadata(frontmatter);
  const openAiMetadata = readOpenAiMetadata(folder);
  for (const key of ["display_name", "short_description", "default_prompt"]) {
    const skillValue = skillMetadata.get(key);
    const openAiValue = openAiMetadata.get(key);
    if (!skillValue) {
      fail(`${folder}: frontmatter metadata.${key} is required`);
    }
    if (skillValue !== openAiValue) {
      fail(`${folder}: frontmatter metadata.${key} must match agents/openai.yaml`);
    }
  }
}

function validatePluginSkillPath() {
  const manifestPath = path.join(process.cwd(), ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.skills !== "./skills/") {
    fail("plugin manifest skills must point to ./skills/");
  }
}

export function validateSkills() {
  const folders = discoverSkillFolders();
  if (folders.length === 0) {
    fail("no skill folders found");
  }

  validatePluginSkillPath();

  for (const folder of folders) {
    validateSkill(folder);
  }

  const broadSkill = fs.readFileSync(path.join(skillsRoot, "hypixel-skyblock", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_profile_overview",
  "Do not store secrets in memories",
  "$skyagent-profile-api",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  "$skyagent-inventory-items",
  "$skyagent-economy",
  "$skyagent-accessories",
  "$skyagent-progression",
  "$skyagent-readiness-weight",
  "$skyagent-planning",
  "$skyagent-provider-maintenance",
  ]) {
    if (!broadSkill.includes(expected)) {
      fail(`hypixel-skyblock must mention ${expected}`);
    }
  }

  const contextSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-context-engine", "SKILL.md"), "utf8");
  for (const expected of [
  "skyagent_start",
  "skyagent_context_bootstrap",
  "skyagent_context_get",
  "skyagent_context_refresh",
  "skyblock_profile_snapshot",
  "skyagent_objective_list",
  "skyagent_server_status",
  "$skyagent-live-progress",
  "$skyagent-objectives",
  "Do not store API keys or secrets",
  ]) {
    if (!contextSkill.includes(expected)) {
      fail(`skyagent-context-engine must mention ${expected}`);
    }
  }

  const objectivesSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-objectives", "SKILL.md"), "utf8");
  for (const expected of [
  "skyagent_objective_list",
  "persistObjectives: true",
  "skyagent_objective_create",
  "skyagent_objective_update",
  "skyagent_objective_complete",
  "skyagent_objective_delete",
  "buy-list",
  "source-item",
  "snipe targets",
  "$skyagent-context-engine",
  "$skyagent-live-progress",
  "Do not write objectives during preview-only planning",
  ]) {
    if (!objectivesSkill.includes(expected)) {
      fail(`skyagent-objectives must mention ${expected}`);
    }
  }

  const liveProgressSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-live-progress", "SKILL.md"), "utf8");
  for (const expected of [
  "agent.session_start",
  "skyagent_context_events",
  "skyagent_context_watch",
  "skyagent_context_event_emit",
  "skyagent_server_status",
  "hypixel.server_status_change",
  "provider.cache_status",
  "provider.cache_status_change",
  "provider/cache",
  "future Minecraft mod telemetry",
  "$skyagent-objectives",
  "$skyagent-context-engine",
  "Do not implement Minecraft mod behavior",
  ]) {
    if (!liveProgressSkill.includes(expected)) {
      fail(`skyagent-live-progress must mention ${expected}`);
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
  "$skyagent-context-engine",
  "$skyagent-live-progress",
  "$skyagent-objectives",
  ]) {
    if (!profileSkill.includes(expected)) {
      fail(`skyagent-profile-api must mention ${expected}`);
    }
  }

  const inventorySkill = fs.readFileSync(path.join(skillsRoot, "skyagent-inventory-items", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_inventory",
  "skyblock_inventory_section",
  "skyblock_item_dump",
  "skyblock_normalized_items",
  "skyblock_item_metadata",
  "accessory bag item dumps",
  "corrupt NBT",
  "disabled inventory API",
  "partial profile data",
  "item metadata is unavailable",
  "$skyagent-context-engine",
  "$skyagent-live-progress",
  "$skyagent-objectives",
  ]) {
    if (!inventorySkill.includes(expected)) {
      fail(`skyagent-inventory-items must mention ${expected}`);
    }
  }

  const economySkill = fs.readFileSync(path.join(skillsRoot, "skyagent-economy", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_price",
  "skyblock_lowest_bin",
  "skyblock_price_history",
  "skyblock_networth",
  "skyblock_item_networth",
  "provider freshness",
  "stale-cache",
  "third-party uncertainty",
  "market volatility",
  "Do not invent prices",
  "Do not add unknown prices into networth totals",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  ]) {
    if (!economySkill.includes(expected)) {
      fail(`skyagent-economy must mention ${expected}`);
    }
  }

  const accessoriesSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-accessories", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_accessories",
  "skyblock_missing_accessories",
  "skyblock_accessory_upgrades",
  "skyblock_networth",
  "skyblock_item_networth",
  "full sectioned networth",
  "Magical Power",
  "budget-constrained coin-per-MP",
  "missing-price",
  "over-budget",
  "provider confidence",
  "stale-cache warnings",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  ]) {
    if (!accessoriesSkill.includes(expected)) {
      fail(`skyagent-accessories must mention ${expected}`);
    }
  }

  const progressionSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-progression", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_profile_section",
  "skyblock_progression",
  "$skyagent-readiness-weight",
  "Catacombs",
  "Bestiary",
  "Collections",
  "Minions",
  "Museum",
  "Mining/HotM",
  "Crimson Isle/Kuudra",
  "Rift",
  "Trophy Fishing",
  "Essence",
  "currencies",
  "unlocks",
  "missing-data limits",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  ]) {
    if (!progressionSkill.includes(expected)) {
      fail(`skyagent-progression must mention ${expected}`);
    }
  }

  const readinessSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-readiness-weight", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_weight",
  "skyblock_readiness",
  "Senither/Lily-style",
  "unsupported exact formulas",
  "formula freshness",
  "dungeons",
  "slayer",
  "kuudra",
  "garden",
  "mining",
  "Verify current external meta",
  "missing-data warnings",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  ]) {
    if (!readinessSkill.includes(expected)) {
      fail(`skyagent-readiness-weight must mention ${expected}`);
    }
  }

  const planningSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-planning", "SKILL.md"), "utf8");
  for (const expected of [
  "skyblock_plan_goal",
  "skyblock_next_upgrades",
  "daily/weekly routes",
  "budget-constrained recommendations",
  "skyblock_profile_overview",
  "skyblock_progression",
  "skyblock_readiness",
  "skyblock_networth",
  "skyblock_accessories",
  "skyblock_price",
  "$skyagent-provider-maintenance",
  "$skyagent-context-engine",
  "$skyagent-objectives",
  "$skyagent-live-progress",
  "expected impact",
  "cost/time estimate",
  "source freshness",
  "what to skip",
  ]) {
    if (!planningSkill.includes(expected)) {
      fail(`skyagent-planning must mention ${expected}`);
    }
  }

  const providerSkill = fs.readFileSync(path.join(skillsRoot, "skyagent-provider-maintenance", "SKILL.md"), "utf8");
  for (const expected of [
  "patch notes",
  "wiki pages",
  "NEU",
  "SkyHelper",
  "CoflNet",
  "parity drift",
  "skyblock_resource",
  "skyblock_news",
  "Verify live web/wiki/provider data",
  "stale-cache warnings",
  "docs/parity.md",
  "skyagent_server_status",
  "skyagent_context_events",
  "provider.cache_status",
  "provider.cache_status_change",
  "$skyagent-context-engine",
  "$skyagent-live-progress",
  ]) {
    if (!providerSkill.includes(expected)) {
      fail(`skyagent-provider-maintenance must mention ${expected}`);
    }
  }

  console.log(`Skill validation passed (${folders.length} skills)`);
}

if (import.meta.main) {
  validateSkills();
}
