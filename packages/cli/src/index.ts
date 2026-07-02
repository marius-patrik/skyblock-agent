#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { addMemory, configPath, deleteMemory, publicConfig, readMemories, setConfigValue } from "@skyagent/core/store";
import { agentContextForPlayer } from "@skyagent/core/agent-context";
import { persistContextEvent, readPersistedContextEvents, serverStatusForPlayer, subscribeContextEvents } from "@skyagent/core/context-events";
import { DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS, DEFAULT_ACCESSORY_TIMEOUT_MS, accessoriesForPlayer, accessoryUpgradesForPlayer, missingAccessoriesForPlayer } from "@skyagent/core/accessories";
import { configuredProfileId, hypixelRequest, resolveMinecraftUsername, resourceEndpoint, skyblockProfiles, uuidFromNameOrUuid } from "@skyagent/core/hypixel";
import { inventoryForPlayer, inventorySectionForPlayer } from "@skyagent/core/inventory";
import { itemMetadata, normalizedItemsForPlayer } from "@skyagent/core/items";
import { llmProviderStatus, publicLlmProviderConfig, setLlmProviderConfigValue } from "@skyagent/core/llm-provider";
import { DEFAULT_NETWORTH_INCLUDE_ITEMS, DEFAULT_NETWORTH_MAX_ITEMS, DEFAULT_NETWORTH_TIMEOUT_MS, itemNetworthForPlayer, networthForPlayer } from "@skyagent/core/networth";
import { completeObjectiveItem, createObjectiveItem, deleteObjectiveItem, listObjectiveItems, updateObjectiveItem } from "@skyagent/core/objectives";
import { nextUpgradesForPlayer, planGoalForPlayer } from "@skyagent/core/planner";
import { coflnetPriceHistory, itemPrice, lowestBin } from "@skyagent/core/prices";
import { profileSnapshotForPlayer } from "@skyagent/core/profile-cache";
import { compactProfileOverview, fetchProfileContext, profileSummaries, skycryptUrl } from "@skyagent/core/profile";
import { readinessForPlayer } from "@skyagent/core/readiness";
import { profileSectionForPlayer, progressionForPlayer } from "@skyagent/core/sections";
import { runSetup, setupStatus } from "@skyagent/core/setup";
import { weightForPlayer } from "@skyagent/core/weight";
import { gatewayCommand } from "./gateway.ts";
import { installUpdate, parseUpdateArgs, updatePlan } from "./update.ts";
import { webCommand } from "./web.ts";

