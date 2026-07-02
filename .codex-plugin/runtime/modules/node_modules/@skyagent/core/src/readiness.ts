import { fetchProfileContext } from "./profile.ts";
import { catacombsLevelFromXp, gardenLevelFromXp, hotmLevelFromXp, normalizeSectionName, skillLevelFromXp, slayerLevelFromXp } from "./progression.ts";

export const READINESS_AREAS = ["dungeons", "slayer", "kuudra", "garden", "mining"] as const;

const VERIFIED_AT = "2026-07-01";

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function entries(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function sumNumbers(value: any) {
  return entries(value).reduce((total, [, amount]) => total + numberValue(amount), 0);
}

function warning(code: string, message: string, sourcePath?: string) {
  return { code, message, sourcePath };
}

function scoreCheck(name: string, passed: boolean, actual: any, target: any, sourceField: string) {
  return { name, passed, actual, target, sourceField };
}

function ratingFromChecks(checks: Array<{ passed: boolean }>, warnings: any[]) {
  if (warnings.some((entry) => entry.code === "missing_api_data")) {
    return "unknown";
  }
  const passed = checks.filter((check) => check.passed).length;
  const ratio = checks.length ? passed / checks.length : 0;
  if (ratio >= 0.8) {
    return "ready";
  }
  if (ratio >= 0.5) {
    return "partial";
  }
  return "needs_work";
}

function readinessResult(context: any, area: string, checks: any[], sourceFields: string[], warnings: any[], assumptions: string[]) {
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    area,
    status: "estimate",
    rating: ratingFromChecks(checks, warnings),
    checks,
    sourceFields,
    formulas: ["skyagent-readiness-estimate-v1"],
    assumptions: [
      "Readiness is a conservative heuristic, not a replacement for current party-finder, guild, or meta requirements.",
      "Gear, pet, magical power, networth, and player skill can change practical readiness and are not fully modeled in this slice.",
      ...assumptions,
    ],
    freshness: {
      verifiedAt: VERIFIED_AT,
      status: "estimate",
    },
    warnings,
    rateLimit: context.rateLimit,
  };
}

function dungeonsReadiness(context: any) {
  const member = context.member;
  const dungeonData = member?.dungeons;
  const catacombs = catacombsLevelFromXp(dungeonData?.dungeon_types?.catacombs?.experience ?? 0);
  const classes = entries(dungeonData?.player_classes).map(([name, value]: [string, any]) => ({
    name,
    ...catacombsLevelFromXp(value?.experience ?? 0),
  }));
  const bestClass = classes.sort((a, b) => b.level - a.level)[0] ?? null;
  const warnings = dungeonData ? [] : [warning("missing_api_data", "Dungeons data is absent from the selected profile payload.", "member.dungeons")];
  const checks = [
    scoreCheck("catacombs_24", catacombs.level >= 24, catacombs.level, 24, "member.dungeons.dungeon_types.catacombs.experience"),
    scoreCheck("class_20", (bestClass?.level ?? 0) >= 20, bestClass?.level ?? 0, 20, "member.dungeons.player_classes"),
    scoreCheck("has_floor_progress", entries(dungeonData?.dungeon_types?.catacombs?.tier_completions).length > 0, dungeonData?.dungeon_types?.catacombs?.tier_completions ?? {}, "any", "member.dungeons.dungeon_types.catacombs.tier_completions"),
  ];
  return readinessResult(context, "dungeons", checks, ["member.dungeons"], warnings, ["Default dungeon readiness target is early F7-style progression: Catacombs 24 plus at least one class near 20."]);
}

function slayerReadiness(context: any) {
  const bosses = context.member?.slayer?.slayer_bosses ?? null;
  const parsed = Object.fromEntries(entries(bosses).map(([name, value]: [string, any]) => [name, slayerLevelFromXp(value?.xp ?? 0)]));
  const levels = Object.values(parsed).map((entry: any) => entry.level);
  const warnings = bosses ? [] : [warning("missing_api_data", "Slayer boss data is absent from the selected profile payload.", "member.slayer.slayer_bosses")];
  const checks = [
    scoreCheck("any_slayer_6", levels.some((level) => level >= 6), Math.max(0, ...levels), 6, "member.slayer.slayer_bosses.*.xp"),
    scoreCheck("three_slayer_5", levels.filter((level) => level >= 5).length >= 3, levels.filter((level) => level >= 5).length, 3, "member.slayer.slayer_bosses.*.xp"),
    scoreCheck("total_slayer_xp_100k", entries(bosses).reduce((total, [, value]: [string, any]) => total + numberValue(value?.xp), 0) >= 100_000, entries(bosses).reduce((total, [, value]: [string, any]) => total + numberValue(value?.xp), 0), 100_000, "member.slayer.slayer_bosses.*.xp"),
  ];
  return readinessResult(context, "slayer", checks, ["member.slayer.slayer_bosses"], warnings, ["Default Slayer readiness means broad midgame Slayer access, not readiness for one named boss tier."]);
}

