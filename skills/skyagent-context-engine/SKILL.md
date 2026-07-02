---
name: skyagent-context-engine
description: Bootstrap and refresh SkyAgent session context for Hypixel SkyBlock analysis. Use for session start, context capsules, profile context caching, stale-cache decisions, follow-up tool selection, provider freshness, objective summaries, and broad planning context before deeper tools.
metadata:
  display_name: "SkyAgent Context"
  short_description: "Bootstrap cached agent context."
  default_prompt: "Use $skyagent-context-engine to load my current SkyBlock context capsule."
---

# SkyAgent Context Engine

Use this skill when Codex needs the compact profile context before analysis, planning, or follow-up recommendations.

## Tool Routing

- Use `skyagent_start` when the user or host session needs an explicit SkyAgent startup hook. It should return setup status, selected player/profile, profile context freshness policy, compact context, server/API status, objective summary, recent event cursor, provider readiness, warnings, and follow-up tools while persisting an `agent.session_start` event.
- Use `skyagent_config_get` first when only player, UUID, selected profile, or API key setup metadata is needed before choosing a heavier context tool.
- Use `skyagent_context_bootstrap` at session start only when `skyagent_start` is unavailable or a plain cached context capsule is enough. It should return compact identity, selected profile, profile snapshot, economy/networth summary, gear, pets, accessories, readiness, objective summary, provider freshness, warnings, and follow-up tools.
- Use `skyagent_context_get` for cached context when the user asks a follow-up and current profile state is not required.
- Use `skyagent_context_refresh` when the user says they changed gear, pets, accessories, profile progress, objectives, or wants the current route recalculated.
- Use `skyblock_profile_snapshot` only when a narrow profile-cache read is enough or when the context tool points to it as the next detail tool.
- Use `skyagent_objective_list` during bootstrap when durable objectives, todos, buy lists, source lists, or snipe targets may affect advice.
- Use `skyagent_server_status` when the context should include online state, Hypixel API availability, session mode, map, or server-status warnings.
- Route ongoing progress streams to `$skyagent-live-progress` and durable goal changes to `$skyagent-objectives`.

## Rules

- Prefer the context capsule over repeated raw profile pulls for broad answers.
- Preserve `fetchedAt`, cache status, stale status, provider freshness, warnings, and follow-up tool hints.
- Treat stale context as advisory unless the user explicitly accepts stale data or the answer is not freshness-sensitive.
- Refresh context before revising a plan after the user reports new gear, purchases, skill progress, profile changes, or market-sensitive decisions.
- Do not store API keys or secrets in context, memories, objectives, or summaries.
- Keep context output compact. Pull raw member payloads, item dumps, or full item arrays only when a narrow tool is needed.
