import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { publicConfig } from "@skyagent/core";
import { SURFACE_CONTRACTS, trackedTuiContractGaps } from "@skyagent/core/surface-contracts";
import { gatewayClient } from "@skyagent/gateway/manager";

export type MenuId =
  | "agent"
  | "status"
  | "profiles"
  | "overview"
  | "inventory"
  | "gear"
  | "accessories"
  | "networth"
  | "progression"
  | "providers"
  | "events"
  | "objectives"
  | "debug";

export type TuiState = {
  menuIndex: number;
  profileCursor: number;
  debugCursor: number;
  loading: boolean;
  error: string | null;
  errorScreen: MenuId | null;
  gateway: Awaited<ReturnType<typeof gatewayClient>> | null;
  config: any | null;
  agent: any | null;
  transcript: Array<{ role: string; content: string; pending?: boolean }>;
  input: string;
  objectiveCursor: number;
  activity: string | null;
  profiles: any[];
  overview: any | null;
  screenData: Partial<Record<MenuId, any>>;
  debugResult: unknown;
};

type TranscriptEntry = { role: string; content: string; pending?: boolean };

const MENU: Array<{ id: MenuId; label: string }> = [
  { id: "agent", label: "Agent chat" },
  { id: "status", label: "Config / status" },
  { id: "profiles", label: "Profile selector" },
  { id: "overview", label: "Profile overview" },
  { id: "inventory", label: "Inventory / sections" },
  { id: "gear", label: "Pets / wardrobe / gear" },
  { id: "accessories", label: "Accessories / MP" },
  { id: "networth", label: "Networth" },
  { id: "progression", label: "Progression / readiness" },
  { id: "providers", label: "Providers / server" },
  { id: "events", label: "Context events" },
  { id: "objectives", label: "Objectives" },
  { id: "debug", label: "Raw API / debug launcher" },
];

export const TUI_MENU_IDS = MENU.map((item) => item.id);
export const TUI_SURFACE_SCREEN_IDS: MenuId[] = ["inventory", "gear", "accessories", "networth", "progression", "providers", "events", "objectives"];
export const TUI_PROFILE_BOUND_SCREEN_IDS: MenuId[] = ["inventory", "gear", "accessories", "networth", "progression"];

const DEBUG_ACTIONS = [
  { label: "Gateway version", endpoint: "version" },
  { label: "Gateway config", endpoint: "config" },
  { label: "SkyBlock profiles", endpoint: "profiles" },
  { label: "Selected profile overview", endpoint: "overview" },
];

function boolLabel(value: unknown) {
  return value ? "yes" : "no";
}

function formatCoins(value: unknown) {
  return typeof value === "number" ? Math.round(value).toLocaleString("en-US") : "unknown";
}

function listCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function firstArray(...values: unknown[]) {
  return values.find((value) => Array.isArray(value)) as any[] | undefined;
}

export function compactJson(value: unknown) {
  return JSON.stringify(value, (key, nested) => {
    if (/api[-_]?key|token|authorization|secret|password/i.test(key)) return "[redacted]";
    if (typeof nested === "string" && nested.length > 240) return `${nested.slice(0, 240)}...`;
    return nested;
  }, 2);
}

function sectionStateLabel(value: any) {
  if (!value) return "missing";
  if (value.available === false || value.status === "missing") return "missing";
  if (value.warning || value.warnings?.length) return "degraded";
  return "available";
}

export function tuiInventorySummary(data: any) {
  const inventory = data?.inventory?.inventory ?? data?.inventory ?? {};
  const sections = inventory?.sections ?? inventory;
  const normalized = data?.normalized?.items ?? data?.normalizedItems?.items ?? data?.normalizedItems ?? [];
  const names = Object.keys(sections).filter((name) => name !== "ok").slice(0, 10);
  return { sections, normalized, names };
}

export function tuiGearSummary(data: any) {
  const inventory = data?.inventory?.inventory ?? data?.inventory ?? {};
  const normalized = data?.normalized?.items ?? data?.normalizedItems?.items ?? data?.normalizedItems ?? [];
  const items = Array.isArray(normalized) ? normalized : [];
  const pets = firstArray(inventory?.pets, inventory?.sections?.pets?.items, items.filter((item: any) => item?.kind === "pet")) ?? [];
  const wardrobe = firstArray(inventory?.wardrobe, inventory?.sections?.wardrobe?.items, items.filter((item: any) => item?.section === "wardrobe")) ?? [];
  const armor = firstArray(inventory?.armor, inventory?.sections?.armor?.items, items.filter((item: any) => item?.section === "armor")) ?? [];
  const equipment = firstArray(inventory?.equipment, inventory?.sections?.equipment?.items, items.filter((item: any) => item?.section === "equipment")) ?? [];
  const current = [...armor, ...equipment];
  return { pets, wardrobe, current };
}

export function tuiAccessoriesSummary(data: any) {
  const accessories = data?.accessories?.accessories ?? data?.accessories ?? {};
  const missing = data?.missing?.missingAccessories ?? data?.missing ?? {};
  return {
    magicalPower: accessories?.magicalPower ?? accessories?.mp ?? "unknown",
    owned: accessories?.accessories ?? accessories?.items ?? [],
    missing: missing?.missingAccessories ?? missing?.missing ?? [],
    warnings: accessories?.warnings ?? missing?.warnings ?? [],
  };
}

export function tuiNetworthSummary(data: any) {
  const networth = data?.networth?.networth ?? data?.networth ?? {};
  return {
    networth,
    sections: networth?.sections ?? {},
    total: networth?.total ?? networth?.totalValue,
    purse: networth?.currency?.purse ?? networth?.purse,
    bank: networth?.currency?.bank ?? networth?.bank,
    warnings: networth?.warnings ?? [],
  };
}

export function tuiProgressionSummary(data: any) {
  const progression = data?.progression?.progression ?? data?.progression ?? {};
  const readiness = data?.readiness?.readiness ?? data?.readiness ?? {};
  const weight = data?.weight?.weight ?? data?.weight ?? {};
  return {
    progression,
    readiness,
    weight,
    sections: progression?.sections ?? progression,
    warnings: readiness?.warnings ?? progression?.warnings ?? [],
  };
}

export function tuiProvidersSummary(data: any) {
  const providerPayload = data?.providerStatus ?? {};
  const rawProviderStatus = providerPayload?.providerStatus
    ?? (Array.isArray(providerPayload?.providers) ? providerPayload : providerPayload?.providers)
    ?? providerPayload;
  const providerStatus = Array.isArray(rawProviderStatus) ? { providers: rawProviderStatus } : rawProviderStatus;
  const server = data?.serverStatus?.serverStatus ?? data?.serverStatus ?? {};
  const llm = data?.llm?.provider ?? data?.llm ?? {};
  const providers = providerStatus?.providers ?? [];
  const resources = providerStatus?.resources ?? [];
  return {
    providers,
    resources,
    server,
    llm,
    warnings: [
      ...(providerStatus?.warnings ?? []),
      ...providers.flatMap((provider: any) => provider?.warnings ?? []),
      ...resources.flatMap((resource: any) => resource?.warnings ?? []),
    ],
  };
}

