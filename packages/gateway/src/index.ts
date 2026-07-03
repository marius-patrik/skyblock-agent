import { randomBytes } from "node:crypto";
import {
  accessoriesForPlayer,
  accessoryUpgradesForPlayer,
  agentContextForPlayer,
  compactProfileOverview,
  emitContextEvent,
  emitProviderStatusEvent,
  fetchProfileContext,
  hypixelRequest,
  inventoryForPlayer,
  inventorySectionForPlayer,
  itemMetadata,
  itemNetworthForPlayer,
  llmProviderStatus,
  missingAccessoriesForPlayer,
  museumDonationPlanForPlayer,
  networthForPlayer,
  nextUpgradesForPlayer,
  normalizedItemsForPlayer,
  planGoalForPlayer,
  profileSectionForPlayer,
  profileSummaries,
  progressionForPlayer,
  publicLlmProviderConfig,
  providerStatus,
  publicConfig,
  readContextEvents,
  readinessForPlayer,
  resourceEndpoint,
  serverStatusForPlayer,
  setLlmProviderConfigValue,
  setConfigValue,
  startSkyAgentSession,
  streamLlmChat,
  subscribeContextEvents,
  skyblockProfiles,
  uuidFromNameOrUuid,
  weightForPlayer,
  listObjectiveItems,
  objectiveContextSummary,
  createObjectiveItem,
  updateObjectiveItem,
  completeObjectiveItem,
} from "@skyagent/core";
import { createAgentRuntime } from "./agent.ts";

declare const SKYAGENT_BUILD_VERSION: string | undefined;

type GatewayDeps = {
  publicConfig: typeof publicConfig;
  setConfigValue: typeof setConfigValue;
  skyblockProfiles: typeof skyblockProfiles;
  uuidFromNameOrUuid: typeof uuidFromNameOrUuid;
  fetchProfileContext: typeof fetchProfileContext;
  compactProfileOverview: typeof compactProfileOverview;
  profileSummaries: typeof profileSummaries;
  inventoryForPlayer: typeof inventoryForPlayer;
  inventorySectionForPlayer: typeof inventorySectionForPlayer;
  normalizedItemsForPlayer: typeof normalizedItemsForPlayer;
  itemMetadata: typeof itemMetadata;
  networthForPlayer: typeof networthForPlayer;
  itemNetworthForPlayer: typeof itemNetworthForPlayer;
  llmProviderStatus: typeof llmProviderStatus;
  accessoriesForPlayer: typeof accessoriesForPlayer;
  missingAccessoriesForPlayer: typeof missingAccessoriesForPlayer;
  museumDonationPlanForPlayer: typeof museumDonationPlanForPlayer;
  accessoryUpgradesForPlayer: typeof accessoryUpgradesForPlayer;
  profileSectionForPlayer: typeof profileSectionForPlayer;
  progressionForPlayer: typeof progressionForPlayer;
  readinessForPlayer: typeof readinessForPlayer;
  weightForPlayer: typeof weightForPlayer;
  planGoalForPlayer: typeof planGoalForPlayer;
  nextUpgradesForPlayer: typeof nextUpgradesForPlayer;
  hypixelRequest: typeof hypixelRequest;
  resourceEndpoint: typeof resourceEndpoint;
  publicLlmProviderConfig: typeof publicLlmProviderConfig;
  setLlmProviderConfigValue: typeof setLlmProviderConfigValue;
  providerStatus: typeof providerStatus;
  agentContextForPlayer: (...args: Parameters<typeof agentContextForPlayer>) => Promise<any>;
  serverStatusForPlayer: (...args: Parameters<typeof serverStatusForPlayer>) => Promise<any>;
  readContextEvents: typeof readContextEvents;
  emitContextEvent: typeof emitContextEvent;
  emitProviderStatusEvent: typeof emitProviderStatusEvent;
  subscribeContextEvents: typeof subscribeContextEvents;
  startSkyAgentSession: typeof startSkyAgentSession;
  streamLlmChat: typeof streamLlmChat;
  listObjectiveItems: typeof listObjectiveItems;
  objectiveContextSummary: typeof objectiveContextSummary;
  createObjectiveItem: typeof createObjectiveItem;
  updateObjectiveItem: typeof updateObjectiveItem;
  completeObjectiveItem: typeof completeObjectiveItem;
};

