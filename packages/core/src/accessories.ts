import { inventorySectionFromMember } from "./inventory.ts";
import { itemMetadata, metadataProviderResult, normalizeItemStacks } from "./items.ts";
import { itemPrice } from "./prices.ts";
import { fetchProfileContext } from "./profile.ts";
import { hypixelRequest } from "./hypixel.ts";

const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "DIVINE", "SPECIAL", "VERY SPECIAL"];
const RARITY_MP = {
  COMMON: 3,
  UNCOMMON: 5,
  RARE: 8,
  EPIC: 12,
  LEGENDARY: 16,
  MYTHIC: 22,
  DIVINE: 22,
  SPECIAL: 3,
  "VERY SPECIAL": 5,
};

const ASSUMPTIONS = [
  "Magical Power is estimated from accessory rarity using the standard accessory-bag rarity contribution table.",
  "Recombobulated accessories are treated as one rarity tier higher for MP estimates.",
  "Accessory upgrade groups depend on provider metadata; without group metadata, each internal ID is treated as its own family.",
  "Missing accessories and upgrade rankings use resolved item prices only; unresolved or partial candidate prices are reported but not ranked as buyable upgrades.",
  "Upgrade ranking recommends only the next missing MP step per accessory family unless provider metadata can model cumulative chain dependencies.",
  "Enrichment state is detected from exposed item attributes when present and is otherwise unknown.",
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeRarity(value: unknown) {
  return String(value ?? "COMMON").trim().toUpperCase().replace(/_/g, " ");
}

function rarityRank(rarity: unknown) {
  const index = RARITY_ORDER.indexOf(normalizeRarity(rarity));
  return index === -1 ? 0 : index;
}

function nextRarity(rarity: unknown) {
  const normalized = normalizeRarity(rarity);
  if (normalized === "SPECIAL") {
    return "VERY SPECIAL";
  }
  if (normalized === "VERY SPECIAL") {
    return "VERY SPECIAL";
  }
  const index = rarityRank(normalized);
  return RARITY_ORDER[Math.min(index + 1, RARITY_ORDER.indexOf("MYTHIC"))] ?? "COMMON";
}

function magicalPowerFor(rarity: unknown, recombobulated = false) {
  const effective = recombobulated ? nextRarity(rarity) : normalizeRarity(rarity);
  return RARITY_MP[effective] ?? RARITY_MP.COMMON;
}

function accessoryFamily(metadata: any, internalId: string) {
  return normalizeId(metadata?.family ?? metadata?.upgradeGroup ?? metadata?.upgrade_group ?? metadata?.baseId ?? internalId);
}

function metadataFromNeuResult(result: any) {
  const metadata = result.metadata ?? {};
  return {
    internalId: result.internalId,
    displayName: metadata.displayname ?? result.internalId,
    rarity: metadata.tier ?? "COMMON",
    category: metadata.category ?? null,
    family: accessoryFamily(metadata, result.internalId),
    magicalPower: metadata.magicalPower ?? metadata.magical_power ?? null,
    provider: result.provider,
    warnings: result.warnings ?? [],
  };
}

export function accessoryMetadataProviderResult(accessories: Array<Record<string, any>>, source = "test-fixture") {
  return {
    accessories: accessories.map((accessory) => ({
      internalId: normalizeId(accessory.internalId),
      displayName: accessory.displayName ?? accessory.internalId,
      rarity: normalizeRarity(accessory.rarity),
      category: accessory.category ?? "ACCESSORY",
      family: accessoryFamily(accessory, accessory.internalId),
      magicalPower: accessory.magicalPower ?? null,
      obtainable: accessory.obtainable ?? true,
    })),
    provider: {
      source,
      url: null,
      version: "local",
      fetchedAt: nowIso(),
      cacheStatus: "hit",
    },
    warnings: [],
  };
}

export async function unavailableAccessoryMetadataProvider() {
  return {
    accessories: [],
    provider: {
      source: "accessory-metadata",
      url: null,
      version: null,
      fetchedAt: nowIso(),
      cacheStatus: "unavailable",
    },
    warnings: [{
      code: "accessory_metadata_unavailable",
      message: "No full accessory universe provider is configured; missing-accessory results are limited to detected owned accessories.",
    }],
  };
}

export async function hypixelAccessoryMetadataProvider(options: {
  requestImpl?: (endpoint: string, query?: Record<string, unknown>) => Promise<any>;
} = {}) {
  const requestImpl = options.requestImpl ?? hypixelRequest;
  try {
    const response = await requestImpl("resources/skyblock/items");
    const items = response.body?.items ?? response.items ?? [];
    return {
      accessories: items
        .filter((item) => String(item.category ?? "").toUpperCase() === "ACCESSORY")
        .map((item) => ({
          internalId: normalizeId(item.id),
          displayName: item.name ?? item.id,
          rarity: normalizeRarity(item.tier),
          category: item.category,
          family: normalizeId(item.id),
          magicalPower: null,
          obtainable: true,
        })),
      provider: {
        source: "Hypixel Resources",
        url: response.url ?? "https://api.hypixel.net/v2/resources/skyblock/items",
        version: null,
        fetchedAt: nowIso(),
        cacheStatus: "miss",
      },
      warnings: [],
    };
  } catch (error) {
    return {
      ...(await unavailableAccessoryMetadataProvider()),
      warnings: [{
        code: "accessory_metadata_unavailable",
        message: `Hypixel item resource accessory metadata unavailable: ${(error as Error).message}`,
      }],
    };
  }
}

async function normalizeAccessoryBag(member: any, metadataProvider: any) {
  const section = await inventorySectionFromMember(member, "accessory_bag");
  const normalized = await normalizeItemStacks(section.items ?? [], { metadataProvider });
  return {
    section,
    ...normalized,
  };
}

function isAccessory(item: any, universeById: Map<string, any>) {
  return universeById.has(item.internalId) || String(item.category ?? "").toUpperCase() === "ACCESSORY";
}

function enrichmentState(item: any) {
  const keys = item.specialModifiers?.extraKeys ?? [];
  return {
    enriched: keys.includes("talisman_enrichment") || keys.includes("enrichment"),
    value: item.enrichment ?? null,
    exact: keys.includes("talisman_enrichment") || keys.includes("enrichment"),
  };
}

function providerFreshness(...providers: any[]) {
  return providers.filter(Boolean).map((provider) => ({
    source: provider.source ?? "unknown",
    url: provider.url ?? null,
    version: provider.version ?? null,
    fetchedAt: provider.fetchedAt ?? null,
    cacheStatus: provider.cacheStatus ?? null,
  }));
}

async function pricedUpgrade(accessory: any, gain: number, priceProvider: any, budget: number | null) {
  const price = await priceProvider(accessory.internalId);
  const resolved = typeof price?.price === "number" && Number.isFinite(price.price) && price.price > 0 ? price.price : null;
  return {
    internalId: accessory.internalId,
    displayName: accessory.displayName,
    family: accessory.family,
    rarity: accessory.rarity,
    magicalPowerGain: gain,
    price: resolved,
    candidatePrice: price?.candidatePrice ?? null,
    coinPerMagicalPower: resolved === null || gain <= 0 ? null : Math.round((resolved / gain) * 100) / 100,
    withinBudget: resolved !== null && (budget === null || resolved <= budget),
    provider: price?.provider ?? null,
    warnings: price?.warnings ?? [],
  };
}

export async function calculateAccessoriesFromMember(member: any, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  accessoryMetadataProvider?: () => Promise<any> | any;
  priceProvider?: (internalId: string) => Promise<any> | any;
  budget?: number | null;
} = {}) {
  const metadataProvider = options.metadataProvider ?? itemMetadata;
  const universeResult = await (options.accessoryMetadataProvider ?? hypixelAccessoryMetadataProvider)();
  const universe: any[] = universeResult.accessories ?? [];
  const universeById: Map<string, any> = new Map(universe.map((entry) => [normalizeId(entry.internalId), entry]));
  const normalized = await normalizeAccessoryBag(member, metadataProvider);
  const warnings = [...(normalized.section.warnings ?? []), ...(normalized.warnings ?? []), ...(universeResult.warnings ?? [])];
  const owned: any[] = [];
  const duplicates: any[] = [];
  const bestByFamily: Map<string, any> = new Map();

  for (const item of normalized.items.filter((entry) => isAccessory(entry, universeById))) {
    const providerMetadata = universeById.get(item.internalId) ?? metadataFromNeuResult(metadataProviderResult(item.internalId, {
      displayname: item.displayName,
      tier: item.rarity,
      category: item.category,
    }));
    const family = accessoryFamily(providerMetadata, item.internalId);
    const rarity = item.rarity ?? providerMetadata.rarity ?? "COMMON";
    const recombobulated = Boolean(item.recombobulated);
    const magicalPower = providerMetadata.magicalPower ?? magicalPowerFor(rarity, recombobulated);
    const record = {
      internalId: item.internalId,
      displayName: item.cleanName ?? item.displayName,
      family,
      rarity,
      recombobulated,
      enrichment: enrichmentState(item),
      magicalPower,
      exact: Boolean(providerMetadata.magicalPower),
      rawNbtPointer: item.rawNbtPointer,
      warnings: item.warnings ?? [],
    };
    owned.push(record);
    const current = bestByFamily.get(family);
    if (!current || magicalPower > current.magicalPower || rarityRank(rarity) > rarityRank(current.rarity)) {
      if (current) {
        duplicates.push({ ...current, reason: "lower_family_tier" });
      }
      bestByFamily.set(family, record);
    } else {
      duplicates.push({ ...record, reason: "duplicate_or_lower_family_tier" });
    }
  }

  const active = [...bestByFamily.values()];
  const ownedIds = new Set(owned.map((entry) => entry.internalId));
  const currentMpByFamily: Map<string, number> = new Map(active.map((entry) => [entry.family, entry.magicalPower]));
  const missing = universe
    .filter((entry) => entry.obtainable !== false)
    .map((entry) => ({
      ...entry,
      magicalPower: entry.magicalPower ?? magicalPowerFor(entry.rarity),
    }))
    .filter((entry) => !ownedIds.has(entry.internalId))
    .filter((entry) => entry.magicalPower >= (currentMpByFamily.get(entry.family) ?? 0))
    .map((entry) => ({
      internalId: entry.internalId,
      displayName: entry.displayName,
      family: entry.family,
      rarity: entry.rarity,
      magicalPower: entry.magicalPower,
    }));
  const priceProvider = options.priceProvider ?? itemPrice;
  const budget = options.budget === undefined ? null : options.budget;
  const nextMissingByFamily = new Map();
  const mpUpgradeCandidates = missing.filter((entry) => entry.magicalPower > (currentMpByFamily.get(entry.family) ?? 0));
  for (const accessory of [...mpUpgradeCandidates].sort((a, b) => {
    const mpDelta = a.magicalPower - b.magicalPower;
    return mpDelta === 0 ? rarityRank(a.rarity) - rarityRank(b.rarity) : mpDelta;
  })) {
    if (!nextMissingByFamily.has(accessory.family)) {
      nextMissingByFamily.set(accessory.family, accessory);
    }
  }
  const pricedMissing = [];
  for (const accessory of missing) {
    const gain = Math.max(0, accessory.magicalPower - (currentMpByFamily.get(accessory.family) ?? 0));
    pricedMissing.push(await pricedUpgrade(accessory, gain, priceProvider, budget));
  }
  pricedMissing.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const nextUpgradeIds = new Set([...nextMissingByFamily.values()].map((entry) => entry.internalId));
  const upgrades = pricedMissing
    .filter((entry) => nextUpgradeIds.has(entry.internalId))
    .filter((entry) => entry.magicalPowerGain > 0 && entry.withinBudget)
    .sort((a, b) => (a.coinPerMagicalPower ?? Infinity) - (b.coinPerMagicalPower ?? Infinity));

  return {
    magicalPower: {
      estimated: active.reduce((total, item) => total + item.magicalPower, 0),
      exact: active.every((item) => item.exact),
    },
    owned,
    activeAccessories: active,
    duplicates,
    missing,
    cheapestMissing: pricedMissing.filter((entry) => entry.price !== null).slice(0, 25),
    upgrades,
    ignoredItems: normalized.items.filter((entry) => !isAccessory(entry, universeById)),
    providerFreshness: providerFreshness(universeResult.provider),
    assumptions: ASSUMPTIONS,
    warnings,
  };
}

