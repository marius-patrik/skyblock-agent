import path from "node:path";
import { dataDir, readJson, writeJson } from "./store.ts";

export const OBJECTIVE_KINDS = ["objective", "task", "buy", "source", "snipe"] as const;
export const OBJECTIVE_STATUSES = ["open", "active", "blocked", "done", "deleted"] as const;
const STATUS_TRANSITIONS: Record<ObjectiveStatus, ObjectiveStatus[]> = {
  open: ["active", "blocked", "done", "deleted"],
  active: ["open", "blocked", "done", "deleted"],
  blocked: ["open", "active", "done", "deleted"],
  done: ["open", "deleted"],
  deleted: [],
};

export type ObjectiveKind = typeof OBJECTIVE_KINDS[number];
export type ObjectiveStatus = typeof OBJECTIVE_STATUSES[number];

export type ObjectiveWarning = {
  code: string;
  message: string;
  sourcePath: string | null;
};

export type ObjectiveFreshness = {
  status: string;
  source: string;
  fetchedAt: string | null;
  warnings: ObjectiveWarning[];
};

export type ObjectiveItem = {
  kind: "skyagent.objectiveItem";
  schemaVersion: 1;
  id: string;
  itemKind: ObjectiveKind;
  title: string;
  status: ObjectiveStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  objectiveId: string | null;
  notes: string | null;
  priority: number | null;
  tags: string[];
  itemId: string | null;
  targetPrice: number | null;
  budget: number | null;
  sourceProvider: string | null;
  freshness: ObjectiveFreshness;
  payload: Record<string, any>;
};

export type ObjectiveStore = {
  kind: "skyagent.objectiveStore";
  schemaVersion: 1;
  updatedAt: string;
  items: ObjectiveItem[];
};

export function objectiveStorePath() {
  return path.join(dataDir(), "objectives.json");
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function stableId(kind: string, now = Date.now()) {
  return `${kind}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeKind(kind: any): ObjectiveKind {
  const normalized = String(kind ?? "objective").toLowerCase();
  if (!OBJECTIVE_KINDS.includes(normalized as ObjectiveKind)) {
    throw new Error(`Unsupported objective item kind: ${kind}`);
  }
  return normalized as ObjectiveKind;
}

function normalizeStatus(status: any): ObjectiveStatus {
  const normalized = String(status ?? "open").toLowerCase();
  if (!OBJECTIVE_STATUSES.includes(normalized as ObjectiveStatus)) {
    throw new Error(`Unsupported objective status: ${status}`);
  }
  return normalized as ObjectiveStatus;
}

function assertStatusTransition(from: ObjectiveStatus, to: ObjectiveStatus) {
  if (from === to) {
    return;
  }
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid objective status transition: ${from} -> ${to}`);
  }
}

function optionalNumber(value: any) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("numeric objective fields must be non-negative finite numbers.");
  }
  return number;
}

function normalizeWarnings(warnings: any[] = []): ObjectiveWarning[] {
  return warnings.filter(Boolean).map((warning) => ({
    code: warning.code ?? "warning",
    message: warning.message ?? String(warning),
    sourcePath: warning.sourcePath ?? warning.source ?? null,
  }));
}

function normalizeFreshness(input: any = {}, now = Date.now()): ObjectiveFreshness {
  return {
    status: input.status ?? "local",
    source: input.source ?? "objective-store",
    fetchedAt: input.fetchedAt ?? nowIso(now),
    warnings: normalizeWarnings(input.warnings ?? []),
  };
}

function emptyStore(): ObjectiveStore {
  return {
    kind: "skyagent.objectiveStore",
    schemaVersion: 1,
    updatedAt: nowIso(),
    items: [],
  };
}

export function readObjectiveStore(): ObjectiveStore {
  const store = readJson(objectiveStorePath(), emptyStore());
  return {
    ...emptyStore(),
    ...store,
    items: Array.isArray(store.items) ? store.items : [],
  };
}

function writeObjectiveStore(store: ObjectiveStore) {
  writeJson(objectiveStorePath(), {
    ...store,
    updatedAt: nowIso(),
  });
}

