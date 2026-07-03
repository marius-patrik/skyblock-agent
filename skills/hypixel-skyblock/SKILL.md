---
name: hypixel-skyblock
description: Analyze Hypixel SkyBlock profiles, cached agent context, objectives, progression goals, upgrade paths, live progress, and meta-sensitive recommendations using SkyAgent API data and game references.
metadata:
  display_name: "Hypixel SkyBlock"
  short_description: "Orchestrate SkyAgent profile analysis."
  default_prompt: "Use $hypixel-skyblock to start SkyAgent with skyagent_start, load my SkyBlock context, and route to the right subskill."
---

# Hypixel SkyBlock

Use this skill when the user asks for Hypixel SkyBlock profile analysis, progression planning, money-making routes, upgrade priorities, skill grinding, Slayer, Dungeons, Kuudra, Rift, Museum, Garden, pets, accessories, reforges, or meta comparisons.

## Operating Principles

- Prefer live profile data over assumptions.
- Treat patch notes and API data as higher priority than wiki or community guide claims.
- Treat community metas as time-sensitive and verify them before making strong recommendations.
- Ask for the user's goal, budget, profile, selected SkyBlock profile, play-time constraints, and risk tolerance only when tools cannot infer them.
- Explain recommendations in terms of marginal gain, cost, prerequisite blockers, and time gates.

## Default Analysis Flow

1. On a fresh `@SkyAgent` session, or when the user invokes SkyAgent without a narrow command, call `skyagent_start` through `$skyagent-context-engine` before asking for username; use configured player/profile when setup already exists.
2. Treat startup as the first compact context capsule. Confirm profile completeness, hidden storage, Museum signals, objectives, server/provider status, and recent context events before broad planning.
3. Identify the user's concrete target and constraints from the startup payload, context capsule, objectives, events, and user message.
4. Use `$skyagent-context-engine` for broad analysis/planning so cached profile context, provider freshness, warnings, and follow-up tools are loaded first.
5. Use `$skyagent-objectives` to read durable goals, todos, buy lists, source lists, and snipe targets when they may affect recommendations.
6. Use `$skyagent-live-progress` when recent context-stream events, server status, provider/cache changes, profile refresh events, or the `agent.session_start` cursor may already describe the user's progress.
7. Route to the narrow SkyAgent subskill when the task is clearly profile/API, inventory/items, economy, accessories, progression, readiness/weight, planning, or provider maintenance.
8. Pull current profile state through SkyAgent MCP tools when available.
9. Check whether the target depends on recent patches, economy shifts, or known meta changes.
10. Compare the user's current bottlenecks against the target.
11. Produce a prioritized route with immediate actions, optional upgrades, and what to skip.

## Behavioral Playbook

- Follow the repo playbook in `docs/agent-behavior.md`: compact context first, objectives second, provider/server status third, then narrow tools from the follow-up map.
- Prefer compact summaries over raw payloads. Use raw profile/member/item payloads only for explicit debug requests or when no summary/parser exists, then extract bounded fields.
- If MCP tools are unavailable, try the equivalent non-interactive `skyagent` CLI JSON command before telling the user the capability is missing.
- If cache is stale, refresh for current-state, purchase, profile, or meta-sensitive decisions; otherwise keep stale warnings visible.
- If a parser or summary is missing, use the narrow raw endpoint fallback (`skyblock_profile_section`, `skyblock_museum`, `skyblock_profile_member`, or `hypixel_request`) before saying SkyAgent cannot inspect it.
- If payloads are huge, switch to summaries, section tools, normalized items, or bounded extraction instead of dumping raw data.
- If the API key is missing, use cache-only context and public resources where possible, then return setup guidance without exposing secrets.
- If Hypixel/server/provider status is degraded or partial, preserve the degraded freshness warning and avoid strong current-meta or purchase claims.

## Subskill Routing

- Use `$skyagent-context-engine` for session bootstrap, context capsules, profile context caching, stale-cache decisions, follow-up tool selection, provider freshness, and objective summaries before broad reasoning.
- Use `$skyagent-objectives` for durable objectives, todos, buy-list entries, source-item lists, snipe targets, progress state, and converting accepted plans into tracked work.
- Use `$skyagent-live-progress` for context-event reads, live progress streams, server-status changes, provider/cache changes, profile refresh events, explicit event emission, and future mod telemetry ingestion.
- Use `$skyagent-profile-api` for player resolution, profile selection, overview, member payloads, museum, garden, bingo, or raw Hypixel endpoints.
- Use `$skyagent-inventory-items` for inventory sections, armor, equipment, wardrobe, backpacks, accessory bag item dumps, normalized item records, NBT state, item metadata, or modifier reasoning.
- Use `$skyagent-economy` for coin value, prices, Bazaar, auctions, LBIN, price history, networth, item networth, provider freshness, stale-cache behavior, third-party uncertainty, or market volatility.
- Use `$skyagent-accessories` for Magical Power, accessory bag state, missing accessories, duplicates, enrichment, recombobulation, budget-constrained coin-per-MP upgrades, or accessory price uncertainty.
- Use `$skyagent-progression` for profile sections, XP curves, skills, Catacombs, Slayer, Bestiary, Collections, Minions, Museum, Mining/HotM, Garden, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, or unlocks.
- Use `$skyagent-readiness-weight` for Senither/Lily-style weight status, unsupported exact formulas, formula freshness, and readiness for dungeons, slayer, kuudra, garden, or mining.
- Use `$skyagent-planning` for goal plans, next upgrades, upgrade priority, budget-constrained recommendations, blockers, daily/weekly routes, prerequisites, and what to skip.
- Use `$skyagent-provider-maintenance` for patch-sensitive metas, patch notes, wiki pages, NEU/SkyHelper/CoflNet assumptions, provider freshness, stale formulas, parity drift, or official-source verification.

