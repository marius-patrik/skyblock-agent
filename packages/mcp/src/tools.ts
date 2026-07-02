import { addMemory, deleteMemory, publicConfig, readMemories, setConfigValue } from "@skyagent/core/store";
import { agentContextForPlayer } from "@skyagent/core/agent-context";
import { emitContextEvent, readContextEvents, serverStatusForPlayer } from "@skyagent/core/context-events";
import { accessoriesForPlayer, accessoryUpgradesForPlayer, missingAccessoriesForPlayer } from "@skyagent/core/accessories";
import { configuredProfileId, hypixelRequest, resolveMinecraftUsername, resourceEndpoint, skyblockProfiles, uuidFromNameOrUuid } from "@skyagent/core/hypixel";
import { inventoryForPlayer, inventorySectionForPlayer } from "@skyagent/core/inventory";
import { itemMetadata, normalizedItemsForPlayer } from "@skyagent/core/items";
import { itemNetworthForPlayer, networthForPlayer } from "@skyagent/core/networth";
import { completeObjectiveItem, createObjectiveItem, deleteObjectiveItem, listObjectiveItems, updateObjectiveItem } from "@skyagent/core/objectives";
import { nextUpgradesForPlayer, planGoalForPlayer } from "@skyagent/core/planner";
import { coflnetPriceHistory, itemPrice, lowestBin } from "@skyagent/core/prices";
import { profileSnapshotForPlayer } from "@skyagent/core/profile-cache";
import { compactProfileOverview, fetchProfileContext, profileSummaries, skycryptUrl } from "@skyagent/core/profile";
import { readinessForPlayer } from "@skyagent/core/readiness";
import { profileSectionForPlayer, progressionForPlayer } from "@skyagent/core/sections";
import { weightForPlayer } from "@skyagent/core/weight";

