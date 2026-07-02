import { describe, expect, test } from "bun:test";
import { ContextEventBus, contextEventBus, createServerStatusMonitor, emitProviderStatusEvent, providerStatusWithEvent, serverStatusForPlayer } from "../src/context-events.ts";

describe("context events", () => {
  test("orders events and keeps bounded history for reconnect reads", () => {
    const bus = new ContextEventBus({ historyLimit: 3 });

    bus.emit({ type: "profile.refresh", source: { kind: "profile-snapshot" }, payload: { n: 1 } });
    const second = bus.emit({ type: "provider.cache", source: { kind: "provider-cache" }, payload: { n: 2 } });
    bus.emit({ type: "objective.progress", source: { kind: "agent" }, payload: { n: 3 } });
    bus.emit({ type: "minecraft.telemetry", source: { kind: "minecraft-mod" }, payload: { n: 4 } });

    const batch = bus.read({ sinceSequence: second.sequence, limit: 10, now: 1_000 });

    expect(batch.events.map((event) => event.payload.n)).toEqual([3, 4]);
    expect(bus.read({ limit: 10 }).events.map((event) => event.payload.n)).toEqual([2, 3, 4]);
    expect(batch.events[0].provenance.futureProducer.expectedFields).toContain("inventoryDelta");
  });

  test("notifies subscribers for watch-style consumers", () => {
    const bus = new ContextEventBus({ historyLimit: 10 });
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((event) => seen.push(event.type));

    bus.emit({ type: "cli.context_event", source: { kind: "cli" } });
    unsubscribe();
    bus.emit({ type: "mcp.context_event", source: { kind: "mcp" } });

    expect(seen).toEqual(["cli.context_event"]);
  });

  test("returns no events for explicit zero-limit reconnect reads", () => {
    const bus = new ContextEventBus({ historyLimit: 10 });
    bus.emit({ type: "one", source: { kind: "agent" } });
    bus.emit({ type: "two", source: { kind: "agent" } });

    const batch = bus.read({ limit: 0 });

    expect(batch.limit).toBe(0);
    expect(batch.events).toEqual([]);
    expect(batch.latestSequence).toBeGreaterThan(0);
  });

  test("emits provider cache status events", () => {
    const event = emitProviderStatusEvent({
      generatedAt: new Date(1_000).toISOString(),
      providers: [{ id: "pricing", status: "available" }],
      warnings: [],
    });

    expect(event).toMatchObject({
      type: "provider.cache_status",
      source: { kind: "provider-cache" },
      payload: { providers: [expect.objectContaining({ id: "pricing" })] },
    });
  });

  test("emits provider cache change events when provider state changes", () => {
    contextEventBus.clear();

    providerStatusWithEvent({
      providerStatus: () => ({
        generatedAt: new Date(1_000).toISOString(),
        providers: [{ id: "pricing", status: "available", cache: { staleCount: 0 }, warnings: [] }],
        warnings: [],
      }),
      forceChange: true,
    });
    providerStatusWithEvent({
      providerStatus: () => ({
        generatedAt: new Date(2_000).toISOString(),
        providers: [{ id: "pricing", status: "stale_cache_available", cache: { staleCount: 1 }, warnings: [{ code: "stale_price_cache" }] }],
        warnings: [{ code: "stale_price_cache" }],
      }),
    });

    const changes = contextEventBus.read({ type: "provider.cache_status_change", limit: 10 }).events;
    expect(changes).toHaveLength(2);
    expect(changes.at(-1)?.payload.providers[0].status).toBe("stale_cache_available");
  });
});

