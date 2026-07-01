import { hypixelRequest } from "./hypixel.ts";
import { decodeHypixelNbt } from "./nbt.ts";

const COFLNET_BASE_URL = "https://sky.coflnet.com/api";
const DEFAULT_HYPIXEL_AUCTION_SCAN_PAGES = 3;

type CacheEntry = {
  expiresAt: number;
  storedAt: number;
  value: any;
};

const cache = new Map<string, CacheEntry>();
const transportIds = new WeakMap<Function, string>();
let transportCounter = 0;

export function clearPriceCache() {
  cache.clear();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeItemId(itemId: unknown) {
  return String(itemId || "").trim().toUpperCase();
}

function cacheGet(key: string) {
  const entry = cache.get(key);
  if (!entry) {
    return { hit: false, stale: false, value: null };
  }
  const stale = Date.now() > entry.expiresAt;
  return { hit: true, stale, value: entry.value };
}

function cacheSet(key: string, value: any, ttlMs: number) {
  const storedAt = Date.now();
  cache.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
}

export function priceCacheStatus(now = Date.now()) {
  const entries = [...cache.entries()].map(([key, entry]) => ({
    key,
    storedAt: new Date(entry.storedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    ttlMs: Math.max(0, entry.expiresAt - now),
    ageMs: Math.max(0, now - entry.storedAt),
    stale: now > entry.expiresAt,
  }));
  return {
    entries,
    entryCount: entries.length,
    staleCount: entries.filter((entry) => entry.stale).length,
  };
}

function transportCacheKey(transport: Function | undefined) {
  if (!transport) {
    return "default";
  }
  const existing = transportIds.get(transport);
  if (existing) {
    return existing;
  }
  transportCounter += 1;
  const id = `custom-${transportCounter}`;
  transportIds.set(transport, id);
  return id;
}

function auctionPrice(auction: Record<string, any>) {
  const raw = auction.startingBid ?? auction.starting_bid ?? auction.price;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function itemIdentity(value: any): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return value.tag
      ?? value.itemTag
      ?? value.item_tag
      ?? value.itemId
      ?? value.item_id
      ?? value.internalId
      ?? value.internal_id
      ?? value.id
      ?? null;
  }
  return null;
}

function auctionItemId(auction: Record<string, any>) {
  return itemIdentity(auction.item)
    ?? auction.tag
    ?? auction.itemTag
    ?? auction.item_tag
    ?? auction.itemId
    ?? auction.item_id
    ?? auction.internalId
    ?? auction.internal_id
    ?? null;
}

function auctionList(value: any) {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.auctions)) {
    return value.auctions;
  }
  if (value && typeof value === "object") {
    return Object.values(value);
  }
  return [];
}

function provider(source: string, method: string, url: string | null, cacheStatus: "hit" | "miss" | "stale" | "unavailable" | "disabled", stale = false) {
  return {
    source,
    method,
    url,
    fetchedAt: nowIso(),
    cacheStatus,
    stale,
  };
}

function unknownPrice(itemId: string, fallbackChain: string[], warning: string) {
  return {
    itemId: normalizeItemId(itemId),
    price: null,
    currency: "coins",
    confidence: "none",
    provider: provider("none", "unknown", null, "unavailable", false),
    fallbackChain,
    warnings: [{ code: "price_unavailable", message: warning }],
  };
}

function providerUnavailablePrice(
  itemId: string,
  fallbackChain: string[],
  providerInfo: ReturnType<typeof provider>,
  warning: { code: string; message: string },
) {
  return {
    itemId: normalizeItemId(itemId),
    price: null,
    currency: "coins",
    confidence: "none",
    provider: providerInfo,
    fallbackChain,
    warnings: [warning],
  };
}

