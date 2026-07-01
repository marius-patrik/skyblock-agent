---
name: skyagent-provider-maintenance
description: Verify SkyBlock provider freshness, parity assumptions, and meta-sensitive claims for SkyAgent. Use for patch-sensitive recommendations, wiki or official-source checks, provider outage analysis, stale formula warnings, parity comparison, and maintaining metadata assumptions.
---

# SkyAgent Provider Maintenance

Use this skill when currentness, provider quality, or meta verification matters.

## Tool Routing

- Use `skyblock_resource` for public Hypixel resources such as items, skills, collections, election, and bingo.
- Use `skyblock_news` for SkyBlock news when an API key is available.
- Use economy tools to inspect provider freshness and stale-cache warnings.
- Use official sources before community guides for patch-sensitive claims.

## Rules

- Treat community metas as time-sensitive.
- Do not upgrade an estimate to exact without a maintained formula/provider.
- Update `docs/parity.md` when provider gaps or parity assumptions change.
