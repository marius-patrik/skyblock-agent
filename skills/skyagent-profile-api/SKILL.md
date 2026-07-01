---
name: skyagent-profile-api
description: Fetch and summarize Hypixel SkyBlock player/profile data with SkyAgent MCP tools. Use for username resolution, profile selection, profile overview, member payloads, museum, garden, bingo, or raw Hypixel endpoint lookup.
---

# SkyAgent Profile/API

Use this skill when the task is primarily about finding the right player, profile, or official Hypixel payload.

## Tool Routing

- Start with `skyagent_config_get` when the user does not provide a player/profile.
- Use `minecraft_resolve_username` for names that need UUIDs.
- Use `skyblock_profiles` or `skyblock_profiles_summary` before profile-specific work.
- Use `skyblock_profile_overview` for compact profile context.
- Use `skyblock_profile_member` only when raw member fields are needed.
- Use `skyblock_profile`, `skyblock_museum`, `skyblock_garden`, and `skyblock_bingo_player` for dedicated official endpoints.
- Use `hypixel_request` only when no named tool covers the endpoint.

## Rules

- Prefer live Hypixel API data over assumptions.
- Preserve rate-limit metadata and selected profile details in summaries.
- Do not print or store API key values.
