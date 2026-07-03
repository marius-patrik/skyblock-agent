import { gzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import nbt from "prismarine-nbt";
import { accessoryMetadataProviderResult, calculateAccessoriesFromMember, hypixelAccessoryMetadataProvider, unavailableAccessoryMetadataProvider } from "../src/accessories.ts";
import { metadataProviderResult } from "../src/items.ts";

function item(slot: number, internalId: string, _rarity = "RARE", extra: Record<string, any> = {}) {
  return {
    Slot: { type: "byte", value: slot },
    id: { type: "string", value: "minecraft:skull" },
    Count: { type: "byte", value: 1 },
    Damage: { type: "short", value: 0 },
    tag: {
      type: "compound",
      value: {
        display: {
          type: "compound",
          value: {
            Name: { type: "string", value: internalId },
          },
        },
        ExtraAttributes: {
          type: "compound",
          value: {
            id: { type: "string", value: internalId },
            ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, { type: "string", value: String(value) }])),
          },
        },
      },
    },
  };
}

function payload(items: any[]) {
  return gzipSync(nbt.writeUncompressed({
    type: "compound",
    name: "",
    value: {
      i: {
        type: "list",
        value: {
          type: "compound",
          value: items,
        },
      },
    },
  } as any)).toString("base64");
}

function memberWithAccessories(items: any[]) {
  return {
    inventory: {
      bag_contents: { data: payload(items) },
    },
  };
}

function memberWithCurrentAccessoryBag(items: any[]) {
  return {
    inventory: {
      bag_contents: {
        talisman_bag: { data: payload(items) },
      },
    },
  };
}

function metadataProvider(internalId: string) {
  const tiers = {
    SPEED_TALISMAN: "COMMON",
    SPEED_RING: "UNCOMMON",
    SPEED_ARTIFACT: "RARE",
    VACCINE_TALISMAN: "COMMON",
    SHINY_RELIC: "EPIC",
  };
  return metadataProviderResult(internalId, {
    displayname: internalId.replace(/_/g, " "),
    tier: tiers[internalId] ?? "COMMON",
    category: "ACCESSORY",
  }, "fixture-neu");
}

function priceProvider(prices: Record<string, number | null>) {
  return async (internalId: string) => ({
    itemId: internalId,
    price: prices[internalId] ?? null,
    currency: "coins",
    confidence: prices[internalId] == null ? "none" : "medium",
    provider: {
      source: "fixture-prices",
      method: "fixture",
      url: null,
      fetchedAt: "2026-07-01T00:00:00.000Z",
      cacheStatus: prices[internalId] == null ? "unavailable" : "hit",
      stale: false,
    },
    fallbackChain: ["fixture"],
    warnings: prices[internalId] == null ? [{ code: "price_unavailable", message: `No price for ${internalId}.` }] : [],
  });
}

const accessoryUniverse = () => accessoryMetadataProviderResult([
  { internalId: "SPEED_TALISMAN", displayName: "Speed Talisman", rarity: "COMMON", family: "SPEED" },
  { internalId: "SPEED_RING", displayName: "Speed Ring", rarity: "UNCOMMON", family: "SPEED" },
  { internalId: "SPEED_ARTIFACT", displayName: "Speed Artifact", rarity: "RARE", family: "SPEED" },
  { internalId: "VACCINE_TALISMAN", displayName: "Vaccine Talisman", rarity: "COMMON", family: "VACCINE" },
  { internalId: "SHINY_RELIC", displayName: "Shiny Relic", rarity: "EPIC", family: "SHINY", magicalPower: 12 },
], "fixture-accessories");

