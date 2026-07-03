import { inventorySectionFromMember } from "./inventory.ts";
import { itemMetadata, metadataProviderResult, normalizeItemStacks, providerFreshness as itemProviderFreshness } from "./items.ts";
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

export const DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS = 75;
export const DEFAULT_ACCESSORY_TIMEOUT_MS = 8_000;

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

function accessoryFamilyState(metadata: any, internalId: string) {
  const hasFamilyField = Boolean(metadata?.family ?? metadata?.upgradeGroup ?? metadata?.upgrade_group ?? metadata?.baseId);
  const explicit = hasFamilyField && metadata?.familyConfidence !== "id_fallback";
  return {
    family: accessoryFamily(metadata, internalId),
    confidence: explicit ? "provider_backed" : "id_fallback",
    sourceFields: explicit ? ["family", "upgradeGroup", "upgrade_group", "baseId"] : ["internalId"],
    warnings: explicit ? [] : [{
      code: "accessory_family_metadata_incomplete",
      message: `No accessory upgrade-family metadata was available for ${normalizeId(internalId)}; treating the item ID as its own family.`,
    }],
  };
}

function metadataFromNeuResult(result: any) {
  const metadata = result.metadata ?? {};
  const familyState = accessoryFamilyState({ familyConfidence: "id_fallback" }, result.internalId);
  return {
    internalId: result.internalId,
    displayName: metadata.displayname ?? result.internalId,
    rarity: metadata.tier ?? "COMMON",
    category: metadata.category ?? null,
    family: familyState.family,
    familyConfidence: familyState.confidence,
    familySourceFields: familyState.sourceFields,
    magicalPower: metadata.magicalPower ?? metadata.magical_power ?? null,
    provider: result.provider,
    warnings: [...(result.warnings ?? []), ...familyState.warnings],
  };
}

export function accessoryMetadataProviderResult(accessories: Array<Record<string, any>>, source = "test-fixture") {
  const normalizedAccessories = accessories.map((accessory) => {
    const familyState = accessoryFamilyState(accessory, accessory.internalId);
    return {
      internalId: normalizeId(accessory.internalId),
      displayName: accessory.displayName ?? accessory.internalId,
      rarity: normalizeRarity(accessory.rarity),
      category: accessory.category ?? "ACCESSORY",
      family: familyState.family,
      familyConfidence: familyState.confidence,
      familySourceFields: familyState.sourceFields,
      magicalPower: accessory.magicalPower ?? null,
      obtainable: accessory.obtainable ?? true,
      warnings: familyState.warnings,
    };
  });
  const familyWarnings = normalizedAccessories.flatMap((entry) => entry.warnings);
  return {
    accessories: normalizedAccessories,
    provider: {
      source,
      providerKind: "accessory-metadata",
      url: null,
      version: "local",
      fetchedAt: nowIso(),
      cacheStatus: "hit",
      authority: source === "test-fixture" || source.includes("fixture") ? "fixture" : "local",
      assumptions: [
        "Accessory universe metadata is used for family grouping and missing-accessory candidates.",
        "Family/dependency handling is complete only when the provider supplies explicit family or upgrade-chain fields.",
      ],
    },
    warnings: familyWarnings,
  };
}

