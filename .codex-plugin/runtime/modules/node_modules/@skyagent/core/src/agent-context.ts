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

function compactItems(section: any, limit = 8) {
  return (section?.items ?? []).slice(0, limit).map((item: any) => ({
    name: item.displayName ?? item.name ?? item.internalId ?? item.id ?? "Unknown item",
    internalId: item.internalId ?? item.id ?? null,
    count: item.count ?? 1,
    rarity: item.rarity ?? null,
    sourcePath: item.sourcePath ?? section.sourcePath ?? null,
  }));
}

function sectionSummary(section: any, limit = 8) {
  return {
    available: Boolean(section?.available),
    itemCount: section?.itemCount ?? 0,
    sourcePath: section?.sourcePath ?? null,
    items: compactItems(section, limit),
    warnings: compactWarnings(section?.warnings ?? [], 8),
  };
}

function compactPetItems(section: any, limit = 8) {
  return [...(section?.items ?? [])]
    .sort((left: any, right: any) => {
      const activeDelta = Number(Boolean(right.extraAttributes?.active)) - Number(Boolean(left.extraAttributes?.active));
      return activeDelta || Number(right.extraAttributes?.exp ?? 0) - Number(left.extraAttributes?.exp ?? 0);
    })
    .slice(0, limit)
    .map((item: any) => ({
      name: item.displayName ?? item.internalId ?? "Unknown pet",
      internalId: item.internalId ?? null,
      tier: item.extraAttributes?.tier ?? null,
      exp: item.extraAttributes?.exp ?? null,
      active: item.extraAttributes?.active ?? null,
      heldItem: item.extraAttributes?.heldItem ?? null,
      sourcePath: item.sourcePath ?? section.sourcePath ?? null,
    }));
}

function petSummary(section: any, limit = 8) {
  const items = compactPetItems(section, limit);
  return {
    available: Boolean(section?.available),
    itemCount: section?.itemCount ?? 0,
    sourcePath: section?.sourcePath ?? null,
    activePet: items.find((item: any) => item.active) ?? null,
    items,
    warnings: compactWarnings(section?.warnings ?? [], 8),
  };
}

function compactReadiness(entry: any) {
  return {
    area: entry.area,
    rating: entry.rating,
    status: entry.status,
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

function compactAccessories(accessories: any) {
  return {
    status: accessories.status ?? "complete",
    valuation: accessories.valuation ?? null,
    magicalPower: accessories.magicalPower,
    ownedCount: accessories.owned?.length ?? 0,
    activeCount: accessories.activeAccessories?.length ?? 0,
    duplicateCount: accessories.duplicates?.length ?? 0,
    missingCount: accessories.missing?.length ?? 0,
    cheapestMissing: (accessories.cheapestMissing ?? []).slice(0, 5).map((entry: any) => ({
      internalId: entry.internalId,
      name: entry.name,
      price: entry.price,
      magicalPower: entry.magicalPower,
    })),
    providerFreshness: accessories.providerFreshness ?? [],
    warnings: compactWarnings(accessories.warnings ?? [], 8),
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
  if (cached) {
    return cached;
  }
  const sourcePath = `overview.inventoryApiSignals.${signalKey}`;
  return {
    available: Boolean(snapshot.overview?.inventoryApiSignals?.[signalKey]),
    itemCount: null,
    sourcePath,
    items: [],
    warnings: compactWarnings([{
      code: "cached_detail_limited",
      message: `${label} detail was not stored in this profile snapshot; refresh context for decoded item summaries.`,
      sourcePath,
    }], 8),
  };
}

function cachedAccessoriesSummary(snapshot: any) {
  const cached = snapshot.agentContextSummary?.accessories;
  if (cached) {
    return cached;
  }
  const sourcePath = "overview.inventoryApiSignals.hasAccessoryBag";
  return {
    magicalPower: null,
    ownedCount: null,
    activeCount: null,
    duplicateCount: null,
    missingCount: null,
    cheapestMissing: [],
    providerFreshness: [],
    sourcePath,
    warnings: compactWarnings([{
      code: "cached_detail_limited",
      message: "Accessory detail was not stored in this profile snapshot; refresh context for Magical Power and missing accessory summaries.",
      sourcePath,
    }], 8),
  };
}

function cachedReadinessSummary(snapshot: any) {
  const cached = snapshot.agentContextSummary?.readiness;
  if (cached?.length) {
    return cached;
  }
  return READINESS_AREAS.map((area) => ({
    area,
    rating: "unknown",
    status: "cached_signal",
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

  return {
    kind: "skyagent.agentContext",
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    cache: {
      status: snapshot.cacheStatus ?? "refreshed",
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
      stale: Boolean(snapshot.stale),
      ageMs: snapshot.ageMs ?? null,
      ttlMs: snapshot.ttlMs ?? null,
      sourceProvider: snapshot.sourceProvider ?? "hypixel",
    },
    player: snapshot.player,
    selectedProfile: snapshot.profile,
    profiles: snapshot.profiles,
    economy: snapshot.overview?.economy ?? {},
    coreProgression: coreProgressionFromSnapshot(snapshot),
    inventoryApiSignals: snapshot.overview?.inventoryApiSignals ?? {},
    gear: {
      armor: sectionSummary(armor, 4),
      equipment: sectionSummary(equipment, 4),
      wardrobe: sectionSummary(wardrobe, 8),
    },
    pets: petSummary(pets, 8),
    accessories: compactAccessories(accessories),
    readiness: readiness.map(compactReadiness),
    objectives: options.objectives ?? objectiveContextSummary(),
    providerFreshness: {
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
    },
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
  return {
    kind: "skyagent.agentContext",
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    cache: {
      status: snapshot.cacheStatus ?? "hit",
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
      stale: Boolean(snapshot.stale),
      ageMs: snapshot.ageMs ?? null,
      ttlMs: snapshot.ttlMs ?? null,
      sourceProvider: snapshot.sourceProvider ?? "hypixel",
    },
    player: snapshot.player,
    selectedProfile: snapshot.profile,
    profiles: snapshot.profiles,
    economy: snapshot.overview?.economy ?? {},
    coreProgression: coreProgressionFromSnapshot(snapshot),
    inventoryApiSignals: snapshot.overview?.inventoryApiSignals ?? {},
    gear: {
      armor: cachedSectionSummary(snapshot, cached.gear?.armor, "hasArmor", "Armor"),
      equipment: cachedSectionSummary(snapshot, cached.gear?.equipment, "hasInventoryBag", "Equipment"),
      wardrobe: cachedSectionSummary(snapshot, cached.gear?.wardrobe, "hasWardrobe", "Wardrobe"),
    },
    pets: cachedSectionSummary(snapshot, cached.pets, "hasPets", "Pet"),
    accessories: cachedAccessoriesSummary(snapshot),
    readiness: cachedReadinessSummary(snapshot),
    objectives: options.objectives ?? objectiveContextSummary(),
    providerFreshness: {
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
    },
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
