export type SurfaceContract = {
  id: string;
  domain: string;
  cli: string[];
  cliFlags?: string[];
  mcp: string[];
  gateway: string[];
  gatewayClient?: string[];
  tui: {
    status: "covered" | "tracked-gap";
    screens: string[];
    issue?: number;
  };
  skills: string[];
  boundedOptions?: string[];
  boundedMcp?: string[];
  boundedMcpOptions?: Record<string, string[]>;
  notes?: string;
};

export const SURFACE_CONTRACTS: SurfaceContract[] = [
  {
    id: "startup-context",
    domain: "startup/context",
    cli: ["start", "context", "context refresh"],
    mcp: ["skyagent_start", "skyagent_context_bootstrap", "skyagent_context_get", "skyagent_context_refresh"],
    gateway: ["POST /agent/start", "GET /context", "POST /context/refresh", "POST /agent/context/refresh"],
    gatewayClient: ["startAgent", "context", "refreshContext", "refreshAgentContext"],
    tui: { status: "covered", screens: ["agent", "status"] },
    skills: ["hypixel-skyblock", "skyagent-context-engine"],
  },
  {
    id: "profile-overview",
    domain: "profile overview",
    cli: ["profiles", "profiles-summary", "profile-snapshot", "member", "overview"],
    mcp: ["skyblock_profiles", "skyblock_profiles_summary", "skyblock_profile_snapshot", "skyblock_profile_member", "skyblock_profile_overview"],
    gateway: ["GET /profiles", "GET /overview"],
    gatewayClient: ["profiles", "overview"],
    tui: { status: "covered", screens: ["profiles", "overview"] },
    skills: ["skyagent-profile-api", "skyagent-context-engine"],
  },
  {
    id: "inventory-items",
    domain: "inventory/items",
    cli: ["inventory", "inventory-section", "item-dump", "normalize-items", "item"],
    cliFlags: ["--debug-raw", "--section"],
    mcp: ["skyblock_inventory", "skyblock_inventory_section", "skyblock_item_dump", "skyblock_normalized_items", "skyblock_item_metadata"],
    gateway: ["GET /inventory", "GET /inventory-section", "GET /items/normalized", "GET /items/metadata"],
    gatewayClient: ["inventory", "inventorySection", "normalizedItems", "itemMetadata"],
    tui: { status: "covered", screens: ["inventory", "gear", "debug"] },
    skills: ["skyagent-inventory-items"],
  },
  {
    id: "networth",
    domain: "networth",
    cli: ["networth", "item-networth"],
    cliFlags: ["--max-items", "--timeout-ms", "--details", "--summary"],
    mcp: ["skyblock_networth", "skyblock_item_networth"],
    gateway: ["GET /networth", "GET /item-networth"],
    gatewayClient: ["networth", "itemNetworth"],
    tui: { status: "covered", screens: ["networth"] },
    skills: ["skyagent-economy"],
    boundedOptions: ["maxItems", "timeoutMs", "includeItems"],
    boundedMcp: ["skyblock_networth", "skyblock_item_networth"],
    boundedMcpOptions: {
      skyblock_networth: ["maxItems", "timeoutMs", "includeItems"],
      skyblock_item_networth: ["maxItems", "timeoutMs", "includeItems"],
    },
  },
  {
    id: "accessories",
    domain: "accessories",
    cli: ["accessories", "missing-accessories", "accessory-upgrades"],
    cliFlags: ["--max-price-lookups", "--timeout-ms", "--budget"],
    mcp: ["skyblock_accessories", "skyblock_missing_accessories", "skyblock_accessory_upgrades"],
    gateway: ["GET /accessories", "GET /accessories/missing", "GET /accessories/upgrades"],
    gatewayClient: ["accessories", "missingAccessories", "accessoryUpgrades"],
    tui: { status: "covered", screens: ["accessories"] },
    skills: ["skyagent-accessories"],
    boundedOptions: ["budget", "maxPriceLookups", "timeoutMs"],
    boundedMcp: ["skyblock_accessories", "skyblock_missing_accessories", "skyblock_accessory_upgrades"],
    boundedMcpOptions: {
      skyblock_accessories: ["maxPriceLookups", "timeoutMs"],
      skyblock_missing_accessories: ["maxPriceLookups", "timeoutMs"],
      skyblock_accessory_upgrades: ["budget", "maxPriceLookups", "timeoutMs"],
    },
  },
  {
    id: "progression-readiness",
    domain: "progression/readiness",
    cli: ["section", "progression", "weight", "readiness"],
    cliFlags: ["--budget", "--max-items", "--networth-timeout-ms", "--max-price-lookups", "--accessory-timeout-ms"],
    mcp: ["skyblock_profile_section", "skyblock_progression", "skyblock_weight", "skyblock_readiness"],
    gateway: ["GET /section", "GET /progression", "GET /weight", "GET /readiness"],
    gatewayClient: ["section", "progression", "weight", "readiness"],
    tui: { status: "covered", screens: ["progression"] },
    skills: ["skyagent-progression", "skyagent-readiness-weight"],
    boundedOptions: ["budget", "maxItems", "networthTimeoutMs", "maxPriceLookups", "accessoryTimeoutMs"],
    boundedMcp: ["skyblock_readiness"],
    boundedMcpOptions: {
      skyblock_readiness: ["budget", "maxItems", "networthTimeoutMs", "maxPriceLookups", "accessoryTimeoutMs"],
    },
  },
  {
    id: "planning-objectives",
    domain: "planning/objectives",
    cli: ["plan", "museum-plan", "next-upgrades", "objective create", "objective list", "objective update", "objective complete", "objective delete"],
    cliFlags: ["--budget", "--use-context", "--persist-objectives", "--objective", "--max-items", "--networth-timeout-ms", "--max-price-lookups", "--accessory-timeout-ms", "--timeout-ms"],
    mcp: ["skyblock_plan_goal", "skyblock_museum_donation_plan", "skyblock_next_upgrades", "skyagent_objective_create", "skyagent_objective_list", "skyagent_objective_update", "skyagent_objective_complete", "skyagent_objective_delete"],
    gateway: ["GET /plan", "GET /museum/plan", "POST /museum/plan", "GET /next-upgrades", "GET /agent/objectives", "POST /agent/objectives"],
    gatewayClient: ["plan", "museumPlan", "nextUpgrades", "agentObjectives"],
    tui: { status: "covered", screens: ["agent"] },
    skills: ["skyagent-planning", "skyagent-objectives"],
    boundedOptions: ["budget", "maxItems", "networthTimeoutMs", "maxPriceLookups", "accessoryTimeoutMs", "timeoutMs"],
    boundedMcp: ["skyblock_plan_goal", "skyblock_museum_donation_plan", "skyblock_next_upgrades"],
    boundedMcpOptions: {
      skyblock_plan_goal: ["budget", "maxItems", "networthTimeoutMs", "maxPriceLookups", "accessoryTimeoutMs"],
      skyblock_museum_donation_plan: ["budget", "maxPriceLookups", "timeoutMs"],
      skyblock_next_upgrades: ["budget", "maxPriceLookups", "accessoryTimeoutMs"],
    },
  },
  {
    id: "providers",
    domain: "providers",
    cli: ["provider status", "provider config get", "provider config set", "price", "lbin", "price-history", "resource"],
    mcp: ["skyagent_llm_provider_status", "skyagent_llm_provider_config_get", "skyagent_llm_provider_config_set", "skyblock_price", "skyblock_lowest_bin", "skyblock_price_history", "skyblock_resource"],
    gateway: ["GET /provider-status", "GET /llm-provider/status", "GET /llm-provider/config", "POST /llm-provider/config", "GET /price", "GET /lbin", "GET /price-history", "GET /resource"],
    gatewayClient: ["providerStatus", "price", "lowestBin", "priceHistory", "llmProviderStatus", "llmProviderConfig", "setLlmProviderConfig", "resource"],
    tui: { status: "covered", screens: ["status", "debug"] },
    skills: ["skyagent-provider-maintenance", "skyagent-economy"],
  },
  {
    id: "server-status",
    domain: "server status",
    cli: ["server-status", "status"],
    mcp: ["skyagent_server_status", "hypixel_status"],
    gateway: ["GET /server-status"],
    gatewayClient: ["serverStatus"],
    tui: { status: "covered", screens: ["status"] },
    skills: ["skyagent-profile-api", "skyagent-provider-maintenance"],
  },
  {
    id: "context-events",
    domain: "context events",
    cli: ["context watch", "context emit"],
    mcp: ["skyagent_context_events", "skyagent_context_watch", "skyagent_context_event_emit"],
    gateway: ["GET /context/events", "POST /context/events", "GET /context/stream"],
    gatewayClient: ["contextEvents", "emitContextEvent"],
    tui: { status: "covered", screens: ["agent"] },
    skills: ["skyagent-live-progress", "skyagent-context-engine"],
  },
];

export function allContractCliCommands() {
  return SURFACE_CONTRACTS.flatMap((contract) => contract.cli);
}

export function allContractMcpTools() {
  return SURFACE_CONTRACTS.flatMap((contract) => contract.mcp);
}

export function allContractGatewayRoutes() {
  return SURFACE_CONTRACTS.flatMap((contract) => contract.gateway);
}

export function allContractGatewayClientMethods() {
  return SURFACE_CONTRACTS.flatMap((contract) => contract.gatewayClient ?? []);
}

export function trackedTuiContractGaps() {
  return SURFACE_CONTRACTS
    .filter((contract) => contract.tui.status === "tracked-gap")
    .map((contract) => ({ id: contract.id, issue: contract.tui.issue, screens: contract.tui.screens }));
}
