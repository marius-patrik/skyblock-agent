export const SKILL_NAMES = [
  "farming",
  "mining",
  "combat",
  "foraging",
  "fishing",
  "enchanting",
  "alchemy",
  "taming",
  "carpentry",
  "runecrafting",
  "social",
];

export const SKILL_XP_INCREMENTS = [
  50, 125, 200, 300, 500, 750, 1_000, 1_500, 2_000, 3_500,
  5_000, 7_500, 10_000, 15_000, 20_000, 30_000, 50_000, 75_000, 100_000, 200_000,
  300_000, 400_000, 500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000, 1_100_000, 1_200_000,
  1_300_000, 1_400_000, 1_500_000, 1_600_000, 1_700_000, 1_800_000, 1_900_000, 2_000_000, 2_100_000, 2_200_000,
  2_300_000, 2_400_000, 2_500_000, 2_600_000, 2_750_000, 2_900_000, 3_100_000, 3_400_000, 3_700_000, 4_000_000,
  4_300_000, 4_600_000, 4_900_000, 5_200_000, 5_500_000, 5_800_000, 6_100_000, 6_400_000, 6_700_000, 7_000_000,
];

export const CATACOMBS_XP_INCREMENTS = [
  50, 75, 110, 160, 230, 330, 470, 670, 950, 1_340,
  1_890, 2_665, 3_760, 5_260, 7_380, 10_300, 14_400, 20_000, 27_600, 38_000,
  52_500, 71_500, 97_000, 132_000, 180_000, 243_000, 328_000, 445_000, 600_000, 800_000,
  1_065_000, 1_410_000, 1_900_000, 2_500_000, 3_300_000, 4_300_000, 5_600_000, 7_200_000, 9_200_000, 12_000_000,
  15_000_000, 19_000_000, 24_000_000, 30_000_000, 38_000_000, 48_000_000, 60_000_000, 75_000_000, 93_000_000, 116_250_000,
];

export const SLAYER_XP_THRESHOLDS = [0, 5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000];
export const HOTM_XP_THRESHOLDS = [0, 3_000, 12_000, 37_000, 97_000, 197_000, 347_000, 557_000, 847_000, 1_247_000];
export const GARDEN_XP_THRESHOLDS = [0, 70, 140, 280, 520, 1_120, 2_620, 4_620, 7_120, 10_120, 20_120, 30_120, 40_120, 50_120, 60_120];

export const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "DIVINE", "SPECIAL", "VERY SPECIAL"];

export function cumulativeThresholds(increments: number[]) {
  let total = 0;
  return [0, ...increments.map((value) => {
    total += value;
    return total;
  })];
}

export const SKILL_XP_THRESHOLDS = cumulativeThresholds(SKILL_XP_INCREMENTS);
export const CATACOMBS_XP_THRESHOLDS = cumulativeThresholds(CATACOMBS_XP_INCREMENTS);

export function levelFromXp(xp: unknown, thresholds: number[]) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 0;
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value >= thresholds[index]) {
      level = index;
    } else {
      break;
    }
  }
  const maxLevel = thresholds.length - 1;
  const current = thresholds[level] ?? 0;
  const next = thresholds[level + 1] ?? null;
  const intoLevel = value - current;
  const needed = next === null ? 0 : next - current;
  return {
    xp: value,
    level: Math.min(level, maxLevel),
    maxLevel,
    currentLevelXp: current,
    nextLevelXp: next,
    xpIntoLevel: intoLevel,
    xpForNextLevel: needed,
    progressToNext: next === null || needed <= 0 ? 1 : Math.max(0, Math.min(1, intoLevel / needed)),
  };
}

export function levelFromXpWithBase(xp: unknown, thresholds: number[], baseLevel: number) {
  const value = Math.max(0, Number(xp) || 0);
  let index = 0;
  for (let cursor = 0; cursor < thresholds.length; cursor += 1) {
    if (value >= thresholds[cursor]) {
      index = cursor;
    } else {
      break;
    }
  }
  const current = thresholds[index] ?? 0;
  const next = thresholds[index + 1] ?? null;
  const intoLevel = value - current;
  const needed = next === null ? 0 : next - current;
  return {
    xp: value,
    level: baseLevel + index,
    maxLevel: baseLevel + thresholds.length - 1,
    currentLevelXp: current,
    nextLevelXp: next,
    xpIntoLevel: intoLevel,
    xpForNextLevel: needed,
    progressToNext: next === null || needed <= 0 ? 1 : Math.max(0, Math.min(1, intoLevel / needed)),
  };
}

export function skillLevelFromXp(xp: unknown) {
  return levelFromXp(xp, SKILL_XP_THRESHOLDS);
}

export function catacombsLevelFromXp(xp: unknown) {
  return levelFromXp(xp, CATACOMBS_XP_THRESHOLDS);
}

export function slayerLevelFromXp(xp: unknown) {
  return levelFromXp(xp, SLAYER_XP_THRESHOLDS);
}

export function hotmLevelFromXp(xp: unknown) {
  return levelFromXpWithBase(xp, HOTM_XP_THRESHOLDS, 1);
}

export function gardenLevelFromXp(xp: unknown) {
  return levelFromXpWithBase(xp, GARDEN_XP_THRESHOLDS, 1);
}

export function normalizeSectionName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[-\s]/g, "_");
}
