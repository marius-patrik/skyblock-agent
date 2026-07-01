#!/usr/bin/env bun

import { addMemory, configPath, deleteMemory, publicConfig, readMemories, setConfigValue } from "@skyagent/core/store";
import { configuredProfileId, hypixelRequest, resolveMinecraftUsername, resourceEndpoint, skyblockProfiles, uuidFromNameOrUuid } from "@skyagent/core/hypixel";
import { inventoryForPlayer, inventorySectionForPlayer } from "@skyagent/core/inventory";
import { compactProfileOverview, fetchProfileContext, profileSummaries, skycryptUrl } from "@skyagent/core/profile";

function print(value, pretty = true) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
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
  skyagent resolve <minecraftName>
  skyagent player [nameOrUuid]
  skyagent status [nameOrUuid]
  skyagent profiles [nameOrUuid]
  skyagent profiles-summary [nameOrUuid]
  skyagent profile [profileId]
  skyagent member [nameOrUuid] [profileIdOrName]
  skyagent overview [nameOrUuid] [profileIdOrName]
  skyagent inventory [nameOrUuid] [profileIdOrName] [--debug-raw]
  skyagent inventory-section <section> [nameOrUuid] [profileIdOrName] [--debug-raw]
  skyagent item-dump [nameOrUuid] [profileIdOrName] --section <section> [--debug-raw]
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
  skyagent memory add <text> [tag ...]
  skyagent memory list
  skyagent memory get <id>
  skyagent memory delete <id>

Secrets are read from HYPIXEL_API_KEY first, then the user config file.
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
