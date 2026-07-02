# SkyAgent Behavioral Playbook

This playbook records the transcript-derived defaults from sessions where SkyAgent needed too much steering for setup, context loading, Museum goals, damage/Slayer advice, hidden gear, and provider freshness.

The executable source of truth is `packages/core/src/behavior-playbook.ts`. Skills and docs should match that routing model.

## Default Startup

Fresh SkyAgent sessions and `skyagent start` should gather compact state before asking the user for missing context:

1. `skyagent_start`
2. `skyagent_objective_list`
3. `skyagent_server_status`
4. `skyagent_context_events` when recent progress or provider changes may affect the answer

The startup payload should be treated as the first context capsule. It carries configured player/profile, setup gaps, profile freshness, provider status, objectives, server/API status, recent events, and follow-up tool hints.

## Compact Before Raw

Use compact summaries by default:

- `skyagent_start`
- `skyagent_context_bootstrap`
- `skyblock_profiles_summary`
- `skyblock_profile_overview`
- `skyblock_progression`
- `skyblock_readiness`
- bounded `skyblock_networth`, `skyblock_accessories`, and planner outputs

Raw payloads are opt-in/debug-only unless no summary exists. If no summary/parser exists, use the narrowest official endpoint or item dump, extract only goal-relevant fields, and keep the raw payload out of the final answer.

## Fallback Rules

Agents should attempt the best supported fallback before saying SkyAgent cannot do a task.

| Condition | First fallback behavior |
| --- | --- |
| MCP unavailable | Use non-interactive CLI JSON commands such as `skyagent start --json`, then the narrow matching CLI command. |
| Stale cache | Refresh for current-state, purchase, profile, or meta-sensitive decisions; otherwise carry stale warnings. |
| Missing parser or compact summary | Use `skyblock_profile_section`, `skyblock_museum`, `skyblock_profile_member`, or `hypixel_request` for bounded extraction. |
| Huge raw payload | Switch to summary, section, normalized item, or bounded extraction. Do not paste raw payloads. |
| Missing API key | Use cache-only context and public resources where possible, then show setup guidance without secrets. |
| Server maintenance/provider outage | Use stale/cache fallback only with explicit degraded-freshness warnings. |
| Partial provider data | Continue with confidence/warnings and do not invent missing prices, values, or formulas. |

## Goal Routing

Museum goals must not fall back to generic progression first. Route them through Museum state, hidden item/storage checks, and prices:

1. Bootstrap context and objectives.
2. Use `skyblock_museum_donation_plan` for already-donated, eligible-owned, hidden-owned, missing, buy, source, and snipe candidates.
3. Use `skyblock_profile_section` with `museum` for compact value/progress evidence.
4. Fall back to `skyblock_museum`, `hypixel_request` for `skyblock/museum`, or bounded member extraction only for planner-missing fields.
5. Inspect inventory, ender chest, backpacks, personal vault, wardrobe, pets, accessory bag, and normalized item records only as follow-up evidence when the planner reports uncertain candidates.

Damage and Slayer goals must inspect complete readiness before purchases:

1. Bootstrap context and objectives.
2. Use `skyblock_readiness` for `slayer`.
3. Inspect armor, equipment, inventory, wardrobe, storage, Museum signals, pets, accessories, Magical Power, and item modifiers.
4. Check budget and price evidence with `skyblock_next_upgrades`, `skyblock_price`, or `skyblock_lowest_bin`.
5. Route meta-sensitive claims through provider freshness and current-source checks before recommending buys.

Money routes should combine available capital, unlocks/readiness, provider freshness, and user constraints before recommending a route.

Accessories, pets, wardrobe, and objective-building requests should route directly to their subskills without requiring the user to name those subskills.

## Objectives

Preview plans should not mutate durable state. When the user accepts a route, persist:

- top-level goals as `objective` records
- steps as `task` records
- purchase candidates as `buy` records with item ID, target price, budget, provider, freshness, and warnings
- acquisition routes as `source` records
- auction watch rules as `snipe` records

Before revising an in-progress objective, read recent context events so captured progress is not lost.
