import { calculateAccessoriesFromMember } from "./accessories.ts";
import { networthForContext } from "./networth.ts";
import { fetchProfileContext } from "./profile.ts";
import { readinessFromContext, READINESS_AREAS } from "./readiness.ts";
import { progressionFromContext } from "./sections/index.ts";
import { publicConfig, readMemories } from "./store.ts";

const VERIFIED_AT = "2026-07-01";

function normalizeGoal(goal: unknown) {
  return String(goal ?? "").trim().toLowerCase();
}

function roundCoins(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function goalAreas(goal: string) {
  const normalized = normalizeGoal(goal);
  const areas = new Set<string>();
  if (/dungeon|cata|catacomb|f7|floor|master/.test(normalized)) {
    areas.add("dungeons");
  }
  if (/slayer|zombie|rev|spider|tara|wolf|sven|eman|enderman|blaze|vampire/.test(normalized)) {
    areas.add("slayer");
  }
  if (/kuudra|crimson|nether/.test(normalized)) {
    areas.add("kuudra");
  }
  if (/garden|farm|crop|jacob|visitor/.test(normalized)) {
    areas.add("garden");
  }
  if (/mining|hotm|powder|gemstone|mithril/.test(normalized)) {
    areas.add("mining");
  }
  if (areas.size === 0) {
    areas.add("dungeons");
    areas.add("slayer");
    areas.add("mining");
    areas.add("garden");
  }
  return [...areas];
}

function recommendation(input: {
  id: string;
  title: string;
  category: string;
  priority: number;
  reason: string;
  expectedImpact: string;
  costEstimate?: any;
  timeEstimate?: any;
  prerequisites?: any[];
  sourceFreshness?: any;
  uncertainty?: string;
  warnings?: any[];
}) {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    priority: input.priority,
    reason: input.reason,
    expectedImpact: input.expectedImpact,
    costEstimate: input.costEstimate ?? { coins: null, status: "not_estimated" },
    timeEstimate: input.timeEstimate ?? { value: null, status: "not_estimated" },
    prerequisites: input.prerequisites ?? [],
    sourceFreshness: input.sourceFreshness ?? { verifiedAt: VERIFIED_AT, status: "estimate" },
    uncertainty: input.uncertainty ?? "estimate",
    warnings: input.warnings ?? [],
  };
}

function readinessRecommendations(readiness: any[]) {
  const output = [];
  for (const result of readiness) {
    for (const check of result.checks ?? []) {
      if (check.passed) {
        continue;
      }
      output.push(recommendation({
        id: `${result.area}-${check.name}`,
        title: `Improve ${result.area.replace("_", " ")}: ${check.name.replace(/_/g, " ")}`,
        category: "readiness",
        priority: result.rating === "unknown" ? 40 : 70,
        reason: `Current value ${JSON.stringify(check.actual)} is below target ${JSON.stringify(check.target)} for ${result.area} readiness.`,
        expectedImpact: `Moves the ${result.area} readiness estimate toward ready status.`,
        prerequisites: [{ sourceField: check.sourceField, target: check.target }],
        sourceFreshness: result.freshness,
        uncertainty: "heuristic",
        warnings: result.warnings,
      }));
    }
  }
  return output;
}

function accessoryRecommendations(accessories: any, budget: number | null) {
  return (accessories?.upgrades ?? [])
    .filter((upgrade: any) => {
      if (budget === null) {
        return true;
      }
      const price = typeof upgrade.price === "number" ? upgrade.price : Number.NaN;
      return Number.isFinite(price) && price >= 0 && price <= budget;
    })
    .slice(0, 10)
    .map((upgrade: any, index: number) => recommendation({
      id: `accessory-${upgrade.internalId}`,
      title: `Buy ${upgrade.displayName ?? upgrade.internalId}`,
      category: "upgrade",
      priority: 90 - index,
      reason: `Adds ${upgrade.magicalPowerGain} Magical Power at ${upgrade.coinPerMagicalPower} coins per MP.`,
      expectedImpact: `Estimated +${upgrade.magicalPowerGain} Magical Power.`,
      costEstimate: {
        coins: roundCoins(upgrade.price),
        budget,
        withinBudget: upgrade.withinBudget,
        status: upgrade.price === null ? "unknown" : "estimated",
      },
      prerequisites: [{ family: upgrade.family, rarity: upgrade.rarity }],
      sourceFreshness: {
        provider: upgrade.provider ?? null,
        status: upgrade.price === null ? "unpriced" : "priced",
      },
      uncertainty: upgrade.price === null ? "high" : "medium",
      warnings: upgrade.warnings ?? [],
    }));
}

