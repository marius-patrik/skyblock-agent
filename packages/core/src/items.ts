import { inventoryForPlayer } from "./inventory.ts";

const NEU_RAW_BASE = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";

export type ProviderMetadata = {
  source: string;
  providerKind?: string;
  url?: string;
  version?: string;
  fetchedAt: string;
  cacheStatus: "hit" | "miss" | "unavailable" | "disabled" | "stale";
  stale?: boolean;
  authority?: "official" | "third-party" | "fixture" | "local" | "unknown";
  license?: string;
  assumptions?: string[];
};

export type ItemMetadataResult = {
  internalId: string;
  metadata: Record<string, any> | null;
  provider: ProviderMetadata;
  warnings: Array<{ code: string; message: string }>;
};

const metadataCache = new Map<string, ItemMetadataResult>();

export function clearMetadataCache() {
  metadataCache.clear();
}

export function metadataCacheStatus() {
  const entries = [...metadataCache.entries()].map(([internalId, result]) => ({
    internalId,
    source: result.provider.source,
    url: result.provider.url ?? null,
    version: result.provider.version ?? null,
    fetchedAt: result.provider.fetchedAt,
    cacheStatus: result.provider.cacheStatus,
    warnings: result.warnings,
  }));
  return {
    entries,
    entryCount: entries.length,
    unavailableCount: entries.filter((entry) => entry.cacheStatus === "unavailable").length,
  };
}

export function cleanMinecraftText(value: unknown) {
  return String(value ?? "")
    .replace(/§[0-9A-FK-OR]/gi, "")
    .replace(/[✪➊➋➌➍➎]/g, "")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeInternalId(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function metadataProviderResult(internalId: string, metadata: Record<string, any> | null, source = "test-fixture"): ItemMetadataResult {
  return {
    internalId: normalizeInternalId(internalId),
    metadata,
    provider: {
      source,
      providerKind: "item-metadata",
      version: "local",
      fetchedAt: nowIso(),
      cacheStatus: metadata ? "hit" : "unavailable",
      authority: source === "test-fixture" || source.includes("fixture") ? "fixture" : "local",
      assumptions: [
        "Fixture/local metadata is used for deterministic tests or local fallback behavior.",
        "Item metadata does not imply item value unless a price provider supplies a resolved price.",
      ],
    },
    warnings: metadata ? [] : [{
      code: "metadata_unavailable",
      message: `No metadata available for ${internalId}.`,
    }],
  };
}

export async function neuItemMetadata(internalId: string, options: { fetchImpl?: (input: string) => Promise<Response>; useCache?: boolean } = {}): Promise<ItemMetadataResult> {
  const id = normalizeInternalId(internalId);
  const useCache = options.useCache ?? true;
  if (useCache && metadataCache.has(id)) {
    const cached = metadataCache.get(id)!;
    return {
      ...cached,
      provider: {
        ...cached.provider,
        cacheStatus: "hit",
      },
    };
  }

  const url = `${NEU_RAW_BASE}/${encodeURIComponent(id)}.json`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const providerBase = {
    source: "NotEnoughUpdates-REPO",
    providerKind: "item-metadata",
    url,
    fetchedAt: nowIso(),
    authority: "third-party" as const,
    license: "Not bundled; fetched from the public NotEnoughUpdates-REPO item JSON when requested.",
    assumptions: [
      "NotEnoughUpdates item data is a community metadata provider, not authoritative profile state.",
      "Provider fields can describe names, tiers, categories, and static item metadata, but modifier valuation still requires separate maintained providers.",
    ],
  };

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        internalId: id,
        metadata: null,
        provider: {
          ...providerBase,
          cacheStatus: "unavailable",
        },
        warnings: [{
          code: response.status === 404 ? "metadata_missing" : "metadata_provider_error",
          message: `NEU metadata request failed for ${id}: HTTP ${response.status}`,
        }],
      };
    }
    const result: ItemMetadataResult = {
      internalId: id,
      metadata: await response.json(),
      provider: {
        ...providerBase,
        cacheStatus: "miss",
      },
      warnings: [],
    };
    if (useCache) {
      metadataCache.set(id, result);
    }
    return result;
  } catch (error) {
    return {
      internalId: id,
      metadata: null,
      provider: {
        ...providerBase,
        cacheStatus: "unavailable",
      },
      warnings: [{
        code: "metadata_provider_unavailable",
        message: `NEU metadata is unavailable for ${id}: ${(error as Error).message}`,
      }],
    };
  }
}

