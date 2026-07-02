import { describe, expect, test } from "bun:test";
import { calculateNetworthFromInventory, itemNetworthFromResult } from "../src/networth.ts";
import { metadataProviderResult } from "../src/items.ts";

function stack(section: string, internalId: string, count = 1, displayName = internalId) {
  return {
    slot: 0,
    index: 0,
    containerId: null,
    itemId: "minecraft:stone",
    internalId,
    count,
    damage: 0,
    displayName,
    extraAttributes: { id: internalId },
    sourcePath: `inventory.${section}`,
  };
}

function priceProvider(prices: Record<string, number | null>) {
  return async (internalId: string) => {
    const value = prices[internalId] ?? null;
    return {
      itemId: internalId,
      price: value,
      currency: "coins",
      confidence: value === null ? "none" : "medium",
      provider: {
        source: "fixture-prices",
        method: "fixture",
        url: null,
        fetchedAt: "2026-07-01T00:00:00.000Z",
        cacheStatus: value === null ? "unavailable" : "hit",
        stale: false,
      },
      fallbackChain: ["fixture"],
      warnings: value === null ? [{ code: "price_unavailable", message: `No price for ${internalId}.` }] : [],
    };
  };
}

function metadataProvider(internalId: string) {
  return metadataProviderResult(internalId, {
    displayname: internalId.replace(/_/g, " "),
    tier: "RARE",
    category: internalId.includes("SWORD") ? "SWORD" : "MISC",
  }, "fixture-neu");
}

