import fs from "node:fs";
import path from "node:path";
import { uuidFromNameOrUuid } from "./hypixel.ts";
import { compactProfileOverview, fetchProfileContext } from "./profile.ts";
import { dataDir, readConfig, writeJson } from "./store.ts";

export const PROFILE_SNAPSHOT_SCHEMA_VERSION = 1;
export const DEFAULT_PROFILE_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function safeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function profileSnapshotCacheDir(uuid = null) {
  const base = path.join(dataDir(), "cache", "profile-snapshots");
  return uuid ? path.join(base, safeSegment(uuid)) : base;
}

export function profileSnapshotCachePath(uuid, profileId) {
  return path.join(profileSnapshotCacheDir(uuid), `${safeSegment(profileId)}.json`);
}

function isUuidish(value) {
  return /^[0-9a-fA-F-]{32,36}$/.test(String(value || "").trim());
}

function normalizeTtl(ttlMs = DEFAULT_PROFILE_SNAPSHOT_TTL_MS) {
  const ttl = Number(ttlMs);
  if (!Number.isFinite(ttl) || ttl < 0) {
    throw new Error("Profile snapshot TTL must be a non-negative finite number.");
  }
  return ttl;
}

function playerUsernameHint(player, config = readConfig()) {
  if (player && !isUuidish(player)) {
    return String(player);
  }
  return config.username ?? null;
}

function snapshotFreshness(snapshot, now = Date.now()) {
  const fetchedMs = Date.parse(snapshot.fetchedAt);
  const ttlMs = normalizeTtl(snapshot.ttlMs);
  const ageMs = Number.isFinite(fetchedMs) ? Math.max(0, now - fetchedMs) : Number.POSITIVE_INFINITY;
  const expiresAtMs = Number.isFinite(fetchedMs) ? fetchedMs + ttlMs : 0;
  return {
    ageMs,
    expiresAt: Number.isFinite(fetchedMs) ? nowIso(expiresAtMs) : null,
    stale: ageMs > ttlMs,
  };
}

export function withProfileSnapshotFreshness(snapshot, now = Date.now(), cacheStatus = snapshot.cacheStatus ?? "unknown", warnings = snapshot.warnings ?? []) {
  const freshness = snapshotFreshness(snapshot, now);
  return {
    ...snapshot,
    cacheStatus,
    ageMs: freshness.ageMs,
    expiresAt: freshness.expiresAt,
    stale: freshness.stale,
    warnings,
  };
}

export function buildProfileSnapshot(context, options: Record<string, any> = {}) {
  const fetchedAtMs = options.fetchedAtMs ?? Date.now();
  const ttlMs = normalizeTtl(options.ttlMs);
  const overview = compactProfileOverview(context);
  const username = options.username ?? playerUsernameHint(options.player);
  const profile = {
    profileId: context.profile.profile_id,
    cuteName: context.profile.cute_name ?? null,
    selected: Boolean(context.profile.selected),
    gameMode: context.profile.game_mode ?? "normal",
  };

  return withProfileSnapshotFreshness({
    kind: "skyagent.profileSnapshot",
    schemaVersion: PROFILE_SNAPSHOT_SCHEMA_VERSION,
    sourceProvider: options.sourceProvider ?? "hypixel",
    fetchedAt: nowIso(fetchedAtMs),
    ttlMs,
    player: {
      username,
      uuid: context.uuid,
    },
    profile,
    profiles: context.profiles ?? [],
    overview,
    rateLimit: context.rateLimit ?? null,
  }, fetchedAtMs, "refreshed");
}

export function writeProfileSnapshot(snapshot) {
  const file = profileSnapshotCachePath(snapshot.player.uuid, snapshot.profile.profileId);
  writeJson(file, snapshot);
  return file;
}

function readSnapshotFile(file) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
    if (snapshot?.kind !== "skyagent.profileSnapshot" || snapshot?.schemaVersion !== PROFILE_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error("unsupported profile snapshot schema");
    }
    return { snapshot, warning: null };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { snapshot: null, warning: null };
    }
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best effort recovery; the refresh path can still overwrite this cache later.
    }
    return {
      snapshot: null,
      warning: {
        code: "profile_cache_corrupt",
        message: `Ignored corrupt profile snapshot cache file: ${file}`,
      },
    };
  }
}

function readSnapshotCandidates(uuid) {
  const dir = profileSnapshotCacheDir(uuid);
  try {
    const files = fs.readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => path.join(dir, entry));
    const warnings = [];
    const snapshots = [];
    for (const file of files) {
      const result = readSnapshotFile(file);
      if (result.warning) {
        warnings.push(result.warning);
      }
      if (result.snapshot) {
        snapshots.push(result.snapshot);
      }
    }
    return { snapshots, warnings };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { snapshots: [], warnings: [] };
    }
    throw error;
  }
}

function normalizeSelector(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSelector(snapshot, selector) {
  if (!selector) {
    return true;
  }
  const wanted = normalizeSelector(selector);
  return normalizeSelector(snapshot.profile.profileId) === wanted || normalizeSelector(snapshot.profile.cuteName) === wanted;
}

function newestSnapshot(snapshots) {
  return [...snapshots].sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0] ?? null;
}

export function findCachedProfileSnapshot(uuid, selector = null, options: Record<string, any> = {}) {
  const config = options.config ?? readConfig();
  const requestedSelector = selector ?? config.selectedProfileId ?? null;
  const { snapshots, warnings } = readSnapshotCandidates(uuid);

  if (requestedSelector) {
    const matching = snapshots.filter((snapshot) => matchesSelector(snapshot, requestedSelector));
    return { snapshot: newestSnapshot(matching), warnings };
  }

  const selected = newestSnapshot(snapshots.filter((snapshot) => snapshot.profile.selected));
  if (selected) {
    return { snapshot: selected, warnings };
  }
  return { snapshot: newestSnapshot(snapshots), warnings };
}

export async function profileSnapshotForPlayer(player, selector = null, options: Record<string, any> = {}, deps: Record<string, any> = {}) {
  const config = options.config ?? readConfig();
  const effectiveSelector = selector ?? config.selectedProfileId ?? null;
  const hasRequestTtl = options.ttlMs !== undefined;
  const ttlMs = normalizeTtl(options.ttlMs);
  const now = options.now ?? Date.now();
  const refresh = Boolean(options.refresh);
  const cacheOnly = Boolean(options.cacheOnly);
  const allowStale = Boolean(options.allowStale);
  const resolveUuid = deps.uuidFromNameOrUuid ?? uuidFromNameOrUuid;
  const fetchContext = deps.fetchProfileContext ?? fetchProfileContext;
  const uuid = await resolveUuid(player);
  const cached = findCachedProfileSnapshot(uuid, effectiveSelector, { config });
  const warnings = [...cached.warnings];

  if (!refresh && cached.snapshot) {
    const snapshotForRequest = hasRequestTtl ? { ...cached.snapshot, ttlMs } : cached.snapshot;
    const decorated = withProfileSnapshotFreshness(snapshotForRequest, now, "hit", warnings);
    if (!decorated.stale || allowStale) {
      return decorated;
    }
  }

  if (cacheOnly) {
    throw new Error("No usable profile snapshot cache entry exists for this player/profile.");
  }

  const context = await fetchContext(player ?? uuid, effectiveSelector);
  const snapshot = buildProfileSnapshot(context, {
    player,
    ttlMs,
    fetchedAtMs: now,
  });
  writeProfileSnapshot(snapshot);
  return withProfileSnapshotFreshness(snapshot, now, "refreshed", warnings);
}
