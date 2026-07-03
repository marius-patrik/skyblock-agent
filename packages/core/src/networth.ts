import { inventoryFromMember, normalizeInventorySectionName } from "./inventory.ts";
import { normalizeItemStacks } from "./items.ts";
import { itemPrice } from "./prices.ts";
import { fetchProfileContext } from "./profile.ts";

const ASSUMPTIONS = [
  "Values are coin-denominated estimates from direct item internal IDs plus purse and bank.",
  "Resolved Bazaar, CoflNet, and complete Hypixel auction prices contribute to totals; partial auction candidates do not.",
  "Modifiers such as enchantments, attributes, stars, skins, dyes, gemstones, pet level, and recombobulation are preserved on item records but not independently valued yet.",
  "Museum and miscellaneous valuables are included only when represented by supported inventory/profile fields.",
  "User profile data is fetched live and is not cached by the networth calculator.",
  "Third-party price provider results are estimates, not authoritative game truth.",
];

export const DEFAULT_NETWORTH_MAX_ITEMS = 150;
export const DEFAULT_NETWORTH_TIMEOUT_MS = 8_000;
export const DEFAULT_NETWORTH_INCLUDE_ITEMS = false;

function numberOrZero(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stackCount(value: unknown) {
  if (value === null || value === undefined) {
    return { count: 1, warnings: [] };
  }
  const count = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(count) && count > 0) {
    return { count, warnings: [] };
  }
  if (Number.isFinite(count)) {
    return {
      count: 0,
      warnings: [{
        code: "non_positive_count",
        message: `Ignoring stack with non-positive count ${count}.`,
      }],
    };
  }
  return {
    count: 1,
    warnings: [{
      code: "invalid_stack_count",
      message: `Invalid stack count ${JSON.stringify(value)}; defaulting to 1.`,
    }],
  };
}