## Common Goal Routing

- Museum goals: bootstrap context and objectives, use `skyblock_museum_donation_plan` for owned, hidden-owned, missing, buy, source, and snipe donation candidates, then fall back to `$skyagent-progression`/`skyblock_profile_section` for `museum`, `skyblock_museum`, or bounded raw extraction only if the planner cannot cover the needed field.
- Money routes: bootstrap context, check networth/capital, progression unlocks, relevant readiness, provider freshness, and price volatility before recommending routes.
- Damage or Slayer goals: bootstrap context, check `skyblock_readiness` for `slayer`, inspect armor/equipment/current inventory/wardrobe/storage/museum signals, pets, accessories/Magical Power, budget, prices, and provider freshness before recommending purchases.
- Accessories: route to `$skyagent-accessories` for Magical Power, missing accessories, duplicates, enrichment, recombobulation, and coin-per-MP upgrades.
- Pets: route to `$skyagent-inventory-items` and `$skyagent-progression` for active pet, pet inventory, held item, level assumptions, and relevant alternatives.
- Wardrobe/current gear: route to `$skyagent-inventory-items` for wardrobe, armor, equipment, loadout fallback state, storage, and normalized modifiers before judging readiness.
- Objective building: use `$skyagent-planning` for preview candidates, then `$skyagent-objectives` only after the user accepts persistence.

## SkyAgent Tooling

