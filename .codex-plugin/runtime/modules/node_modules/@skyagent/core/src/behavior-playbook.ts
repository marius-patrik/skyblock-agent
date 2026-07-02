export type SkyAgentBehaviorIntent =
  | "session_start"
  | "broad_planning"
  | "museum_goal"
  | "damage_slayer_goal"
  | "money_route"
  | "accessories"
  | "pets"
  | "wardrobe"
  | "objective_building"
  | "follow_up_change";

export type SkyAgentBehaviorStep = {
  id: string;
  tool: string;
  reason: string;
  required: boolean;
  compact: boolean;
  fallback?: string[];
};

export type SkyAgentFallbackRule = {
  condition: string;
  action: string;
  doBeforeTellingUser: string[];
};

export type SkyAgentBehaviorRoute = {
  intent: SkyAgentBehaviorIntent;
  purpose: string;
  steps: SkyAgentBehaviorStep[];
  persistence: {
    previewOnly: string;
    onUserAcceptance: string[];
  };
  rawPayloadPolicy: string;
  fallbackRules: SkyAgentFallbackRule[];
};

const bootstrapSteps: SkyAgentBehaviorStep[] = [
  {
    id: "start",
    tool: "skyagent_start",
    reason: "Load configured player/profile, compact profile context, objectives, provider/server status, recent events, and follow-up tool hints.",
    required: true,
    compact: true,
    fallback: ["skyagent_context_bootstrap", "skyagent setup status --json", "skyagent context --cache-only --allow-stale"],
  },
  {
    id: "objectives",
    tool: "skyagent_objective_list",
    reason: "Read durable goals, todos, buy-list entries, source items, and snipe targets before planning.",
    required: true,
    compact: true,
    fallback: ["skyagent objective list --json", "empty objective summary with warning"],
  },
  {
    id: "status",
    tool: "skyagent_server_status",
    reason: "Capture Hypixel API availability, online state, maintenance/server warnings, and session fields.",
    required: true,
    compact: true,
    fallback: ["provider status from skyagent_start", "warn that server status is unavailable"],
  },
];

const providerFreshnessStep: SkyAgentBehaviorStep = {
  id: "provider_freshness",
  tool: "skyagent_context_events",
  reason: "Check recent provider cache, profile refresh, and Hypixel status changes before meta-sensitive recommendations.",
  required: true,
  compact: true,
  fallback: ["skyagent_provider_status", "skyagent_server_status", "carry stale/unknown freshness warning"],
};

const fallbackRules: SkyAgentFallbackRule[] = [
  {
    condition: "MCP tools unavailable",
    action: "Use equivalent non-interactive CLI commands and keep JSON output compact.",
    doBeforeTellingUser: ["try skyagent start --json", "try the narrow skyagent CLI command", "report exact missing MCP surface only after CLI fallback fails"],
  },
  {
    condition: "stale cache",
    action: "Refresh when the decision is current-state or market sensitive; otherwise keep stale warnings attached.",
    doBeforeTellingUser: ["try skyagent_context_refresh", "try profile snapshot refresh", "ask only if refresh needs credentials or user consent"],
  },
  {
    condition: "missing parser or missing compact summary",
    action: "Use the narrow raw endpoint or item dump with bounded extraction, then summarize the fields needed for the goal.",
    doBeforeTellingUser: ["try skyblock_profile_section", "try skyblock_museum/skyblock_profile_member", "try hypixel_request for the official endpoint"],
  },
  {
    condition: "huge raw payload",
    action: "Avoid dumping it; extract only relevant fields and cite that raw data was bounded.",
    doBeforeTellingUser: ["try summary tool first", "use profile section or normalized item tools", "request raw/debug output only when the user asks"],
  },
  {
    condition: "missing API key",
    action: "Use cached public context where possible and return setup guidance without exposing secrets.",
    doBeforeTellingUser: ["try cache-only context", "try public resources", "show skyagent setup status requirements"],
  },
  {
    condition: "server maintenance or provider outage",
    action: "Use stale/cache fallback only with explicit warning and avoid strong current-meta claims.",
    doBeforeTellingUser: ["check server status", "check provider cache events", "mark recommendation freshness as degraded"],
  },
  {
    condition: "partial provider data",
    action: "Continue with confidence/warnings and do not invent missing values.",
    doBeforeTellingUser: ["bound price/networth/accessory lookups", "surface unknown prices", "rank only recommendations with enough evidence"],
  },
];

function route(intent: SkyAgentBehaviorIntent, purpose: string, steps: SkyAgentBehaviorStep[]): SkyAgentBehaviorRoute {
  return {
    intent,
    purpose,
    steps: [...bootstrapSteps, ...steps],
    persistence: {
      previewOnly: "Do not create or mutate objectives while previewing a plan.",
      onUserAcceptance: [
        "Persist goals as objective/task records.",
        "Persist purchases as buy entries with itemId, target price, budget, source provider, freshness, and warnings.",
        "Persist acquisition work as source entries and auction watch rules as snipe entries.",
      ],
    },
    rawPayloadPolicy: "Prefer compact summaries. Pull raw payloads only for explicit debug requests or when no summary/parser exists, then extract bounded fields.",
    fallbackRules,
  };
}

