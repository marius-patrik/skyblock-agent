import { inventoryForPlayer } from "./inventory.ts";

const NEU_RAW_BASE = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";

export type ProviderMetadata = {
  source: string;
  url?: string;
  version?: string;
  fetchedAt: string;
  cacheStatus: "hit" | "miss" | "unavailable" | "disabled";
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
      version: "local",
      fetchedAt: nowIso(),
      cacheStatus: metadata ? "hit" : "unavailable",
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
    url,
    fetchedAt: nowIso(),
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

export function normalizeItemStackRecord(stack: Record<string, any>, metadataResult: ItemMetadataResult = metadataProviderResult(stack.internalId, null)) {
  const extra = stack.extraAttributes ?? {};
  const metadata = metadataResult.metadata;
  const internalId = normalizeInternalId(stack.internalId ?? extra.id ?? metadataResult.internalId);
  const petInfo = parsePetInfo(extra);
  const modifiers = modifierSummary(extra, petInfo);
  const displayName = stack.displayName ?? metadata?.displayname ?? internalId;

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
    warnings: metadataResult.warnings,
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