describe("accessory analysis", () => {
  test("detects active accessories, duplicates, recombobulation, enrichment, and missing families", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "SPEED_TALISMAN", "COMMON"),
      item(1, "SPEED_RING", "UNCOMMON", { rarity_upgrades: 1, talisman_enrichment: "strength" }),
      item(2, "VACCINE_TALISMAN", "COMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({ SPEED_ARTIFACT: 900_000, SHINY_RELIC: 2_400_000 }),
    });

    expect(result.activeAccessories.map((entry) => entry.internalId).sort()).toEqual(["SPEED_RING", "VACCINE_TALISMAN"]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.activeAccessories.find((entry) => entry.internalId === "SPEED_RING")?.recombobulated).toBe(true);
    expect(result.activeAccessories.find((entry) => entry.internalId === "SPEED_RING")?.enrichment.enriched).toBe(true);
    expect(result.activeAccessories.find((entry) => entry.internalId === "SPEED_RING")).toMatchObject({
      family: "SPEED",
      familyConfidence: "provider_backed",
      familyProviderFreshness: {
        providerKind: "accessory-metadata",
        source: "fixture-accessories",
      },
    });
    expect(result.magicalPower.estimated).toBe(11);
    expect(result.missing.map((entry) => entry.internalId).sort()).toEqual(["SHINY_RELIC", "SPEED_ARTIFACT"]);
  });

  test("does not recommend lower-tier duplicates when a higher family tier is active", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "SPEED_TALISMAN", "COMMON"),
      item(1, "SPEED_RING", "UNCOMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({
        SPEED_TALISMAN: 90_000,
        SPEED_ARTIFACT: 700_000,
      }),
    });

    expect(result.duplicates.map((entry) => entry.internalId)).toContain("SPEED_TALISMAN");
    expect(result.missing.map((entry) => entry.internalId)).not.toContain("SPEED_TALISMAN");
    expect(result.upgrades.map((entry) => entry.internalId)).toContain("SPEED_ARTIFACT");
  });

  test("reads owned accessories from the current bag map talisman payload", async () => {
    const result = await calculateAccessoriesFromMember(memberWithCurrentAccessoryBag([
      item(0, "SPEED_TALISMAN", "COMMON"),
      item(1, "VACCINE_TALISMAN", "COMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({ SPEED_RING: 250_000 }),
    });

    expect(result.activeAccessories.map((entry) => entry.internalId).sort()).toEqual(["SPEED_TALISMAN", "VACCINE_TALISMAN"]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain("missing_nbt_payload");
  });

  test("normalizes very special rarity and special recombobulation MP", async () => {
    const universe = () => accessoryMetadataProviderResult([
      { internalId: "SPECIAL_THING", displayName: "Special Thing", rarity: "SPECIAL", family: "SPECIAL_THING" },
      { internalId: "VERY_SPECIAL_THING", displayName: "Very Special Thing", rarity: "VERY_SPECIAL", family: "VERY_SPECIAL_THING" },
    ], "fixture-accessories");
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "SPECIAL_THING", "SPECIAL", { rarity_upgrades: 1 }),
      item(1, "VERY_SPECIAL_THING", "VERY_SPECIAL"),
    ]), {
      metadataProvider: (internalId) => metadataProviderResult(internalId, {
        displayname: internalId,
        tier: internalId === "SPECIAL_THING" ? "SPECIAL" : "VERY_SPECIAL",
        category: "ACCESSORY",
      }, "fixture-neu"),
      accessoryMetadataProvider: universe,
      priceProvider: priceProvider({}),
    });

    expect(result.activeAccessories.map((entry) => [entry.internalId, entry.magicalPower])).toEqual([
      ["SPECIAL_THING", 5],
      ["VERY_SPECIAL_THING", 5],
    ]);
  });

  test("ranks upgrades by coin per magical power and filters by budget", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "VACCINE_TALISMAN", "COMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({
        SPEED_TALISMAN: 90_000,
        SHINY_RELIC: 2_400_000,
      }),
      budget: 100_000,
    });

    expect(result.cheapestMissing.map((entry) => [entry.internalId, entry.coinPerMagicalPower])).toMatchInlineSnapshot(`
      [
        [
          "SPEED_TALISMAN",
          30000,
        ],
        [
          "SHINY_RELIC",
          200000,
        ],
      ]
    `);
    expect(result.upgrades.map((entry) => entry.internalId)).toEqual(["SPEED_TALISMAN"]);
  });

  test("bounds accessory price lookups and returns partial valuation", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({
        SPEED_TALISMAN: 90_000,
        SPEED_RING: 250_000,
        SPEED_ARTIFACT: 700_000,
        VACCINE_TALISMAN: 50_000,
        SHINY_RELIC: 2_400_000,
      }),
      maxPriceLookups: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.valuation).toMatchObject({ status: "partial", priceLookupCount: 1, maxPriceLookups: 1 });
    expect(result.cheapestMissing).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_price_limit_reached" }));
  });

  test("times out a slow accessory price provider and returns partial valuation", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([]), {
      metadataProvider,
      accessoryMetadataProvider: () => accessoryMetadataProviderResult([
        { internalId: "SPEED_TALISMAN", displayName: "Speed Talisman", rarity: "COMMON", family: "SPEED" },
      ], "fixture-accessories"),
      priceProvider: () => new Promise(() => {}),
      timeoutMs: 25,
    });

    expect(result.status).toBe("partial");
    expect(result.valuation).toMatchObject({ status: "partial", priceLookupCount: 1, timeoutMs: 25 });
    expect(result.cheapestMissing).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_price_timeout" }));
  });

  test("surfaces stale accessory price cache warnings and provider freshness", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([]), {
      metadataProvider,
      accessoryMetadataProvider: () => accessoryMetadataProviderResult([
        { internalId: "SPEED_TALISMAN", displayName: "Speed Talisman", rarity: "COMMON", family: "SPEED" },
      ], "fixture-accessories"),
      priceProvider: async (internalId: string) => ({
        itemId: internalId,
        price: 90_000,
        confidence: "low",
        provider: {
          source: "fixture-prices",
          method: "stale-fixture",
          cacheStatus: "stale",
          stale: true,
          fetchedAt: "2026-07-01T00:00:00.000Z",
        },
        warnings: [{ code: "stale_cache", message: `Using stale cache for ${internalId}.` }],
      }),
    });

    expect(result.status).toBe("complete");
    expect(result.providerFreshness).toContainEqual(expect.objectContaining({ source: "fixture-prices", cacheStatus: "stale" }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "stale_cache" }));
  });

  test("recommends higher-tier accessories within an owned upgrade family", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "SPEED_TALISMAN", "COMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: accessoryUniverse,
      priceProvider: priceProvider({
        SPEED_RING: 250_000,
        SPEED_ARTIFACT: 700_000,
      }),
    });

    expect(result.missing.map((entry) => entry.internalId)).toContain("SPEED_RING");
    expect(result.missing.map((entry) => entry.internalId)).toContain("SPEED_ARTIFACT");
    expect(result.upgrades.map((entry) => [entry.internalId, entry.magicalPowerGain])).toContainEqual(["SPEED_RING", 2]);
    expect(result.upgrades.map((entry) => entry.internalId)).not.toContain("SPEED_ARTIFACT");
  });

  test("surfaces missing metadata fallback behavior", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "SPEED_TALISMAN", "COMMON"),
    ]), {
      metadataProvider,
      accessoryMetadataProvider: unavailableAccessoryMetadataProvider,
      priceProvider: priceProvider({}),
    });

    expect(result.providerFreshness[0].cacheStatus).toBe("unavailable");
    expect(result.warnings.some((warning) => warning.code === "accessory_metadata_unavailable")).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("does not treat generic item metadata family fields as accessory-chain authority", async () => {
    const result = await calculateAccessoriesFromMember(memberWithAccessories([
      item(0, "GENERIC_FAMILY_TALISMAN", "COMMON"),
    ]), {
      metadataProvider: (internalId) => metadataProviderResult(internalId, {
        displayname: "Generic Family Talisman",
        tier: "COMMON",
        category: "ACCESSORY",
        family: "GENERIC_METADATA_FAMILY",
        baseId: "GENERIC_METADATA_BASE",
      }, "fixture-neu"),
      accessoryMetadataProvider: unavailableAccessoryMetadataProvider,
      priceProvider: priceProvider({}),
    });

    expect(result.activeAccessories[0]).toMatchObject({
      internalId: "GENERIC_FAMILY_TALISMAN",
      family: "GENERIC_FAMILY_TALISMAN",
      familyConfidence: "id_fallback",
    });
    expect(result.activeAccessories[0].familyWarnings).toContainEqual(expect.objectContaining({ code: "accessory_family_metadata_incomplete" }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_family_metadata_incomplete" }));
  });

  test("maps Hypixel item resources into accessory universe metadata", async () => {
    const result = await hypixelAccessoryMetadataProvider({
      requestImpl: async () => ({
        url: "https://api.hypixel.net/v2/resources/skyblock/items",
        body: {
          items: [
            { id: "SPEED_TALISMAN", name: "Speed Talisman", tier: "COMMON", category: "ACCESSORY" },
            { id: "SPEED_RING", name: "Speed Ring", tier: "UNCOMMON", category: "ACCESSORY" },
            { id: "ASPECT_OF_THE_END", name: "Aspect of the End", tier: "RARE", category: "SWORD" },
          ],
        },
      }),
    });

    expect(result.accessories.map((entry) => entry.internalId)).toEqual(["SPEED_TALISMAN", "SPEED_RING"]);
    expect(result.accessories[0].family).toBe("SPEED_TALISMAN");
    expect(result.accessories[0].familyConfidence).toBe("id_fallback");
    expect(result.provider.source).toBe("Hypixel Resources");
    expect(result.provider).toMatchObject({
      providerKind: "accessory-metadata",
      authority: "official",
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_family_metadata_incomplete" }));
  });

  test("warns when maintained accessory universe entries fall back to item-id families", async () => {
    const universe = () => accessoryMetadataProviderResult([
      { internalId: "FALLBACK_TALISMAN", displayName: "Fallback Talisman", rarity: "COMMON" },
    ], "fixture-accessories");

    const result = await calculateAccessoriesFromMember(memberWithAccessories([]), {
      metadataProvider,
      accessoryMetadataProvider: universe,
      priceProvider: priceProvider({ FALLBACK_TALISMAN: 10_000 }),
    });

    expect(result.missing[0]).toMatchObject({
      internalId: "FALLBACK_TALISMAN",
      family: "FALLBACK_TALISMAN",
      familyConfidence: "id_fallback",
      familyWarnings: [expect.objectContaining({ code: "accessory_family_metadata_incomplete" })],
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "accessory_family_metadata_incomplete" }));
  });
});
