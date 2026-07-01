import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "bun:test";
import nbt from "prismarine-nbt";
import { bazaarPrice, clearPriceCache, coflnetLowestBin, coflnetPriceHistory, hypixelLowestBin, itemPrice, lowestBin } from "../src/prices.ts";

afterEach(() => {
  clearPriceCache();
});

function bazaarFixture() {
  return {
    url: "https://api.hypixel.net/v2/skyblock/bazaar",
    body: {
      products: {
        ENCHANTED_DIAMOND: {
          product_id: "ENCHANTED_DIAMOND",
          quick_status: {
            buyPrice: 1600,
            sellPrice: 1500,
            buyMovingWeek: 100000,
            sellMovingWeek: 90000,
            buyVolume: 5000,
            sellVolume: 6000,
          },
        },
      },
    },
  };
}

function auctionPayload(internalId: string) {
  const root = {
    type: "compound",
    name: "",
    value: {
      i: {
        type: "list",
        value: {
          type: "compound",
          value: [{
            id: { type: "string", value: "minecraft:diamond_sword" },
            Count: { type: "byte", value: 1 },
            tag: {
              type: "compound",
              value: {
                ExtraAttributes: {
                  type: "compound",
                  value: {
                    id: { type: "string", value: internalId },
                  },
                },
              },
            },
          }],
        },
      },
    },
  };
  return { type: 0, data: gzipSync(nbt.writeUncompressed(root as any)).toString("base64") };
}