function findObjectiveItem(store: ObjectiveStore, id: string) {
  const item = store.items.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Objective item not found: ${id}`);
  }
  return item;
}

export function createObjectiveItem(input: Record<string, any>) {
  const itemKind = normalizeKind(input.itemKind ?? input.kind);
  const createdAt = nowIso(input.now);
  const item: ObjectiveItem = {
    kind: "skyagent.objectiveItem",
    schemaVersion: 1,
    id: input.id ?? stableId(itemKind, input.now),
    itemKind,
    title: String(input.title ?? "").trim(),
    status: normalizeStatus(input.status),
    createdAt,
    updatedAt: createdAt,
    completedAt: normalizeStatus(input.status) === "done" ? createdAt : null,
    objectiveId: input.objectiveId ?? null,
    notes: input.notes ?? null,
    priority: optionalNumber(input.priority),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    itemId: input.itemId ?? null,
    targetPrice: optionalNumber(input.targetPrice),
    budget: optionalNumber(input.budget),
    sourceProvider: input.sourceProvider ?? null,
    freshness: normalizeFreshness(input.freshness, input.now),
    payload: input.payload ?? {},
  };
  if (!item.title) {
    throw new Error("Objective item title is required.");
  }

  const store = readObjectiveStore();
  store.items.push(item);
  writeObjectiveStore(store);
  return item;
}

export function listObjectiveItems(filters: Record<string, any> = {}) {
  const itemKind = filters.kind ?? filters.itemKind;
  const status = filters.status;
  const includeDeleted = Boolean(filters.includeDeleted);
  const items = readObjectiveStore().items
    .filter((item) => !itemKind || item.itemKind === normalizeKind(itemKind))
    .filter((item) => !status || item.status === normalizeStatus(status))
    .filter((item) => includeDeleted || item.status !== "deleted")
    .sort((left, right) => (right.priority ?? -1) - (left.priority ?? -1) || left.createdAt.localeCompare(right.createdAt));
  return {
    kind: "skyagent.objectiveList",
    schemaVersion: 1,
    generatedAt: nowIso(filters.now),
    count: items.length,
    items,
  };
}

export function updateObjectiveItem(id: string, patch: Record<string, any>) {
  const store = readObjectiveStore();
  const item = findObjectiveItem(store, id);
  if (patch.title !== undefined) {
    const title = String(patch.title).trim();
    if (!title) {
      throw new Error("Objective item title is required.");
    }
    item.title = title;
  }
  if (patch.status !== undefined) {
    const status = normalizeStatus(patch.status);
    assertStatusTransition(item.status, status);
    item.status = status;
    item.completedAt = item.status === "done" ? nowIso(patch.now) : null;
  }
  if (patch.objectiveId !== undefined) item.objectiveId = patch.objectiveId || null;
  if (patch.notes !== undefined) item.notes = patch.notes || null;
  if (patch.priority !== undefined) item.priority = optionalNumber(patch.priority);
  if (patch.tags !== undefined) item.tags = Array.isArray(patch.tags) ? patch.tags.map(String) : [];
  if (patch.itemId !== undefined) item.itemId = patch.itemId || null;
  if (patch.targetPrice !== undefined) item.targetPrice = optionalNumber(patch.targetPrice);
  if (patch.budget !== undefined) item.budget = optionalNumber(patch.budget);
  if (patch.sourceProvider !== undefined) item.sourceProvider = patch.sourceProvider || null;
  if (patch.freshness !== undefined) item.freshness = normalizeFreshness(patch.freshness, patch.now);
  if (patch.payload !== undefined) item.payload = patch.payload ?? {};
  item.updatedAt = nowIso(patch.now);
  writeObjectiveStore(store);
  return item;
}

export function completeObjectiveItem(id: string, patch: Record<string, any> = {}) {
  return updateObjectiveItem(id, { ...patch, status: "done" });
}

export function deleteObjectiveItem(id: string, patch: Record<string, any> = {}) {
  return updateObjectiveItem(id, { ...patch, status: "deleted" });
}

export function objectiveContextSummary(options: Record<string, any> = {}) {
  const items = listObjectiveItems({ includeDeleted: false }).items;
  const active = items.filter((item) => item.status === "open" || item.status === "active" || item.status === "blocked");
  const byKind = Object.fromEntries(OBJECTIVE_KINDS.map((kind) => [kind, active.filter((item) => item.itemKind === kind).length]));
  return {
    kind: "skyagent.objectiveSummary",
    schemaVersion: 1,
    generatedAt: nowIso(options.now),
    counts: byKind,
    active: active.slice(0, options.limit ?? 10).map((item) => ({
      id: item.id,
      itemKind: item.itemKind,
      title: item.title,
      status: item.status,
      priority: item.priority,
      itemId: item.itemId,
      targetPrice: item.targetPrice,
      budget: item.budget,
      sourceProvider: item.sourceProvider,
      freshness: item.freshness,
    })),
  };
}
