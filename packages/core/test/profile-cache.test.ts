import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  buildProfileSnapshot,
  findCachedProfileSnapshot,
  profileSnapshotCachePath,
  profileSnapshotForPlayer,
  writeProfileSnapshot,
} from "../src/profile-cache.ts";
import { writeConfig } from "../src/store.ts";

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
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "skyagent-profile-cache-test-"));
  process.env.SKYAGENT_HOME = tempHome;
}

function context(profileId = "profile-1", cuteName = "Apple", member = {}) {
  return {
    uuid,
    profile: {
      profile_id: profileId,
      cute_name: cuteName,
      selected: cuteName === "Apple",
      game_mode: "normal",
      banking: { balance: 500 },
      members: {
        [uuid]: {
          rawSecretLikeField: "secret-key",
          ...member,
        },
      },
    },
    member: {
      currencies: { coin_purse: 12 },
      player_data: { experience: { SKILL_FARMING: 10 } },
      ...member,
    },
    profiles: [{
      profileId,
      cuteName,
      selected: cuteName === "Apple",
      gameMode: "normal",
      memberPresent: true,
      lastSave: null,
      purse: 12,
      bank: 500,
      skyblockLevelXp: null,
    }],
    rateLimit: { limit: "120", remaining: "100", reset: "1" },
  };
}

function deps(fetches: any[] = []) {
  return {
    uuidFromNameOrUuid: async () => uuid,
    fetchProfileContext: async (_player: string, selector: string | null) => {
      fetches.push({ selector });
      return selector === "Banana" ? context("profile-2", "Banana") : context();
    },
  };
}

describe("profile snapshot cache", () => {
  test("returns a fresh cached snapshot without refreshing", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeProfileSnapshot(buildProfileSnapshot(context(), { player: "Pastik_", ttlMs: 60_000, fetchedAtMs: 1_000 }));

    const snapshot = await profileSnapshotForPlayer("Pastik_", "Apple", { now: 2_000, ttlMs: 60_000 }, deps(fetches));

    expect(fetches).toEqual([]);
    expect(snapshot.cacheStatus).toBe("hit");
    expect(snapshot.stale).toBe(false);
    expect(snapshot.player).toEqual({ username: "Pastik_", uuid });
    expect(snapshot.profile.profileId).toBe("profile-1");
    expect(JSON.stringify(snapshot)).not.toContain("secret-key");
    expect(JSON.stringify(snapshot)).not.toContain("members");
  });

  test("returns stale cached data only when stale reads are allowed", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeProfileSnapshot(buildProfileSnapshot(context(), { ttlMs: 100, fetchedAtMs: 1_000 }));

    const stale = await profileSnapshotForPlayer(uuid, "Apple", { now: 2_000, ttlMs: 100, allowStale: true }, deps(fetches));

    expect(fetches).toEqual([]);
    expect(stale.cacheStatus).toBe("hit");
    expect(stale.stale).toBe(true);
    expect(stale.ageMs).toBe(1_000);
  });

  test("cache-only rejects stale snapshots unless stale reads are explicit", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeProfileSnapshot(buildProfileSnapshot(context(), { ttlMs: 100, fetchedAtMs: 1_000 }));

    await expect(profileSnapshotForPlayer(uuid, "Apple", { now: 2_000, ttlMs: 100, cacheOnly: true }, deps(fetches)))
      .rejects.toThrow("No usable profile snapshot cache entry exists");

    expect(fetches).toEqual([]);
  });

  test("forced refresh bypasses a fresh hit and rewrites metadata", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeProfileSnapshot(buildProfileSnapshot(context(), { ttlMs: 60_000, fetchedAtMs: 1_000 }));

    const snapshot = await profileSnapshotForPlayer(uuid, "Apple", { now: 5_000, ttlMs: 60_000, refresh: true }, deps(fetches));

    expect(fetches).toEqual([{ selector: "Apple" }]);
    expect(snapshot.cacheStatus).toBe("refreshed");
    expect(snapshot.fetchedAt).toBe(new Date(5_000).toISOString());
    expect(findCachedProfileSnapshot(uuid, "Apple").snapshot?.fetchedAt).toBe(new Date(5_000).toISOString());
  });

  test("per-request TTL overrides cached freshness decisions", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeProfileSnapshot(buildProfileSnapshot(context(), { ttlMs: 60_000, fetchedAtMs: 1_000 }));

    const snapshot = await profileSnapshotForPlayer(uuid, "Apple", { now: 2_000, ttlMs: 0 }, deps(fetches));

    expect(fetches).toEqual([{ selector: "Apple" }]);
    expect(snapshot.cacheStatus).toBe("refreshed");
    expect(snapshot.ttlMs).toBe(0);
  });

  test("uses configured selected profile consistently for stale cache refresh", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    writeConfig({ selectedProfileId: "Banana" });
    writeProfileSnapshot(buildProfileSnapshot(context("profile-2", "Banana"), { ttlMs: 100, fetchedAtMs: 1_000 }));

    const snapshot = await profileSnapshotForPlayer(uuid, null, { now: 2_000, ttlMs: 100 }, deps(fetches));

    expect(fetches).toEqual([{ selector: "Banana" }]);
    expect(snapshot.profile).toMatchObject({ profileId: "profile-2", cuteName: "Banana" });
  });

  test("recovers from corrupt cache files by warning and refreshing", async () => {
    isolatedSkyAgentHome();
    const fetches: any[] = [];
    fs.mkdirSync(path.dirname(profileSnapshotCachePath(uuid, "profile-1")), { recursive: true });
    fs.writeFileSync(profileSnapshotCachePath(uuid, "profile-1"), "{not-json", "utf8");

    const snapshot = await profileSnapshotForPlayer(uuid, "Apple", { now: 5_000, ttlMs: 60_000 }, deps(fetches));

    expect(fetches).toHaveLength(1);
    expect(snapshot.cacheStatus).toBe("refreshed");
    expect(snapshot.warnings).toContainEqual(expect.objectContaining({ code: "profile_cache_corrupt" }));
    expect(JSON.parse(fs.readFileSync(profileSnapshotCachePath(uuid, "profile-1"), "utf8")).schemaVersion).toBe(1);
  });

  test("keeps separate cache entries for profile switching by id or cute name", async () => {
    isolatedSkyAgentHome();
    writeProfileSnapshot(buildProfileSnapshot(context("profile-1", "Apple"), { ttlMs: 60_000, fetchedAtMs: 1_000 }));
    writeProfileSnapshot(buildProfileSnapshot(context("profile-2", "Banana"), { ttlMs: 60_000, fetchedAtMs: 2_000 }));

    const apple = await profileSnapshotForPlayer(uuid, "profile-1", { cacheOnly: true, now: 3_000, ttlMs: 60_000 });
    const banana = await profileSnapshotForPlayer(uuid, "Banana", { cacheOnly: true, now: 3_000, ttlMs: 60_000 });
    const selected = await profileSnapshotForPlayer(uuid, null, { cacheOnly: true, now: 3_000, ttlMs: 60_000 });

    expect(apple.profile).toMatchObject({ profileId: "profile-1", cuteName: "Apple" });
    expect(banana.profile).toMatchObject({ profileId: "profile-2", cuteName: "Banana" });
    expect(selected.profile).toMatchObject({ profileId: "profile-1", cuteName: "Apple" });
  });
});
