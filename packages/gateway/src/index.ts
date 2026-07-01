import { randomBytes } from "node:crypto";
import { compactProfileOverview, fetchProfileContext, profileSummaries, publicConfig, setConfigValue, skyblockProfiles, uuidFromNameOrUuid } from "@skyagent/core";

type GatewayDeps = {
  publicConfig: typeof publicConfig;
  setConfigValue: typeof setConfigValue;
  skyblockProfiles: typeof skyblockProfiles;
  uuidFromNameOrUuid: typeof uuidFromNameOrUuid;
  fetchProfileContext: typeof fetchProfileContext;
  compactProfileOverview: typeof compactProfileOverview;
  profileSummaries: typeof profileSummaries;
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
};

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
    const params = new URLSearchParams();
    if (player) {
      params.set("player", player);
    }
    if (profile) {
      params.set("profile", profile);
    }
    const suffix = params.size ? `?${params}` : "";
    return this.request(`/overview${suffix}`);
  }

  shutdown() {
    return this.request("/shutdown", { method: "POST" });
  }
}
