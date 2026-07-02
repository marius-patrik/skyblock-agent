---
name: skyagent-profile-api
description: Fetch, cache, and summarize Hypixel SkyBlock player/profile data with SkyAgent MCP tools. Use for username resolution, profile selection, online/status checks, agent context bootstrap, profile snapshots, profile overview, member payloads, museum, garden, bingo, or raw Hypixel endpoint lookup.
metadata:
  display_name: "SkyAgent Profile/API"
  short_description: "Resolve players and fetch profile data."
  default_prompt: "Use $skyagent-profile-api to fetch the selected SkyBlock profile overview."
---

# SkyAgent Profile/API

Use this skill when the task is primarily about finding the right player, profile, online status, active session state, or official Hypixel payload.

## Tool Routing

- Start with `skyagent_start` through `$skyagent-context-engine` for fresh session-scale profile work or when the user does not provide a player/profile; it should use configured identity/profile before asking for a username.
- Use `skyagent_config_get` only when setup metadata is needed without loading startup/context.
- Use CLI `skyagent setup status --json` to inspect local setup state, and `skyagent setup --json` for resumable first-run bootstrap when MCP config tools are not enough.
- Use `minecraft_resolve_username` for names that need UUIDs.
- Use `skyagent_server_status` when the user asks whether a player is online, active, in SkyBlock, or when Hypixel API availability and provider warnings matter. Use raw `hypixel_status` only when the official payload itself is requested.
- Use `skyblock_profiles` or `skyblock_profiles_summary` before profile-specific work.
- Use `skyagent_context_bootstrap` or `skyagent_context_get` before broad profile reasoning when `skyagent_start` has not already provided compact identity, economy, gear, pets, accessories, readiness, objective summary, provider freshness, warnings, and follow-up tool links.
- Use `skyagent_context_events`, `skyagent_context_watch`, and `skyagent_context_event_emit` to read or add context-stream events for progress, provider/cache changes, profile refreshes, or future live telemetry handoff.
- Route full session bootstrap and profile context caching to `$skyagent-context-engine`.
- Route live progress, server-status change history, context watch, and event emission to `$skyagent-live-progress`.
- Route durable goal, todo, buy-list, source-list, or snipe-target state to `$skyagent-objectives`.
- Interpret server-status `api.available: null` as unresolved local input/configuration, and `api.available: false` as a Hypixel/provider request failure.
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
- Use `skyagent_context_refresh` when the user says they just changed gear, pets, accessories, or progression and wants the current route recalculated.