export async function accessoriesForPlayer(player?: string, profile?: string, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  accessoryMetadataProvider?: () => Promise<any> | any;
  priceProvider?: (internalId: string) => Promise<any> | any;
  budget?: number | null;
} = {}) {
  const context = await fetchProfileContext(player, profile);
  const result = await calculateAccessoriesFromMember(context.member, options);
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    rateLimit: context.rateLimit,
    ...result,
  };
}

export async function missingAccessoriesForPlayer(player?: string, profile?: string, options: Parameters<typeof accessoriesForPlayer>[2] = {}) {
  const result = await accessoriesForPlayer(player, profile, options);
  return {
    uuid: result.uuid,
    profile: result.profile,
    missing: result.missing,
    cheapestMissing: result.cheapestMissing,
    providerFreshness: result.providerFreshness,
    assumptions: result.assumptions,
    warnings: result.warnings,
    rateLimit: result.rateLimit,
  };
}

export async function accessoryUpgradesForPlayer(player?: string, profile?: string, budget: number | null = null, options: Parameters<typeof accessoriesForPlayer>[2] = {}) {
  const result = await accessoriesForPlayer(player, profile, { ...options, budget });
  return {
    uuid: result.uuid,
    profile: result.profile,
    budget,
    magicalPower: result.magicalPower,
    upgrades: result.upgrades,
    providerFreshness: result.providerFreshness,
    assumptions: result.assumptions,
    warnings: result.warnings,
    rateLimit: result.rateLimit,
  };
}