export function skyAgentBehaviorRoute(intent: SkyAgentBehaviorIntent): SkyAgentBehaviorRoute {
  switch (intent) {
    case "session_start":
      return route("session_start", "Start or attach to SkyAgent with enough compact context to choose the next tools.", []);
    case "museum_goal":
      return route("museum_goal", "Plan concrete museum progress from owned/donatable state rather than generic progression.", [
        {
          id: "museum_plan",
          tool: "skyblock_museum_donation_plan",
          reason: "Rank already-donated, owned, hidden-owned, missing, buy, source, and snipe donation candidates before generic progression advice.",
          required: true,
          compact: true,
          fallback: ["skyblock_profile_section:museum", "skyblock_museum", "hypixel_request:skyblock/museum"],
        },
        {
          id: "museum_evidence",
          tool: "skyblock_profile_section:museum",
          reason: "Read compact Museum value/progress evidence when the donation planner reports missing or uncertain fields.",
          required: true,
          compact: true,
          fallback: ["skyblock_inventory", "skyblock_normalized_items", "skyblock_item_dump with debug only for the missing section"],
        },
        {
          id: "prices",
          tool: "skyblock_price",
          reason: "Price candidate donations before recommending buys or source targets.",
          required: true,
          compact: true,
          fallback: ["skyblock_lowest_bin", "skyblock_bazaar", "mark unknown price"],
        },
        providerFreshnessStep,
      ]);
    case "damage_slayer_goal":
      return route("damage_slayer_goal", "Recommend damage or Slayer upgrades only after checking complete gear context, budget, and meta freshness.", [
        {
          id: "readiness",
          tool: "skyblock_readiness:slayer",
          reason: "Get current Slayer readiness and explicit missing-data assumptions.",
          required: true,
          compact: true,
          fallback: ["skyblock_progression:slayer", "skyblock_profile_overview"],
        },
        {
          id: "gear",
          tool: "skyblock_inventory",
          reason: "Check armor, equipment, current inventory, wardrobe, storage, museum signals, and item modifiers before judging damage.",
          required: true,
          compact: true,
          fallback: ["skyblock_inventory_section:armor", "skyblock_inventory_section:equipment", "skyblock_normalized_items"],
        },
        {
          id: "pets",
          tool: "skyblock_inventory_section:pets",
          reason: "Check active pet, pet level assumptions, held item, and relevant alternatives.",
          required: true,
          compact: true,
          fallback: ["skyblock_profile_section:pets", "warn missing pet data"],
        },
        {
          id: "accessories",
          tool: "skyblock_accessories",
          reason: "Check Magical Power, missing accessories, enrichments/recombobulation, and coin-per-MP upgrades.",
          required: true,
          compact: true,
          fallback: ["skyblock_missing_accessories", "skyblock_accessory_upgrades"],
        },
        {
          id: "budget_prices",
          tool: "skyblock_next_upgrades",
          reason: "Rank only budgeted upgrades with price evidence before recommending purchases.",
          required: true,
          compact: true,
          fallback: ["skyblock_price", "skyblock_lowest_bin", "skip purchases without price evidence"],
        },
        providerFreshnessStep,
      ]);
    case "money_route":
      return route("money_route", "Choose money routes from profile readiness, budget, live price/provider state, and time constraints.", [
        { id: "networth", tool: "skyblock_networth", reason: "Estimate available capital and section value with unknown-price warnings.", required: true, compact: true, fallback: ["skyblock_profile_overview"] },
        { id: "progression", tool: "skyblock_progression", reason: "Check Garden, mining, dungeon, Kuudra, and unlock blockers before route selection.", required: true, compact: true },
        providerFreshnessStep,
      ]);
    case "accessories":
      return route("accessories", "Prioritize Magical Power upgrades from accessory bag state and bounded price evidence.", [
        { id: "accessories", tool: "skyblock_accessories", reason: "Inspect owned, duplicate, recombobulated, enriched, and ignored accessories.", required: true, compact: true },
        { id: "upgrades", tool: "skyblock_accessory_upgrades", reason: "Rank missing accessories by coin per Magical Power under budget and provider bounds.", required: true, compact: true },
      ]);
    case "pets":
      return route("pets", "Inspect pet inventory and active pet before pet-sensitive recommendations.", [
        { id: "pets", tool: "skyblock_inventory_section:pets", reason: "Read active pet, level assumptions, held item, skin, candy count, and alternatives.", required: true, compact: true, fallback: ["skyblock_profile_section:pets"] },
      ]);
    case "wardrobe":
      return route("wardrobe", "Inspect current gear and wardrobe/storage before judging readiness or purchases.", [
        { id: "wardrobe", tool: "skyblock_inventory_section:wardrobe", reason: "Read wardrobe and loadout fallback state with source warnings.", required: true, compact: true, fallback: ["skyblock_inventory_section:armor", "skyblock_normalized_items"] },
      ]);
    case "objective_building":
      return route("objective_building", "Turn accepted plans into durable goals, todos, buys, source items, and snipes.", [
        { id: "plan", tool: "skyblock_plan_goal", reason: "Create preview candidate work items before persistence.", required: true, compact: true },
        { id: "persist", tool: "skyagent_objective_create", reason: "Persist only after the user accepts the route.", required: false, compact: true },
      ]);
    case "follow_up_change":
      return route("follow_up_change", "React to reported progress or context events without making the user restate everything.", [
        { id: "events", tool: "skyagent_context_events", reason: "Read recent profile refresh, objective, provider, and status events since the last cursor.", required: true, compact: true },
        { id: "refresh", tool: "skyagent_context_refresh", reason: "Refresh compact context after gear, pet, accessory, profile, or objective changes.", required: true, compact: true },
      ]);
    case "broad_planning":
    default:
      return route("broad_planning", "Start from compact profile/objective/event context, then choose narrow tools from the follow-up map.", [
        { id: "plan", tool: "skyblock_plan_goal", reason: "Build goal-specific immediate actions, todo candidates, buy/source/snipe candidates, and skip guidance.", required: true, compact: true },
        providerFreshnessStep,
      ]);
  }
}

export function skyAgentBehaviorToolNames(intent: SkyAgentBehaviorIntent) {
  return skyAgentBehaviorRoute(intent).steps.map((step) => step.tool);
}
