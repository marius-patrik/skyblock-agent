---
name: skyagent-provider-maintenance
description: Verify SkyBlock provider freshness, parity assumptions, and meta-sensitive claims for SkyAgent. Use for patch notes, wiki pages, official-source checks, NEU/SkyHelper/CoflNet assumptions, provider outage analysis, stale formula warnings, parity drift, and maintaining metadata assumptions.
metadata:
  display_name: "SkyAgent Providers"
  short_description: "Verify providers and meta freshness."
  default_prompt: "Use $skyagent-provider-maintenance to verify whether this SkyBlock recommendation is current."
---

# SkyAgent Provider Maintenance

Use this skill when currentness, provider quality, stale formulas, parity drift, or meta verification matters before a recommendation.

## Tool Routing

- Use `skyblock_resource` for public Hypixel resources such as items, skills, collections, election, and bingo.
- Use `skyblock_news` for SkyBlock news when an API key is available.
- Use economy tools to inspect provider freshness and stale-cache warnings.
- Use `skyagent_llm_provider_status` when the question is about SkyAgent's LiteLLM/OpenAI-compatible model gateway, persistent-agent readiness, provider health, auth presence, rate limits, or budget metadata.
- Use `skyagent_llm_provider_config_get` and `skyagent_llm_provider_config_set` only for local LLM gateway setup; never route product agent integration through `codex`, `codex exec`, or Codex CLI session/config state.
- Use `skyagent_server_status` for Hypixel API availability, online/session state, warning codes, and `hypixel.server_status_change` context events.
- Use `skyagent_context_events` or `skyagent_context_watch` for `provider.cache_status`, `provider.cache_status_change`, `hypixel.server_status_change`, and recent refresh history.
- Use `$skyagent-context-engine` when provider status should be carried into broad profile or planning context.
- Use `$skyagent-live-progress` when the task is mainly about event-stream or status-change monitoring.
- Check official Hypixel patch notes, official wiki pages, and live Hypixel API resources before community guides for patch-sensitive claims.
- Check NEU, SkyHelper, CoflNet, SkyCrypt, and Discord-bot parity assumptions as secondary references, not authoritative truth.
- Route concrete goal plans back to `$skyagent-planning` after verification.

## Rules

- Treat community metas, prices, routes, boss requirements, and rules as time-sensitive.
- Verify live web/wiki/provider data when metas, prices, formulas, API fields, or game rules may have changed.
- Do not upgrade an estimate to exact without a maintained formula/provider.
- Preserve source freshness, uncertainty, provider fallback, and stale-cache warnings in the answer.
- Keep LLM provider keys, virtual keys, endpoint auth material, and budgets redacted unless the user is explicitly entering a secret into local config.
- Update `docs/parity.md` when provider gaps or parity assumptions change.