export const tools = [
  {
    name: "skyagent_config_get",
    description: "Read SkyAgent config metadata without revealing the Hypixel API key.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyagent_config_set",
    description: "Store SkyAgent username, UUID, selected SkyBlock profile ID, or Hypixel API key in the user config store.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", enum: ["username", "uuid", "profile", "api-key"] },
        value: { type: "string" },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_memory_add",
    description: "Store a durable SkyAgent note, preference, goal, or profile-analysis memory.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_memory_list",
    description: "List stored SkyAgent memories.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyagent_memory_delete",
    description: "Delete a SkyAgent memory by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_bootstrap",
    description: "Read a cached compact SkyAgent session-start context capsule with profile identity, gear/pet/accessory/readiness summaries, provider freshness, warnings, and follow-up tools.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        cacheOnly: { type: "boolean" },
        allowStale: { type: "boolean" },
        ttlMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_get",
    description: "Read the cached compact SkyAgent context capsule without forcing a snapshot refresh.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        cacheOnly: { type: "boolean" },
        allowStale: { type: "boolean" },
        ttlMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_refresh",
    description: "Refresh and return the compact SkyAgent context capsule from current Hypixel profile data.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        ttlMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_server_status",
    description: "Return Hypixel API availability, player online status, and session mode/map when available.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_events",
    description: "Read bounded SkyAgent context event history for reconnects, polling, and agent session state.",
    inputSchema: {
      type: "object",
      properties: {
        sinceSequence: { type: "number" },
        limit: { type: "number" },
        type: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_watch",
    description: "Read context events since a sequence for watch-style polling without opening a raw stream.",
    inputSchema: {
      type: "object",
      properties: {
        sinceSequence: { type: "number" },
        limit: { type: "number" },
        type: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_context_event_emit",
    description: "Emit an explicit local context event from an MCP client or agent workflow.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        player: { type: "object" },
        profile: { type: "object" },
        payload: { type: "object" },
        source: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_objective_create",
    description: "Create a durable local SkyAgent objective, task, buy-list entry, source-list entry, or snipe target.",
    inputSchema: {
      type: "object",
      properties: {
        itemKind: { type: "string", enum: ["objective", "task", "buy", "source", "snipe"] },
        title: { type: "string" },
        objectiveId: { type: "string" },
        notes: { type: "string" },
        priority: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        itemId: { type: "string" },
        targetPrice: { type: "number" },
        budget: { type: "number" },
        sourceProvider: { type: "string" },
        freshness: { type: "object" },
        payload: { type: "object" },
      },
      required: ["itemKind", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_objective_list",
    description: "List durable local SkyAgent objective items, optionally filtered by kind and status.",
    inputSchema: {
      type: "object",
      properties: {
        itemKind: { type: "string", enum: ["objective", "task", "buy", "source", "snipe"] },
        kind: { type: "string", enum: ["objective", "task", "buy", "source", "snipe"] },
        status: { type: "string", enum: ["open", "active", "blocked", "done", "deleted"] },
        includeDeleted: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_objective_update",
    description: "Update a durable local SkyAgent objective item, including status, price, budget, priority, source, freshness, and warning metadata.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        status: { type: "string", enum: ["open", "active", "blocked", "done", "deleted"] },
        objectiveId: { type: "string" },
        notes: { type: "string" },
        priority: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        itemId: { type: "string" },
        targetPrice: { type: "number" },
        budget: { type: "number" },
        sourceProvider: { type: "string" },
        freshness: { type: "object" },
        payload: { type: "object" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_objective_complete",
    description: "Mark a durable local SkyAgent objective item done.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "skyagent_objective_delete",
    description: "Soft-delete a durable local SkyAgent objective item.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "minecraft_resolve_username",
    description: "Resolve a Minecraft username to UUID using the Mojang profile API.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
      additionalProperties: false,
    },
  },
  {
    name: "hypixel_player",
    description: "Fetch Hypixel player data for a username or UUID. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "hypixel_status",
    description: "Fetch Hypixel online status for a username or UUID. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profiles",
    description: "Fetch all SkyBlock profiles for a username or UUID. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profiles_summary",
    description: "Fetch compact metadata for a player's SkyBlock profiles, including profile IDs, cute names, selected flag, bank, purse, and SkyBlock level XP. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profile_member",
    description: "Fetch the selected player's member object from a selected SkyBlock profile by profile ID or cute name. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profile_overview",
    description: "Fetch a compact SkyCrypt-style profile overview with economy, progression keys, inventory API signals, and profile selection metadata. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profile_snapshot",
    description: "Read or refresh a freshness-aware normalized SkyBlock profile snapshot from the local SkyAgent cache. Requires API key unless cacheOnly returns an existing entry.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        refresh: { type: "boolean" },
        cacheOnly: { type: "boolean" },
        allowStale: { type: "boolean" },
        ttlMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_inventory",
    description: "Decode all supported Hypixel SkyBlock inventory sections for a player/profile. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        debugRaw: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_inventory_section",
    description: "Decode one Hypixel SkyBlock inventory section such as inventory, armor, equipment, wardrobe, ender_chest, backpacks, accessory_bag, personal_vault, or pets. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        debugRaw: { type: "boolean" },
      },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_item_dump",
    description: "Decode one inventory section and return its extracted item stacks for debugging and downstream normalization. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        debugRaw: { type: "boolean" },
      },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_normalized_items",
    description: "Decode inventory item stacks and normalize them into stable SkyBlock item records enriched by NEU-style metadata where available. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_networth",
    description: "Calculate sectioned SkyBlock profile networth with purse, bank, item totals, unknown prices, provider freshness, assumptions, and confidence. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        maxItems: { type: "number" },
        timeoutMs: { type: "number" },
        includeItems: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_item_networth",
    description: "Calculate networth for one inventory section such as inventory, armor, equipment, wardrobe, ender_chest, backpacks, accessory_bag, personal_vault, or pets. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        maxItems: { type: "number" },
        timeoutMs: { type: "number" },
        includeItems: { type: "boolean" },
      },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_accessories",
    description: "Analyze accessory bag state, duplicates, recombobulation, enrichment signals, estimated Magical Power, missing accessories, and upgrade rankings. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        maxPriceLookups: { type: "number" },
        timeoutMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_missing_accessories",
    description: "List missing accessories and cheapest missing accessory candidates. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        maxPriceLookups: { type: "number" },
        timeoutMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_accessory_upgrades",
    description: "Rank missing accessory upgrades by coin per Magical Power, optionally filtered by budget. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        budget: { type: "number" },
        maxPriceLookups: { type: "number" },
        timeoutMs: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profile_section",
    description: "Render one structured progression section such as skills, dungeons, slayer, mining, garden, bestiary, collections, minions, museum, crimson_isle, rift, trophy_fishing, pets, essence, currencies, or unlocks. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
      },
      required: ["section"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_progression",
    description: "Render shared SkyCrypt-style profile progression sections with XP calculations, missing-data warnings, formulas, and provenance. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_weight",
    description: "Return SkyAgent profile weight estimates and explicit unsupported status for exact Senither/Lily formulas when maintained formula tables are unavailable. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_readiness",
    description: "Estimate readiness for dungeons, slayer, kuudra, garden, or mining with source fields, assumptions, freshness, and missing-data warnings. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", enum: ["dungeons", "slayer", "kuudra", "garden", "mining"] },
        player: { type: "string" },
        profile: { type: "string" },
      },
      required: ["area"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_plan_goal",
    description: "Produce a deterministic, auditable plan for a SkyBlock goal with recommendations, blockers, cost/time estimates, source freshness, and warnings. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        budget: { type: "number" },
        maxItems: { type: "number" },
        networthTimeoutMs: { type: "number" },
        maxPriceLookups: { type: "number" },
        accessoryTimeoutMs: { type: "number" },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_next_upgrades",
    description: "Rank budget-constrained next upgrade recommendations, currently centered on accessory Magical Power upgrades with explicit price freshness and warnings. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        budget: { type: "number" },
        maxPriceLookups: { type: "number" },
        accessoryTimeoutMs: { type: "number" },
      },
      required: ["budget"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_item_metadata",
    description: "Fetch NotEnoughUpdates-style metadata for a SkyBlock internal item ID.",
    inputSchema: {
      type: "object",
      properties: {
        internalId: { type: "string" },
      },
      required: ["internalId"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_price",
    description: "Resolve a SkyBlock item price through Bazaar first, then CoflNet LBIN fallback; bounded Hypixel auction scans are exposed as partial candidates with warnings.",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_lowest_bin",
    description: "Resolve current CoflNet-compatible LBIN for an auctionable SkyBlock item, with bounded Hypixel auction scans exposed as partial candidate metadata.",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_price_history",
    description: "Fetch CoflNet-compatible price history/analysis for a SkyBlock item.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        window: { type: "string" },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "skycrypt_profile_url",
    description: "Build a SkyCrypt profile URL for a Minecraft username/UUID and optional profile name.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profileName: { type: "string" },
      },
      required: ["player"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_profile",
    description: "Fetch one SkyBlock profile by profile ID, or the configured selected profile. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_museum",
    description: "Fetch SkyBlock museum data by profile ID, or the configured selected profile. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_garden",
    description: "Fetch SkyBlock garden data by profile ID, or the configured selected profile. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_bingo_player",
    description: "Fetch SkyBlock bingo data for a username or UUID. Requires API key.",
    inputSchema: {
      type: "object",
      properties: { player: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_resource",
    description: "Fetch a public SkyBlock resource: collections, skills, items, election, or bingo.",
    inputSchema: {
      type: "object",
      properties: { resource: { type: "string", enum: ["collections", "skills", "items", "election", "bingo"] } },
      required: ["resource"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_bazaar",
    description: "Fetch public SkyBlock Bazaar data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyblock_auctions",
    description: "Fetch active SkyBlock auctions by page.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_auction",
    description: "Fetch SkyBlock auction data by auction UUID, player UUID, or profile ID. Requires API key.",
    inputSchema: {
      type: "object",
      properties: {
        lookupType: { type: "string", enum: ["uuid", "player", "profile"] },
        id: { type: "string" },
      },
      required: ["lookupType", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "skyblock_auctions_ended",
    description: "Fetch recently ended SkyBlock auctions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyblock_firesales",
    description: "Fetch active and upcoming SkyBlock fire sales.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyblock_news",
    description: "Fetch SkyBlock news. Requires API key.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "hypixel_request",
    description: "Call an arbitrary Hypixel v2 endpoint path with query parameters. Use for endpoints not covered by dedicated tools.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        query: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
        requireKey: { type: "boolean" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

const configKeyMap = {
  username: "username",
  uuid: "uuid",
  profile: "selectedProfileId",
  "api-key": "apiKey",
};

export function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export async function callTool(name: string, args: Record<string, any> = {}) {
  switch (name) {
    case "skyagent_config_get":
      return publicConfig();
    case "skyagent_config_set":
      return setConfigValue(configKeyMap[args.key], args.value);
    case "skyagent_memory_add":
      return addMemory({ text: args.text, tags: args.tags ?? [], source: "mcp" });
    case "skyagent_memory_list":
      return readMemories();
    case "skyagent_memory_delete":
      return deleteMemory(args.id);
    case "skyagent_context_bootstrap":
    case "skyagent_context_get":
      return agentContextForPlayer(args.player, args.profile, {
        cacheOnly: Object.prototype.hasOwnProperty.call(args, "cacheOnly") ? Boolean(args.cacheOnly) : undefined,
        allowStale: Boolean(args.allowStale),
        ttlMs: args.ttlMs,
      });
    case "skyagent_context_refresh":
      return agentContextForPlayer(args.player, args.profile, {
        refresh: true,
        ttlMs: args.ttlMs,
      });
    case "skyagent_server_status":
      return serverStatusForPlayer(args.player);
    case "skyagent_context_events":
    case "skyagent_context_watch":
      return readContextEvents(args);
    case "skyagent_context_event_emit":
      return emitContextEvent({
        type: args.type ?? "mcp.context_event",
        source: args.source ?? { kind: "mcp", transport: "tool" },
        player: args.player,
        profile: args.profile,
        payload: args.payload ?? {},
        freshness: { status: "local", source: "mcp" },
      });
    case "skyagent_objective_create":
      return createObjectiveItem(args);
    case "skyagent_objective_list":
      return listObjectiveItems(args);
    case "skyagent_objective_update": {
      const { id, ...patch } = args;
      return updateObjectiveItem(id, patch);
    }
    case "skyagent_objective_complete":
      return completeObjectiveItem(args.id);
    case "skyagent_objective_delete":
      return deleteObjectiveItem(args.id);
    case "minecraft_resolve_username":
      return resolveMinecraftUsername(args.username);
    case "hypixel_player":
      return hypixelRequest("player", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    case "hypixel_status":
      return hypixelRequest("status", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    case "skyblock_profiles":
      return skyblockProfiles(args.player);
    case "skyblock_profiles_summary": {
      const uuid = await uuidFromNameOrUuid(args.player);
      const response = await skyblockProfiles(uuid);
      return { uuid, profiles: profileSummaries(response.body?.profiles ?? [], uuid), rateLimit: response.rateLimit };
    }
    case "skyblock_profile_member": {
      const context = await fetchProfileContext(args.player, args.profile);
      return {
        uuid: context.uuid,
        profile: {
          profileId: context.profile.profile_id,
          cuteName: context.profile.cute_name ?? null,
        },
        member: context.member,
        rateLimit: context.rateLimit,
      };
    }
    case "skyblock_profile_overview":
      return compactProfileOverview(await fetchProfileContext(args.player, args.profile));
    case "skyblock_profile_snapshot":
      return profileSnapshotForPlayer(args.player, args.profile, {
        refresh: Boolean(args.refresh),
        cacheOnly: Boolean(args.cacheOnly),
        allowStale: Boolean(args.allowStale),
        ttlMs: args.ttlMs,
      });
    case "skyblock_inventory":
      return inventoryForPlayer(args.player, args.profile, { debugRaw: Boolean(args.debugRaw) });
    case "skyblock_inventory_section":
      return inventorySectionForPlayer(args.section, args.player, args.profile, { debugRaw: Boolean(args.debugRaw) });
    case "skyblock_item_dump": {
      const result = await inventorySectionForPlayer(args.section, args.player, args.profile, { debugRaw: Boolean(args.debugRaw) });
      return {
        uuid: result.uuid,
        profile: result.profile,
        section: result.section,
        sourcePath: result.sourcePath,
        itemCount: result.itemCount,
        items: result.items,
        warnings: result.warnings,
      };
    }
    case "skyblock_normalized_items":
      return normalizedItemsForPlayer(args.player, args.profile);
    case "skyblock_networth":
      return networthForPlayer(args.player, args.profile, {
        maxItems: args.maxItems,
        timeoutMs: args.timeoutMs,
        includeItems: args.includeItems,
      });
    case "skyblock_item_networth":
      return itemNetworthForPlayer(args.player, args.profile, args.section, {
        maxItems: args.maxItems,
        timeoutMs: args.timeoutMs,
        includeItems: args.includeItems,
      });
    case "skyblock_accessories":
      return accessoriesForPlayer(args.player, args.profile, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
    case "skyblock_missing_accessories":
      return missingAccessoriesForPlayer(args.player, args.profile, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
    case "skyblock_accessory_upgrades":
      if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget < 0)) {
        throw new Error("budget must be a non-negative finite number when provided.");
      }
      return accessoryUpgradesForPlayer(args.player, args.profile, args.budget ?? null, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
    case "skyblock_profile_section":
      return profileSectionForPlayer(args.section, args.player, args.profile);
    case "skyblock_progression":
      return progressionForPlayer(args.player, args.profile);
    case "skyblock_weight":
      return weightForPlayer(args.player, args.profile);
    case "skyblock_readiness":
      return readinessForPlayer(args.area, args.player, args.profile);
    case "skyblock_plan_goal":
      if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget < 0)) {
        throw new Error("budget must be a non-negative finite number when provided.");
      }
      return planGoalForPlayer(args.goal, args.player, args.profile, {
        budget: args.budget ?? null,
        maxItems: args.maxItems,
        networthTimeoutMs: args.networthTimeoutMs,
        maxPriceLookups: args.maxPriceLookups,
        accessoryTimeoutMs: args.accessoryTimeoutMs,
      });
    case "skyblock_next_upgrades":
      if (!Number.isFinite(args.budget) || args.budget < 0) {
        throw new Error("budget must be a non-negative finite number.");
      }
      return nextUpgradesForPlayer(args.player, args.profile, args.budget, {
        maxPriceLookups: args.maxPriceLookups,
        accessoryTimeoutMs: args.accessoryTimeoutMs,
      });
    case "skyblock_item_metadata":
      return itemMetadata(args.internalId);
    case "skyblock_price":
      return itemPrice(args.itemId);
    case "skyblock_lowest_bin":
      return lowestBin(args.itemId);
    case "skyblock_price_history":
      return coflnetPriceHistory(args.itemId, args.window);
    case "skycrypt_profile_url":
      return { url: skycryptUrl(args.player, args.profileName) };
    case "skyblock_profile":
      return hypixelRequest("skyblock/profile", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    case "skyblock_museum":
      return hypixelRequest("skyblock/museum", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    case "skyblock_garden":
      return hypixelRequest("skyblock/garden", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    case "skyblock_bingo_player":
      return hypixelRequest("skyblock/bingo", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    case "skyblock_resource":
      return hypixelRequest(resourceEndpoint(args.resource));
    case "skyblock_bazaar":
      return hypixelRequest("skyblock/bazaar");
    case "skyblock_auctions":
      return hypixelRequest("skyblock/auctions", { page: args.page ?? 0 });
    case "skyblock_auction":
      return hypixelRequest("skyblock/auction", { [args.lookupType]: args.id }, { requireKey: true });
    case "skyblock_auctions_ended":
      return hypixelRequest("skyblock/auctions_ended");
    case "skyblock_firesales":
      return hypixelRequest("skyblock/firesales");
    case "skyblock_news":
      return hypixelRequest("skyblock/news", {}, { requireKey: true });
    case "hypixel_request":
      return hypixelRequest(args.path, args.query ?? {}, { requireKey: Boolean(args.requireKey) });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

