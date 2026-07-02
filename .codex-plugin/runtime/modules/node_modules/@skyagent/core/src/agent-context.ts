import { calculateAccessoriesFromMember } from "./accessories.ts";
import { inventorySectionFromMember } from "./inventory.ts";
import { emitContextEvent, providerStatusWithEvent } from "./context-events.ts";
import { objectiveContextSummary } from "./objectives.ts";
import { READINESS_AREAS, readinessFromContext } from "./readiness.ts";
import { buildProfileSnapshot, profileSnapshotForPlayer, writeProfileSnapshot } from "./profile-cache.ts";
import { fetchProfileContext } from "./profile.ts";

function compactWarnings(warnings: any[] = [], limit = 25) {
  return warnings.filter(Boolean).slice(0, limit).map((warning) => ({
    code: warning.code ?? "warning",
    message: warning.message ?? String(warning),
    sourcePath: warning.sourcePath ?? warning.source ?? null,
  }));
}

const PARTIAL_WARNING_CODES = new Set([
  "partial_loadout_armor",
  "current_loadout_unknown",
  "unsupported_section_shape",
  "inventory_section_error",
  "nbt_decode_error",
  "invalid_nbt_payload",
  "accessory_price_limit_reached",
  "accessory_price_timeout",
  "accessory_metadata_unavailable",
]);

function warningCodes(warnings: any[] = []) {
  return new Set((warnings ?? []).map((warning) => warning?.code).filter(Boolean));
}

function decodedSectionStatus(section: any) {
  if (!section?.available) {
    return "missing";
  }
  const codes = warningCodes(section.warnings);
  if ([...codes].some((code) => PARTIAL_WARNING_CODES.has(code))) {
    return "partial";
  }
  return "fresh";
}

function cachedStatus(snapshot: any, cached: any, signalKey?: string) {
  if (cached) {
    return snapshot.stale ? "stale" : "cached";
  }
  if (signalKey && snapshot.overview?.inventoryApiSignals?.[signalKey] === false) {
    return "missing";
  }
  if (snapshot.stale) {
    return "stale";
  }
  return "cached";
}

function sectionFreshness(status: string, source: string, snapshotOrGeneratedAt: any) {
  return {
    status,
    source,
    fetchedAt: snapshotOrGeneratedAt?.fetchedAt ?? snapshotOrGeneratedAt ?? null,
    stale: Boolean(snapshotOrGeneratedAt?.stale),
  };
}

function compactItems(section: any, limit = 8) {
  return (section?.items ?? []).slice(0, limit).map((item: any) => ({
    name: item.displayName ?? item.name ?? item.internalId ?? item.id ?? "Unknown item",
    internalId: item.internalId ?? item.id ?? null,
    count: item.count ?? 1,
    rarity: item.rarity ?? null,
    armorSlot: item.armorSlot ?? null,
    loadoutSlot: item.loadoutSlot ?? null,
    wardrobeSource: item.wardrobeSource ?? section.sourceKind ?? null,
    current: item.current ?? null,
    sourcePath: item.sourcePath ?? section.sourcePath ?? null,
  }));
}

function sectionSummary(section: any, limit = 8) {
  const status = decodedSectionStatus(section);
  return {
    status,
    available: Boolean(section?.available),
    itemCount: section?.itemCount ?? 0,
    sourcePath: section?.sourcePath ?? null,
    sourceKind: section?.sourceKind ?? null,
    currentLoadoutFallback: section?.currentLoadoutFallback ?? false,
    freshness: sectionFreshness(status, "profile", null),
    items: compactItems(section, limit),
    warnings: compactWarnings(section?.warnings ?? [], 8),
  };
}

