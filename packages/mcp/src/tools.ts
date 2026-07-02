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
    name: "skyagent_llm_provider_status",
    description: "Return SkyAgent LLM provider status for the LiteLLM/OpenAI-compatible gateway without revealing provider secrets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyagent_llm_provider_config_get",
    description: "Read SkyAgent LLM provider config metadata without revealing LiteLLM virtual keys or endpoint auth material.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "skyagent_llm_provider_config_set",
    description: "Store SkyAgent LLM provider config for LiteLLM/OpenAI-compatible routing. Secrets are redacted from the response.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", enum: ["provider", "base-url", "model", "api-key", "timeout-ms", "max-retries", "rate-limit-rpm", "rate-limit-tpm", "budget-usd", "budget-window"] },
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
    name: "skyagent_start",
    description: "Start a SkyAgent agent session and return the compact startup context first: setup, profile, objectives, server/provider status, recent events, follow-up tools, and an agent.session_start event.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string" },
        profile: { type: "string" },
        refresh: { type: "boolean" },
        cacheOnly: { type: "boolean" },
        allowStale: { type: "boolean" },
        ttlMs: { type: "number" },
        sinceSequence: { type: "number" },
        limit: { type: "number" },
        type: { type: "string" },
      },
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
    description: "Fetch the selected player's raw member object for bounded fallback extraction when no compact summary or parser exists. Requires API key.",
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
    description: "Decode one inventory section and return extracted item stacks for explicit debug or missing-parser fallback work. Prefer compact/normalized tools first. Requires API key.",
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
    description: "Render one structured compact profile section. Use museum here before generic progression for Museum goals; fall back to raw museum/member extraction only if missing. Requires API key.",
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
    description: "Estimate readiness for dungeons, slayer, kuudra, garden, or mining with source fields, assumptions, freshness, and missing-data warnings; pair Slayer/damage advice with gear, pet, accessory, budget, and provider checks.",
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
    description: "Produce a deterministic, auditable plan for a SkyBlock goal with recommendations, blockers, cost/time estimates, source freshness, warnings, and preview objective candidates. Use context first and persist only after user acceptance.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        budget: { type: "number" },
        useContext: { type: "boolean" },
        contextCacheOnly: { type: "boolean" },
        contextAllowStale: { type: "boolean" },
        contextTtlMs: { type: "number" },
        persistObjectives: { type: "boolean" },
        objectiveId: { type: "string" },
        objectiveTitle: { type: "string" },
        objectiveStatus: { type: "string" },
        objectiveNotes: { type: "string" },
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
    name: "skyblock_museum_donation_plan",
    description: "Build a bounded Museum donation plan from selected profile Museum state and owned inventory/storage candidates. Returns owned, hidden-owned, missing, buy, source, and snipe candidates without persisting objectives unless explicitly requested.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        player: { type: "string" },
        profile: { type: "string" },
        budget: { type: "number" },
        maxPriceLookups: { type: "number", minimum: 0 },
        timeoutMs: { type: "number", minimum: 1 },
        persistObjectives: { type: "boolean" },
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
    description: "Fetch raw SkyBlock museum data by profile ID, or the configured selected profile, as a fallback for Museum goal extraction when compact museum summaries are insufficient. Requires API key.",
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
  const finiteBound = (key: string, min: number, integer = false) => {
    if (args[key] === undefined) {
      return;
    }
    if (!Number.isFinite(args[key]) || args[key] < min) {
      throw new Error(`${key} must be a finite number greater than or equal to ${min}.`);
    }
    if (integer && !Number.isInteger(args[key])) {
      throw new Error(`${key} must be an integer.`);
    }
  };
  switch (name) {
    case "skyagent_config_get": {
      const { publicConfig } = await import("@skyagent/core/store");
      return publicConfig();
    }
    case "skyagent_config_set": {
      const { setConfigValue } = await import("@skyagent/core/store");
      return setConfigValue(configKeyMap[args.key], args.value);
    }
    case "skyagent_llm_provider_status": {
      const { llmProviderStatus } = await import("@skyagent/core/llm-provider");
      return llmProviderStatus();
    }
    case "skyagent_llm_provider_config_get": {
      const { publicLlmProviderConfig } = await import("@skyagent/core/llm-provider");
      return publicLlmProviderConfig();
    }
    case "skyagent_llm_provider_config_set": {
      const { setLlmProviderConfigValue } = await import("@skyagent/core/llm-provider");
      return setLlmProviderConfigValue(args.key, args.value);
    }
    case "skyagent_memory_add": {
      const { addMemory } = await import("@skyagent/core/store");
      return addMemory({ text: args.text, tags: args.tags ?? [], source: "mcp" });
    }
    case "skyagent_memory_list": {
      const { readMemories } = await import("@skyagent/core/store");
      return readMemories();
    }
    case "skyagent_memory_delete": {
      const { deleteMemory } = await import("@skyagent/core/store");
      return deleteMemory(args.id);
    }
    case "skyagent_start": {
      const { startSkyAgentSession } = await import("@skyagent/core/start");
      return startSkyAgentSession({
        player: args.player,
        profile: args.profile,
        refresh: Boolean(args.refresh),
        cacheOnly: Object.prototype.hasOwnProperty.call(args, "cacheOnly") ? Boolean(args.cacheOnly) : undefined,
        allowStale: Boolean(args.allowStale),
        ttlMs: args.ttlMs,
        sinceSequence: args.sinceSequence,
        limit: args.limit,
        type: args.type,
        sourceKind: "mcp",
        sourceTransport: "tool",
      });
    }
    case "skyagent_context_bootstrap":
    case "skyagent_context_get": {
      const { agentContextForPlayer } = await import("@skyagent/core/agent-context");
      return agentContextForPlayer(args.player, args.profile, {
        cacheOnly: Object.prototype.hasOwnProperty.call(args, "cacheOnly") ? Boolean(args.cacheOnly) : undefined,
        allowStale: Boolean(args.allowStale),
        ttlMs: args.ttlMs,
      });
    }
    case "skyagent_context_refresh": {
      const { agentContextForPlayer } = await import("@skyagent/core/agent-context");
      return agentContextForPlayer(args.player, args.profile, {
        refresh: true,
        ttlMs: args.ttlMs,
      });
    }
    case "skyagent_server_status": {
      const { serverStatusForPlayer } = await import("@skyagent/core/context-events");
      return serverStatusForPlayer(args.player);
    }
    case "skyagent_context_events":
    case "skyagent_context_watch": {
      const { readContextEvents } = await import("@skyagent/core/context-events");
      return readContextEvents(args);
    }
    case "skyagent_context_event_emit": {
      const { emitContextEvent } = await import("@skyagent/core/context-events");
      return emitContextEvent({
        type: args.type ?? "mcp.context_event",
        source: args.source ?? { kind: "mcp", transport: "tool" },
        player: args.player,
        profile: args.profile,
        payload: args.payload ?? {},
        freshness: { status: "local", source: "mcp" },
      });
    }
    case "skyagent_objective_create": {
      const { createObjectiveItem } = await import("@skyagent/core/objectives");
      return createObjectiveItem(args);
    }
    case "skyagent_objective_list": {
      const { listObjectiveItems } = await import("@skyagent/core/objectives");
      return listObjectiveItems(args);
    }
    case "skyagent_objective_update": {
      const { updateObjectiveItem } = await import("@skyagent/core/objectives");
      const { id, ...patch } = args;
      return updateObjectiveItem(id, patch);
    }
    case "skyagent_objective_complete": {
      const { completeObjectiveItem } = await import("@skyagent/core/objectives");
      return completeObjectiveItem(args.id);
    }
    case "skyagent_objective_delete": {
      const { deleteObjectiveItem } = await import("@skyagent/core/objectives");
      return deleteObjectiveItem(args.id);
    }
    case "minecraft_resolve_username": {
      const { resolveMinecraftUsername } = await import("@skyagent/core/hypixel");
      return resolveMinecraftUsername(args.username);
    }
    case "hypixel_player": {
      const { hypixelRequest, uuidFromNameOrUuid } = await import("@skyagent/core/hypixel");
      return hypixelRequest("player", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    }
    case "hypixel_status": {
      const { hypixelRequest, uuidFromNameOrUuid } = await import("@skyagent/core/hypixel");
      return hypixelRequest("status", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    }
    case "skyblock_profiles": {
      const { skyblockProfiles } = await import("@skyagent/core/hypixel");
      return skyblockProfiles(args.player);
    }
    case "skyblock_profiles_summary": {
      const { skyblockProfiles, uuidFromNameOrUuid } = await import("@skyagent/core/hypixel");
      const { profileSummaries } = await import("@skyagent/core/profile");
      const uuid = await uuidFromNameOrUuid(args.player);
      const response = await skyblockProfiles(uuid);
      return { uuid, profiles: profileSummaries(response.body?.profiles ?? [], uuid), rateLimit: response.rateLimit };
    }
    case "skyblock_profile_member": {
      const { fetchProfileContext } = await import("@skyagent/core/profile");
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
    case "skyblock_profile_overview": {
      const { compactProfileOverview, fetchProfileContext } = await import("@skyagent/core/profile");
      return compactProfileOverview(await fetchProfileContext(args.player, args.profile));
    }
    case "skyblock_profile_snapshot": {
      const { profileSnapshotForPlayer } = await import("@skyagent/core/profile-cache");
      return profileSnapshotForPlayer(args.player, args.profile, {
        refresh: Boolean(args.refresh),
        cacheOnly: Boolean(args.cacheOnly),
        allowStale: Boolean(args.allowStale),
        ttlMs: args.ttlMs,
      });
    }
    case "skyblock_inventory": {
      const { inventoryForPlayer } = await import("@skyagent/core/inventory");
      return inventoryForPlayer(args.player, args.profile, { debugRaw: Boolean(args.debugRaw) });
    }
    case "skyblock_inventory_section": {
      const { inventorySectionForPlayer } = await import("@skyagent/core/inventory");
      return inventorySectionForPlayer(args.section, args.player, args.profile, { debugRaw: Boolean(args.debugRaw) });
    }
    case "skyblock_item_dump": {
      const { inventorySectionForPlayer } = await import("@skyagent/core/inventory");
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
    case "skyblock_normalized_items": {
      const { normalizedItemsForPlayer } = await import("@skyagent/core/items");
      return normalizedItemsForPlayer(args.player, args.profile);
    }
    case "skyblock_networth": {
      const { networthForPlayer } = await import("@skyagent/core/networth");
      return networthForPlayer(args.player, args.profile, {
        maxItems: args.maxItems,
        timeoutMs: args.timeoutMs,
        includeItems: args.includeItems,
      });
    }
    case "skyblock_item_networth": {
      const { itemNetworthForPlayer } = await import("@skyagent/core/networth");
      return itemNetworthForPlayer(args.player, args.profile, args.section, {
        maxItems: args.maxItems,
        timeoutMs: args.timeoutMs,
        includeItems: args.includeItems,
      });
    }
    case "skyblock_accessories": {
      const { accessoriesForPlayer } = await import("@skyagent/core/accessories");
      return accessoriesForPlayer(args.player, args.profile, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
    }
    case "skyblock_missing_accessories": {
      const { missingAccessoriesForPlayer } = await import("@skyagent/core/accessories");
      return missingAccessoriesForPlayer(args.player, args.profile, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
    }
    case "skyblock_accessory_upgrades":
      if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget < 0)) {
        throw new Error("budget must be a non-negative finite number when provided.");
      }
      {
      const { accessoryUpgradesForPlayer } = await import("@skyagent/core/accessories");
      return accessoryUpgradesForPlayer(args.player, args.profile, args.budget ?? null, {
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
      });
      }
    case "skyblock_profile_section": {
      const { profileSectionForPlayer } = await import("@skyagent/core/sections");
      return profileSectionForPlayer(args.section, args.player, args.profile);
    }
    case "skyblock_progression": {
      const { progressionForPlayer } = await import("@skyagent/core/sections");
      return progressionForPlayer(args.player, args.profile);
    }
    case "skyblock_weight": {
      const { weightForPlayer } = await import("@skyagent/core/weight");
      return weightForPlayer(args.player, args.profile);
    }
    case "skyblock_readiness": {
      const { readinessForPlayer } = await import("@skyagent/core/readiness");
      return readinessForPlayer(args.area, args.player, args.profile);
    }
    case "skyblock_plan_goal":
      if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget < 0)) {
        throw new Error("budget must be a non-negative finite number when provided.");
      }
      {
      const { planGoalForPlayer } = await import("@skyagent/core/planner");
      return planGoalForPlayer(args.goal, args.player, args.profile, {
        budget: args.budget ?? null,
        useContext: args.useContext,
        contextCacheOnly: args.contextCacheOnly,
        contextAllowStale: args.contextAllowStale,
        contextTtlMs: args.contextTtlMs,
        persistObjectives: args.persistObjectives,
        objectiveId: args.objectiveId,
        objectiveTitle: args.objectiveTitle,
        objectiveStatus: args.objectiveStatus,
        objectiveNotes: args.objectiveNotes,
        maxItems: args.maxItems,
        networthTimeoutMs: args.networthTimeoutMs,
        maxPriceLookups: args.maxPriceLookups,
        accessoryTimeoutMs: args.accessoryTimeoutMs,
      });
      }
    case "skyblock_museum_donation_plan":
      if (args.budget !== undefined && (!Number.isFinite(args.budget) || args.budget < 0)) {
        throw new Error("budget must be a non-negative finite number when provided.");
      }
      finiteBound("maxPriceLookups", 0, true);
      finiteBound("timeoutMs", 1, true);
      {
      const { museumDonationPlanForPlayer } = await import("@skyagent/core/museum");
      return museumDonationPlanForPlayer(args.goal, args.player, args.profile, {
        budget: args.budget ?? null,
        maxPriceLookups: args.maxPriceLookups,
        timeoutMs: args.timeoutMs,
        persistObjectives: args.persistObjectives,
      });
      }
    case "skyblock_next_upgrades":
      if (!Number.isFinite(args.budget) || args.budget < 0) {
        throw new Error("budget must be a non-negative finite number.");
      }
      {
      const { nextUpgradesForPlayer } = await import("@skyagent/core/planner");
      return nextUpgradesForPlayer(args.player, args.profile, args.budget, {
        maxPriceLookups: args.maxPriceLookups,
        accessoryTimeoutMs: args.accessoryTimeoutMs,
      });
      }
    case "skyblock_item_metadata": {
      const { itemMetadata } = await import("@skyagent/core/items");
      return itemMetadata(args.internalId);
    }
    case "skyblock_price": {
      const { itemPrice } = await import("@skyagent/core/prices");
      return itemPrice(args.itemId);
    }
    case "skyblock_lowest_bin": {
      const { lowestBin } = await import("@skyagent/core/prices");
      return lowestBin(args.itemId);
    }
    case "skyblock_price_history": {
      const { coflnetPriceHistory } = await import("@skyagent/core/prices");
      return coflnetPriceHistory(args.itemId, args.window);
    }
    case "skycrypt_profile_url": {
      const { skycryptUrl } = await import("@skyagent/core/profile");
      return { url: skycryptUrl(args.player, args.profileName) };
    }
    case "skyblock_profile": {
      const { configuredProfileId, hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/profile", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    }
    case "skyblock_museum": {
      const { configuredProfileId, hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/museum", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    }
    case "skyblock_garden": {
      const { configuredProfileId, hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/garden", { profile: await configuredProfileId(args.profile) }, { requireKey: true });
    }
    case "skyblock_bingo_player": {
      const { hypixelRequest, uuidFromNameOrUuid } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/bingo", { uuid: await uuidFromNameOrUuid(args.player) }, { requireKey: true });
    }
    case "skyblock_resource": {
      const { hypixelRequest, resourceEndpoint } = await import("@skyagent/core/hypixel");
      return hypixelRequest(resourceEndpoint(args.resource));
    }
    case "skyblock_bazaar": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/bazaar");
    }
    case "skyblock_auctions": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/auctions", { page: args.page ?? 0 });
    }
    case "skyblock_auction": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/auction", { [args.lookupType]: args.id }, { requireKey: true });
    }
    case "skyblock_auctions_ended": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/auctions_ended");
    }
    case "skyblock_firesales": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/firesales");
    }
    case "skyblock_news": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest("skyblock/news", {}, { requireKey: true });
    }
    case "hypixel_request": {
      const { hypixelRequest } = await import("@skyagent/core/hypixel");
      return hypixelRequest(args.path, args.query ?? {}, { requireKey: Boolean(args.requireKey) });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

