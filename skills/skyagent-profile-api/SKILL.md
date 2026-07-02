---
name: skyagent-profile-api
description: Fetch, cache, and summarize Hypixel SkyBlock player/profile data with SkyAgent MCP tools. Use for username resolution, profile selection, online/status checks, profile snapshots, profile overview, member payloads, museum, garden, bingo, or raw Hypixel endpoint lookup.
metadata:
  display_name: "SkyAgent Profile/API"
  short_description: "Resolve players and fetch profile data."
  default_prompt: "Use $skyagent-profile-api to fetch the selected SkyBlock profile overview."
---

# SkyAgent Profile/API

Use this skill when the task is primarily about finding the right player, profile, online status, active session state, or official Hypixel payload.

## Tool Routing

- Start with `skyagent_config_get` when the user does not provide a player/profile.
- Use CLI `skyagent setup status --json` to inspect local setup state, and `skyagent setup --json` for resumable first-run bootstrap when MCP config tools are not enough.
- Use `minecraft_resolve_username` for names that need UUIDs.
- Use `hypixel_status` when the user asks whether a player is online or active.
- Use `skyblock_profiles` or `skyblock_profiles_summary` before profile-specific work.
- Use `skyblock_profile_snapshot` for normalized profile context, profile-scoped cache reuse, session bootstrap, and deterministic cached-versus-refreshed reads. Use `refresh: true` for current Hypixel state, `cacheOnly: true` for no-refresh reads, and `allowStale: true` only when stale context is acceptable.
- Use `skyblock_profile_overview` for compact profile context.
- Use `skyblock_profile_member` only when raw member fields are needed.
- Use `skyblock_profile`, `skyblock_museum`, `skyblock_garden`, and `skyblock_bingo_player` for dedicated official endpoints.
- Use `hypixel_request` only when no named tool covers the endpoint.

## Rules

- Prefer live Hypixel API data over assumptions.
- Preserve rate-limit metadata and selected profile details in summaries.
- Do not print or store API key values.
- Prefer `HYPIXEL_API_KEY`; use local config only when it is already explicitly set.
- Prefer `skyagent setup` over direct config writes for first-run username, UUID, API key, and profile selection because it validates the player/profile flow and redacts secrets.
- If the API key is absent, report `api_disabled` and use only public/no-key tools.
- If a requested profile is missing, report `missing_profile`, list available profile IDs and cute names, then ask for a new selector.
- If a selected profile has no member for the resolved UUID, report `missing_member` and stop before deeper analysis.
- If rate-limit metadata is present, include remaining/reset details and avoid repeated broad fetches.
- Prefer cached snapshots over repeated broad profile fetches when answering follow-up questions in the same session, but surface `fetchedAt`, `stale`, `cacheStatus`, and warnings whenever freshness affects the answer.