export type GatewayOptions = {
  token?: string;
  version?: string;
  deps?: Partial<GatewayDeps>;
  agentSessionPath?: string | null;
};

export type StartGatewayOptions = GatewayOptions & {
  host?: string;
  port?: number;
  allowShutdown?: boolean;
};

const defaultDeps: GatewayDeps = {
  publicConfig,
  setConfigValue,
  skyblockProfiles,
  uuidFromNameOrUuid,
  fetchProfileContext,
  compactProfileOverview,
  profileSummaries,
  inventoryForPlayer,
  inventorySectionForPlayer,
  normalizedItemsForPlayer,
  itemMetadata,
  networthForPlayer,
  itemNetworthForPlayer,
  llmProviderStatus,
  accessoriesForPlayer,
  missingAccessoriesForPlayer,
  museumDonationPlanForPlayer,
  accessoryUpgradesForPlayer,
  profileSectionForPlayer,
  progressionForPlayer,
  readinessForPlayer,
  weightForPlayer,
  planGoalForPlayer,
  nextUpgradesForPlayer,
  hypixelRequest,
  resourceEndpoint,
  publicLlmProviderConfig,
  setLlmProviderConfigValue,
  providerStatus,
  agentContextForPlayer,
  serverStatusForPlayer,
  readContextEvents,
  emitContextEvent,
  emitProviderStatusEvent,
  subscribeContextEvents,
  startSkyAgentSession,
  streamLlmChat,
  listObjectiveItems,
  objectiveContextSummary,
  createObjectiveItem,
  updateObjectiveItem,
  completeObjectiveItem,
};

const allowedResourceKinds = new Set(["collections", "skills", "items", "election", "bingo"]);