export function tuiProviderFreshnessLabel(entry: any) {
  if (!entry) return "unknown";
  if (entry.status === "offline" || entry.status === "unavailable") return "offline";
  if (entry.status === "missing_api_key" || entry.status === "degraded") return "degraded";
  if (entry.freshness?.status) return entry.freshness.status;
  if (entry.cacheStatus) return entry.cacheStatus;
  if (entry.cache?.staleCount > 0) return "stale";
  if (entry.cache?.unavailableCount > 0) return "degraded";
  if (entry.cache?.entryCount > 0 || entry.status === "available") return "fresh";
  return "unknown";
}

export function tuiGatewayStateLabel(gateway: any, providerSummary: ReturnType<typeof tuiProvidersSummary>) {
  if (!gateway?.status?.running) return "offline";
  if (providerSummary.providers.some((provider: any) => ["missing_api_key", "degraded", "offline", "unavailable"].includes(provider?.status))) {
    return "degraded";
  }
  const freshness = [...providerSummary.providers, ...providerSummary.resources].map((entry: any) => tuiProviderFreshnessLabel(entry));
  if (freshness.includes("stale")) return "stale";
  if (providerSummary.warnings.length) return "degraded";
  return "connected";
}

export function tuiEventsSummary(data: any) {
  const batch = data?.events ?? data ?? {};
  return {
    latestSequence: batch?.latestSequence,
    events: batch?.events ?? [],
  };
}

export function tuiObjectivesSummary(data: any, agent: any = null) {
  const objectives = data?.objectives;
  const items = Array.isArray(objectives)
    ? objectives
    : objectives?.objectives ?? objectives?.active ?? activeObjectiveItems(agent);
  return { objectives: items ?? [] };
}

function profileLabel(profile: any) {
  const name = profile.cuteName ?? "unnamed";
  const selected = profile.selected ? " selected" : "";
  return `${name} (${profile.profileId})${selected}`;
}

function createState(): TuiState {
  return {
    menuIndex: 0,
    profileCursor: 0,
    debugCursor: 0,
    loading: false,
    error: null,
    errorScreen: null,
    gateway: null,
    config: null,
    agent: null,
    transcript: [],
    input: "",
    objectiveCursor: 0,
    activity: null,
    profiles: [],
    overview: null,
    screenData: {},
    debugResult: null,
  };
}

function setupGuidance(config: any, options: boolean | { needsProfile?: boolean; needsApiKey?: boolean } = false) {
  const needsProfile = typeof options === "boolean" ? options : Boolean(options.needsProfile);
  const needsApiKey = typeof options === "boolean" ? true : options.needsApiKey !== false;
  const missing = [];
  if (!config?.username && !config?.uuid) {
    missing.push("username or UUID");
  }
  if (needsApiKey && !config?.apiKeyConfigured) {
    missing.push("Hypixel API key");
  }
  if (needsProfile && !config?.selectedProfileId) {
    missing.push("selected profile");
  }
  return missing.length ? `Setup incomplete: configure ${missing.join(", ")} from the status screen or CLI, then refresh.` : null;
}

export function tuiSetupCommand(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false as const, error: "Type setup value, for example: username PlayerName" };
  const [rawField, ...valueParts] = trimmed.split(/\s+/);
  const value = valueParts.join(" ").trim();
  const fieldMap: Record<string, "username" | "uuid" | "apiKey" | "selectedProfileId"> = {
    name: "username",
    username: "username",
    uuid: "uuid",
    key: "apiKey",
    apikey: "apiKey",
    "api-key": "apiKey",
    profile: "selectedProfileId",
    "profile-id": "selectedProfileId",
    selectedProfileId: "selectedProfileId",
  };
  const field = fieldMap[rawField];
  if (!field) return { ok: false as const, error: "Unknown setup field. Use username, uuid, api-key, or profile." };
  if (!value) return { ok: false as const, error: `Missing value for ${rawField}.` };
  return { ok: true as const, field, config: { [field]: value } };
}

export function tuiSetupDisplayInput(input: string) {
  const trimmedStart = input.trimStart();
  const match = /^(api-key|apikey|key)(\s+)(.*)$/i.exec(trimmedStart);
  if (!match) return input;
  const prefixLength = input.length - trimmedStart.length;
  const prefix = input.slice(0, prefixLength);
  const value = match[3] ?? "";
  const masked = value ? "*".repeat(Math.min(Math.max(value.length, 6), 24)) : "";
  return `${prefix}${match[1]}${match[2]}${masked}`;
}

export function tuiScreenIndex(screen: MenuId) {
  return MENU.findIndex((item) => item.id === screen);
}

export function tuiMenuNavigationAction(input: string, key: { upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean }, currentIndex: number) {
  if (key.upArrow || input === "k") {
    return (currentIndex - 1 + MENU.length) % MENU.length;
  }
  if (key.downArrow || input === "j") {
    return (currentIndex + 1) % MENU.length;
  }
  return currentIndex;
}

export function tuiMenuStateNavigationAction(input: string, key: { upArrow?: boolean; downArrow?: boolean }, state: Pick<TuiState, "menuIndex" | "error" | "errorScreen">) {
  const menuIndex = tuiMenuNavigationAction(input, key, state.menuIndex);
  return menuIndex === state.menuIndex ? state : { ...state, menuIndex, error: null, errorScreen: null };
}

export function tuiListCursorAction(screen: MenuId, input: string, key: { leftArrow?: boolean; rightArrow?: boolean }, currentIndex: number, itemCount: number) {
  if (!["profiles", "debug"].includes(screen) || itemCount <= 0) {
    return currentIndex;
  }
  if (key.leftArrow || input === "h") {
    return (currentIndex - 1 + itemCount) % itemCount;
  }
  if (key.rightArrow || input === "l") {
    return (currentIndex + 1) % itemCount;
  }
  return currentIndex;
}

export function shouldAutoLoadTuiSurfaceScreen(screen: MenuId, state: Pick<TuiState, "loading" | "error" | "errorScreen" | "screenData">) {
  const activeError = state.error && (!state.errorScreen || state.errorScreen === screen);
  return TUI_SURFACE_SCREEN_IDS.includes(screen) && !state.loading && !activeError && !state.screenData[screen];
}

