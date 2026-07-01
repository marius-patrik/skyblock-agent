---
name: skyagent-profile-api
description: Fetch and summarize Hypixel SkyBlock player/profile data with SkyAgent MCP tools. Use for username resolution, profile selection, online/status checks, profile overview, member payloads, museum, garden, bingo, or raw Hypixel endpoint lookup.
---

# SkyAgent Profile/API

Use this skill when the task is primarily about finding the right player, profile, online status, active session state, or official Hypixel payload.

## Tool Routing

- Start with `skyagent_config_get` when the user does not provide a player/profile.
- Use `minecraft_resolve_username` for names that need UUIDs.
- Use `hypixel_status` when the user asks whether a player is online or active.
- Use `skyblock_profiles` or `skyblock_profiles_summary` before profile-specific work.
- Use `skyblock_profile_overview` for compact profile context.
- Use `skyblock_profile_member` only when raw member fields are needed.
- Use `skyblock_profile`, `skyblock_museum`, `skyblock_garden`, and `skyblock_bingo_player` for dedicated official endpoints.
- Use `hypixel_request` only when no named tool covers the endpoint.

## Rules

- Prefer live Hypixel API data over assumptions.
- Preserve rate-limit metadata and selected profile details in summaries.
- Do not print or store API key values.
- Prefer `HYPIXEL_API_KEY`; use local config only when it is already explicitly set.
- If the API key is absent, report `api_disabled` and use only public/no-key tools.
- If a requested profile is missing, report `missing_profile`, list available profile IDs and cute names, then ask for a new selector.
- If a selected profile has no member for the resolved UUID, report `missing_member` and stop before deeper analysis.
- If rate-limit metadata is present, include remaining/reset details and avoid repeated broad fetches.