function json(value: unknown, init: ResponseInit = {}) {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return json({ ok: false, error: { code, message } }, { status });
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function authHeader(request: Request) {
  return request.headers.get("authorization") ?? "";
}

function isAuthorized(request: Request, token: string) {
  return authHeader(request) === `Bearer ${token}`;
}

function query(url: URL, key: string) {
  return url.searchParams.get(key) ?? undefined;
}

function numberQuery(url: URL, key: string) {
  const value = query(url, key);
  if (value === undefined) return null;
  if (!value.trim()) return Number.NaN;
  return Number(value);
}

function sseEvent(event: any) {
  return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function agentSseEvent(event: any) {
  return `event: ${event.type ?? "message"}\ndata: ${JSON.stringify(event)}\n\n`;
}

function playerProfile(url: URL) {
  return [query(url, "player"), query(url, "profile")] as const;
}

async function parseJsonBody(request: Request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function validateNonSecretProviderBaseUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    return { code: "invalid_llm_provider_base_url", message: "LLM provider base URL must be a string." };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { code: "invalid_llm_provider_base_url", message: "LLM provider base URL must be a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { code: "invalid_llm_provider_base_url", message: "LLM provider base URL must use http or https." };
  }
  if (url.username || url.password) {
    return { code: "llm_provider_secret_write_disallowed", message: "Do not include credentials in LLM provider base URLs written through the HTTP gateway." };
  }
  for (const key of url.searchParams.keys()) {
    if (/key|token|secret|auth|password/i.test(key)) {
      return { code: "llm_provider_secret_write_disallowed", message: "Do not include secret-like query parameters in LLM provider base URLs written through the HTTP gateway." };
    }
  }
  return null;
}

export function gatewayVersion(buildVersion = typeof SKYAGENT_BUILD_VERSION === "string" ? SKYAGENT_BUILD_VERSION : undefined) {
  return typeof buildVersion === "string" ? buildVersion : "2.0.0";
}

export function createGateway(options: GatewayOptions = {}) {
  const token = options.token ?? randomToken();
  const version = options.version ?? gatewayVersion();
  const deps: GatewayDeps = { ...defaultDeps, ...options.deps };
  const agent = createAgentRuntime({
    startSkyAgentSession: deps.startSkyAgentSession,
    streamLlmChat: deps.streamLlmChat,
    listObjectiveItems: deps.listObjectiveItems,
    objectiveContextSummary: deps.objectiveContextSummary,
    createObjectiveItem: deps.createObjectiveItem,
    updateObjectiveItem: deps.updateObjectiveItem,
    completeObjectiveItem: deps.completeObjectiveItem,
    sessionPath: options.agentSessionPath,
  });

  async function handle(request: Request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, service: "skyagent-gateway" });
      }

      if (!isAuthorized(request, token)) {
        return errorResponse(401, "unauthorized", "Missing or invalid gateway token.");
      }

      if (url.pathname === "/version") {
        return json({ ok: true, version, pid: process.pid });
      }

      if (url.pathname === "/config" && request.method === "GET") {
        return json({ ok: true, config: deps.publicConfig() });
      }

      if (url.pathname === "/config" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const allowed = new Set(["username", "uuid", "selectedProfileId", "apiKey"]);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) {
            return errorResponse(400, "invalid_config_key", `Unsupported config key: ${key}`);
          }
        }
        let config = deps.publicConfig();
        for (const [key, value] of Object.entries(body)) {
          config = deps.setConfigValue(key, value);
        }
        return json({ ok: true, config });
      }

      if (url.pathname === "/profiles" && request.method === "GET") {
        const player = query(url, "player");
        const uuid = await deps.uuidFromNameOrUuid(player);
        const response = await deps.skyblockProfiles(uuid);
        return json({
          ok: true,
          uuid,
          profiles: deps.profileSummaries(response.body?.profiles ?? [], uuid),
          rateLimit: response.rateLimit,
        });
      }

      if (url.pathname === "/overview" && request.method === "GET") {
        const player = query(url, "player");
        const profile = query(url, "profile");
        const overview = deps.compactProfileOverview(await deps.fetchProfileContext(player, profile));
        return json({ ok: true, overview });
      }

      if (url.pathname === "/context" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, context: await deps.agentContextForPlayer(player, profile, {
          cacheOnly: query(url, "cacheOnly") === "true" ? true : undefined,
          allowStale: query(url, "allowStale") === "true",
        }) });
      }

      if (url.pathname === "/context/refresh" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json({ ok: true, context: await deps.agentContextForPlayer(body.player, body.profile, { refresh: true }) });
      }

      if (url.pathname === "/server-status" && request.method === "GET") {
        return json({ ok: true, status: await deps.serverStatusForPlayer(query(url, "player")) });
      }

      if (url.pathname === "/context/events" && request.method === "GET") {
        return json({ ok: true, events: deps.readContextEvents({
          sinceSequence: numberQuery(url, "since") ?? 0,
          limit: numberQuery(url, "limit") ?? undefined,
          type: query(url, "type"),
        }) });
      }

      if (url.pathname === "/context/events" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json({ ok: true, event: deps.emitContextEvent({
          type: body.type ?? "gateway.context_event",
          source: body.source ?? { kind: "gateway", transport: "http" },
          player: body.player,
          profile: body.profile,
          payload: body.payload ?? {},
          freshness: { status: "local", source: "gateway" },
        }) });
      }

      if (url.pathname === "/context/stream" && request.method === "GET") {
        const encoder = new TextEncoder();
        const sinceSequence = numberQuery(url, "since") ?? 0;
        const limit = numberQuery(url, "limit") ?? 50;
        let unsubscribe = () => {};
        const stream = new ReadableStream({
          start(controller) {
            const batch = deps.readContextEvents({ sinceSequence, limit });
            for (const event of batch.events) {
              controller.enqueue(encoder.encode(sseEvent(event)));
            }
            unsubscribe = deps.subscribeContextEvents((event) => {
              controller.enqueue(encoder.encode(sseEvent(event)));
            });
          },
          cancel() {
            unsubscribe();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      if (url.pathname === "/inventory" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, inventory: await deps.inventoryForPlayer(player, profile, { debugRaw: query(url, "debugRaw") === "true" }) });
      }

      if (url.pathname === "/inventory-section" && request.method === "GET") {
        const section = query(url, "section");
        if (!section) return errorResponse(400, "missing_section", "Query parameter section is required.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, inventorySection: await deps.inventorySectionForPlayer(section, player, profile, { debugRaw: query(url, "debugRaw") === "true" }) });
      }

      if (url.pathname === "/items/normalized" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, items: await deps.normalizedItemsForPlayer(player, profile) });
      }

      if (url.pathname === "/items/metadata" && request.method === "GET") {
        const id = query(url, "id");
        if (!id) return errorResponse(400, "missing_item_id", "Query parameter id is required.");
        return json({ ok: true, item: await deps.itemMetadata(id) });
      }

      if (url.pathname === "/networth" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, networth: await deps.networthForPlayer(player, profile) });
      }

      if (url.pathname === "/item-networth" && request.method === "GET") {
        const section = query(url, "section");
        if (!section) return errorResponse(400, "missing_section", "Query parameter section is required.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, itemNetworth: await deps.itemNetworthForPlayer(player, profile, section) });
      }

      if (url.pathname === "/accessories" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, accessories: await deps.accessoriesForPlayer(player, profile) });
      }

      if (url.pathname === "/accessories/missing" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, missingAccessories: await deps.missingAccessoriesForPlayer(player, profile) });
      }

      if (url.pathname === "/accessories/upgrades" && request.method === "GET") {
        const budget = numberQuery(url, "budget");
        if (budget === null || !Number.isFinite(budget) || budget < 0) return errorResponse(400, "invalid_budget", "Query parameter budget must be a non-negative number.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, upgrades: await deps.accessoryUpgradesForPlayer(player, profile, budget) });
      }

      if (url.pathname === "/section" && request.method === "GET") {
        const name = query(url, "name");
        if (!name) return errorResponse(400, "missing_section_name", "Query parameter name is required.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, section: await deps.profileSectionForPlayer(name, player, profile) });
      }

      if (url.pathname === "/progression" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, progression: await deps.progressionForPlayer(player, profile) });
      }

      if (url.pathname === "/readiness" && request.method === "GET") {
        const area = query(url, "area");
        if (!area) return errorResponse(400, "missing_readiness_area", "Query parameter area is required.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, readiness: await deps.readinessForPlayer(area, player, profile) });
      }

      if (url.pathname === "/weight" && request.method === "GET") {
        const [player, profile] = playerProfile(url);
        return json({ ok: true, weight: await deps.weightForPlayer(player, profile) });
      }

      if (url.pathname === "/plan" && request.method === "GET") {
        const goal = query(url, "goal");
        if (!goal) return errorResponse(400, "missing_goal", "Query parameter goal is required.");
        const budget = numberQuery(url, "budget");
        if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return errorResponse(400, "invalid_budget", "Query parameter budget must be a non-negative number.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, plan: await deps.planGoalForPlayer(goal, player, profile, { budget }) });
      }

      if (url.pathname === "/museum/plan" && request.method === "GET") {
        const goal = query(url, "goal");
        if (!goal) return errorResponse(400, "missing_goal", "Query parameter goal is required.");
        if (query(url, "persistObjectives") !== undefined) {
          return errorResponse(405, "persist_requires_post", "Use POST /museum/plan to persist Museum objectives.");
        }
        const budget = numberQuery(url, "budget");
        if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return errorResponse(400, "invalid_budget", "Query parameter budget must be a non-negative number.");
        const maxPriceLookups = numberQuery(url, "maxPriceLookups");
        const timeoutMs = numberQuery(url, "timeoutMs");
        if (maxPriceLookups !== null && (!Number.isFinite(maxPriceLookups) || maxPriceLookups < 0)) {
          return errorResponse(400, "invalid_max_price_lookups", "Query parameter maxPriceLookups must be a non-negative number.");
        }
        if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs < 1)) {
          return errorResponse(400, "invalid_timeout_ms", "Query parameter timeoutMs must be a positive number.");
        }
        if (maxPriceLookups !== null && !Number.isInteger(maxPriceLookups)) {
          return errorResponse(400, "invalid_max_price_lookups", "Query parameter maxPriceLookups must be an integer.");
        }
        if (timeoutMs !== null && !Number.isInteger(timeoutMs)) {
          return errorResponse(400, "invalid_timeout_ms", "Query parameter timeoutMs must be an integer.");
        }
        const [player, profile] = playerProfile(url);
        return json({ ok: true, museumPlan: await deps.museumDonationPlanForPlayer(goal, player, profile, {
          budget,
          maxPriceLookups: maxPriceLookups ?? undefined,
          timeoutMs: timeoutMs ?? undefined,
          persistObjectives: false,
        }) });
      }

      if (url.pathname === "/museum/plan" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const goal = body.goal ?? query(url, "goal");
        if (!goal) return errorResponse(400, "missing_goal", "Field goal is required.");
        const budget = body.budget ?? numberQuery(url, "budget");
        if (budget !== null && budget !== undefined && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
          return errorResponse(400, "invalid_budget", "Field budget must be a non-negative number.");
        }
        const maxPriceLookups = body.maxPriceLookups ?? numberQuery(url, "maxPriceLookups");
        const timeoutMs = body.timeoutMs ?? numberQuery(url, "timeoutMs");
        if (maxPriceLookups !== null && maxPriceLookups !== undefined && (!Number.isFinite(Number(maxPriceLookups)) || Number(maxPriceLookups) < 0 || !Number.isInteger(Number(maxPriceLookups)))) {
          return errorResponse(400, "invalid_max_price_lookups", "Field maxPriceLookups must be a non-negative integer.");
        }
        if (timeoutMs !== null && timeoutMs !== undefined && (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) < 1 || !Number.isInteger(Number(timeoutMs)))) {
          return errorResponse(400, "invalid_timeout_ms", "Field timeoutMs must be a positive integer.");
        }
        if (body.persistObjectives !== true) {
          return errorResponse(400, "persist_required", "POST /museum/plan requires persistObjectives=true.");
        }
        return json({ ok: true, museumPlan: await deps.museumDonationPlanForPlayer(goal, body.player ?? query(url, "player"), body.profile ?? query(url, "profile"), {
          budget: budget === null || budget === undefined ? null : Number(budget),
          maxPriceLookups: maxPriceLookups === null || maxPriceLookups === undefined ? undefined : Number(maxPriceLookups),
          timeoutMs: timeoutMs === null || timeoutMs === undefined ? undefined : Number(timeoutMs),
          persistObjectives: true,
        }) });
      }

      if (url.pathname === "/next-upgrades" && request.method === "GET") {
        const budget = numberQuery(url, "budget");
        if (budget === null || !Number.isFinite(budget) || budget < 0) return errorResponse(400, "invalid_budget", "Query parameter budget must be a non-negative number.");
        const [player, profile] = playerProfile(url);
        return json({ ok: true, upgrades: await deps.nextUpgradesForPlayer(player, profile, budget) });
      }

      if (url.pathname === "/provider-status" && request.method === "GET") {
        const providers = deps.providerStatus();
        deps.emitProviderStatusEvent(providers);
        return json({ ok: true, providers });
      }

      if (url.pathname === "/llm-provider/status" && request.method === "GET") {
        return json({ ok: true, provider: await deps.llmProviderStatus() });
      }

      if (url.pathname === "/llm-provider/config" && request.method === "GET") {
        return json({ ok: true, config: deps.publicLlmProviderConfig() });
      }

      if (url.pathname === "/llm-provider/config" && request.method === "POST") {
        const body = await parseJsonBody(request);
        const secretKeys = new Set(["api-key", "apiKey"]);
        const allowed = new Set(["provider", "base-url", "baseUrl", "model", "timeout-ms", "timeoutMs", "max-retries", "maxRetries", "rate-limit-rpm", "rate-limit-tpm", "budget-usd", "budget-window"]);
        for (const key of Object.keys(body)) {
          if (secretKeys.has(key)) {
            return errorResponse(400, "llm_provider_secret_write_disallowed", "Set LLM provider API keys through environment variables, CLI, or MCP; the HTTP gateway does not persist provider secrets.");
          }
          if (!allowed.has(key)) {
            return errorResponse(400, "invalid_llm_provider_config_key", `Unsupported LLM provider config key: ${key}`);
          }
          if (key === "base-url" || key === "baseUrl") {
            const invalidBaseUrl = validateNonSecretProviderBaseUrl(body[key]);
            if (invalidBaseUrl) {
              return errorResponse(400, invalidBaseUrl.code, invalidBaseUrl.message);
            }
          }
        }
        let config = deps.publicLlmProviderConfig();
        for (const [key, value] of Object.entries(body)) {
          config = deps.setLlmProviderConfigValue(key, value);
        }
        return json({ ok: true, config });
      }

      if (url.pathname === "/agent/start" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json({ ok: true, agent: await agent.start(body) });
      }

      if (url.pathname === "/agent/status" && request.method === "GET") {
        return json({ ok: true, agent: agent.history() });
      }

      if (url.pathname === "/agent/stop" && request.method === "POST") {
        return json({ ok: true, agent: agent.stop() });
      }

      if (url.pathname === "/agent/history" && request.method === "GET") {
        return json({ ok: true, agent: agent.history() });
      }

      if (url.pathname === "/agent/context/refresh" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json({ ok: true, agent: await agent.refreshContext(body) });
      }

      if (url.pathname === "/agent/objectives" && request.method === "GET") {
        return json({ ok: true, objectives: agent.objectives("list", {
          kind: query(url, "kind"),
          status: query(url, "status"),
          includeDeleted: query(url, "includeDeleted") === "true",
        }) });
      }

      if (url.pathname === "/agent/objectives" && request.method === "POST") {
        const body = await parseJsonBody(request);
        return json({ ok: true, objective: agent.objectives(body.action ?? "create", body) });
      }

      if (url.pathname === "/agent/message" && request.method === "POST") {
        const body = await parseJsonBody(request);
        if (body.stream === false) {
          const events = [];
          let text = "";
          for await (const event of agent.message(body)) {
            events.push(event);
            if (event.type === "text_delta") text += (event as any).text;
            if (event.type === "agent_done" && (event as any).message?.content) text = (event as any).message.content;
          }
          return json({ ok: true, text, events, agent: agent.history() });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of agent.message(body)) {
                controller.enqueue(encoder.encode(agentSseEvent(event)));
              }
            } catch (error) {
              controller.enqueue(encoder.encode(agentSseEvent({
                type: "error",
                error: error instanceof Error ? error.message : String(error),
              })));
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      if (url.pathname === "/resource" && request.method === "GET") {
        const kind = query(url, "kind");
        if (!kind) return errorResponse(400, "missing_resource_kind", "Query parameter kind is required.");
        if (!allowedResourceKinds.has(kind)) return errorResponse(400, "invalid_resource_kind", `Unsupported resource kind: ${kind}`);
        return json({ ok: true, resource: await deps.hypixelRequest(deps.resourceEndpoint(kind)) });
      }

      return errorResponse(404, "not_found", `Unknown gateway route: ${url.pathname}`);
    } catch (error) {
      return errorResponse(500, "gateway_error", error instanceof Error ? error.message : String(error));
    }
  }

  return {
    token,
    version,
    handle,
  };
}

