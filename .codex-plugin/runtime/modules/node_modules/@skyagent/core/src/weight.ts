import { fetchProfileContext } from "./profile.ts";
import { CATACOMBS_XP_THRESHOLDS, GARDEN_XP_THRESHOLDS, HOTM_XP_THRESHOLDS, SKILL_NAMES, catacombsLevelFromXp, gardenLevelFromXp, hotmLevelFromXp, skillLevelFromXp, slayerLevelFromXp } from "./progression.ts";

const VERIFIED_AT = "2026-07-01";

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function entries(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function warning(code: string, message: string, sourcePath?: string) {
  return { code, message, sourcePath };
}

function skillSignals(member: any) {
  const experience = member?.player_data?.experience ?? {};
  const skills = SKILL_NAMES.map((name) => {
    const key = `SKILL_${name.toUpperCase()}`;
    return { name, key, ...skillLevelFromXp(experience[key] ?? 0), apiPresent: Object.hasOwn(experience, key) };
  });
  const leveled = skills.filter((skill) => skill.xp > 0);
  return {
    skills,
    average: leveled.length ? round(leveled.reduce((total, skill) => total + skill.level, 0) / leveled.length) : 0,
    totalXp: skills.reduce((total, skill) => total + skill.xp, 0),
    warnings: member?.player_data?.experience ? [] : [warning("missing_api_data", "Skill experience is absent from the selected profile payload.", "member.player_data.experience")],
  };
}

function dungeonSignals(member: any) {
  const catacombsXp = member?.dungeons?.dungeon_types?.catacombs?.experience ?? 0;
  const classes = Object.fromEntries(entries(member?.dungeons?.player_classes).map(([name, value]: [string, any]) => [
    name,
    catacombsLevelFromXp(value?.experience ?? 0),
  ]));
  return {
    catacombs: catacombsLevelFromXp(catacombsXp),
    classes,
    warnings: member?.dungeons ? [] : [warning("missing_api_data", "Dungeons data is absent from the selected profile payload.", "member.dungeons")],
  };
}

function slayerSignals(member: any) {
  const bosses = member?.slayer?.slayer_bosses ?? {};
  const parsed = Object.fromEntries(entries(bosses).map(([name, value]: [string, any]) => [
    name,
    { ...slayerLevelFromXp(value?.xp ?? 0), bossKillsTier: value?.boss_kills_tier ?? {} },
  ]));
  return {
    bosses: parsed,
    totalXp: entries(bosses).reduce((total, [, value]: [string, any]) => total + numberValue(value?.xp), 0),
    warnings: member?.slayer?.slayer_bosses ? [] : [warning("missing_api_data", "Slayer boss data is absent from the selected profile payload.", "member.slayer.slayer_bosses")],
  };
}

function estimateComponent(name: string, score: number, max: number, inputs: Record<string, any>, formula: string) {
  return {
    name,
    score: round(Math.max(0, Math.min(score, max))),
    max,
    inputs,
    formula,
  };
}

export function weightFromContext(context: any) {
  const skills = skillSignals(context.member);
  const dungeons = dungeonSignals(context.member);
  const slayer = slayerSignals(context.member);
  const mining = hotmLevelFromXp(context.member?.mining_core?.experience ?? 0);
  const garden = gardenLevelFromXp(context.member?.garden_player_data?.garden_experience ?? context.member?.garden?.garden_experience ?? 0);

  const components = [
    estimateComponent("skills", skills.average * 8, 500, { skillAverage: skills.average, totalSkillXp: skills.totalXp }, "skillAverage * 8, capped at 500"),
    estimateComponent("dungeons", dungeons.catacombs.level * 12, 600, { catacombsLevel: dungeons.catacombs.level, catacombsXp: dungeons.catacombs.xp }, "catacombsLevel * 12, capped at 600"),
    estimateComponent("slayer", Math.sqrt(slayer.totalXp) / 3, 400, { totalSlayerXp: slayer.totalXp }, "sqrt(totalSlayerXp) / 3, capped at 400"),
    estimateComponent("mining", mining.level * 25, 250, { hotmLevel: mining.level, hotmXp: mining.xp }, "hotmLevel * 25, capped at 250"),
    estimateComponent("garden", garden.level * 10, 150, { gardenLevel: garden.level, gardenXp: garden.xp }, "gardenLevel * 10, capped at 150"),
  ];
  const warnings = [
    ...skills.warnings,
    ...dungeons.warnings,
    ...slayer.warnings,
    ...(context.member?.mining_core ? [] : [warning("missing_api_data", "Mining core data is absent from the selected profile payload.", "member.mining_core")]),
    ...(context.member?.garden_player_data || context.member?.garden ? [] : [warning("missing_api_data", "Garden data is absent from the selected profile payload.", "member.garden_player_data")]),
    warning("unsupported_formula", "Exact Senither and Lily weight formulas are not bundled as maintained tables; SkyAgent returns an explicitly labeled estimate instead."),
  ];

  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    status: "estimate",
    styles: {
      senither: {
        status: "unsupported",
        reason: "No maintained Senither formula table is bundled in SkyAgent.",
      },
      lily: {
        status: "unsupported",
        reason: "No maintained Lily formula table is bundled in SkyAgent.",
      },
      skyagentEstimate: {
        status: "estimate",
        score: round(components.reduce((total, component) => total + component.score, 0)),
        max: components.reduce((total, component) => total + component.max, 0),
        components,
      },
    },
    sourceFields: [
      "member.player_data.experience",
      "member.dungeons",
      "member.slayer.slayer_bosses",
      "member.mining_core",
      "member.garden_player_data",
    ],
    formulas: [
      "skyagent-weight-estimate-v1",
      "Skill XP threshold table",
      "Catacombs XP threshold table",
      "Slayer XP threshold table",
      "Heart of the Mountain XP threshold table",
      "Garden XP threshold table",
    ],
    tables: {
      catacombsMaxLevel: CATACOMBS_XP_THRESHOLDS.length - 1,
      hotmMaxLevel: HOTM_XP_THRESHOLDS.length,
      gardenMaxLevel: GARDEN_XP_THRESHOLDS.length,
    },
    assumptions: [
      "The SkyAgent estimate is for rough profile comparison only and is not equivalent to Senither or Lily weight.",
      "Missing API sections contribute zero to the estimate and are surfaced as warnings.",
    ],
    freshness: {
      verifiedAt: VERIFIED_AT,
      status: "estimate",
    },
    warnings,
    rateLimit: context.rateLimit,
  };
}

export async function weightForPlayer(player?: string, profile?: string) {
  return weightFromContext(await fetchProfileContext(player, profile));
}