describe("price providers", () => {
  test("resolves known Bazaar item pricing", async () => {
    const result = await bazaarPrice("ENCHANTED_DIAMOND", { bazaarResponse: bazaarFixture() });

    expect(result).toMatchObject({
      itemId: "ENCHANTED_DIAMOND",
      price: 1600,
      instantBuyPrice: 1600,
      instantSellPrice: 1500,
      confidence: "high",
      provider: {
        source: "Hypixel Bazaar",
        method: "bazaar_quick_status",
        cacheStatus: "disabled",
      },
      fallbackChain: ["hypixel_bazaar"],
      warnings: [],
    });
  });

  test("preserves Bazaar provider metadata for missing products", async () => {
    const result = await bazaarPrice("HYPERION", { bazaarResponse: bazaarFixture() });

    expect(result.price).toBeNull();
    expect(result.provider).toMatchObject({
      source: "Hypixel Bazaar",
      method: "bazaar_quick_status",
      cacheStatus: "disabled",
      stale: false,
    });
    expect(result.warnings[0]).toMatchObject({
      code: "price_unavailable",
      message: "No Bazaar product found for HYPERION.",
    });
  });

  test("marks stale Bazaar cache results with warnings", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls += 1;
      requestedUrls.push(String(input));
      if (calls === 1) {
        return new Response(JSON.stringify(bazaarFixture().body), { status: 200 });
      }
      throw new Error("network down");
    }) as unknown as typeof fetch;
    try {
      await bazaarPrice("ENCHANTED_DIAMOND", { ttlMs: -1 });
      const result = await bazaarPrice("ENCHANTED_DIAMOND", { ttlMs: -1 });

      expect(result.price).toBe(1600);
      expect(requestedUrls).toEqual([
        "https://api.hypixel.net/v2/skyblock/bazaar",
        "https://api.hypixel.net/v2/skyblock/bazaar",
      ]);
      expect(result.provider.cacheStatus).toBe("stale");
      expect(result.provider.stale).toBe(true);
      expect(result.warnings[0]).toMatchObject({
        code: "stale_cache",
        message: "Using stale Hypixel Bazaar cache because refresh failed.",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("falls back from missing Bazaar product to CoflNet LBIN", async () => {
    const result = await itemPrice("HYPERION", {
      bazaarResponse: bazaarFixture(),
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "expensive", tag: "HYPERION", startingBid: 2_000_000_000, bin: true },
        { uuid: "cheap", tag: "HYPERION", startingBid: 1_900_000_000, bin: true },
      ]), { status: 200 }),
    });

    expect(result.price).toBe(1_900_000_000);
    expect((result as any).auction.uuid).toBe("cheap");
    expect(result.provider.source).toBe("CoflNet");
    expect(result.fallbackChain).toEqual(["hypixel_bazaar", "coflnet_lbin"]);
    expect(result.warnings[0].code).toBe("price_unavailable");
  });

  test("returns unavailable result for provider outage", async () => {
    const result = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response("bad gateway", { status: 502 }),
    });

    expect(result.price).toBeNull();
    expect(result.provider.cacheStatus).toBe("unavailable");
    expect(result.warnings[0].code).toBe("price_unavailable");
  });

  test("rejects malformed CoflNet LBIN prices instead of inventing a value", async () => {
    const result = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "missing", tag: "HYPERION", bin: true },
        { uuid: "null", tag: "HYPERION", startingBid: null, bin: true },
        { uuid: "zero", tag: "HYPERION", startingBid: 0, bin: true },
        { uuid: "nan", tag: "HYPERION", startingBid: "not-a-number", bin: true },
      ]), { status: 200 }),
    });

    expect(result.price).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.provider.source).toBe("CoflNet");
    expect(result.provider.cacheStatus).toBe("miss");
    expect(result.warnings[0]).toMatchObject({
      code: "price_unavailable",
      message: "No active BIN auctions with a valid positive price found for HYPERION.",
    });
  });

  test("accepts keyed CoflNet-compatible LBIN payloads", async () => {
    const result = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify({
        expensive: { uuid: "expensive", tag: "HYPERION", startingBid: 2_000_000_000, bin: true },
        cheap: { uuid: "cheap", tag: "HYPERION", startingBid: 1_900_000_000, bin: true },
      }), { status: 200 }),
    });

    expect(result.price).toBe(1_900_000_000);
    expect((result as any).auction.uuid).toBe("cheap");
    expect(result.provider.source).toBe("CoflNet");
  });

  test("accepts CoflNet item identity fields", async () => {
    const stringIdentity = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "string-item", item: "HYPERION", startingBid: 1_900_000_000, bin: true },
      ]), { status: 200 }),
    });

    clearPriceCache();

    const objectIdentity = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "object-item", item: { tag: "HYPERION" }, startingBid: 1_800_000_000, bin: true },
      ]), { status: 200 }),
    });

    expect(stringIdentity.price).toBe(1_900_000_000);
    expect((stringIdentity as any).identityConfirmed).toBe(true);
    expect(stringIdentity.confidence).toBe("medium");
    expect(objectIdentity.price).toBe(1_800_000_000);
    expect((objectIdentity as any).identityConfirmed).toBe(true);
    expect(objectIdentity.confidence).toBe("medium");
  });

  test("refuses CoflNet LBIN payloads without matching item identity", async () => {
    const result = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "wrong", tag: "ASPECT_OF_THE_END", startingBid: 1, bin: true },
      ]), { status: 200 }),
    });

    expect(result.price).toBeNull();
    expect(result.confidence).toBe("none");
    expect(result.provider.source).toBe("CoflNet");
    expect(result.warnings[0]).toMatchObject({
      code: "identity_mismatch",
      message: "CoflNet LBIN payload only included active BIN auctions with confirmed item ids that did not match HYPERION.",
    });
  });

  test("accepts untagged CoflNet records from the item-scoped endpoint", async () => {
    const result = await coflnetLowestBin("HYPERION", {
      fetchImpl: async () => new Response(JSON.stringify([
        { uuid: "expensive", startingBid: 2_000_000_000, bin: true },
        { uuid: "cheap", startingBid: 1_900_000_000, bin: true },
      ]), { status: 200 }),
    });

    expect(result.price).toBe(1_900_000_000);
    expect((result as any).auction.uuid).toBe("cheap");
    expect(result.confidence).toBe("low");
    expect((result as any).identityConfirmed).toBe(false);
    expect(result.warnings[0]).toMatchObject({
      code: "identity_unconfirmed",
      message: "CoflNet LBIN record did not include an item identity field; trusting the item-scoped endpoint URL.",
    });
  });


  test("resolves Hypixel auction-only LBIN by decoding auction item bytes", async () => {
    const result = await hypixelLowestBin("HYPERION", {
      auctionResponses: [{
        auctions: [
          { uuid: "wrong", bin: true, starting_bid: 1, item_bytes: auctionPayload("ASPECT_OF_THE_END") },
          { uuid: "expensive", bin: true, starting_bid: 2_000_000_000, item_bytes: auctionPayload("HYPERION") },
          { uuid: "cheap", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
        ],
      }],
    });

    expect(result.price).toBe(1_900_000_000);
    expect((result as any).auction.uuid).toBe("cheap");
    expect(result.provider.source).toBe("Hypixel Auctions");
    expect(result.provider.cacheStatus).toBe("disabled");
  });

  test("marks bounded Hypixel auction scans as partial low-confidence results", async () => {
    const result = await hypixelLowestBin("HYPERION", {
      auctionResponses: [{
        totalPages: 3,
        auctions: [
          { uuid: "cheap", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
        ],
      }],
    });

    expect(result.price).toBeNull();
    expect((result as any).candidatePrice).toBe(1_900_000_000);
    expect(result.confidence).toBe("low");
    expect(result.warnings[0].code).toBe("partial_auction_scan");
  });

  test("marks live Hypixel scans partial when maxPages stops before known total pages", async () => {
    let calls = 0;
    const result = await hypixelLowestBin("HYPERION", {
      maxPages: 1,
      requestImpl: async () => {
        calls += 1;
        return {
          body: {
            totalPages: 3,
            auctions: [
              { uuid: "cheap", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
            ],
          },
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.price).toBeNull();
    expect((result as any).candidatePrice).toBe(1_900_000_000);
    expect(result.confidence).toBe("low");
    expect(result.warnings[0]).toMatchObject({
      code: "partial_auction_scan",
      message: "Scanned 1 of 3 auction pages; cheaper BINs may exist on unscanned pages.",
    });
  });

  test("bounds live Hypixel auction scans by default", async () => {
    const requestedPages: number[] = [];
    const result = await hypixelLowestBin("HYPERION", {
      requestImpl: async (_endpoint, query) => {
        requestedPages.push(Number(query?.page ?? 0));
        return {
          body: {
            totalPages: 5,
            auctions: [
              { uuid: `page-${query?.page ?? 0}`, bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
            ],
          },
        };
      },
    });

    expect(requestedPages).toEqual([0, 1, 2]);
    expect(result.price).toBeNull();
    expect((result as any).candidatePrice).toBe(1_900_000_000);
    expect(result.confidence).toBe("low");
    expect(result.warnings[0]).toMatchObject({
      code: "partial_auction_scan",
      message: "Scanned 3 of 5 auction pages; cheaper BINs may exist on unscanned pages.",
    });
  });

  test("keys live Hypixel auction scan cache by item id", async () => {
    let calls = 0;
    const requestImpl = async () => {
      calls += 1;
      const internalId = calls === 1 ? "HYPERION" : "TERMINATOR";
      return {
        body: {
          totalPages: 1,
          auctions: [
            { uuid: internalId.toLowerCase(), bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload(internalId) },
          ],
        },
      };
    };

    const hyperion = await hypixelLowestBin("HYPERION", { requestImpl });
    const terminator = await hypixelLowestBin("TERMINATOR", { requestImpl });

    expect(calls).toBe(2);
    expect(hyperion.price).toBe(1_900_000_000);
    expect(terminator.price).toBe(1_900_000_000);
    expect((terminator as any).auction.uuid).toBe("terminator");
  });

  test("preserves Hypixel provider metadata for partial scans with no match", async () => {
    const result = await hypixelLowestBin("HYPERION", {
      maxPages: 1,
      requestImpl: async () => ({
        body: {
          totalPages: 3,
          auctions: [
            { uuid: "wrong", bin: true, starting_bid: 1, item_bytes: auctionPayload("ASPECT_OF_THE_END") },
          ],
        },
      }),
    });

    expect(result.price).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.provider.source).toBe("Hypixel Auctions");
    expect(result.provider.method).toBe("active_auction_scan");
    expect(result.fallbackChain).toEqual(["hypixel_auctions_lbin"]);
    expect(result.warnings[0]).toMatchObject({
      code: "partial_auction_scan",
      message: "Scanned 1 of 3 auction pages without finding HYPERION; matching BINs may exist on unscanned pages.",
    });
  });

  test("uses stale Hypixel auction scan cache when refresh fails", async () => {
    let fail = false;
    const requestImpl = async () => {
      if (fail) {
        throw new Error("network down");
      }
      return {
        body: {
          totalPages: 1,
          auctions: [
            { uuid: "cached", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
          ],
        },
      };
    };
    await hypixelLowestBin("HYPERION", {
      ttlMs: -1,
      requestImpl,
    });

    fail = true;
    const stale = await hypixelLowestBin("HYPERION", {
      ttlMs: -1,
      requestImpl,
    });

    expect(stale.price).toBe(1_900_000_000);
    expect(stale.provider.cacheStatus).toBe("stale");
    expect(stale.provider.stale).toBe(true);
    expect(stale.warnings[0].code).toBe("stale_cache");
  });

  test("lowestBin falls back from CoflNet outage to Hypixel auctions", async () => {
    const result = await lowestBin("HYPERION", {
      fetchImpl: async () => new Response("bad gateway", { status: 502 }),
      auctionResponses: [{
        auctions: [
          { uuid: "cheap", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
        ],
      }],
    });

    expect(result.price).toBe(1_900_000_000);
    expect(result.fallbackChain).toEqual(["coflnet_lbin", "hypixel_auctions_lbin"]);
    expect(result.warnings[0].code).toBe("price_unavailable");
  });

  test("itemPrice falls back from Bazaar and CoflNet misses to injectable Hypixel auctions", async () => {
    const result = await itemPrice("HYPERION", {
      bazaarResponse: bazaarFixture(),
      fetchImpl: async () => new Response(JSON.stringify([]), { status: 200 }),
      maxAuctionPages: 1,
      requestImpl: async () => ({
        body: {
          totalPages: 1,
          auctions: [
            { uuid: "auction-only", bin: true, starting_bid: 1_900_000_000, item_bytes: auctionPayload("HYPERION") },
          ],
        },
      }),
    });

    expect(result.price).toBe(1_900_000_000);
    expect((result as any).auction.uuid).toBe("auction-only");
    expect(result.provider.source).toBe("Hypixel Auctions");
    expect(result.fallbackChain).toEqual(["hypixel_bazaar", "coflnet_lbin", "hypixel_auctions_lbin"]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["price_unavailable", "price_unavailable"]);
  });

  test("itemPrice exposes stale CoflNet cache behavior through ttl control", async () => {
    let fail = false;
    const fetchImpl = async () => {
      if (fail) {
        throw new Error("network down");
      }
      return new Response(JSON.stringify([{ uuid: "old", tag: "HYPERION", startingBid: 10, bin: true }]), { status: 200 });
    };
    await itemPrice("HYPERION", {
      bazaarResponse: bazaarFixture(),
      ttlMs: -1,
      fetchImpl,
    });

    fail = true;
    const stale = await itemPrice("HYPERION", {
      bazaarResponse: bazaarFixture(),
      ttlMs: -1,
      fetchImpl,
    });

    expect(stale.price).toBe(10);
    expect(stale.confidence).toBe("low");
    expect(stale.provider.source).toBe("CoflNet");
    expect(stale.provider.cacheStatus).toBe("stale");
    expect(stale.warnings.map((warning) => warning.code)).toEqual(["price_unavailable", "stale_cache"]);
  });

  test("uses stale cache when refresh fails", async () => {
    let calls = 0;
    let fail = false;
    const fetchImpl = async () => {
      calls += 1;
      if (fail) {
        throw new Error("network down");
      }
      return new Response(JSON.stringify([{ uuid: "old", tag: "HYPERION", startingBid: 10, bin: true }]), { status: 200 });
    };
    const result = await coflnetLowestBin("HYPERION", {
      ttlMs: -1,
      fetchImpl,
    });
    expect(result.price).toBe(10);

    fail = true;
    const stale = await coflnetLowestBin("HYPERION", {
      ttlMs: -1,
      fetchImpl,
    });

    expect(calls).toBe(2);
    expect(stale.price).toBe(10);
    expect(stale.confidence).toBe("low");
    expect(stale.provider.cacheStatus).toBe("stale");
    expect(stale.provider.stale).toBe(true);
    expect(stale.warnings[0].code).toBe("stale_cache");
  });

  test("preserves CoflNet provider metadata for stale cache without usable BINs", async () => {
    let fail = false;
    const fetchImpl = async () => {
      if (fail) {
        throw new Error("network down");
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };
    await coflnetLowestBin("HYPERION", {
      ttlMs: -1,
      fetchImpl,
    });

    fail = true;
    const stale = await coflnetLowestBin("HYPERION", {
      ttlMs: -1,
      fetchImpl,
    });

    expect(stale.price).toBeNull();
    expect(stale.confidence).toBe("none");
    expect(stale.provider.source).toBe("CoflNet");
    expect(stale.provider.method).toBe("active_bin");
    expect(stale.provider.cacheStatus).toBe("stale");
    expect(stale.provider.stale).toBe(true);
    expect(stale.fallbackChain).toEqual(["coflnet_lbin"]);
    expect(stale.warnings[0].code).toBe("stale_cache_no_lbin");
  });

  test("fetches CoflNet-compatible price history", async () => {
    const result = await coflnetPriceHistory("HYPERION", "30d", {
      fetchImpl: async (url) => new Response(JSON.stringify({
        average: 1_950_000_000,
        median: 1_900_000_000,
        url,
      }), { status: 200 }),
    });

    expect(result.window).toBe("30d");
    expect(result.analysis.median).toBe(1_900_000_000);
    expect(result.confidence).toBe("medium");
    expect(result.cacheStatus).toBe("miss");
    expect(result.stale).toBe(false);
    expect(result.fallbackChain).toEqual(["coflnet_price_history"]);
    expect(result.provider.method).toBe("price_analysis");
    expect(result.provider.url).toContain("days=30");
  });

  test("defaults CoflNet price history window when undefined is passed explicitly", async () => {
    const result = await coflnetPriceHistory("HYPERION", undefined, {
      fetchImpl: async (url) => new Response(JSON.stringify({ url }), { status: 200 }),
    });

    expect(result.window).toBe("7d");
    expect(result.provider.url).toContain("days=7");
  });

  test("marks stale CoflNet price history with warning and low confidence", async () => {
    let fail = false;
    const fetchImpl = async () => {
      if (fail) {
        throw new Error("network down");
      }
      return new Response(JSON.stringify({ median: 1_900_000_000 }), { status: 200 });
    };
    await coflnetPriceHistory("HYPERION", "30d", {
      ttlMs: -1,
      fetchImpl,
    });

    fail = true;
    const stale = await coflnetPriceHistory("HYPERION", "30d", {
      ttlMs: -1,
      fetchImpl,
    });

    expect(stale.analysis.median).toBe(1_900_000_000);
    expect(stale.confidence).toBe("low");
    expect(stale.cacheStatus).toBe("stale");
    expect(stale.stale).toBe(true);
    expect(stale.warnings[0].code).toBe("stale_cache");
  });
});