function print(value, pretty = true) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function printLine(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function usage() {
  process.stdout.write(`SkyAgent CLI

Usage:
  skyagent config get [--show-key]
  skyagent config path
  skyagent config set username <minecraftName>
  skyagent config set uuid <uuid>
  skyagent config set profile <profileId>
  skyagent config set api-key <key>
  skyagent setup [--json] [--username <name>] [--api-key <key>] [--profile <profileIdOrName>] [--no-write]
  skyagent setup status [--json]
  skyagent provider status [--json]
  skyagent provider config get [--json]
  skyagent provider config set <provider|base-url|model|api-key|timeout-ms|max-retries|rate-limit-rpm|rate-limit-tpm|budget-usd|budget-window> <value> [--json]
  skyagent version [--json]
  skyagent doctor [--json]
  skyagent context [nameOrUuid] [profileIdOrName] [--cache-only] [--allow-stale] [--ttl-ms <ms>]  # cached read
  skyagent context refresh [nameOrUuid] [profileIdOrName] [--ttl-ms <ms>]
  skyagent context watch [--since <sequence>] [--limit <n>] [--once]
  skyagent context emit [type] [--message <text>]
  skyagent server-status [nameOrUuid]
  skyagent objective create <objective|task|buy|source|snipe> <title> [--objective <id>] [--item-id <id>] [--target-price <coins>] [--budget <coins>] [--priority <n>] [--source-provider <name>] [--freshness-status <status>] [--freshness-source <source>] [--freshness-fetched-at <iso>] [--warning <code:message[:sourcePath]>...] [--note <text>] [--tag <tag>...]
  skyagent objective list [--kind <kind>] [--status <status>] [--include-deleted]
  skyagent objective update <id> [--title <text>] [--status <status>] [--objective <id>] [--item-id <id>] [--target-price <coins>] [--budget <coins>] [--priority <n>] [--source-provider <name>] [--freshness-status <status>] [--freshness-source <source>] [--freshness-fetched-at <iso>] [--warning <code:message[:sourcePath]>...] [--note <text>] [--tag <tag>...]
  skyagent objective complete <id>
  skyagent objective delete <id>
  skyagent update check [--json] [--version <version>]
  skyagent update install [--json] [--version <version>] [--dry-run] [--restart <gateway|web|all>]
  skyagent resolve <minecraftName>
  skyagent player [nameOrUuid]
  skyagent status [nameOrUuid]
  skyagent profiles [nameOrUuid]
  skyagent profiles-summary [nameOrUuid]
  skyagent profile [profileId]
  skyagent profile-snapshot [nameOrUuid] [profileIdOrName] [--refresh] [--cache-only] [--allow-stale] [--ttl-ms <ms>]
  skyagent member [nameOrUuid] [profileIdOrName]
  skyagent overview [nameOrUuid] [profileIdOrName]
  skyagent inventory [nameOrUuid] [profileIdOrName] [--debug-raw]
  skyagent inventory-section <section> [nameOrUuid] [profileIdOrName] [--debug-raw]
  skyagent item-dump [nameOrUuid] [profileIdOrName] --section <section> [--debug-raw]
  skyagent normalize-items [nameOrUuid] [profileIdOrName]
  skyagent networth [nameOrUuid] [profileIdOrName] [--max-items <n>] [--timeout-ms <ms>] [--details]
  skyagent item-networth [nameOrUuid] [profileIdOrName] --section <section> [--max-items <n>] [--timeout-ms <ms>] [--summary]
  skyagent accessories [nameOrUuid] [profileIdOrName] [--max-price-lookups <n>] [--timeout-ms <ms>]
  skyagent missing-accessories [nameOrUuid] [profileIdOrName] [--max-price-lookups <n>] [--timeout-ms <ms>]
  skyagent accessory-upgrades [nameOrUuid] [profileIdOrName] --budget <coins> [--max-price-lookups <n>] [--timeout-ms <ms>]
  skyagent section <name> [nameOrUuid] [profileIdOrName]
  skyagent progression [nameOrUuid] [profileIdOrName]
  skyagent weight [nameOrUuid] [profileIdOrName]
  skyagent readiness <dungeons|slayer|kuudra|garden|mining> [nameOrUuid] [profileIdOrName]
  skyagent plan <goal> [nameOrUuid] [profileIdOrName] [--budget <coins>] [--use-context] [--persist-objectives] [--objective <id>] [--max-items <n>] [--networth-timeout-ms <ms>] [--max-price-lookups <n>] [--accessory-timeout-ms <ms>]
  skyagent next-upgrades [nameOrUuid] [profileIdOrName] --budget <coins> [--max-price-lookups <n>] [--accessory-timeout-ms <ms>]
  skyagent item <internalId>
  skyagent price <itemId>
  skyagent lbin <itemId>
  skyagent price-history <itemId> [window]
  skyagent skycrypt [nameOrUuid] [profileName]
  skyagent museum [profileId]
  skyagent garden [profileId]
  skyagent bingo [nameOrUuid]
  skyagent resource <collections|skills|items|election|bingo>
  skyagent bazaar
  skyagent auctions [page]
  skyagent auction <uuid|player|profile> <id>
  skyagent auctions-ended
  skyagent firesales
  skyagent news
  skyagent request <v2/path> [key=value ...]
  skyagent gateway start [--json]
  skyagent gateway stop [--json]
  skyagent gateway restart [--json]
  skyagent gateway status [--json]
  skyagent gateway logs [--json]
  skyagent web start [--no-open] [--json]
  skyagent web stop [--json]
  skyagent web restart [--no-open] [--json]
  skyagent web status [--json]
  skyagent web open [--json]
  skyagent web logs [--json]
  skyagent memory add <text> [tag ...]
  skyagent memory list
  skyagent memory get <id>
  skyagent memory delete <id>

Secrets are read from HYPIXEL_API_KEY first, then the user config file.
LLM provider secrets are read from SKYAGENT_LITELLM_API_KEY first, then the SkyAgent user config file.
`);
}

function kvPairs(args) {
  const query = {};
  for (const arg of args) {
    const index = arg.indexOf("=");
    if (index === -1) {
      throw new Error(`Expected key=value, got: ${arg}`);
    }
    query[arg.slice(0, index)] = arg.slice(index + 1);
  }
  return query;
}

function withoutFlags(args) {
  return args.filter((arg) => !arg.startsWith("--"));
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? null : args[index + 1] ?? null;
}

function optionValues(args, option) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === option && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function parseWarningValue(value: string) {
  const [code, message, ...sourceParts] = String(value).split(":");
  if (!code || !message) {
    throw new Error("--warning values must use code:message[:sourcePath]");
  }
  return {
    code,
    message,
    sourcePath: sourceParts.join(":") || null,
  };
}

function positionalArgs(args, optionsWithValues = []) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      if (optionsWithValues.includes(arg)) {
        index += 1;
      }
      continue;
    }
    values.push(arg);
  }
  return values;
}

