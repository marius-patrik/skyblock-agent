import { expect, test } from "bun:test";
import { createGateway, GatewayClient, startGateway } from "../src/index.ts";
import path from "node:path";

function request(path: string, token?: string, init: RequestInit = {}) {
  return new Request(`http://127.0.0.1${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

test("health is public and version requires gateway token", async () => {
  const gateway = createGateway({ token: "test-token", version: "1.2.3" });

  expect(await gateway.handle(request("/health")).then((response) => response.json())).toEqual({
    ok: true,
    service: "skyagent-gateway",
  });

  const unauthorized = await gateway.handle(request("/version"));
  expect(unauthorized.status).toBe(401);

  const version = await gateway.handle(request("/version", "test-token")).then((response) => response.json());
  expect(version).toEqual({ ok: true, version: "1.2.3", pid: process.pid });
});

test("config routes redact secrets and reject unknown keys", async () => {
  const values: Record<string, unknown> = {};
  const gateway = createGateway({
    token: "test-token",
    deps: {
      publicConfig: () => ({
        username: values.username ?? null,
        uuid: null,
        selectedProfileId: null,
        apiKeyConfigured: Boolean(values.apiKey),
        apiKeySource: values.apiKey ? "config" : null,
        dataDir: "/tmp/skyagent-test",
      }),
      setConfigValue: (key, value) => {
        values[key] = value;
        return {
          username: values.username ?? null,
          uuid: null,
          selectedProfileId: null,
          apiKeyConfigured: Boolean(values.apiKey),
          apiKeySource: values.apiKey ? "config" : null,
          dataDir: "/tmp/skyagent-test",
        };
      },
    },
  });

  const updated = await gateway.handle(request("/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ username: "Notch", apiKey: "secret-key" }),
  })).then((response) => response.json());

  expect(updated.config.username).toBe("Notch");
  expect(updated.config.apiKeyConfigured).toBe(true);
  expect(JSON.stringify(updated)).not.toContain("secret-key");

  const invalid = await gateway.handle(request("/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ username: "Steve", unknown: "value" }),
  }));
  expect(invalid.status).toBe(400);
  expect(values.username).toBe("Notch");
});

test("profiles and overview routes use injected core contracts", async () => {
  const gateway = createGateway({
    token: "test-token",
    deps: {
      uuidFromNameOrUuid: async () => "uuid-1",
      skyblockProfiles: async () => ({
        ok: true,
        status: 200,
        url: "https://api.hypixel.net/v2/skyblock/profiles",
        body: {
          profiles: [{
            profile_id: "profile-1",
            cute_name: "Apple",
            selected: true,
            members: { "uuid-1": { currencies: { coin_purse: 12 } } },
          }],
        },
        rateLimit: { limit: "120", remaining: "100", reset: "1" },
      }),
      profileSummaries: (profiles, uuid) => profiles.map((profile) => ({
        profileId: profile.profile_id,
        cuteName: profile.cute_name,
        selected: Boolean(profile.selected),
        gameMode: profile.game_mode ?? "normal",
        memberPresent: Boolean(profile.members?.[uuid]),
        lastSave: null,
        purse: null,
        bank: null,
        skyblockLevelXp: null,
      })),
      fetchProfileContext: async () => ({
        uuid: "uuid-1",
        profile: {},
        member: {},
        profiles: [],
        rateLimit: { limit: "120", remaining: "100", reset: "1" },
      }),
      compactProfileOverview: (context) => ({
        uuid: context.uuid,
        selectedProfile: { profileId: "profile-1", cuteName: "Apple", selected: true, gameMode: "normal" },
        profiles: [],
        economy: { purse: null, bank: null },
        progression: {
          skyblockLevelXp: null,
          skillExperienceKeys: [],
          slayerBosses: [],
          dungeonTypes: [],
          dungeonClasses: [],
          collections: [],
          craftedGenerators: null,
          unlockedCollections: null,
        },
        inventoryApiSignals: {
          hasInventoryBag: false,
          hasEnderChest: false,
          hasArmor: false,
          hasWardrobe: false,
          hasAccessoryBag: false,
        },
        rateLimit: context.rateLimit,
      }),
    },
  });

  const profiles = await gateway.handle(request("/profiles?player=Notch", "test-token")).then((response) => response.json());
  expect(profiles.uuid).toBe("uuid-1");
  expect(profiles.profiles[0].cuteName).toBe("Apple");

  const overview = await gateway.handle(request("/overview?player=Notch&profile=Apple", "test-token")).then((response) => response.json());
  expect(overview.overview.selectedProfile.profileId).toBe("profile-1");
});

test("started gateway serves client requests on localhost", async () => {
  const service = startGateway({ token: "test-token", port: 0, version: "1.2.3" });
  try {
    const client = new GatewayClient({ baseUrl: service.status.url, token: "test-token" });
    expect(await client.health()).toEqual({ ok: true, service: "skyagent-gateway" });
    expect(await client.version()).toEqual({ ok: true, version: "1.2.3", pid: process.pid });
    await expect(client.shutdown()).rejects.toThrow("Unknown gateway route: /shutdown");
  } finally {
    service.stop();
  }
});

test("started gateway shuts down through authenticated local endpoint when explicitly enabled", async () => {
  const service = startGateway({ token: "test-token", port: 0, version: "1.2.3", allowShutdown: true });
  const client = new GatewayClient({ baseUrl: service.status.url, token: "test-token" });

  expect(await client.shutdown()).toEqual({ ok: true, shuttingDown: true });
});

test("gateway bin requires explicit token for standalone starts", async () => {
  const proc = Bun.spawn(["bun", "./packages/gateway/src/bin.ts"], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(1);
  expect(stderr).toContain("requires --token");
});