function compactPetItems(section: any, limit = 8) {
  const sorted = [...(section?.items ?? [])]
    .sort((left: any, right: any) => {
      const leftActive = Boolean(left.active ?? left.extraAttributes?.active);
      const rightActive = Boolean(right.active ?? right.extraAttributes?.active);
      const activeDelta = Number(rightActive) - Number(leftActive);
      return activeDelta || Number(right.xp ?? right.extraAttributes?.exp ?? 0) - Number(left.xp ?? left.extraAttributes?.exp ?? 0);
    });
  return sorted.slice(0, limit)
    .map((item: any) => ({
      name: item.displayName ?? item.internalId ?? "Unknown pet",
      internalId: item.internalId ?? null,
      tier: item.extraAttributes?.tier ?? null,
      xp: item.xp ?? item.extraAttributes?.exp ?? null,
      level: item.level ?? item.extraAttributes?.level ?? null,
      levelSource: item.levelSource ?? item.extraAttributes?.levelSource ?? null,
      active: item.active ?? item.extraAttributes?.active ?? null,
      heldItem: item.heldItem ?? item.extraAttributes?.heldItem ?? null,
      skin: item.skin ?? item.extraAttributes?.skin ?? null,
      candyUsed: item.candyUsed ?? item.extraAttributes?.candyUsed ?? null,
      warningCount: (item.warnings ?? []).length,
      sourcePath: item.sourcePath ?? section.sourcePath ?? null,
    }));
}

function petSummary(section: any, limit = 8) {
  const items = compactPetItems(section, limit);
  const status = decodedSectionStatus(section);
  return {
    status,
    available: Boolean(section?.available),
    itemCount: section?.itemCount ?? 0,
    sourcePath: section?.sourcePath ?? null,
    sourceKind: section?.sourceKind ?? null,
    currentLoadoutFallback: section?.currentLoadoutFallback ?? false,
    freshness: sectionFreshness(status, "profile", null),
    activePet: items.find((item: any) => item.active) ?? null,
    items,
    warnings: compactWarnings(section?.warnings ?? [], 8),
  };
}

function compactReadiness(entry: any) {
  const rawFreshnessStatus = entry.freshness?.status;
  const freshnessStatus = ["fresh", "cached", "stale", "partial", "missing", "unavailable"].includes(rawFreshnessStatus)
    ? rawFreshnessStatus
    : "fresh";
  return {
    area: entry.area,
    rating: entry.rating,
    status: entry.status,
    freshnessStatus,
    freshness: entry.freshness ?? sectionFreshness(freshnessStatus, "profile", null),
    failedChecks: (entry.checks ?? []).filter((check: any) => !check.passed).map((check: any) => check.name),
    warningCount: (entry.warnings ?? []).length,
  };
}

function followUpTools() {
  return {
    profile: ["skyblock_profile_snapshot", "skyblock_profile_overview", "skyblock_profile_member"],
    inventory: ["skyblock_inventory_section", "skyblock_item_dump", "skyblock_normalized_items"],
    economy: ["skyblock_networth", "skyblock_item_networth", "skyblock_price", "skyblock_price_history"],
    progression: ["skyblock_progression", "skyblock_profile_section", "skyblock_readiness", "skyblock_weight"],
    planning: ["skyblock_plan_goal", "skyblock_next_upgrades", "skyagent_objective_create", "skyagent_objective_list", "skyagent_objective_update"],
  };
}