export function clearProfileBoundScreenData(screenData: Partial<Record<MenuId, any>>) {
  const next = { ...screenData };
  for (const screen of TUI_PROFILE_BOUND_SCREEN_IDS) {
    delete next[screen];
  }
  return next;
}

export async function loadTuiSurfaceScreen(client: any, config: any, screen: MenuId) {
  const needsProfile = ["inventory", "gear", "accessories", "networth", "progression"].includes(screen);
  const guidance = needsProfile ? setupGuidance(config, { needsProfile: true, needsApiKey: false }) : null;
  if (guidance) {
    return { data: null, error: guidance };
  }

  let data: any;
  if (screen === "inventory" || screen === "gear") {
    const [inventory, normalized] = await Promise.all([
      client.inventory(),
      client.normalizedItems(),
    ]);
    data = { inventory, normalized };
  } else if (screen === "accessories") {
    const [accessories, missing] = await Promise.all([
      client.accessories(undefined, undefined, { maxPriceLookups: 40, timeoutMs: 3_000 }),
      client.missingAccessories(undefined, undefined, { maxPriceLookups: 40, timeoutMs: 3_000 }),
    ]);
    data = { accessories, missing };
  } else if (screen === "networth") {
    data = await client.networth(undefined, undefined, { maxItems: 80, timeoutMs: 4_000, includeItems: false });
  } else if (screen === "progression") {
    const [progression, weight, readiness] = await Promise.all([
      client.progression(),
      client.weight(),
      client.readiness("general", undefined, undefined, {
        maxItems: 60,
        networthTimeoutMs: 3_000,
        maxPriceLookups: 30,
        accessoryTimeoutMs: 3_000,
      }),
    ]);
    data = { progression, weight, readiness };
  } else if (screen === "providers") {
    const [providerStatus, serverStatus, llm] = await Promise.all([
      client.providerStatus(),
      client.serverStatus(),
      client.llmProviderStatus(),
    ]);
    data = { providerStatus, serverStatus, llm };
  } else if (screen === "events") {
    data = await client.contextEvents({ limit: 20 });
  } else if (screen === "objectives") {
    data = await client.agentObjectives();
  } else {
    throw new Error(`Unsupported TUI surface screen: ${screen}`);
  }

  return { data, error: null };
}

export function tuiStatus() {
  const config = publicConfig();
  return {
    surface: "tui",
    renderer: "ink",
    ready: true,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    configured: {
      username: Boolean(config.username),
      uuid: Boolean(config.uuid),
      profile: Boolean(config.selectedProfileId),
      apiKey: Boolean(config.apiKeyConfigured),
    },
    config: {
      username: config.username,
      uuid: config.uuid,
      selectedProfileId: config.selectedProfileId,
      apiKeyConfigured: config.apiKeyConfigured,
      apiKeySource: config.apiKeySource,
      dataDir: config.dataDir,
    },
    providers: {
      hypixelApi: config.apiKeyConfigured ? "configured" : "missing_api_key",
      itemMetadata: "on_demand_neu_provider",
      priceCache: "shared_core_provider_cache",
    },
    gateway: {
      managed: false,
      mode: "not_started_for_status_snapshot",
    },
  };
}

export function tuiSnapshot() {
  const status = tuiStatus();
  const representativeContentStates = {
    status: ["connected", "offline", "setup_guidance", "redacted_config"],
    profiles: ["loading", "empty", "selectable_profiles", "setup_guidance"],
    overview: ["loading", "empty", "loaded_summary", "stale_or_missing_api_warning"],
    inventory: ["section_summary", "normalized_item_count", "debug_raw_action"],
    gear: ["current_gear", "wardrobe", "pets", "missing_inventory_state"],
    accessories: ["magical_power", "owned_count", "missing_candidates", "price_freshness_warnings"],
    networth: ["compact_totals", "section_totals", "bounded_price_warnings"],
    progression: ["skill_sections", "weight_estimate", "readiness_summary", "missing_data_warnings"],
    providers: ["gateway_connection", "server_status", "provider_freshness", "llm_config_state"],
    events: ["latest_sequence", "recent_events", "empty_stream"],
    objectives: ["open_items", "empty_state", "actionable_status"],
    debug: ["explicit_raw_action", "redacted_result"],
  };
  return {
    ...status,
    screens: MENU.map((item) => item.id),
    contractCoverage: SURFACE_CONTRACTS.map((contract) => ({
      id: contract.id,
      status: contract.tui.status,
      screens: contract.tui.screens,
      issue: contract.tui.issue ?? null,
    })),
    trackedContractGaps: trackedTuiContractGaps(),
    representativeContentStates,
    shortcuts: ["up/down or j/k", "left/right or h/l", "enter", "r", "q", "agent text input", "tab add objective", "[/] select objective", "x complete objective"],
    secrets: "api keys are never printed",
  };
}

export function tuiDegradedMessages(config: any, agent: any = null, needsProfile = false) {
  const messages = [];
  const setup = setupGuidance(config, needsProfile);
  if (setup) messages.push(setup);
  for (const warning of agent?.warnings ?? []) {
    messages.push(warning.message ?? String(warning.code ?? warning));
  }
  for (const warning of agent?.providerStatus?.llm?.warnings ?? []) {
    messages.push(warning.message ?? String(warning.code ?? warning));
  }
  return messages;
}

export function startAgentTranscript(transcript: TranscriptEntry[], message: string) {
  return [...transcript, { role: "user", content: message }, { role: "assistant", content: "", pending: true }];
}

export function applyAgentTranscriptDelta(transcript: TranscriptEntry[], assistantText: string) {
  if (transcript.length === 0) {
    return [{ role: "assistant", content: assistantText, pending: true }];
  }
  const next = [...transcript];
  const lastIndex = next.length - 1;
  next[lastIndex] = { role: "assistant", content: assistantText, pending: true };
  return next;
}

export function finishAgentTranscript(transcript: TranscriptEntry[], assistantText: string) {
  if (transcript.length === 0) {
    return [{ role: "assistant", content: assistantText || "(no text returned)" }];
  }
  const next = [...transcript];
  const lastIndex = next.length - 1;
  next[lastIndex] = { role: "assistant", content: assistantText || "(no text returned)" };
  return next;
}

export function agentConsumesPrintableInput(input: string, currentInput: string) {
  if (input === "\r" || input === "\n") return false;
  if (input === "\t") return false;
  if (!currentInput && ["j", "k", "h", "l"].includes(input)) return false;
  return true;
}

type AgentInputKeyState = Partial<Record<"ctrl" | "meta" | "upArrow" | "downArrow" | "leftArrow" | "rightArrow" | "return" | "backspace" | "delete" | "tab", boolean>>;