function memorySnippet(memory: any) {
  return String(memory?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function relevantMemories(goal: string, memories: any[]) {
  const normalized = normalizeGoal(goal);
  const terms = new Set(normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 3));
  return memories
    .map((memory) => ({
      id: memory.id ?? null,
      tags: Array.isArray(memory.tags) ? memory.tags : [],
      text: memorySnippet(memory),
    }))
    .filter((memory) => {
      const haystack = `${memory.text} ${memory.tags.join(" ")}`.toLowerCase();
      return terms.size === 0 || [...terms].some((term) => haystack.includes(term)) || memory.tags.includes("goal") || memory.tags.includes("preference");
    })
    .slice(0, 5);
}

function memoryRecommendations(goal: string, memories: any[]) {
  return relevantMemories(goal, memories).map((memory, index) => recommendation({
    id: `memory-${memory.id ?? index}`,
    title: "Apply saved SkyAgent note",
    category: "memory_context",
    priority: 65 - index,
    reason: memory.text ? `Saved note relevant to this plan: ${memory.text}` : "A saved note matched this goal.",
    expectedImpact: "Keeps recommendations aligned with durable user goals, constraints, or preferences.",
    prerequisites: [{ memoryId: memory.id, tags: memory.tags }],
    sourceFreshness: { source: "skyagent-memory", status: "local", verifiedAt: VERIFIED_AT },
    uncertainty: "low",
  }));
}

function routeRecommendations(goal: string, areas: string[], readiness: any[]) {
  const normalized = normalizeGoal(goal);
  const output = [
    recommendation({
      id: "goal-route",
      title: "Follow the goal route",
      category: "route",
      priority: 68,
      reason: `The goal maps to ${areas.join(", ")} progression surfaces and should be advanced in blocker order.`,
      expectedImpact: "Turns profile-state checks into a concrete sequence instead of only reporting stats.",
      timeEstimate: { value: "next 1-3 sessions", status: "estimated" },
      prerequisites: readiness.map((entry) => ({
        area: entry.area,
        rating: entry.rating,
        failedChecks: (entry.checks ?? []).filter((check: any) => !check.passed).map((check: any) => check.name),
      })),
      uncertainty: "medium",
      warnings: readiness.flatMap((entry) => entry.warnings ?? []),
    }),
  ];
  if (/daily|route|routine|weekly/.test(normalized)) {
    output.push(recommendation({
      id: "daily-route",
      title: "Run a focused daily route",
      category: "route",
      priority: 60,
      reason: `The goal asks for route planning across ${areas.join(", ")}.`,
      expectedImpact: "Keeps time-gated progression moving without relying on one grind.",
      timeEstimate: { value: "30-90 minutes", status: "estimated" },
      prerequisites: readiness.map((entry) => ({ area: entry.area, rating: entry.rating })),
      uncertainty: "medium",
    }));
  }
  output.push(recommendation({
    id: "skip-low-impact-detours",
    title: "Skip low-impact detours until blockers are cleared",
    category: "what_to_skip",
    priority: 10,
    reason: "Planner found explicit readiness or upgrade blockers; unrelated grinds should wait unless they are fun or time-gated.",
    expectedImpact: "Preserves coins and play time for the current goal.",
    uncertainty: "low",
  }));
  return output;
}

function sortRecommendations(items: any[]) {
  return [...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export async function planGoalFromContext(context: any, goal: string, options: {
  budget?: number | null;
  memories?: any[];
  config?: any;
  networthProvider?: (context: any) => Promise<any> | any;
  accessoriesProvider?: (member: any, budget: number | null) => Promise<any> | any;
  progressionProvider?: (context: any) => Promise<any> | any;
  maxItems?: number;
  networthTimeoutMs?: number;
  maxPriceLookups?: number;
  accessoryTimeoutMs?: number;
} = {}) {
  const areas = goalAreas(goal);
  const budget = options.budget ?? null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    throw new Error("budget must be a non-negative finite number when provided.");
  }
  const readiness = areas.map((area) => readinessFromContext(context, area));
  const progression = await (options.progressionProvider ?? progressionFromContext)(context);
  const networth = await (options.networthProvider ?? ((input: any) => networthForContext(input, {
    maxItems: options.maxItems ?? 150,
    timeoutMs: options.networthTimeoutMs ?? 8_000,
    includeItems: false,
  })))(context);
  const accessories = await (options.accessoriesProvider ?? ((member: any, accessoryBudget: number | null) => calculateAccessoriesFromMember(member, {
    budget: accessoryBudget,
    maxPriceLookups: options.maxPriceLookups ?? 75,
    timeoutMs: options.accessoryTimeoutMs ?? 8_000,
  })))(context.member, budget);
  const memories = options.memories ?? readMemories();
  const config = options.config ?? publicConfig();
  const recommendations = sortRecommendations([
    ...accessoryRecommendations(accessories, budget),
    ...readinessRecommendations(readiness),
    ...memoryRecommendations(goal, memories),
    ...routeRecommendations(goal, areas, readiness),
  ]);

  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    goal,
    status: "estimate",
    inputs: {
      areas,
      budget,
      networth: {
        total: networth?.total ?? null,
        status: networth?.status ?? null,
        valuation: networth?.valuation ?? null,
        confidence: networth?.confidence ?? null,
        warnings: networth?.warnings ?? [],
      },
      profileSections: (progression?.sections ?? [])
        .filter((section: any) => areas.includes(section.section) || ["skills", "currencies", "unlocks"].includes(section.section))
        .map((section: any) => ({
          section: section.section,
          sourceFields: section.sourceFields ?? [],
          warningCount: (section.warnings ?? []).length,
          formulas: section.provenance?.formulas ?? [],
        })),
      readiness: readiness.map((entry) => ({ area: entry.area, rating: entry.rating, failedChecks: (entry.checks ?? []).filter((check: any) => !check.passed).map((check: any) => check.name) })),
      accessoryUpgradeCount: accessories?.upgrades?.length ?? 0,
      memoryCount: memories.length,
      usedMemories: relevantMemories(goal, memories),
      config: {
        username: config.username ?? null,
        uuidConfigured: Boolean(config.uuid),
        selectedProfileId: config.selectedProfileId ?? null,
      },
    },
    recommendations,
    whatToSkip: recommendations.filter((entry) => entry.category === "what_to_skip"),
    sourceFreshness: {
      verifiedAt: VERIFIED_AT,
      networthProviders: networth?.providerFreshness ?? [],
      accessoryProviders: accessories?.providerFreshness ?? [],
      profileSectionFormulas: [...new Set((progression?.sections ?? []).flatMap((section: any) => section.provenance?.formulas ?? []))],
    },
    assumptions: [
      "Planner output is deterministic for identical structured inputs.",
      "Recommendations are ranked by explicit local heuristics, not hidden model state.",
      "Missing prices, profile sections, and unsupported exact formulas are warnings, not silently filled values.",
    ],
    warnings: [
      ...(networth?.warnings ?? []).slice(0, 25),
      ...(accessories?.warnings ?? []),
      ...readiness.flatMap((entry) => entry.warnings ?? []),
    ],
    rateLimit: context.rateLimit,
  };
}

export async function planGoalForPlayer(goal: string, player?: string, profile?: string, options: Parameters<typeof planGoalFromContext>[2] = {}) {
  return planGoalFromContext(await fetchProfileContext(player, profile), goal, options);
}

export async function nextUpgradesFromContext(context: any, budget: number, options: {
  accessoriesProvider?: (member: any, budget: number | null) => Promise<any> | any;
  maxPriceLookups?: number;
  accessoryTimeoutMs?: number;
} = {}) {
  if (!Number.isFinite(budget) || budget < 0) {
    throw new Error("budget must be a non-negative finite number.");
  }
  const accessories = await (options.accessoriesProvider ?? ((member: any, accessoryBudget: number | null) => calculateAccessoriesFromMember(member, {
    budget: accessoryBudget,
    maxPriceLookups: options.maxPriceLookups ?? 75,
    timeoutMs: options.accessoryTimeoutMs ?? 8_000,
  })))(context.member, budget);
  const recommendations = sortRecommendations(accessoryRecommendations(accessories, budget));
  return {
    uuid: context.uuid,
    profile: {
      profileId: context.profile.profile_id,
      cuteName: context.profile.cute_name ?? null,
    },
    budget,
    status: "estimate",
    valuation: accessories?.valuation ?? null,
    recommendations,
    sourceFreshness: {
      verifiedAt: VERIFIED_AT,
      accessoryProviders: accessories?.providerFreshness ?? [],
    },
    assumptions: accessories?.assumptions ?? [],
    warnings: accessories?.warnings ?? [],
    rateLimit: context.rateLimit,
  };
}

export async function nextUpgradesForPlayer(player: string | undefined, profile: string | undefined, budget: number, options: Parameters<typeof nextUpgradesFromContext>[2] = {}) {
  return nextUpgradesFromContext(await fetchProfileContext(player, profile), budget, options);
}

export function supportedPlannerAreas() {
  return [...READINESS_AREAS];
}
