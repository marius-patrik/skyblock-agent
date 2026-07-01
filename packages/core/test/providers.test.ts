import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bazaarPrice, clearMetadataCache, clearPriceCache, neuItemMetadata, providerStatus } from "../src/index.ts";

const originalHome = process.env.SKYAGENT_HOME;
const originalApiKey = process.env.HYPIXEL_API_KEY;
let tempHome: string | null = null;

afterEach(() => {
  clearPriceCache();
  clearMetadataCache();
  if (tempHome) {
    rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  if (originalHome === undefined) {
    delete process.env.SKYAGENT_HOME;
  } else {
    process.env.SKYAGENT_HOME = originalHome;
  }
  if (originalApiKey === undefined) {
    delete process.env.HYPIXEL_API_KEY;
  } else {
    process.env.HYPIXEL_API_KEY = originalApiKey;
  }
});

function isolateConfig() {
  tempHome = mkdtempSync(join(tmpdir(), "skyagent-provider-test-"));
  process.env.SKYAGENT_HOME = tempHome;
  delete process.env.HYPIXEL_API_KEY;
}

function bazaarFixture() {
  return {
    products: {
      ENCHANTED_DIAMOND: {
        quick_status: {
          buyPrice: 1600,
          sellPrice: 1500,
        },
      },
    },
  };
}

test("provider status reports structured cache freshness, resources, and warnings", async () => {
  isolateConfig();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(bazaarFixture()), { status: 200 })) as unknown as typeof fetch;
  try {
    await bazaarPrice("ENCHANTED_DIAMOND", { ttlMs: 60_000 });
  } finally {
    globalThis.fetch = originalFetch;
  }
  await neuItemMetadata("HYPERION", {
    fetchImpl: async () => new Response(JSON.stringify({ displayname: "Hyperion", tier: "LEGENDARY" }), { status: 200 }),
  });

  const status = providerStatus();
  const pricing = status.providers.find((provider) => provider.id === "pricing")!;
  const metadata = status.providers.find((provider) => provider.id === "item-metadata")!;
  const hypixel = status.providers.find((provider) => provider.id === "hypixel-api")!;

  expect(hypixel).toMatchObject({
    configured: false,
    status: "missing_api_key",
  });
  expect(status.warnings.some((warning) => warning.code === "hypixel_api_key_missing")).toBe(true);
  expect(pricing.cache.entryCount).toBeGreaterThan(0);
  expect(pricing.cache.entries[0]).toMatchObject({
    key: "hypixel:bazaar",
    stale: false,
  });
  expect(metadata.cache.entries[0]).toMatchObject({
    internalId: "HYPERION",
    source: "NotEnoughUpdates-REPO",
    cacheStatus: "miss",
  });
  expect(status.resources.map((resource) => resource.endpoint)).toContain("resources/skyblock/items");
});
