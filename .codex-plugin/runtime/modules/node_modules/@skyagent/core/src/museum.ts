import { fetchProfileContext } from "./profile.ts";
import { hypixelRequest } from "./hypixel.ts";
import { inventoryFromMember } from "./inventory.ts";
import { cleanMinecraftText } from "./items.ts";
import { itemPrice } from "./prices.ts";
import { createObjectiveItem } from "./objectives.ts";

const HIDDEN_SECTIONS = new Set(["ender_chest", "backpacks", "personal_vault"]);
const VISIBLE_SECTIONS = new Set(["inventory", "armor", "equipment", "wardrobe", "accessory_bag", "pets"]);
const HIDDEN_SECTION_HINTS = ["ender", "backpack", "vault", "storage", "sack", "chest"];
const VISIBLE_SECTION_HINTS = ["inventory", "armor", "equipment", "wardrobe", "loadout", "accessory", "talisman", "pet"];

function finiteBound(value: unknown, fallback: number, name: string, options: { min?: number; integer?: boolean } = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const number = Number(value);
  const min = options.min ?? 0;
  if (!Number.isFinite(number) || number < min) {
    throw new Error(`${name} must be a finite number greater than or equal to ${min}.`);
  }
  if (options.integer && !Number.isInteger(number)) {
    throw new Error(`${name} must be an integer.`);
  }
  return number;
}