- Use `skyagent_start` first for fresh `@SkyAgent` sessions, broad session-scale analysis, or default plugin invocation. It should bootstrap configured identity/profile without asking for username first, return setup status, context capsule, profile completeness, storage and Museum signals, server status, objective summary, recent events/cursor, provider status, warnings, and follow-up tools, and persist `agent.session_start`.
- Use `skyagent_config_get` only when setup metadata is needed without a full startup/context payload.
- Use `skyagent_llm_provider_status` before persistent-agent or provider-gateway work to verify LiteLLM/OpenAI-compatible model routing, health, auth presence, rate/budget metadata, and redacted endpoint state.
- Use `skyagent_llm_provider_config_get` and `skyagent_llm_provider_config_set` only for LLM provider gateway setup. Do not use Codex CLI session/config files as the SkyAgent product agent backend.
- Use `skyagent setup status --json` or `skyagent setup --json` from the CLI when local profile/auth bootstrap is needed; it reports missing setup requirements without printing secrets.
- Use `minecraft_resolve_username` when the user gives a Minecraft name and a UUID is needed.
- Use `skyagent_context_bootstrap` only when `skyagent_start` is unavailable or a narrower cached context capsule is enough before broad planning.
- Use `skyagent_context_watch` or `skyagent_context_events` when ongoing session progress, refreshes, `provider.cache_status_change`, `hypixel.server_status_change`, or explicit agent events may already be in the context stream.
- Use `skyagent_objective_list` during session bootstrap when durable goals, todos, buy-list entries, source-list entries, or snipe targets may affect recommendations.
- Use `skyagent_server_status` when online state, Hypixel API availability, or session mode/map matters.
- Use `skyblock_profiles` to inspect the user's available SkyBlock profiles before choosing a profile-specific endpoint.
- Use `skyblock_profile_snapshot` for normalized profile-cache reads and repeated narrow analysis after bootstrap. Prefer `skyagent_context_bootstrap` for session bootstrap and broad context capsules; use `refresh` when the user asks for current state and `allowStale` only when explicitly accepting stale context.
- Use `skyblock_profiles_summary` and `skyblock_profile_overview` before asking broad progression questions; these reduce raw profile noise.
- Use `skyblock_profile_member` when detailed per-member profile data is needed for manual analysis.
- Use `skyblock_inventory`, `skyblock_inventory_section`, and `skyblock_item_dump` when item stacks, inventory API state, armor/equipment/wardrobe, backpacks, accessory bag, personal vault, or raw decoded item payloads are needed.
- Use `skyblock_normalized_items` and `skyblock_item_metadata` when stable item records or NotEnoughUpdates-style metadata are needed for item reasoning.
- Use `skyblock_price`, `skyblock_lowest_bin`, and `skyblock_price_history` when coin values, CoflNet LBIN checks, Bazaar data, auction history, or market freshness matter. Treat bounded Hypixel auction scan results with `candidatePrice` as partial candidates unless `price` is non-null.
- Use `skyblock_networth` for sectioned purse, bank, and item networth with unknown prices, provider freshness, assumptions, and confidence. Use bounded `maxItems`, `timeoutMs`, and `includeItems: false` for compact agent context; use `skyblock_item_networth` when only one section such as armor, equipment, wardrobe, backpacks, accessory bag, or pets is needed.
- Use `skyblock_accessories`, `skyblock_missing_accessories`, and `skyblock_accessory_upgrades` for accessory bag state, duplicate/ignored accessories, recombobulation/enrichment signals, estimated Magical Power, missing accessories, and budget-constrained coin-per-MP rankings. Bound broad price sweeps with `maxPriceLookups` and `timeoutMs`.
- Use `skyblock_profile_section` and `skyblock_progression` for SkyCrypt-style progression sections, XP curve calculations, source-field provenance, and summaries for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Minions, Museum, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, and unlocks. Useful aliases include `hotm`, `kuudra`, `farming`, `trophy_fish`, and `important_unlocks`.
- Use `skyblock_weight` for labeled profile-weight estimates and explicit unsupported status for exact Senither/Lily formulas when maintained formula tables are unavailable.
- Use `skyblock_readiness` for heuristic readiness estimates for `dungeons`, `slayer`, `kuudra`, `garden`, or `mining`; always carry forward its assumptions, freshness, and missing-data warnings.
- Use `skyblock_plan_goal` when the user asks what to do next for a concrete goal; pass `useContext: true` for broad planning and preserve immediate actions, todo candidates, buy-list candidates, source-item candidates, snipe targets, skip guidance, source freshness, uncertainty, and warnings. Use `persistObjectives: true` only after the user explicitly wants the plan written to durable objectives.
- Use `skyblock_museum_donation_plan` for Museum donation goals before generic progression planning. It should rank already-owned and hidden-owned candidates before buy recommendations, preserve section/source-path evidence, price missing candidates with bounded providers, and only persist objectives when explicitly requested.
- Use `skyblock_next_upgrades` for budget-constrained upgrade ranking before suggesting purchases.
- Use `skyblock_profile`, `skyblock_museum`, and `skyblock_garden` for profile-state analysis.
- Use `skyblock_resource`, `skyblock_bazaar`, `skyblock_auctions`, `skyblock_auction`, `skyblock_firesales`, and `skyblock_news` for live game reference and economy context.
- Use `skycrypt_profile_url` when the user needs a human-readable profile viewer link.
- Use `hypixel_request` for official Hypixel v2 endpoints not covered by a dedicated tool.
- Use SkyAgent memories for stable user preferences, selected goals, profile notes, and prior analysis summaries. Do not store secrets in memories.

SkyAgent can decode inventory NBT, normalize item-stack records with optional NotEnoughUpdates-style metadata, resolve item prices through Bazaar plus CoflNet-compatible LBIN/history, calculate conservative sectioned networth, analyze accessory-bag upgrade priority, render broad progression sections with XP curves and missing-data warnings, return conservative weight/readiness estimates, and compose deterministic goal plans. Hypixel auction scans, networth valuation, and accessory price sweeps are bounded for agent use and may return `partial` status with limit, timeout, stale-cache, provider-failed, or unknown-price warnings. Networth totals currently include purse, bank, and resolved direct item prices; modifier valuation, museum value, exact Senither/Lily weight parity, and tier-specific readiness are future calculator layers unless the relevant provider code exists.

## Secrets and Storage

Prefer `HYPIXEL_API_KEY` from the environment. The CLI and MCP server can also store an API key in the SkyAgent user config directory when the user explicitly asks. Do not print API key values back to the user.

Prefer `SKYAGENT_LITELLM_API_KEY` from the environment for LiteLLM provider routing. The provider config tools can store a local virtual key when the user explicitly asks, but outputs must stay redacted.

For first-run setup, prefer `skyagent setup` over manual config edits. Non-interactive agents should use `skyagent setup --json --username <name> --api-key <key> --profile <profileIdOrName>` when the user has explicitly provided the secret, or `skyagent setup --json` to inspect missing requirements.

Config and memories live outside the plugin repo by default, under `%APPDATA%\skyagent` on Windows or `~/.skyagent` elsewhere. `SKYAGENT_HOME` can override this for testing.

## Recommendation Style

Plans should be concrete and sequenced. Include the next session's actions first, then medium-term routing. Call out assumptions clearly when API or wiki access is unavailable.