async function fetchJsonCached(key: string, ttlMs: number, fetcher: () => Promise<any>) {
  const cached = cacheGet(key);
  if (cached.hit && !cached.stale) {
    return { value: cached.value, cacheStatus: "hit" as const, stale: false };
  }
  if (cached.hit && cached.stale) {
    try {
      const value = await fetcher();
      cacheSet(key, value, ttlMs);
      return { value, cacheStatus: "miss" as const, stale: false };
    } catch {
      return { value: cached.value, cacheStatus: "stale" as const, stale: true };
    }
  }
  const value = await fetcher();
  cacheSet(key, value, ttlMs);
  return { value, cacheStatus: "miss" as const, stale: false };
}

export async function bazaarPrice(itemId: string, options: { bazaarResponse?: any; ttlMs?: number } = {}) {
  const id = normalizeItemId(itemId);
  const ttlMs = options.ttlMs ?? 30_000;
  const cacheKey = "hypixel:bazaar";
  const fallbackChain = ["hypixel_bazaar"];
  try {
    const result = options.bazaarResponse
      ? { value: options.bazaarResponse, cacheStatus: "disabled" as const, stale: false }
      : await fetchJsonCached(cacheKey, ttlMs, () => hypixelRequest("skyblock/bazaar"));
    const providerInfo = provider(
      "Hypixel Bazaar",
      "bazaar_quick_status",
      result.value.url ?? "https://api.hypixel.net/v2/skyblock/bazaar",
      result.cacheStatus as any,
      result.stale,
    );
    const warnings = result.stale
      ? [{
        code: "stale_cache",
        message: "Using stale Hypixel Bazaar cache because refresh failed.",
      }]
      : [];
    const product = result.value.body?.products?.[id] ?? result.value.products?.[id] ?? null;
    if (!product) {
      return {
        itemId: id,
        price: null,
        currency: "coins",
        confidence: "none",
        provider: providerInfo,
        fallbackChain,
        warnings: [
          ...warnings,
          { code: "price_unavailable", message: `No Bazaar product found for ${id}.` },
        ],
      };
    }
    const quick = product.quick_status ?? {};
    return {
      itemId: id,
      price: quick.buyPrice ?? quick.sellPrice ?? null,
      instantBuyPrice: quick.buyPrice ?? null,
      instantSellPrice: quick.sellPrice ?? null,
      buyMovingWeek: quick.buyMovingWeek ?? null,
      sellMovingWeek: quick.sellMovingWeek ?? null,
      buyVolume: quick.buyVolume ?? null,
      sellVolume: quick.sellVolume ?? null,
      currency: "coins",
      confidence: quick.buyPrice != null || quick.sellPrice != null ? "high" : "none",
      provider: providerInfo,
      fallbackChain,
      warnings,
    };
  } catch (error) {
    return {
      ...unknownPrice(id, fallbackChain, `Hypixel Bazaar provider unavailable: ${(error as Error).message}`),
      provider: provider("Hypixel Bazaar", "bazaar_quick_status", "https://api.hypixel.net/v2/skyblock/bazaar", "unavailable"),
    };
  }
}