export function parseInventoryArgs(args) {
  return {
    values: withoutFlags(args),
    debugRaw: args.includes("--debug-raw"),
  };
}

export function parseItemDumpArgs(args) {
  const section = optionValue(args, "--section");
  return {
    section,
    values: positionalArgs(args, ["--section"]),
    debugRaw: args.includes("--debug-raw"),
  };
}

export function parseItemNetworthArgs(args) {
  const section = optionValue(args, "--section");
  return {
    section,
    values: positionalArgs(args, ["--section", "--max-items", "--timeout-ms", "--summary", "--details"]),
    ...parseNetworthBounds(args, true),
  };
}

function optionalNumericOption(args, option) {
  const value = optionValue(args, option);
  return value === null ? undefined : Number(value);
}

function parseNetworthBounds(args, defaultIncludeItems = DEFAULT_NETWORTH_INCLUDE_ITEMS) {
  return {
    maxItems: optionalNumericOption(args, "--max-items") ?? DEFAULT_NETWORTH_MAX_ITEMS,
    timeoutMs: optionalNumericOption(args, "--timeout-ms") ?? DEFAULT_NETWORTH_TIMEOUT_MS,
    includeItems: args.includes("--summary") ? false : args.includes("--details") ? true : defaultIncludeItems,
  };
}

function parseAccessoryBounds(args) {
  return {
    maxPriceLookups: optionalNumericOption(args, "--max-price-lookups") ?? DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS,
    timeoutMs: optionalNumericOption(args, "--timeout-ms") ?? optionalNumericOption(args, "--accessory-timeout-ms") ?? DEFAULT_ACCESSORY_TIMEOUT_MS,
  };
}

export function parseAccessoryUpgradeArgs(args) {
  const budget = optionValue(args, "--budget");
  return {
    budget: budget === null ? null : Number(budget),
    values: positionalArgs(args, ["--budget", "--max-price-lookups", "--timeout-ms", "--accessory-timeout-ms"]),
    ...parseAccessoryBounds(args),
  };
}

export function parseNextUpgradesArgs(args) {
  const budget = optionValue(args, "--budget");
  return {
    budget: budget === null ? null : Number(budget),
    values: positionalArgs(args, ["--budget", "--max-price-lookups", "--accessory-timeout-ms"]),
    maxPriceLookups: optionalNumericOption(args, "--max-price-lookups") ?? DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS,
    accessoryTimeoutMs: optionalNumericOption(args, "--accessory-timeout-ms") ?? DEFAULT_ACCESSORY_TIMEOUT_MS,
  };
}

export function parsePlanArgs(args) {
  const budget = optionValue(args, "--budget");
  return {
    goal: args[0] ?? null,
    budget: budget === null ? null : Number(budget),
    values: positionalArgs(args.slice(1), ["--budget", "--use-context", "--persist-objectives", "--objective", "--max-items", "--networth-timeout-ms", "--max-price-lookups", "--accessory-timeout-ms"]),
    useContext: args.includes("--use-context"),
    persistObjectives: args.includes("--persist-objectives"),
    objectiveId: optionValue(args, "--objective"),
    maxItems: optionalNumericOption(args, "--max-items") ?? DEFAULT_NETWORTH_MAX_ITEMS,
    networthTimeoutMs: optionalNumericOption(args, "--networth-timeout-ms") ?? DEFAULT_NETWORTH_TIMEOUT_MS,
    maxPriceLookups: optionalNumericOption(args, "--max-price-lookups") ?? DEFAULT_ACCESSORY_MAX_PRICE_LOOKUPS,
    accessoryTimeoutMs: optionalNumericOption(args, "--accessory-timeout-ms") ?? DEFAULT_ACCESSORY_TIMEOUT_MS,
  };
}

export function parseSetupArgs(args) {
  return {
    json: args.includes("--json"),
    noWrite: args.includes("--no-write"),
    username: optionValue(args, "--username"),
    apiKey: optionValue(args, "--api-key"),
    profile: optionValue(args, "--profile"),
  };
}