export async function unavailableAccessoryMetadataProvider() {
  return {
    accessories: [],
    provider: {
      source: "accessory-metadata",
      providerKind: "accessory-metadata",
      url: null,
      version: null,
      fetchedAt: nowIso(),
      cacheStatus: "unavailable",
      authority: "unknown",
      assumptions: [
        "No accessory universe provider is available, so missing-accessory and family-chain results are partial.",
      ],
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
          familyConfidence: "id_fallback",
          familySourceFields: ["internalId"],
          magicalPower: null,
          obtainable: true,
        })),
      provider: {
        source: "Hypixel Resources",
        providerKind: "accessory-metadata",
        url: response.url ?? "https://api.hypixel.net/v2/resources/skyblock/items",
        version: null,
        fetchedAt: nowIso(),
        cacheStatus: "miss",
        authority: "official",
        license: "Official Hypixel public API resource response.",
        assumptions: [
          "Hypixel resources are authoritative for item existence, IDs, tier, and category fields exposed by the API.",
          "Hypixel resources do not expose accessory upgrade-family dependency chains, so family handling falls back to item IDs.",
        ],
      },
      warnings: [{
        code: "accessory_family_metadata_incomplete",
        message: "Hypixel item resources do not expose accessory upgrade-family dependency chains; richer family grouping requires a maintained third-party provider.",
      }],
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
    providerKind: provider.providerKind ?? null,
    url: provider.url ?? null,
    version: provider.version ?? null,
    fetchedAt: provider.fetchedAt ?? null,
    cacheStatus: provider.cacheStatus ?? null,
    stale: Boolean(provider.stale || provider.cacheStatus === "stale"),
    authority: provider.authority ?? null,
    license: provider.license ?? null,
    assumptions: provider.assumptions ?? [],
  }));
}

function priceWarningCodes() {
  return new Set([
    "accessory_price_limit_reached",
    "accessory_price_timeout",
    "price_unavailable",
    "provider_failed",
    "stale_cache",
    "cache_stale",
  ]);
}

