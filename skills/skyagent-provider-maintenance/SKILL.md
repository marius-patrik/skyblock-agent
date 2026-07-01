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
- Check official Hypixel patch notes, official wiki pages, and live Hypixel API resources before community guides for patch-sensitive claims.
- Check NEU, SkyHelper, CoflNet, SkyCrypt, and Discord-bot parity assumptions as secondary references, not authoritative truth.
- Route concrete goal plans back to `$skyagent-planning` after verification.

## Rules

- Treat community metas, prices, routes, boss requirements, and rules as time-sensitive.
- Verify live web/wiki/provider data when metas, prices, formulas, API fields, or game rules may have changed.
- Do not upgrade an estimate to exact without a maintained formula/provider.
- Preserve source freshness, uncertainty, provider fallback, and stale-cache warnings in the answer.
- Update `docs/parity.md` when provider gaps or parity assumptions change.