export function startGateway(options: StartGatewayOptions = {}) {
  const gateway = createGateway(options);
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new Error("SkyAgent gateway only supports local loopback binds on 127.0.0.1.");
  }
  let server: ReturnType<typeof Bun.serve>;
  server = Bun.serve({
    hostname: host,
    port: options.port ?? 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (options.allowShutdown && url.pathname === "/shutdown" && request.method === "POST") {
        if (!isAuthorized(request, gateway.token)) {
          return errorResponse(401, "unauthorized", "Missing or invalid gateway token.");
        }
        setTimeout(() => server.stop(true), 0);
        return json({ ok: true, shuttingDown: true });
      }
      return gateway.handle(request);
    },
  });

  return {
    gateway,
    server,
    status: {
      host,
      port: server.port,
      url: `http://${host}:${server.port}`,
      tokenConfigured: Boolean(gateway.token),
      version: gateway.version,
    },
    stop() {
      server.stop(true);
    },
  };
}

function queryPath(route: string, values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return `${route}${params.size ? `?${params}` : ""}`;
}

export class GatewayClient {
  baseUrl: string;
  token: string;

  constructor({ baseUrl, token }: { baseUrl: string; token: string }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(body?.error?.message ?? `Gateway request failed: HTTP ${response.status}`), { response, body });
    }
    return body;
  }

  health() {
    return fetch(`${this.baseUrl}/health`).then((response) => response.json());
  }

  version() {
    return this.request("/version");
  }

  config() {
    return this.request("/config");
  }

  setConfig(config: Record<string, unknown>) {
    return this.request("/config", {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  profiles(player?: string) {
    const suffix = player ? `?player=${encodeURIComponent(player)}` : "";
    return this.request(`/profiles${suffix}`);
  }

  overview(player?: string, profile?: string) {
    return this.request(queryPath("/overview", { player, profile }));
  }

  context(player?: string, profile?: string) {
    return this.request(queryPath("/context", { player, profile }));
  }

  refreshContext(player?: string, profile?: string) {
    return this.request("/context/refresh", {
      method: "POST",
      body: JSON.stringify({ player, profile }),
    });
  }

  serverStatus(player?: string) {
    return this.request(queryPath("/server-status", { player }));
  }

  contextEvents(options: { since?: number; limit?: number; type?: string } = {}) {
    return this.request(queryPath("/context/events", options));
  }

  emitContextEvent(event: Record<string, unknown>) {
    return this.request("/context/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  inventory(player?: string, profile?: string) {
    return this.request(queryPath("/inventory", { player, profile }));
  }

  inventorySection(section: string, player?: string, profile?: string) {
    return this.request(queryPath("/inventory-section", { section, player, profile }));
  }

  normalizedItems(player?: string, profile?: string) {
    return this.request(queryPath("/items/normalized", { player, profile }));
  }

  itemMetadata(id: string) {
    return this.request(queryPath("/items/metadata", { id }));
  }

  networth(player?: string, profile?: string) {
    return this.request(queryPath("/networth", { player, profile }));
  }

  itemNetworth(section: string, player?: string, profile?: string) {
    return this.request(queryPath("/item-networth", { section, player, profile }));
  }

  accessories(player?: string, profile?: string) {
    return this.request(queryPath("/accessories", { player, profile }));
  }

  missingAccessories(player?: string, profile?: string) {
    return this.request(queryPath("/accessories/missing", { player, profile }));
  }

  accessoryUpgrades(budget: number, player?: string, profile?: string) {
    return this.request(queryPath("/accessories/upgrades", { budget, player, profile }));
  }

  section(name: string, player?: string, profile?: string) {
    return this.request(queryPath("/section", { name, player, profile }));
  }

  progression(player?: string, profile?: string) {
    return this.request(queryPath("/progression", { player, profile }));
  }

  readiness(area: string, player?: string, profile?: string) {
    return this.request(queryPath("/readiness", { area, player, profile }));
  }

  weight(player?: string, profile?: string) {
    return this.request(queryPath("/weight", { player, profile }));
  }

  plan(goal: string, player?: string, profile?: string, budget?: number | null) {
    return this.request(queryPath("/plan", { goal, player, profile, budget }));
  }

  museumPlan(goal: string, player?: string, profile?: string, budget?: number | null, maxPriceLookups?: number | null, timeoutMs?: number | null, persistObjectives?: boolean | null) {
    if (persistObjectives) {
      return this.request("/museum/plan", {
        method: "POST",
        body: JSON.stringify({ goal, player, profile, budget, maxPriceLookups, timeoutMs, persistObjectives: true }),
      });
    }
    return this.request(queryPath("/museum/plan", { goal, player, profile, budget, maxPriceLookups, timeoutMs }));
  }

  nextUpgrades(budget: number, player?: string, profile?: string) {
    return this.request(queryPath("/next-upgrades", { budget, player, profile }));
  }

  providerStatus() {
    return this.request("/provider-status");
  }

  llmProviderStatus() {
    return this.request("/llm-provider/status");
  }

  llmProviderConfig() {
    return this.request("/llm-provider/config");
  }

  setLlmProviderConfig(config: Record<string, unknown>) {
    return this.request("/llm-provider/config", {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  startAgent(input: Record<string, unknown> = {}) {
    return this.request("/agent/start", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  agentStatus() {
    return this.request("/agent/status");
  }

  stopAgent() {
    return this.request("/agent/stop", { method: "POST" });
  }

  agentHistory() {
    return this.request("/agent/history");
  }

  refreshAgentContext(input: Record<string, unknown> = {}) {
    return this.request("/agent/context/refresh", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  agentObjectives(input: Record<string, unknown> = {}) {
    const method = input.action ? "POST" : "GET";
    if (method === "GET") {
      return this.request(queryPath("/agent/objectives", input as Record<string, string | number | null | undefined>));
    }
    return this.request("/agent/objectives", {
      method,
      body: JSON.stringify(input),
    });
  }

  messageAgent(input: Record<string, unknown>) {
    return this.request("/agent/message", {
      method: "POST",
      body: JSON.stringify({ ...input, stream: false }),
    });
  }

  async streamAgentMessage(input: Record<string, unknown>, onEvent: (event: any) => void) {
    const response = await fetch(`${this.baseUrl}/agent/message`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...input, stream: true }),
    });
    if (!response.ok) {
      const body = await response.json();
      throw Object.assign(new Error(body?.error?.message ?? `Gateway request failed: HTTP ${response.status}`), { response, body });
    }
    if (!response.body) {
      throw new Error("Gateway response did not include an agent stream.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(boundary + (match?.[0].length ?? 2));
        for (const line of block.split(/\r?\n/).filter((entry) => entry.startsWith("data:"))) {
          onEvent(JSON.parse(line.slice("data:".length).trim()));
        }
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/).filter((entry) => entry.startsWith("data:"))) {
        onEvent(JSON.parse(line.slice("data:".length).trim()));
      }
    }
  }

  resource(kind: string) {
    return this.request(queryPath("/resource", { kind }));
  }

  shutdown() {
    return this.request("/shutdown", { method: "POST" });
  }
}