function uniqueWarnings(warnings: any[]) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = `${warning?.code ?? "unknown"}|${warning?.message ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function upgradeFromPrice(accessory: any, gain: number, price: any, budget: number | null) {
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

function timeoutPrice(internalId: string, timeoutMs: number | undefined) {
  return {
    itemId: internalId,
    price: null,
    candidatePrice: null,
    confidence: "none",
    provider: null,
    warnings: [{
      code: "accessory_price_timeout",
      message: `Skipped accessory pricing because timeoutMs=${timeoutMs} elapsed.`,
    }],
  };
}

async function withDeadline<T>(operation: Promise<T>, deadline: number | null, timeoutValue: T) {
  if (deadline === null) {
    return { value: await operation, timedOut: false };
  }
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    return { value: timeoutValue, timedOut: true };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation.then((value) => {
      if (timer) {
        clearTimeout(timer);
      }
      return { value, timedOut: false };
    }, (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      throw error;
    }),
    new Promise<{ value: T; timedOut: boolean }>((resolve) => {
      timer = setTimeout(() => resolve({ value: timeoutValue, timedOut: true }), remainingMs);
    }),
  ]);
}

export async function calculateAccessoriesFromMember(member: any, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  accessoryMetadataProvider?: () => Promise<any> | any;
  priceProvider?: (internalId: string) => Promise<any> | any;
  budget?: number | null;
  maxPriceLookups?: number;
  timeoutMs?: number;
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
    const familyState = accessoryFamilyState(providerMetadata, item.internalId);
    const family = familyState.family;
    warnings.push(...(providerMetadata.warnings ?? []));
    const rarity = item.rarity ?? providerMetadata.rarity ?? "COMMON";
    const recombobulated = Boolean(item.recombobulated);
    const magicalPower = providerMetadata.magicalPower ?? magicalPowerFor(rarity, recombobulated);
    const record = {
      internalId: item.internalId,
      displayName: item.cleanName ?? item.displayName,
      family: familyState.family,
      familyConfidence: providerMetadata.familyConfidence ?? familyState.confidence,
      familyProviderFreshness: itemProviderFreshness(providerMetadata.provider ?? universeResult.provider),
      familyWarnings: uniqueWarnings([...(providerMetadata.warnings ?? []), ...familyState.warnings]),
      rarity,
      recombobulated,
      enrichment: enrichmentState(item),
      magicalPower,
      exact: Boolean(providerMetadata.magicalPower),
      rawNbtPointer: item.rawNbtPointer,
      warnings: uniqueWarnings([...(item.warnings ?? []), ...(providerMetadata.warnings ?? []), ...familyState.warnings]),
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
      familyConfidence: entry.familyConfidence ?? "id_fallback",
      familyProviderFreshness: itemProviderFreshness(universeResult.provider),
      familyWarnings: entry.warnings ?? [],
      rarity: entry.rarity,
      magicalPower: entry.magicalPower,
    }));
  const priceProvider = options.priceProvider ?? itemPrice;
  const budget = options.budget === undefined ? null : options.budget;
  const maxPriceLookups = options.maxPriceLookups === undefined ? Infinity : Math.max(0, Number(options.maxPriceLookups));
  const deadline = options.timeoutMs === undefined ? null : Date.now() + Math.max(0, Number(options.timeoutMs));
  let priceLookupCount = 0;
  let partial = false;
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
    const limitReached = priceLookupCount >= maxPriceLookups;
    const timedOut = deadline !== null && Date.now() >= deadline;
    if (limitReached || timedOut) {
      partial = true;
      const code = limitReached ? "accessory_price_limit_reached" : "accessory_price_timeout";
      pricedMissing.push({
        internalId: accessory.internalId,
        displayName: accessory.displayName,
        family: accessory.family,
        rarity: accessory.rarity,
        magicalPowerGain: gain,
        price: null,
        candidatePrice: null,
        coinPerMagicalPower: null,
        withinBudget: false,
        provider: null,
        warnings: [{
          code,
          message: limitReached
            ? `Skipped accessory pricing after ${priceLookupCount} lookups because maxPriceLookups=${maxPriceLookups}.`
            : `Skipped accessory pricing because timeoutMs=${options.timeoutMs} elapsed.`,
        }],
      });
      continue;
    }
    priceLookupCount += 1;
    const priced = await withDeadline(
      Promise.resolve(priceProvider(accessory.internalId)),
      deadline,
      timeoutPrice(accessory.internalId, options.timeoutMs),
    );
    if (priced.timedOut) {
      partial = true;
    }
    pricedMissing.push(upgradeFromPrice(accessory, gain, priced.value, budget));
  }
  pricedMissing.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const nextUpgradeIds = new Set([...nextMissingByFamily.values()].map((entry) => entry.internalId));
  const upgrades = pricedMissing
    .filter((entry) => nextUpgradeIds.has(entry.internalId))
    .filter((entry) => entry.magicalPowerGain > 0 && entry.withinBudget)
    .sort((a, b) => (a.coinPerMagicalPower ?? Infinity) - (b.coinPerMagicalPower ?? Infinity));
  const warningCodes = priceWarningCodes();

  return {
    status: partial ? "partial" : "complete",
    valuation: {
      status: partial ? "partial" : "complete",
      priceLookupCount,
      maxPriceLookups: Number.isFinite(maxPriceLookups) ? maxPriceLookups : null,
      timeoutMs: options.timeoutMs ?? null,
    },
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
    providerFreshness: providerFreshness(universeResult.provider, ...pricedMissing.map((entry) => entry.provider)),
    assumptions: ASSUMPTIONS,
    warnings: [
      ...uniqueWarnings(warnings),
      ...pricedMissing.flatMap((entry) => (entry.warnings ?? []).filter((warning: any) => warningCodes.has(warning.code))),
    ],
  };
}

export async function accessoriesForPlayer(player?: string, profile?: string, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  accessoryMetadataProvider?: () => Promise<any> | any;
  priceProvider?: (internalId: string) => Promise<any> | any;
  budget?: number | null;
  maxPriceLookups?: number;
  timeoutMs?: number;
} = {}) {
  const context = await fetchProfileContext(player, profile);
  const result = await calculateAccessoriesFromMember(context.member, {
    ...options,
    maxPriceLookups: options.maxPriceLookups ?? DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS,
    timeoutMs: options.timeoutMs ?? DEFAULT_ACCESSORY_TIMEOUT_MS,
  });
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
    status: result.status,
    valuation: result.valuation,
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
    status: result.status,
    valuation: result.valuation,
    magicalPower: result.magicalPower,
    upgrades: result.upgrades,
    providerFreshness: result.providerFreshness,
    assumptions: result.assumptions,
    warnings: result.warnings,
    rateLimit: result.rateLimit,
  };
}
