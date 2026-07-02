---
name: hypixel-skyblock
description: Analyze Hypixel SkyBlock profiles, cached agent context, progression goals, upgrade paths, and meta-sensitive recommendations using live API data and game references.
metadata:
  display_name: "Hypixel SkyBlock"
  short_description: "Orchestrate SkyAgent profile analysis."
  default_prompt: "Use $hypixel-skyblock to analyze my SkyBlock profile and route to the right SkyAgent subskill."
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

1. Identify the user's concrete target and constraints.
2. Route to the narrow SkyAgent subskill when the task is clearly profile/API, inventory/items, economy, accessories, progression, readiness/weight, planning, or provider maintenance.
3. Pull current profile state through SkyAgent MCP tools when available.
4. Check whether the target depends on recent patches, economy shifts, or known meta changes.
5. Compare the user's current bottlenecks against the target.
6. Produce a prioritized route with immediate actions, optional upgrades, and what to skip.

## Subskill Routing

- Use `$skyagent-profile-api` for player resolution, profile selection, overview, member payloads, museum, garden, bingo, or raw Hypixel endpoints.
- Use `$skyagent-inventory-items` for inventory sections, armor, equipment, wardrobe, backpacks, accessory bag item dumps, normalized item records, NBT state, item metadata, or modifier reasoning.
- Use `$skyagent-economy` for coin value, prices, Bazaar, auctions, LBIN, price history, networth, item networth, provider freshness, stale-cache behavior, third-party uncertainty, or market volatility.
- Use `$skyagent-accessories` for Magical Power, accessory bag state, missing accessories, duplicates, enrichment, recombobulation, budget-constrained coin-per-MP upgrades, or accessory price uncertainty.
- Use `$skyagent-progression` for profile sections, XP curves, skills, Catacombs, Slayer, Bestiary, Collections, Minions, Museum, Mining/HotM, Garden, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, or unlocks.
- Use `$skyagent-readiness-weight` for Senither/Lily-style weight status, unsupported exact formulas, formula freshness, and readiness for dungeons, slayer, kuudra, garden, or mining.
- Use `$skyagent-planning` for goal plans, next upgrades, upgrade priority, budget-constrained recommendations, blockers, daily/weekly routes, prerequisites, and what to skip.
- Use `$skyagent-provider-maintenance` for patch-sensitive metas, patch notes, wiki pages, NEU/SkyHelper/CoflNet assumptions, provider freshness, stale formulas, parity drift, or official-source verification.

## SkyAgent Tooling

- Use `skyagent_config_get` first to see whether username, UUID, selected profile, and API key are configured.
- Use `skyagent setup status --json` or `skyagent setup --json` from the CLI when local profile/auth bootstrap is needed; it reports missing setup requirements without printing secrets.
- Use `minecraft_resolve_username` when the user gives a Minecraft name and a UUID is needed.
- Use `skyagent_context_bootstrap` at session start or before broad planning to get the compact profile, economy, gear, pets, accessories, readiness, provider freshness, warnings, and follow-up tool map.
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
- Use `skyblock_networth` for sectioned purse, bank, and item networth with unknown prices, provider freshness, assumptions, and confidence. Use `skyblock_item_networth` when only one section such as armor, equipment, wardrobe, backpacks, accessory bag, or pets is needed.
- Use `skyblock_accessories`, `skyblock_missing_accessories`, and `skyblock_accessory_upgrades` for accessory bag state, duplicate/ignored accessories, recombobulation/enrichment signals, estimated Magical Power, missing accessories, and budget-constrained coin-per-MP rankings.
- Use `skyblock_profile_section` and `skyblock_progression` for SkyCrypt-style progression sections, XP curve calculations, source-field provenance, and summaries for skills, Dungeons, Slayer, Mining/HotM, Garden, Bestiary, Collections, Minions, Museum, Crimson Isle/Kuudra, Rift, Trophy Fishing, Pets, Essence, currencies, and unlocks. Useful aliases include `hotm`, `kuudra`, `farming`, `trophy_fish`, and `important_unlocks`.
- Use `skyblock_weight` for labeled profile-weight estimates and explicit unsupported status for exact Senither/Lily formulas when maintained formula tables are unavailable.
- Use `skyblock_readiness` for heuristic readiness estimates for `dungeons`, `slayer`, `kuudra`, `garden`, or `mining`; always carry forward its assumptions, freshness, and missing-data warnings.
- Use `skyblock_plan_goal` when the user asks what to do next for a concrete goal; preserve recommendation reasons, impact, cost or time estimates, prerequisites, source freshness, uncertainty, and warnings.
- Use `skyblock_next_upgrades` for budget-constrained upgrade ranking before suggesting purchases.
- Use `skyblock_profile`, `skyblock_museum`, and `skyblock_garden` for profile-state analysis.
- Use `skyblock_resource`, `skyblock_bazaar`, `skyblock_auctions`, `skyblock_auction`, `skyblock_firesales`, and `skyblock_news` for live game reference and economy context.
- Use `skycrypt_profile_url` when the user needs a human-readable profile viewer link.
- Use `hypixel_request` for official Hypixel v2 endpoints not covered by a dedicated tool.
- Use SkyAgent memories for stable user preferences, selected goals, profile notes, and prior analysis summaries. Do not store secrets in memories.

SkyAgent can decode inventory NBT, normalize item-stack records with optional NotEnoughUpdates-style metadata, resolve item prices through Bazaar plus CoflNet-compatible LBIN/history, calculate conservative sectioned networth, analyze accessory-bag upgrade priority, render broad progression sections with XP curves and missing-data warnings, return conservative weight/readiness estimates, and compose deterministic goal plans. Hypixel auction scans are bounded by default and may return partial `candidatePrice` metadata rather than a resolved LBIN. Networth totals currently include purse, bank, and resolved direct item prices; modifier valuation, museum value, exact Senither/Lily weight parity, and tier-specific readiness are future calculator layers unless the relevant provider code exists.

## Secrets and Storage

Prefer `HYPIXEL_API_KEY` from the environment. The CLI and MCP server can also store an API key in the SkyAgent user config directory when the user explicitly asks. Do not print API key values back to the user.

For first-run setup, prefer `skyagent setup` over manual config edits. Non-interactive agents should use `skyagent setup --json --username <name> --api-key <key> --profile <profileIdOrName>` when the user has explicitly provided the secret, or `skyagent setup --json` to inspect missing requirements.

Config and memories live outside the plugin repo by default, under `%APPDATA%\skyagent` on Windows or `~/.skyagent` elsewhere. `SKYAGENT_HOME` can override this for testing.

## Recommendation Style

Plans should be concrete and sequenced. Include the next session's actions first, then medium-term routing. Call out assumptions clearly when API or wiki access is unavailable.