export function agentShouldAppendPrintableInput(input: string, currentInput: string, key: AgentInputKeyState = {}) {
  return Boolean(
    input
      && agentConsumesPrintableInput(input, currentInput)
      && !key.ctrl
      && !key.meta
      && !key.upArrow
      && !key.downArrow
      && !key.leftArrow
      && !key.rightArrow
      && !key.return
      && !key.backspace
      && !key.delete
      && !key.tab
  );
}

export function statusShouldAppendSetupInput(input: string, currentInput: string, key: AgentInputKeyState = {}) {
  if (!currentInput && (input === "q" || input === "j" || input === "k")) {
    return false;
  }
  return agentShouldAppendPrintableInput(input, currentInput, key);
}

export function agentInputAction(input: string, currentInput: string) {
  if (input === "q" && !currentInput) return { action: "quit" as const, input: currentInput };
  return { action: "append" as const, input: `${currentInput}${input}` };
}

export function agentRefreshShortcut(input: string, key: Pick<AgentInputKeyState, "ctrl"> = {}) {
  return Boolean(key.ctrl && (input === "r" || input === "\x12"));
}

export function activeObjectiveItems(agent: any) {
  return (agent?.objectives?.active ?? []).filter((item: any) => item && item.status !== "done" && item.status !== "deleted");
}

export function objectiveCursorAction(input: string, currentCursor: number, count: number) {
  if (count <= 0) return 0;
  if (input === "[") return (currentCursor - 1 + count) % count;
  if (input === "]") return (currentCursor + 1) % count;
  return Math.min(currentCursor, count - 1);
}

export function objectiveActionLabel(input: string) {
  if (input === "tab" || input === "\t") return "create";
  if (input === "x") return "complete";
  return null;
}

function Header({ title }: { title: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">SkyAgent</Text>
      <Text bold>{title}</Text>
      <Text dimColor>up/down or j/k screens, left/right or h/l lists, enter send/select, ctrl+r refresh, q quit</Text>
    </Box>
  );
}

function freshnessLabel(agent: any) {
  const cache = agent?.freshness;
  if (!cache) return "context unavailable";
  const status = cache.stale ? "stale" : cache.status ?? "unknown";
  return `${status}${cache.fetchedAt ? ` at ${cache.fetchedAt}` : ""}`;
}