export async function coflnetLowestBin(itemId: string, options: { fetchImpl?: (input: string) => Promise<Response>; ttlMs?: number } = {}) {
  const id = normalizeItemId(itemId);
  const url = `${COFLNET_BASE_URL}/auctions/tag/${encodeURIComponent(id)}/active/bin`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchCacheKey = transportCacheKey(options.fetchImpl);
  const fallbackChain = ["coflnet_lbin"];
  try {
    const result = await fetchJsonCached(`coflnet:lbin:${fetchCacheKey}:${id}`, options.ttlMs ?? 60_000, async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });
    const auctions = auctionList(result.value);
    const pricedActive = auctions
      .map((auction) => ({ auction, price: auctionPrice(auction) }))
      .filter((entry) => entry.auction.bin !== false && entry.price !== null);
    const sorted = pricedActive
      .filter((entry) => {
        const identity = auctionItemId(entry.auction);
        return identity === null || normalizeItemId(identity) === id;
      })
      .sort((a, b) => a.price! - b.price!);
    const cheapest = sorted[0] ?? null;
    if (!cheapest) {
      const hasConfirmedMismatches = pricedActive.some((entry) => auctionItemId(entry.auction) !== null);
      return providerUnavailablePrice(
        id,
        fallbackChain,
        provider("CoflNet", "active_bin", url, result.cacheStatus as any, result.stale),
        result.stale
          ? {
            code: "stale_cache_no_lbin",
            message: `Using stale CoflNet LBIN cache after refresh failed, but no active BIN auctions with a confirmed ${id} item id and valid positive price were found.`,
          }
          : {
            code: hasConfirmedMismatches ? "identity_mismatch" : "price_unavailable",
            message: hasConfirmedMismatches
              ? `CoflNet LBIN payload only included active BIN auctions with confirmed item ids that did not match ${id}.`
              : `No active BIN auctions with a valid positive price found for ${id}.`,
          },
      );
    }
    const identityConfirmed = auctionItemId(cheapest.auction) !== null;
    const warnings = [];
    if (!identityConfirmed) {
      warnings.push({
        code: "identity_unconfirmed",
        message: "CoflNet LBIN record did not include an item identity field; trusting the item-scoped endpoint URL.",
      });
    }
    if (result.stale) {
      warnings.push({
        code: "stale_cache",
        message: "Using stale CoflNet LBIN cache because refresh failed.",
      });
    }
    return {
      itemId: id,
      price: cheapest.price,
      auction: cheapest.auction,
      identityConfirmed,
      currency: "coins",
      confidence: result.stale || !identityConfirmed ? "low" : "medium",
      provider: provider("CoflNet", "active_bin", url, result.cacheStatus as any, result.stale),
      fallbackChain,
      warnings,
    };
  } catch (error) {
    return {
      ...unknownPrice(id, fallbackChain, `CoflNet LBIN provider unavailable: ${(error as Error).message}`),
      provider: provider("CoflNet", "active_bin", url, "unavailable"),
    };
  }
}

async function auctionInternalId(auction: Record<string, any>) {
  if (!auction.item_bytes) {
    return null;
  }
  try {
    const payload = typeof auction.item_bytes === "string" ? auction.item_bytes : auction.item_bytes.data;
    if (!payload) {
      return null;
    }
    const decoded = await decodeHypixelNbt(payload);
    const simplified = decoded.simplified as any;
    const items = simplified?.i ?? simplified?.value?.i?.value ?? simplified?.value?.i ?? null;
    const item = Array.isArray(items) ? items[0] : Array.isArray(items?.value) ? items.value[0] : null;
    return item?.tag?.ExtraAttributes?.id ?? item?.tag?.value?.ExtraAttributes?.value?.id?.value ?? null;
  } catch {
    return null;
  }
}