function parsePetInfo(extra: Record<string, any>) {
  if (!extra.petInfo || typeof extra.petInfo !== "string") {
    return null;
  }
  try {
    return JSON.parse(extra.petInfo);
  } catch {
    return null;
  }
}

function gemstoneData(extra: Record<string, any>) {
  const gemstones = extra.gems && typeof extra.gems === "object" ? extra.gems : {};
  const slots = Object.keys(extra).filter((key) => key.startsWith("gemslot_")).map((key) => ({
    id: key.replace(/^gemsilot_|^gemslot_/, ""),
    value: extra[key],
  }));
  return {
    gemstones,
    slots,
  };
}

function inferRarity(stack: Record<string, any>, metadata: Record<string, any> | null) {
  if (metadata?.tier) {
    return String(metadata.tier).toUpperCase();
  }
  const lore = Array.isArray(stack.raw?.tag?.display?.Lore) ? stack.raw.tag.display.Lore : [];
  const rarityLine = lore.map(cleanMinecraftText).reverse().find((line) => /\b(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC|DIVINE|SPECIAL|VERY SPECIAL)\b/.test(line));
  return rarityLine?.match(/\b(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC|DIVINE|SPECIAL|VERY SPECIAL)\b/)?.[1] ?? null;
}

function inferCategory(stack: Record<string, any>, metadata: Record<string, any> | null) {
  return metadata?.category ?? metadata?.itemid ?? stack.itemId ?? null;
}

function stableProviderIdentity(provider: ProviderMetadata) {
  return {
    source: provider.source,
    url: provider.url ?? null,
    version: provider.version ?? null,
    authority: provider.authority ?? "unknown",
  };
}

export function providerFreshness(provider: ProviderMetadata | null | undefined) {
  if (!provider) {
    return null;
  }
  return {
    source: provider.source,
    providerKind: provider.providerKind ?? "item-metadata",
    url: provider.url ?? null,
    version: provider.version ?? null,
    fetchedAt: provider.fetchedAt ?? null,
    cacheStatus: provider.cacheStatus ?? null,
    stale: Boolean(provider.stale || provider.cacheStatus === "stale"),
    authority: provider.authority ?? "unknown",
    license: provider.license ?? null,
    assumptions: provider.assumptions ?? [],
  };
}

function modifierSummary(extra: Record<string, any>, petInfo: Record<string, any> | null) {
  const hotPotatoCount = Number(extra.hot_potato_count ?? 0);
  return {
    reforge: extra.modifier ?? null,
    enchantments: extra.enchantments ?? {},
    attributes: extra.attributes ?? {},
    hotPotatoCount,
    fumingPotatoCount: Math.max(0, hotPotatoCount - 10),
    stars: Number(extra.upgrade_level ?? extra.dungeon_item_level ?? 0),
    masterStars: Number(extra.master_star_count ?? extra.masterStars ?? 0),
    dungeonized: Boolean(extra.dungeon_item_level || extra.item_tier || extra.baseStatBoostPercentage),
    dungeonItemQuality: extra.baseStatBoostPercentage ?? extra.item_quality ?? null,
    gemstones: gemstoneData(extra).gemstones,
    gemstoneSlots: gemstoneData(extra).slots,
    recombobulated: Boolean(extra.rarity_upgrades),
    rune: extra.runes ?? null,
    skin: extra.skin ?? extra.pet_skin ?? petInfo?.skin ?? null,
    dye: extra.dye_item ?? extra.dye ?? null,
    cakeYear: extra.new_years_cake ?? extra.year ?? null,
    petItem: extra.petItem ?? petInfo?.heldItem ?? null,
    heldItem: extra.heldItem ?? petInfo?.heldItem ?? null,
  };
}

function hasEntries(value: any) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

