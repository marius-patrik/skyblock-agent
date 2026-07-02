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
          hasPets: false,
        },
        rateLimit: context.rateLimit,
      }),
      agentContextForPlayer: async (player, profile, options) => ({ player, profile, refresh: Boolean(options?.refresh), kind: "skyagent.agentContext" }),
    },
  });

  const profiles = await gateway.handle(request("/profiles?player=Notch", "test-token")).then((response) => response.json());
  expect(profiles.uuid).toBe("uuid-1");
  expect(profiles.profiles[0].cuteName).toBe("Apple");

  const overview = await gateway.handle(request("/overview?player=Notch&profile=Apple", "test-token")).then((response) => response.json());
  expect(overview.overview.selectedProfile.profileId).toBe("profile-1");

  const context = await gateway.handle(request("/context?player=Notch&profile=Apple", "test-token")).then((response) => response.json());
  expect(context.context).toMatchObject({ player: "Notch", profile: "Apple", kind: "skyagent.agentContext" });

  const refreshed = await gateway.handle(request("/context/refresh", "test-token", {
    method: "POST",
    body: JSON.stringify({ player: "Notch", profile: "Apple" }),
  })).then((response) => response.json());
  expect(refreshed.context).toMatchObject({ player: "Notch", profile: "Apple", refresh: true });
});

