import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { buildProfileSnapshot, writeProfileSnapshot } from "@skyagent/core/profile-cache";
import { callTool } from "../src/tools.ts";

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