export async function hypixelLowestBin(
  itemId: string,
  options: {
    auctionResponses?: any[];
    maxPages?: number;
    requestImpl?: (endpoint: string, query?: Record<string, unknown>) => Promise<any>;
    ttlMs?: number;
  } = {},
) {
  const id = normalizeItemId(itemId);
  const fallbackChain = ["hypixel_auctions_lbin"];
  const maxPages = options.maxPages ?? DEFAULT_HYPIXEL_AUCTION_SCAN_PAGES;
  const requestImpl = options.requestImpl ?? hypixelRequest;
  const requestCacheKey = transportCacheKey(options.requestImpl);
  try {
    let pages = options.auctionResponses ?? [];
    let knownTotalPages = 0;
    let boundedByMaxPages = false;
    let cacheStatus: "hit" | "miss" | "stale" | "unavailable" | "disabled" = options.auctionResponses ? "disabled" : "miss";
    let stale = false;
    if (!options.auctionResponses) {
      const result = await fetchJsonCached(`hypixel:auctions:${requestCacheKey}:${id}:${maxPages}`, options.ttlMs ?? 60_000, async () => {
        const fetchedPages = [];
        const first = await requestImpl("skyblock/auctions", { page: 0 });
        fetchedPages.push(first);
        const fetchedTotalPages = Number(first.body?.totalPages ?? first.totalPages ?? 1);
        const pageLimit = Math.min(fetchedTotalPages, maxPages);
        const fetchedBoundedByMaxPages = pageLimit < fetchedTotalPages;
        for (let page = 1; page < pageLimit; page += 1) {
          fetchedPages.push(await requestImpl("skyblock/auctions", { page }));
        }
        return { pages: fetchedPages, knownTotalPages: fetchedTotalPages, boundedByMaxPages: fetchedBoundedByMaxPages };
      });
      pages = result.value.pages;
      knownTotalPages = result.value.knownTotalPages;
      boundedByMaxPages = result.value.boundedByMaxPages;
      cacheStatus = result.cacheStatus;
      stale = result.stale;
    }
    const totalPages = Math.max(
      knownTotalPages,
      ...pages.map((page) => Number(page.body?.totalPages ?? page.totalPages ?? pages.length)),
      pages.length,
    );
    const partial = boundedByMaxPages || pages.length < totalPages;

    const matches = [];
    for (const page of pages) {
      const auctions = page.body?.auctions ?? page.auctions ?? [];
      for (const auction of auctions) {
        if (!auction.bin) {
          continue;
        }
        const internalId = await auctionInternalId(auction);
        if (normalizeItemId(internalId) === id) {
          matches.push(auction);
        }
      }
    }

    matches.sort((a, b) => (auctionPrice(a) ?? Infinity) - (auctionPrice(b) ?? Infinity));
    const cheapest = matches[0] ?? null;
    const price = cheapest ? auctionPrice(cheapest) : null;
    const providerInfo = provider(
      "Hypixel Auctions",
      "active_auction_scan",
      "https://api.hypixel.net/v2/skyblock/auctions",
      cacheStatus,
      stale,
    );
    const warnings = [];
    if (partial) {
      warnings.push({
        code: "partial_auction_scan",
        message: `Scanned ${pages.length} of ${totalPages} auction pages; cheaper BINs may exist on unscanned pages.`,
      });
    }
    if (stale) {
      warnings.push({
        code: "stale_cache",
        message: "Using stale Hypixel auction scan cache because refresh failed.",
      });
    }
    if (!cheapest || price === null) {
      if (partial) {
        return {
          itemId: id,
          price: null,
          currency: "coins",
          confidence: "low",
          provider: providerInfo,
          fallbackChain,
          warnings: [
            ...warnings.filter((warning) => warning.code !== "partial_auction_scan"),
            {
              code: "partial_auction_scan",
              message: `Scanned ${pages.length} of ${totalPages} auction pages without finding ${id}; matching BINs may exist on unscanned pages.`,
            },
          ],
        };
      }
      return providerUnavailablePrice(
        id,
        fallbackChain,
        providerInfo,
        {
          code: "price_unavailable",
          message: `No active Hypixel BIN auctions found for ${id}.`,
        },
      );
    }
    return {
      itemId: id,
      price: partial ? null : price,
      auction: cheapest,
      candidatePrice: partial ? price : null,
      candidateAuction: partial ? cheapest : null,
      currency: "coins",
      confidence: partial ? "low" : "medium",
      provider: providerInfo,
      fallbackChain,
      warnings,
    };
  } catch (error) {
    return {
      ...unknownPrice(id, fallbackChain, `Hypixel Auctions provider unavailable: ${(error as Error).message}`),
      provider: provider("Hypixel Auctions", "active_auction_scan", "https://api.hypixel.net/v2/skyblock/auctions", "unavailable"),
    };
  }
}

