import { describe, expect, test } from "bun:test";
import { CATACOMBS_XP_THRESHOLDS, GARDEN_XP_THRESHOLDS, HOTM_XP_THRESHOLDS, SKILL_XP_THRESHOLDS, catacombsLevelFromXp, gardenLevelFromXp, hotmLevelFromXp, profileSectionFromContext, progressionFromContext, sectionNames, skillLevelFromXp, slayerLevelFromXp } from "../src/index.ts";

describe("XP curves", () => {
  test("calculates skill XP boundaries", () => {
    expect(skillLevelFromXp(0)).toMatchObject({ level: 0, nextLevelXp: SKILL_XP_THRESHOLDS[1] });
    expect(skillLevelFromXp(50)).toMatchObject({ level: 1, currentLevelXp: 50 });
    expect(skillLevelFromXp(SKILL_XP_THRESHOLDS[10] - 1)).toMatchObject({ level: 9 });
    expect(skillLevelFromXp(SKILL_XP_THRESHOLDS[10])).toMatchObject({ level: 10 });
  });

  test("calculates catacombs XP boundaries", () => {
    expect(catacombsLevelFromXp(CATACOMBS_XP_THRESHOLDS[5] - 1)).toMatchObject({ level: 4 });
    expect(catacombsLevelFromXp(CATACOMBS_XP_THRESHOLDS[5])).toMatchObject({ level: 5 });
  });

  test("calculates slayer XP thresholds", () => {
    expect(slayerLevelFromXp(4)).toMatchObject({ level: 0 });
    expect(slayerLevelFromXp(5)).toMatchObject({ level: 1 });
    expect(slayerLevelFromXp(1_000_000)).toMatchObject({ level: 9 });
  });

  test("calculates HotM XP boundaries from its own table", () => {
    expect(hotmLevelFromXp(0)).toMatchObject({ level: 1, nextLevelXp: HOTM_XP_THRESHOLDS[1] });
    expect(hotmLevelFromXp(HOTM_XP_THRESHOLDS[3] - 1)).toMatchObject({ level: 3 });
    expect(hotmLevelFromXp(HOTM_XP_THRESHOLDS[3])).toMatchObject({ level: 4 });
    expect(hotmLevelFromXp(HOTM_XP_THRESHOLDS.at(-1))).toMatchObject({ level: 10, nextLevelXp: null });
  });

  test("calculates Garden XP boundaries from its own table", () => {
    expect(gardenLevelFromXp(0)).toMatchObject({ level: 1, nextLevelXp: GARDEN_XP_THRESHOLDS[1] });
    expect(gardenLevelFromXp(GARDEN_XP_THRESHOLDS[4] - 1)).toMatchObject({ level: 4 });
    expect(gardenLevelFromXp(GARDEN_XP_THRESHOLDS[4])).toMatchObject({ level: 5 });
    expect(gardenLevelFromXp(GARDEN_XP_THRESHOLDS.at(-1))).toMatchObject({ level: 15, nextLevelXp: null });
  });
});