export function parseProfileSnapshotArgs(args) {
  const ttl = optionValue(args, "--ttl-ms");
  return {
    values: positionalArgs(args, ["--ttl-ms"]),
    refresh: args.includes("--refresh"),
    cacheOnly: args.includes("--cache-only"),
    allowStale: args.includes("--allow-stale"),
    ttlMs: ttl === null ? undefined : Number(ttl),
  };
}

export function parseContextArgs(args) {
  const ttl = optionValue(args, "--ttl-ms");
  return {
    refresh: args[0] === "refresh",
    values: positionalArgs(args[0] === "refresh" ? args.slice(1) : args, ["--ttl-ms"]),
    cacheOnly: args.includes("--cache-only"),
    allowStale: args.includes("--allow-stale"),
    ttlMs: ttl === null ? undefined : Number(ttl),
  };
}

function parseObjectivePatchArgs(args) {
  const patch: Record<string, any> = {};
  const map = {
    "--title": "title",
    "--status": "status",
    "--objective": "objectiveId",
    "--item-id": "itemId",
    "--target-price": "targetPrice",
    "--budget": "budget",
    "--priority": "priority",
    "--source-provider": "sourceProvider",
    "--note": "notes",
  };
  for (const [flag, key] of Object.entries(map)) {
    const value = optionValue(args, flag);
    if (value !== null) {
      patch[key] = value;
    }
  }
  const tags = optionValues(args, "--tag");
  if (tags.length) {
    patch.tags = tags;
  }
  const freshness: Record<string, any> = {};
  const freshnessStatus = optionValue(args, "--freshness-status");
  const freshnessSource = optionValue(args, "--freshness-source");
  const freshnessFetchedAt = optionValue(args, "--freshness-fetched-at");
  if (freshnessStatus !== null) freshness.status = freshnessStatus;
  if (freshnessSource !== null) freshness.source = freshnessSource;
  if (freshnessFetchedAt !== null) freshness.fetchedAt = freshnessFetchedAt;
  const warnings = optionValues(args, "--warning").map(parseWarningValue);
  if (warnings.length) freshness.warnings = warnings;
  if (Object.keys(freshness).length) {
    patch.freshness = freshness;
  }
  return patch;
}

function parseObjectiveCreateArgs(args) {
  const [itemKind, ...rest] = args;
  const titleParts = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--")) {
      index += 1;
      continue;
    }
    titleParts.push(arg);
  }
  return {
    ...parseObjectivePatchArgs(rest),
    itemKind,
    title: titleParts.join(" "),
  };
}

async function watchContextEvents(args) {
  let latestSequence = Number(optionValue(args, "--since") ?? 0);
  const batch = readPersistedContextEvents({
    sinceSequence: optionValue(args, "--since") ?? 0,
    limit: optionValue(args, "--limit") ?? undefined,
  });
  latestSequence = Math.max(latestSequence, batch.latestSequence);
  if (args.includes("--once")) {
    print(batch);
    return;
  }

  for (const event of batch.events) {
    printLine(event);
  }

  await new Promise<void>((resolve) => {
    const unsubscribe = subscribeContextEvents((event) => {
      latestSequence = Math.max(latestSequence, event.sequence);
      printLine(event);
    });
    const interval = setInterval(() => {
      const nextBatch = readPersistedContextEvents({ sinceSequence: latestSequence });
      latestSequence = Math.max(latestSequence, nextBatch.latestSequence);
      for (const event of nextBatch.events) {
        printLine(event);
      }
    }, 1_000);
    function cleanup() {
      clearInterval(interval);
      unsubscribe();
      process.off("SIGINT", cleanup);
      process.off("SIGTERM", cleanup);
      resolve();
    }
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  });
}

async function hiddenQuestion(prompt: string) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Hidden setup prompts require an interactive TTY. Use --api-key for non-interactive setup.");
  }
  process.stderr.write(prompt);
  const stdin = process.stdin;
  const previousRawMode = stdin.isRaw;
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(previousRawMode);
      process.stderr.write("\n");
    }
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Setup cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\b" || char === "\u007f") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }
    stdin.on("data", onData);
  });
}

async function promptSetupInputs(initial) {
  const current = publicConfig();
  if (!process.stdin.isTTY || initial.json) {
    return initial;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const username = initial.username ?? current.username ?? await rl.question("Minecraft username: ");
    const apiKey = initial.apiKey ?? (current.apiKeyConfigured ? null : await hiddenQuestion("Hypixel API key: "));
    const profile = initial.profile ?? await rl.question("SkyBlock profile name or ID (blank for selected/default): ");
    return {
      ...initial,
      username: username || null,
      apiKey: apiKey || null,
      profile: profile || null,
    };
  } finally {
    rl.close();
  }
}