describe("server status", () => {
  test("reports Hypixel session fields and emits a status event", async () => {
    contextEventBus.clear();
    const status = await serverStatusForPlayer("Notch", {
      now: 1_000,
      uuidFromNameOrUuid: async () => "uuid-1",
      providerStatus: () => ({ generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] }),
      hypixelRequest: async () => ({
        status: 200,
        url: "https://api.hypixel.net/v2/status?uuid=uuid-1",
        rateLimit: { limit: "120", remaining: "119", reset: "1" },
        body: { session: { online: true, gameType: "SKYBLOCK", mode: "dynamic", map: "Private Island" } },
      }),
    });

    expect(status).toMatchObject({
      kind: "skyagent.serverStatus",
      api: { available: true, status: 200 },
      online: true,
      session: { gameType: "SKYBLOCK", mode: "dynamic", map: "Private Island" },
    });
    expect(contextEventBus.read({ type: "hypixel.server_status_change", limit: 10 }).events).toHaveLength(1);
  });

  test("returns provider warnings instead of throwing on status failures", async () => {
    const error = Object.assign(new Error("Hypixel request failed: HTTP 503 maintenance"), {
      result: {
        status: 503,
        url: "https://api.hypixel.net/v2/status?uuid=uuid-1",
        rateLimit: { limit: null, remaining: null, reset: null },
      },
    });
    const status = await serverStatusForPlayer("Notch", {
      uuidFromNameOrUuid: async () => "uuid-1",
      providerStatus: () => ({ generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] }),
      hypixelRequest: async () => {
        throw error;
      },
    });

    expect(status.api).toMatchObject({ available: false, status: 503 });
    expect(status.online).toBeNull();
    expect(status.warnings).toContainEqual(expect.objectContaining({ code: "hypixel_status_provider_error" }));
  });

  test("reports player resolution failures without marking the Hypixel API unavailable", async () => {
    const status = await serverStatusForPlayer("missing-player", {
      uuidFromNameOrUuid: async () => {
        throw new Error("Minecraft username not found: missing-player");
      },
      providerStatus: () => ({ generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] }),
      hypixelRequest: async () => {
        throw new Error("should not request Hypixel after resolution failure");
      },
    });

    expect(status).toMatchObject({
      api: { available: null, status: null },
      online: null,
      player: { input: "missing-player", uuid: null },
    });
    expect(status.warnings).toContainEqual(expect.objectContaining({ code: "player_resolution_error" }));
  });

  test("reports missing local API keys without marking the Hypixel API unavailable", async () => {
    const status = await serverStatusForPlayer("Notch", {
      uuidFromNameOrUuid: async () => "uuid-1",
      providerStatus: () => ({ generatedAt: new Date(1_000).toISOString(), providers: [], warnings: [] }),
      hypixelRequest: async () => {
        throw new Error("Hypixel API key is required. Set HYPIXEL_API_KEY or run `skyagent config set api-key <key>`.");
      },
    });

    expect(status.api).toMatchObject({ available: null, status: null });
    expect(status.warnings).toContainEqual(expect.objectContaining({ code: "hypixel_api_key_required" }));
  });

  test("server status monitor emits change events only when status state changes", async () => {
    contextEventBus.clear();
    const statuses = [
      {
        kind: "skyagent.serverStatus",
        schemaVersion: 1,
        generatedAt: new Date(1_000).toISOString(),
        player: { input: "Notch", uuid: "uuid-1" },
        api: { available: true, status: 200, url: "https://api.hypixel.net/v2/status?uuid=uuid-1", rateLimit: null },
        online: true,
        session: { gameType: "SKYBLOCK", mode: "dynamic", map: "Private Island" },
        providers: { providers: [], warnings: [] },
        warnings: [],
      },
      {
        kind: "skyagent.serverStatus",
        schemaVersion: 1,
        generatedAt: new Date(2_000).toISOString(),
        player: { input: "Notch", uuid: "uuid-1" },
        api: { available: true, status: 200, url: "https://api.hypixel.net/v2/status?uuid=uuid-1", rateLimit: null },
        online: true,
        session: { gameType: "SKYBLOCK", mode: "dynamic", map: "Private Island" },
        providers: { providers: [], warnings: [] },
        warnings: [],
      },
      {
        kind: "skyagent.serverStatus",
        schemaVersion: 1,
        generatedAt: new Date(3_000).toISOString(),
        player: { input: "Notch", uuid: "uuid-1" },
        api: { available: true, status: 200, url: "https://api.hypixel.net/v2/status?uuid=uuid-1", rateLimit: null },
        online: false,
        session: { gameType: null, mode: null, map: null },
        providers: { providers: [], warnings: [] },
        warnings: [],
      },
    ];
    let index = 0;
    const monitor = createServerStatusMonitor("Notch", {
      statusProvider: async () => statuses[Math.min(index++, statuses.length - 1)],
    });

    await monitor.tick();
    await monitor.tick();
    await monitor.tick();

    const changeEvents = contextEventBus.read({ limit: 10, type: "hypixel.server_status_change" }).events;
    expect(changeEvents).toHaveLength(2);
    expect(changeEvents.map((event) => event.payload.online)).toEqual([true, false]);
  });
});