function AgentScreen({ state }: { state: TuiState }) {
  const agent = state.agent;
  const provider = agent?.providerStatus?.llm;
  const objectives = activeObjectiveItems(agent);
  const degradedMessages = tuiDegradedMessages(state.config, agent, Boolean(state.gateway));
  const selectedObjectiveIndex = objectives.length ? Math.min(state.objectiveCursor, objectives.length - 1) : -1;
  const transcript = state.transcript.length
    ? state.transcript
    : [{ role: "system", content: agent?.ready ? "Agent ready. Type a SkyBlock question or objective." : "Starting local agent session..." }];
  return (
    <Box flexDirection="column">
      <Header title="Agent chat" />
      {state.loading && <Text color="yellow">{state.activity ?? "Working..."}</Text>}
      {state.error && <Text color="red">Error: {state.error}</Text>}
      {degradedMessages.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {degradedMessages.slice(0, 5).map((message, index) => (
            <Text key={`${message}-${index}`} color="yellow">! {message}</Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column" marginBottom={1}>
        <Text>Session: {agent?.id ?? "not started"}</Text>
        <Text>Player: {agent?.player?.username ?? agent?.player?.input ?? "not configured"} | Profile: {agent?.selectedProfile?.cuteName ?? agent?.selectedProfile?.profileId ?? "not selected"}</Text>
        <Text>Context: {freshnessLabel(agent)}</Text>
        <Text>LiteLLM: {provider?.configured ? `${provider.provider}:${provider.model}` : "not configured"}</Text>
        <Text>Objectives: {objectives.length} active | [/] select | tab add typed objective | x complete selected</Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        {objectives.slice(0, 5).map((objective: any, index: number) => (
          <Text key={objective.id ?? `${objective.title}-${index}`} color={index === selectedObjectiveIndex ? "green" : undefined}>
            {index === selectedObjectiveIndex ? "> " : "  "}{objective.itemKind ?? "objective"}: {objective.title ?? objective.id} [{objective.status ?? "open"}]
          </Text>
        ))}
        {!objectives.length && <Text dimColor>No active objectives. Type one and press tab.</Text>}
      </Box>
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} minHeight={10}>
        {transcript.slice(-10).map((message, index) => (
          <Text key={`${message.role}-${index}`} color={message.role === "user" ? "green" : message.role === "assistant" ? "cyan" : "gray"}>
            {message.role}: {message.content || (message.pending ? "..." : "")}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="green">{"> "}</Text>
        <Text>{state.input}</Text>
        <Text dimColor>{state.input ? "" : "type here"}</Text>
      </Box>
    </Box>
  );
}

function Menu({ activeIndex }: { activeIndex: number }) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
      {MENU.map((item, index) => (
        <Text key={item.id} color={index === activeIndex ? "green" : undefined}>
          {index === activeIndex ? "> " : "  "}{item.label}
        </Text>
      ))}
    </Box>
  );
}

function StatusScreen({ state }: { state: TuiState }) {
  const status = tuiStatus();
  const config = state.config ?? status.config;
  const gateway = state.gateway?.status;
  return (
    <Box flexDirection="column">
      <Header title="Config / status" />
      {state.loading && <Text color="yellow">Connecting to local gateway...</Text>}
      {state.error && <Text color="red">Gateway: {state.error}</Text>}
      <Text>Gateway: {gateway ? `${gateway.url} pid=${gateway.pid}` : "not connected"}</Text>
      <Text>Username: {config.username ?? "not configured"}</Text>
      <Text>UUID: {config.uuid ?? "not configured"}</Text>
      <Text>Selected profile: {config.selectedProfileId ?? "not configured"}</Text>
      <Text>API key configured: {boolLabel(config.apiKeyConfigured)}{config.apiKeySource ? ` (${config.apiKeySource})` : ""}</Text>
      <Text>Data dir: {config.dataDir}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Providers / cache</Text>
        <Text>Hypixel API: {config.apiKeyConfigured ? "configured" : "missing_api_key"}</Text>
        <Text>Item metadata: {status.providers.itemMetadata}</Text>
        <Text>Price cache: {status.providers.priceCache}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">{"> "}</Text>
        <Text>{tuiSetupDisplayInput(state.input)}</Text>
        <Text dimColor>{state.input ? "" : "username <name> | uuid <uuid> | api-key <key> | profile <id>"}</Text>
      </Box>
    </Box>
  );
}

function ProfilesScreen({ state }: { state: TuiState }) {
  return (
    <Box flexDirection="column">
      <Header title="Profile selector" />
      {state.loading && <Text color="yellow">Loading profiles...</Text>}
      {!state.loading && state.error && (
        <>
          <Text color="red">Error: {state.error}</Text>
          <Text dimColor>Complete setup in Config / status, then press r.</Text>
        </>
      )}
      {!state.loading && !state.error && state.profiles.length === 0 && <Text>No profiles loaded. Press r to fetch profiles.</Text>}
      {!state.loading && !state.error && state.profiles.length > 0 && (
        <>
          <Text dimColor>Select a profile and press enter to store it in SkyAgent config.</Text>
          <Box flexDirection="column" marginTop={1}>
            {state.profiles.map((profile, index) => (
              <Text key={profile.profileId} color={index === state.profileCursor ? "green" : undefined}>
                {index === state.profileCursor ? "> " : "  "}{profileLabel(profile)}
              </Text>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function OverviewScreen({ state }: { state: TuiState }) {
  const overview = state.overview;
  return (
    <Box flexDirection="column">
      <Header title="Profile overview" />
      {state.loading && <Text color="yellow">Loading overview...</Text>}
      {!state.loading && state.error && (
        <>
          <Text color="red">Error: {state.error}</Text>
          <Text dimColor>Complete setup in Config / status, then press r.</Text>
        </>
      )}
      {!state.loading && !state.error && !overview && <Text>No overview loaded. Press r to fetch the selected profile overview.</Text>}
      {!state.loading && !state.error && overview && (
        <Box flexDirection="column">
          <Text>Profile: {overview.selectedProfile.cuteName ?? "unnamed"} ({overview.selectedProfile.profileId})</Text>
          <Text>Game mode: {overview.selectedProfile.gameMode}</Text>
          <Text>Purse: {formatCoins(overview.economy.purse)}</Text>
          <Text>Bank: {formatCoins(overview.economy.bank)}</Text>
          <Text>SkyBlock level XP: {overview.progression.skyblockLevelXp ?? "unknown"}</Text>
          <Text>Skill XP keys: {overview.progression.skillExperienceKeys.length}</Text>
          <Text>Slayer bosses: {overview.progression.slayerBosses.join(", ") || "none"}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Inventory API signals</Text>
            {Object.entries(overview.inventoryApiSignals).map(([key, value]) => (
              <Text key={key}>- {key}: {boolLabel(value)}</Text>
            ))}
          </Box>
          {overview.rateLimit && (
            <Text>Rate limit: remaining={overview.rateLimit.remaining ?? "unknown"} reset={overview.rateLimit.reset ?? "unknown"}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

function DebugScreen({ state }: { state: TuiState }) {
  return (
    <Box flexDirection="column">
      <Header title="Raw API / debug launcher" />
      {state.loading && <Text color="yellow">Running request...</Text>}
      {!state.loading && state.error && <Text color="red">Error: {state.error}</Text>}
      <Text dimColor>Select an endpoint abstraction and press enter.</Text>
      <Box flexDirection="column" marginTop={1}>
        {DEBUG_ACTIONS.map((action, index) => (
          <Text key={action.endpoint} color={index === state.debugCursor ? "green" : undefined}>
            {index === state.debugCursor ? "> " : "  "}{action.label}
          </Text>
        ))}
      </Box>
      {state.debugResult && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Last result</Text>
          <Text>{compactJson(state.debugResult)}</Text>
        </Box>
      )}
    </Box>
  );
}

function ScreenFrame({ state, title, empty, isEmpty, children }: { state: TuiState; title: string; empty: string; isEmpty: boolean; children: React.ReactNode }) {
  const active = MENU[state.menuIndex].id;
  const screenError = state.error && (!state.errorScreen || state.errorScreen === active) ? state.error : null;
  return (
    <Box flexDirection="column">
      <Header title={title} />
      {state.loading && <Text color="yellow">{state.activity ?? "Loading..."}</Text>}
      {screenError && <Text color="red">Error: {screenError}</Text>}
      {!state.loading && !screenError && !isEmpty && children}
      {!state.loading && !screenError && isEmpty && <Text dimColor>{empty}</Text>}
    </Box>
  );
}

function InventoryScreen({ state }: { state: TuiState }) {
  const data = state.screenData.inventory;
  const { sections, normalized, names } = tuiInventorySummary(data);
  return (
    <ScreenFrame state={state} title="Inventory / sections" empty="No inventory loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Sections: {names.length ? names.join(", ") : "none"}</Text>
          <Text>Normalized items: {listCount(normalized)}</Text>
          {names.map((name) => (
            <Text key={name}>- {name}: {sectionStateLabel(sections[name])}</Text>
          ))}
          <Text dimColor>Raw payloads are only shown from Raw API / debug launcher.</Text>
        </Box>
      )}
    </ScreenFrame>
  );
}

function GearScreen({ state }: { state: TuiState }) {
  const data = state.screenData.gear;
  const { pets, wardrobe, current } = tuiGearSummary(data);
  return (
    <ScreenFrame state={state} title="Pets / wardrobe / gear" empty="No gear data loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Current gear pieces: {listCount(current)}</Text>
          <Text>Wardrobe items: {listCount(wardrobe)}</Text>
          <Text>Pets: {listCount(pets)}</Text>
          {current.slice(0, 6).map((item: any, index: number) => (
            <Text key={`${item?.id ?? item?.name ?? "gear"}-${index}`}>- {item?.name ?? item?.id ?? "gear item"}</Text>
          ))}
          {!current.length && <Text dimColor>No current armor/equipment items were available from the profile data.</Text>}
        </Box>
      )}
    </ScreenFrame>
  );
}

function AccessoriesScreen({ state }: { state: TuiState }) {
  const data = state.screenData.accessories;
  const summary = tuiAccessoriesSummary(data);
  return (
    <ScreenFrame state={state} title="Accessories / magical power" empty="No accessory data loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Magical Power: {summary.magicalPower}</Text>
          <Text>Owned accessories: {listCount(summary.owned)}</Text>
          <Text>Missing candidates: {listCount(summary.missing)}</Text>
          {summary.warnings.slice(0, 5).map((warning: any, index: number) => (
            <Text key={index} color="yellow">! {warning.message ?? warning.code ?? String(warning)}</Text>
          ))}
        </Box>
      )}
    </ScreenFrame>
  );
}

function NetworthScreen({ state }: { state: TuiState }) {
  const data = state.screenData.networth;
  const summary = tuiNetworthSummary(data);
  return (
    <ScreenFrame state={state} title="Networth" empty="No networth loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Total: {formatCoins(summary.total)}</Text>
          <Text>Purse: {formatCoins(summary.purse)}</Text>
          <Text>Bank: {formatCoins(summary.bank)}</Text>
          {Object.entries(summary.sections).slice(0, 8).map(([name, section]: [string, any]) => (
            <Text key={name}>- {name}: {formatCoins(section?.total ?? section?.value)}</Text>
          ))}
          {summary.warnings.slice(0, 5).map((warning: any, index: number) => (
            <Text key={index} color="yellow">! {warning.message ?? warning.code ?? String(warning)}</Text>
          ))}
        </Box>
      )}
    </ScreenFrame>
  );
}

function ProgressionScreen({ state }: { state: TuiState }) {
  const data = state.screenData.progression;
  const summary = tuiProgressionSummary(data);
  return (
    <ScreenFrame state={state} title="Progression / readiness" empty="No progression loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Weight estimate: {summary.weight?.estimate ?? summary.weight?.total ?? "unknown"}</Text>
          <Text>Readiness: {summary.readiness?.status ?? summary.readiness?.overall ?? summary.readiness?.score ?? "unknown"}</Text>
          {Object.entries(summary.sections).slice(0, 8).map(([name, section]: [string, any]) => (
            <Text key={name}>- {name}: {section?.level ?? section?.xp ?? sectionStateLabel(section)}</Text>
          ))}
          {summary.warnings.slice(0, 5).map((warning: any, index: number) => (
            <Text key={index} color="yellow">! {warning.message ?? warning.code ?? String(warning)}</Text>
          ))}
        </Box>
      )}
    </ScreenFrame>
  );
}

function ProvidersScreen({ state }: { state: TuiState }) {
  const data = state.screenData.providers;
  const summary = tuiProvidersSummary(data);
  return (
    <ScreenFrame state={state} title="Providers / server" empty="No provider status loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Gateway: {state.gateway?.status?.url ?? "not connected"}</Text>
          <Text>Gateway state: {tuiGatewayStateLabel(state.gateway, summary)}</Text>
          <Text>Server online: {summary.server?.online === null || summary.server?.online === undefined ? "unknown" : boolLabel(summary.server.online)}</Text>
          <Text>LiteLLM: {summary.llm?.configured ? `${summary.llm.provider}:${summary.llm.model}` : "not configured"}</Text>
          {summary.providers.slice(0, 6).map((provider: any) => (
            <Text key={provider.id ?? provider.source}>- {provider.id ?? provider.source}: {provider.status ?? "unknown"} [{tuiProviderFreshnessLabel(provider)}]</Text>
          ))}
          <Text>Public resources: {listCount(summary.resources)}</Text>
          {summary.resources.slice(0, 6).map((resource: any) => (
            <Text key={resource.kind ?? resource.endpoint}>- {resource.kind ?? resource.endpoint}: {tuiProviderFreshnessLabel(resource)}</Text>
          ))}
          {summary.warnings.slice(0, 5).map((warning: any, index: number) => (
            <Text key={index} color="yellow">! {warning.message ?? warning.code ?? String(warning)}</Text>
          ))}
        </Box>
      )}
    </ScreenFrame>
  );
}

function EventsScreen({ state }: { state: TuiState }) {
  const data = state.screenData.events;
  const summary = tuiEventsSummary(data);
  return (
    <ScreenFrame state={state} title="Context events" empty="No context events loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Latest sequence: {summary.latestSequence ?? "unknown"}</Text>
          {summary.events.slice(0, 8).map((event: any) => (
            <Text key={event.id ?? event.sequence}>- #{event.sequence ?? "?"} {event.type ?? "event"} from {event.source?.kind ?? "unknown"}</Text>
          ))}
          {!summary.events.length && <Text dimColor>No recent events.</Text>}
        </Box>
      )}
    </ScreenFrame>
  );
}

function ObjectivesScreen({ state }: { state: TuiState }) {
  const data = state.screenData.objectives;
  const summary = tuiObjectivesSummary(data, state.agent);
  return (
    <ScreenFrame state={state} title="Objectives" empty="No objectives loaded. Press r to refresh." isEmpty={!data}>
      {data && (
        <Box flexDirection="column">
          <Text>Open work items: {listCount(summary.objectives)}</Text>
          {summary.objectives.slice(0, 10).map((objective: any, index: number) => (
            <Text key={objective.id ?? index}>- {objective.itemKind ?? "objective"}: {objective.title ?? objective.id} [{objective.status ?? "open"}]</Text>
          ))}
          {!summary.objectives.length && <Text dimColor>No active objectives.</Text>}
        </Box>
      )}
    </ScreenFrame>
  );
}

function ActiveScreen({ state }: { state: TuiState }) {
  const active = MENU[state.menuIndex].id;
  if (active === "agent") {
    return <AgentScreen state={state} />;
  }
  if (active === "status") {
    return <StatusScreen state={state} />;
  }
  if (active === "profiles") {
    return <ProfilesScreen state={state} />;
  }
  if (active === "overview") {
    return <OverviewScreen state={state} />;
  }
  if (active === "debug") {
    return <DebugScreen state={state} />;
  }
  if (active === "inventory") return <InventoryScreen state={state} />;
  if (active === "gear") return <GearScreen state={state} />;
  if (active === "accessories") return <AccessoriesScreen state={state} />;
  if (active === "networth") return <NetworthScreen state={state} />;
  if (active === "progression") return <ProgressionScreen state={state} />;
  if (active === "providers") return <ProvidersScreen state={state} />;
  if (active === "events") return <EventsScreen state={state} />;
  return <ObjectivesScreen state={state} />;
}

export function TuiScreenPreview({ screen, state = {} }: { screen: MenuId; state?: Partial<TuiState> }) {
  const base = createState();
  const merged = {
    ...base,
    ...state,
    menuIndex: tuiScreenIndex(screen),
    screenData: { ...base.screenData, ...state.screenData },
  };
  return <ActiveScreen state={merged} />;
}

export async function connectTuiGateway() {
  const gateway = await gatewayClient();
  const configResponse = await gateway.client.config();
  const agentResponse = await gateway.client.startAgent({ cacheOnly: true, allowStale: true, sourceKind: "tui", sourceTransport: "ink" });
  return { gateway, config: configResponse.config, agent: agentResponse.agent };
}

export function SkyAgentTuiApp() {
  const { exit } = useApp();
  const [state, setState] = useState<TuiState>(() => createState());

  const patchState = useCallback((patch: Partial<TuiState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const connectGateway = useCallback(async () => {
    const session = await connectTuiGateway();
    patchState({ gateway: session.gateway, config: session.config, agent: session.agent, error: null, errorScreen: null });
    return session;
  }, [patchState]);

  const sendAgentMessage = useCallback(async () => {
    const message = state.input.trim();
    if (!message) return;
    patchState({
      loading: true,
      error: null,
      errorScreen: null,
      input: "",
      activity: "Streaming agent response...",
      transcript: startAgentTranscript(state.transcript, message),
    });
    try {
      const { gateway } = state.gateway
        ? { gateway: state.gateway }
        : await connectGateway();
      let assistant = "";
      await gateway.client.streamAgentMessage({ message }, (event) => {
        if (event.type === "activity") {
          patchState({ activity: event.message });
        }
        if (event.type === "text_delta") {
          assistant += event.text;
          setState((current) => {
            return { ...current, transcript: applyAgentTranscriptDelta(current.transcript, assistant) };
          });
        }
        if (event.type === "agent_done") {
          patchState({ agent: event.session });
        }
        if (event.type === "error") {
          patchState({ error: event.error, errorScreen: "agent" });
        }
      });
      setState((current) => {
        return { ...current, transcript: finishAgentTranscript(current.transcript, assistant), loading: false, activity: null };
      });
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "agent", loading: false, activity: null });
    }
  }, [connectGateway, patchState, state.gateway, state.input, state.transcript]);

  const runObjectiveAction = useCallback(async (action: "create" | "complete") => {
    const objectives = activeObjectiveItems(state.agent);
    const selected = objectives.length ? objectives[Math.min(state.objectiveCursor, objectives.length - 1)] : null;
    const title = state.input.trim();
    if (action === "create" && !title) {
      patchState({ error: "Type an objective title before pressing tab.", errorScreen: "agent" });
      return;
    }
    if (action === "complete" && !selected?.id) {
      patchState({ error: "No active objective selected.", errorScreen: "agent" });
      return;
    }
    patchState({ loading: true, error: null, errorScreen: null, activity: action === "create" ? "Creating objective..." : "Completing objective..." });
    try {
      const { gateway } = state.gateway
        ? { gateway: state.gateway }
        : await connectGateway();
      if (action === "create") {
        await gateway.client.agentObjectives({ action: "create", itemKind: "objective", title });
      } else {
        await gateway.client.agentObjectives({ action: "complete", id: selected.id });
      }
      const response = await gateway.client.agentStatus();
      patchState({
        agent: response.agent,
        input: action === "create" ? "" : state.input,
        objectiveCursor: objectiveCursorAction("", state.objectiveCursor, activeObjectiveItems(response.agent).length),
        loading: false,
        activity: null,
      });
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "agent", loading: false, activity: null });
    }
  }, [connectGateway, patchState, state.agent, state.gateway, state.input, state.objectiveCursor]);

  const loadProfiles = useCallback(async () => {
    patchState({ loading: true, error: null, errorScreen: null });
    try {
      const { gateway, config } = state.gateway && state.config
        ? { gateway: state.gateway, config: state.config }
        : await connectGateway();
      const guidance = setupGuidance(config);
      if (guidance) {
        patchState({ error: guidance, errorScreen: "profiles", loading: false });
        return;
      }
      const response = await gateway.client.profiles();
      const profiles = response.profiles ?? [];
      const selectedIndex = profiles.findIndex((profile) => profile.profileId === config.selectedProfileId || profile.selected);
      patchState({ profiles, profileCursor: Math.max(0, selectedIndex), loading: false });
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "profiles", loading: false });
    }
  }, [connectGateway, patchState, state.config, state.gateway]);

  const loadOverview = useCallback(async () => {
    patchState({ loading: true, error: null, errorScreen: null });
    try {
      const { gateway, config } = state.gateway && state.config
        ? { gateway: state.gateway, config: state.config }
        : await connectGateway();
      const guidance = setupGuidance(config, { needsProfile: true, needsApiKey: false });
      if (guidance) {
        patchState({ error: guidance, errorScreen: "overview", loading: false });
        return;
      }
      const response = await gateway.client.overview();
      patchState({ overview: response.overview, loading: false });
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "overview", loading: false });
    }
  }, [connectGateway, patchState, state.config, state.gateway]);

  const runDebugAction = useCallback(async () => {
    const action = DEBUG_ACTIONS[state.debugCursor];
    patchState({ loading: true, error: null, errorScreen: null, debugResult: null });
    try {
      const { gateway, config } = state.gateway && state.config
        ? { gateway: state.gateway, config: state.config }
        : await connectGateway();
      const guidance = action.endpoint === "profiles"
        ? setupGuidance(config)
        : action.endpoint === "overview"
          ? setupGuidance(config, { needsProfile: true, needsApiKey: false })
          : null;
      if (guidance) {
        patchState({ error: guidance, errorScreen: "debug", loading: false });
        return;
      }
      const response = action.endpoint === "version"
        ? await gateway.client.version()
        : action.endpoint === "config"
          ? await gateway.client.config()
          : action.endpoint === "profiles"
            ? await gateway.client.profiles()
            : await gateway.client.overview();
      patchState({
        loading: false,
        debugResult: {
          endpoint: action.endpoint,
          keys: response && typeof response === "object" ? Object.keys(response) : [],
          response,
        },
      });
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "debug", loading: false });
    }
  }, [connectGateway, patchState, state.config, state.debugCursor, state.gateway]);

  const loadSurfaceScreen = useCallback(async (screen: MenuId) => {
    patchState({ loading: true, error: null, errorScreen: null, activity: `Loading ${screen}...` });
    try {
      const { gateway, config } = state.gateway && state.config
        ? { gateway: state.gateway, config: state.config }
        : await connectGateway();
      const result = await loadTuiSurfaceScreen(gateway.client, config, screen);
      if (result.error) {
        patchState({ error: result.error, errorScreen: screen, loading: false, activity: null });
        return;
      }

      setState((current) => ({
        ...current,
        screenData: { ...current.screenData, [screen]: result.data },
        loading: false,
        activity: null,
      }));
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: screen, loading: false, activity: null });
    }
  }, [connectGateway, patchState, state.config, state.gateway]);

  const refreshActive = useCallback(async () => {
    const active = MENU[state.menuIndex].id;
    if (active === "profiles") {
      await loadProfiles();
    } else if (active === "overview") {
      await loadOverview();
    } else if (active === "agent") {
      patchState({ loading: true, error: null, errorScreen: null, activity: "Refreshing context capsule..." });
      try {
        const { gateway } = state.gateway
          ? { gateway: state.gateway }
          : await connectGateway();
        const response = await gateway.client.refreshAgentContext({ allowStale: true });
        patchState({ agent: response.agent, loading: false, activity: null });
      } catch (error) {
        patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "agent", loading: false, activity: null });
      }
    } else if (["inventory", "gear", "accessories", "networth", "progression", "providers", "events", "objectives"].includes(active)) {
      await loadSurfaceScreen(active);
    } else if (active === "status") {
      patchState({ loading: true, error: null, errorScreen: null });
      try {
        await connectGateway();
        patchState({ loading: false });
      } catch (error) {
        patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "status", loading: false });
      }
    }
  }, [connectGateway, loadOverview, loadProfiles, loadSurfaceScreen, patchState, state.menuIndex]);

  const runStatusSetup = useCallback(async () => {
    const command = tuiSetupCommand(state.input);
    if (!command.ok) {
      patchState({ error: command.error, errorScreen: "status" });
      return;
    }
    patchState({ loading: true, error: null, errorScreen: null, activity: "Writing setup config..." });
    try {
      const { gateway } = state.gateway
        ? { gateway: state.gateway }
        : await connectGateway();
      const response = await gateway.client.setConfig(command.config);
      setState((current) => ({
        ...current,
        config: response.config,
        overview: null,
        profiles: command.field === "username" || command.field === "uuid" ? [] : current.profiles,
        profileCursor: command.field === "username" || command.field === "uuid" ? 0 : current.profileCursor,
        screenData: clearProfileBoundScreenData(current.screenData),
        input: "",
        loading: false,
        activity: command.field === "apiKey" ? "API key stored." : `${command.field} stored.`,
      }));
    } catch (error) {
      patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "status", loading: false, activity: null });
    }
  }, [connectGateway, patchState, state.gateway, state.input]);

  const selectActive = useCallback(async () => {
    const active = MENU[state.menuIndex].id;
    if (active === "profiles" && state.profiles[state.profileCursor]) {
      patchState({ loading: true, error: null, errorScreen: null });
      try {
        const { gateway } = state.gateway
          ? { gateway: state.gateway }
          : await connectGateway();
        const selectedProfileId = state.profiles[state.profileCursor].profileId;
        const configResponse = await gateway.client.setConfig({ selectedProfileId });
        const overviewResponse = await gateway.client.overview();
        setState((current) => ({
          ...current,
          config: configResponse.config,
          overview: overviewResponse.overview,
          screenData: clearProfileBoundScreenData(current.screenData),
          loading: false,
          menuIndex: MENU.findIndex((item) => item.id === "overview"),
        }));
      } catch (error) {
        patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: "profiles", loading: false });
      }
    } else if (active === "status") {
      if (state.input.trim()) {
        await runStatusSetup();
      } else {
        await refreshActive();
      }
    } else if (active === "debug") {
      await runDebugAction();
    } else if (active === "agent") {
      await sendAgentMessage();
    } else {
      await refreshActive();
    }
  }, [connectGateway, patchState, refreshActive, runDebugAction, runStatusSetup, sendAgentMessage, state.gateway, state.input, state.menuIndex, state.profileCursor, state.profiles]);

  useInput((input, key) => {
    if (state.loading) {
      return;
    }
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (agentRefreshShortcut(input, key)) {
      void refreshActive();
      return;
    }
    const active = MENU[state.menuIndex].id;
    if (key.return) {
      void selectActive();
      return;
    }
    if (active === "agent" && !state.input && (input === "[" || input === "]")) {
      setState((current) => ({
        ...current,
        objectiveCursor: objectiveCursorAction(input, current.objectiveCursor, activeObjectiveItems(current.agent).length),
      }));
      return;
    }
    if (active === "agent" && (key.tab || objectiveActionLabel(input) === "create")) {
      void runObjectiveAction("create");
      return;
    }
    if (active === "agent" && !state.input && objectiveActionLabel(input) === "complete") {
      void runObjectiveAction("complete");
      return;
    }
    if (active === "agent" && (key.backspace || (key as { delete?: boolean }).delete)) {
      setState((current) => ({ ...current, input: current.input.slice(0, -1) }));
      return;
    }
    if (active === "status" && (key.backspace || (key as { delete?: boolean }).delete)) {
      setState((current) => ({ ...current, input: current.input.slice(0, -1) }));
      return;
    }
    if (active === "agent" && agentShouldAppendPrintableInput(input, state.input, key)) {
      const result = agentInputAction(input, state.input);
      if (result.action === "quit") {
        exit();
      } else {
        setState((current) => ({ ...current, input: result.input }));
      }
      return;
    }
    if (active === "status" && statusShouldAppendSetupInput(input, state.input, key)) {
      setState((current) => ({ ...current, input: `${current.input}${input}` }));
      return;
    }
    if (input === "q") {
      exit();
      return;
    }
    if ((key.leftArrow || key.rightArrow || input === "h" || input === "l") && (active === "profiles" || active === "debug")) {
      setState((current) => {
        const listActive = MENU[current.menuIndex].id;
        if (listActive === "profiles") {
          return { ...current, profileCursor: tuiListCursorAction(listActive, input, key, current.profileCursor, current.profiles.length) };
        }
        if (listActive === "debug") {
          return { ...current, debugCursor: tuiListCursorAction(listActive, input, key, current.debugCursor, DEBUG_ACTIONS.length) };
        }
        return current;
      });
      return;
    }
    if (key.upArrow || input === "k") {
      setState((current) => ({ ...current, ...tuiMenuStateNavigationAction(input, key, current) }));
    } else if (key.downArrow || input === "j") {
      setState((current) => ({ ...current, ...tuiMenuStateNavigationAction(input, key, current) }));
    }
  });

  useEffect(() => {
    const active = MENU[state.menuIndex].id;
    if (active === "status") {
      patchState({ error: null, errorScreen: null });
    }
  }, [patchState, state.menuIndex]);

  useEffect(() => {
    const active = MENU[state.menuIndex].id;
    if (shouldAutoLoadTuiSurfaceScreen(active, state)) {
      void loadSurfaceScreen(active);
    }
  }, [loadSurfaceScreen, state]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      patchState({ loading: true, error: null, errorScreen: null });
      try {
        const session = await connectTuiGateway();
        if (!cancelled) {
          patchState({ gateway: session.gateway, config: session.config, agent: session.agent, error: null, errorScreen: null, loading: false });
        }
      } catch (error) {
        if (!cancelled) {
          patchState({ error: error instanceof Error ? error.message : String(error), errorScreen: null, loading: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patchState]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <ActiveScreen state={state} />
      <Menu activeIndex={state.menuIndex} />
    </Box>
  );
}

export async function runInteractiveTui() {
  const instance = render(<SkyAgentTuiApp />);
  await instance.waitUntilExit();
}

export async function runTui(args = process.argv.slice(2)) {
  if (args.includes("--smoke") || !process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(tuiSnapshot(), null, 2)}\n`);
    return;
  }
  await runInteractiveTui();
}