function pathEntries() {
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
}

function commandOnPath(name: string) {
  const candidates = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name];
  return pathEntries().some((entry) => candidates.some((candidate) => fs.existsSync(path.join(entry, candidate))));
}

export function doctorStatus() {
  const setup = setupStatus();
  const installDir = setup.installPath ? path.dirname(setup.installPath) : null;
  const installDirOnPath = installDir ? pathEntries().some((entry) => path.resolve(entry).toLowerCase() === path.resolve(installDir).toLowerCase()) : false;
  return {
    ok: Boolean(setup.version && setup.dataDir),
    version: setup.version,
    installPath: setup.installPath,
    installDir,
    installDirOnPath,
    skyagentOnPath: commandOnPath("skyagent"),
    runtime: {
      bun: typeof Bun !== "undefined" ? Bun.version : null,
      platform: process.platform,
      arch: process.arch,
    },
    dataDir: setup.dataDir,
    config: setup.config,
  };
}

export async function command(args) {
  const [area, action, ...rest] = args;

  if (!area || area === "help" || area === "--help" || area === "-h") {
    usage();
    return;
  }

  if (area === "config") {
    if (action === "path") {
      print({ configPath: configPath() });
      return;
    }
    if (action === "get") {
      const config: Record<string, unknown> = publicConfig();
      if (rest.includes("--show-key")) {
        config.warning = "API key values are intentionally not printed by this CLI.";
      }
      print(config);
      return;
    }
    if (action === "set") {
      const [key, ...valueParts] = rest;
      const value = valueParts.join(" ");
      const keyMap = {
        username: "username",
        uuid: "uuid",
        profile: "selectedProfileId",
        "api-key": "apiKey",
      };
      if (!keyMap[key]) {
        throw new Error("Supported config keys: username, uuid, profile, api-key");
      }
      print(setConfigValue(keyMap[key], value));
      return;
    }
  }

  if (area === "setup") {
    const args = [action, ...rest].filter(Boolean);
    const compact = args.includes("--json");
    if (action === "status") {
      print(setupStatus(), !compact);
      return;
    }
    const parsed = parseSetupArgs(args);
    const inputs = await promptSetupInputs(parsed);
    print(await runSetup({
      username: inputs.username,
      apiKey: inputs.apiKey,
      profile: inputs.profile,
      write: !inputs.noWrite,
    }), !compact);
    return;
  }

  if (area === "provider") {
    const args = [action, ...rest].filter(Boolean);
    const compact = args.includes("--json");
    if (action === "status") {
      print(await llmProviderStatus(), !compact);
      return;
    }
    if (action === "config") {
      const [configAction, ...configRest] = rest;
      const configArgs = [configAction, ...configRest].filter(Boolean);
      const configCompact = configArgs.includes("--json");
      if (configAction === "get") {
        print(publicLlmProviderConfig(), !configCompact);
        return;
      }
      if (configAction === "set") {
        const values = configRest.filter((arg) => arg !== "--json");
        const [key, ...valueParts] = values;
        if (!key) {
          throw new Error("Usage: skyagent provider config set <provider|base-url|model|api-key|timeout-ms|max-retries|rate-limit-rpm|rate-limit-tpm|budget-usd|budget-window> <value>");
        }
        print(setLlmProviderConfigValue(key, valueParts.join(" ")), !configCompact);
        return;
      }
    }
    throw new Error("Usage: skyagent provider status|config get|config set");
  }

  if (area === "version") {
    const compact = [action, ...rest].includes("--json");
    const version = setupStatus().version;
    print({ version }, !compact);
    return;
  }

  if (area === "doctor") {
    const compact = [action, ...rest].includes("--json");
    print(doctorStatus(), !compact);
    return;
  }

  if (area === "context") {
    if (action === "watch") {
      await watchContextEvents(rest);
      return;
    }
    if (action === "emit") {
      print(persistContextEvent({
        type: rest.find((arg) => !arg.startsWith("--")) ?? "cli.context_event",
        source: { kind: "cli", transport: "command" },
        payload: { message: optionValue(rest, "--message") ?? null },
        freshness: { status: "local", source: "cli" },
      }));
      return;
    }
    const parsed = parseContextArgs([action, ...rest].filter(Boolean));
    print(await agentContextForPlayer(parsed.values[0], parsed.values[1], {
      refresh: parsed.refresh,
      cacheOnly: parsed.cacheOnly ? true : undefined,
      allowStale: parsed.allowStale,
      ttlMs: parsed.ttlMs,
    }));
    return;
  }

  if (area === "server-status") {
    print(await serverStatusForPlayer(action));
    return;
  }

  if (area === "objective") {
    if (action === "create") {
      print(createObjectiveItem(parseObjectiveCreateArgs(rest)));
      return;
    }
    if (action === "list") {
      print(listObjectiveItems({
        kind: optionValue(rest, "--kind") ?? optionValue(rest, "--type"),
        status: optionValue(rest, "--status"),
        includeDeleted: rest.includes("--include-deleted"),
      }));
      return;
    }
    if (action === "update") {
      if (!rest[0]) {
        throw new Error("Usage: skyagent objective update <id> [flags]");
      }
      print(updateObjectiveItem(rest[0], parseObjectivePatchArgs(rest.slice(1))));
      return;
    }
    if (action === "complete") {
      print(completeObjectiveItem(rest[0]));
      return;
    }
    if (action === "delete") {
      print(deleteObjectiveItem(rest[0]));
      return;
    }
    throw new Error("Usage: skyagent objective create|list|update|complete|delete");
  }

  if (area === "update") {
    const parsed = parseUpdateArgs(rest);
    if (action === "check") {
      print(await updatePlan({ version: parsed.version }), !parsed.json);
      return;
    }
    if (action === "install") {
      print(await installUpdate({ version: parsed.version, dryRun: parsed.dryRun, restart: parsed.restart }), !parsed.json);
      return;
    }
    throw new Error("Usage: skyagent update check|install [--version <version>] [--dry-run] [--restart <gateway|web|all>]");
  }

  if (area === "gateway") {
    const compact = rest.includes("--json");
    print(await gatewayCommand(action, rest.filter((arg) => arg !== "--json")), !compact);
    return;
  }

  if (area === "web") {
    const compact = rest.includes("--json");
    print(await webCommand(action, rest.filter((arg) => arg !== "--json")), !compact);
    return;
  }

  if (area === "memory") {
    if (action === "add") {
      const text = rest[0];
      const tags = rest.slice(1);
      if (!text) {
        throw new Error("Memory text is required.");
      }
      print(addMemory({ text, tags }));
      return;
    }
    if (action === "list") {
      print(readMemories());
      return;
    }
    if (action === "get") {
      const id = rest[0];
      print(readMemories().find((memory) => memory.id === id) ?? null);
      return;
    }
    if (action === "delete") {
      print(deleteMemory(rest[0]));
      return;
    }
  }

  if (area === "resolve") {
    print(await resolveMinecraftUsername(action));
    return;
  }

  if (area === "player") {
    const uuid = await uuidFromNameOrUuid(action);
    print(await hypixelRequest("player", { uuid }, { requireKey: true }));
    return;
  }

  if (area === "status") {
    const uuid = await uuidFromNameOrUuid(action);
    print(await hypixelRequest("status", { uuid }, { requireKey: true }));
    return;
  }

  if (area === "profiles") {
    print(await skyblockProfiles(action));
    return;
  }

  if (area === "profiles-summary") {
    const uuid = await uuidFromNameOrUuid(action);
    const response = await skyblockProfiles(uuid);
    print({
      uuid,
      profiles: profileSummaries(response.body?.profiles ?? [], uuid),
      rateLimit: response.rateLimit,
    });
    return;
  }

  if (area === "profile-snapshot") {
    const parsed = parseProfileSnapshotArgs([action, ...rest].filter(Boolean));
    print(await profileSnapshotForPlayer(parsed.values[0], parsed.values[1], {
      refresh: parsed.refresh,
      cacheOnly: parsed.cacheOnly,
      allowStale: parsed.allowStale,
      ttlMs: parsed.ttlMs,
    }));
    return;
  }

  if (area === "member") {
    const context = await fetchProfileContext(action, rest[0]);
    print({
      uuid: context.uuid,
      profile: {
        profileId: context.profile.profile_id,
        cuteName: context.profile.cute_name ?? null,
      },
      member: context.member,
      rateLimit: context.rateLimit,
    });
    return;
  }

  if (area === "overview") {
    print(compactProfileOverview(await fetchProfileContext(action, rest[0])));
    return;
  }

  if (area === "inventory") {
    const args = [action, ...rest].filter(Boolean);
    const parsed = parseInventoryArgs(args);
    print(await inventoryForPlayer(parsed.values[0], parsed.values[1], { debugRaw: parsed.debugRaw }));
    return;
  }

  if (area === "inventory-section") {
    const values = withoutFlags(rest);
    print(await inventorySectionForPlayer(action, values[0], values[1], { debugRaw: rest.includes("--debug-raw") }));
    return;
  }

  if (area === "item-dump") {
    const args = [action, ...rest].filter(Boolean);
    const parsed = parseItemDumpArgs(args);
    if (!parsed.section) {
      throw new Error("Usage: skyagent item-dump [nameOrUuid] [profileIdOrName] --section <section>");
    }
    const result = await inventorySectionForPlayer(parsed.section, parsed.values[0], parsed.values[1], { debugRaw: parsed.debugRaw });
    print({
      uuid: result.uuid,
      profile: result.profile,
      section: result.section,
      sourcePath: result.sourcePath,
      itemCount: result.itemCount,
      items: result.items,
      warnings: result.warnings,
    });
    return;
  }

  if (area === "normalize-items") {
    const values = withoutFlags([action, ...rest].filter(Boolean));
    print(await normalizedItemsForPlayer(values[0], values[1]));
    return;
  }

  if (area === "networth") {
    const args = [action, ...rest].filter(Boolean);
    const values = positionalArgs(args, ["--max-items", "--timeout-ms", "--summary", "--details"]);
    const bounds = parseNetworthBounds(args);
    print(await networthForPlayer(values[0], values[1], bounds));
    return;
  }

  if (area === "item-networth") {
    const args = [action, ...rest].filter(Boolean);
    const parsed = parseItemNetworthArgs(args);
    if (!parsed.section) {
      throw new Error("Usage: skyagent item-networth [nameOrUuid] [profileIdOrName] --section <section>");
    }
    print(await itemNetworthForPlayer(parsed.values[0], parsed.values[1], parsed.section, {
      maxItems: parsed.maxItems,
      timeoutMs: parsed.timeoutMs,
      includeItems: parsed.includeItems,
    }));
    return;
  }

  if (area === "accessories") {
    const args = [action, ...rest].filter(Boolean);
    const values = positionalArgs(args, ["--max-price-lookups", "--timeout-ms"]);
    print(await accessoriesForPlayer(values[0], values[1], parseAccessoryBounds(args)));
    return;
  }

  if (area === "missing-accessories") {
    const args = [action, ...rest].filter(Boolean);
    const values = positionalArgs(args, ["--max-price-lookups", "--timeout-ms"]);
    print(await missingAccessoriesForPlayer(values[0], values[1], parseAccessoryBounds(args)));
    return;
  }

  if (area === "accessory-upgrades") {
    const parsed = parseAccessoryUpgradeArgs([action, ...rest].filter(Boolean));
    if (parsed.budget === null || !Number.isFinite(parsed.budget) || parsed.budget < 0) {
      throw new Error("Usage: skyagent accessory-upgrades [nameOrUuid] [profileIdOrName] --budget <coins>");
    }
    print(await accessoryUpgradesForPlayer(parsed.values[0], parsed.values[1], parsed.budget, {
      maxPriceLookups: parsed.maxPriceLookups,
      timeoutMs: parsed.timeoutMs,
    }));
    return;
  }

  if (area === "section") {
    if (!action) {
      throw new Error("Usage: skyagent section <name> [nameOrUuid] [profileIdOrName]");
    }
    print(await profileSectionForPlayer(action, rest[0], rest[1]));
    return;
  }

  if (area === "progression") {
    const values = withoutFlags([action, ...rest].filter(Boolean));
    print(await progressionForPlayer(values[0], values[1]));
    return;
  }

  if (area === "weight") {
    const values = withoutFlags([action, ...rest].filter(Boolean));
    print(await weightForPlayer(values[0], values[1]));
    return;
  }

  if (area === "readiness") {
    if (!action) {
      throw new Error("Usage: skyagent readiness <dungeons|slayer|kuudra|garden|mining> [nameOrUuid] [profileIdOrName]");
    }
    print(await readinessForPlayer(action, rest[0], rest[1]));
    return;
  }

  if (area === "plan") {
    const parsed = parsePlanArgs([action, ...rest].filter(Boolean));
    if (!parsed.goal) {
      throw new Error("Usage: skyagent plan <goal> [nameOrUuid] [profileIdOrName] [--budget <coins>]");
    }
    if (parsed.budget !== null && (!Number.isFinite(parsed.budget) || parsed.budget < 0)) {
      throw new Error("Usage: skyagent plan <goal> [nameOrUuid] [profileIdOrName] [--budget <coins>]");
    }
    print(await planGoalForPlayer(parsed.goal, parsed.values[0], parsed.values[1], {
      budget: parsed.budget,
      useContext: parsed.useContext,
      persistObjectives: parsed.persistObjectives,
      objectiveId: parsed.objectiveId,
      maxItems: parsed.maxItems,
      networthTimeoutMs: parsed.networthTimeoutMs,
      maxPriceLookups: parsed.maxPriceLookups,
      accessoryTimeoutMs: parsed.accessoryTimeoutMs,
    }));
    return;
  }

  if (area === "next-upgrades") {
    const parsed = parseNextUpgradesArgs([action, ...rest].filter(Boolean));
    if (parsed.budget === null || !Number.isFinite(parsed.budget) || parsed.budget < 0) {
      throw new Error("Usage: skyagent next-upgrades [nameOrUuid] [profileIdOrName] --budget <coins>");
    }
    print(await nextUpgradesForPlayer(parsed.values[0], parsed.values[1], parsed.budget, {
      maxPriceLookups: parsed.maxPriceLookups,
      accessoryTimeoutMs: parsed.accessoryTimeoutMs,
    }));
    return;
  }

  if (area === "item") {
    if (!action) {
      throw new Error("Usage: skyagent item <internalId>");
    }
    print(await itemMetadata(action));
    return;
  }

  if (area === "price") {
    if (!action) {
      throw new Error("Usage: skyagent price <itemId>");
    }
    print(await itemPrice(action));
    return;
  }

  if (area === "lbin") {
    if (!action) {
      throw new Error("Usage: skyagent lbin <itemId>");
    }
    print(await lowestBin(action));
    return;
  }

  if (area === "price-history") {
    if (!action) {
      throw new Error("Usage: skyagent price-history <itemId> [window]");
    }
    print(await coflnetPriceHistory(action, rest[0]));
    return;
  }

  if (area === "skycrypt") {
    print({ url: skycryptUrl(action ?? publicConfig().username ?? publicConfig().uuid, rest[0]) });
    return;
  }

  if (area === "profile") {
    print(await hypixelRequest("skyblock/profile", { profile: await configuredProfileId(action) }, { requireKey: true }));
    return;
  }

  if (area === "museum") {
    print(await hypixelRequest("skyblock/museum", { profile: await configuredProfileId(action) }, { requireKey: true }));
    return;
  }

  if (area === "garden") {
    print(await hypixelRequest("skyblock/garden", { profile: await configuredProfileId(action) }, { requireKey: true }));
    return;
  }

  if (area === "bingo") {
    const uuid = await uuidFromNameOrUuid(action);
    print(await hypixelRequest("skyblock/bingo", { uuid }, { requireKey: true }));
    return;
  }

  if (area === "resource") {
    print(await hypixelRequest(resourceEndpoint(action)));
    return;
  }

  if (area === "bazaar") {
    print(await hypixelRequest("skyblock/bazaar"));
    return;
  }

  if (area === "auctions") {
    print(await hypixelRequest("skyblock/auctions", { page: action || 0 }));
    return;
  }

  if (area === "auction") {
    const [lookupType, lookupId] = [action, rest[0]];
    if (!["uuid", "player", "profile"].includes(lookupType) || !lookupId) {
      throw new Error("Usage: skyagent auction <uuid|player|profile> <id>");
    }
    print(await hypixelRequest("skyblock/auction", { [lookupType]: lookupId }, { requireKey: true }));
    return;
  }

  if (area === "auctions-ended") {
    print(await hypixelRequest("skyblock/auctions_ended"));
    return;
  }

  if (area === "firesales") {
    print(await hypixelRequest("skyblock/firesales"));
    return;
  }

  if (area === "news") {
    print(await hypixelRequest("skyblock/news", {}, { requireKey: true }));
    return;
  }

  if (area === "request") {
    print(await hypixelRequest(action, kvPairs(rest)));
    return;
  }

  throw new Error(`Unknown command: ${area}`);
}

export function runCli(args = process.argv.slice(2)) {
  command(args).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (error.result) {
      process.stderr.write(`${JSON.stringify(error.result, null, 2)}\n`);
    }
    process.exitCode = 1;
  });
}

if (import.meta.main) {
  runCli();
}