function uncertainty(status: string, value: any, provider: ProviderMetadata, warnings: Array<{ code: string; message: string }> = [], estimated = false) {
  return {
    status,
    value: value ?? null,
    estimated,
    provider: stableProviderIdentity(provider),
    providerFreshness: providerFreshness(provider),
    warnings,
  };
}

function modifierUncertainty(modifiers: ReturnType<typeof modifierSummary>, metadata: Record<string, any> | null, provider: ProviderMetadata, petInfo: Record<string, any> | null) {
  const metadataAvailable = Boolean(metadata);
  const metadataStatus = metadataAvailable ? "provider_backed" : "metadata_unavailable";
  const staticWarning = metadataAvailable ? [] : [{
    code: "modifier_metadata_unavailable",
    message: "Item metadata provider was unavailable; profile-observed modifiers are preserved but static metadata confidence is degraded.",
  }];
  const petWarnings = petInfo ? [{
    code: "pet_level_formula_unavailable",
    message: "Pet XP is preserved from profile data, but SkyAgent has no maintained pet level formula provider in this slice.",
  }] : [];
  const skinWarnings = modifiers.skin ? [{
    code: "skin_value_unsupported",
    message: "Skin presence is observed from profile data, but skin value is not independently priced without a maintained provider.",
  }] : [];
  const dyeWarnings = modifiers.dye ? [{
    code: "dye_value_unsupported",
    message: "Dye presence is observed from profile data, but dye value is not independently priced without a maintained provider.",
  }] : [];

  return {
    providerFreshness: providerFreshness(provider),
    metadata: uncertainty(metadataStatus, metadataAvailable, provider, staticWarning, !metadataAvailable),
    petLevel: uncertainty(petInfo ? "unsupported_formula" : "not_pet", petInfo?.exp ?? null, provider, petWarnings, true),
    skin: uncertainty(modifiers.skin ? "observed_unvalued" : "not_present", modifiers.skin, provider, skinWarnings, true),
    dye: uncertainty(modifiers.dye ? "observed_unvalued" : "not_present", modifiers.dye, provider, dyeWarnings, true),
    gemstones: uncertainty(hasEntries(modifiers.gemstones) || modifiers.gemstoneSlots.length ? "observed_profile_modifier" : "not_present", modifiers.gemstones, provider, [], !metadataAvailable),
    attributes: uncertainty(hasEntries(modifiers.attributes) ? "observed_profile_modifier" : "not_present", modifiers.attributes, provider, [], !metadataAvailable),
    enchantments: uncertainty(hasEntries(modifiers.enchantments) ? "observed_profile_modifier" : "not_present", modifiers.enchantments, provider, [], !metadataAvailable),
    dungeonQuality: uncertainty(modifiers.dungeonized || modifiers.dungeonItemQuality !== null || modifiers.stars > 0 || modifiers.masterStars > 0 ? "observed_profile_modifier" : "not_present", {
      stars: modifiers.stars,
      masterStars: modifiers.masterStars,
      dungeonized: modifiers.dungeonized,
      dungeonItemQuality: modifiers.dungeonItemQuality,
    }, provider, [], !metadataAvailable),
    museum: uncertainty("unsupported_eligibility_value", metadata?.museum ?? metadata?.museumData ?? null, provider, [{
      code: "museum_value_unsupported",
      message: "Museum eligibility/value is not derived from item metadata unless a maintained Museum provider supplies it.",
    }], true),
    valuation: uncertainty("unsupported_modifier_value", null, provider, [{
      code: "modifier_value_unsupported",
      message: "Modifier-level value is not independently calculated; only direct item ID price providers contribute to networth totals.",
    }], true),
  };
}

function modifierWarnings(uncertaintyResult: any) {
  return Object.values(uncertaintyResult)
    .flatMap((entry: any) => Array.isArray(entry?.warnings) ? entry.warnings : [])
    .filter((warning: any) => warning.code !== "museum_value_unsupported" && warning.code !== "modifier_value_unsupported");
}