export async function coflnetPriceHistory(itemId: string, window: string | undefined = "7d", options: { fetchImpl?: (input: string) => Promise<Response>; ttlMs?: number } = {}) {
  const id = normalizeItemId(itemId);
  const requestedWindow = window ?? "7d";
  const days = Math.max(1, Math.min(365, Number(String(requestedWindow).replace(/[^\d]/g, "")) || 7));
  const url = `${COFLNET_BASE_URL}/item/price/${encodeURIComponent(id)}/analysis?days=${days}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchCacheKey = transportCacheKey(options.fetchImpl);
  try {
    const result = await fetchJsonCached(`coflnet:history:${fetchCacheKey}:${id}:${days}`, options.ttlMs ?? 300_000, async () => {
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });
    return {
      itemId: id,
      window: `${days}d`,
      analysis: result.value,
      confidence: result.stale ? "low" : "medium",
      cacheStatus: result.cacheStatus,
      stale: result.stale,
      provider: provider("CoflNet", "price_analysis", url, result.cacheStatus as any, result.stale),
      fallbackChain: ["coflnet_price_history"],
      warnings: result.stale ? [{
        code: "stale_cache",
        message: "Using stale CoflNet price history cache because refresh failed.",
      }] : [],
    };
  } catch (error) {
    return {
      itemId: id,
      window: `${days}d`,
      analysis: null,
      confidence: "none",
      cacheStatus: "unavailable",
      stale: false,
      provider: provider("CoflNet", "price_analysis", url, "unavailable"),
      fallbackChain: ["coflnet_price_history"],
      warnings: [{ code: "price_history_unavailable", message: `CoflNet price history unavailable: ${(error as Error).message}` }],
    };
  }
}

export async function itemPrice(
  itemId: string,
  options: {
    fetchImpl?: (input: string) => Promise<Response>;
    bazaarResponse?: any;
    ttlMs?: number;
    auctionResponses?: any[];
    maxAuctionPages?: number;
    requestImpl?: (endpoint: string, query?: Record<string, unknown>) => Promise<any>;
  } = {},
) {
  const bazaar = await bazaarPrice(itemId, { bazaarResponse: options.bazaarResponse, ttlMs: options.ttlMs });
  if (bazaar.price !== null) {
    return bazaar;
  }
  const lbin = await coflnetLowestBin(itemId, { fetchImpl: options.fetchImpl, ttlMs: options.ttlMs });
  if (lbin.price !== null) {
    return {
      ...lbin,
      fallbackChain: ["hypixel_bazaar", "coflnet_lbin"],
      warnings: [...(bazaar.warnings ?? []), ...(lbin.warnings ?? [])],
    };
  }
  const hypixel = await hypixelLowestBin(itemId, {
    auctionResponses: options.auctionResponses,
    maxPages: options.maxAuctionPages,
    requestImpl: options.requestImpl,
    ttlMs: options.ttlMs,
  });
  return {
    ...hypixel,
    fallbackChain: ["hypixel_bazaar", "coflnet_lbin", "hypixel_auctions_lbin"],
    warnings: [...(bazaar.warnings ?? []), ...(lbin.warnings ?? []), ...(hypixel.warnings ?? [])],
  };
}

export async function lowestBin(
  itemId: string,
  options: {
    fetchImpl?: (input: string) => Promise<Response>;
    ttlMs?: number;
    auctionResponses?: any[];
    maxAuctionPages?: number;
    requestImpl?: (endpoint: string, query?: Record<string, unknown>) => Promise<any>;
  } = {},
) {
  const coflnet = await coflnetLowestBin(itemId, { fetchImpl: options.fetchImpl, ttlMs: options.ttlMs });
  if (coflnet.price !== null) {
    return coflnet;
  }
  const hypixel = await hypixelLowestBin(itemId, {
    auctionResponses: options.auctionResponses,
    maxPages: options.maxAuctionPages,
    requestImpl: options.requestImpl,
    ttlMs: options.ttlMs,
  });
  return {
    ...hypixel,
    fallbackChain: ["coflnet_lbin", "hypixel_auctions_lbin"],
    warnings: [...(coflnet.warnings ?? []), ...(hypixel.warnings ?? [])],
  };
}
