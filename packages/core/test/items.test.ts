import { describe, expect, test } from "bun:test";
import { itemMetadata, metadataProviderResult, normalizeItemStackRecord, normalizeItemStacks, type ItemMetadataResult } from "../src/items.ts";

function provider(internalId: string, metadata: Record<string, any> | null = {}): ItemMetadataResult {
  return {
    ...metadataProviderResult(internalId, metadata, "fixture-neu"),
    provider: {
      source: "fixture-neu",
      version: "test",
      fetchedAt: "2026-07-01T00:00:00.000Z",
      cacheStatus: metadata ? "hit" : "unavailable",
    },
  };
}

function stack(internalId: string, extraAttributes: Record<string, any> = {}, overrides: Record<string, any> = {}) {
  return {
    slot: 0,
    index: 0,
    containerId: null,
    itemId: "minecraft:stone",
    internalId,
    count: 1,
    damage: 0,
    displayName: `§6${internalId}`,
    extraAttributes: {
      id: internalId,
      ...extraAttributes,
    },
    sourcePath: "inventory.inv_contents",
    ...overrides,
  };
}

describe("item normalization", () => {
  test("normalizes weapon upgrades and metadata", () => {
    const normalized = normalizeItemStackRecord(stack("HYPERION", {
      modifier: "heroic",
      enchantments: { ultimate_wise: 5, smite: 7 },
      hot_potato_count: 15,
      upgrade_level: 5,
      master_star_count: 2,
      rarity_upgrades: 1,
      runes: { MUSIC: 3 },
      skin: "WITHER_IMPACT",
    }), provider("HYPERION", {
      displayname: "§6Hyperion",
      tier: "LEGENDARY",
      category: "SWORD",
    }));

    expect(normalized).toMatchObject({
      internalId: "HYPERION",
      cleanName: "Hyperion",
      rarity: "LEGENDARY",
      category: "SWORD",
      reforge: "heroic",
      hotPotatoCount: 15,
      fumingPotatoCount: 5,
      stars: 5,
      masterStars: 2,
      recombobulated: true,
      rune: { MUSIC: 3 },
      skin: "WITHER_IMPACT",
      rawNbtPointer: {
        sourcePath: "inventory.inv_contents",
        slot: 0,
        index: 0,
        containerId: null,
      },
    });
    expect(normalized.enchantments).toEqual({ ultimate_wise: 5, smite: 7 });
  });

  test("exposes provider freshness and modifier uncertainty", () => {
    const normalized = normalizeItemStackRecord(stack("ASPECT_OF_THE_END", {
      modifier: "warped",
      enchantments: { sharpness: 5 },
    }), provider("ASPECT_OF_THE_END", {
      displayname: "§9Aspect of the End",
      tier: "RARE",
      category: "SWORD",
    }));

    expect(normalized).toMatchObject({
      internalId: "ASPECT_OF_THE_END",
      cleanName: "Aspect of the End",
      rarity: "RARE",
      category: "SWORD",
      metadataProvider: {
        source: "fixture-neu",
        url: null,
        version: "test",
      },
      metadataProviderFreshness: {
        source: "fixture-neu",
        providerKind: "item-metadata",
        fetchedAt: "2026-07-01T00:00:00.000Z",
        cacheStatus: "hit",
      },
      modifierUncertainty: {
        enchantments: {
          status: "observed_profile_modifier",
          value: { sharpness: 5 },
        },
        valuation: {
          status: "unsupported_modifier_value",
          estimated: true,
        },
        museum: {
          status: "unsupported_eligibility_value",
          estimated: true,
        },
      },
    });
  });

  test("normalizes armor dungeon quality", () => {
    const normalized = normalizeItemStackRecord(stack("SHADOW_ASSASSIN_CHESTPLATE", {
      dungeon_item_level: 5,
      baseStatBoostPercentage: 49,
      dye_item: "PURE_BLACK_DYE",
    }), provider("SHADOW_ASSASSIN_CHESTPLATE", {
      displayname: "§5Shadow Assassin Chestplate",
      tier: "EPIC",
      category: "CHESTPLATE",
    }));

    expect(normalized.category).toBe("CHESTPLATE");
    expect(normalized.dungeonized).toBe(true);
    expect(normalized.dungeonItemQuality).toBe(49);
    expect(normalized.dye).toBe("PURE_BLACK_DYE");
  });

  test("keeps stable provider identity deterministic while exposing provider freshness", () => {
    const first = provider("HYPERION", { tier: "LEGENDARY", category: "SWORD" });
    const second = {
      ...first,
      provider: {
        ...first.provider,
        fetchedAt: "2026-07-01T01:23:45.000Z",
        cacheStatus: "miss" as const,
      },
    };

    const firstRecord = normalizeItemStackRecord(stack("HYPERION"), first);
    const secondRecord = normalizeItemStackRecord(stack("HYPERION"), second);

    expect(firstRecord.metadataProvider).toEqual(secondRecord.metadataProvider);
    expect(firstRecord.metadataProviderFreshness.fetchedAt).not.toBe(secondRecord.metadataProviderFreshness.fetchedAt);
    expect(firstRecord.modifierUncertainty.providerFreshness.fetchedAt).not.toBe(secondRecord.modifierUncertainty.providerFreshness.fetchedAt);
  });

  test("normalizes accessories, gemstones, and attributes", () => {
    const normalized = normalizeItemStackRecord(stack("WITHER_RELIC", {
      attributes: { dominance: 4, vitality: 3 },
      gems: { JADE_0: "PERFECT", AMBER_0: "FINE" },
      gemslot_0: "JADE",
      new_years_cake: 127,
    }), provider("WITHER_RELIC", {
      displayname: "§5Wither Relic",
      tier: "EPIC",
      category: "ACCESSORY",
    }));

    expect(normalized.category).toBe("ACCESSORY");
    expect(normalized.attributes).toEqual({ dominance: 4, vitality: 3 });
    expect(normalized.gemstones).toEqual({ JADE_0: "PERFECT", AMBER_0: "FINE" });
    expect(normalized.gemstoneSlots).toEqual([{ id: "0", value: "JADE" }]);
    expect(normalized.cakeYear).toBe(127);
  });

  test("normalizes pet info and held items", () => {
    const normalized = normalizeItemStackRecord(stack("PET", {
      petInfo: JSON.stringify({
        type: "GOLDEN_DRAGON",
        tier: "LEGENDARY",
        heldItem: "PET_ITEM_TIER_BOOST",
        skin: "GOLDEN_DRAGON_ANCIENT",
      }),
    }, {
      displayName: "§6[Lvl 200] Golden Dragon",
    }), provider("PET", {
      displayname: "§6Golden Dragon",
      tier: "LEGENDARY",
      category: "PET",
    }));

    expect(normalized.cleanName).toBe("Golden Dragon");
    expect(normalized.petItem).toBe("PET_ITEM_TIER_BOOST");
    expect(normalized.heldItem).toBe("PET_ITEM_TIER_BOOST");
    expect(normalized.skin).toBe("GOLDEN_DRAGON_ANCIENT");
    expect(normalized.specialModifiers.petInfo.type).toBe("GOLDEN_DRAGON");
  });

  test("normalizes multiple stacks with metadata fallback warnings", async () => {
    const result = await normalizeItemStacks([
      stack("HYPERION"),
      stack("UNKNOWN_TEST_ITEM"),
    ], {
      metadataProvider: (internalId) => provider(internalId, internalId === "HYPERION" ? { tier: "LEGENDARY", category: "SWORD" } : null),
    });

    expect(result.itemCount).toBe(2);
    expect(result.items[0].rarity).toBe("LEGENDARY");
    expect(result.items[1].warnings[0].code).toBe("metadata_unavailable");
    expect(result.providerProvenance[0].provider.fetchedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(result.warnings.map((warning) => warning.code)).toContain("metadata_unavailable");
    expect(result.warnings.map((warning) => warning.code)).toContain("modifier_metadata_unavailable");
  });
});

describe("NEU metadata provider", () => {
  test("fetches item metadata and returns provider provenance", async () => {
    const result = await itemMetadata("HYPERION", {
      useCache: false,
      fetchImpl: async (url) => new Response(JSON.stringify({ displayname: "§6Hyperion", tier: "LEGENDARY" }), { status: 200 }),
    });

    expect(result.metadata?.tier).toBe("LEGENDARY");
    expect(result.provider.source).toBe("NotEnoughUpdates-REPO");
    expect(result.provider.url).toContain("/items/HYPERION.json");
    expect(result.provider.cacheStatus).toBe("miss");
  });

  test("returns fallback warnings when metadata provider is unavailable", async () => {
    const result = await itemMetadata("MISSING_ITEM", {
      useCache: false,
      fetchImpl: async () => new Response("not found", { status: 404 }),
    });

    expect(result.metadata).toBeNull();
    expect(result.provider.cacheStatus).toBe("unavailable");
    expect(result.warnings[0].code).toBe("metadata_missing");
  });
});