test("server status and context event routes expose JSON and SSE contracts", async () => {
  const events: any[] = [];
  const listeners = new Set<(event: any) => void>();
  const emit: any = (input) => {
    const event = {
      kind: "skyagent.contextEvent",
      schemaVersion: 1,
      id: `event-${events.length + 1}`,
      sequence: events.length + 1,
      type: input.type,
      source: { kind: "gateway", id: null, transport: "http" },
      timestamp: new Date(1_000 + events.length).toISOString(),
      player: input.player ?? null,
      profile: input.profile ?? null,
      payload: input.payload ?? {},
      freshness: { status: "local", fetchedAt: new Date(1_000 + events.length).toISOString(), source: "gateway", rateLimit: null, warnings: [] },
      provenance: {
        producer: "skyagent",
        version: "context-event-v1",
        provider: null,
        futureProducer: { kind: "minecraft-mod-telemetry", status: "reserved", expectedFields: ["objectiveProgress"] },
      },
    };
    events.push(event);
    for (const listener of listeners) listener(event);
    return event;
  };
  const gateway = createGateway({
    token: "test-token",
    deps: {
      serverStatusForPlayer: async (player) => ({
        kind: "skyagent.serverStatus",
        player: { input: player, uuid: "uuid-1" },
        api: { available: true, status: 200 },
        online: true,
        session: { gameType: "SKYBLOCK", mode: "dynamic", map: "Private Island" },
        warnings: [],
      }),
      emitContextEvent: emit,
      readContextEvents: ({ sinceSequence = 0, limit = 50 } = {}) => ({
        kind: "skyagent.contextEventBatch",
        schemaVersion: 1,
        generatedAt: new Date(2_000).toISOString(),
        sinceSequence: Number(sinceSequence),
        events: events.filter((event) => event.sequence > Number(sinceSequence)).slice(-Number(limit)),
        latestSequence: events.at(-1)?.sequence ?? 0,
        limit: Number(limit),
      }),
      subscribeContextEvents: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  });

  const status = await gateway.handle(request("/server-status?player=Notch", "test-token")).then((response) => response.json());
  expect(status.status).toMatchObject({ online: true, session: { gameType: "SKYBLOCK" } });

  const emitted = await gateway.handle(request("/context/events", "test-token", {
    method: "POST",
    body: JSON.stringify({ type: "gateway.test", payload: { ok: true } }),
  })).then((response) => response.json());
  expect(emitted.event).toMatchObject({ sequence: 1, type: "gateway.test" });

  const batch = await gateway.handle(request("/context/events?since=0&limit=5", "test-token")).then((response) => response.json());
  expect(batch.events.events).toContainEqual(expect.objectContaining({ type: "gateway.test" }));

  const streamResponse = await gateway.handle(request("/context/stream?since=0&limit=1", "test-token"));
  expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
  const reader = streamResponse.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  expect(new TextDecoder().decode(first.value)).toContain("event: gateway.test");
});

test("analysis routes mirror core contracts and preserve warnings", async () => {
  const warnings = ["inventory_api_disabled"];
  const gateway = createGateway({
    token: "test-token",
    deps: ({
      inventoryForPlayer: async (player, profile) => ({ player, profile, warnings, sections: [] }),
      inventorySectionForPlayer: async (section, player, profile) => ({ section, player, profile, warnings, items: [] }),
      normalizedItemsForPlayer: async () => ({ items: [{ id: "ASPECT_OF_THE_END" }], warnings }),
      itemMetadata: async (id) => ({ id, name: "Aspect of the End", warnings }),
      networthForPlayer: async () => ({ total: 12, warnings }),
      itemNetworthForPlayer: async (_player, _profile, section) => ({ section, total: 3, warnings }),
      accessoriesForPlayer: async () => ({ magicalPower: 10, warnings }),
      missingAccessoriesForPlayer: async () => ({ missing: [], warnings }),
      accessoryUpgradesForPlayer: async (_player, _profile, budget) => ({ budget, upgrades: [], warnings }),
      profileSectionForPlayer: async (name) => ({ name, warnings }),
      progressionForPlayer: async () => ({ skills: [], warnings }),
      readinessForPlayer: async (area) => ({ area, status: "unknown", warnings }),
      weightForPlayer: async () => ({ estimate: null, warnings }),
      planGoalForPlayer: async (goal, _player, _profile, options) => ({ goal, budget: options.budget, warnings }),
      nextUpgradesForPlayer: async (_player, _profile, budget) => ({ budget, warnings }),
      hypixelRequest: async (endpoint) => ({ endpoint, body: { ok: true }, warnings }),
      resourceEndpoint: (kind) => `resources/skyblock/${kind}`,
      providerStatus: () => ({
        generatedAt: "2026-07-01T00:00:00.000Z",
        providers: [{ id: "pricing", cache: { entryCount: 1, staleCount: 0 }, warnings }],
        resources: [{ kind: "items", endpoint: "resources/skyblock/items" }],
        warnings,
      }),
    }) as any,
  });

  const inventory = await gateway.handle(request("/inventory?player=Notch&profile=Apple", "test-token")).then((response) => response.json());
  expect(inventory.inventory.warnings).toEqual(warnings);

  const section = await gateway.handle(request("/inventory-section?section=armor", "test-token")).then((response) => response.json());
  expect(section.inventorySection.section).toBe("armor");

  const metadata = await gateway.handle(request("/items/metadata?id=ASPECT_OF_THE_END", "test-token")).then((response) => response.json());
  expect(metadata.item.name).toBe("Aspect of the End");

  const networth = await gateway.handle(request("/item-networth?section=armor", "test-token")).then((response) => response.json());
  expect(networth.itemNetworth.total).toBe(3);

  const upgrades = await gateway.handle(request("/accessories/upgrades?budget=1000", "test-token")).then((response) => response.json());
  expect(upgrades.upgrades.budget).toBe(1000);

  const plan = await gateway.handle(request("/plan?goal=f7&budget=2000", "test-token")).then((response) => response.json());
  expect(plan.plan).toMatchObject({ goal: "f7", budget: 2000, warnings });

  const resource = await gateway.handle(request("/resource?kind=items", "test-token")).then((response) => response.json());
  expect(resource.resource.endpoint).toBe("resources/skyblock/items");
  const providerStatus = await gateway.handle(request("/provider-status", "test-token")).then((response) => response.json());
  expect(providerStatus.providers.providers[0].cache.entryCount).toBe(1);
  const invalidResource = await gateway.handle(request("/resource?kind=../player", "test-token"));
  expect(invalidResource.status).toBe(400);

  const invalid = await gateway.handle(request("/next-upgrades", "test-token"));
  expect(invalid.status).toBe(400);
  const emptyBudget = await gateway.handle(request("/accessories/upgrades?budget=", "test-token"));
  expect(emptyBudget.status).toBe(400);
});

test("gateway client exposes analysis route helpers", async () => {
  const client = new GatewayClient({ baseUrl: "http://127.0.0.1", token: "test-token" }) as any;
  const paths: string[] = [];
  client.request = async (route: string) => {
    paths.push(route);
    return { route };
  };

  await client.inventorySection("armor", "Notch", "Apple");
  await client.context("Notch", "Apple");
  await client.refreshContext("Notch", "Apple");
  await client.serverStatus("Notch");
  await client.contextEvents({ since: 1, limit: 2 });
  await client.emitContextEvent({ type: "client.test" });
  await client.normalizedItems("Notch", "Apple");
  await client.itemMetadata("ASPECT_OF_THE_END");
  await client.networth("Notch", "Apple");
  await client.itemNetworth("armor", "Notch", "Apple");
  await client.accessories("Notch", "Apple");
  await client.missingAccessories("Notch", "Apple");
  await client.accessoryUpgrades(1000, "Notch", "Apple");
  await client.section("skills", "Notch", "Apple");
  await client.progression("Notch", "Apple");
  await client.readiness("dungeons", "Notch", "Apple");
  await client.weight("Notch", "Apple");
  await client.plan("f7", "Notch", "Apple", 2000);
  await client.nextUpgrades(3000, "Notch", "Apple");
  await client.providerStatus();
  await client.resource("items");

  expect(paths).toContain("/inventory-section?section=armor&player=Notch&profile=Apple");
  expect(paths).toContain("/context?player=Notch&profile=Apple");
  expect(paths).toContain("/context/refresh");
  expect(paths).toContain("/server-status?player=Notch");
  expect(paths).toContain("/context/events?since=1&limit=2");
  expect(paths).toContain("/context/events");
  expect(paths).toContain("/items/metadata?id=ASPECT_OF_THE_END");
  expect(paths).toContain("/provider-status");
  expect(paths).toContain("/resource?kind=items");
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
