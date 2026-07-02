import { metadataCacheStatus } from "./items.ts";
import { priceCacheStatus } from "./prices.ts";
import { getApiKey, readConfig } from "./store.ts";

const SKYBLOCK_RESOURCE_KINDS = ["collections", "skills", "items", "election", "bingo"];

function nowIso() {
  return new Date().toISOString();
}

export function providerStatus() {
  const config = readConfig();
  const apiKeyConfigured = Boolean(getApiKey(config));
  const priceCache = priceCacheStatus();
  const metadataCache = metadataCacheStatus();
  const warnings = [
    ...(apiKeyConfigured ? [] : [{
      code: "hypixel_api_key_missing",
      message: "Hypixel profile endpoints that require an API key will fail until HYPIXEL_API_KEY or config api-key is set.",
      source: "Hypixel API",
    }]),
    ...(priceCache.staleCount > 0 ? [{
      code: "stale_price_cache",
      message: `${priceCache.staleCount} price cache entries are stale and will refresh on next provider use.`,
      source: "price-cache",
    }] : []),
    ...(metadataCache.unavailableCount > 0 ? [{
      code: "metadata_cache_unavailable_entries",
      message: `${metadataCache.unavailableCount} metadata cache entries were populated from unavailable provider responses.`,
      source: "metadata-cache",
    }] : []),
  ];

  return {
    generatedAt: nowIso(),
    providers: [
      {
        id: "hypixel-api",
        source: "Hypixel API",
        status: apiKeyConfigured ? "configured" : "missing_api_key",
        configured: apiKeyConfigured,
        auth: {
          apiKeyConfigured,
          apiKeySource: config.apiKey ? "config" : process.env.HYPIXEL_API_KEY ? "env" : null,
        },
        cache: null,
        warnings: apiKeyConfigured ? [] : warnings.filter((warning) => warning.code === "hypixel_api_key_missing"),
      },
      {
        id: "item-metadata",
        source: "NotEnoughUpdates-REPO",
        status: metadataCache.unavailableCount > 0 ? "degraded" : "available",
        cache: metadataCache,
        warnings: warnings.filter((warning) => warning.source === "metadata-cache"),
      },
      {
        id: "pricing",
        source: "Hypixel Bazaar, CoflNet, Hypixel Auctions",
        status: priceCache.staleCount > 0 ? "stale_cache_available" : "available",
        cache: priceCache,
        warnings: warnings.filter((warning) => warning.source === "price-cache"),
      },
    ],
    resources: SKYBLOCK_RESOURCE_KINDS.map((kind) => ({
      kind,
      endpoint: `resources/skyblock/${kind}`,
      source: "Hypixel Resources",
      cacheStatus: "not_cached",
      freshness: "live_on_request",
    })),
    warnings,
  };
}