function roundCoins(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compactProfile(context: any) {
  return {
    profileId: context.profile.profile_id,
    cuteName: context.profile.cute_name ?? null,
  };
}

function economyFromContext(context: any) {
  return {
    purse: numberOrZero(context.member?.currencies?.coin_purse ?? context.member?.coin_purse),
    bank: numberOrZero(context.profile?.banking?.balance),
  };
}

function confidenceRank(confidence: string | null | undefined) {
  return {
    high: 4,
    medium: 3,
    low: 2,
    none: 1,
  }[confidence ?? "none"] ?? 1;
}

function aggregateConfidence(items: any[], unknownPrices: any[], warnings: any[]) {
  if (unknownPrices.length > 0 || warnings.length > 0) {
    return "low";
  }
  if (items.length === 0) {
    return "none";
  }
  const lowest = Math.min(...items.map((item) => confidenceRank(item.confidence)));
  if (lowest >= confidenceRank("high")) {
    return "high";
  }
  if (lowest >= confidenceRank("medium")) {
    return "medium";
  }
  return "low";
}

function providerKey(provider: any) {
  return [
    provider?.source ?? "unknown",
    provider?.method ?? "unknown",
    provider?.url ?? "",
  ].join("|");
}

function providerFreshnessFromItems(items: any[]) {
  const providers = new Map();
  for (const item of items) {
    const provider = item.priceProvider;
    if (!provider) {
      continue;
    }
    const key = providerKey(provider);
    const existing = providers.get(key);
    providers.set(key, {
      source: provider.source ?? "unknown",
      method: provider.method ?? "unknown",
      url: provider.url ?? null,
      cacheStatus: provider.cacheStatus ?? null,
      stale: Boolean(provider.stale),
      fetchedAt: provider.fetchedAt ?? null,
      itemCount: (existing?.itemCount ?? 0) + 1,
    });
  }
  return [...providers.values()];
}

function metadataFreshnessFromItems(items: any[]) {
  const providers = new Map();
  for (const item of items) {
    const provider = item.metadataProviderFreshness;
    if (!provider) {
      continue;
    }
    const key = [
      provider.source ?? "unknown",
      provider.providerKind ?? "item-metadata",
      provider.url ?? "",
    ].join("|");
    const existing = providers.get(key);
    providers.set(key, {
      source: provider.source ?? "unknown",
      providerKind: provider.providerKind ?? "item-metadata",
      url: provider.url ?? null,
      version: provider.version ?? null,
      cacheStatus: provider.cacheStatus ?? null,
      stale: Boolean(provider.stale),
      fetchedAt: provider.fetchedAt ?? null,
      authority: provider.authority ?? "unknown",
      license: provider.license ?? null,
      assumptions: provider.assumptions ?? [],
      itemCount: (existing?.itemCount ?? 0) + 1,
    });
  }
  return [...providers.values()];
}

function timeoutPriceResult(timeoutMs: number | undefined) {
  return {
    price: null,
    confidence: "none",
    provider: null,
    warnings: [{
      code: "valuation_timeout",
      message: `Skipped pricing because timeoutMs=${timeoutMs} elapsed.`,
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

export async function calculateNetworthFromInventory(input: {
  uuid?: string | null;
  profile?: Record<string, any>;
  member?: Record<string, any>;
  sections: Array<Record<string, any>>;
  rateLimit?: Record<string, any> | null;
  metadataProvider?: (internalId: string) => Promise<any> | any;
  priceProvider?: (internalId: string, item?: Record<string, any>) => Promise<any> | any;
  maxItems?: number;
  timeoutMs?: number;
  includeItems?: boolean;
}) {
  const priceProvider = input.priceProvider ?? ((internalId: string) => itemPrice(internalId));
  const maxItems = input.maxItems === undefined ? Infinity : Math.max(0, Number(input.maxItems));
  const includeItems = input.includeItems !== false;
  const deadline = input.timeoutMs === undefined ? null : Date.now() + Math.max(0, Number(input.timeoutMs));
  const economy = economyFromContext(input);
  const currencyTotal = roundCoins(economy.purse + economy.bank);
  const sections = [];
  const ignoredItems = [];
  const unknownPrices = [];
  const allWarnings = [];
  const allProcessedItems = [];
  let pricedAttemptCount = 0;
  let partial = false;

  for (const section of input.sections ?? []) {
    const normalized = await normalizeItemStacks(section.items ?? [], { metadataProvider: input.metadataProvider });
    const processedItems = [];
    const sectionItemWarnings = [];
    let sectionTotal = 0;
    let sectionPartial = false;

    for (const item of normalized.items) {
      const countResult = stackCount(item.count);
      const count = countResult.count;
      if (!item.internalId || item.internalId === "UNKNOWN") {
        ignoredItems.push({
          section: section.section,
          reason: "missing_internal_id",
          item,
        });
        continue;
      }
      if (count <= 0) {
        ignoredItems.push({
          section: section.section,
          reason: "non_positive_count",
          item,
          warnings: countResult.warnings,
        });
        sectionItemWarnings.push(...countResult.warnings.map((entry) => ({ ...entry, source: "inventory", section: section.section, internalId: item.internalId })));
        continue;
      }

      let price: any = null;
      const limitReached = pricedAttemptCount >= maxItems;
      const timedOut = deadline !== null && Date.now() >= deadline;
      if (limitReached || timedOut) {
        partial = true;
        sectionPartial = true;
        const code = limitReached ? "valuation_item_limit_reached" : "valuation_timeout";
        price = {
          price: null,
          confidence: "none",
          provider: null,
          warnings: [{
            code,
            message: limitReached
              ? `Skipped pricing after ${pricedAttemptCount} item lookups because maxItems=${maxItems}.`
              : `Skipped pricing because timeoutMs=${input.timeoutMs} elapsed.`,
          }],
        };
      } else {
        pricedAttemptCount += 1;
        const priced = await withDeadline(
          Promise.resolve(priceProvider(item.internalId, item)),
          deadline,
          timeoutPriceResult(input.timeoutMs),
        );
        price = priced.value;
        if (priced.timedOut) {
          partial = true;
          sectionPartial = true;
        }
      }
      const unitPrice = typeof price?.price === "number" && Number.isFinite(price.price) && price.price > 0
        ? price.price
        : null;
      const itemWarnings = [
        ...countResult.warnings.map((entry) => ({ ...entry, source: "inventory" })),
        ...(item.warnings ?? []).map((entry) => ({ ...entry, source: "metadata" })),
        ...(price?.warnings ?? []).map((entry) => ({ ...entry, source: "price" })),
      ];
      const processed = {
        section: section.section,
        internalId: item.internalId,
        displayName: item.displayName,
        cleanName: item.cleanName,
        category: item.category,
        rarity: item.rarity,
        count,
        unitPrice,
        total: unitPrice === null ? null : roundCoins(unitPrice * count),
        candidateUnitPrice: price?.candidatePrice ?? null,
        confidence: price?.confidence ?? "none",
        priceProvider: price?.provider ?? null,
        fallbackChain: price?.fallbackChain ?? [],
        metadataProvider: item.metadataProvider,
        metadataProviderFreshness: item.metadataProviderFreshness,
        modifiers: {
          reforge: item.reforge,
          stars: item.stars,
          masterStars: item.masterStars,
          recombobulated: item.recombobulated,
          enchantments: item.enchantments,
          attributes: item.attributes,
          gemstones: item.gemstones,
          skin: item.skin,
          dye: item.dye,
          petItem: item.petItem,
          heldItem: item.heldItem,
        },
        modifierUncertainty: item.modifierUncertainty,
        rawNbtPointer: item.rawNbtPointer,
        warnings: itemWarnings,
      };

      processedItems.push(processed);
      allProcessedItems.push(processed);
      sectionItemWarnings.push(...itemWarnings.map((entry) => ({ ...entry, section: section.section, internalId: item.internalId })));
      if (unitPrice === null) {
        unknownPrices.push({
          section: section.section,
          internalId: item.internalId,
          cleanName: item.cleanName,
          count,
          candidateUnitPrice: price?.candidatePrice ?? null,
          provider: price?.provider ?? null,
          metadataProvider: item.metadataProvider,
          metadataProviderFreshness: item.metadataProviderFreshness,
          modifierUncertainty: item.modifierUncertainty,
          warnings: price?.warnings ?? [],
        });
      } else {
        sectionTotal += processed.total;
      }
    }

    const sectionWarnings = [
      ...(section.warnings ?? []).map((entry) => ({ ...entry, source: "inventory", section: section.section })),
      ...(normalized.warnings ?? []).map((entry) => ({ ...entry, source: "metadata", section: section.section })),
      ...sectionItemWarnings,
    ];
    allWarnings.push(...sectionWarnings);
    const sectionUnknownPrices = unknownPrices.filter((item) => item.section === section.section);
    const sectionPricedItems = processedItems.filter((item) => item.unitPrice !== null);
    sections.push({
      section: section.section,
      label: section.label ?? section.section,
      available: section.available ?? null,
      sourcePath: section.sourcePath ?? null,
      total: roundCoins(sectionTotal),
      valuationStatus: sectionPartial ? "partial" : "complete",
      itemCount: normalized.itemCount,
      pricedCount: processedItems.filter((item) => item.unitPrice !== null).length,
      unknownCount: processedItems.filter((item) => item.unitPrice === null).length,
      ignoredCount: ignoredItems.filter((item) => item.section === section.section).length,
      items: includeItems ? processedItems : [],
      providerFreshness: providerFreshnessFromItems(processedItems),
      metadataProviderFreshness: metadataFreshnessFromItems(processedItems),
      confidence: aggregateConfidence(sectionPricedItems, sectionUnknownPrices, sectionWarnings),
      warnings: sectionWarnings,
    });
  }

  const pricedItems = allProcessedItems.filter((item) => item.unitPrice !== null);
  const itemTotal = roundCoins(sections.reduce((total, section) => total + section.total, 0));
  const total = roundCoins(currencyTotal + itemTotal);

  return {
    uuid: input.uuid ?? null,
    profile: input.profile ? compactProfile(input) : null,
    status: partial ? "partial" : "complete",
    valuation: {
      status: partial ? "partial" : "complete",
      pricedAttemptCount,
      maxItems: Number.isFinite(maxItems) ? maxItems : null,
      timeoutMs: input.timeoutMs ?? null,
      itemsIncluded: includeItems,
    },
    currency: {
      purse: economy.purse,
      bank: economy.bank,
      total: currencyTotal,
    },
    total,
    itemTotal,
    sections,
    ignoredItems,
    unknownPrices,
    warnings: allWarnings,
    providerFreshness: providerFreshnessFromItems(allProcessedItems),
    metadataProviderFreshness: metadataFreshnessFromItems(allProcessedItems),
    assumptions: ASSUMPTIONS,
    confidence: aggregateConfidence(pricedItems, unknownPrices, allWarnings),
    rateLimit: input.rateLimit ?? null,
  };
}

export async function networthForContext(context: any, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  priceProvider?: (internalId: string, item?: Record<string, any>) => Promise<any> | any;
  maxItems?: number;
  timeoutMs?: number;
  includeItems?: boolean;
} = {}) {
  const inventory = await inventoryFromMember(context.member);
  return calculateNetworthFromInventory({
    uuid: context.uuid,
    profile: context.profile,
    member: context.member,
    rateLimit: context.rateLimit,
    sections: inventory.sections,
    metadataProvider: options.metadataProvider,
    priceProvider: options.priceProvider,
    maxItems: options.maxItems ?? DEFAULT_NETWORTH_MAX_ITEMS,
    timeoutMs: options.timeoutMs ?? DEFAULT_NETWORTH_TIMEOUT_MS,
    includeItems: options.includeItems ?? DEFAULT_NETWORTH_INCLUDE_ITEMS,
  });
}

export async function networthForPlayer(player?: string, profile?: string, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  priceProvider?: (internalId: string, item?: Record<string, any>) => Promise<any> | any;
  maxItems?: number;
  timeoutMs?: number;
  includeItems?: boolean;
} = {}) {
  return networthForContext(await fetchProfileContext(player, profile), options);
}

export function itemNetworthFromResult(result: any, sectionName: string) {
  const section = normalizeInventorySectionName(sectionName);
  const sectionResult = result.sections.find((entry) => entry.section === section) ?? null;
  const ignoredItems = result.ignoredItems.filter((item) => item.section === section);
  const unknownPrices = result.unknownPrices.filter((item) => item.section === section);
  const warnings = result.warnings.filter((entry) => entry.section === section);
  const pricedItems = (sectionResult?.items ?? []).filter((item) => item.unitPrice !== null);

  return {
    uuid: result.uuid,
    profile: result.profile,
    section: sectionResult,
    ignoredItems,
    unknownPrices,
    warnings,
    assumptions: result.assumptions,
    confidence: sectionResult?.confidence ?? aggregateConfidence(pricedItems, unknownPrices, warnings),
    providerFreshness: sectionResult?.providerFreshness ?? providerFreshnessFromItems(sectionResult?.items ?? []),
    metadataProviderFreshness: sectionResult?.metadataProviderFreshness ?? metadataFreshnessFromItems(sectionResult?.items ?? []),
    rateLimit: result.rateLimit,
  };
}

export async function itemNetworthForPlayer(player: string | undefined, profile: string | undefined, sectionName: string, options: {
  metadataProvider?: (internalId: string) => Promise<any> | any;
  priceProvider?: (internalId: string, item?: Record<string, any>) => Promise<any> | any;
  maxItems?: number;
  timeoutMs?: number;
  includeItems?: boolean;
} = {}) {
  const result = await networthForPlayer(player, profile, {
    ...options,
    includeItems: options.includeItems ?? true,
  });
  return itemNetworthFromResult(result, sectionName);
}