describe("networth calculation", () => {
  test("calculates deterministic currency, section, and item totals", async () => {
    const result = await calculateNetworthFromInventory({
      uuid: "player-uuid",
      profile: { profile_id: "profile-id", cute_name: "Apple" },
      member: { currencies: { coin_purse: 1_000 } },
      sections: [
        {
          section: "inventory",
          label: "Inventory",
          available: true,
          sourcePath: "inventory.inv_contents",
          items: [stack("inv_contents", "ENCHANTED_DIAMOND", 4)],
          warnings: [],
        },
        {
          section: "armor",
          label: "Armor",
          available: true,
          sourcePath: "inventory.inv_armor",
          items: [stack("inv_armor", "ASPECT_OF_THE_END", 1)],
          warnings: [],
        },
      ],
      priceProvider: priceProvider({
        ENCHANTED_DIAMOND: 100,
        ASPECT_OF_THE_END: 200_000,
      }),
      metadataProvider,
    });

    expect(result.currency).toEqual({ purse: 1_000, bank: 0, total: 1_000 });
    expect(result.itemTotal).toBe(200_400);
    expect(result.total).toBe(201_400);
    expect(result.sections.find((section) => section.section === "inventory")?.total).toBe(400);
    expect(result.sections.find((section) => section.section === "armor")?.total).toBe(200_000);
    expect(result.providerFreshness).toEqual([{
      source: "fixture-prices",
      method: "fixture",
      url: null,
      cacheStatus: "hit",
      stale: false,
      fetchedAt: "2026-07-01T00:00:00.000Z",
      itemCount: 2,
    }]);
    expect(result.unknownPrices).toEqual([]);
    expect(result.confidence).toBe("medium");
  });

  test("excludes unavailable prices and reports unknowns without inventing values", async () => {
    const result = await calculateNetworthFromInventory({
      profile: { profile_id: "profile-id" },
      member: { currencies: { coin_purse: 5_000 } },
      sections: [{
        section: "wardrobe",
        label: "Wardrobe",
        available: true,
        sourcePath: "inventory.wardrobe_contents",
        items: [stack("wardrobe_contents", "UNKNOWN_VALUABLE", 2)],
        warnings: [],
      }],
      priceProvider: priceProvider({ UNKNOWN_VALUABLE: null }),
      metadataProvider,
    });

    expect(result.currency.total).toBe(5_000);
    expect(result.itemTotal).toBe(0);
    expect(result.total).toBe(5_000);
    expect(result.sections[0].unknownCount).toBe(1);
    expect(result.unknownPrices[0]).toMatchObject({
      section: "wardrobe",
      internalId: "UNKNOWN_VALUABLE",
      count: 2,
    });
    expect(result.confidence).toBe("low");
  });

  test("counts purse and bank independently when only one source object is present", async () => {
    const purseOnly = await calculateNetworthFromInventory({
      member: { currencies: { coin_purse: 123 } },
      sections: [],
      priceProvider: priceProvider({}),
      metadataProvider,
    });
    const bankOnly = await calculateNetworthFromInventory({
      profile: { profile_id: "profile-id", banking: { balance: 456 } },
      sections: [],
      priceProvider: priceProvider({}),
      metadataProvider,
    });

    expect(purseOnly.currency).toEqual({ purse: 123, bank: 0, total: 123 });
    expect(purseOnly.total).toBe(123);
    expect(bankOnly.currency).toEqual({ purse: 0, bank: 456, total: 456 });
    expect(bankOnly.total).toBe(456);
  });

  test("defaults invalid stack counts to one with an explicit warning", async () => {
    const result = await calculateNetworthFromInventory({
      sections: [{
        section: "inventory",
        label: "Inventory",
        available: true,
        sourcePath: "inventory.inv_contents",
        items: [stack("inv_contents", "ENCHANTED_DIAMOND", "bad" as any)],
        warnings: [],
      }],
      priceProvider: priceProvider({ ENCHANTED_DIAMOND: 100 }),
      metadataProvider,
    });

    expect(result.sections[0].items[0].count).toBe(1);
    expect(result.sections[0].items[0].total).toBe(100);
    expect(result.warnings[0]).toMatchObject({
      code: "invalid_stack_count",
      source: "inventory",
      section: "inventory",
      internalId: "ENCHANTED_DIAMOND",
    });
    expect(result.confidence).toBe("low");
  });

  test("projects item-networth confidence and providers to the requested section", async () => {
    const result = await calculateNetworthFromInventory({
      sections: [
        {
          section: "armor",
          label: "Armor",
          available: true,
          sourcePath: "inventory.inv_armor",
          items: [stack("inv_armor", "ASPECT_OF_THE_END", 1)],
          warnings: [],
        },
        {
          section: "inventory",
          label: "Inventory",
          available: true,
          sourcePath: "inventory.inv_contents",
          items: [stack("inv_contents", "UNKNOWN_VALUABLE", 1)],
          warnings: [],
        },
      ],
      priceProvider: priceProvider({
        ASPECT_OF_THE_END: 200_000,
        UNKNOWN_VALUABLE: null,
      }),
      metadataProvider,
    });
    const armor = itemNetworthFromResult(result, "armor");

    expect(result.confidence).toBe("low");
    expect(armor.confidence).toBe("medium");
    expect(armor.providerFreshness).toEqual([{
      source: "fixture-prices",
      method: "fixture",
      url: null,
      cacheStatus: "hit",
      stale: false,
      fetchedAt: "2026-07-01T00:00:00.000Z",
      itemCount: 1,
    }]);
    expect(armor.unknownPrices).toEqual([]);
  });

  test("bounds pricing work and returns compact partial valuation", async () => {
    const result = await calculateNetworthFromInventory({
      sections: [{
        section: "backpacks",
        label: "Backpacks",
        available: true,
        sourcePath: "inventory.backpack_contents",
        items: [
          stack("backpack_contents", "FIRST_ITEM", 1),
          stack("backpack_contents", "SECOND_ITEM", 1),
        ],
        warnings: [],
      }],
      priceProvider: priceProvider({ FIRST_ITEM: 100, SECOND_ITEM: 200 }),
      metadataProvider,
      maxItems: 1,
      includeItems: false,
    });

    expect(result.status).toBe("partial");
    expect(result.valuation).toMatchObject({ status: "partial", pricedAttemptCount: 1, maxItems: 1, itemsIncluded: false });
    expect(result.sections[0]).toMatchObject({ total: 100, pricedCount: 1, unknownCount: 1, valuationStatus: "partial", items: [] });
    expect(result.unknownPrices[0]).toMatchObject({ internalId: "SECOND_ITEM" });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "valuation_item_limit_reached" }));
  });

  test("times out a slow price provider and returns partial networth", async () => {
    const result = await calculateNetworthFromInventory({
      sections: [{
        section: "inventory",
        label: "Inventory",
        available: true,
        sourcePath: "inventory.inv_contents",
        items: [stack("inv_contents", "SLOW_ITEM", 1)],
        warnings: [],
      }],
      priceProvider: () => new Promise(() => {}),
      metadataProvider,
      timeoutMs: 25,
    });

    expect(result.status).toBe("partial");
    expect(result.valuation).toMatchObject({ status: "partial", pricedAttemptCount: 1, timeoutMs: 25 });
    expect(result.sections[0]).toMatchObject({ valuationStatus: "partial", pricedCount: 0, unknownCount: 1 });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "valuation_timeout" }));
  });

  test("keeps stale provider metadata and warnings in compact section output", async () => {
    const result = await calculateNetworthFromInventory({
      sections: [{
        section: "armor",
        label: "Armor",
        available: true,
        sourcePath: "inventory.inv_armor",
        items: [stack("inv_armor", "ASPECT_OF_THE_END", 1)],
        warnings: [],
      }],
      priceProvider: async (internalId: string) => ({
        itemId: internalId,
        price: 200_000,
        confidence: "low",
        provider: {
          source: "fixture-prices",
          method: "stale-fixture",
          url: null,
          cacheStatus: "stale",
          stale: true,
          fetchedAt: "2026-07-01T00:00:00.000Z",
        },
        warnings: [{ code: "stale_cache", message: `Using stale cache for ${internalId}.` }],
      }),
      metadataProvider,
      includeItems: false,
    });
    const armor = itemNetworthFromResult(result, "armor");

    expect(result.sections[0].items).toEqual([]);
    expect(result.sections[0].providerFreshness).toContainEqual(expect.objectContaining({ source: "fixture-prices", cacheStatus: "stale", stale: true }));
    expect(result.sections[0].warnings).toContainEqual(expect.objectContaining({ code: "stale_cache" }));
    expect(armor.providerFreshness).toContainEqual(expect.objectContaining({ source: "fixture-prices", cacheStatus: "stale", stale: true }));
    expect(armor.confidence).toBe("low");
  });
});