function getPath(source: any, path: string[]) {
  let current = source;
  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function officialMagicalPower(member: any) {
  const candidates = [
    ["accessory_bag_storage", "highest_magical_power"],
    ["accessory_bag_storage", "magical_power"],
    ["profile", "accessory_bag_storage", "highest_magical_power"],
    ["player_data", "accessory_bag_storage", "highest_magical_power"],
  ];
  for (const path of candidates) {
    const value = getPath(member, path);
    if (Number.isFinite(Number(value))) {
      return { value: Number(value), sourcePath: `member.${path.join(".")}` };
    }
  }
  return null;
}

function accessoryStatus(accessories: any) {
  const codes = warningCodes(accessories?.warnings);
  if (codes.has("missing_section")) {
    return "missing";
  }
  if (accessories?.status === "partial" || [...codes].some((code) => PARTIAL_WARNING_CODES.has(code))) {
    return "partial";
  }
  if (!accessories) {
    return "unavailable";
  }
  return "fresh";
}

function compactAccessories(accessories: any, member?: any) {
  const status = accessoryStatus(accessories);
  const official = officialMagicalPower(member);
  const estimated = accessories?.magicalPower ?? null;
  const magicalPower = official || estimated ? {
    ...(estimated ?? {}),
    value: official?.value ?? estimated?.estimated ?? null,
    source: official ? "profile_official" : "item_derived_estimate",
    sourcePath: official?.sourcePath ?? "inventory.accessory_bag",
    exact: Boolean(official) || Boolean(estimated?.exact),
    estimated: estimated?.estimated ?? null,
  } : null;
  return {
    status,
    freshness: sectionFreshness(status, "profile+providers", null),
    valuation: accessories?.valuation ?? null,
    magicalPower,
    ownedCount: accessories?.owned?.length ?? 0,
    activeCount: accessories?.activeAccessories?.length ?? 0,
    duplicateCount: accessories?.duplicates?.length ?? 0,
    missingCount: accessories?.missing?.length ?? 0,
    cheapestMissing: (accessories?.cheapestMissing ?? []).slice(0, 5).map((entry: any) => ({
      internalId: entry.internalId,
      name: entry.name,
      price: entry.price,
      magicalPower: entry.magicalPower,
    })),
    providerFreshness: accessories?.providerFreshness ?? [],
    warnings: compactWarnings(accessories?.warnings ?? [], 8),
  };
}

function coreProgressionFromSnapshot(snapshot: any) {
  return {
    skyblockLevelXp: snapshot.overview?.progression?.skyblockLevelXp ?? null,
    skillCount: snapshot.overview?.progression?.skillExperienceKeys?.length ?? 0,
    slayerBosses: snapshot.overview?.progression?.slayerBosses ?? [],
    dungeonTypes: snapshot.overview?.progression?.dungeonTypes ?? [],
    dungeonClasses: snapshot.overview?.progression?.dungeonClasses ?? [],
    collectionCount: snapshot.overview?.progression?.collections?.length ?? 0,
    craftedGeneratorCount: snapshot.overview?.progression?.craftedGenerators ?? null,
    unlockedCollectionTierCount: snapshot.overview?.progression?.unlockedCollections ?? null,
  };
}

function cachedSectionSummary(snapshot: any, cached: any, signalKey: string, label: string) {
  const status = cachedStatus(snapshot, cached, signalKey);
  if (cached) {
    return {
      ...cached,
      status,
      freshness: sectionFreshness(status, "profile-snapshot-cache", snapshot),
      warnings: compactWarnings([
        ...(cached.warnings ?? []),
        ...(snapshot.stale ? [{
          code: "stale_profile_snapshot",
          message: `${label} detail came from a stale profile snapshot cache entry.`,
          sourcePath: "profile-snapshot-cache",
        }] : []),
      ], 8),
    };
  }
  const sourcePath = `overview.inventoryApiSignals.${signalKey}`;
  return {
    status,
    available: Boolean(snapshot.overview?.inventoryApiSignals?.[signalKey]),
    itemCount: null,
    sourcePath,
    freshness: sectionFreshness(status, "profile-snapshot-cache", snapshot),
    items: [],
    warnings: compactWarnings([{
      code: status === "missing" ? "cached_detail_missing" : "cached_detail_limited",
      message: status === "missing"
        ? `${label} API signal was missing or disabled when this snapshot was written.`
        : `${label} detail was not stored in this profile snapshot; refresh context for decoded item summaries.`,
      sourcePath,
    }, ...(snapshot.stale ? [{
      code: "stale_profile_snapshot",
      message: `${label} detail came from a stale profile snapshot cache entry.`,
      sourcePath: "profile-snapshot-cache",
    }] : []),
    ], 8),
  };
}

function cachedAccessoriesSummary(snapshot: any) {
  const cached = snapshot.agentContextSummary?.accessories;
  const status = cachedStatus(snapshot, cached, "hasAccessoryBag");
  if (cached) {
    return {
      ...cached,
      status,
      freshness: sectionFreshness(status, "profile-snapshot-cache", snapshot),
      warnings: compactWarnings([
        ...(cached.warnings ?? []),
        ...(snapshot.stale ? [{
          code: "stale_profile_snapshot",
          message: "Accessory detail came from a stale profile snapshot cache entry.",
          sourcePath: "profile-snapshot-cache",
        }] : []),
      ], 8),
    };
  }
  const sourcePath = "overview.inventoryApiSignals.hasAccessoryBag";
  return {
    status,
    freshness: sectionFreshness(status, "profile-snapshot-cache", snapshot),
    magicalPower: null,
    ownedCount: null,
    activeCount: null,
    duplicateCount: null,
    missingCount: null,
    cheapestMissing: [],
    providerFreshness: [],
    sourcePath,
    warnings: compactWarnings([{
      code: status === "missing" ? "cached_detail_missing" : "cached_detail_limited",
      message: status === "missing"
        ? "Accessory API signal was missing or disabled when this snapshot was written."
        : "Accessory detail was not stored in this profile snapshot; refresh context for Magical Power and missing accessory summaries.",
      sourcePath,
    }, ...(snapshot.stale ? [{
      code: "stale_profile_snapshot",
      message: "Accessory detail came from a stale profile snapshot cache entry.",
      sourcePath: "profile-snapshot-cache",
    }] : []),
    ], 8),
  };
}

function cachedReadinessSummary(snapshot: any) {
  const cached = snapshot.agentContextSummary?.readiness;
  const freshnessStatus = snapshot.stale ? "stale" : "cached";
  if (cached?.length) {
    return cached.map((entry: any) => ({
      ...entry,
      status: entry.status ?? "unknown",
      freshnessStatus,
      freshness: sectionFreshness(freshnessStatus, "profile-snapshot-cache", snapshot),
      warningCount: entry.warningCount ?? (entry.warnings ?? []).length,
    }));
  }
  return READINESS_AREAS.map((area) => ({
    area,
    rating: "unknown",
    status: "unknown",
    freshnessStatus,
    freshness: sectionFreshness(freshnessStatus, "profile-snapshot-cache", snapshot),
    failedChecks: [],
    warningCount: 1,
  }));
}

function agentContextSummary(capsule: any) {
  return {
    schemaVersion: 1,
    generatedAt: capsule.generatedAt,
    gear: capsule.gear,
    pets: capsule.pets,
    accessories: capsule.accessories,
    readiness: capsule.readiness,
  };
}

function snapshotWithAgentContext(snapshot: any, capsule: any) {
  return {
    ...snapshot,
    agentContextSummary: agentContextSummary(capsule),
  };
}

function providerAggregateStatus(providers: any) {
  const statuses = (providers.providers ?? []).map((provider: any) => provider.status);
  if ((providers.warnings ?? []).length) {
    return "partial";
  }
  if (!statuses.length) {
    return "unavailable";
  }
  if (statuses.some((status) => ["unavailable", "missing_api_key"].includes(status))) {
    return "partial";
  }
  if (statuses.includes("stale")) {
    return "stale";
  }
  if (statuses.includes("cached")) {
    return "cached";
  }
  return "fresh";
}

function objectiveStatus(objectives: any) {
  return objectives ? "fresh" : "unavailable";
}

function contextSections(parts: Record<string, any>, events: any = null) {
  return {
    cache: {
      status: parts.cache.stale ? "stale" : parts.cache.status === "refreshed" ? "fresh" : "cached",
      sourcePath: "profile-snapshot-cache",
      fetchedAt: parts.cache.fetchedAt,
      stale: parts.cache.stale,
    },
    armor: sectionRecord(parts.gear.armor),
    equipment: sectionRecord(parts.gear.equipment),
    wardrobe: sectionRecord(parts.gear.wardrobe),
    pets: sectionRecord(parts.pets),
    accessories: sectionRecord(parts.accessories),
    readiness: {
      status: aggregateSectionStatus(parts.readiness.map((entry: any) => entry.freshnessStatus ?? entry.freshness?.status ?? "unavailable")),
      areas: parts.readiness.map((entry: any) => ({
        area: entry.area,
        status: entry.freshnessStatus ?? entry.freshness?.status ?? "unavailable",
        readinessStatus: entry.status,
        rating: entry.rating,
      })),
      warningCount: parts.readiness.reduce((total: number, entry: any) => total + (entry.warningCount ?? 0), 0),
    },
    objectives: {
      status: objectiveStatus(parts.objectives),
      counts: parts.objectives?.counts ?? null,
      activeCount: parts.objectives?.active?.length ?? null,
    },
    providerFreshness: {
      status: providerAggregateStatus(parts.providerFreshnessRaw),
      generatedAt: parts.providerFreshness.generatedAt,
      providerCount: parts.providerFreshness.providers.length,
    },
    events: events ? {
      status: "fresh",
      included: true,
      latestSequence: events.latestSequence ?? null,
      eventCount: events.events?.length ?? null,
    } : {
      status: "unavailable",
      included: false,
      latestSequence: null,
      eventCount: null,
      warnings: compactWarnings([{
        code: "events_not_included",
        message: "Recent context events are not embedded in this context capsule; use skyagent_context_events or skyagent_start when an event cursor is needed.",
        sourcePath: "context-events",
      }], 1),
    },
  };
}

function sectionRecord(section: any) {
  return {
    status: section.status ?? "unavailable",
    sourcePath: section.sourcePath ?? section.magicalPower?.sourcePath ?? null,
    itemCount: section.itemCount ?? section.ownedCount ?? null,
    warningCount: (section.warnings ?? []).length,
  };
}

function aggregateSectionStatus(statuses: string[]) {
  if (!statuses.length) {
    return "unavailable";
  }
  if (statuses.includes("partial")) {
    return "partial";
  }
  if (statuses.includes("missing")) {
    return "partial";
  }
  if (statuses.includes("stale")) {
    return "stale";
  }
  if (statuses.includes("cached")) {
    return "cached";
  }
  return statuses.every((status) => status === "fresh") ? "fresh" : "partial";
}

export async function buildAgentContext(context: any, options: Record<string, any> = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs;
  const snapshot = options.snapshot ?? buildProfileSnapshot(context, {
    player: options.player,
    ttlMs,
    fetchedAtMs: now,
  });
  const [armor, equipment, wardrobe, pets, accessories] = await Promise.all([
    inventorySectionFromMember(context.member, "armor"),
    inventorySectionFromMember(context.member, "equipment"),
    inventorySectionFromMember(context.member, "wardrobe"),
    inventorySectionFromMember(context.member, "pets"),
    (options.accessoriesProvider ?? calculateAccessoriesFromMember)(context.member, {
      budget: null,
      maxPriceLookups: options.maxPriceLookups ?? 75,
      timeoutMs: options.accessoryTimeoutMs ?? 8_000,
    }),
  ]);
  const readiness = READINESS_AREAS.map((area) => readinessFromContext(context, area));
  const providers = options.providers ?? providerStatusWithEvent();
  const warnings = compactWarnings([
    ...(snapshot.warnings ?? []),
    ...(armor.warnings ?? []),
    ...(equipment.warnings ?? []),
    ...(wardrobe.warnings ?? []),
    ...(pets.warnings ?? []),
    ...(accessories.warnings ?? []),
    ...readiness.flatMap((entry) => entry.warnings ?? []),
    ...(providers.warnings ?? []),
  ]);
  const cache = {
    status: snapshot.cacheStatus ?? "refreshed",
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    stale: Boolean(snapshot.stale),
    ageMs: snapshot.ageMs ?? null,
    ttlMs: snapshot.ttlMs ?? null,
    sourceProvider: snapshot.sourceProvider ?? "hypixel",
  };
  const gear = {
    armor: sectionSummary(armor, 4),
    equipment: sectionSummary(equipment, 4),
    wardrobe: sectionSummary(wardrobe, 8),
  };
  const petsSummary = petSummary(pets, 8);
  const accessoriesSummary = compactAccessories(accessories, context.member);
  const readinessSummary = readiness.map(compactReadiness);
  const objectives = options.objectives ?? objectiveContextSummary();
  const providerFreshness = {
    generatedAt: providers.generatedAt,
    providers: (providers.providers ?? []).map((provider: any) => ({
      id: provider.id,
      status: provider.status,
      source: provider.source,
      cache: provider.cache ? {
        entryCount: provider.cache.entryCount ?? null,
        staleCount: provider.cache.staleCount ?? null,
        unavailableCount: provider.cache.unavailableCount ?? null,
      } : null,
    })),
  };

  return {
    kind: "skyagent.agentContext",
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    cache,
    player: snapshot.player,
    selectedProfile: snapshot.profile,
    profiles: snapshot.profiles,
    economy: snapshot.overview?.economy ?? {},
    coreProgression: coreProgressionFromSnapshot(snapshot),
    inventoryApiSignals: snapshot.overview?.inventoryApiSignals ?? {},
    gear,
    pets: petsSummary,
    accessories: accessoriesSummary,
    readiness: readinessSummary,
    objectives,
    providerFreshness,
    sections: contextSections({ cache, gear, pets: petsSummary, accessories: accessoriesSummary, readiness: readinessSummary, objectives, providerFreshness, providerFreshnessRaw: providers }, options.events),
    warnings,
    followUpTools: followUpTools(),
    rawPayloadsIncluded: false,
    rateLimit: snapshot.rateLimit ?? context.rateLimit ?? null,
  };
}

export function buildAgentContextFromSnapshot(snapshot: any, options: Record<string, any> = {}) {
  const now = options.now ?? Date.now();
  const providers = options.providers ?? providerStatusWithEvent();
  const cached = snapshot.agentContextSummary ?? {};
  const cache = {
    status: snapshot.cacheStatus ?? "hit",
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    stale: Boolean(snapshot.stale),
    ageMs: snapshot.ageMs ?? null,
    ttlMs: snapshot.ttlMs ?? null,
    sourceProvider: snapshot.sourceProvider ?? "hypixel",
  };
  const gear = {
    armor: cachedSectionSummary(snapshot, cached.gear?.armor, "hasArmor", "Armor"),
    equipment: cachedSectionSummary(snapshot, cached.gear?.equipment, "hasInventoryBag", "Equipment"),
    wardrobe: cachedSectionSummary(snapshot, cached.gear?.wardrobe, "hasWardrobe", "Wardrobe"),
  };
  const pets = cachedSectionSummary(snapshot, cached.pets, "hasPets", "Pet");
  const accessories = cachedAccessoriesSummary(snapshot);
  const readiness = cachedReadinessSummary(snapshot);
  const objectives = options.objectives ?? objectiveContextSummary();
  const providerFreshness = {
    generatedAt: providers.generatedAt,
    providers: (providers.providers ?? []).map((provider: any) => ({
      id: provider.id,
      status: provider.status,
      source: provider.source,
      cache: provider.cache ? {
        entryCount: provider.cache.entryCount ?? null,
        staleCount: provider.cache.staleCount ?? null,
        unavailableCount: provider.cache.unavailableCount ?? null,
      } : null,
    })),
  };
  return {
    kind: "skyagent.agentContext",
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    cache,
    player: snapshot.player,
    selectedProfile: snapshot.profile,
    profiles: snapshot.profiles,
    economy: snapshot.overview?.economy ?? {},
    coreProgression: coreProgressionFromSnapshot(snapshot),
    inventoryApiSignals: snapshot.overview?.inventoryApiSignals ?? {},
    gear,
    pets,
    accessories,
    readiness,
    objectives,
    providerFreshness,
    sections: contextSections({ cache, gear, pets, accessories, readiness, objectives, providerFreshness, providerFreshnessRaw: providers }, options.events),
    warnings: compactWarnings([
      ...(snapshot.warnings ?? []),
      ...(providers.warnings ?? []),
      {
        code: "snapshot_only_context",
        message: "Context was built from cached snapshot data only; use context refresh for gear, pets, accessories, and readiness details.",
        sourcePath: "profile-snapshot-cache",
      },
    ]),
    followUpTools: followUpTools(),
    rawPayloadsIncluded: false,
    rateLimit: snapshot.rateLimit ?? null,
  };
}

export async function agentContextForPlayer(player?: string, profile?: string, options: Record<string, any> = {}) {
  const cacheOnly = options.cacheOnly ?? !options.refresh;
  if (cacheOnly) {
    const snapshot = await profileSnapshotForPlayer(player, profile, {
      cacheOnly: true,
      allowStale: Boolean(options.allowStale),
      ttlMs: options.ttlMs,
      now: options.now,
    });
    return buildAgentContextFromSnapshot(snapshot, options);
  }

  const context = await fetchProfileContext(player, profile);
  const snapshot = buildProfileSnapshot(context, { player, ttlMs: options.ttlMs, fetchedAtMs: options.now ?? Date.now() });
  const capsule = await buildAgentContext(context, {
    ...options,
    player,
    snapshot,
  });
  writeProfileSnapshot(snapshotWithAgentContext(snapshot, capsule));
  emitContextEvent({
    type: "profile.snapshot_refresh",
    source: { kind: "profile-snapshot", id: snapshot.profile?.profileId ?? null },
    player: snapshot.player,
    profile: snapshot.profile,
    payload: {
      cache: capsule.cache,
      economy: capsule.economy,
      inventoryApiSignals: capsule.inventoryApiSignals,
    },
    freshness: { status: "fresh", fetchedAt: capsule.generatedAt, source: "profile-snapshot", rateLimit: capsule.rateLimit },
    provenance: { provider: "hypixel" },
  });
  return capsule;
}
