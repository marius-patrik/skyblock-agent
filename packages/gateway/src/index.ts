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
  missingAccessoriesForPlayer,
  networthForPlayer,
  nextUpgradesForPlayer,
  normalizedItemsForPlayer,
  planGoalForPlayer,
  profileSectionForPlayer,
  profileSummaries,
  progressionForPlayer,
  providerStatus,
  publicConfig,
  readContextEvents,
  readinessForPlayer,
  resourceEndpoint,
  serverStatusForPlayer,
  setConfigValue,
  subscribeContextEvents,
  skyblockProfiles,
  uuidFromNameOrUuid,
  weightForPlayer,
} from "@skyagent/core";

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
  accessoriesForPlayer: typeof accessoriesForPlayer;
  missingAccessoriesForPlayer: typeof missingAccessoriesForPlayer;
  accessoryUpgradesForPlayer: typeof accessoryUpgradesForPlayer;
  profileSectionForPlayer: typeof profileSectionForPlayer;
  progressionForPlayer: typeof progressionForPlayer;
  readinessForPlayer: typeof readinessForPlayer;
  weightForPlayer: typeof weightForPlayer;
  planGoalForPlayer: typeof planGoalForPlayer;
  nextUpgradesForPlayer: typeof nextUpgradesForPlayer;
  hypixelRequest: typeof hypixelRequest;
  resourceEndpoint: typeof resourceEndpoint;
  providerStatus: typeof providerStatus;
  agentContextForPlayer: (...args: Parameters<typeof agentContextForPlayer>) => Promise<any>;
  serverStatusForPlayer: (...args: Parameters<typeof serverStatusForPlayer>) => Promise<any>;
  readContextEvents: typeof readContextEvents;
  emitContextEvent: typeof emitContextEvent;
  emitProviderStatusEvent: typeof emitProviderStatusEvent;
  subscribeContextEvents: typeof subscribeContextEvents;
};

export type GatewayOptions = {
  token?: string;
  version?: string;
  deps?: Partial<GatewayDeps>;
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
  accessoriesForPlayer,
  missingAccessoriesForPlayer,
  accessoryUpgradesForPlayer,
  profileSectionForPlayer,
  progressionForPlayer,
  readinessForPlayer,
  weightForPlayer,
  planGoalForPlayer,
  nextUpgradesForPlayer,
  hypixelRequest,
  resourceEndpoint,
  providerStatus,
  agentContextForPlayer,
  serverStatusForPlayer,
  readContextEvents,
  emitContextEvent,
  emitProviderStatusEvent,
  subscribeContextEvents,
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

export function createGateway(options: GatewayOptions = {}) {
  const token = options.token ?? randomToken();
  const version = options.version ?? "0.1.0";
  const deps: GatewayDeps = { ...defaultDeps, ...options.deps };

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

function queryPath(route: string, values: Record<string, string | number | null | undefined>) {
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

  nextUpgrades(budget: number, player?: string, profile?: string) {
    return this.request(queryPath("/next-upgrades", { budget, player, profile }));
  }

  providerStatus() {
    return this.request("/provider-status");
  }

  resource(kind: string) {
    return this.request(queryPath("/resource", { kind }));
  }

  shutdown() {
    return this.request("/shutdown", { method: "POST" });
  }
}