describe("progression sections", () => {
  test("renders deterministic basic progression sections", () => {
    const context = {
      uuid: "player-uuid",
      profile: {
        profile_id: "profile-id",
        cute_name: "Apple",
        banking: { balance: 123 },
        museum: {
          items: { ASPECT_OF_THE_END: {} },
          special: { NEW_YEAR_CAKE: {} },
          value: 10_000,
        },
      },
      member: {
        currencies: { coin_purse: 456, essence: { WITHER: 7 } },
        crafted_generators: ["WHEAT_1", "WHEAT_2", "COBBLESTONE_1"],
        pets: [
          { type: "SHEEP", tier: "LEGENDARY", exp: 1000, active: true },
          { type: "ROCK", tier: "RARE", exp: 50 },
        ],
        player_data: {
          experience: {
            SKILL_FARMING: SKILL_XP_THRESHOLDS[10],
            SKILL_MINING: 50,
          },
          unlocked_coll_tiers: ["WHEAT_1"],
          unlocked_recipes: ["ENCHANTED_BREAD"],
          visited_zones: ["hub"],
        },
        collection: {
          WHEAT: 100,
        },
        mining_core: {
          experience: HOTM_XP_THRESHOLDS[4],
          powder_mithril: 100,
          powder_gemstone: 200,
          commissions: { completed_commissions: 3 },
          nodes: { mining_speed: 2, efficient_miner: 1 },
        },
        garden_player_data: {
          garden_experience: GARDEN_XP_THRESHOLDS[5],
          crop_milestones: { wheat: 3 },
          crop_upgrade_levels: { wheat: 1 },
          resources_collected: { wheat: 150, carrot: 25 },
        },
        slayer: {
          slayer_bosses: {
            zombie: { xp: 1_000, claimed_levels: { level_1: true } },
          },
        },
        dungeons: {
          dungeon_types: {
            catacombs: { experience: CATACOMBS_XP_THRESHOLDS[5] },
          },
          player_classes: {
            mage: { experience: CATACOMBS_XP_THRESHOLDS[3] },
          },
        },
        bestiary: {
          kills: { zombie: 10, spider: 2 },
          deaths: { zombie: 1 },
        },
        nether_island_player_data: {
          kuudra_completed_tiers: { basic: 2 },
          dojo: { belt: "GREEN" },
        },
        rift: {
          visits: 1,
          lifetime_motes: 25,
        },
        trophy_fish: {
          blobfish_bronze: 2,
        },
      },
      rateLimit: { remaining: 10 },
    };
    const result = progressionFromContext(context);

    expect(result.sections.map((section) => section.section)).toEqual(sectionNames());
    expect(result.sections.find((section) => section.section === "skills")?.computed.skillAverage).toBe(5.5);
    expect(result.sections.find((section) => section.section === "dungeons")?.computed.catacombs.level).toBe(5);
    expect(result.sections.find((section) => section.section === "slayer")?.computed.bosses.zombie.level).toBe(4);
    expect(result.sections.find((section) => section.section === "currencies")?.computed).toMatchObject({ purse: 456, bank: 123 });
    expect(result.sections.find((section) => section.section === "mining")?.computed.powder).toMatchObject({ mithril: 100, gemstone: 200 });
    expect(result.sections.find((section) => section.section === "mining")?.computed.hotm.level.level).toBe(5);
    expect(result.sections.find((section) => section.section === "garden")?.computed.resourcesCollected.total).toBe(175);
    expect(result.sections.find((section) => section.section === "garden")?.computed.gardenLevel.level).toBe(6);
    expect(result.sections.find((section) => section.section === "bestiary")?.computed.kills.total).toBe(12);
    expect(result.sections.find((section) => section.section === "minions")?.computed).toMatchObject({ craftedCount: 3, uniqueFamilies: 2 });
    expect(result.sections.find((section) => section.section === "museum")?.computed).toMatchObject({ available: true, itemCount: 1, specialItemCount: 1 });
    expect(result.sections.find((section) => section.section === "crimson_isle")?.computed.kuudra.completions).toMatchObject({ basic: 2 });
    expect(result.sections.find((section) => section.section === "rift")?.computed).toMatchObject({ visits: 1, lifetimeMotes: 25 });
    expect(result.sections.find((section) => section.section === "trophy_fishing")?.computed.totalCaught).toBe(2);
    expect(result.sections.find((section) => section.section === "pets")?.computed).toMatchObject({ count: 2 });
    expect(result.sections.find((section) => section.section === "essence")?.computed).toMatchObject({ totalKnownEssence: 7 });
    expect(result.sections.find((section) => section.section === "unlocks")?.computed.unlockedRecipes).toEqual(["ENCHANTED_BREAD"]);
    expect(profileSectionFromContext(context, "hotm").section).toBe("mining");
    expect(profileSectionFromContext(context, "kuudra").section).toBe("crimson_isle");
  });

  test("distinguishes missing API data from zero progress", () => {
    const zeroProgress = progressionFromContext({
      uuid: "player-uuid",
      profile: { profile_id: "profile-id", banking: { balance: 0 } },
      member: {
        currencies: { coin_purse: 0, essence: {} },
        player_data: { experience: {}, unlocked_coll_tiers: [] },
        collection: {},
        slayer: { slayer_bosses: {} },
        dungeons: { dungeon_types: {}, player_classes: {} },
        mining_core: { experience: 0, nodes: {} },
        garden_player_data: { garden_experience: 0, resources_collected: {} },
        bestiary: { kills: {}, deaths: {} },
        crafted_generators: [],
        pets: [],
        nether_island_player_data: {},
        rift: {},
        trophy_fish: {},
      },
      rateLimit: null,
    });
    const missingData = progressionFromContext({
      uuid: "player-uuid",
      profile: { profile_id: "profile-id" },
      member: {},
      rateLimit: null,
    });

    expect(zeroProgress.sections.find((section) => section.section === "mining")?.warnings).toEqual([]);
    expect(zeroProgress.sections.find((section) => section.section === "garden")?.warnings).toEqual([]);
    expect(zeroProgress.sections.find((section) => section.section === "currencies")?.computed).toMatchObject({ purse: 0, bank: 0 });
    expect(missingData.sections.find((section) => section.section === "mining")?.warnings[0]?.code).toBe("missing_api_data");
    expect(missingData.sections.find((section) => section.section === "garden")?.warnings[0]?.code).toBe("missing_api_data");
    expect(missingData.sections.find((section) => section.section === "currencies")?.computed).toMatchObject({ purse: null, bank: null });
  });
});