export function normalizeItemStackRecord(stack: Record<string, any>, metadataResult: ItemMetadataResult = metadataProviderResult(stack.internalId, null)) {
  const extra = stack.extraAttributes ?? {};
  const metadata = metadataResult.metadata;
  const internalId = normalizeInternalId(stack.internalId ?? extra.id ?? metadataResult.internalId);
  const petInfo = parsePetInfo(extra);
  const modifiers = modifierSummary(extra, petInfo);
  const displayName = stack.displayName ?? metadata?.displayname ?? internalId;
  const modifierUncertaintyResult = modifierUncertainty(modifiers, metadata, metadataResult.provider, petInfo);

  return {
    internalId,
    displayName,
    cleanName: cleanMinecraftText(metadata?.displayname ?? displayName),
    rarity: inferRarity(stack, metadata),
    category: inferCategory(stack, metadata),
    count: stack.count ?? 1,
    reforge: modifiers.reforge,
    enchantments: modifiers.enchantments,
    attributes: modifiers.attributes,
    hotPotatoCount: modifiers.hotPotatoCount,
    fumingPotatoCount: modifiers.fumingPotatoCount,
    stars: modifiers.stars,
    masterStars: modifiers.masterStars,
    dungeonized: modifiers.dungeonized,
    dungeonItemQuality: modifiers.dungeonItemQuality,
    gemstones: modifiers.gemstones,
    gemstoneSlots: modifiers.gemstoneSlots,
    recombobulated: modifiers.recombobulated,
    rune: modifiers.rune,
    skin: modifiers.skin,
    dye: modifiers.dye,
    cakeYear: modifiers.cakeYear,
    petItem: modifiers.petItem,
    heldItem: modifiers.heldItem,
    specialModifiers: {
      petInfo,
      extraKeys: Object.keys(extra).filter((key) => ![
        "id",
        "modifier",
        "enchantments",
        "attributes",
        "hot_potato_count",
        "upgrade_level",
        "dungeon_item_level",
        "master_star_count",
        "rarity_upgrades",
      ].includes(key)),
    },
    rawNbtPointer: {
      sourcePath: stack.sourcePath ?? null,
      slot: stack.slot ?? null,
      index: stack.index ?? null,
      containerId: stack.containerId ?? null,
    },
    metadataProvider: stableProviderIdentity(metadataResult.provider),
    metadataProviderFreshness: providerFreshness(metadataResult.provider),
    modifierUncertainty: modifierUncertaintyResult,
    warnings: [...metadataResult.warnings, ...modifierWarnings(modifierUncertaintyResult)],
  };
}

export async function normalizeItemStacks(stacks: Array<Record<string, any>>, options: {
  metadataProvider?: (internalId: string) => Promise<ItemMetadataResult> | ItemMetadataResult;
} = {}) {
  const provider = options.metadataProvider ?? neuItemMetadata;
  const items = [];
  const providerProvenance = [];
  for (const stack of stacks) {
    const internalId = normalizeInternalId(stack.internalId ?? stack.extraAttributes?.id);
    const metadata = internalId
      ? await provider(internalId)
      : metadataProviderResult("UNKNOWN", null, "none");
    providerProvenance.push({
      internalId: metadata.internalId,
      provider: metadata.provider,
      warnings: metadata.warnings,
    });
    items.push(normalizeItemStackRecord(stack, metadata));
  }
  return {
    items,
    itemCount: items.length,
    providerProvenance,
    warnings: items.flatMap((item) => item.warnings),
  };
}

export async function normalizedItemsForPlayer(player?: string, profile?: string, options: {
  metadataProvider?: (internalId: string) => Promise<ItemMetadataResult> | ItemMetadataResult;
} = {}) {
  const inventory = await inventoryForPlayer(player, profile);
  const stacks = inventory.sections.flatMap((section: any) => section.items ?? []);
  const normalized = await normalizeItemStacks(stacks, options);
  return {
    uuid: inventory.uuid,
    profile: inventory.profile,
    rateLimit: inventory.rateLimit,
    ...normalized,
  };
}

export async function itemMetadata(internalId: string, options: { fetchImpl?: (input: string) => Promise<Response>; useCache?: boolean } = {}) {
  return neuItemMetadata(internalId, options);
}