function normalizeItemId(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function searchText(value: unknown) {
  return cleanMinecraftText(value)
    .toLowerCase()
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function phraseToItemId(phrase: string) {
  const normalized = searchText(phrase).toUpperCase().replace(/\s+/g, "_");
  if (normalized === "GIANT_SWORD") return "GIANTS_SWORD";
  return normalized;
}

function naturalGoalTokens(goal: unknown) {
  const stopwords = new Set(["a", "an", "and", "buy", "donate", "donation", "for", "get", "item", "items", "museum", "plan", "snipe", "source", "the", "to"]);
  return searchText(goal).split(" ").filter((token) => token && !stopwords.has(token));
}

function compactWarnings(warnings: any[] = [], limit = 25) {
  return warnings.filter(Boolean).slice(0, limit).map((warning) => ({
    code: warning.code ?? "warning",
    message: warning.message ?? String(warning),
    sourcePath: warning.sourcePath ?? warning.source ?? null,
  }));
}

function selectedMuseum(context: any, museumPayload?: any) {
  const uuid = context.member?.profile_member_id ?? context.uuid;
  const payload = museumPayload?.body ?? museumPayload ?? null;
  const directProfileMembers = payload?.profile?.members && typeof payload.profile.members === "object" ? payload.profile.members : null;
  const museumProfileMembers = payload?.museum?.profile?.members && typeof payload.museum.profile.members === "object" ? payload.museum.profile.members : null;
  const profileMuseumMembers = payload?.profile?.museum?.members && typeof payload.profile.museum.members === "object" ? payload.profile.museum.members : null;
  const endpointProfileMembers = directProfileMembers ?? museumProfileMembers ?? profileMuseumMembers;
  const topLevelMembers = payload?.members && typeof payload.members === "object" ? payload.members : null;
  const museumMembers = payload?.museum?.members && typeof payload.museum.members === "object" ? payload.museum.members : null;
  const payloadMembers = topLevelMembers ?? endpointProfileMembers ?? museumMembers;
  const profileMembers = context.profile?.museum?.members && typeof context.profile.museum.members === "object" ? context.profile.museum.members : null;
  const memberMuseum = payloadMembers?.[uuid]
    ?? payloadMembers?.[context.uuid]
    ?? profileMembers?.[uuid]
    ?? profileMembers?.[context.uuid]
    ?? context.member?.museum
    ?? null;
  const profileMuseum = !payloadMembers && !profileMembers ? context.profile?.museum ?? null : null;
  const museum = memberMuseum ?? profileMuseum;
  const sourcePath = payloadMembers?.[uuid] || payloadMembers?.[context.uuid]
    ? directProfileMembers
      ? "skyblock.museum.profile.selected_member"
      : museumProfileMembers
        ? "skyblock.museum.museum.profile.selected_member"
        : profileMuseumMembers
          ? "skyblock.museum.profile.museum.selected_member"
          : museumMembers
            ? "skyblock.museum.museum.selected_member"
            : "skyblock.museum.selected_member"
    : profileMembers?.[uuid] || profileMembers?.[context.uuid]
      ? "profile.museum.selected_member"
      : context.member?.museum
        ? "member.museum"
        : profileMuseum
          ? "profile.museum"
          : null;
  return {
    museum,
    sourcePath,
    memberScoped: Boolean(memberMuseum),
    coopMemberMuseumCount: payloadMembers ? Object.keys(payloadMembers).length : profileMembers ? Object.keys(profileMembers).length : null,
  };
}

function evidenceVisibility(section: string, item: any) {
  const haystack = [section, item.sourcePath, item.sourceKind, item.wardrobeSource, item.containerId].filter(Boolean).join(" ").toLowerCase();
  if (HIDDEN_SECTIONS.has(section) || HIDDEN_SECTION_HINTS.some((hint) => haystack.includes(hint))) {
    return "hidden";
  }
  if (VISIBLE_SECTIONS.has(section) || VISIBLE_SECTION_HINTS.some((hint) => haystack.includes(hint))) {
    return "visible";
  }
  return "unknown";
}

function isLikelyMuseumItemKey(key: string) {
  return /^[A-Z0-9_:-]+$/.test(key) && /[A-Z0-9]/.test(key);
}

function hasNestedDonationEntries(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).some(([key, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const child = entry as any;
    const childId = normalizeItemId(child.item_id ?? child.itemId ?? child.internalId ?? child.id);
    return Boolean(childId || isLikelyMuseumItemKey(key));
  });
}

function collectDonationIds(value: any, sourcePath: string, ids = new Map<string, any>()) {
  if (!value) {
    return ids;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectDonationIds(entry, `${sourcePath}.${index}`, ids));
    return ids;
  }
  if (typeof value !== "object") {
    const id = normalizeItemId(value);
    if (id) ids.set(id, { itemId: id, sourcePath });
    return ids;
  }
  for (const [key, entry] of Object.entries(value)) {
    const explicitId = normalizeItemId((entry as any)?.item_id ?? (entry as any)?.itemId ?? (entry as any)?.internalId ?? (entry as any)?.id);
    const keyId = hasNestedDonationEntries(entry) ? "" : normalizeItemId(key);
    const directId = explicitId || keyId;
    if (directId) {
      ids.set(directId, { itemId: directId, sourcePath: `${sourcePath}.${key}` });
    }
    if (hasNestedDonationEntries(entry)) {
      collectDonationIds(entry, `${sourcePath}.${key}`, ids);
    }
    if ((entry as any)?.items || (entry as any)?.donated_items || (entry as any)?.special) {
      collectDonationIds((entry as any).items, `${sourcePath}.${key}.items`, ids);
      collectDonationIds((entry as any).donated_items, `${sourcePath}.${key}.donated_items`, ids);
      collectDonationIds((entry as any).special, `${sourcePath}.${key}.special`, ids);
    }
  }
  return ids;
}

function donatedItems(museum: any, sourcePath: string | null) {
  const ids = new Map<string, any>();
  collectDonationIds(museum?.items, `${sourcePath ?? "museum"}.items`, ids);
  collectDonationIds(museum?.special, `${sourcePath ?? "museum"}.special`, ids);
  return [...ids.values()];
}

function goalTargetItems(goal: unknown, explicit: string[] = [], inventory: any = null) {
  const ids = new Set(explicit.map(normalizeItemId).filter(Boolean));
  const text = String(goal ?? "");
  for (const token of text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []) {
    ids.add(normalizeItemId(token));
  }
  const goalSearch = searchText(goal);
  for (const section of inventory?.sections ?? []) {
    for (const item of section.items ?? []) {
      const internalId = normalizeItemId(item.internalId);
      const display = searchText(item.displayName ?? item.cleanName ?? item.name);
      if (internalId && display && goalSearch.includes(display)) {
        ids.add(internalId);
      }
    }
  }
  if (ids.size === 0) {
    const naturalTokens = naturalGoalTokens(goal);
    if (naturalTokens.length === 1 && naturalTokens[0].length >= 4) {
      ids.add(phraseToItemId(naturalTokens[0]));
    } else if (naturalTokens.length > 1) {
      ids.add(phraseToItemId(naturalTokens.join(" ")));
    }
  }
  return [...ids];
}

function donationEligibility(item: any) {
  if (!item.internalId) {
    return {
      status: "uncertain",
      warning: { code: "museum_item_id_missing", message: "Owned item has no SkyBlock internal id, so Museum eligibility cannot be determined.", sourcePath: item.sourcePath },
    };
  }
  const metadataEligible = item.museumEligible ?? item.museum?.eligible ?? item.extraAttributes?.museumEligible ?? item.extraAttributes?.museum_eligible;
  if (metadataEligible === true || metadataEligible === 1) {
    return { status: "eligible", warning: null };
  }
  if (item.section === "pets") {
    return {
      status: "uncertain",
      warning: { code: "museum_pet_eligibility_unverified", message: "Pet Museum eligibility is not fully modeled by this planner.", sourcePath: item.sourcePath },
    };
  }
  return {
    status: "uncertain",
    warning: {
      code: "museum_eligibility_metadata_missing",
      message: "Owned item may be a Museum candidate, but no provider-backed Museum eligibility metadata is available.",
      sourcePath: item.sourcePath,
    },
  };
}

function ownedCandidates(inventory: any, donatedIds: Set<string>, targetIds: Set<string> | null = null) {
  const output = [];
  const warnings = [];
  for (const section of inventory.sections ?? []) {
    for (const item of section.items ?? []) {
      const internalId = normalizeItemId(item.internalId);
      if (!internalId || donatedIds.has(internalId)) {
        continue;
      }
      if (targetIds && !targetIds.has(internalId)) {
        continue;
      }
      const eligibility = donationEligibility({ ...item, section: section.section });
      const visibility = evidenceVisibility(section.section, item);
      const kind = eligibility.status === "eligible"
        ? visibility === "hidden" ? "hidden-owned" : "eligible-owned"
        : "uncertain";
      if (eligibility.warning) warnings.push(eligibility.warning);
      output.push({
        kind,
        itemId: internalId,
        displayName: item.displayName ?? internalId,
        count: item.count ?? 1,
        section: section.section,
        sourcePath: item.sourcePath ?? section.sourcePath ?? null,
        containerId: item.containerId ?? null,
        slot: item.slot ?? null,
        rank: visibility === "hidden" ? 80 : visibility === "visible" ? 90 : 70,
        eligibility: eligibility.status,
        visibility,
        warnings: compactWarnings(eligibility.warning ? [eligibility.warning] : [], 3),
      });
    }
  }
  return { candidates: output, warnings };
}

function candidateWorkItem(kind: string, candidate: any, goal: string, budget: number | null = null) {
  return {
    kind,
    title: kind === "buy"
      ? `Buy ${candidate.displayName ?? candidate.itemId}`
      : kind === "snipe"
        ? `Snipe ${candidate.displayName ?? candidate.itemId}`
        : `Source ${candidate.displayName ?? candidate.itemId}`,
    priority: candidate.rank ?? 50,
    itemId: candidate.itemId,
    targetPrice: candidate.price?.price ?? candidate.price?.candidatePrice ?? null,
    budget,
    sourceProvider: candidate.price?.provider?.source ?? null,
    freshness: {
      status: candidate.price?.price != null ? "priced" : candidate.price ? "unpriced" : "planned",
      source: candidate.price?.provider?.source ?? "museum-planner",
      fetchedAt: candidate.price?.provider?.fetchedAt ?? null,
      warnings: compactWarnings(candidate.warnings ?? candidate.price?.warnings ?? [], 10),
    },
    payload: {
      goal,
      candidateKind: candidate.kind,
      section: candidate.section ?? null,
      sourcePath: candidate.sourcePath ?? null,
      price: candidate.price ?? null,
    },
  };
}

function persistMuseumObjectives(goal: string, workItems: any, options: Record<string, any>) {
  const root = createObjectiveItem({
    itemKind: "objective",
    title: options.objectiveTitle ?? `Museum: ${goal}`,
    status: options.objectiveStatus ?? "active",
    priority: 100,
    tags: ["museum", "planner"],
    freshness: { status: "planned", source: "museum-planner" },
    payload: { goal },
    now: options.now,
  });
  const selected = [
    ...workItems.sourceItemCandidates.slice(0, options.maxPersistedSources ?? 5),
    ...workItems.buyListCandidates.slice(0, options.maxPersistedBuys ?? 5),
    ...workItems.snipeCandidates.slice(0, options.maxPersistedSnipes ?? 3),
  ];
  const items = selected.map((candidate: any) => createObjectiveItem({
    itemKind: candidate.kind,
    title: candidate.title,
    status: "open",
    objectiveId: root.id,
    priority: candidate.priority,
    itemId: candidate.itemId,
    targetPrice: candidate.targetPrice,
    budget: candidate.budget,
    sourceProvider: candidate.sourceProvider,
    freshness: candidate.freshness,
    payload: candidate.payload,
    tags: ["museum", "planner"],
    now: options.now,
  }));
  return { root, items, count: items.length + 1 };
}

export async function museumDonationPlanFromContext(context: any, goal: string, options: {
  budget?: number | null;
  targetItems?: string[];
  museumPayload?: any;
  museumProvider?: (context: any) => Promise<any> | any;
  inventoryProvider?: (member: any) => Promise<any> | any;
  priceProvider?: (itemId: string) => Promise<any> | any;
  maxPriceLookups?: number;
  timeoutMs?: number;
  persistObjectives?: boolean;
  objectiveTitle?: string;
  objectiveStatus?: string;
  maxPersistedBuys?: number;
  maxPersistedSources?: number;
  maxPersistedSnipes?: number;
  now?: number;
} = {}) {
  const budget = options.budget ?? null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    throw new Error("budget must be a non-negative finite number when provided.");
  }
  const warnings = [];
  let museumPayload = options.museumPayload;
  if (!museumPayload && options.museumProvider) {
    try {
      museumPayload = await options.museumProvider(context);
    } catch (error) {
      warnings.push({ code: "museum_endpoint_unavailable", message: `Museum endpoint unavailable: ${(error as Error).message}`, sourcePath: "skyblock/museum" });
    }
  }
  const selected = selectedMuseum(context, museumPayload);
  if (!selected.museum) {
    warnings.push({ code: "museum_data_missing", message: "No selected member Museum data was available from skyblock/museum or profile context.", sourcePath: "skyblock/museum" });
  }
  const donated = donatedItems(selected.museum, selected.sourcePath);
  const donatedIds = new Set(donated.map((entry) => entry.itemId));
  const inventory = await (options.inventoryProvider ?? inventoryFromMember)(context.member);
  const targetItems = goalTargetItems(goal, options.targetItems ?? [], inventory);
  const targetIds = targetItems.length ? new Set(targetItems) : null;
  const owned = ownedCandidates(inventory, donatedIds, targetIds);
  warnings.push(...owned.warnings, ...(inventory.warnings ?? []));
  const ownedIds = new Set(owned.candidates.map((entry) => entry.itemId));
  const missingIds = targetItems.filter((itemId) => !donatedIds.has(itemId) && !ownedIds.has(itemId));
  if (!targetItems.length) {
    warnings.push({
      code: "museum_target_items_unspecified",
      message: "No explicit Museum target item ids were provided or parsed from the goal, so missing buy candidates are limited to owned-state evidence.",
      sourcePath: "goal",
    });
  }

  const maxPriceLookups = finiteBound(options.maxPriceLookups, 25, "maxPriceLookups", { min: 0, integer: true });
  const timeoutMs = finiteBound(options.timeoutMs, 8_000, "timeoutMs", { min: 1, integer: true });
  const priceProvider = options.priceProvider ?? itemPrice;
  const missingCandidates = [];
  for (const itemId of missingIds.slice(0, maxPriceLookups)) {
    let price = null;
    try {
      price = await Promise.race([
        Promise.resolve(priceProvider(itemId)),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Museum price lookup timed out after ${timeoutMs}ms.`)), timeoutMs)),
      ]);
    } catch (error) {
      price = {
        itemId,
        price: null,
        confidence: "none",
        provider: { source: "museum-planner", method: "bounded_price_lookup", fetchedAt: new Date().toISOString(), cacheStatus: "unavailable" },
        fallbackChain: ["museum_planner_timeout"],
        warnings: [{ code: "museum_price_timeout", message: (error as Error).message, sourcePath: "options.timeoutMs" }],
      };
    }
    missingCandidates.push({
      kind: "missing",
      itemId,
      displayName: itemId,
      rank: price?.price != null && (budget === null || price.price <= budget) ? 70 : 45,
      price,
      warnings: compactWarnings(price?.warnings ?? [], 8),
    });
  }
  if (missingIds.length > maxPriceLookups) {
    warnings.push({
      code: "museum_price_lookup_limit_reached",
      message: `Priced ${maxPriceLookups} of ${missingIds.length} missing Museum target items.`,
      sourcePath: "options.maxPriceLookups",
    });
  }
  for (const itemId of missingIds.slice(maxPriceLookups)) {
    missingCandidates.push({
      kind: "missing",
      itemId,
      displayName: itemId,
      rank: 30,
      price: null,
      warnings: [{ code: "price_lookup_skipped", message: "Price lookup skipped by maxPriceLookups bound.", sourcePath: "options.maxPriceLookups" }],
    });
  }

  const rankedCandidates = [
    ...owned.candidates,
    ...missingCandidates,
  ].sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0) || left.itemId.localeCompare(right.itemId));
  const buyListCandidates = missingCandidates
    .filter((candidate) => candidate.price?.price != null)
    .map((candidate) => candidateWorkItem("buy", candidate, goal, budget));
  const providerBackedOwnedCandidates = owned.candidates.filter((candidate) => candidate.kind === "eligible-owned" || candidate.kind === "hidden-owned");
  const sourceItemCandidates = [
    ...providerBackedOwnedCandidates.map((candidate) => candidateWorkItem("source", candidate, goal, budget)),
    ...missingCandidates.filter((candidate) => candidate.price?.price == null).map((candidate) => candidateWorkItem("source", candidate, goal, budget)),
  ];
  const snipeCandidates = buyListCandidates.map((candidate) => ({
    ...candidate,
    kind: "snipe",
    title: candidate.title.replace(/^Buy /, "Snipe "),
    payload: { ...candidate.payload, candidateKind: "snipe", derivedFromCandidateKind: candidate.payload?.candidateKind ?? null },
  }));
  const workItems = { buyListCandidates, sourceItemCandidates, snipeCandidates };
  const persistedObjectives = options.persistObjectives ? persistMuseumObjectives(goal, workItems, options) : null;

  return {
    kind: "skyagent.museumDonationPlan",
    schemaVersion: 1,
    uuid: context.uuid,
    profile: {
      profileId: context.profile?.profile_id ?? null,
      cuteName: context.profile?.cute_name ?? null,
    },
    goal,
    status: selected.museum ? "estimate" : "partial",
    museum: {
      available: Boolean(selected.museum),
      sourcePath: selected.sourcePath,
      memberScoped: selected.memberScoped,
      coopMemberMuseumCount: selected.coopMemberMuseumCount,
      donatedCount: donated.length,
    },
    targetItems,
    alreadyDonated: donated,
    eligibleOwnedCandidates: rankedCandidates.filter((entry) => entry.kind === "eligible-owned"),
    hiddenOwnedCandidates: rankedCandidates.filter((entry) => entry.kind === "hidden-owned"),
    missingCandidates,
    uncertainCandidates: rankedCandidates.filter((entry) => entry.kind === "uncertain"),
    rankedCandidates,
    buyListCandidates,
    sourceItemCandidates,
    snipeCandidates,
    persistedObjectives,
    sourceFreshness: {
      museum: { status: selected.museum ? "available" : "missing", sourcePath: selected.sourcePath },
      inventory: { status: inventory.itemCount > 0 ? "available" : "empty_or_missing", warningCount: (inventory.warnings ?? []).length },
    },
    assumptions: [
      "Museum eligibility is conservative and warning-backed when provider metadata is missing.",
      "Owned candidates are ranked before buy recommendations.",
      "Prices are bounded by maxPriceLookups and unknown prices are surfaced as warnings.",
      "Objective records are only written when persistObjectives is true.",
    ],
    warnings: compactWarnings(warnings, 50),
    rateLimit: context.rateLimit,
  };
}

export async function museumDonationPlanForPlayer(goal: string, player?: string, profile?: string, options: Parameters<typeof museumDonationPlanFromContext>[2] = {}) {
  const context = await fetchProfileContext(player, profile);
  const museumProvider = options.museumProvider ?? (async (input: any) => hypixelRequest("skyblock/museum", { profile: input.profile?.profile_id }, { requireKey: true }));
  return museumDonationPlanFromContext(context, goal, {
    ...options,
    museumProvider,
  });
}
