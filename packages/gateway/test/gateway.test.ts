import { expect, test } from "bun:test";
import { createGateway, GatewayClient, gatewayVersion, startGateway } from "../src/index.ts";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
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

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Unable to allocate free port"));
      });
    });
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

test("gateway version defaults to the compiled release version when present", () => {
  expect(gatewayVersion("2.1.0")).toBe("2.1.0");
  expect(gatewayVersion(undefined)).toBe("2.0.0");
});

test("config routes redact secrets and reject unknown keys", async () => {
  const values: Record<string, any> = {};
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

test("LLM provider routes expose redacted config and authenticated status", async () => {
  const values: Record<string, any> = {};
  const gateway = createGateway({
    token: "test-token",
    deps: {
      publicLlmProviderConfig: () => ({
        provider: values.provider ?? null,
        configured: Boolean(values.provider && values.baseUrl && values.model),
        baseUrl: values.baseUrl ? "http://localhost:4000" : null,
        model: values.model ?? null,
        timeoutMs: 30_000,
        maxRetries: 1,
        auth: { apiKeyConfigured: Boolean(values.apiKey), apiKeySource: values.apiKey ? "config" : null },
        configuredRateLimit: { requestsPerMinute: values.requestsPerMinute ?? null, tokensPerMinute: values.tokensPerMinute ?? null },
        configuredBudget: { maxUsd: values.maxUsd ?? null, window: values.window ?? null },
        warnings: [],
      }),
      setLlmProviderConfigValue: (key, value) => {
        values[key] = value;
        if (key === "base-url") values.baseUrl = value;
        if (key === "rate-limit-rpm") values.requestsPerMinute = Number(value);
        if (key === "rate-limit-tpm") values.tokensPerMinute = Number(value);
        if (key === "budget-usd") values.maxUsd = Number(value);
        if (key === "budget-window") values.window = value;
        return {
          provider: values.provider ?? null,
          configured: Boolean(values.provider && values.baseUrl && values.model),
          baseUrl: values.baseUrl ? "http://localhost:4000" : null,
          model: values.model ?? null,
          timeoutMs: 30_000,
          maxRetries: 1,
          auth: { apiKeyConfigured: Boolean(values.apiKey), apiKeySource: values.apiKey ? "config" : null },
          configuredRateLimit: { requestsPerMinute: values.requestsPerMinute ?? null, tokensPerMinute: values.tokensPerMinute ?? null },
          configuredBudget: { maxUsd: values.maxUsd ?? null, window: values.window ?? null },
          warnings: [],
        };
      },
      llmProviderStatus: async () => ({
        kind: "skyagent.llmProviderStatus",
        schemaVersion: 1,
        generatedAt: "2026-07-02T00:00:00.000Z",
        provider: "litellm",
        configured: true,
        model: "skyagent-codex",
        baseUrl: "http://localhost:4000",
        auth: { apiKeyConfigured: true, apiKeySource: "config" },
        timeoutMs: 30_000,
        maxRetries: 1,
        health: { checked: true, ok: true, status: 200, url: "http://localhost:4000/health", error: null },
        rateLimit: { "x-ratelimit-remaining-requests": "50" },
        budget: { "x-litellm-key-spend": "0.1" },
        configuredRateLimit: { requestsPerMinute: 60, tokensPerMinute: 12000 },
        configuredBudget: { maxUsd: 5, window: "daily" },
        warnings: [],
      }),
    },
  });

  const unauthorized = await gateway.handle(request("/llm-provider/status"));
  expect(unauthorized.status).toBe(401);

  const updated = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ provider: "litellm", "base-url": "http://localhost:4000", model: "skyagent-codex", "rate-limit-rpm": "60", "rate-limit-tpm": "12000", "budget-usd": "5", "budget-window": "daily" }),
  })).then((response) => response.json());
  expect(updated.config).toMatchObject({
    provider: "litellm",
    configured: true,
    configuredRateLimit: { requestsPerMinute: 60, tokensPerMinute: 12000 },
    configuredBudget: { maxUsd: 5, window: "daily" },
  });

  const secretWrite = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ "api-key": "secret-key" }),
  }));
  expect(secretWrite.status).toBe(400);

  const credentialedBaseUrl = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ "base-url": "http://user:secret@localhost:4000" }),
  }));
  expect(credentialedBaseUrl.status).toBe(400);

  const secretQueryBaseUrl = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ baseUrl: "http://localhost:4000?token=secret" }),
  }));
  expect(secretQueryBaseUrl.status).toBe(400);

  const malformedBaseUrl = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ "base-url": "not a url" }),
  }));
  expect(malformedBaseUrl.status).toBe(400);

  const status = await gateway.handle(request("/llm-provider/status", "test-token")).then((response) => response.json());
  expect(status.provider).toMatchObject({
    provider: "litellm",
    health: { ok: true },
    budget: { "x-litellm-key-spend": "0.1" },
    configuredRateLimit: { requestsPerMinute: 60, tokensPerMinute: 12000 },
    configuredBudget: { maxUsd: 5, window: "daily" },
  });

  const invalid = await gateway.handle(request("/llm-provider/config", "test-token", {
    method: "POST",
    body: JSON.stringify({ unknown: "value" }),
  }));
  expect(invalid.status).toBe(400);
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
          hasInventory: false,
          hasEnderChest: false,
          hasBackpacks: false,
          hasPersonalVault: false,
          hasSacks: false,
          hasArmor: false,
          hasEquipment: false,
          hasWardrobe: false,
          hasAccessoryBag: false,
          hasPets: false,
          hasMuseum: false,
        },
        inventoryApiDetails: {
          inventory: { label: "Inventory", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          enderChest: { label: "Ender Chest", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          backpacks: { label: "Backpacks", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          personalVault: { label: "Personal Vault", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          sacks: { label: "Sacks", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          armor: { label: "Armor", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          equipment: { label: "Equipment", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          wardrobe: { label: "Wardrobe", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          accessoryBag: { label: "Accessory Bag", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
          pets: { label: "Pets", status: "api_disabled_or_missing", available: false, presentEmpty: false, sourcePath: null, warnings: [] },
        },
        profileCompleteness: {
          selectedMember: { uuid: context.uuid, memberPresent: false, profileMemberId: null, sourcePath: null },
          coop: { memberCount: 0, otherMemberCount: 0, selectedMemberPresent: false, memberIdsKnown: false },
          profileAvailability: {
            profileId: "profile-1",
            cuteName: "Apple",
            selected: true,
            gameMode: "normal",
            bankAvailable: false,
            museumAvailable: false,
          },
        },
        museum: {
          status: "missing",
          available: false,
          sourcePath: null,
          memberScoped: false,
          coopMemberMuseumCount: null,
          itemCount: 0,
          specialItemCount: 0,
          value: null,
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

test("persistent agent routes start sessions, stream through LiteLLM, and wrap objectives", async () => {
  let startCount = 0;
  let objective = { id: "obj-1", title: "Buy Juju", status: "open" };
  const gateway = createGateway({
    token: "test-token",
    agentSessionPath: null,
    deps: ({
      startSkyAgentSession: async (input) => {
        startCount += 1;
        return {
          kind: "skyagent.startup",
          generatedAt: "2026-07-02T00:00:00.000Z",
          player: { input: input.player ?? "Notch", username: "Notch" },
          selectedProfile: { profileId: input.profile ?? "profile-1", cuteName: "Apple" },
          freshnessPolicy: { refresh: Boolean(input.refresh), cacheOnly: Boolean(input.cacheOnly), allowStale: Boolean(input.allowStale), ttlMs: null },
          context: { cache: { status: "fresh", fetchedAt: "2026-07-02T00:00:00.000Z", stale: startCount === 1 }, sections: [] },
          objectives: { active: [objective], counts: { objective: 1 } },
          serverStatus: { online: true },
          providerStatus: { llm: { configured: true, provider: "litellm", model: "codex-test" } },
          warnings: [],
          followUpTools: { startup: ["skyagent_start"] },
        };
      },
      streamLlmChat: async function* (input) {
        expect(input.messages.at(-1)?.content).toBe("what next?");
        yield { type: "start", provider: "litellm", model: "codex-test" };
        yield { type: "text_delta", text: "Do dailies." };
        yield { type: "done", finishReason: "stop" };
      },
      listObjectiveItems: () => ({ items: [objective], count: 1 }),
      objectiveContextSummary: () => ({ active: [objective], counts: { objective: objective.status === "done" ? 0 : 1 } }),
      createObjectiveItem: (input) => ({ ...objective, ...input }),
      updateObjectiveItem: (id, patch) => ({ ...objective, id, ...patch }),
      completeObjectiveItem: (id) => {
        objective = { ...objective, id, status: "done" };
        return objective;
      },
    }) as any,
  });

  const started = await gateway.handle(request("/agent/start", "test-token", {
    method: "POST",
    body: JSON.stringify({ player: "Notch", profile: "Apple", cacheOnly: true }),
  })).then((response) => response.json());
  expect(started.agent).toMatchObject({
    running: true,
    ready: true,
    player: { username: "Notch" },
    selectedProfile: { cuteName: "Apple" },
  });

  const message = await gateway.handle(request("/agent/message", "test-token", {
    method: "POST",
    body: JSON.stringify({ message: "what next?", stream: false }),
  })).then((response) => response.json());
  expect(message.text).toBe("Do dailies.");
  expect(startCount).toBe(2);
  expect(message.agent.history.map((entry: any) => entry.role)).toEqual(["user", "assistant"]);

  const stream = await gateway.handle(request("/agent/message", "test-token", {
    method: "POST",
    body: JSON.stringify({ message: "what next?" }),
  }));
  expect(stream.headers.get("content-type")).toContain("text/event-stream");
  const chunk = await stream.body!.getReader().read();
  expect(new TextDecoder().decode(chunk.value)).toContain("agent_start");

  const listed = await gateway.handle(request("/agent/objectives", "test-token")).then((response) => response.json());
  expect(listed.objectives.count).toBe(1);

  const completed = await gateway.handle(request("/agent/objectives", "test-token", {
    method: "POST",
    body: JSON.stringify({ action: "complete", id: "obj-1" }),
  })).then((response) => response.json());
  expect(completed.objective.status).toBe("done");

  const status = await gateway.handle(request("/agent/status", "test-token")).then((response) => response.json());
  expect(status.agent.objectives.counts.objective).toBe(0);

  const stopped = await gateway.handle(request("/agent/stop", "test-token", { method: "POST" })).then((response) => response.json());
  expect(stopped.agent).toMatchObject({ running: false, ready: false });
});

test("persistent agent runtime restores session state across gateway runtime instances", async () => {
  const previousHome = process.env.SKYAGENT_HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-agent-persist-test-"));
  process.env.SKYAGENT_HOME = tempHome;
  try {
    const deps = {
      startSkyAgentSession: async () => ({
        kind: "skyagent.startup",
        generatedAt: "2026-07-02T00:00:00.000Z",
        player: { username: "Notch" },
        selectedProfile: { profileId: "profile-1", cuteName: "Apple" },
        context: { cache: { status: "fresh", stale: false }, sections: [] },
        objectives: { active: [], counts: { objective: 0 } },
        providerStatus: {
          llm: {
            configured: true,
            provider: "litellm",
            model: "codex-test",
            apiKey: "sk-session-secret",
            auth: { token: "session-token-secret" },
          },
        },
        warnings: [{ message: "Authorization: Bearer sk-session-secret" }],
      }),
      streamLlmChat: async function* () {
        yield { type: "text_delta", text: "Persisted answer." };
      },
      listObjectiveItems: () => ({ items: [], count: 0 }),
      objectiveContextSummary: () => ({ active: [], counts: { objective: 0 } }),
    } as any;

    const sessionPath = path.join(tempHome, "agent-session.json");
    const firstGateway = createGateway({ token: "test-token", deps, agentSessionPath: sessionPath });
    await firstGateway.handle(request("/agent/start", "test-token", { method: "POST", body: JSON.stringify({ cacheOnly: true }) }));
    await firstGateway.handle(request("/agent/message", "test-token", {
      method: "POST",
      body: JSON.stringify({ message: "remember this", stream: false }),
    }));

    const persistedSession = fs.readFileSync(sessionPath, "utf8");
    expect(persistedSession).not.toContain("sk-session-secret");
    expect(persistedSession).not.toContain("session-token-secret");
    expect(persistedSession).toContain("redacted");

    const restoredGateway = createGateway({ token: "test-token", deps, agentSessionPath: sessionPath });
    const restored = await restoredGateway.handle(request("/agent/status", "test-token")).then((response) => response.json());

    expect(restored.agent).toMatchObject({ running: true, ready: true, player: { username: "Notch" } });
    expect(restored.agent.history.map((entry: any) => entry.role)).toEqual(["user", "assistant"]);
    expect(restored.agent.history.at(-1).content).toBe("Persisted answer.");
  } finally {
    if (previousHome === undefined) {
      delete process.env.SKYAGENT_HOME;
    } else {
      process.env.SKYAGENT_HOME = previousHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("persistent agent start refreshes a restored stale session before reporting ready", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-agent-stale-test-"));
  try {
    let starts = 0;
    const deps = {
      startSkyAgentSession: async (input: any) => {
        starts += 1;
        const stale = starts === 1;
        return {
          kind: "skyagent.startup",
          generatedAt: stale ? "2026-07-01T00:00:00.000Z" : "2026-07-02T00:00:00.000Z",
          player: { username: "Notch" },
          selectedProfile: { profileId: "profile-1", cuteName: "Apple" },
          freshnessPolicy: {
            refresh: Boolean(input.refresh),
            cacheOnly: Boolean(input.cacheOnly),
            allowStale: Boolean(input.allowStale),
            ttlMs: null,
          },
          context: { cache: { status: stale ? "stale" : "fresh", stale }, sections: [] },
          objectives: { active: [], counts: { objective: 0 } },
          providerStatus: { profile: { status: stale ? "stale" : "fresh" } },
          warnings: [],
        };
      },
      streamLlmChat: async function* () {},
      listObjectiveItems: () => ({ items: [], count: 0 }),
      objectiveContextSummary: () => ({ active: [], counts: { objective: 0 } }),
    } as any;

    const sessionPath = path.join(tempHome, "agent-session.json");
    const firstGateway = createGateway({ token: "test-token", deps, agentSessionPath: sessionPath });
    await firstGateway.handle(request("/agent/start", "test-token", {
      method: "POST",
      body: JSON.stringify({ cacheOnly: true, allowStale: true }),
    }));

    const restoredGateway = createGateway({ token: "test-token", deps, agentSessionPath: sessionPath });
    const refreshed = await restoredGateway.handle(request("/agent/start", "test-token", {
      method: "POST",
      body: JSON.stringify({}),
    })).then((response) => response.json());

    expect(starts).toBe(2);
    expect(refreshed.agent.freshness).toMatchObject({ status: "fresh", stale: false });
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("persistent agent start refreshes when requested player or profile changes", async () => {
  const starts: Array<{ player?: string; profile?: string }> = [];
  const gateway = createGateway({
    token: "test-token",
    agentSessionPath: null,
    deps: ({
      startSkyAgentSession: async (input) => {
        starts.push({ player: input.player, profile: input.profile });
        return {
          kind: "skyagent.startup",
          generatedAt: "2026-07-02T00:00:00.000Z",
          player: { input: input.player, username: input.player ?? "Notch" },
          selectedProfile: { profileId: input.profile ?? "profile-1", cuteName: input.profile ?? "Apple" },
          context: { cache: { status: "fresh", stale: false }, sections: [] },
          objectives: { active: [], counts: { objective: 0 } },
          providerStatus: { llm: { configured: true, provider: "litellm", model: "codex-test" } },
          warnings: [],
        };
      },
      streamLlmChat: async function* () {},
      listObjectiveItems: () => ({ items: [], count: 0 }),
      objectiveContextSummary: () => ({ active: [], counts: { objective: 0 } }),
    }) as any,
  });

  const first = await gateway.handle(request("/agent/start", "test-token", {
    method: "POST",
    body: JSON.stringify({ player: "Notch", profile: "Apple", cacheOnly: true }),
  })).then((response) => response.json());
  expect(first.agent).toMatchObject({ player: { username: "Notch" }, selectedProfile: { cuteName: "Apple" } });

  await gateway.handle(request("/agent/start", "test-token", {
    method: "POST",
    body: JSON.stringify({ player: "notch", profile: "apple", cacheOnly: true }),
  }));
  expect(starts).toHaveLength(1);

  const second = await gateway.handle(request("/agent/start", "test-token", {
    method: "POST",
    body: JSON.stringify({ player: "Steve", profile: "Banana", cacheOnly: true }),
  })).then((response) => response.json());
  expect(second.agent).toMatchObject({ player: { username: "Steve" }, selectedProfile: { cuteName: "Banana" } });
  expect(starts).toEqual([
    { player: "Notch", profile: "Apple" },
    { player: "Steve", profile: "Banana" },
  ]);
});

test("persistent agent executes streamed objective tool calls through server path", async () => {
  let created: any = null;
  const requests: any[] = [];
  const gateway = createGateway({
    token: "test-token",
    agentSessionPath: null,
    deps: ({
      startSkyAgentSession: async () => ({
        kind: "skyagent.startup",
        generatedAt: "2026-07-02T00:00:00.000Z",
        player: { username: "Notch" },
        selectedProfile: { profileId: "profile-1", cuteName: "Apple" },
        context: { cache: { status: "fresh", stale: false }, sections: [] },
        objectives: { active: [], counts: { objective: 0 } },
        providerStatus: { llm: { configured: true, provider: "litellm", model: "codex-test" } },
        warnings: [],
      }),
      streamLlmChat: async function* (input) {
        requests.push(input);
        if (requests.length === 1) {
          expect(input.tools?.map((tool: any) => tool.function.name)).toContain("skyagent_objective_create");
          yield { type: "tool_call_delta", toolCalls: [{ index: 0, id: "call_1", function: { name: "skyagent_objective_create", arguments: "{\"itemKind\":\"objective\"," } }] };
          yield { type: "tool_call_delta", toolCalls: [{ index: 0, function: { arguments: "\"title\":\"Buy Juju\"}" } }] };
          yield { type: "done", finishReason: "tool_calls" };
          return;
        }
        expect(input.toolChoice).toBe("none");
        expect(input.messages).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "call_1" }));
        yield { type: "text_delta", text: "Tracked Buy Juju." };
        yield { type: "done", finishReason: "stop" };
      },
      createObjectiveItem: (input) => {
        created = { id: "obj-1", status: "open", ...input };
        return created;
      },
      listObjectiveItems: () => ({ items: created ? [created] : [], count: created ? 1 : 0 }),
      objectiveContextSummary: () => ({ active: created ? [created] : [], counts: { objective: created ? 1 : 0 } }),
      updateObjectiveItem: (id, patch) => ({ ...created, id, ...patch }),
      completeObjectiveItem: (id) => ({ ...created, id, status: "done" }),
    }) as any,
  });

  await gateway.handle(request("/agent/start", "test-token", { method: "POST", body: JSON.stringify({ cacheOnly: true }) }));
  const response = await gateway.handle(request("/agent/message", "test-token", {
    method: "POST",
    body: JSON.stringify({ message: "track juju", stream: false }),
  })).then((body) => body.json());

  expect(created).toMatchObject({ itemKind: "objective", title: "Buy Juju" });
  expect(requests).toHaveLength(2);
  expect(response.events).toContainEqual(expect.objectContaining({ type: "tool_result", name: "skyagent_objective_create" }));
  expect(response.agent.objectives.counts.objective).toBe(1);
  expect(response.text).toContain("Tracked Buy Juju");
});

test("persistent agent returns objective tool errors without aborting chat", async () => {
  const requests: any[] = [];
  const gateway = createGateway({
    token: "test-token",
    agentSessionPath: null,
    deps: ({
      startSkyAgentSession: async () => ({
        kind: "skyagent.startup",
        generatedAt: "2026-07-02T00:00:00.000Z",
        player: { username: "Notch" },
        selectedProfile: { profileId: "profile-1", cuteName: "Apple" },
        context: { cache: { status: "fresh", stale: false }, sections: [] },
        objectives: { active: [], counts: { objective: 0 } },
        providerStatus: { llm: { configured: true, provider: "litellm", model: "codex-test" } },
        warnings: [],
      }),
      streamLlmChat: async function* (input) {
        requests.push(input);
        if (requests.length === 1) {
          yield { type: "tool_call_delta", toolCalls: [{ index: 0, id: "call_bad", function: { name: "skyagent_objective_complete", arguments: "{}" } }] };
          yield { type: "done", finishReason: "tool_calls" };
          return;
        }
        expect(input.messages).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "call_bad" }));
        yield { type: "text_delta", text: "I could not complete that objective because the id was missing." };
        yield { type: "done", finishReason: "stop" };
      },
      listObjectiveItems: () => ({ items: [], count: 0 }),
      objectiveContextSummary: () => ({ active: [], counts: { objective: 0 } }),
      completeObjectiveItem: () => {
        throw new Error("should not be called without id");
      },
    }) as any,
  });

  await gateway.handle(request("/agent/start", "test-token", { method: "POST", body: JSON.stringify({ cacheOnly: true }) }));
  const response = await gateway.handle(request("/agent/message", "test-token", {
    method: "POST",
    body: JSON.stringify({ message: "complete it", stream: false }),
  })).then((body) => body.json());

  expect(response.events).toContainEqual(expect.objectContaining({
    type: "tool_result",
    id: "call_bad",
    name: "skyagent_objective_complete",
    result: expect.objectContaining({ ok: false, error: "skyagent_objective_complete requires id." }),
  }));
  expect(response.text).toContain("id was missing");
  expect(response.agent.history.at(-1)).toMatchObject({ role: "assistant" });
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
      museumDonationPlanForPlayer: async (goal, _player, _profile, options) => ({
        goal,
        budget: options.budget,
        maxPriceLookups: options.maxPriceLookups,
        timeoutMs: options.timeoutMs,
        persistObjectives: options.persistObjectives,
        warnings,
      }),
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

  const museumPlan = await gateway.handle(request("/museum/plan?goal=Museum%20GIANTS_SWORD&budget=3000&maxPriceLookups=2&timeoutMs=500", "test-token")).then((response) => response.json());
  expect(museumPlan.museumPlan).toMatchObject({ goal: "Museum GIANTS_SWORD", budget: 3000, maxPriceLookups: 2, timeoutMs: 500, persistObjectives: false, warnings });

  const persistedMuseumPlan = await gateway.handle(request("/museum/plan", "test-token", {
    method: "POST",
    body: JSON.stringify({ goal: "Museum GIANTS_SWORD", budget: 3000, maxPriceLookups: 2, timeoutMs: 500, persistObjectives: true }),
  })).then((response) => response.json());
  expect(persistedMuseumPlan.museumPlan).toMatchObject({ goal: "Museum GIANTS_SWORD", budget: 3000, maxPriceLookups: 2, timeoutMs: 500, persistObjectives: true, warnings });

  const museumPlanNoPersist = await gateway.handle(request("/museum/plan?goal=Museum%20GIANTS_SWORD", "test-token")).then((response) => response.json());
  expect(museumPlanNoPersist.museumPlan.persistObjectives).toBe(false);

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
  const invalidMuseumBudget = await gateway.handle(request("/museum/plan?goal=museum&budget=", "test-token"));
  expect(invalidMuseumBudget.status).toBe(400);
  const invalidMuseumMaxPriceLookups = await gateway.handle(request("/museum/plan?goal=museum&maxPriceLookups=nope", "test-token"));
  expect(invalidMuseumMaxPriceLookups.status).toBe(400);
  const decimalMuseumMaxPriceLookups = await gateway.handle(request("/museum/plan?goal=museum&maxPriceLookups=1.5", "test-token"));
  expect(decimalMuseumMaxPriceLookups.status).toBe(400);
  const invalidMuseumTimeout = await gateway.handle(request("/museum/plan?goal=museum&timeoutMs=0", "test-token"));
  expect(invalidMuseumTimeout.status).toBe(400);
  const invalidMuseumPersist = await gateway.handle(request("/museum/plan?goal=museum&persistObjectives=true", "test-token"));
  expect(invalidMuseumPersist.status).toBe(405);
  const missingPostPersist = await gateway.handle(request("/museum/plan", "test-token", {
    method: "POST",
    body: JSON.stringify({ goal: "museum" }),
  }));
  expect(missingPostPersist.status).toBe(400);
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
  await client.museumPlan("Museum GIANTS_SWORD", "Notch", "Apple", 3000, 2, 500);
  await client.museumPlan("Museum GIANTS_SWORD", "Notch", "Apple", 3000, 2, 500, true);
  await client.nextUpgrades(3000, "Notch", "Apple");
  await client.providerStatus();
  await client.llmProviderStatus();
  await client.llmProviderConfig();
  await client.setLlmProviderConfig({ provider: "litellm" });
  await client.startAgent({ cacheOnly: true });
  await client.agentStatus();
  await client.stopAgent();
  await client.agentHistory();
  await client.refreshAgentContext({ allowStale: true });
  await client.agentObjectives({ kind: "objective" });
  await client.agentObjectives({ action: "create", title: "Buy item" });
  await client.messageAgent({ message: "hello" });
  await client.resource("items");

  expect(paths).toContain("/inventory-section?section=armor&player=Notch&profile=Apple");
  expect(paths).toContain("/context?player=Notch&profile=Apple");
  expect(paths).toContain("/context/refresh");
  expect(paths).toContain("/server-status?player=Notch");
  expect(paths).toContain("/context/events?since=1&limit=2");
  expect(paths).toContain("/context/events");
  expect(paths).toContain("/items/metadata?id=ASPECT_OF_THE_END");
  expect(paths).toContain("/provider-status");
  expect(paths).toContain("/llm-provider/status");
  expect(paths).toContain("/llm-provider/config");
  expect(paths).toContain("/agent/start");
  expect(paths).toContain("/agent/status");
  expect(paths).toContain("/agent/stop");
  expect(paths).toContain("/agent/history");
  expect(paths).toContain("/agent/context/refresh");
  expect(paths).toContain("/agent/objectives?kind=objective");
  expect(paths).toContain("/agent/objectives");
  expect(paths).toContain("/agent/message");
  expect(paths).toContain("/resource?kind=items");
  expect(paths).toContain("/museum/plan?goal=Museum+GIANTS_SWORD&player=Notch&profile=Apple&budget=3000&maxPriceLookups=2&timeoutMs=500");
  expect(paths).toContain("/museum/plan");
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

test("started gateway rejects non-loopback host binds", () => {
  expect(() => startGateway({ token: "test-token", host: "0.0.0.0", port: 0 })).toThrow("127.0.0.1");
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

test("gateway bin rejects public host binds", async () => {
  const proc = Bun.spawn(["bun", "./packages/gateway/src/bin.ts", "--host=0.0.0.0", "--token=test-token"], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(1);
  expect(stderr).toContain("127.0.0.1");
});

test("root __gateway launcher passes clean args to gateway bin", async () => {
  const port = await freePort();
  const token = "test-token";
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "__gateway", "--host=127.0.0.1", `--port=${port}`, `--token=${token}`], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const client = new GatewayClient({ baseUrl: `http://127.0.0.1:${port}`, token });
  try {
    const reader = proc.stdout.getReader();
    const chunk = await reader.read();
    reader.releaseLock();
    const status = JSON.parse(new TextDecoder().decode(chunk.value));

    expect(status).toMatchObject({ host: "127.0.0.1", port });
    expect(await client.version()).toMatchObject({ ok: true });
    expect(await client.shutdown()).toEqual({ ok: true, shuttingDown: true });
    expect(await proc.exited).toBe(0);
  } finally {
    if (!proc.killed) {
      proc.kill();
    }
  }
});

test("root internal gateway launcher supports packaged spawn contract", async () => {
  const port = await freePort();
  const token = "test-token";
  const proc = Bun.spawn(["bun", "./scripts/skyagent.ts", "--host=127.0.0.1", `--port=${port}`, `--token=${token}`], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, SKYAGENT_INTERNAL_GATEWAY: "1" },
  });
  const client = new GatewayClient({ baseUrl: `http://127.0.0.1:${port}`, token });
  try {
    const reader = proc.stdout.getReader();
    const chunk = await reader.read();
    reader.releaseLock();
    const status = JSON.parse(new TextDecoder().decode(chunk.value));

    expect(status).toMatchObject({ host: "127.0.0.1", port });
    expect(await client.version()).toMatchObject({ ok: true });
    expect(await client.shutdown()).toEqual({ ok: true, shuttingDown: true });
    expect(await proc.exited).toBe(0);
  } finally {
    if (!proc.killed) {
      proc.kill();
    }
  }
});
