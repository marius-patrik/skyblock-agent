import { describe, expect, test } from "bun:test";
import { buildAgentContext, buildAgentContextFromSnapshot } from "../src/agent-context.ts";
import { buildProfileSnapshot } from "../src/profile-cache.ts";

const uuid = "3206bd83fa494a5e9a1cd165a2728597";

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
      pets_data: {
        pets: [{ uuid: "pet-1", type: "SHEEP", active: true, exp: 100 }],
      },
    },
    rateLimit: { limit: "120", remaining: "100", reset: "1" },
  };
}

describe("agent context capsule", () => {
  test("builds compact session context without raw payloads", async () => {
    const base = context();
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
      accessoriesProvider: async () => ({
        magicalPower: { estimated: 42, exact: false },
        owned: [{ internalId: "TALISMAN" }],
        activeAccessories: [{ internalId: "TALISMAN" }],
        duplicates: [],
        missing: [{ internalId: "MISSING_TALISMAN" }],
        cheapestMissing: [{ internalId: "MISSING_TALISMAN", name: "Missing Talisman", price: 1000, magicalPower: 3 }],
        providerFreshness: [{ provider: "test", status: "fresh" }],
        warnings: [],
      }),
    });

    expect(capsule.kind).toBe("skyagent.agentContext");
    expect(capsule.rawPayloadsIncluded).toBe(false);
    expect(capsule.player.uuid).toBe(uuid);
    expect(capsule.economy.purse).toBe(123);
    expect(capsule.accessories).toMatchObject({ ownedCount: 1, activeCount: 1, missingCount: 1 });
    expect(capsule.objectives.active).toContainEqual(expect.objectContaining({ title: "Prepare M5" }));
    expect(capsule.pets.activePet).toMatchObject({ internalId: "SHEEP", active: true });
    expect(capsule.pets.items).toContainEqual(expect.objectContaining({ internalId: "SHEEP", active: true }));
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
    expect(capsule.gear.armor).toMatchObject({ available: false, itemCount: null });
    expect(capsule.pets).toMatchObject({ available: true, itemCount: null });
    expect(capsule.accessories).toMatchObject({ magicalPower: null, ownedCount: null });
    expect(capsule.readiness.map((entry) => entry.area)).toEqual(["dungeons", "slayer", "kuudra", "garden", "mining"]);
    expect(capsule.warnings).toContainEqual(expect.objectContaining({ code: "snapshot_only_context" }));
    expect(capsule.objectives.active).toContainEqual(expect.objectContaining({ itemKind: "buy" }));
    expect(JSON.stringify(capsule)).not.toContain("secret-key");
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
    expect(capsule.pets.items).toContainEqual(expect.objectContaining({ name: "Sheep" }));
    expect(capsule.accessories).toMatchObject({ ownedCount: 1 });
    expect(capsule.readiness).toContainEqual(expect.objectContaining({ area: "dungeons", rating: "partial" }));
  });
});