function kuudraReadiness(context: any) {
  const nether = context.member?.nether_island_player_data ?? null;
  const completions = nether?.kuudra_completed_tiers ?? {};
  const combat = skillLevelFromXp(context.member?.player_data?.experience?.SKILL_COMBAT ?? 0);
  const warnings = [
    ...(nether ? [] : [warning("missing_api_data", "Crimson Isle data is absent from the selected profile payload.", "member.nether_island_player_data")]),
    ...(context.member?.player_data?.experience ? [] : [warning("missing_api_data", "Skill experience is absent from the selected profile payload.", "member.player_data.experience")]),
  ];
  const checks = [
    scoreCheck("combat_24", combat.level >= 24, combat.level, 24, "member.player_data.experience.SKILL_COMBAT"),
    scoreCheck("has_kuudra_completions", sumNumbers(completions) > 0, completions, "any", "member.nether_island_player_data.kuudra_completed_tiers"),
    scoreCheck("has_dojo_or_abiphone_progress", Boolean(nether?.dojo || nether?.abiphone), { dojo: nether?.dojo ?? null, abiphone: nether?.abiphone ?? null }, "any", "member.nether_island_player_data"),
  ];
  return readinessResult(context, "kuudra", checks, ["member.nether_island_player_data", "member.player_data.experience.SKILL_COMBAT"], warnings, ["Kuudra readiness is an entry Crimson Isle signal; tier-specific gear and reputation are not modeled yet."]);
}

function gardenReadiness(context: any) {
  const garden = context.member?.garden_player_data ?? context.member?.garden ?? null;
  const gardenLevel = gardenLevelFromXp(garden?.garden_experience ?? 0);
  const farming = skillLevelFromXp(context.member?.player_data?.experience?.SKILL_FARMING ?? 0);
  const cropMilestones = garden?.crop_milestones ?? {};
  const warnings = [
    ...(garden ? [] : [warning("missing_api_data", "Garden data is absent from the selected profile payload.", "member.garden_player_data")]),
    ...(context.member?.player_data?.experience ? [] : [warning("missing_api_data", "Skill experience is absent from the selected profile payload.", "member.player_data.experience")]),
  ];
  const checks = [
    scoreCheck("garden_10", gardenLevel.level >= 10, gardenLevel.level, 10, "member.garden_player_data.garden_experience"),
    scoreCheck("farming_25", farming.level >= 25, farming.level, 25, "member.player_data.experience.SKILL_FARMING"),
    scoreCheck("five_crop_milestones", entries(cropMilestones).length >= 5, entries(cropMilestones).length, 5, "member.garden_player_data.crop_milestones"),
  ];
  return readinessResult(context, "garden", checks, ["member.garden_player_data", "member.player_data.experience.SKILL_FARMING"], warnings, ["Garden readiness targets stable early farming progression, not contest-specific medal optimization."]);
}

function miningReadiness(context: any) {
  const mining = context.member?.mining_core ?? null;
  const hotm = hotmLevelFromXp(mining?.experience ?? 0);
  const powderTotal = numberValue(mining?.powder_mithril) + numberValue(mining?.powder_spent_mithril) + numberValue(mining?.powder_gemstone) + numberValue(mining?.powder_spent_gemstone) + numberValue(mining?.powder_glacite) + numberValue(mining?.powder_spent_glacite);
  const warnings = mining ? [] : [warning("missing_api_data", "Mining core data is absent from the selected profile payload.", "member.mining_core")];
  const checks = [
    scoreCheck("hotm_7", hotm.level >= 7, hotm.level, 7, "member.mining_core.experience"),
    scoreCheck("powder_4m", powderTotal >= 4_000_000, powderTotal, 4_000_000, "member.mining_core.powder_*"),
    scoreCheck("has_major_unlocks", Boolean(mining?.nodes?.efficient_miner || mining?.nodes?.mole || mining?.nodes?.great_explorer), mining?.nodes ?? {}, "efficient_miner, mole, or great_explorer", "member.mining_core.nodes"),
  ];
  return readinessResult(context, "mining", checks, ["member.mining_core"], warnings, ["Mining readiness targets Heart of the Mountain progression and powder foundation, not exact gemstone route profitability."]);
}

export function normalizeReadinessArea(value: unknown) {
  const normalized = normalizeSectionName(value);
  if (normalized === "crimson_isle" || normalized === "crimson" || normalized === "nether") {
    return "kuudra";
  }
  if (!READINESS_AREAS.includes(normalized as any)) {
    throw new Error(`Unsupported readiness area: ${value}. Supported areas: ${READINESS_AREAS.join(", ")}`);
  }
  return normalized;
}

export function readinessFromContext(context: any, area: string) {
  const normalized = normalizeReadinessArea(area);
  if (normalized === "dungeons") {
    return dungeonsReadiness(context);
  }
  if (normalized === "slayer") {
    return slayerReadiness(context);
  }
  if (normalized === "kuudra") {
    return kuudraReadiness(context);
  }
  if (normalized === "garden") {
    return gardenReadiness(context);
  }
  return miningReadiness(context);
}

export async function readinessForPlayer(area: string, player?: string, profile?: string) {
  return readinessFromContext(await fetchProfileContext(player, profile), area);
}
