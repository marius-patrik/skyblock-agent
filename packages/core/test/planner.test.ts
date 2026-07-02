import { describe, expect, test } from "bun:test";
import { CATACOMBS_XP_THRESHOLDS, GARDEN_XP_THRESHOLDS, HOTM_XP_THRESHOLDS, SKILL_XP_THRESHOLDS, nextUpgradesFromContext, planGoalFromContext } from "../src/index.ts";

function context(overrides: any = {}) {
  return {
    uuid: "player-uuid",
    profile: { profile_id: "profile-id", cute_name: "Apple" },
    member: {
      player_data: {
        experience: {
          SKILL_COMBAT: SKILL_XP_THRESHOLDS[20],
          SKILL_FARMING: SKILL_XP_THRESHOLDS[18],
        },
      },
      dungeons: {
        dungeon_types: {
          catacombs: {
            experience: CATACOMBS_XP_THRESHOLDS[18],
            tier_completions: { 5: 1 },
          },
        },
        player_classes: {
          mage: { experience: CATACOMBS_XP_THRESHOLDS[16] },
        },
      },
      slayer: { slayer_bosses: { zombie: { xp: 5_000 } } },
      mining_core: { experience: HOTM_XP_THRESHOLDS[4], nodes: {} },
      garden_player_data: { garden_experience: GARDEN_XP_THRESHOLDS[4], crop_milestones: { wheat: 3 } },
      ...overrides.member,
    },
    rateLimit: null,
    ...overrides,
  };
}

function networth() {
  return {
    total: 25_000_000,
    confidence: "medium",
    warnings: [],
    providerFreshness: [{ source: "test-price", fetchedAt: "2026-07-01T00:00:00.000Z" }],
  };
}

function accessories(upgrades: any[] = []) {
  return {
    upgrades,
    warnings: [],
    assumptions: ["test accessory assumptions"],
    providerFreshness: [{ source: "test-accessories", fetchedAt: "2026-07-01T00:00:00.000Z" }],
  };
}

const upgrade = {
  internalId: "CHEAP_TALISMAN",
  displayName: "Cheap Talisman",
  family: "CHEAP_TALISMAN",
  rarity: "RARE",
  magicalPowerGain: 8,
  price: 800_000,
  coinPerMagicalPower: 100_000,
  withinBudget: true,
  provider: { source: "test-price" },
  warnings: [],
};

const overBudgetUpgrade = {
  ...upgrade,
  internalId: "EXPENSIVE_TALISMAN",
  displayName: "Expensive Talisman",
  price: 5_000_000,
};

const unknownPriceUpgrade = {
  ...upgrade,
  internalId: "UNKNOWN_PRICE_TALISMAN",
  displayName: "Unknown Price Talisman",
  price: null,
  withinBudget: undefined,
};

describe("planner", () => {
  test("creates deterministic goal plans with blockers and upgrade recommendations", async () => {
    const first = await planGoalFromContext(context(), "f7 dungeons", {
      budget: 1_000_000,
      networthProvider: networth,
      accessoriesProvider: () => accessories([upgrade]),
      memories: [{ id: "m1", tags: ["preference"], text: "prefers dungeons with cheap upgrades first" }],
      config: { username: "Player", selectedProfileId: "profile-id" },
    });
    const second = await planGoalFromContext(context(), "f7 dungeons", {
      budget: 1_000_000,
      networthProvider: networth,
      accessoriesProvider: () => accessories([upgrade]),
      memories: [{ id: "m1", tags: ["preference"], text: "prefers dungeons with cheap upgrades first" }],
      config: { username: "Player", selectedProfileId: "profile-id" },
    });

    expect(first).toEqual(second);
    expect(first.inputs.areas).toEqual(["dungeons"]);
    expect(first.inputs.profileSections.some((section) => section.section === "dungeons")).toBe(true);
    expect(first.inputs.memoryCount).toBe(1);
    expect(first.inputs.usedMemories).toEqual([{ id: "m1", tags: ["preference"], text: "prefers dungeons with cheap upgrades first" }]);
    expect(first.recommendations[0]).toMatchObject({ id: "accessory-CHEAP_TALISMAN", category: "upgrade" });
    expect(first.recommendations.some((entry) => entry.category === "memory_context")).toBe(true);
    expect(first.recommendations.some((entry) => entry.id === "goal-route")).toBe(true);
    expect(first.recommendations.some((entry) => entry.id === "dungeons-catacombs_24")).toBe(true);
    expect(first.whatToSkip[0]).toMatchObject({ id: "skip-low-impact-detours" });
  });

  test("next-upgrades enforces budget validation and ranks upgrade recommendations", async () => {
    await expect(nextUpgradesFromContext(context(), -1, { accessoriesProvider: () => accessories([]) })).rejects.toThrow("budget must be");
    const result = await nextUpgradesFromContext(context(), 1_000_000, {
      accessoriesProvider: () => accessories([overBudgetUpgrade, unknownPriceUpgrade, upgrade]),
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      id: "accessory-CHEAP_TALISMAN",
      costEstimate: { coins: 800_000, withinBudget: true },
    });
  });

  test("surfaces missing data fallback in plan warnings", async () => {
    const result = await planGoalFromContext(context({ member: {} }), "mining", {
      networthProvider: () => ({ total: null, confidence: "none", warnings: [{ code: "networth_missing" }], providerFreshness: [] }),
      accessoriesProvider: () => accessories([]),
      memories: [],
      config: {},
    });

    expect(result.inputs.readiness[0]).toMatchObject({ area: "mining", rating: "unknown" });
    expect(result.warnings.some((entry) => entry.code === "missing_api_data")).toBe(true);
    expect(result.warnings.some((entry) => entry.code === "networth_missing")).toBe(true);
  });

  test("consumes partial bounded valuation without dropping recommendations", async () => {
    const result = await planGoalFromContext(context(), "f7", {
      budget: 1_000_000,
      networthProvider: () => ({
        status: "partial",
        valuation: { status: "partial", pricedAttemptCount: 1, maxItems: 1 },
        total: 25_000_000,
        confidence: "low",
        warnings: [{ code: "valuation_item_limit_reached" }],
        providerFreshness: [],
      }),
      accessoriesProvider: () => ({
        ...accessories([upgrade]),
        status: "partial",
        valuation: { status: "partial", priceLookupCount: 1, maxPriceLookups: 1 },
        warnings: [{ code: "accessory_price_limit_reached" }],
      }),
      memories: [],
      config: {},
    });

    expect(result.inputs.networth).toMatchObject({ status: "partial", valuation: { pricedAttemptCount: 1 } });
    expect(result.recommendations).toContainEqual(expect.objectContaining({ id: "accessory-CHEAP_TALISMAN" }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "valuation_item_limit_reached" }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_price_limit_reached" }));
  });
});
