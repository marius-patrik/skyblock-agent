import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { buildProfileSnapshot, writeProfileSnapshot } from "@skyagent/core/profile-cache";
import { callTool, tools } from "../src/tools.ts";

const uuid = "3206bd83fa494a5e9a1cd165a2728597";
let tempHome: string | null = null;

afterEach(() => {
  if (tempHome) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = null;
  }
  delete process.env.SKYAGENT_HOME;
});

function isolatedSkyAgentHome() {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-mcp-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

test("profile snapshot MCP tool can return cached context deterministically", async () => {
  isolatedSkyAgentHome();
  const fetchedAtMs = Date.now();
  writeProfileSnapshot(buildProfileSnapshot({
    uuid,
    profile: {
      profile_id: "profile-1",
      cute_name: "Apple",
      selected: true,
      members: {},
    },
    member: {
      currencies: { coin_purse: 12 },
      player_data: { experience: {} },
    },
    profiles: [],
    rateLimit: null,
  }, { ttlMs: 60_000, fetchedAtMs }));

  const result = await callTool("skyblock_profile_snapshot", {
    player: uuid,
    profile: "Apple",
    cacheOnly: true,
    ttlMs: 60_000,
  });

  expect(result.cacheStatus).toBe("hit");
  expect(result.profile).toMatchObject({ profileId: "profile-1", cuteName: "Apple" });
});

test("context MCP tools are exposed", () => {
  const names = tools.map((tool) => tool.name);

  expect(names).toContain("skyagent_context_bootstrap");
  expect(names).toContain("skyagent_context_get");
  expect(names).toContain("skyagent_context_refresh");
  expect(names).toContain("skyagent_server_status");
  expect(names).toContain("skyagent_context_events");
  expect(names).toContain("skyagent_context_watch");
  expect(names).toContain("skyagent_context_event_emit");
  expect(names).toContain("skyagent_objective_create");
  expect(names).toContain("skyagent_objective_list");
  expect(names).toContain("skyagent_objective_update");
  expect(names).toContain("skyagent_objective_complete");
  expect(names).toContain("skyagent_objective_delete");
});

test("context get defaults to cached snapshot reads", async () => {
  isolatedSkyAgentHome();
  const fetchedAtMs = Date.now();
  writeProfileSnapshot(buildProfileSnapshot({
    uuid,
    profile: {
      profile_id: "profile-1",
      cute_name: "Apple",
      selected: true,
      members: {},
    },
    member: {
      currencies: { coin_purse: 12 },
      player_data: { experience: {} },
      pets_data: { pets: [{ type: "SHEEP", active: true, exp: 10 }] },
    },
    profiles: [],
    rateLimit: null,
  }, { ttlMs: 60_000, fetchedAtMs }));

  const result = await callTool("skyagent_context_get", {
    player: uuid,
    profile: "Apple",
    ttlMs: 60_000,
  });

  expect(result.kind).toBe("skyagent.agentContext");
  expect(result.cache.status).toBe("hit");
  expect(result.rawPayloadsIncluded).toBe(false);
});

test("context event MCP tools emit and read events", async () => {
  const event = await callTool("skyagent_context_event_emit", {
    type: "mcp.test_event",
    payload: { ok: true },
  });
  const batch = await callTool("skyagent_context_watch", {
    sinceSequence: event.sequence - 1,
    limit: 5,
  });

  expect(event.type).toBe("mcp.test_event");
  expect(batch.events).toContainEqual(expect.objectContaining({ id: event.id, type: "mcp.test_event" }));
});

test("objective MCP tools create and transition durable items", async () => {
  isolatedSkyAgentHome();

  const item = await callTool("skyagent_objective_create", {
    itemKind: "snipe",
    title: "Snipe Wither Relic",
    itemId: "WITHER_RELIC",
    targetPrice: 50_000_000,
    priority: 8,
    freshness: { status: "fresh", source: "coflnet", warnings: [{ code: "thin_market", message: "Thin market" }] },
  });
  const active = await callTool("skyagent_objective_update", { id: item.id, status: "active", sourceProvider: "coflnet" });
  const list = await callTool("skyagent_objective_list", { itemKind: "snipe", status: "active" });

  expect(active).toMatchObject({ id: item.id, status: "active", sourceProvider: "coflnet" });
  expect(list.items).toContainEqual(expect.objectContaining({ id: item.id, itemId: "WITHER_RELIC", targetPrice: 50_000_000 }));

  await callTool("skyagent_objective_complete", { id: item.id });
  await callTool("skyagent_objective_delete", { id: item.id });
  expect(await callTool("skyagent_objective_list", {})).toMatchObject({ count: 0, items: [] });
});
