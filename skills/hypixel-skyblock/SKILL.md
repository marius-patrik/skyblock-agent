---
name: hypixel-skyblock
description: Analyze Hypixel SkyBlock profiles, progression goals, upgrade paths, and meta-sensitive recommendations using live API data and game references.
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
2. Pull current profile state through SkyAgent MCP tools when available.
3. Check whether the target depends on recent patches, economy shifts, or known meta changes.
4. Compare the user's current bottlenecks against the target.
5. Produce a prioritized route with immediate actions, optional upgrades, and what to skip.

## SkyAgent Tooling

- Use `skyagent_config_get` first to see whether username, UUID, selected profile, and API key are configured.
- Use `minecraft_resolve_username` when the user gives a Minecraft name and a UUID is needed.
- Use `skyblock_profiles` to inspect the user's available SkyBlock profiles before choosing a profile-specific endpoint.
- Use `skyblock_profiles_summary` and `skyblock_profile_overview` before asking broad progression questions; these reduce raw profile noise.
- Use `skyblock_profile_member` when detailed per-member profile data is needed for manual analysis.
- Use `skyblock_inventory`, `skyblock_inventory_section`, and `skyblock_item_dump` when item stacks, inventory API state, armor/equipment/wardrobe, backpacks, accessory bag, personal vault, or raw decoded item payloads are needed.
- Use `skyblock_profile`, `skyblock_museum`, and `skyblock_garden` for profile-state analysis.
- Use `skyblock_resource`, `skyblock_bazaar`, `skyblock_auctions`, `skyblock_auction`, `skyblock_firesales`, and `skyblock_news` for live game reference and economy context.
- Use `skycrypt_profile_url` when the user needs a human-readable profile viewer link.
- Use `hypixel_request` for official Hypixel v2 endpoints not covered by a dedicated tool.
- Use SkyAgent memories for stable user preferences, selected goals, profile notes, and prior analysis summaries. Do not store secrets in memories.

SkyAgent can decode inventory NBT into item-stack records, but it does not yet normalize SkyBlock item metadata or calculate SkyCrypt/SkyHelper-grade networth, weight, or missing accessories. Treat those as future calculator layers unless the relevant provider code exists.

## Secrets and Storage

Prefer `HYPIXEL_API_KEY` from the environment. The CLI and MCP server can also store an API key in the SkyAgent user config directory when the user explicitly asks. Do not print API key values back to the user.

Config and memories live outside the plugin repo by default, under `%APPDATA%\skyagent` on Windows or `~/.skyagent` elsewhere. `SKYAGENT_HOME` can override this for testing.

## Recommendation Style

Plans should be concrete and sequenced. Include the next session's actions first, then medium-term routing. Call out assumptions clearly when API or wiki access is unavailable.
