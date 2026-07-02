import { gzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import nbt from "prismarine-nbt";
import { buildAgentContext, buildAgentContextFromSnapshot } from "../src/agent-context.ts";
import { buildProfileSnapshot } from "../src/profile-cache.ts";

const uuid = "3206bd83fa494a5e9a1cd165a2728597";

function item(slot: number, id: string, internalId: string, displayName = internalId) {
  return {
    Slot: { type: "byte", value: slot },
    id: { type: "string", value: id },
    Count: { type: "byte", value: 1 },
    Damage: { type: "short", value: 0 },
    tag: {
      type: "compound",
      value: {
        display: { type: "compound", value: { Name: { type: "string", value: displayName } } },
        ExtraAttributes: { type: "compound", value: { id: { type: "string", value: internalId } } },
      },
    },
  };
}

function payload(items: any[]) {
  const root = { type: "compound", name: "", value: { i: { type: "list", value: { type: "compound", value: items } } } };
  return gzipSync(nbt.writeUncompressed(root as any)).toString("base64");
}

function context() {
  return {
    uuid,
    profile: {
      profile_id: "profile-1",
      cute_name: "Apple",
      selected: true,
      game_mode: "normal",
      banking: { balance: 1000 },
      members: {},
    },
    profiles: [],
    member: {
      rawSecretLikeField: "secret-key",
      currencies: { coin_purse: 123 },
      player_data: {
        experience: {
          SKILL_FARMING: 1000,
          SKILL_COMBAT: 1000,
        },
      },
      inventory: {},
      loadout: {
        armor: {
          "1": {
            HELMET: { data: payload([item(0, "minecraft:skull", "NECRON_HELMET")]) },
            CHESTPLATE: { data: payload([item(0, "minecraft:leather_chestplate", "NECRON_CHESTPLATE")]) },
          },
        },
      },
      pets_data: {
        pets: [{ uuid: "pet-1", type: "SHEEP", tier: "LEGENDARY", active: true, exp: 100, heldItem: "PET_ITEM_TEXTBOOK", skin: "BLACK", candyUsed: 2 }],
      },
      accessory_bag_storage: {
        highest_magical_power: 123,
      },
    },
    rateLimit: { limit: "120", remaining: "100", reset: "1" },
  };
}

describe("agent context capsule", () => {
  test("builds compact session context without raw payloads", async () => {
    const base = context();
    let accessoryOptions: Record<string, any> | null = null;
    const capsule = await buildAgentContext(base, {
      now: 1_000,
      snapshot: buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }),
      providers: {
        generatedAt: new Date(1_000).toISOString(),
        providers: [{ id: "pricing", status: "available", source: "test", cache: { entryCount: 1, staleCount: 0 } }],
        warnings: [],
      },
      objectives: {
        kind: "skyagent.objectiveSummary",
        counts: { objective: 1, task: 1, buy: 0, source: 0, snipe: 0 },
        active: [{ id: "objective_1", itemKind: "objective", title: "Prepare M5", status: "active" }],
      },
      accessoriesProvider: async (_member: any, options: Record<string, any>) => {
        accessoryOptions = options;
        return ({
        status: "partial",
        valuation: { status: "partial", priceLookupCount: 75, maxPriceLookups: 75, timeoutMs: 8_000 },
        magicalPower: { estimated: 42, exact: false },
        owned: [{ internalId: "TALISMAN" }],
        activeAccessories: [{ internalId: "TALISMAN" }],
        duplicates: [],
        missing: [{ internalId: "MISSING_TALISMAN" }],
        cheapestMissing: [{ internalId: "MISSING_TALISMAN", name: "Missing Talisman", price: 1000, magicalPower: 3 }],
        providerFreshness: [{ provider: "test", status: "fresh" }],
        warnings: [{ code: "accessory_price_limit_reached", message: "Bounded test" }],
      });
      },
    });

    expect(accessoryOptions).toMatchObject({ budget: null, maxPriceLookups: 75, timeoutMs: 8_000 });
    expect(capsule.kind).toBe("skyagent.agentContext");
    expect(capsule.rawPayloadsIncluded).toBe(false);
    expect(capsule.player.uuid).toBe(uuid);
    expect(capsule.economy.purse).toBe(123);
    expect(capsule.accessories).toMatchObject({
      status: "partial",
      valuation: { status: "partial", maxPriceLookups: 75 },
      magicalPower: { value: 123, source: "profile_official", sourcePath: "member.accessory_bag_storage.highest_magical_power", estimated: 42 },
      ownedCount: 1,
      activeCount: 1,
      missingCount: 1,
    });
    expect(capsule.sections).toMatchObject({
      cache: { status: "fresh", stale: false },
      armor: { status: "missing" },
      pets: { status: "fresh", itemCount: 1 },
      accessories: { status: "partial", itemCount: 1, warningCount: 1 },
      readiness: { status: "fresh" },
      objectives: { status: "fresh", activeCount: 1 },
      providerFreshness: { status: "fresh", providerCount: 1 },
      events: { status: "unavailable", included: false },
    });
    expect(capsule.sections.readiness.areas).toContainEqual(expect.objectContaining({
      area: "dungeons",
      status: "fresh",
      readinessStatus: "estimate",
    }));
    expect(capsule.accessories.warnings).toContainEqual(expect.objectContaining({ code: "accessory_price_limit_reached" }));
    expect(capsule.objectives.active).toContainEqual(expect.objectContaining({ title: "Prepare M5" }));
    expect(capsule.pets.activePet).toMatchObject({
      internalId: "SHEEP",
      tier: "LEGENDARY",
      xp: 100,
      level: null,
      heldItem: "PET_ITEM_TEXTBOOK",
      skin: "BLACK",
      candyUsed: 2,
      active: true,
    });
    expect(capsule.pets.warnings).toContainEqual(expect.objectContaining({ code: "pet_level_formula_unavailable" }));
    expect(capsule.gear.wardrobe).toMatchObject({
      status: "partial",
      sourceKind: "loadout_armor_fallback",
      currentLoadoutFallback: true,
    });
    expect(capsule.gear.wardrobe.warnings).toContainEqual(expect.objectContaining({ code: "current_loadout_unknown" }));
    expect(capsule.gear.wardrobe.items).toContainEqual(expect.objectContaining({
      internalId: "NECRON_HELMET",
      wardrobeSource: "loadout_armor_fallback",
      current: null,
      loadoutSlot: "1",
      armorSlot: "HELMET",
    }));
    expect(capsule.followUpTools.inventory).toContain("skyblock_inventory_section");
    expect(JSON.stringify(capsule)).not.toContain("secret-key");
    expect(JSON.stringify(capsule)).not.toContain("rawSecretLikeField");
  });

  test("builds snapshot-only context for cache-only startup", () => {
    const base = context();
    const capsule = buildAgentContextFromSnapshot(buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }), {
      now: 2_000,
      providers: {
        generatedAt: new Date(2_000).toISOString(),
        providers: [],
        warnings: [],
      },
      objectives: {
        kind: "skyagent.objectiveSummary",
        counts: { objective: 0, task: 0, buy: 1, source: 0, snipe: 0 },
        active: [{ id: "buy_1", itemKind: "buy", title: "Buy Wither Relic", status: "open" }],
      },
    });

    expect(capsule.cache.status).toBe("refreshed");
    expect(capsule.gear.armor).toMatchObject({ status: "missing", available: false, itemCount: null });
    expect(capsule.pets).toMatchObject({ status: "cached", available: true, itemCount: null });
    expect(capsule.accessories).toMatchObject({ status: "missing", magicalPower: null, ownedCount: null });
    expect(capsule.sections).toMatchObject({
      cache: { status: "fresh" },
      armor: { status: "missing" },
      pets: { status: "cached" },
      accessories: { status: "missing" },
      providerFreshness: { status: "unavailable" },
    });
    expect(capsule.readiness.map((entry) => entry.area)).toEqual(["dungeons", "slayer", "kuudra", "garden", "mining"]);
    expect(capsule.warnings).toContainEqual(expect.objectContaining({ code: "snapshot_only_context" }));
    expect(capsule.objectives.active).toContainEqual(expect.objectContaining({ itemKind: "buy" }));
    expect(JSON.stringify(capsule)).not.toContain("secret-key");
  });

  test("pins active pet in compact context even when it is beyond the display limit", async () => {
    const base = context();
    (base.member.pets_data as any).pets = Array.from({ length: 10 }, (_, index) => ({
      uuid: `pet-${index}`,
      type: `PET_${index}`,
      tier: "COMMON",
      active: index === 9,
      exp: index === 9 ? 1 : 10_000 - index,
    }));

    const capsule = await buildAgentContext(base, {
      now: 1_000,
      snapshot: buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }),
      providers: { generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] },
      accessoriesProvider: async () => ({
        status: "fresh",
        valuation: { status: "unavailable" },
        owned: [],
        activeAccessories: [],
        duplicates: [],
        missing: [],
        cheapestMissing: [],
        providerFreshness: [],
        warnings: [],
      }),
    });

    expect(capsule.pets.activePet).toMatchObject({ internalId: "PET_9", active: true, xp: 1 });
    expect(capsule.pets.items).toContainEqual(expect.objectContaining({ internalId: "PET_9", active: true }));
    expect(capsule.pets.items).toHaveLength(8);
  });

  test("keeps official profile Magical Power when accessory-derived estimate is unavailable", async () => {
    const base = context();
    const capsule = await buildAgentContext(base, {
      now: 1_000,
      snapshot: buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }),
      providers: { generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] },
      accessoriesProvider: async () => ({
        status: "partial",
        valuation: { status: "unavailable" },
        owned: [],
        activeAccessories: [],
        duplicates: [],
        missing: [],
        cheapestMissing: [],
        providerFreshness: [],
        warnings: [{ code: "accessory_metadata_unavailable", message: "Metadata unavailable" }],
      }),
    });

    expect(capsule.accessories.magicalPower).toMatchObject({
      value: 123,
      source: "profile_official",
      sourcePath: "member.accessory_bag_storage.highest_magical_power",
      exact: true,
      estimated: null,
    });
  });

  test("aggregates cached and stale provider freshness distinctly", async () => {
    const base = context();
    const provider = async (status: string) => buildAgentContext(base, {
      now: 1_000,
      snapshot: buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }),
      providers: {
        generatedAt: new Date(1_000).toISOString(),
        providers: [{ id: "pricing", status, source: "test", cache: null }],
        warnings: [],
      },
      accessoriesProvider: async () => ({
        status: "partial",
        valuation: { status: "unavailable" },
        owned: [],
        activeAccessories: [],
        duplicates: [],
        missing: [],
        cheapestMissing: [],
        providerFreshness: [],
        warnings: [],
      }),
    });

    await expect(provider("cached")).resolves.toMatchObject({ sections: { providerFreshness: { status: "cached" } } });
    await expect(provider("stale")).resolves.toMatchObject({ sections: { providerFreshness: { status: "stale" } } });
  });

  test("uses enriched cached context summary when snapshot includes one", () => {
    const base = context();
    const snapshot = {
      ...buildProfileSnapshot(base, { ttlMs: 60_000, fetchedAtMs: 1_000 }),
      agentContextSummary: {
        schemaVersion: 1,
        generatedAt: new Date(1_000).toISOString(),
        gear: {
          armor: { available: true, itemCount: 4, sourcePath: "cache.armor", items: [{ name: "Strong Helmet" }], warnings: [] },
          equipment: { available: true, itemCount: 4, sourcePath: "cache.equipment", items: [], warnings: [] },
          wardrobe: { available: true, itemCount: 8, sourcePath: "cache.wardrobe", items: [], warnings: [] },
        },
        pets: { available: true, itemCount: 1, sourcePath: "cache.pets", items: [{ name: "Sheep" }], warnings: [] },
        accessories: { magicalPower: { estimated: 42, exact: false }, ownedCount: 1, activeCount: 1, duplicateCount: 0, missingCount: 1, cheapestMissing: [], providerFreshness: [] },
        readiness: [{ area: "dungeons", rating: "partial", status: "estimate", failedChecks: ["catacombs_24"], warningCount: 0 }],
      },
    };

    const capsule = buildAgentContextFromSnapshot(snapshot, {
      now: 2_000,
      providers: { generatedAt: new Date(2_000).toISOString(), providers: [], warnings: [] },
    });

    expect(capsule.gear.armor).toMatchObject({ available: true, itemCount: 4 });
    expect(capsule.gear.armor).toMatchObject({ status: "cached", freshness: { status: "cached", source: "profile-snapshot-cache" } });
    expect(capsule.pets.items).toContainEqual(expect.objectContaining({ name: "Sheep" }));
    expect(capsule.accessories).toMatchObject({ status: "cached", ownedCount: 1 });
    expect(capsule.readiness).toContainEqual(expect.objectContaining({
      area: "dungeons",
      rating: "partial",
      status: "estimate",
      freshnessStatus: "cached",
    }));
    expect(capsule.sections.readiness).toMatchObject({
      status: "cached",
      areas: [expect.objectContaining({
        area: "dungeons",
        status: "cached",
        readinessStatus: "estimate",
        rating: "partial",
      })],
    });
  });

  test("marks stale snapshot-only sections distinctly", () => {
    const base = context();
    const snapshot = {
      ...buildProfileSnapshot(base, { ttlMs: 1, fetchedAtMs: 1_000 }),
      cacheStatus: "hit",
      stale: true,
      ageMs: 10_000,
    };

    const capsule = buildAgentContextFromSnapshot(snapshot, {
      now: 11_000,
      providers: { generatedAt: new Date(11_000).toISOString(), providers: [], warnings: [] },
    });

    expect(capsule.cache.stale).toBe(true);
    expect(capsule.sections.cache.status).toBe("stale");
    expect(capsule.gear.armor.status).toBe("missing");
    expect(capsule.pets.status).toBe("stale");
    expect(capsule.accessories.status).toBe("missing");
    expect(capsule.warnings).toContainEqual(expect.objectContaining({ code: "snapshot_only_context" }));
    expect(capsule.gear.armor.warnings).toContainEqual(expect.objectContaining({ code: "cached_detail_missing", sourcePath: "overview.inventoryApiSignals.hasArmor" }));
    expect(capsule.gear.armor.warnings).toContainEqual(expect.objectContaining({ code: "stale_profile_snapshot", sourcePath: "profile-snapshot-cache" }));
    expect(capsule.accessories.warnings).toContainEqual(expect.objectContaining({ code: "cached_detail_missing", sourcePath: "overview.inventoryApiSignals.hasAccessoryBag" }));
  });
});
