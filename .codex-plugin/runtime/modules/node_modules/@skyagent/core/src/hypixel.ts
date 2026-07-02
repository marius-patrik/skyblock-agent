import { getApiKey, readConfig } from "./store.ts";

const HYPIXEL_BASE_URL = "https://api.hypixel.net/v2";
const MOJANG_PROFILE_URL = "https://api.mojang.com/users/profiles/minecraft";

const RESOURCE_PATHS = new Set([
  "collections",
  "skills",
  "items",
  "election",
  "bingo",
]);

export function dashedUuid(uuid) {
  const clean = String(uuid).replace(/-/g, "");
  if (clean.length !== 32) {
    return String(uuid);
  }
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

export async function resolveMinecraftUsername(username) {
  const response = await fetch(`${MOJANG_PROFILE_URL}/${encodeURIComponent(username)}`);
  if (response.status === 204 || response.status === 404) {
    throw new Error(`Minecraft username not found: ${username}`);
  }
  if (!response.ok) {
    throw new Error(`Mojang lookup failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  return {
    username: body.name,
    uuid: body.id,
    dashedUuid: dashedUuid(body.id),
  };
}

export async function uuidFromNameOrUuid(value) {
  if (!value) {
    const config = readConfig();
    if (config.uuid) {
      return config.uuid;
    }
    if (config.username) {
      return (await resolveMinecraftUsername(config.username)).uuid;
    }
    throw new Error("No username or UUID provided, and no configured username/uuid exists.");
  }

  const raw = String(value).trim();
  if (/^[0-9a-fA-F-]{32,36}$/.test(raw)) {
    return raw.replace(/-/g, "");
  }
  return (await resolveMinecraftUsername(raw)).uuid;
}

export function normalizePath(input) {
  let endpoint = String(input || "").trim();
  endpoint = endpoint.replace(/^https:\/\/api\.hypixel\.net\/v2\/?/, "");
  endpoint = endpoint.replace(/^\/?v2\/?/, "");
  endpoint = endpoint.replace(/^\/+/, "");
  if (!endpoint) {
    throw new Error("Endpoint path is required.");
  }
  return endpoint;
}

export async function hypixelRequest(endpoint: string, query: Record<string, unknown> = {}, options: { requireKey?: boolean; apiKey?: string } = {}) {
  const config = readConfig();
  const path = normalizePath(endpoint);
  const url = new URL(`${HYPIXEL_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "User-Agent": "skyagent/0.1.0",
  };
  const apiKey = options.apiKey || getApiKey(config);
  if (apiKey) {
    headers["API-Key"] = apiKey;
  } else if (options.requireKey) {
    throw new Error("Hypixel API key is required. Set HYPIXEL_API_KEY or run `skyagent config set api-key <key>`.");
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  const result = {
    ok: response.ok,
    status: response.status,
    url: url.toString(),
    rateLimit: {
      limit: response.headers.get("ratelimit-limit"),
      remaining: response.headers.get("ratelimit-remaining"),
      reset: response.headers.get("ratelimit-reset"),
    },
    body,
  };

  if (!response.ok) {
    const detail = body?.cause || body?.error || response.statusText;
    throw Object.assign(new Error(`Hypixel request failed: HTTP ${response.status} ${detail}`), { result });
  }

  return result;
}

export function resourceEndpoint(name) {
  const resource = String(name || "").toLowerCase();
  if (!RESOURCE_PATHS.has(resource)) {
    throw new Error(`Unknown SkyBlock resource: ${name}`);
  }
  return `resources/skyblock/${resource}`;
}

export async function skyblockProfiles(player) {
  const uuid = await uuidFromNameOrUuid(player);
  return hypixelRequest("skyblock/profiles", { uuid }, { requireKey: true });
}

export async function configuredProfileId(explicitProfileId) {
  if (explicitProfileId) {
    return explicitProfileId;
  }
  const config = readConfig();
  if (config.selectedProfileId) {
    return config.selectedProfileId;
  }
  throw new Error("Profile ID is required. Pass one explicitly or run `skyagent config set profile <profileId>`.");
}
