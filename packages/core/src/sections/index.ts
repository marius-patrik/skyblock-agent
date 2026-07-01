import { fetchProfileContext } from "../profile.ts";
import { CATACOMBS_XP_THRESHOLDS, GARDEN_XP_THRESHOLDS, HOTM_XP_THRESHOLDS, SKILL_NAMES, RARITY_ORDER, catacombsLevelFromXp, gardenLevelFromXp, hotmLevelFromXp, normalizeSectionName, skillLevelFromXp, slayerLevelFromXp } from "../progression.ts";

type Warning = {
  code: string;
  message: string;
  sourcePath?: string;
};

type SectionContext = {
  member: any;
  profile: any;
};

type SectionResult = {
  section: string;
  sourceFields: string[];
  computed: Record<string, any>;
  warnings: Warning[];
  provenance: {
    source: string;
    formulas: string[];
  };
};

function keys(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function entries(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  return numberValue(value);
}

function sumNumbers(value: any) {
  if (!value || typeof value !== "object") {
    return 0;
  }
  return Object.values(value).reduce((total: number, entry) => total + numberValue(entry), 0);
}

function getPath(root: any, path: string) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

function hasPath(root: any, path: string) {
  return getPath(root, path) !== undefined && getPath(root, path) !== null;
}

function missing(path: string, label = path): Warning {
  return {
    code: "missing_api_data",
    message: `${label} is absent from the selected profile payload.`,
    sourcePath: path,
  };
}

function sectionResult(name: string, sourceFields: string[], computed: Record<string, any>, warnings: Warning[] = [], formulas: string[] = []) {
  return {
    section: name,
    sourceFields,
    computed,
    warnings,
    provenance: {
      source: "Hypixel profile member",
      formulas: ["skyagent-progress-parser", ...formulas],
    },
  };
}

function topEntriesByValue(value: any, limit = 10) {
  return entries(value)
    .map(([name, amount]) => ({ name, amount: numberValue(amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function skillsSection(member: any) {
  const experience = member?.player_data?.experience ?? {};
  const warnings = hasPath(member, "player_data.experience") ? [] : [missing("member.player_data.experience", "skill experience")];
  const skills = SKILL_NAMES.map((name) => {
    const key = `SKILL_${name.toUpperCase()}`;
    return {
      name,
      key,
      apiPresent: Object.hasOwn(experience, key),
      ...skillLevelFromXp(experience[key] ?? 0),
    };
  });
  const leveled = skills.filter((skill) => skill.xp > 0);
  return sectionResult("skills", ["member.player_data.experience"], {
    skills,
    skillAverage: leveled.length ? Math.round((leveled.reduce((total, skill) => total + skill.level, 0) / leveled.length) * 100) / 100 : 0,
    totalSkillXp: skills.reduce((total, skill) => total + skill.xp, 0),
  }, warnings, ["skill XP threshold table"]);
}

export function dungeonsSection(member: any) {
  const dungeons = member?.dungeons ?? {};
  const warnings = hasPath(member, "dungeons") ? [] : [missing("member.dungeons", "dungeons")];
  const catacombsXp = dungeons?.dungeon_types?.catacombs?.experience ?? 0;
  const classes = dungeons?.player_classes ?? {};
  const dungeonTypes = Object.fromEntries(entries(dungeons.dungeon_types).map(([name, value]: [string, any]) => [
    name,
    {
      experience: numberValue(value?.experience),
      bestScore: value?.best_score ?? null,
      tierCompletions: value?.tier_completions ?? {},
      fastestTime: value?.fastest_time ?? {},
      fastestTimeSPlus: value?.fastest_time_s_plus ?? {},
      milestoneCompletions: value?.milestone_completions ?? {},
    },
  ]));
  return sectionResult("dungeons", ["member.dungeons"], {
    catacombs: catacombsLevelFromXp(catacombsXp),
    classes: Object.fromEntries(entries(classes).map(([name, value]: [string, any]) => [
      name,
      {
        ...catacombsLevelFromXp(value?.experience ?? 0),
        current: Boolean(value?.current),
      },
    ])),
    dungeonTypes,
    selectedDungeonClass: dungeons?.selected_dungeon_class ?? null,
  }, warnings, ["Catacombs XP threshold table"]);
}

export function slayerSection(member: any) {
  const bosses = member?.slayer?.slayer_bosses ?? {};
  const warnings = hasPath(member, "slayer.slayer_bosses") ? [] : [missing("member.slayer.slayer_bosses", "slayer bosses")];
  return sectionResult("slayer", ["member.slayer.slayer_bosses"], {
    bosses: Object.fromEntries(entries(bosses).map(([name, value]: [string, any]) => [
      name,
      {
        claimedLevels: value?.claimed_levels ?? {},
        bossKillsTier: value?.boss_kills_tier ?? {},
        ...slayerLevelFromXp(value?.xp ?? 0),
      },
    ])),
    totalSlayerXp: entries(bosses).reduce((total, [, value]: [string, any]) => total + numberValue(value?.xp), 0),
  }, warnings, ["Slayer XP threshold table"]);
}

export function miningSection(member: any) {
  const mining = member?.mining_core ?? {};
  const nodes = mining?.nodes ?? {};
  const warnings = hasPath(member, "mining_core") ? [] : [missing("member.mining_core", "mining core")];
  const hotmXp = mining?.experience ?? nodes?.experience ?? 0;
  return sectionResult("mining", ["member.mining_core"], {
    hotm: {
      experience: numberValue(hotmXp),
      level: hotmLevelFromXp(hotmXp),
      tokensSpent: optionalNumber(mining?.tokens_spent),
      tokens: optionalNumber(mining?.tokens),
      selectedPickaxeAbility: mining?.selected_pickaxe_ability ?? null,
    },
    powder: {
      mithril: numberValue(mining?.powder_mithril),
      spentMithril: numberValue(mining?.powder_spent_mithril),
      gemstone: numberValue(mining?.powder_gemstone),
      spentGemstone: numberValue(mining?.powder_spent_gemstone),
      glacite: numberValue(mining?.powder_glacite),
      spentGlacite: numberValue(mining?.powder_spent_glacite),
    },
    commissions: {
      milestones: mining?.commissions?.milestones ?? {},
      completedCommissions: optionalNumber(mining?.commissions?.completed_commissions),
    },
    crystals: mining?.crystals ?? {},
    majorUnlocks: Object.fromEntries(entries(nodes)
      .filter(([name, value]) => /mining_speed|mining_fortune|daily_powder|professional|efficient_miner|mole|great_explorer/i.test(name) || numberValue(value) > 0)
      .sort(([a], [b]) => a.localeCompare(b))),
  }, warnings, ["Heart of the Mountain XP threshold table"]);
}

export function gardenSection(member: any) {
  const garden = member?.garden_player_data ?? member?.garden ?? {};
  const warnings = hasPath(member, "garden_player_data") || hasPath(member, "garden") ? [] : [missing("member.garden_player_data", "garden")];
  const resources = garden?.resources_collected ?? garden?.crop_resources_collected ?? {};
  return sectionResult("garden", ["member.garden_player_data", "member.garden"], {
    gardenExperience: numberValue(garden?.garden_experience),
    gardenLevel: gardenLevelFromXp(garden?.garden_experience ?? 0),
    cropMilestones: garden?.crop_milestones ?? {},
    cropUpgradeLevels: garden?.crop_upgrade_levels ?? {},
    visitorStats: garden?.visitors ?? garden?.visitor_stats ?? {},
    resourcesCollected: {
      total: sumNumbers(resources),
      top: topEntriesByValue(resources),
    },
    composter: garden?.composter_data ?? garden?.composter ?? {},
  }, warnings, ["Garden XP threshold table"]);
}

export function collectionsSection(member: any) {
  const warnings = hasPath(member, "collection") ? [] : [missing("member.collection", "collections")];
  const collection = member?.collection ?? {};
  return sectionResult("collections", ["member.collection", "member.player_data.unlocked_coll_tiers"], {
    collectionKeys: keys(collection),
    topCollections: topEntriesByValue(collection),
    unlockedCollectionTiers: member?.player_data?.unlocked_coll_tiers ?? member?.unlocked_coll_tiers ?? [],
  }, warnings);
}

export function currenciesSection(member: any, profile: any) {
  const currencies = member?.currencies ?? {};
  const warnings = [
    ...(hasPath(member, "currencies") || hasPath(member, "coin_purse") ? [] : [missing("member.currencies", "currencies")]),
    ...(hasPath(profile, "banking.balance") ? [] : [missing("profile.banking.balance", "bank balance")]),
  ];
  return sectionResult("currencies", ["member.currencies", "member.coin_purse", "profile.banking.balance"], {
    purse: currencies.coin_purse ?? member?.coin_purse ?? null,
    bank: profile?.banking?.balance ?? null,
    motesPurse: currencies.motes_purse ?? null,
    essence: currencies.essence ?? {},
    essenceKeys: keys(currencies.essence),
  }, warnings);
}

export function bestiarySection(member: any) {
  const bestiary = member?.bestiary ?? {};
  const warnings = hasPath(member, "bestiary") ? [] : [missing("member.bestiary", "bestiary")];
  const kills = bestiary?.kills ?? {};
  const deaths = bestiary?.deaths ?? {};
  return sectionResult("bestiary", ["member.bestiary"], {
    milestone: bestiary?.milestone ?? null,
    kills: {
      total: sumNumbers(kills),
      top: topEntriesByValue(kills),
    },
    deaths: {
      total: sumNumbers(deaths),
      top: topEntriesByValue(deaths),
    },
    familiesTracked: new Set([...keys(kills), ...keys(deaths)]).size,
  }, warnings);
}

export function minionsSection(member: any) {
  const crafted = member?.crafted_generators;
  const craftedList = Array.isArray(crafted) ? crafted : [];
  const warnings = Array.isArray(crafted) ? [] : [missing("member.crafted_generators", "crafted minions")];
  return sectionResult("minions", ["member.crafted_generators"], {
    craftedCount: craftedList.length,
    craftedGenerators: craftedList,
    uniqueFamilies: new Set(craftedList.map((entry) => String(entry).replace(/_\d+$/, ""))).size,
  }, warnings);
}

export function museumSection(member: any, profile: any) {
  const museum = profile?.museum?.members?.[member?.profile_member_id] ?? profile?.museum ?? member?.museum ?? null;
  const warnings = museum ? [] : [missing("profile.museum", "museum")];
  return sectionResult("museum", ["profile.museum", "member.museum"], {
    available: Boolean(museum),
    keys: keys(museum),
    itemCount: keys(museum?.items).length,
    specialItemCount: keys(museum?.special).length,
    value: optionalNumber(museum?.value),
  }, warnings);
}

export function crimsonIsleSection(member: any) {
  const nether = member?.nether_island_player_data ?? {};
  const warnings = hasPath(member, "nether_island_player_data") ? [] : [missing("member.nether_island_player_data", "Crimson Isle")];
  return sectionResult("crimson_isle", ["member.nether_island_player_data"], {
    kuudra: {
      completions: nether?.kuudra_completed_tiers ?? {},
      keys: nether?.kuudra_keys ?? {},
    },
    dojo: nether?.dojo ?? {},
    matriarch: nether?.matriarch ?? {},
    abiphone: nether?.abiphone ?? {},
    quests: nether?.quests ?? {},
  }, warnings);
}

export function riftSection(member: any) {
  const rift = member?.rift ?? {};
  const warnings = hasPath(member, "rift") ? [] : [missing("member.rift", "Rift")];
  return sectionResult("rift", ["member.rift"], {
    visits: optionalNumber(rift?.visits),
    lifetimeMotes: optionalNumber(rift?.lifetime_motes),
    deadCats: rift?.dead_cats ?? {},
    villagePlaza: rift?.village_plaza ?? {},
    westVillage: rift?.west_village ?? {},
    wyldWoods: rift?.wyld_woods ?? {},
    blackLagoon: rift?.black_lagoon ?? {},
    stillgoreChateau: rift?.stillgore_chateau ?? {},
  }, warnings);
}

export function trophyFishingSection(member: any) {
  const trophyFish = member?.trophy_fish ?? {};
  const warnings = hasPath(member, "trophy_fish") ? [] : [missing("member.trophy_fish", "trophy fishing")];
  return sectionResult("trophy_fishing", ["member.trophy_fish"], {
    totalCaught: sumNumbers(trophyFish),
    trophies: trophyFish,
    top: topEntriesByValue(trophyFish),
  }, warnings);
}

export function petsSection(member: any) {
  const pets = Array.isArray(member?.pets) ? member.pets : [];
  const warnings = Array.isArray(member?.pets) ? [] : [missing("member.pets", "pets")];
  return sectionResult("pets", ["member.pets"], {
    count: pets.length,
    active: pets.find((pet: any) => pet?.active) ?? null,
    byTier: pets.reduce((result: Record<string, number>, pet: any) => {
      const tier = pet?.tier ?? "UNKNOWN";
      result[tier] = (result[tier] ?? 0) + 1;
      return result;
    }, {}),
    topExperience: [...pets]
      .sort((a: any, b: any) => numberValue(b?.exp) - numberValue(a?.exp))
      .slice(0, 10)
      .map((pet: any) => ({ type: pet?.type ?? null, tier: pet?.tier ?? null, exp: numberValue(pet?.exp), active: Boolean(pet?.active) })),
  }, warnings);
}

export function essenceSection(member: any) {
  const essence = member?.currencies?.essence ?? {};
  const warnings = hasPath(member, "currencies.essence") ? [] : [missing("member.currencies.essence", "essence")];
  return sectionResult("essence", ["member.currencies.essence"], {
    essence,
    totalKnownEssence: sumNumbers(essence),
    types: keys(essence),
  }, warnings);
}

export function unlocksSection(member: any) {
  const playerData = member?.player_data ?? {};
  return sectionResult("unlocks", ["member.player_data", "member.objectives", "member.quests"], {
    unlockedCollTiers: playerData?.unlocked_coll_tiers ?? member?.unlocked_coll_tiers ?? [],
    unlockedRecipes: playerData?.unlocked_recipes ?? [],
    visitedZones: playerData?.visited_zones ?? [],
    achievements: playerData?.achievements ?? {},
    objectives: member?.objectives ?? {},
    quests: member?.quests ?? {},
  }, hasPath(member, "player_data") ? [] : [missing("member.player_data", "player unlock data")]);
}

export const SECTION_BUILDERS: Record<string, (context: SectionContext) => SectionResult> = {
  skills: ({ member }) => skillsSection(member),
  dungeons: ({ member }) => dungeonsSection(member),
  slayer: ({ member }) => slayerSection(member),
  mining: ({ member }) => miningSection(member),
  garden: ({ member }) => gardenSection(member),
  collections: ({ member }) => collectionsSection(member),
  currencies: ({ member, profile }) => currenciesSection(member, profile),
  bestiary: ({ member }) => bestiarySection(member),
  minions: ({ member }) => minionsSection(member),
  museum: ({ member, profile }) => museumSection(member, profile),
  crimson_isle: ({ member }) => crimsonIsleSection(member),
  rift: ({ member }) => riftSection(member),
  trophy_fishing: ({ member }) => trophyFishingSection(member),
  pets: ({ member }) => petsSection(member),
  essence: ({ member }) => essenceSection(member),
  unlocks: ({ member }) => unlocksSection(member),
};

const SECTION_ALIASES: Record<string, string> = {
  farming: "garden",
  hotm: "mining",
  kuudra: "crimson_isle",
  crimson: "crimson_isle",
  nether: "crimson_isle",
  trophyfish: "trophy_fishing",
  trophy_fish: "trophy_fishing",
  important_unlocks: "unlocks",
  profile: "unlocks",
};

export function profileSectionName(value: unknown) {
  const normalized = normalizeSectionName(value);
  return SECTION_ALIASES[normalized] ?? normalized;
}

export function sectionNames() {
  return Object.keys(SECTION_BUILDERS);
}

export function profileSectionFromContext(context: any, sectionName: string) {
  const normalized = profileSectionName(sectionName);
  const builder = SECTION_BUILDERS[normalized];
  if (!builder) {
    throw new Error(`Unsupported profile section: ${sectionName}. Supported sections: ${sectionNames().join(", ")}`);
  }
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    rateLimit: context.rateLimit,
    ...builder({ member: context.member, profile: context.profile }),
  };
}

export async function profileSectionForPlayer(sectionName: string, player?: string, profile?: string) {
  return profileSectionFromContext(await fetchProfileContext(player, profile), sectionName);
}

export function progressionFromContext(context: any) {
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    sections: sectionNames().map((name) => profileSectionFromContext(context, name)),
    tables: {
      rarityOrder: RARITY_ORDER,
      skillMaxLevel: 60,
      catacombsMaxLevel: CATACOMBS_XP_THRESHOLDS.length - 1,
      hotmMaxLevel: HOTM_XP_THRESHOLDS.length,
      gardenMaxLevel: GARDEN_XP_THRESHOLDS.length,
      sectionAliases: SECTION_ALIASES,
    },
    rateLimit: context.rateLimit,
  };
}

export async function progressionForPlayer(player?: string, profile?: string) {
  return progressionFromContext(await fetchProfileContext(player, profile));
}
